import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Image, Input, Pagination, Row, Space, Spin, Typography, message } from 'antd'
import { CopyOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { createDebouncedFunction } from '../services/debounce'
import { getImageDownloadUrl, listImages, searchImages } from '../services/api'
import { copyImageLink, getDownloadShareUrl, normalizeImageUrl } from '../utils/imageLinks'
import './GalleryPage.css'

const { Text } = Typography
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
  const [searchQuery, setSearchQuery] = useState('')
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12
  const debouncedSearchRef = useRef(null)

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

  const handleCopyLink = async (image, event = null) => {
    event?.stopPropagation?.()
    const link = getDownloadShareUrl(image)
    if (!link) {
      message.warning('请先上传图片后再复制下载链接')
      return
    }
    try {
      await copyImageLink(link)
      message.success('已复制下载链接')
    } catch {
      message.error('复制失败，请手动复制')
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
          <div className="search-section">
            <Space wrap>
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
                    onClick={() => openImagePreview(image)}
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
                      <Button
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={(event) => handleDownload(image, event)}
                      >
                        下载
                      </Button>,
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={(event) => handleCopyLink(image, event)}
                      >
                        复制链接
                      </Button>,
                    ]}
                  >
                    <Card.Meta
                      title={<div className="image-title" title={image.title}>{image.title}</div>}
                      description={
                        <Space direction="vertical" style={{ width: '100%' }} size="small">
                          <Text type="secondary" className="gallery-description" title={image.cardDescription}>
                            {image.cardDescription}
                          </Text>
                          <div className="image-time" title={formatChinaTime(image.created_at)}>
                            {formatChinaTime(image.created_at)}
                          </div>
                        </Space>
                      }
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
                onChange={setCurrentPage}
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
    </div>
  )
}

export default GalleryPage
