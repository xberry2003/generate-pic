import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Image, Input, Pagination, Spin, Typography, message } from 'antd'
import { CopyOutlined, DownloadOutlined, PictureOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { getImageDownloadUrl, listImages, searchImages } from './api'
import { copyText, getDownloadShareUrl, normalizeImageUrl } from './imageLinks'

const { Text } = Typography
const PAGE_SIZE = 40
const LOGIN_WITH_RETURN_URL = '/text2image/login?redirect=/gallery/'

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

const normalizeGalleryImage = (image) => {
  const fileName = image.file_name || image.fileName || ''
  const title = image.prompt || image.title || image.originalPrompt || image.description || fileName || image.cosKey || `image-${image.id}`
  const originalPrompt = image.originalPrompt || image.original_prompt || image.prompt || image.title || fileName.replace(/\.[^.]+$/, '') || ''
  const previewPath = image.previewUrl || image.preview_url || image.url || `/api/images/${image.id}/preview`
  const thumbnailPath = image.thumbnailUrl || image.thumbnail_url || previewPath
  const downloadPath = image.downloadUrl || image.download_url || getImageDownloadUrl(image.id)

  return {
    ...image,
    title,
    originalPrompt,
    cardDescription: originalPrompt || '-',
    fileName,
    createdAt: image.createdAt || image.created_at || image.lastModified || '',
    thumbnailUrl: normalizeImageUrl(thumbnailPath),
    previewUrl: normalizeImageUrl(previewPath),
    downloadUrl: normalizeImageUrl(downloadPath),
  }
}

function GalleryApp() {
  const [images, setImages] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const searchTimerRef = useRef(null)

  const setImageResponse = (response) => {
    setImages((response.images || []).map(normalizeGalleryImage))
    setCurrentPage(1)
  }

  const loadGallery = async ({ keyword = '', syncRemote = false } = {}) => {
    try {
      setLoading(true)
      setError('')
      const response = keyword.trim() ? await searchImages(keyword.trim()) : await listImages(syncRemote)
      setImageResponse(response)
    } catch (err) {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message || '图片库加载失败'
      if (status === 401) {
        setError('请先登录后访问 AI 图片库。')
      } else {
        setError(detail)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGallery({ syncRemote: true })
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  const handleQueryChange = (event) => {
    const value = event.target.value
    setQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      loadGallery({ keyword: value })
    }, 420)
  }

  const handleSearch = () => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    loadGallery({ keyword: query })
  }

  const handleRefresh = () => {
    setQuery('')
    loadGallery({ syncRemote: true })
  }

  const handleDownload = (image, event = null) => {
    event?.stopPropagation?.()
    const link = document.createElement('a')
    link.href = image.downloadUrl
    link.download = image.fileName || `${image.title || 'image'}.png`
    link.click()
  }

  const handleCopyLink = async (image, event = null) => {
    event?.stopPropagation?.()
    const link = getDownloadShareUrl(image)
    if (!link) {
      message.warning('暂无可复制的下载链接')
      return
    }
    try {
      await copyText(link)
      message.success('已复制下载链接')
    } catch {
      message.error('复制失败，请手动复制')
    }
  }

  const openPreview = (image) => {
    setPreviewUrl(image.previewUrl)
    setPreviewKey((key) => key + 1)
    setPreviewOpen(true)
  }

  const pagedImages = useMemo(
    () => images.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [images, currentPage]
  )

  const previewItems = useMemo(
    () => (previewUrl
      ? [previewUrl, ...images.map((image) => image.previewUrl).filter((url) => url && url !== previewUrl)]
      : images.map((image) => image.previewUrl).filter(Boolean)),
    [images, previewUrl]
  )

  return (
    <div className="gallery-app">
      <header className="gallery-header">
        <div className="brand-block">
          <span className="brand-icon"><PictureOutlined /></span>
          <div>
            <h1>AI图片库</h1>
            <p>统一素材检索、预览、下载与链接复制</p>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>
          刷新
        </Button>
      </header>

      <main className="gallery-main">
        <section className="toolbar">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            value={query}
            onChange={handleQueryChange}
            onPressEnter={handleSearch}
            placeholder="输入描述、文件名或素材关键词"
            className="search-input"
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>
            搜索
          </Button>
          <Text type="secondary" className="result-count">共 {images.length} 张图片</Text>
        </section>

        {error && (
          <Alert
            className="gallery-alert"
            type="warning"
            showIcon
            message={error}
            action={error.includes('登录') ? (
              <Button size="small" type="primary" href={LOGIN_WITH_RETURN_URL}>
                去登录
              </Button>
            ) : null}
          />
        )}

        {loading && (
          <div className="loading-wrap">
            <Spin tip="正在加载图片库..." size="large" />
          </div>
        )}

        {!loading && !error && images.length === 0 && (
          <Empty className="empty-state" description="暂无图片，换个关键词试试" />
        )}

        {!loading && !error && images.length > 0 && (
          <>
            <div className="image-grid">
              {pagedImages.map((image) => (
                <Card
                  key={`${image.id}-${image.cosKey || image.fileName}`}
                  hoverable
                  className="asset-card"
                  onClick={() => openPreview(image)}
                  cover={
                    <div className="asset-cover">
                      <Image
                        src={image.thumbnailUrl}
                        fallback={image.previewUrl}
                        alt={image.title}
                        preview={false}
                        loading="lazy"
                        className="asset-image"
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
                    title={<div className="asset-title" title={image.title}>{image.title}</div>}
                    description={
                      <div className="asset-meta">
                        <span title={image.cardDescription}>{image.cardDescription}</span>
                        <time>{formatChinaTime(image.createdAt)}</time>
                      </div>
                    }
                  />
                </Card>
              ))}
            </div>
            <div className="pagination-row">
              <Pagination
                current={currentPage}
                pageSize={PAGE_SIZE}
                total={images.length}
                showSizeChanger={false}
                onChange={setCurrentPage}
              />
            </div>
          </>
        )}
      </main>

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

export default GalleryApp
