import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Image,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  ImportOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { createDebouncedFunction } from '../services/debounce'
import {
  createWorkspaceRow,
  deleteImage,
  deleteWorkspaceRow,
  generateImageDraft,
  getImageDownloadUrl,
  listWorkspaceRows,
  updateWorkspaceRow,
  uploadGeneratedImage,
} from '../services/api'
import EditableCell from '../components/EditableCell'
import StatusTag from '../components/StatusTag'
import { copyImageLink, getDownloadShareUrl, normalizeImageUrl } from '../utils/imageLinks'
import './BatchGenerateTablePage.css'

const { Text } = Typography
const DEFAULT_BATCH_ROWS = 10
const MAX_GENERATE_CONCURRENCY = 2
const WORKSPACE_SAVE_DEBOUNCE_MS = 800
const AUTO_GENERATE_DELAY_SECONDS = 5
const TABLE_SCROLL_X = 920
const ORIGINAL_PROMPT_HEADERS = ['prompt', '原始描述', 'originalPrompt']
// 前端表格任务状态。状态值沿用原生成页逻辑，避免改变现有交互语义。
const STATUS = {
  IDLE: 'idle',
  EDITING: 'editing',
  WAITING: 'waiting',
  GENERATING: 'generating',
  GENERATED: 'generated',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  DONE: 'done',
  FAILED: 'failed',
}

/**
 * 创建一条前端表格记录
 * 数据流说明：表格行是前端工作台的内部结构，不要求后端新增字段；生成或搜索结果会被适配成该结构。
 */
const createEmptyRow = (overrides = {}) => ({
  id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  workspaceRowId: null,
  rowKey: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  originalPrompt: '',
  description: '',
  expandedPromptTouched: false,
  expandingPrompt: false,
  expandError: '',
  keywords: [],
  count: 1,
  status: STATUS.IDLE,
  resultImages: [],
  uploaded: false,
  uploading: false,
  cosKey: '',
  dbId: null,
  thumbnailUrl: '',
  tempThumbnailUrl: '',
  previewUrl: '',
  downloadUrl: '',
  tempImageBase64: '',
  tempPreviewUrl: '',
  generationPromptSnapshot: '',
  generatedAt: '',
  errorMessage: '',
  createdAt: '',
  lastEditedAt: 0,
  countdown: null,
  isEditing: false,
  dirty: false,
  ...overrides,
})

const parseCsvText = (csvText) => {
  const text = String(csvText || '').replace(/^\uFEFF/, '')
  const rows = []
  let current = ''
  let row = []
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(current)
      rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  row.push(current)
  rows.push(row)

  return rows
    .map((items) => items.map((item) => item.trim()))
    .filter((items) => items.some(Boolean))
}

const findHeaderIndex = (headers, aliases) => {
  const normalizedHeaders = headers.map((header) => header.trim())
  return normalizedHeaders.findIndex((header) => aliases.includes(header))
}

const countReplacementChars = (text) => (text.match(/\uFFFD/g) || []).length

const decodeCsvBuffer = (buffer) => {
  const decoders = [
    { label: 'utf-8', decoder: new TextDecoder('utf-8') },
    { label: 'gb18030', decoder: new TextDecoder('gb18030') },
    { label: 'gbk', decoder: new TextDecoder('gbk') },
  ]
  const decoded = decoders.map(({ label, decoder }) => {
    const text = decoder.decode(buffer).replace(/^\uFEFF/, '')
    return { label, text, badChars: countReplacementChars(text) }
  })
  decoded.sort((a, b) => a.badChars - b.badChars)
  return decoded[0].text
}

const normalizeImportedRows = (csvRows) => {
  if (!csvRows.length) return { rows: [], skipped: 0 }

  const [firstRow, ...restRows] = csvRows
  const firstCell = String(firstRow?.[0] || '').trim()
  const hasHeader = ORIGINAL_PROMPT_HEADERS.some((header) => firstCell.toLowerCase() === header.toLowerCase())
  const dataRows = hasHeader ? restRows : csvRows

  const importedRows = []
  let skipped = 0

  dataRows.forEach((items) => {
    const originalPrompt = (items[0] || '').trim()
    if (!originalPrompt) {
      skipped += 1
      return
    }

    const now = Date.now()

    importedRows.push(createEmptyRow({
      originalPrompt,
      count: 1,
      status: STATUS.EDITING,
      countdown: AUTO_GENERATE_DELAY_SECONDS,
      isEditing: true,
      dirty: true,
      lastEditedAt: now,
    }))
  })

  return { rows: importedRows, skipped }
}

/**
 * 把后端图片对象统一转成表格缩略图所需结构。
 * 兼容字段：后端当前返回 preview_url；如果以后返回 file_path、download_url，也只在这里适配，不改真实接口。
 */
const normalizeImageResponse = (image) => {
  const previewPath = image.previewUrl || image.preview_url || image.file_path || image.url || ''
  const isInlinePreview = previewPath.startsWith('data:') || previewPath.startsWith('blob:')
  const previewUrl = normalizeImageUrl(previewPath)
  const thumbnailPath = image.thumbnailUrl || image.thumbnail_url || ''
  const thumbnailUrl = thumbnailPath
    ? normalizeImageUrl(thumbnailPath)
    : ''
  const isTemporary = Boolean(image.temporary || isInlinePreview)
  const rawDownloadUrl = image.downloadUrl || image.download_url || (isTemporary ? '' : getImageDownloadUrl(image.id))
  const downloadUrl = rawDownloadUrl ? normalizeImageUrl(rawDownloadUrl) : ''

  return {
    id: image.id,
    url: previewUrl,
    previewUrl,
    thumbnailUrl,
    downloadUrl,
    imageBase64: image.imageBase64 || image.image_base64 || '',
    originalPrompt: image.originalPrompt || image.original_prompt || image.prompt || '',
    expandedPrompt: image.expandedPrompt || image.expanded_prompt || image.description || '',
    description: image.description || image.expandedPrompt || image.expanded_prompt || '',
    prompt: image.prompt || image.originalPrompt || image.original_prompt || '',
    uploaded: Boolean(image.uploaded || image.cosKey || image.remote_path),
    cosKey: image.cosKey || image.remote_path || '',
    dbId: image.dbId || image.id || null,
    fileName: image.fileName || image.file_name || '',
    createdAt: image.created_at || image.createdAt || '',
    raw: image,
  }
}

