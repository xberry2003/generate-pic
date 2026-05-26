import React, { useState, useEffect } from 'react'
import {
  Card,
  Input,
  Button,
  Space,
  Spin,
  Alert,
  Row,
  Col,
  Image,
  Empty,
  Pagination,
  Tag,
  message,
  Modal,
  Divider,
} from 'antd'
import { SearchOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { searchImages, getImageDownloadUrl } from '../services/api'
import './GalleryPage.css'

/**
 * 图片库页面组件
 * 主要功能：
 * 1. 展示图片缩略图、prompt、keywords、创建时间
 * 2. 支持按关键词搜索
 * 3. 支持点击下载图片
 * 4. 分页展示
 */
function GalleryPage() {
  // 搜索关键词
  const [searchQuery, setSearchQuery] = useState('')
  
  // 图片列表数据
  const [images, setImages] = useState([])
  
  // 是否正在加载
  const [loading, setLoading] = useState(false)
  
  // 错误信息
  const [error, setError] = useState(null)
  
  // 当前分页的页码
  const [currentPage, setCurrentPage] = useState(1)
  
  // 每页显示的图片数量
  const pageSize = 12

  /**
   * 加载图片列表
   * 根据搜索关键词从后端获取图片
   */
  const loadImages = async (query = '') => {
    try {
      setLoading(true)
      setError(null)
      
      // 调用后端 API 搜索图片
      const response = await searchImages(query)
      
      // 将获取的图片数据存储到状态中
      setImages(response.images || [])
      setCurrentPage(1) // 搜索后重置到第一页
    } catch (err) {
      setError(err.message || '加载图片失败，请稍后重试')
      console.error('加载错误:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * 组件挂载时加载所有图片
   */
  useEffect(() => {
    loadImages()
  }, [])

  /**
   * 处理搜索按钮点击
   * 使用搜索关键词查询图片
   */
  const handleSearch = () => {
    loadImages(searchQuery)
  }

  /**
   * 处理回车键搜索
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  /**
   * 处理刷新按钮点击
   * 清空搜索条件，加载所有图片
   */
  const handleRefresh = () => {
    setSearchQuery('')
    loadImages('')
  }

  /**
   * 处理下载图片
   */
  const handleDownload = (imageId, fileName) => {
    const url = getImageDownloadUrl(imageId)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || `image-${imageId}.png`
    link.click()
    message.success('开始下载...')
  }

  /**
   * 计算分页数据
   * 根据当前页码和每页数量获取该页的图片数据
   */
  const paginatedImages = images.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  return (
    <div className="gallery-page">
      <Card title="🖼️ 图片库" className="gallery-card">
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 搜索区域 */}
          <div className="search-section">
            <Space>
              <Input
                placeholder="输入关键词搜索图片（可搜索 prompt、keywords、描述）"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ width: '300px' }}
                allowClear
              />
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                loading={loading}
              >
                搜索
              </Button>
              <Button onClick={handleRefresh} disabled={loading}>
                🔄 刷新全部
              </Button>
            </Space>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
              共找到 {images.length} 张图片
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <Alert
              message="加载失败"
              description={error}
              type="error"
              closable
              onClose={() => setError(null)}
            />
          )}

          {/* 加载动画 */}
          {loading && <Spin tip="正在加载图片..." size="large" />}

          {/* 图片网格展示 */}
          {!loading && paginatedImages.length > 0 && (
            <Row gutter={[16, 16]}>
              {paginatedImages.map((image) => (
                <Col key={image.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    hoverable
                    className="image-card"
                    cover={
                      <div className="image-wrapper">
                        <Image
                          src={`http://localhost:8000${image.preview_url}`}
                          alt={image.prompt}
                          style={{
                            width: '100%',
                            height: '200px',
                            objectFit: 'cover',
                          }}
                          preview
                        />
                      </div>
                    }
                    actions={[
                      <Button
                        type="primary"
                        size="small"
                        icon={<DownloadOutlined />}
                        onClick={() => handleDownload(image.id, `image-${image.id}.png`)}
                      >
                        下载
                      </Button>,
                    ]}
                  >
                    <Card.Meta
                      title={
                        <div className="image-title">
                          {image.prompt.substring(0, 30)}
                          {image.prompt.length > 30 ? '...' : ''}
                        </div>
                      }
                      description={
                        <Space direction="vertical" style={{ width: '100%' }} size="small">
                          {image.keywords && (
                            <div className="keywords-section">
                              {image.keywords.split(',').map((keyword, idx) => (
                                <Tag key={idx} color="blue" style={{ marginBottom: '4px' }}>
                                  {keyword.trim()}
                                </Tag>
                              ))}
                            </div>
                          )}
                          <div className="image-time" title={new Date(image.created_at).toLocaleString()}>
                            {new Date(image.created_at).toLocaleString()}
                          </div>
                        </Space>
                      }
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}

          {/* 空状态 */}
          {!loading && images.length === 0 && <Empty description="还没有图片，请先生成或上传图片" />}

          {/* 分页控件 */}
          {!loading && images.length > pageSize && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
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
    </div>
  )
}

export default GalleryPage
