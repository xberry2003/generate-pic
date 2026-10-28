import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Empty, Image, Input, Modal, Pagination, Spin, Tooltip, Typography, message } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  InboxOutlined,
  PictureOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { deleteImage, getCurrentUser, getImageDownloadUrl, listImages, renameImage, searchImages, uploadGalleryImage } from './api'
import { normalizeImageUrl } from './imageLinks'
import { copyImageToClipboard } from './imageClipboard'
import { getApiErrorMessage } from './apiErrors'

const { Text } = Typography
const PAGE_SIZE = 40
const LOGIN_WITH_RETURN_URL = '/text2image/login?redirect=/gallery/'

const normalizeGalleryImage = (image) => {
  const fileName = image.file_name || image.fileName || ''
  const title = image.title || image.prompt || image.originalPrompt || image.description || fileName || image.cosKey || `image-${image.id}`
  const previewPath = image.previewUrl || image.preview_url || image.url || `/api/images/${image.id}/preview`
  const thumbnailPath = image.thumbnailUrl || image.thumbnail_url || previewPath
  const downloadPath = image.downloadUrl || image.download_url || getImageDownloadUrl(image.id)

  return {
    ...image,
    title,
    fileName,
    thumbnailUrl: normalizeImageUrl(thumbnailPath),
    previewUrl: normalizeImageUrl(previewPath),
    downloadUrl: normalizeImageUrl(downloadPath),
  }
}

