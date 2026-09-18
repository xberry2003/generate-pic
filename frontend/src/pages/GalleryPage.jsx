import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Image, Input, Pagination, Row, Space, Spin, message, Modal, Tooltip } from 'antd'
import { CopyOutlined, DownloadOutlined, SearchOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons'
import { createDebouncedFunction } from '../services/debounce'
import { deleteImage, getImageDownloadUrl, listImages, renameImage, searchImages } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { normalizeImageUrl } from '../utils/imageLinks'
import { copyImageToClipboard } from '../utils/imageClipboard'
import './GalleryPage.css'

const shanghaiDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

const formatChinaTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return shanghaiDateFormatter.format(date).replace(/\//g, '-')
}

/**
 * 把后端返回的图片字段统一成图库卡片需要的结构。
 * 数据流：数据库记录 -> 前端展示模型；卡片标题用简洁标题，副标题用描述扩充，图片地址仍然走后端 preview/download 接口。
 */
const normalizeGalleryImage = (image) => {
  const fileName = image.file_name || image.fileName || ''
  const title = image.prompt || image.title || image.description || fileName || image.cosKey || `image-${image.id}`
  const originalPrompt = image.originalPrompt || image.original_prompt || image.prompt || image.title || fileName.replace(/\.[^.]+$/, '') || ''
  const previewPath = image.previewUrl || image.preview_url || image.url || `/api/images/${image.id}/preview`
  const previewUrl = normalizeImageUrl(previewPath)
  const thumbnailPath = image.thumbnailUrl || image.thumbnail_url || previewPath
  const thumbnailUrl = normalizeImageUrl(thumbnailPath)
  const downloadPath = image.downloadUrl || image.download_url || getImageDownloadUrl(image.id)
  const downloadUrl = normalizeImageUrl(downloadPath)

  return {
    ...image,
    title,
    originalPrompt,
    expandedPrompt: '',
    description: '',
    cardDescription: originalPrompt || '-',
    file_name: fileName,
    created_at: image.created_at || image.lastModified,
    thumbnailUrl,
    previewUrl,
    downloadUrl,
    keywordsText: '',
  }
}

/**
 * 图片库页面。
 * 职责：
 * 1. 首次进入时调用 GET /api/images?sync_remote=true，把服务器目录里的图片同步进数据库并展示。
 * 2. 用户输入搜索词时调用 GET /api/images/search，只在数据库里按描述、文件名、prompt、keywords 即时筛选。
 * 3. 每次进入图片库时自动同步服务器目录，保证公司服务器新增文件也能进入图片库。
 */
function GalleryPage({ active = false }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [searchQuery, setSearchQuery] = useState('')
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const pageSize = 12
  const debouncedSearchRef = useRef(null)
  const toolbarRef = useRef(null)

  const setImageResponse = (response) => {
    setImages((response.images || []).map(normalizeGalleryImage))
    setCurrentPage(1)
  }

  const loadImages = async ({ query = '', syncRemote = false, showToast = false } = {}) => {
    try {
      setLoading(true)
      setError(null)
      const response = query.trim()
        ? await searchImages(query, { syncRemote })
        : await listImages(syncRemote)

      setImageResponse(response)
      if (showToast) {
        const synced = response.synced || 0
        message.success(syncRemote ? `已刷新 COS 图片库，共 ${response.total || 0} 张` : '已刷新图片库')
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err.message || '加载图片失败，请稍后重试'
      setError(detail)
      message.error(detail)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!active) return
    setSearchQuery('')
    debouncedSearchRef.current?.cancel?.()
    loadImages({ syncRemote: true })
  }, [active])

  useEffect(() => {
    debouncedSearchRef.current = createDebouncedFunction((query) => {
      loadImages({ query })
    }, 500)

    return () => {
      debouncedSearchRef.current?.cancel?.()
    }
  }, [])

  const handleSearchChange = (event) => {
    const value = event.target.value
    setSearchQuery(value)
    debouncedSearchRef.current?.(value)
  }

  const handleSearch = () => {
    debouncedSearchRef.current?.cancel?.()
    loadImages({ query: searchQuery })
  }

  const handleDownload = (image, event = null) => {
    event?.stopPropagation?.()
    const link = document.createElement('a')
    link.href = image.downloadUrl
    link.download = image.file_name || `image-${image.id}.png`
    link.click()
  }

  const handleCopyImage = async (image, event = null) => {
    event?.stopPropagation?.()
    const hideLoading = message.loading('正在复制图片', 0)
    try {
      await copyImageToClipboard(normalizeImageUrl(image.previewUrl || image.preview_url || image.url || image.downloadUrl || image.download_url || ''))
      message.success('图片已复制，可直接粘贴到 PPT')
    } catch (error) {
      message.error(error.message || '复制图片失败，请查看控制台详细错误')
    } finally {
      hideLoading()
    }
  }

  const toggleSelected = (imageId, event) => {
    event?.stopPropagation?.()
    setSelectedIds((ids) => ids.includes(imageId) ? ids.filter((id) => id !== imageId) : [...ids, imageId])
  }

  const removeImages = (items) => {
    if (!items.length) return message.warning('请先选择图片')
    Modal.confirm({ title: `确认删除 ${items.length} 张图片？`, content: '删除后无法恢复。', okText: '删除', okButtonProps: { danger: true }, cancelText: '取消', onOk: async () => {
      await Promise.all(items.map((image) => deleteImage(image.id, { cosKey: image.cosKey, fileName: image.file_name })))
      const ids = new Set(items.map((image) => image.id))
      setImages((current) => current.filter((image) => !ids.has(image.id)))
      setSelectedIds([])
      message.success('图片已删除')
    } }).catch(() => message.error('删除失败'))
  }

  const openRename = (image, event) => {
    event?.stopPropagation?.()
    setRenameTarget(image)
    setRenameValue(image.title || '')
  }

  const handleRename = async () => {
    const name = renameValue.trim()
    if (!name) {
      message.warning('请输入图片名称')
      return
    }
    if (!renameTarget) return
    try {
      setRenaming(true)
      const response = await renameImage(renameTarget.id, name)
      setImages((current) => current.map((image) => (
        image.id === renameTarget.id
          ? normalizeGalleryImage({ ...image, ...(response.image || {}), title: name })
          : image
      )))
      setRenameTarget(null)
      message.success('图片名称已更新')
    } catch (err) {
      message.error(err?.response?.data?.detail || err.message || '修改名称失败')
    } finally {
      setRenaming(false)
    }
  }

  const openImagePreview = (image) => {
    setPreviewUrl(image.previewUrl)
    setPreviewKey((key) => key + 1)
    setPreviewOpen(true)
  }

  const paginatedImages = useMemo(
    () => images.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [images, currentPage]
  )

  const handlePageChange = (page) => {
    setCurrentPage(page)
    // scrollIntoView follows the actual scrolling ancestor, which is more
    // reliable than guessing between the app shell and browser document.
    requestAnimationFrame(() => {
      toolbarRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  const previewItems = useMemo(
    () => (previewUrl
      ? [previewUrl, ...images.map((image) => image.previewUrl).filter((url) => url && url !== previewUrl)]
      : images.map((image) => image.previewUrl).filter(Boolean)),
    [images, previewUrl]
  )

  return (
    <div className="gallery-page">
      <Card className="gallery-card" styles={{ body: { padding: 28 } }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div ref={toolbarRef} className="search-section gallery-toolbar">
            <Space wrap>
              {isAdmin && (!batchMode ? <Button danger icon={<CheckOutlined />} onClick={() => setBatchMode(true)}>批量操作</Button> : <><Button danger icon={<DeleteOutlined />} disabled={!selectedIds.length} onClick={() => removeImages(images.filter((image) => selectedIds.includes(image.id)))}>删除</Button><Button icon={<DownloadOutlined />} disabled={!selectedIds.length} onClick={() => selectedIds.forEach((id) => handleDownload(images.find((image) => image.id === id)))}>下载</Button><Button icon={<CloseOutlined />} onClick={() => { setBatchMode(false); setSelectedIds([]) }}>取消</Button></>)}
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="输入描述或文件名搜索服务器图片"
                value={searchQuery}
                onChange={handleSearchChange}
                onPressEnter={handleSearch}
                className="gallery-search-input"
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
                搜索
              </Button>
            </Space>
            <div className="gallery-count">
              共找到 {images.length} 张图片
            </div>
          </div>

          {error && (
            <Alert
              message="加载失败"
              description={error}
              type="error"
              closable
              onClose={() => setError(null)}
            />
          )}

          {loading && <Spin tip="正在加载服务器图片..." size="large" />}

          {!loading && paginatedImages.length > 0 && (
            <Row gutter={[20, 20]}>
              {paginatedImages.map((image) => (
                <Col key={image.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    hoverable
                    className="image-card"
                    onClick={(event) => batchMode ? toggleSelected(image.id, event) : openImagePreview(image)}
                    cover={
                      <div className="image-wrapper">
                        <Image
                          src={image.thumbnailUrl}
                          alt={image.title}
                          className="gallery-image"
                          preview={false}
                          loading="lazy"
                          fallback={image.previewUrl}
                        />
                      </div>
                    }
                    actions={[
                      <Tooltip title="下载" key="download">
                        <Button type="primary" size="small" icon={<DownloadOutlined />} onClick={(event) => handleDownload(image, event)} aria-label="下载" />
                      </Tooltip>,
                      <Tooltip title="复制图片" key="copy">
                        <Button size="small" icon={<CopyOutlined />} onClick={(event) => handleCopyImage(image, event)} aria-label="复制图片" />
                      </Tooltip>,
                      ...(isAdmin ? [
                        <Tooltip title="修改名称" key="rename">
                          <Button size="small" icon={<EditOutlined />} onClick={(event) => openRename(image, event)} aria-label="修改名称" />
                        </Tooltip>,
                        <Tooltip title="删除" key="delete">
                          <Button danger size="small" icon={<DeleteOutlined />} onClick={(event) => { event.stopPropagation(); removeImages([image]) }} aria-label="删除" />
                        </Tooltip>,
                      ] : []),
                    ]}
                  >
                    {isAdmin && batchMode && <button type="button" className={`image-select ${selectedIds.includes(image.id) ? 'selected' : ''}`} onClick={(event) => toggleSelected(image.id, event)} aria-label="选择图片">{selectedIds.includes(image.id) && <CheckOutlined />}</button>}
                    <Card.Meta
                      title={<div className="image-title" title={image.title}>{image.title}</div>}
                      description={<div className="image-time" title={formatChinaTime(image.created_at)}>{formatChinaTime(image.created_at)}</div>}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          {!loading && images.length === 0 && <Empty description="没有匹配的服务器图片" />}

          {!loading && images.length > pageSize && (
            <div className="pagination-row">
              <Pagination
                current={currentPage}
                pageSize={pageSize}
                total={images.length}
                onChange={handlePageChange}
                showSizeChanger={false}
              />
            </div>
          )}
        </Space>
      </Card>
      <Image.PreviewGroup
        key={previewKey}
        items={previewItems}
        preview={{
          visible: previewOpen,
          current: 0,
          onVisibleChange: (visible) => {
            setPreviewOpen(visible)
            if (!visible) setPreviewUrl('')
          },
        }}
      />
      <Modal
        title="修改图片名称"
        open={Boolean(renameTarget)}
        okText="保存"
        cancelText="取消"
        confirmLoading={renaming}
        onOk={handleRename}
        onCancel={() => !renaming && setRenameTarget(null)}
        destroyOnClose
      >
        <Input
          autoFocus
          maxLength={200}
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          onPressEnter={handleRename}
          placeholder="请输入图片名称"
        />
      </Modal>
    </div>
  )
}

export default GalleryPage
