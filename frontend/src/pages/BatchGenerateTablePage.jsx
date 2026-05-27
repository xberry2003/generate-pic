import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
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
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { createDebouncedFunction } from '../services/debounce'
import { generateImages, getImageDownloadUrl, listImages, searchImages } from '../services/api'
import EditableCell from '../components/EditableCell'
import ImageDetailDrawer from '../components/ImageDetailDrawer'
import StatusTag from '../components/StatusTag'
import UploadImageModal from '../components/UploadImageModal'
import './BatchGenerateTablePage.css'

const { Text } = Typography
const API_ORIGIN = 'http://localhost:8000'

// 前端表格任务状态。状态值沿用原生成页逻辑，避免改变现有交互语义。
const STATUS = {
  IDLE: 'idle',
  WAITING: 'waiting',
  GENERATING: 'generating',
  DONE: 'done',
  FAILED: 'failed',
}

/**
 * 创建一条前端表格记录
 * 数据流说明：表格行是前端工作台的内部结构，不要求后端新增字段；生成或搜索结果会被适配成该结构。
 */
const createEmptyRow = () => ({
  id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  originalPrompt: '',
  description: '',
  keywords: [],
  count: 1,
  status: STATUS.IDLE,
  resultImages: [],
  errorMessage: '',
  createdAt: '',
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

/**
 * 把后端图片对象统一转成表格缩略图所需结构。
 * 兼容字段：后端当前返回 preview_url；如果以后返回 file_path、download_url，也只在这里适配，不改真实接口。
 */
const normalizeImageResponse = (image) => {
  const previewPath = image.preview_url || image.previewUrl || image.file_path || image.url || ''
  const previewUrl = previewPath.startsWith('http') ? previewPath : `${API_ORIGIN}${previewPath}`
  const rawDownloadUrl = image.download_url || image.downloadUrl || getImageDownloadUrl(image.id)
  const downloadUrl = rawDownloadUrl.startsWith('http') ? rawDownloadUrl : `${API_ORIGIN}${rawDownloadUrl}`

  return {
    id: image.id,
    url: previewUrl,
    previewUrl,
    downloadUrl,
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
  const [rows, setRows] = useState([createEmptyRow()])
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [viewMode, setViewMode] = useState('表格视图')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeImage, setActiveImage] = useState(null)
  const [activeRow, setActiveRow] = useState(null)

  // 每行一份防抖函数，保证编辑 A 行不会触发 B 行生成。
  const rowDebounceMapRef = useRef(new Map())
  const rowsRef = useRef(rows)

  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    return () => {
      rowDebounceMapRef.current.forEach((debouncedGenerate) => debouncedGenerate.cancel?.())
    }
  }, [])

  useEffect(() => {
    // 页面首次加载时从后端数据库读取历史图片，浏览器刷新后不会丢失已生成/上传的记录。
    loadImageLibrary(false)
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

  /**
   * 单行生成逻辑
   * 数据流：读取表格行 -> 调用现有 generateImages(prompt, keywords, count) -> 归一化 response.images -> 写回该行。
   */
  const generateRow = async (rowId, options = {}) => {
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

    try {
      updateRow(rowId, { status: STATUS.GENERATING, errorMessage: '' })
      const response = await generateImages(prompt, keywordsToRequestString(row.keywords), row.count)
      const resultImages = (response.images || []).map(normalizeImageResponse)

      updateRow(rowId, {
        status: STATUS.DONE,
        resultImages,
        createdAt: resultImages[0]?.createdAt || new Date().toISOString(),
        errorMessage: '',
      })
      if (!options.silent) message.success('生成成功')
    } catch (error) {
      updateRow(rowId, {
        status: STATUS.FAILED,
        errorMessage: error?.response?.data?.detail || error.message || '生成失败',
      })
      if (!options.silent) message.error('生成失败')
    }
  }

  const getDebouncedGenerate = (rowId) => {
    if (!rowDebounceMapRef.current.has(rowId)) {
      // 10 秒无输入后触发当前行生成；触发前先把该行标记为 waiting。
      rowDebounceMapRef.current.set(
        rowId,
        createDebouncedFunction(() => {
          const row = getRowById(rowId)
          if (!row?.originalPrompt?.trim() || row.status === STATUS.GENERATING) return
          updateRow(rowId, { status: STATUS.WAITING })
          generateRow(rowId, { silent: true })
        }, 10000)
      )
    }
    return rowDebounceMapRef.current.get(rowId)
  }

  const handlePromptChange = (rowId, value) => {
    updateRow(rowId, (row) => ({
      originalPrompt: value,
      description: row.description || value,
      status: value.trim() ? STATUS.WAITING : STATUS.IDLE,
      errorMessage: '',
    }))

    const debouncedGenerate = getDebouncedGenerate(rowId)
    if (value.trim()) {
      debouncedGenerate()
    } else {
      debouncedGenerate.cancel?.()
    }
  }

  const handleAddRow = () => {
    setRows((prevRows) => [createEmptyRow(), ...prevRows])
  }

  const handleDeleteRow = (rowId) => {
    rowDebounceMapRef.current.get(rowId)?.cancel?.()
    rowDebounceMapRef.current.delete(rowId)
    setRows((prevRows) => prevRows.filter((row) => row.id !== rowId))
    setSelectedRowKeys((keys) => keys.filter((key) => key !== rowId))
  }

  /**
   * 批量生成逻辑
   * 不要求后端提供 batch 接口，而是按用户要求逐行调用现有 POST /api/generate。
   * 某一行失败只会写入该行 failed，不会中断后续行。
   */
  const handleBatchGenerate = async () => {
    const targetRows = rows.filter((row) => selectedRowKeys.includes(row.id) && row.originalPrompt.trim())
    if (targetRows.length === 0) {
      message.warning('请先勾选至少一条有原始描述的记录')
      return
    }

    for (const row of targetRows) {
      updateRow(row.id, { status: STATUS.WAITING })
      await generateRow(row.id, { silent: true })
    }
    message.success('批量生成已完成')
  }

  const handleSearch = async (query = searchQuery) => {
    try {
      setLoadingSearch(true)
      const response = await searchImages(query)
      const nextRows = (response.images || []).map(mapImageToRow)
      setRows(nextRows.length > 0 ? nextRows : [createEmptyRow()])
      setSelectedRowKeys([])
      message.success(`找到 ${response.total || nextRows.length} 张图片`)
    } catch (error) {
      message.error(error?.response?.data?.detail || '搜索失败')
    } finally {
      setLoadingSearch(false)
    }
  }

  const loadImageLibrary = async (syncRemote = false) => {
    try {
      setLoadingSearch(true)
      const response = await listImages(syncRemote)
      const nextRows = (response.images || []).map(mapImageToRow)
      setRows(nextRows.length > 0 ? nextRows : [createEmptyRow()])
      setSelectedRowKeys([])
      if (syncRemote) {
        message.success(`同步完成，新增 ${response.synced || 0} 条远程图片记录`)
      }
    } catch (error) {
      message.error(error?.response?.data?.detail || '加载图片库失败')
    } finally {
      setLoadingSearch(false)
    }
  }

  const handleRefresh = () => {
    loadImageLibrary(true)
    setSearchQuery('')
  }

  /**
   * 下载逻辑
   * 使用 normalizeImageResponse 里的 downloadUrl，本质仍来自 getImageDownloadUrl(imageId)，继续请求后端下载接口。
   */
  const handleDownloadImage = (image) => {
    if (!image?.downloadUrl) return
    const link = document.createElement('a')
    link.href = image.downloadUrl
    link.download = `image-${image.id}.png`
    link.click()
  }

  const openImageDrawer = (image, row) => {
    setActiveImage(image)
    setActiveRow(row)
    setDrawerOpen(true)
  }

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    columnWidth: 42,
  }

  const columns = useMemo(
    () => [
      {
        title: '原始描述',
        dataIndex: 'originalPrompt',
        width: 260,
        render: (_, row) => (
          <EditableCell
            type="textarea"
            value={row.originalPrompt}
            placeholder="输入描述，10 秒后自动生成"
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => handlePromptChange(row.id, value)}
          />
        ),
      },
      {
        title: '描述扩充',
        dataIndex: 'description',
        width: 240,
        render: (_, row) => (
          <EditableCell
            type="textarea"
            value={row.description}
            placeholder="本地编辑扩充描述"
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => updateRow(row.id, { description: value })}
          />
        ),
      },
      {
        title: 'Keywords',
        dataIndex: 'keywords',
        width: 220,
        render: (_, row) => (
          <EditableCell
            type="tags"
            value={row.keywords}
            placeholder="输入关键词"
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => updateRow(row.id, { keywords: value })}
          />
        ),
      },
      {
        title: '数量',
        dataIndex: 'count',
        width: 88,
        render: (_, row) => (
          <InputNumber
            min={1}
            max={4}
            value={row.count}
            disabled={row.status === STATUS.GENERATING}
            onChange={(value) => updateRow(row.id, { count: value || 1 })}
            className="count-input"
          />
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 120,
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
        width: 220,
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
        title: '下载',
        dataIndex: 'downloadUrl',
        width: 92,
        render: (_, row) => (
          <Button
            size="small"
            icon={<DownloadOutlined />}
            disabled={!row.resultImages?.length}
            onClick={() => handleDownloadImage(row.resultImages[0])}
          >
            下载
          </Button>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 190,
        render: (_, row) => (
          <Space size={4} className="row-actions">
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
              <Button size="small" onClick={() => generateRow(row.id)} disabled={!row.originalPrompt.trim()}>
                重试
              </Button>
            </Tooltip>
            <Tooltip title="查看详情">
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!row.resultImages?.length}
                onClick={() => openImageDrawer(row.resultImages[0], row)}
              />
            </Tooltip>
            <Popconfirm title="删除这条记录？" okText="删除" cancelText="取消" onConfirm={() => handleDeleteRow(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [selectedRowKeys]
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
            批量生成
          </Button>
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
          <Button icon={<FilterOutlined />}>筛选</Button>
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
            <Text type="secondary">共 {rows.length} 条记录</Text>
            <Text type="secondary">已选择 {selectedRowKeys.length} 条</Text>
          </Space>
          <Space>
            <Tag color="blue">按行独立防抖</Tag>
            <Tag color="green">复用现有 API</Tag>
          </Space>
        </div>

        {viewMode === '表格视图' ? (
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={rows}
            rowSelection={rowSelection}
            pagination={false}
            scroll={{ x: 1500, y: 'calc(100vh - 260px)' }}
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
        onUploaded={() => handleSearch(searchQuery)}
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
