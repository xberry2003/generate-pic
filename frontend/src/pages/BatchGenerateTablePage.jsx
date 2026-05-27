import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd'
import {
  ImportOutlined,
  SyncOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { createDebouncedFunction } from '../services/debounce'
import { API_ORIGIN, expandPrompt, generateImageDraft, getImageDownloadUrl, searchImages, uploadGeneratedImage } from '../services/api'
import EditableCell from '../components/EditableCell'
import ImageDetailDrawer from '../components/ImageDetailDrawer'
import StatusTag from '../components/StatusTag'
import UploadImageModal from '../components/UploadImageModal'
import './BatchGenerateTablePage.css'

const { Text } = Typography
const DEFAULT_BATCH_ROWS = 10
const MAX_GENERATE_CONCURRENCY = 2
const PROMPT_EXPAND_DEBOUNCE_MS = 5000
const HEADER_ALIASES = {
  originalPrompt: ['prompt', '原始描述', 'originalPrompt'],
  description: ['expandedPrompt', '描述扩充', 'description'],
  keywords: ['keywords', '关键词'],
  count: ['count', '数量'],
}
// 前端表格任务状态。状态值沿用原生成页逻辑，避免改变现有交互语义。
const STATUS = {
  IDLE: 'idle',
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
  previewUrl: '',
  downloadUrl: '',
  tempImageBase64: '',
  tempPreviewUrl: '',
  errorMessage: '',
  createdAt: '',
  lastEditedAt: 0,
  dirty: false,
  ...overrides,
})

/**
 * 把关键词统一转成数组，兼容后端返回的逗号字符串和前端 Select tags 数组。
 */
