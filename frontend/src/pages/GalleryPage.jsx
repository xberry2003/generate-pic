import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Empty, Image, Input, Pagination, Row, Space, Spin, Tag, Typography, message } from 'antd'
import { DownloadOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { createDebouncedFunction } from '../services/debounce'
import { API_ORIGIN, getImageDownloadUrl, listImages, searchImages } from '../services/api'
import ImageDetailDrawer from '../components/ImageDetailDrawer'
import './GalleryPage.css'

const { Text } = Typography
/**
 * 把后端返回的图片字段统一成图库卡片需要的结构。
 * 数据流：数据库记录 -> 前端展示模型；卡片标题用简洁标题，副标题用描述扩充，图片地址仍然走后端 preview/download 接口。
 */
const normalizeGalleryImage = (image) => {
  const fileName = image.file_name || image.fileName || ''
  const title = image.prompt || image.title || image.description || fileName || image.cosKey || `image-${image.id}`
  const originalPrompt = image.originalPrompt || image.original_prompt || image.prompt || image.title || fileName.replace(/\.[^.]+$/, '') || ''
  const expandedPrompt = image.expandedPrompt || image.expanded_prompt || image.description || ''
  const previewPath = image.previewUrl || image.preview_url || image.url || `/api/images/${image.id}/preview`
  const previewUrl = previewPath.startsWith('http') ? previewPath : `${API_ORIGIN}${previewPath}`
  const downloadPath = image.downloadUrl || image.download_url || getImageDownloadUrl(image.id)
  const downloadUrl = downloadPath.startsWith('http') ? downloadPath : `${API_ORIGIN}${downloadPath}`

  return {
    ...image,
    title,
    originalPrompt,
    expandedPrompt,
    description: expandedPrompt,
    cardDescription: expandedPrompt || '-',
    file_name: fileName,
    created_at: image.created_at || image.lastModified,
    previewUrl,
    downloadUrl,
    keywordsText: Array.isArray(image.keywords) ? image.keywords.join(',') : image.keywords || '',
  }
}

/**
 * 图片库页面。
 * 职责：
 * 1. 首次进入时调用 GET /api/images?sync_remote=true，把服务器目录里的图片同步进数据库并展示。
 * 2. 用户输入搜索词时调用 GET /api/images/search，只在数据库里按描述、文件名、prompt、keywords 即时筛选。
 * 3. 点击“刷新全部”时再次同步 SFTP 目录，保证公司服务器新增文件也能进入图片库。
 */
function GalleryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeImage, setActiveImage] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
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
    // 首次进入图片库时同步一次服务器目录；之后搜索只查数据库，保证输入筛选速度更轻。
    loadImages({ syncRemote: true })
  }, [])

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

  const handleRefresh = () => {
    setSearchQuery('')
    debouncedSearchRef.current?.cancel?.()
    loadImages({ syncRemote: true, showToast: true })
  }

  const handleDownload = (image, event = null) => {
    event?.stopPropagation?.()
    const link = document.createElement('a')
    link.href = image.downloadUrl
    link.download = image.file_name || `image-${image.id}.png`
    link.click()
  }

  const openImageDrawer = (image) => {
    setActiveImage(image)
    setDrawerOpen(true)
  }

  const paginatedImages = useMemo(
    () => images.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [images, currentPage]
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
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} disabled={loading}>
                刷新全部
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
                    onClick={() => openImageDrawer(image)}
                    cover={
                      <div className="image-wrapper">
                        <Image
                          src={image.previewUrl}
                          alt={image.title}
                          className="gallery-image"
                          preview
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
                    ]}
                  >
                    <Card.Meta
                      title={<div className="image-title" title={image.title}>{image.title}</div>}
                      description={
                        <Space direction="vertical" style={{ width: '100%' }} size="small">
                          {image.keywordsText && (
                            <div className="keywords-section">
                              {image.keywordsText.split(',').filter(Boolean).map((keyword, idx) => (
                                <Tag key={`${keyword}-${idx}`} color="blue">
                                  {keyword.trim()}
                                </Tag>
                              ))}
                            </div>
                          )}
                          <Text type="secondary" className="gallery-description" title={image.cardDescription}>
                            {image.cardDescription}
                          </Text>
                          <div className="image-time" title={new Date(image.created_at).toLocaleString()}>
                            {image.created_at ? new Date(image.created_at).toLocaleString() : ''}
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
      <ImageDetailDrawer
        open={drawerOpen}
        image={activeImage}
        row={activeImage ? {
          originalPrompt: activeImage.originalPrompt,
          description: activeImage.expandedPrompt || activeImage.description,
          keywords: activeImage.keywordsText,
          createdAt: activeImage.created_at,
        } : null}
        onClose={() => setDrawerOpen(false)}
        onDownload={handleDownload}
      />
    </div>
  )
}

export default GalleryPage