function GalleryApp() {
  const [user, setUser] = useState(null)
  const [images, setImages] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewKey, setPreviewKey] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const searchTimerRef = useRef(null)
  const uploadInputRef = useRef(null)
  const isAdmin = user?.role === 'admin'

  const setImageResponse = (response) => {
    const nextImages = (response.images || []).map(normalizeGalleryImage)
    setImages(nextImages)
    setSelectedIds((selected) => selected.filter((id) => nextImages.some((image) => image.id === id)))
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
    let active = true
    getCurrentUser()
      .then((response) => {
        if (active && response.authenticated) setUser(response.user)
      })
      .catch(() => {
        if (active) setUser(null)
      })
    loadGallery({ syncRemote: true })
    return () => {
      active = false
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

  const handlePageChange = (page) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDownload = (image, event = null) => {
    event?.stopPropagation?.()
    const link = document.createElement('a')
    link.href = image.downloadUrl
    link.download = image.fileName || `${image.title || 'image'}.png`
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
    setSelectedIds((selected) => (
      selected.includes(imageId)
        ? selected.filter((id) => id !== imageId)
        : [...selected, imageId]
    ))
  }

  const removeImages = (items) => {
    if (!items.length) {
      message.warning('请先选择图片')
      return
    }
    Modal.confirm({
      title: `确认删除 ${items.length} 张图片？`,
      content: '删除后无法恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await Promise.all(items.map((image) => deleteImage(image.id, {
            cosKey: image.cosKey,
            fileName: image.fileName,
          })))
          const removedIds = new Set(items.map((image) => image.id))
          setImages((current) => current.filter((image) => !removedIds.has(image.id)))
          setSelectedIds([])
          message.success(items.length === 1 ? '图片已删除' : `已删除 ${items.length} 张图片`)
        } catch (err) {
          const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message || '删除失败'
          message.error(detail)
          throw err
        }
      },
    }).catch(() => {})
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
      const response = await renameImage(renameTarget.id, name, renameTarget.cosKey || '')
      setImages((current) => current.map((image) => (
        image.id === renameTarget.id
          ? normalizeGalleryImage({ ...image, ...(response.image || {}), title: name })
          : image
      )))
      setRenameTarget(null)
      message.success('图片名称已更新')
    } catch (err) {
      console.error('修改图片名称失败:', err)
      message.error(getApiErrorMessage(err, '修改名称失败'))
    } finally {
      setRenaming(false)
    }
  }

  const handleUploadButtonClick = () => {
    uploadInputRef.current?.click?.()
  }

  const handleUploadFileChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      setUploading(true)
      const response = await uploadGalleryImage(file)
      message.success('图片已上传到图库')
      await loadGallery({ syncRemote: true })
      const preview = response?.image?.previewUrl || response?.image?.preview_url || ''
      if (preview) {
        setPreviewUrl(normalizeImageUrl(preview))
        setPreviewKey((key) => key + 1)
        setPreviewOpen(true)
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message || '上传失败'
      message.error(detail)
    } finally {
      setUploading(false)
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
    () =>
      previewUrl
        ? [previewUrl, ...images.map((image) => image.previewUrl).filter((url) => url && url !== previewUrl)]
        : images.map((image) => image.previewUrl).filter(Boolean),
    [images, previewUrl]
  )

  return (
    <div className="gallery-app">
      <header className="gallery-header">
        <div className="brand-block">
          <span className="brand-icon">
            <PictureOutlined />
          </span>
          <div>
            <h1>AI图片库</h1>
            <p>统一素材检索、预览、下载与链接复制</p>
          </div>
        </div>
        <div className="gallery-actions">
          {isAdmin && (!batchMode ? (
            <Button danger icon={<CheckOutlined />} onClick={() => setBatchMode(true)}>
              批量操作
            </Button>
          ) : (
            <>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!selectedIds.length}
                onClick={() => removeImages(images.filter((image) => selectedIds.includes(image.id)))}
              >
                删除
              </Button>
              <Button
                icon={<DownloadOutlined />}
                disabled={!selectedIds.length}
                onClick={() => selectedIds.forEach((id) => {
                  const image = images.find((item) => item.id === id)
                  if (image) handleDownload(image)
                })}
              >
                下载
              </Button>
              <Button icon={<CloseOutlined />} onClick={() => { setBatchMode(false); setSelectedIds([]) }}>
                取消
              </Button>
            </>
          ))}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="gallery-hidden-input"
            onChange={handleUploadFileChange}
          />
          <Button icon={<InboxOutlined />} onClick={handleUploadButtonClick} loading={uploading}>
            上传图片
          </Button>
          <Button icon={<AppstoreOutlined />} href="/text2image/workspace">
            生成图片
          </Button>
        </div>
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
          <Text type="secondary" className="result-count">
            共 {images.length} 张图片
          </Text>
        </section>

        {error && (
          <Alert
            className="gallery-alert"
            type="warning"
            showIcon
            message={error}
            action={
              error.includes('登录') ? (
                <Button size="small" type="primary" href={LOGIN_WITH_RETURN_URL}>
                  去登录
                </Button>
              ) : null
            }
          />
        )}

        {loading && (
          <div className="loading-wrap">
            <Spin tip="正在加载图片库..." size="large" />
          </div>
        )}

        {!loading && !error && images.length === 0 && (
          <Empty className="empty-state" description="暂无图片，试试搜索关键词或上传一张图片" />
        )}

        {!loading && !error && images.length > 0 && (
          <>
            <div className="image-grid">
              {pagedImages.map((image) => (
                <Card
                  key={`${image.id}-${image.cosKey || image.fileName}`}
                  hoverable
                  className="asset-card"
                  onClick={(event) => (batchMode ? toggleSelected(image.id, event) : openPreview(image))}
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
                        <Button danger size="small" icon={<DeleteOutlined />} onClick={(event) => {
                          event.stopPropagation()
                          removeImages([image])
                        }} aria-label="删除" />
                      </Tooltip>,
                    ] : []),
                  ]}
                >
                  {isAdmin && batchMode && (
                    <button
                      type="button"
                      className={`image-select ${selectedIds.includes(image.id) ? 'selected' : ''}`}
                      onClick={(event) => toggleSelected(image.id, event)}
                      aria-label="选择图片"
                    >
                      {selectedIds.includes(image.id) && <CheckOutlined />}
                    </button>
                  )}
                  <Card.Meta
                    title={<div className="asset-title" title={image.title}>{image.title}</div>}
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
                onChange={handlePageChange}
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

export default GalleryApp