const normalizeKeywords = (keywords) => {
  if (Array.isArray(keywords)) return keywords.filter(Boolean)
  if (!keywords) return []
  return String(keywords)
    .split(/[,，]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

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

const hasKnownCsvHeader = (headers) =>
  Object.values(HEADER_ALIASES).some((aliases) => findHeaderIndex(headers, aliases) >= 0)

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
  const hasHeader = hasKnownCsvHeader(firstRow)
  const dataRows = hasHeader ? restRows : csvRows
  const indexes = hasHeader
    ? {
        originalPrompt: findHeaderIndex(firstRow, HEADER_ALIASES.originalPrompt),
        description: findHeaderIndex(firstRow, HEADER_ALIASES.description),
        keywords: findHeaderIndex(firstRow, HEADER_ALIASES.keywords),
        count: findHeaderIndex(firstRow, HEADER_ALIASES.count),
      }
    : {
        originalPrompt: 0,
        description: 1,
        keywords: 2,
        count: 3,
      }

  const importedRows = []
  let skipped = 0

  dataRows.forEach((items) => {
    const originalPrompt = (items[indexes.originalPrompt] || '').trim()
    if (!originalPrompt) {
      skipped += 1
      return
    }

    const description = indexes.description >= 0 ? (items[indexes.description] || '').trim() : ''
    const keywordText = indexes.keywords >= 0 ? (items[indexes.keywords] || '').trim() : ''
    const parsedCount = Number.parseInt(indexes.count >= 0 ? items[indexes.count] : '', 10)
    const count = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.min(parsedCount, 4) : 1
    const now = Date.now()

    importedRows.push(createEmptyRow({
      originalPrompt,
      description,
      keywords: normalizeKeywords(keywordText),
      count,
      status: STATUS.WAITING,
      expandedPromptTouched: Boolean(description),
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
  const previewUrl = previewPath.startsWith('http') || isInlinePreview ? previewPath : `${API_ORIGIN}${previewPath}`
  const isTemporary = Boolean(image.temporary || isInlinePreview)
  const rawDownloadUrl = image.downloadUrl || image.download_url || (isTemporary ? '' : getImageDownloadUrl(image.id))
  const downloadUrl = rawDownloadUrl && !rawDownloadUrl.startsWith('http') ? `${API_ORIGIN}${rawDownloadUrl}` : rawDownloadUrl

  return {
    id: image.id,
    url: previewUrl,
    previewUrl,
    downloadUrl,
    imageBase64: image.imageBase64 || image.image_base64 || '',
    uploaded: Boolean(image.uploaded || image.cosKey || image.remote_path),
    cosKey: image.cosKey || image.remote_path || '',
    dbId: image.dbId || image.id || null,
    fileName: image.fileName || image.file_name || '',
    createdAt: image.created_at || image.createdAt || '',
    raw: image,
  }
}

/**
 * 把图片库搜索结果映射成表格行。
 * 注意：搜索接口返回的是图片记录，不是批量任务记录；这里用每张图片构造一行只读结果行。
 */
const mapImageToRow = (image) => ({
  id: `image-${image.id}`,
  originalPrompt: image.prompt || '',
  description: image.description || image.prompt || '',
  keywords: normalizeKeywords(image.keywords),
  count: 1,
  status: STATUS.DONE,
  uploaded: true,
  cosKey: image.cosKey || image.remote_path || '',
  dbId: image.id,
  previewUrl: image.previewUrl || image.preview_url || '',
  downloadUrl: image.downloadUrl || image.download_url || '',
  resultImages: [normalizeImageResponse(image)],
  errorMessage: '',
  createdAt: image.created_at || '',
})

/**
 * 多维表格式图片生成工作台
 * 职责：
 * 1. 用表格承载多行生成任务，每行独立编辑、独立防抖、独立状态。
 * 2. 复用现有 generateImages/searchImages/getImageDownloadUrl，不新增或改变后端接口。
 * 3. 把后端图片返回适配为 resultImages，供表格缩略图和详情抽屉使用。
 */
function BatchGenerateTablePage() {
  const [rows, setRows] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [importingCsv, setImportingCsv] = useState(false)
  const [workMode, setWorkMode] = useState('single')
  const [viewMode, setViewMode] = useState('表格视图')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeImage, setActiveImage] = useState(null)
  const [activeRow, setActiveRow] = useState(null)

  // 每行一份防抖函数，保证编辑 A 行不会触发 B 行生成。
  const rowDebounceMapRef = useRef(new Map())
  const expandDebounceMapRef = useRef(new Map())
  const expandRequestSeqRef = useRef(new Map())
  const generateQueueRef = useRef([])
  const activeGenerateCountRef = useRef(0)
  const queuedRowIdsRef = useRef(new Set())
  const generateAbortMapRef = useRef(new Map())
  const rowsRef = useRef(rows)
  const csvInputRef = useRef(null)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    return () => {
      rowDebounceMapRef.current.forEach((debouncedGenerate) => debouncedGenerate.cancel?.())
      expandDebounceMapRef.current.forEach((debouncedExpand) => debouncedExpand.cancel?.())
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

  const keywordsToRequestString = (keywords) => normalizeKeywords(keywords).join(',')

  const resetGeneratedState = () => ({
    status: STATUS.WAITING,
    uploaded: false,
    uploading: false,
    cosKey: '',
    dbId: null,
    previewUrl: '',
    downloadUrl: '',
    tempImageBase64: '',
    tempPreviewUrl: '',
    resultImages: [],
    errorMessage: '',
    dirty: true,
    lastEditedAt: Date.now(),
  })

  const ensureBatchRows = (minRows = DEFAULT_BATCH_ROWS) => {
    setRows((prevRows) => {
      if (prevRows.length >= minRows) return prevRows
      return [...prevRows, ...Array.from({ length: minRows - prevRows.length }, () => createEmptyRow())]
    })
  }

  const activateBatchMode = () => {
    setWorkMode('batch')
    setViewMode('表格视图')
    ensureBatchRows()
  }

  const runExpandPrompt = async (rowId, options = {}) => {
    const row = getRowById(rowId)
    const prompt = row?.originalPrompt?.trim()
    if (!row || !prompt) return
    if (row.expandedPromptTouched && !options.force) return

    const requestSeq = (expandRequestSeqRef.current.get(rowId) || 0) + 1
    expandRequestSeqRef.current.set(rowId, requestSeq)
    updateRow(rowId, { expandingPrompt: true, expandError: '' })

    try {
      const response = await expandPrompt(prompt)
      const latestRow = getRowById(rowId)
      const isLatest = expandRequestSeqRef.current.get(rowId) === requestSeq
      if (!latestRow || !isLatest) return
      if (latestRow.expandedPromptTouched && !options.force) return

      updateRow(rowId, {
        description: response.expandedPrompt || '',
        expandingPrompt: false,
        expandError: '',
        expandedPromptTouched: Boolean(options.force) ? false : latestRow.expandedPromptTouched,
      })
    } catch (error) {
      const isLatest = expandRequestSeqRef.current.get(rowId) === requestSeq
      if (!isLatest) return
      updateRow(rowId, {
        expandingPrompt: false,
        expandError: error?.response?.data?.detail || '扩写失败，可手动填写',
      })
    }
  }

  const getDebouncedExpandPrompt = (rowId) => {
    if (!expandDebounceMapRef.current.has(rowId)) {
      expandDebounceMapRef.current.set(
        rowId,
        createDebouncedFunction(() => runExpandPrompt(rowId), PROMPT_EXPAND_DEBOUNCE_MS)
      )
    }
    return expandDebounceMapRef.current.get(rowId)
  }

  const schedulePromptExpand = (rowId) => {
    const row = getRowById(rowId)
    const debouncedExpand = getDebouncedExpandPrompt(rowId)
    if (row?.originalPrompt?.trim() && !row.expandedPromptTouched) {
      debouncedExpand()
    } else {
      debouncedExpand.cancel?.()
    }
  }

  const handleRegenerateExpandedPrompt = (rowId) => {
    expandDebounceMapRef.current.get(rowId)?.cancel?.()
    updateRow(rowId, { expandedPromptTouched: false })
    runExpandPrompt(rowId, { force: true })
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
      updateRow(rowId, { status: STATUS.IDLE })
      return
    }

    const debouncedGenerate = rowDebounceMapRef.current.get(rowId)
    debouncedGenerate?.cancel?.()
    generateAbortMapRef.current.get(rowId)?.abort()
    const abortController = new AbortController()
    generateAbortMapRef.current.set(rowId, abortController)

    try {
      updateRow(rowId, {
        status: STATUS.GENERATING,
        errorMessage: '',
        uploaded: false,
        uploading: false,
        cosKey: '',
        dbId: null,
        previewUrl: '',
        downloadUrl: '',
        tempImageBase64: '',
        tempPreviewUrl: '',
        resultImages: [],
      })
      const description = row.description.trim()
      const promptForGeneration = description || prompt
      const response = await generateImageDraft(
        promptForGeneration,
        keywordsToRequestString(row.keywords),
        row.count,
        description || prompt,
        { signal: abortController.signal }
      )
      if (abortController.signal.aborted || !getRowById(rowId)) return
      const resultImages = (response.images || []).map(normalizeImageResponse)
      const firstImage = resultImages[0]

      updateRow(rowId, {
        status: STATUS.GENERATED,
        resultImages,
        uploaded: false,
        uploading: false,
        cosKey: '',
        dbId: null,
        previewUrl: firstImage?.previewUrl || '',
        downloadUrl: '',
        tempPreviewUrl: firstImage?.previewUrl || '',
        tempImageBase64: firstImage?.imageBase64 || '',
        createdAt: resultImages[0]?.createdAt || new Date().toISOString(),
        errorMessage: '',
        dirty: false,
      })
      if (!options.silent) message.success('生成成功')
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || abortController.signal.aborted) {
        return
      }
      updateRow(rowId, {
        status: STATUS.FAILED,
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
    rowDebounceMapRef.current.get(rowId)?.cancel?.()
    enqueueGenerateRow(rowId, options)
  }

  const getDebouncedGenerate = (rowId) => {
    if (!rowDebounceMapRef.current.has(rowId)) {
      // 10 秒无输入后触发当前行生成；触发前先把该行标记为 waiting。
      rowDebounceMapRef.current.set(
        rowId,
        createDebouncedFunction(() => {
          const row = getRowById(rowId)
          if (!row?.originalPrompt?.trim() || row.status === STATUS.GENERATING || row.status === STATUS.UPLOADING) return
          updateRow(rowId, { status: STATUS.WAITING, dirty: true })
          generateRow(rowId, { silent: true })
        }, 10000)
      )
    }
    return rowDebounceMapRef.current.get(rowId)
  }

  const handlePromptChange = (rowId, value) => {
    updateRow(rowId, (row) => ({
      originalPrompt: value,
      description: row.expandedPromptTouched ? row.description : '',
      expandingPrompt: false,
      expandError: '',
      ...(value.trim() ? resetGeneratedState() : { ...resetGeneratedState(), status: STATUS.IDLE }),
    }))

    const debouncedGenerate = getDebouncedGenerate(rowId)
    if (value.trim()) {
      debouncedGenerate()
      window.setTimeout(() => schedulePromptExpand(rowId), 0)
    } else {
      debouncedGenerate.cancel?.()
      expandDebounceMapRef.current.get(rowId)?.cancel?.()
    }
  }

  const scheduleRowGenerate = (rowId) => {
    const row = getRowById(rowId)
    const debouncedGenerate = getDebouncedGenerate(rowId)
    if (row?.originalPrompt?.trim()) debouncedGenerate()
  }

  const handleRowFieldChange = (rowId, patch) => {
    updateRow(rowId, (row) => {
      const nextPatch = typeof patch === 'function' ? patch(row) : patch
      const hasPrompt = (nextPatch.originalPrompt ?? row.originalPrompt).trim()
      return {
        ...nextPatch,
        ...(hasPrompt ? resetGeneratedState() : { ...resetGeneratedState(), status: STATUS.IDLE }),
      }
    })
    window.setTimeout(() => scheduleRowGenerate(rowId), 0)
  }

  const handleAddRow = () => {
    setRows((prevRows) => [createEmptyRow(), ...prevRows])
  }

  const handleAddBatchRows = (count = DEFAULT_BATCH_ROWS) => {
    setRows((prevRows) => [...prevRows, ...Array.from({ length: count }, () => createEmptyRow())])
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
          description: current.expandedPromptTouched ? current.description : '',
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
        schedulePromptExpand(id)
        scheduleRowGenerate(id)
      })
    }, 0)
    message.success(`已拆分 ${pastedRows.length} 行，10 秒后自动生成`)
  }

  const scheduleImportedRows = (importedRows) => {
    window.setTimeout(() => {
      importedRows.forEach((row) => {
        if (!row.expandedPromptTouched) schedulePromptExpand(row.id)
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
        const nonEmptyRows = prevRows.filter(
          (row) => row.originalPrompt.trim() || row.description.trim() || row.resultImages?.length
        )
        return [...nonEmptyRows, ...importedRows]
      })
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
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    focusNextRowCell(rowId, columnKey)
  }

  const handleDeleteRow = (rowId) => {
    rowDebounceMapRef.current.get(rowId)?.cancel?.()
    rowDebounceMapRef.current.delete(rowId)
    expandDebounceMapRef.current.get(rowId)?.cancel?.()
    expandDebounceMapRef.current.delete(rowId)
    expandRequestSeqRef.current.delete(rowId)
    queuedRowIdsRef.current.delete(rowId)
    generateQueueRef.current = generateQueueRef.current.filter((job) => job.rowId !== rowId)
    generateAbortMapRef.current.get(rowId)?.abort()
    generateAbortMapRef.current.delete(rowId)
    setRows((prevRows) => prevRows.filter((row) => row.id !== rowId))
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
      rowDebounceMapRef.current.get(row.id)?.cancel?.()
      updateRow(row.id, { status: STATUS.WAITING, dirty: true })
      enqueueGenerateRow(row.id, { silent: true })
    })
    message.success(`已加入生成队列：${targetRows.length} 行`)
  }

  const handleSearch = async (query = searchQuery) => {
    try {
      setLoadingSearch(true)
      const response = await searchImages(query)
      const nextRows = (response.images || []).map(mapImageToRow)
      setRows(nextRows)
      message.success(`找到 ${response.total || nextRows.length} 张图片`)
    } catch (error) {
      message.error(error?.response?.data?.detail || '搜索失败')
    } finally {
      setLoadingSearch(false)
    }
  }

  const handleRefresh = () => {
    rowDebounceMapRef.current.forEach((debouncedGenerate) => debouncedGenerate.cancel?.())
    expandDebounceMapRef.current.forEach((debouncedExpand) => debouncedExpand.cancel?.())
    generateAbortMapRef.current.forEach((controller) => controller.abort())
    generateAbortMapRef.current.clear()
    generateQueueRef.current = []
    queuedRowIdsRef.current.clear()
    setRows(workMode === 'batch' ? Array.from({ length: DEFAULT_BATCH_ROWS }, () => createEmptyRow()) : [])
    setSearchQuery('')
  }

  const handleUploadedImage = (image) => {
    if (!image) return
    const nextRow = mapImageToRow(image)
    setRows((prevRows) => [nextRow, ...prevRows])
    message.success('已添加本次上传图片')
  }

  /**
   * 下载逻辑
   * 使用 normalizeImageResponse 里的 downloadUrl，本质仍来自 getImageDownloadUrl(imageId)，继续请求后端下载接口。
   */
  const handleUploadGeneratedImage = async (rowId) => {
    const row = getRowById(rowId)
    const image = row?.resultImages?.[0]
    if (!row || !image) return
    if (row.uploaded || row.cosKey) {
      message.info('该图片已上传，请勿重复上传')
      return
    }
    if (!image.imageBase64) {
      message.warning('当前图片缺少临时数据，无法上传')
      return
    }

    try {
      updateRow(rowId, { status: STATUS.UPLOADING, uploading: true, errorMessage: '' })
      const response = await uploadGeneratedImage({
        prompt: row.originalPrompt,
        keywords: keywordsToRequestString(row.keywords),
        description: row.description || row.originalPrompt,
        imageBase64: image.imageBase64,
        fileName: image.fileName,
      })
      const uploadedImage = normalizeImageResponse(response.images?.[0] || response.image)
      updateRow(rowId, {
        status: STATUS.UPLOADED,
        uploading: false,
        uploaded: true,
        cosKey: uploadedImage.cosKey,
        dbId: uploadedImage.dbId,
        previewUrl: uploadedImage.previewUrl,
        downloadUrl: uploadedImage.downloadUrl,
        resultImages: [uploadedImage],
        errorMessage: '',
      })
      message.success('上传成功')
    } catch (error) {
      updateRow(rowId, {
        status: STATUS.GENERATED,
        uploading: false,
        errorMessage: error?.response?.data?.detail || error.message || '上传失败',
      })
      message.error('上传失败')
    }
  }

  const handleDownloadImage = (image, row = null) => {
    const href = image?.downloadUrl || image?.previewUrl || row?.tempPreviewUrl
    if (!href) return
    const link = document.createElement('a')
    link.href = href
    link.download = image?.fileName || `${row?.description || row?.originalPrompt || 'image'}.png`
    link.click()
  }

  const openImageDrawer = (image, row) => {
    setActiveImage(image)
    setActiveRow(row)
    setDrawerOpen(true)
  }

  const columns = useMemo(
    () => [
      {
        title: '原始描述',
        dataIndex: 'originalPrompt',
        width: 320,
        render: (_, row) => (
          <EditableCell
            type="textarea"
            value={row.originalPrompt}
            placeholder="输入描述，10 秒后自动生成"
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => handlePromptChange(row.id, value)}
            onPaste={(event) => handlePromptPaste(row.id, event)}
            onKeyDown={(event) => handleCellKeyDown(row.id, 'prompt', event)}
            dataCellId={`${row.id}-prompt`}
          />
        ),
      },
      {
        title: '描述扩充',
        dataIndex: 'description',
        width: 300,
        render: (_, row) => (
          <div className="expand-cell">
            <EditableCell
              type="textarea"
              value={row.description}
              placeholder="本地规则扩写，可手动编辑"
              disabled={row.status === STATUS.GENERATING || row.expandingPrompt}
              onChange={(value) => handleRowFieldChange(row.id, {
                description: value,
                expandedPromptTouched: true,
                expandingPrompt: false,
                expandError: '',
              })}
              onKeyDown={(event) => handleCellKeyDown(row.id, 'description', event)}
              dataCellId={`${row.id}-description`}
            />
            <div className="expand-meta">
              <Button
                size="small"
                type="link"
                icon={<SyncOutlined spin={row.expandingPrompt} />}
                disabled={!row.originalPrompt.trim() || row.status === STATUS.GENERATING}
                onClick={() => handleRegenerateExpandedPrompt(row.id)}
              >
                {row.expandingPrompt ? '扩写中' : '重新扩写'}
              </Button>
              {row.expandError && <Text type="danger" className="expand-error">{row.expandError}</Text>}
            </div>
          </div>
        ),
      },
      {
        title: 'Keywords',
        dataIndex: 'keywords',
        width: 240,
        render: (_, row) => (
          <EditableCell
            type="tags"
            value={row.keywords}
            placeholder="输入关键词"
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => handleRowFieldChange(row.id, { keywords: value })}
            dataCellId={`${row.id}-keywords`}
          />
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 112,
        render: (status, row) => (
          <Space direction="vertical" size={2}>
            <StatusTag status={status} />
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
                  onClick={() => openImageDrawer(image, row)}
                >
                  <img src={image.previewUrl} alt={row.originalPrompt || '生成结果'} />
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
        width: 260,
        render: (_, row) => (
          <Space size={4} className="row-actions" wrap={false}>
            <Tooltip title="立即生成">
              <Button
                size="small"
                type="primary"
                onClick={() => generateRow(row.id)}
                loading={row.status === STATUS.GENERATING}
                disabled={!row.originalPrompt.trim()}
              >
                生成
              </Button>
            </Tooltip>
            <Tooltip title="重试">
              <Button size="small" onClick={() => generateRow(row.id)} disabled={!row.originalPrompt.trim() || row.status === STATUS.GENERATING || row.status === STATUS.UPLOADING}>重试</Button>
            </Tooltip>
            <Tooltip title="查看详情">
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!row.resultImages?.length}
                onClick={() => openImageDrawer(row.resultImages[0], row)}
              />
            </Tooltip>
            <Tooltip title={row.uploaded ? '已上传' : '上传到图片库'}>
              <Button
                size="small"
                icon={<UploadOutlined />}
                loading={row.status === STATUS.UPLOADING || row.uploading}
                disabled={!row.resultImages?.length || row.uploaded || row.status === STATUS.GENERATING}
                onClick={() => handleUploadGeneratedImage(row.id)}
              >
                {row.uploaded ? '已上传' : '上传'}
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
            <Popconfirm title="删除这条记录？" okText="删除" cancelText="取消" onConfirm={() => handleDeleteRow(row.id)}>
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
      <div className="workbench-toolbar">
        <div className="toolbar-left">
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRow}>
            新增记录
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleBatchGenerate}>
            {workMode === 'batch' ? '生成全部待处理' : '批量生成'}
          </Button>
          {workMode === 'batch' && (
            <Button onClick={() => handleAddBatchRows(10)}>
              添加 10 行
            </Button>
          )}
          <Button icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            上传图片
          </Button>
          <Input.Search
            allowClear
            value={searchQuery}
            placeholder="搜索 prompt、keywords、description"
            enterButton={<SearchOutlined />}
            loading={loadingSearch}
            onChange={(event) => setSearchQuery(event.target.value)}
            onSearch={handleSearch}
            className="toolbar-search"
          />
        </div>
        <div className="toolbar-right">
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
          <Button icon={<SortAscendingOutlined />}>排序</Button>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
            刷新
          </Button>
          <Segmented value={viewMode} options={['表格视图', '图库视图']} onChange={setViewMode} />
        </div>
      </div>

      <Card className="workbench-card" styles={{ body: { padding: 0 } }}>
        <div className="table-summary">
          <Space split={<span className="summary-split" />}>
            <Text strong>图片生成工作台</Text>
            <Text type="secondary">{workMode === 'batch' ? '批量表格模式' : '单条工作流'}</Text>
            <Text type="secondary">共 {rows.length} 条记录</Text>
          </Space>
          <Space>
            <Tag color="blue">每行 10 秒自动生成</Tag>
            <Tag color="purple">最多 {MAX_GENERATE_CONCURRENCY} 行并发</Tag>
            <Tag color="green">复用现有 API</Tag>
          </Space>
        </div>

        {viewMode === '表格视图' ? (
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: '点击“批量生成”进入表格模式，或点击“新增记录”开始单条生成' }}
            scroll={{ x: 1350, y: 'calc(100vh - 260px)' }}
            className="batch-table"
          />
        ) : (
          <div className="gallery-grid">
            {galleryItems.length > 0 ? (
              galleryItems.map(({ row, image }) => (
                <button
                  key={`${row.id}-${image.id}`}
                  type="button"
                  className="gallery-card"
                  onClick={() => openImageDrawer(image, row)}
                >
                  <img src={image.previewUrl} alt={row.originalPrompt || '图库图片'} />
                  <div className="gallery-card-meta">
                    <Text strong ellipsis>{row.originalPrompt || '未命名图片'}</Text>
                    <Text type="secondary" ellipsis>{normalizeKeywords(row.keywords).join('、') || '无关键词'}</Text>
                  </div>
                </button>
              ))
            ) : (
              <Empty description="暂无图片结果，可以先生成、搜索或上传图片" />
            )}
          </div>
        )}
      </Card>

      <UploadImageModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={handleUploadedImage}
      />
      <ImageDetailDrawer
        open={drawerOpen}
        image={activeImage}
        row={activeRow}
        onClose={() => setDrawerOpen(false)}
        onDownload={handleDownloadImage}
      />
    </div>
  )
}

export default BatchGenerateTablePage