const metadataFromImage = (image) => {
  const fileName = image.fileName || image.file_name || ''
  const fileStem = fileName.replace(/\.[^.]+$/, '')
  const originalPrompt = image.originalPrompt || image.original_prompt || image.prompt || image.title || fileStem || ''
  return {
    originalPrompt,
    expandedPrompt: image.expandedPrompt || image.expanded_prompt || image.description || '',
  }
}

const isNonEmptyWorkspaceRow = (row) =>
  Boolean(String(row?.originalPrompt || '').trim() || row?.resultImages?.length || row?.uploaded || row?.cosKey)

const displayImageUrlForRow = (row, image) =>
  image?.thumbnailUrl ||
  row?.thumbnailUrl ||
  row?.tempThumbnailUrl ||
  image?.previewUrl ||
  row?.previewUrl ||
  row?.tempPreviewUrl ||
  ''

const timestampOfWorkspaceItem = (item) => {
  const value = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at || ''
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const restoreWorkspaceRows = (items = []) => {
  const restoredRows = items
    .filter((item) => String(item?.originalPrompt || '').trim())
    .sort((a, b) => timestampOfWorkspaceItem(b) - timestampOfWorkspaceItem(a))
    .map(mapWorkspaceRowToRow)

  return [createEmptyRow(), ...restoredRows]
}

/**
 * 把图片库搜索结果映射成表格行。
 * 注意：搜索接口返回的是图片记录，不是批量任务记录；这里用每张图片构造一行只读结果行。
 */
const serializeWorkspaceRow = (row) => ({
  rowKey: row.rowKey || row.id,
  originalPrompt: row.originalPrompt || '',
  expandedPrompt: '',
  expandedPromptTouched: false,
  keywords: '',
  count: row.count || 1,
  status: row.status || STATUS.IDLE,
  uploaded: Boolean(row.uploaded),
  cosKey: row.cosKey || '',
  previewUrl: row.uploaded || row.cosKey ? row.previewUrl || '' : '',
  thumbnailUrl: row.uploaded || row.cosKey ? row.thumbnailUrl || row.resultImages?.[0]?.thumbnailUrl || '' : '',
  downloadUrl: row.uploaded || row.cosKey ? row.downloadUrl || '' : '',
  dbId: row.dbId || null,
  errorMessage: row.errorMessage || '',
  generationPromptSnapshot: row.generationPromptSnapshot || '',
  generatedAt: row.generatedAt || '',
  createdAt: row.createdAt || '',
})

const mapWorkspaceRowToRow = (item) => {
  const previewUrl = item.previewUrl || ''
  const thumbnailUrl = item.thumbnailUrl || item.thumbnail_url || ''
  const downloadUrl = item.downloadUrl || ''
  const uploaded = Boolean(item.uploaded || item.cosKey)
  return createEmptyRow({
    id: item.rowKey || `workspace-${item.id}`,
    workspaceRowId: item.id,
    rowKey: item.rowKey || `workspace-${item.id}`,
    originalPrompt: item.originalPrompt || '',
    description: '',
    expandedPromptTouched: false,
    keywords: [],
    count: item.count || 1,
    status: [STATUS.GENERATING, STATUS.UPLOADING, STATUS.WAITING, STATUS.EDITING].includes(item.status)
      ? STATUS.IDLE
      : item.status || STATUS.IDLE,
    countdown: null,
    isEditing: false,
    uploaded,
    uploading: false,
    cosKey: item.cosKey || '',
    dbId: item.dbId || null,
    thumbnailUrl,
    tempThumbnailUrl: '',
    previewUrl,
    downloadUrl,
    tempImageBase64: '',
    tempPreviewUrl: '',
    resultImages: previewUrl
      ? [normalizeImageResponse({
          id: item.dbId || item.id,
          previewUrl,
          thumbnailUrl,
          downloadUrl,
          originalPrompt: item.originalPrompt,
          description: '',
          uploaded,
          cosKey: item.cosKey,
        })]
      : [],
    generationPromptSnapshot: item.generationPromptSnapshot || '',
    generatedAt: item.generatedAt || '',
    errorMessage: item.errorMessage || '',
    createdAt: item.createdAt || item.updatedAt || '',
    dirty: false,
  })
}


/**
 * 多维表格式图片生成工作台
 * 职责：
 * 1. 用表格承载多行生成任务，每行独立编辑、独立防抖、独立状态。
 * 2. 复用现有 generateImages/getImageDownloadUrl，不新增或改变后端接口。
 * 3. 把后端图片返回适配为 resultImages，供表格缩略图和详情抽屉使用。
 */
function BatchGenerateTablePage({ active = true }) {
  const [rows, setRows] = useState([])
  const [restoringWorkspace, setRestoringWorkspace] = useState(true)
  const [importingCsv, setImportingCsv] = useState(false)
  const [workMode, setWorkMode] = useState('single')
  const [viewMode, setViewMode] = useState('表格视图')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewKey, setPreviewKey] = useState(0)

  const autoGenerateTimerMapRef = useRef(new Map())
  const countdownIntervalMapRef = useRef(new Map())
  const generateQueueRef = useRef([])
  const activeGenerateCountRef = useRef(0)
  const queuedRowIdsRef = useRef(new Set())
  const generateAbortMapRef = useRef(new Map())
  const metadataSaveDebounceMapRef = useRef(new Map())
  const workspaceSaveDebounceMapRef = useRef(new Map())
  const workspaceCreatingMapRef = useRef(new Map())
  const restoringWorkspaceRef = useRef(true)
  const hasRestoredWorkspaceRef = useRef(false)
  const rowsRef = useRef(rows)
  const csvInputRef = useRef(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const loadWorkspaceRows = () => {
    let mounted = true
    restoringWorkspaceRef.current = true
    setRestoringWorkspace(true)
    listWorkspaceRows()
      .then((response) => {
        if (!mounted) return
        setRows(restoreWorkspaceRows(response.rows || []))
        setWorkMode('batch')
        setViewMode('表格视图')
      })
      .catch((error) => {
        if (!mounted) return
        console.error('Load workspace rows failed:', error)
        setRows([createEmptyRow()])
      })
      .finally(() => {
        if (mounted) {
          restoringWorkspaceRef.current = false
          setRestoringWorkspace(false)
        }
      })
    return () => {
      mounted = false
    }
  }

  useEffect(() => {
    if (!active || !hasRestoredWorkspaceRef.current) return undefined
    return loadWorkspaceRows()
  }, [active])

  useEffect(() => {
    if (!active || hasRestoredWorkspaceRef.current) return undefined
    hasRestoredWorkspaceRef.current = true
    return loadWorkspaceRows()
  }, [active])

  useEffect(() => {
    return () => {
      autoGenerateTimerMapRef.current.forEach((timerId) => window.clearTimeout(timerId))
      autoGenerateTimerMapRef.current.clear()
      countdownIntervalMapRef.current.forEach((intervalId) => window.clearInterval(intervalId))
      countdownIntervalMapRef.current.clear()
      metadataSaveDebounceMapRef.current.forEach((debouncedSave) => debouncedSave.cancel?.())
      workspaceSaveDebounceMapRef.current.forEach((debouncedSave) => debouncedSave.flush?.())
      generateAbortMapRef.current.forEach((controller) => controller.abort())
      generateQueueRef.current = []
      queuedRowIdsRef.current.clear()
    }
  }, [])

  const updateRow = (rowId, updater) => {
    setRows((prevRows) =>
      prevRows.map((row) => {
        if (row.id !== rowId) return row
        const patch = typeof updater === 'function' ? updater(row) : updater
        return { ...row, ...patch }
      })
    )
  }

  const getRowById = (rowId) => rowsRef.current.find((row) => row.id === rowId)

  const persistWorkspaceRow = async (rowId) => {
    const row = getRowById(rowId)
    if (!row || restoringWorkspaceRef.current) return
    if (!isNonEmptyWorkspaceRow(row)) {
      if (row.workspaceRowId) {
        await deleteWorkspaceRow(row.workspaceRowId)
        if (getRowById(rowId)) {
          updateRow(rowId, { workspaceRowId: null, rowKey: row.rowKey || row.id })
        }
      }
      return
    }
    const payload = serializeWorkspaceRow(row)
    if (row.workspaceRowId) {
      const response = await updateWorkspaceRow(row.workspaceRowId, payload)
      const savedRow = response.row
      if (savedRow && getRowById(rowId)) {
        updateRow(rowId, {
          workspaceRowId: savedRow.id,
          rowKey: savedRow.rowKey || row.rowKey,
        })
      }
      return
    }
    if (workspaceCreatingMapRef.current.has(rowId)) return
    const createPromise = createWorkspaceRow(payload)
      .then((response) => {
        const savedRow = response.row
        if (savedRow && getRowById(rowId)) {
          updateRow(rowId, {
            workspaceRowId: savedRow.id,
            rowKey: savedRow.rowKey || row.rowKey,
          })
        }
      })
      .finally(() => {
        workspaceCreatingMapRef.current.delete(rowId)
        window.setTimeout(() => scheduleWorkspaceSave(rowId), 0)
      })
    workspaceCreatingMapRef.current.set(rowId, createPromise)
    await createPromise
  }

  const scheduleWorkspaceSave = (rowId) => {
    if (restoringWorkspaceRef.current) return
    const row = getRowById(rowId)
    if (!row || (!isNonEmptyWorkspaceRow(row) && !row.workspaceRowId)) return
    if (!workspaceSaveDebounceMapRef.current.has(rowId)) {
      workspaceSaveDebounceMapRef.current.set(
        rowId,
        createDebouncedFunction(() => {
          persistWorkspaceRow(rowId).catch((error) => {
            console.error('Save workspace row failed:', error)
          })
        }, WORKSPACE_SAVE_DEBOUNCE_MS)
      )
    }
    workspaceSaveDebounceMapRef.current.get(rowId)()
  }

  const updateRowAndSave = (rowId, updater) => {
    updateRow(rowId, updater)
    window.setTimeout(() => scheduleWorkspaceSave(rowId), 0)
  }

  const clearRowAutoGenerateTimers = (rowId) => {
    const timerId = autoGenerateTimerMapRef.current.get(rowId)
    if (timerId) window.clearTimeout(timerId)
    autoGenerateTimerMapRef.current.delete(rowId)

    const intervalId = countdownIntervalMapRef.current.get(rowId)
    if (intervalId) window.clearInterval(intervalId)
    countdownIntervalMapRef.current.delete(rowId)
  }

  const saveUploadedMetadata = async (rowId) => {
    const row = getRowById(rowId)
    if (!row?.dbId || !row.uploaded) return
    try {
      const response = await updateImageMetadata(row.dbId, {
        originalPrompt: row.originalPrompt,
        expandedPrompt: row.originalPrompt,
        keywords: '',
      })
      const image = response.image
      if (!image || !getRowById(rowId)) return
      const uploadedImage = normalizeImageResponse(image)
      updateRowAndSave(rowId, {
        resultImages: [uploadedImage],
        cosKey: uploadedImage.cosKey,
        thumbnailUrl: uploadedImage.thumbnailUrl,
        previewUrl: uploadedImage.previewUrl,
        downloadUrl: uploadedImage.downloadUrl,
      })
    } catch (error) {
      updateRowAndSave(rowId, {
        errorMessage: error?.response?.data?.detail || error.message || '保存详情失败',
      })
    }
  }

  const scheduleMetadataSave = (rowId) => {
    const row = getRowById(rowId)
    if (!row?.dbId || !row.uploaded) return
    if (!metadataSaveDebounceMapRef.current.has(rowId)) {
      metadataSaveDebounceMapRef.current.set(
        rowId,
        createDebouncedFunction(() => saveUploadedMetadata(rowId), 800)
      )
    }
    metadataSaveDebounceMapRef.current.get(rowId)()
  }

  const deleteUploadedImageForRetry = async (row) => {
    if (!row?.dbId || !row.uploaded) return
    const image = row.resultImages?.[0]
    try {
      await deleteImage(row.dbId, {
        cosKey: row.cosKey || image?.cosKey || '',
        fileName: image?.fileName || '',
      })
    } catch (error) {
      const status = error?.response?.status
      const detail = error?.response?.data?.detail || error?.response?.data?.message || error?.message || ''
      if (status !== 404 && !String(detail).toLowerCase().includes('not found')) {
        console.warn('Delete previous uploaded image failed, retry will continue:', error)
      }
    }
    updateRowAndSave(row.id, {
      uploaded: false,
      uploading: false,
      cosKey: '',
      dbId: null,
      thumbnailUrl: '',
      tempThumbnailUrl: '',
      previewUrl: '',
      downloadUrl: '',
      resultImages: [],
    })
  }

  const resetGeneratedState = () => ({
    status: STATUS.EDITING,
    uploaded: false,
    uploading: false,
    cosKey: '',
    dbId: null,
    previewUrl: '',
    thumbnailUrl: '',
    tempThumbnailUrl: '',
    downloadUrl: '',
    tempImageBase64: '',
    tempPreviewUrl: '',
    generationPromptSnapshot: '',
    generatedAt: '',
    resultImages: [],
    errorMessage: '',
    dirty: true,
    lastEditedAt: Date.now(),
    countdown: AUTO_GENERATE_DELAY_SECONDS,
    isEditing: true,
  })

  const markPromptEditingState = (hasPrompt, row = null) => ({
    status: row?.uploaded ? STATUS.UPLOADED : (hasPrompt ? STATUS.EDITING : STATUS.IDLE),
    countdown: hasPrompt && !row?.uploaded ? AUTO_GENERATE_DELAY_SECONDS : null,
    isEditing: hasPrompt && !row?.uploaded,
    errorMessage: '',
    dirty: true,
    lastEditedAt: Date.now(),
  })

  const ensureBatchRows = (minRows = DEFAULT_BATCH_ROWS) => {
    const newRows = []
    setRows((prevRows) => {
      if (prevRows.length >= minRows) return prevRows
      newRows.push(...Array.from({ length: minRows - prevRows.length }, () => createEmptyRow()))
      return [...prevRows, ...newRows]
    })
  }

  const activateBatchMode = () => {
    setWorkMode('batch')
    setViewMode('表格视图')
    ensureBatchRows()
  }

  /**
   * 单行生成逻辑
   * 数据流：读取表格行 -> 调用现有 generateImages(prompt, keywords, count) -> 归一化 response.images -> 写回该行。
   */
  const runGenerateRow = async (rowId, options = {}) => {
    const row = getRowById(rowId)
    if (!row) return

    const prompt = row.originalPrompt.trim()
    if (!prompt) {
      if (!options.silent) message.warning('请输入原始描述后再生成')
      clearRowAutoGenerateTimers(rowId)
      updateRowAndSave(rowId, { status: STATUS.IDLE, countdown: null, isEditing: false })
      return
    }

    clearRowAutoGenerateTimers(rowId)
    generateAbortMapRef.current.get(rowId)?.abort()
    const abortController = new AbortController()
    generateAbortMapRef.current.set(rowId, abortController)

    try {
      await deleteUploadedImageForRetry(row)
      updateRowAndSave(rowId, {
        status: STATUS.GENERATING,
        countdown: null,
        isEditing: false,
        errorMessage: '',
        uploaded: false,
        uploading: false,
        cosKey: '',
        dbId: null,
        thumbnailUrl: '',
        tempThumbnailUrl: '',
        previewUrl: '',
        downloadUrl: '',
        tempImageBase64: '',
        tempPreviewUrl: '',
        resultImages: [],
      })
      const promptForGeneration = prompt
      const generatedAt = new Date().toISOString()
      const response = await generateImageDraft(
        promptForGeneration,
        '',
        row.count,
        prompt,
        { signal: abortController.signal, originalPrompt: prompt }
      )
      if (abortController.signal.aborted || !getRowById(rowId)) return
      const resultImages = (response.images || []).map(normalizeImageResponse)
      const firstImage = resultImages[0]

      updateRowAndSave(rowId, {
        status: STATUS.GENERATED,
        countdown: null,
        isEditing: false,
        resultImages,
        uploaded: false,
        uploading: false,
        cosKey: '',
        dbId: null,
        thumbnailUrl: '',
        tempThumbnailUrl: firstImage?.thumbnailUrl || '',
        previewUrl: firstImage?.previewUrl || '',
        downloadUrl: '',
        tempPreviewUrl: firstImage?.previewUrl || '',
        tempImageBase64: firstImage?.imageBase64 || '',
        generationPromptSnapshot: promptForGeneration,
        generatedAt,
        createdAt: resultImages[0]?.createdAt || generatedAt,
        errorMessage: '',
        dirty: false,
      })
      if (firstImage) {
        await uploadGeneratedImageForRow(rowId, firstImage)
      }
      if (!options.silent) message.success('生成并上传成功')
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || abortController.signal.aborted) {
        return
      }
      updateRowAndSave(rowId, {
        status: STATUS.FAILED,
        countdown: null,
        isEditing: false,
        errorMessage: error?.response?.data?.detail || error.message || '生成失败',
      })
      if (!options.silent) message.error('生成失败')
    } finally {
      if (generateAbortMapRef.current.get(rowId) === abortController) {
        generateAbortMapRef.current.delete(rowId)
      }
    }
  }

  const drainGenerateQueue = () => {
    while (activeGenerateCountRef.current < MAX_GENERATE_CONCURRENCY && generateQueueRef.current.length > 0) {
      const job = generateQueueRef.current.shift()
      queuedRowIdsRef.current.delete(job.rowId)
      const row = getRowById(job.rowId)
      if (!row?.originalPrompt?.trim() || row.status === STATUS.GENERATING || row.status === STATUS.UPLOADING) continue

      activeGenerateCountRef.current += 1
      runGenerateRow(job.rowId, job.options)
        .catch(() => {})
        .finally(() => {
          activeGenerateCountRef.current = Math.max(0, activeGenerateCountRef.current - 1)
          drainGenerateQueue()
        })
    }
  }

  const enqueueGenerateRow = (rowId, options = {}) => {
    const row = getRowById(rowId)
    if (!row?.originalPrompt?.trim() || row.status === STATUS.GENERATING || row.status === STATUS.UPLOADING) return
    if (queuedRowIdsRef.current.has(rowId)) return
    queuedRowIdsRef.current.add(rowId)
    generateQueueRef.current.push({ rowId, options })
    drainGenerateQueue()
  }

  const generateRow = (rowId, options = {}) => {
    clearRowAutoGenerateTimers(rowId)
    enqueueGenerateRow(rowId, options)
  }

  const startAutoGenerateCountdown = (rowId) => {
    clearRowAutoGenerateTimers(rowId)

    const row = getRowById(rowId)
    if (
      !row?.originalPrompt?.trim() ||
      row.status === STATUS.GENERATING ||
      row.status === STATUS.UPLOADING ||
      row.status === STATUS.UPLOADED ||
      row.uploaded
    ) {
      return
    }

    updateRowAndSave(rowId, {
      status: STATUS.EDITING,
      countdown: AUTO_GENERATE_DELAY_SECONDS,
      isEditing: true,
      dirty: true,
      lastEditedAt: Date.now(),
    })

    const waitingTimerId = window.setTimeout(() => {
      autoGenerateTimerMapRef.current.delete(rowId)
      const latestRow = getRowById(rowId)
      if (
        !latestRow?.originalPrompt?.trim() ||
        latestRow.status === STATUS.GENERATING ||
        latestRow.status === STATUS.UPLOADING ||
        latestRow.status === STATUS.UPLOADED ||
        latestRow.uploaded
      ) {
        clearRowAutoGenerateTimers(rowId)
        return
      }

      updateRowAndSave(rowId, {
        status: STATUS.WAITING,
        countdown: AUTO_GENERATE_DELAY_SECONDS,
        isEditing: false,
        dirty: true,
      })

      const intervalId = window.setInterval(() => {
        const currentRow = getRowById(rowId)
        if (
          !currentRow?.originalPrompt?.trim() ||
          currentRow.status !== STATUS.WAITING ||
          currentRow.status === STATUS.GENERATING ||
          currentRow.status === STATUS.UPLOADING ||
          currentRow.status === STATUS.UPLOADED ||
          currentRow.uploaded
        ) {
          clearRowAutoGenerateTimers(rowId)
          return
        }

        const nextCountdown = Math.max(0, Number(currentRow.countdown || AUTO_GENERATE_DELAY_SECONDS) - 1)
        updateRow(rowId, { countdown: nextCountdown, isEditing: false })
        if (nextCountdown <= 0) {
          clearRowAutoGenerateTimers(rowId)
          const rowBeforeGenerate = getRowById(rowId)
          if (
            rowBeforeGenerate?.originalPrompt?.trim() &&
            rowBeforeGenerate.status === STATUS.WAITING &&
            rowBeforeGenerate.status !== STATUS.GENERATING &&
            rowBeforeGenerate.status !== STATUS.UPLOADING &&
            rowBeforeGenerate.status !== STATUS.UPLOADED &&
            !rowBeforeGenerate.uploaded
          ) {
            enqueueGenerateRow(rowId, { silent: true })
          }
        }
      }, 1000)

      countdownIntervalMapRef.current.set(rowId, intervalId)
    }, 300)

    autoGenerateTimerMapRef.current.set(rowId, waitingTimerId)
  }

  const handlePromptChange = (rowId, value) => {
    appendEmptyRowAfterActivatedBlankRow(rowId, value)
    clearRowAutoGenerateTimers(rowId)
    updateRowAndSave(rowId, (row) => ({
      originalPrompt: value,
      description: '',
      expandingPrompt: false,
      expandError: '',
      ...markPromptEditingState(Boolean(value.trim()), row),
    }))

    if (value.trim()) {
      window.setTimeout(() => startAutoGenerateCountdown(rowId), 0)
    }
  }

  const scheduleRowGenerate = (rowId) => {
    window.setTimeout(() => startAutoGenerateCountdown(rowId), 0)
  }

  const appendEmptyRowAfterActivatedBlankRow = (rowId, value) => {
    if (!String(value || '').trim()) return
    setRows((prevRows) => {
      const rowIndex = prevRows.findIndex((row) => row.id === rowId)
      if (rowIndex < 0) return prevRows

      const currentRow = prevRows[rowIndex]
      const wasBlankRow = !String(currentRow.originalPrompt || '').trim()
        && !currentRow.resultImages?.length
        && !currentRow.workspaceRowId
        && !currentRow.uploaded
        && !currentRow.cosKey
      if (!wasBlankRow) return prevRows

      const nextRow = prevRows[rowIndex + 1]
      const nextRowIsBlank = nextRow
        && !String(nextRow.originalPrompt || '').trim()
        && !nextRow.resultImages?.length
        && !nextRow.workspaceRowId
        && !nextRow.uploaded
        && !nextRow.cosKey
      if (nextRowIsBlank) return prevRows

      const nextRows = [...prevRows]
      nextRows.splice(rowIndex + 1, 0, createEmptyRow())
      return nextRows
    })
  }

  const handlePromptPaste = (rowId, event) => {
    const text = event.clipboardData?.getData('text') || ''
    const pastedRows = text
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (pastedRows.length <= 1) return

    event.preventDefault()
    const editedAt = Date.now()
    let targetIds = []
    setRows((prevRows) => {
      const startIndex = prevRows.findIndex((row) => row.id === rowId)
      if (startIndex < 0) return prevRows

      const nextRows = [...prevRows]
      while (nextRows.length < startIndex + pastedRows.length) {
        nextRows.push(createEmptyRow())
      }

      targetIds = pastedRows.map((prompt, offset) => {
        const index = startIndex + offset
        const current = nextRows[index]
        nextRows[index] = {
          ...current,
          originalPrompt: prompt,
          description: '',
          expandingPrompt: false,
          expandError: '',
          ...resetGeneratedState(),
          lastEditedAt: editedAt,
        }
        return current.id
      })

      return nextRows
    })

    window.setTimeout(() => {
      targetIds.forEach((id) => {
        scheduleWorkspaceSave(id)
        scheduleRowGenerate(id)
      })
    }, 0)
    message.success(`已拆分 ${pastedRows.length} 行，5 秒后自动生成`)
  }

  const scheduleImportedRows = (importedRows) => {
    window.setTimeout(() => {
      importedRows.forEach((row) => {
        scheduleRowGenerate(row.id)
      })
    }, 0)
  }

  const readCsvFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          resolve(decodeCsvBuffer(reader.result))
        } catch (error) {
          reject(new Error('无法识别编码或读取文件失败'))
        }
      }
      reader.onerror = () => reject(new Error('无法识别编码或读取文件失败'))
      reader.readAsArrayBuffer(file)
    })

  const handleImportCsvFile = async (file) => {
    if (!file) return
    const fileName = file.name || ''
    if (!fileName.toLowerCase().endsWith('.csv') && file.type && !file.type.includes('csv')) {
      message.error('文件格式错误，请选择 .csv 文件')
      return
    }

    try {
      setImportingCsv(true)
      const csvText = await readCsvFile(file)
      if (!csvText.trim()) {
        message.error('CSV 为空')
        return
      }

      const parsedRows = parseCsvText(csvText)
      if (!parsedRows.length) {
        message.error('CSV 为空')
        return
      }

      const { rows: importedRows, skipped } = normalizeImportedRows(parsedRows)
      if (!importedRows.length) {
        message.error('没有有效 prompt')
        return
      }

      setWorkMode('batch')
      setViewMode('表格视图')
      setRows((prevRows) => {
        const nonEmptyRows = prevRows.filter((row) => row.originalPrompt.trim() || row.resultImages?.length)
        return [...nonEmptyRows, ...importedRows]
      })
      window.setTimeout(() => importedRows.forEach((row) => scheduleWorkspaceSave(row.id)), 0)
      scheduleImportedRows(importedRows)
      message.success(`已导入 ${importedRows.length} 条记录，跳过 ${skipped} 条无效记录`)
    } catch (error) {
      message.error(error?.message || '导入失败，无法解析 CSV')
    } finally {
      setImportingCsv(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  const handleCsvInputChange = (event) => {
    const file = event.target.files?.[0]
    handleImportCsvFile(file)
  }

  const downloadCsvTemplate = () => {
    const csvContent = ['prompt', '污水厂', '一颗西瓜'].join('\n')
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '批量生图导入模板.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const focusCell = (rowId, columnKey) => {
    window.setTimeout(() => {
      const selector = `[data-cell-id="${rowId}-${columnKey}"]`
      const element = document.querySelector(selector)
      const target = element?.tagName === 'TEXTAREA' || element?.tagName === 'INPUT'
        ? element
        : element?.querySelector?.('textarea,input,[contenteditable="true"]')
      target?.focus?.()
    }, 0)
  }

  const focusNextRowCell = (rowId, columnKey) => {
    const index = rowsRef.current.findIndex((row) => row.id === rowId)
    const nextRow = rowsRef.current[index + 1]
    if (nextRow) {
      focusCell(nextRow.id, columnKey)
      return
    }
    const newRow = createEmptyRow()
    setRows((prevRows) => [...prevRows, newRow])
    focusCell(newRow.id, columnKey)
  }

  const handleCellKeyDown = (rowId, columnKey, event) => {
    if (event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229) return
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    focusNextRowCell(rowId, columnKey)
  }

  const handleDeleteRow = async (rowId) => {
    const row = getRowById(rowId)
    clearRowAutoGenerateTimers(rowId)
    metadataSaveDebounceMapRef.current.get(rowId)?.cancel?.()
    metadataSaveDebounceMapRef.current.delete(rowId)
    queuedRowIdsRef.current.delete(rowId)
    generateQueueRef.current = generateQueueRef.current.filter((job) => job.rowId !== rowId)
    generateAbortMapRef.current.get(rowId)?.abort()
    generateAbortMapRef.current.delete(rowId)
    workspaceSaveDebounceMapRef.current.get(rowId)?.cancel?.()
    workspaceSaveDebounceMapRef.current.delete(rowId)
    try {
      if (row?.workspaceRowId) {
        const response = await deleteWorkspaceRow(row.workspaceRowId)
        message.success(response?.deletedCosObject || response?.deletedImageRecord ? '记录和图片库图片已删除' : '记录已删除')
      } else {
        message.success('记录已删除')
      }
      setRows((prevRows) => prevRows.filter((row) => row.id !== rowId))
    } catch (error) {
      console.error('Delete workspace row failed:', error)
      const detail = error?.response?.data?.detail || error?.response?.data?.message || '删除失败，请稍后重试'
      message.error(detail)
    }
  }

  /**
   * 批量生成逻辑
   * 不要求后端提供 batch 接口，而是按用户要求逐行调用现有 POST /api/generate。
   * 某一行失败只会写入该行 failed，不会中断后续行。
   */
  const handleBatchGenerate = async () => {
    if (workMode !== 'batch') {
      activateBatchMode()
      message.success('已切换到批量表格模式')
      return
    }

    const targetRows = rows.filter((row) => row.originalPrompt.trim() && row.status !== STATUS.GENERATING && row.status !== STATUS.UPLOADING)
    if (targetRows.length === 0) {
      message.warning('请先输入至少一条原始描述')
      return
    }

    targetRows.forEach((row) => {
      clearRowAutoGenerateTimers(row.id)
      updateRowAndSave(row.id, { status: STATUS.WAITING, countdown: 0, isEditing: false, dirty: true })
      enqueueGenerateRow(row.id, { silent: true })
    })
    message.success(`已加入生成队列：${targetRows.length} 行`)
  }

  const handleRefresh = () => {
    autoGenerateTimerMapRef.current.forEach((timerId) => window.clearTimeout(timerId))
    autoGenerateTimerMapRef.current.clear()
    countdownIntervalMapRef.current.forEach((intervalId) => window.clearInterval(intervalId))
    countdownIntervalMapRef.current.clear()
    metadataSaveDebounceMapRef.current.forEach((debouncedSave) => debouncedSave.cancel?.())
    metadataSaveDebounceMapRef.current.clear()
    workspaceSaveDebounceMapRef.current.forEach((debouncedSave) => debouncedSave.cancel?.())
    workspaceSaveDebounceMapRef.current.clear()
    generateAbortMapRef.current.forEach((controller) => controller.abort())
    generateAbortMapRef.current.clear()
    generateQueueRef.current = []
    queuedRowIdsRef.current.clear()
    const previousRows = rowsRef.current
    const nextRows = workMode === 'batch' ? Array.from({ length: DEFAULT_BATCH_ROWS }, () => createEmptyRow()) : []
    setRows(nextRows)
    previousRows.forEach((row) => {
      if (row.workspaceRowId) {
        deleteWorkspaceRow(row.workspaceRowId).catch((error) => console.error('Delete workspace row failed:', error))
      }
    })
    window.setTimeout(() => nextRows.forEach((row) => scheduleWorkspaceSave(row.id)), 0)
  }

  const uploadGeneratedImageForRow = async (rowId, draftImage = null) => {
    const row = getRowById(rowId)
    const image = draftImage || row?.resultImages?.[0]
    if (!row || !image) return
    if (!image.imageBase64) {
      updateRowAndSave(rowId, { errorMessage: '当前图片缺少临时数据，无法自动上传' })
      return
    }

    try {
      clearRowAutoGenerateTimers(rowId)
      updateRowAndSave(rowId, { status: STATUS.UPLOADING, countdown: null, isEditing: false, uploading: true, errorMessage: '' })
      const response = await uploadGeneratedImage({
        prompt: row.originalPrompt,
        keywords: '',
        description: row.originalPrompt,
        originalPrompt: row.originalPrompt,
        imageBase64: image.imageBase64,
        fileName: image.fileName || `${row.originalPrompt || 'image'}.png`,
      })
      const uploadedImage = normalizeImageResponse(response.images?.[0] || response.image)
      updateRowAndSave(rowId, {
        status: STATUS.UPLOADED,
        countdown: null,
        isEditing: false,
        uploading: false,
        uploaded: true,
        cosKey: uploadedImage.cosKey,
        dbId: uploadedImage.dbId,
        thumbnailUrl: uploadedImage.thumbnailUrl,
        tempThumbnailUrl: '',
        previewUrl: uploadedImage.previewUrl,
        downloadUrl: uploadedImage.downloadUrl,
        resultImages: [uploadedImage],
        errorMessage: '',
      })
      message.success('已自动上传到图片库')
    } catch (error) {
      updateRowAndSave(rowId, {
        status: STATUS.GENERATED,
        countdown: null,
        isEditing: false,
        uploading: false,
        errorMessage: error?.response?.data?.detail || error.message || '自动上传失败',
      })
      message.error('自动上传失败')
    }
  }

  const handleDownloadImage = (image, row = null) => {
    const href = image?.downloadUrl || image?.previewUrl || row?.tempPreviewUrl
    if (!href) return
    const link = document.createElement('a')
    link.href = href
    link.download = image?.fileName || `${row?.originalPrompt || 'image'}.png`
    link.click()
  }

  const hasGeneratedResult = (row) =>
    Boolean(
      row?.tempPreviewUrl ||
      row?.previewUrl ||
      row?.downloadUrl ||
      row?.resultImages?.length ||
      row?.status === STATUS.GENERATED ||
      row?.status === STATUS.UPLOADED ||
      row?.uploaded
    )

  const resolveCopyableImageUrl = (row) => {
    const image = row?.resultImages?.[0]
    if (row?.uploaded) {
      const shareUrl = getDownloadShareUrl({
        downloadUrl: image?.downloadUrl || row?.downloadUrl,
      })
      if (shareUrl) return shareUrl
    }

    return ''
  }

  const handleCopyImageLink = async (row) => {
    const copyUrl = resolveCopyableImageUrl(row)
    if (!copyUrl) {
      message.warning('请先上传图片后再复制下载链接')
      return
    }
    try {
      await copyImageLink(copyUrl)
      message.success('已复制下载链接')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const previewImageUrls = useMemo(
    () => Array.from(new Set(
      rows
        .flatMap((row) => row.resultImages || [])
        .map((image) => image.previewUrl)
        .filter(Boolean)
    )),
    [rows]
  )

  const previewGroupItems = useMemo(
    () => (previewUrl
      ? [previewUrl, ...previewImageUrls.filter((url) => url !== previewUrl)]
      : previewImageUrls),
    [previewImageUrls, previewUrl]
  )

  const openImagePreview = (image) => {
    const targetUrl = image?.previewUrl || ''
    if (!targetUrl) return
    setPreviewUrl(targetUrl)
    setPreviewIndex(0)
    setPreviewKey((key) => key + 1)
    setPreviewOpen(true)
  }

  const columns = useMemo(
    () => [
      {
        title: '原始描述',
        dataIndex: 'originalPrompt',
        width: 420,
        render: (_, row) => (
          <EditableCell
            type="textarea"
            value={row.originalPrompt}
            placeholder="输入描述，5 秒后自动生成"
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => handlePromptChange(row.id, value)}
            onPaste={(event) => handlePromptPaste(row.id, event)}
            onKeyDown={(event) => handleCellKeyDown(row.id, 'prompt', event)}
            dataCellId={`${row.id}-prompt`}
          />
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 142,
        render: (status, row) => (
          <Space direction="vertical" size={2}>
            <StatusTag status={status} countdownSeconds={row.countdown} />
            {row.errorMessage && <Text type="danger" className="row-error">{row.errorMessage}</Text>}
          </Space>
        ),
      },
      {
        title: '结果图片',
        dataIndex: 'resultImages',
        width: 120,
        render: (images, row) =>
          images?.length ? (
            <div className="result-thumbs">
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="thumb-button"
                  onClick={() => openImagePreview(image)}
                >
                  <img
                    src={displayImageUrlForRow(row, image)}
                    alt={row.originalPrompt || '生成结果'}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          ) : (
            <Text type="secondary">暂无结果</Text>
          ),
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 336,
        render: (_, row) => (
          <Space size={4} className="row-actions" wrap={false}>
            <Tooltip title={hasGeneratedResult(row) ? '重新生成当前图片' : '立即生成'}>
              <Button
                size="small"
                type="primary"
                onClick={() => generateRow(row.id)}
                loading={row.status === STATUS.GENERATING || row.status === STATUS.UPLOADING}
                disabled={!row.originalPrompt.trim() || row.status === STATUS.UPLOADING}
              >
                {hasGeneratedResult(row) ? '重试' : '生成'}
              </Button>
            </Tooltip>
            <Tooltip title="复制下载链接">
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => handleCopyImageLink(row)}
                disabled={!hasGeneratedResult(row) || row.status === STATUS.GENERATING || row.status === STATUS.UPLOADING}
              >
                复制链接
              </Button>
            </Tooltip>
            <Tooltip title="下载当前图片">
              <Button
                size="small"
                icon={<DownloadOutlined />}
                disabled={!row.resultImages?.length}
                onClick={() => handleDownloadImage(row.resultImages[0], row)}
              >
                下载
              </Button>
            </Tooltip>
            <Popconfirm
              title="确定删除这条记录吗？"
              description="如果图片已上传，图片库中的对应图片也会被删除。"
              okText="删除"
              cancelText="取消"
              onConfirm={() => handleDeleteRow(row.id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    []
  )

  const galleryItems = rows.flatMap((row) =>
    (row.resultImages || []).map((image) => ({
      row,
      image,
    }))
  )

  return (
    <div className="batch-workbench">
      <Card className="workbench-card" styles={{ body: { padding: 0 } }}>
        <div className="table-summary">
          <div className="summary-main">
            <Space split={<span className="summary-split" />}>
              <Text strong>图片生成工作台</Text>
              <Text type="secondary">{workMode === 'batch' ? '批量表格模式' : '单条工作流'}</Text>
              <Text type="secondary">共 {rows.length} 条记录</Text>
            </Space>
          </div>
          <div className="summary-actions">
            <Button icon={<FileTextOutlined />} onClick={downloadCsvTemplate}>
              CSV 模板下载
            </Button>
            <Button
              icon={<ImportOutlined />}
              loading={importingCsv}
              onClick={() => csvInputRef.current?.click()}
            >
              一键导入 CSV
            </Button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="csv-file-input"
              onChange={handleCsvInputChange}
            />
            <Segmented value={viewMode} options={['表格视图', '图库视图']} onChange={setViewMode} />
          </div>
        </div>

        {viewMode === '表格视图' ? (
          <>
            <Table
              rowKey="id"
              size="middle"
              columns={columns}
              dataSource={rows}
              pagination={false}
              loading={restoringWorkspace}
              tableLayout="fixed"
              locale={{ emptyText: '在第一行输入原始描述后，系统会自动创建下一行' }}
              scroll={{ x: TABLE_SCROLL_X, y: 'calc(100vh - 198px)' }}
              className="batch-table"
            />
          </>
        ) : (
          <div className="gallery-grid">
            {galleryItems.length > 0 ? (
              galleryItems.map(({ row, image }) => (
                <button
                  key={`${row.id}-${image.id}`}
                  type="button"
                  className="gallery-card"
                  onClick={() => openImagePreview(image)}
                >
                  <img
                    src={displayImageUrlForRow(row, image)}
                    alt={row.originalPrompt || '图库图片'}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="gallery-card-meta">
                    <Text strong ellipsis>{row.originalPrompt || '未命名图片'}</Text>
                    <Text type="secondary" ellipsis>{row.originalPrompt || '-'}</Text>
                  </div>
                </button>
              ))
            ) : (
              <Empty description="暂无图片结果，可以先生成或搜索图片" />
            )}
          </div>
        )}
      </Card>

      <Image.PreviewGroup
        key={previewKey}
        items={previewGroupItems}
        preview={{
          visible: previewOpen,
          current: previewIndex,
          onVisibleChange: (visible) => {
            setPreviewOpen(visible)
            if (!visible) {
              setPreviewUrl('')
              setPreviewIndex(0)
            }
          },
          onChange: (current) => {
            setPreviewIndex(current)
            setPreviewUrl(previewGroupItems[current] || '')
          },
        }}
      />
    </div>
  )
}

export default BatchGenerateTablePage
