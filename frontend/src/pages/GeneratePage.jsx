import React, { useState, useRef, useEffect } from 'react'
import {
  Card,
  Input,
  Button,
  Space,
  Tag,
  Spin,
  Alert,
  Row,
  Col,
  Image,
  Empty,
  Divider,
  message,
  InputNumber,
  Statistic,
} from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { API_ORIGIN, generateImages, getImageDownloadUrl } from '../services/api'
import { createDebouncedFunction } from '../services/debounce'
import './GeneratePage.css'

// 生成状态枚举
const STATUS = {
  IDLE: 'idle',           // 空闲状态
  WAITING: 'waiting',     // 等待用户输入完成
  GENERATING: 'generating', // 正在生成中
  DONE: 'done',           // 生成完成
  FAILED: 'failed',       // 生成失败
}

/**
 * 生成页面组件
 * 主要功能：
 * 1. 用户输入 prompt 和 keywords
 * 2. 支持防抖自动生成（10 秒无输入则自动开始生成）
 * 3. 支持手动点击"立即生成"按钮
 * 4. 显示生成状态和结果
 */
function GeneratePage() {
  // prompt 输入框的值
  const [prompt, setPrompt] = useState('')
  
  // keywords 输入框的值，多个关键词用逗号分隔
  const [keywords, setKeywords] = useState('')
  
  // 生成图片数量
  const [count, setCount] = useState(1)
  
  // 当前生成状态（idle/waiting/generating/done/failed）
  const [status, setStatus] = useState(STATUS.IDLE)
  
  // 生成结果，存储图片信息
  const [result, setResult] = useState(null)
  
  // 错误消息
  const [error, setError] = useState(null)
  
  // 用于存储防抖函数，避免重复创建
  const debouncedGenerateRef = useRef(null)

  /**
   * 初始化防抖生成函数
   * 防抖延迟时间为 10 秒（10000ms）
   * 当用户停止输入 10 秒后自动触发生成
   */
  useEffect(() => {
    if (!debouncedGenerateRef.current) {
      debouncedGenerateRef.current = createDebouncedFunction(() => {
        // 只有在 prompt 不为空且不在生成中时才自动生成
        if (prompt.trim() && status !== STATUS.GENERATING) {
          handleGenerate()
        }
      }, 10000)
    }
  }, [])

  /**
   * 处理 prompt 输入变化
   * 用户每次输入都会触发防抖函数
   */
  const handlePromptChange = (e) => {
    const value = e.target.value
    setPrompt(value)
    
    // 设置为"等待"状态，表示正在等待生成
    if (value.trim()) {
      setStatus(STATUS.WAITING)
      setError(null)
      // 触发防抖函数
      debouncedGenerateRef.current()
    } else {
      setStatus(STATUS.IDLE)
    }
  }

  /**
   * 处理 keywords 输入变化
   */
  const handleKeywordsChange = (e) => {
    setKeywords(e.target.value)
  }

  /**
   * 处理生成图片操作
   * 调用后端 API 生成图片
   */
  const handleGenerate = async () => {
    // 检查 prompt 是否为空
    if (!prompt.trim()) {
      message.warning('请输入生成提示词')
      return
    }

    try {
      setStatus(STATUS.GENERATING)
      setError(null)

      // 调用后端 API 生成图片
      const response = await generateImages(prompt, keywords, count)

      // 生成成功，设置结果和状态
      setResult(response)
      setStatus(STATUS.DONE)
      message.success('图片生成成功！')
    } catch (err) {
      // 生成失败，设置错误信息
      setStatus(STATUS.FAILED)
      setError(err.message || '生成图片失败，请稍后重试')
      message.error('生成图片失败')
      console.error('生成错误:', err)
    }
  }

  /**
   * 处理立即生成按钮点击
   * 取消防抖，立即执行生成
   */
  const handleGenerateNow = () => {
    // 取消之前的防抖调用
    if (debouncedGenerateRef.current) {
      debouncedGenerateRef.current.cancel()
    }
    handleGenerate()
  }

  /**
   * 复制文本到剪贴板
   */
  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
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
  }

  return (
    <div className="generate-page">
      <Card title="🎨 生成图片" className="generate-card">
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Prompt 输入框 */}
          <div>
            <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              📝 生成提示词 (10 秒无输入将自动生成)
            </label>
            <Input.TextArea
              placeholder="请输入图片生成的详细描述，例如：一只可爱的小猫坐在窗边，阳光洒落，温暖的色调..."
              value={prompt}
              onChange={handlePromptChange}
              rows={4}
              disabled={status === STATUS.GENERATING}
              className="prompt-input"
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
              提示：输入越详细，生成的图片质量越好
            </div>
          </div>

          {/* Keywords 输入框 */}
          <div>
            <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              🏷️ 关键词 (可选，多个关键词用逗号分隔)
            </label>
            <Input
              placeholder="例如：可爱, 温暖, 日光, 插画风格"
              value={keywords}
              onChange={handleKeywordsChange}
              disabled={status === STATUS.GENERATING}
            />
          </div>

          {/* 生成数量选择 */}
          <div>
            <label style={{ fontWeight: 'bold', marginBottom: '8px', display: 'block' }}>
              🔢 生成图片数量
            </label>
            <InputNumber
              min={1}
              max={4}
              value={count}
              onChange={setCount}
              disabled={status === STATUS.GENERATING}
              style={{ width: '100%' }}
            />
          </div>

          {/* 生成状态显示 */}
          <div className="status-display">
            <Tag
              color={
                status === STATUS.IDLE ? 'default' :
                status === STATUS.WAITING ? 'processing' :
                status === STATUS.GENERATING ? 'processing' :
                status === STATUS.DONE ? 'success' :
                status === STATUS.FAILED ? 'error' :
                'default'
              }
            >
              {status === STATUS.IDLE && '📌 空闲'}
              {status === STATUS.WAITING && '⏳ 等待中...'}
              {status === STATUS.GENERATING && '🔄 正在生成...'}
              {status === STATUS.DONE && '✅ 生成完成'}
              {status === STATUS.FAILED && '❌ 生成失败'}
            </Tag>
          </div>

          {/* 错误信息提示 */}
          {error && (
            <Alert
              message="生成失败"
              description={error}
              type="error"
              closable
              onClose={() => setError(null)}
            />
          )}

          {/* 操作按钮 */}
          <Space>
            <Button
              type="primary"
              size="large"
              onClick={handleGenerateNow}
              loading={status === STATUS.GENERATING}
              disabled={status === STATUS.GENERATING || !prompt.trim()}
            >
              🚀 立即生成
            </Button>
            <Button
              onClick={() => {
                setPrompt('')
                setKeywords('')
                setStatus(STATUS.IDLE)
                setResult(null)
                setError(null)
                if (debouncedGenerateRef.current) {
                  debouncedGenerateRef.current.cancel()
                }
              }}
              disabled={status === STATUS.GENERATING}
            >
              🔄 重置
            </Button>
          </Space>

          {/* 显示生成中的加载动画 */}
          {status === STATUS.GENERATING && (
            <Spin tip="正在调用生图 API，请稍候..." size="large" />
          )}

          {/* 显示生成结果 */}
          {result && status === STATUS.DONE && (
            <>
              <Divider />
              <h3>🎯 生成结果</h3>
              
              {result.images && result.images.length > 0 ? (
                <Row gutter={[16, 16]}>
                  {result.images.map((image, index) => (
                    <Col key={index} xs={24} sm={12} md={8} lg={6}>
                      <Card
                        hoverable
                        cover={
                          <div className="image-preview">
                            <Image
                              src={`${API_ORIGIN}${image.previewUrl || image.preview_url}`}
                              alt={`Generated ${index + 1}`}
                              style={{ width: '100%', height: '200px', objectFit: 'cover' }}
                              preview
                            />
                          </div>
                        }
                        actions={[
                          <Button
                            type="primary"
                            size="small"
                            icon={<DownloadOutlined />}
                            onClick={() => handleDownload(image.id, `generated-${image.id}.png`)}
                          >
                            下载
                          </Button>,
                        ]}
                      >
                        <Card.Meta
                          title={`图片 #${index + 1}`}
                          description={
                            <Space direction="vertical" style={{ width: '100%' }} size="small">
                              <div style={{ fontSize: '12px', color: '#666' }}>
                                {new Date(image.created_at).toLocaleString()}
                              </div>
                            </Space>
                          }
                        />
                      </Card>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty description="暂无生成结果" />
              )}
            </>
          )}
        </Space>
      </Card>
    </div>
  )
}

export default GeneratePage
