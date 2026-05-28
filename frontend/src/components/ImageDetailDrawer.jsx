import React from 'react'
import { Button, Descriptions, Drawer, Image, Space, Tag, Typography, message } from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography

function splitKeywords(keywords) {
  if (Array.isArray(keywords)) return keywords.filter(Boolean)
  return String(keywords || '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
}

function ImageDetailDrawer({ open, image, row, onClose, onDownload }) {
  const fileName = image?.fileName || image?.file_name || row?.fileName || row?.file_name || ''
  const originalPrompt =
    image?.originalPrompt ||
    image?.original_prompt ||
    row?.originalPrompt ||
    image?.prompt ||
    row?.prompt ||
    image?.title ||
    ''
  const expandedPrompt =
    image?.expandedPrompt ||
    image?.expanded_prompt ||
    image?.description ||
    row?.expandedPrompt ||
    row?.description ||
    image?.metadata?.description ||
    ''
  const keywords = splitKeywords(row?.keywords || image?.keywords)

  const handleCopyDownloadUrl = async () => {
    if (!image?.downloadUrl) return
    await navigator.clipboard.writeText(image.downloadUrl)
    message.success('下载链接已复制')
  }

  return (
    <Drawer
      title="图片详情"
      placement="right"
      width={460}
      open={open}
      onClose={onClose}
      className="image-detail-drawer"
      extra={
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopyDownloadUrl} disabled={!image}>
            复制链接
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => onDownload?.(image)} disabled={!image}>
            下载
          </Button>
        </Space>
      }
    >
      {!image ? null : (
        <Space direction="vertical" size="large" className="drawer-content">
          <Image src={image.previewUrl || image.url} alt={originalPrompt} className="drawer-image" />

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="原始描述">
              <Paragraph className="drawer-paragraph">{originalPrompt}</Paragraph>
            </Descriptions.Item>
            <Descriptions.Item label="描述扩充">
              <Paragraph className="drawer-paragraph">{expandedPrompt}</Paragraph>
            </Descriptions.Item>
            <Descriptions.Item label="关键词">
              {keywords.length > 0 ? keywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{image.createdAt || row?.createdAt || '-'}</Descriptions.Item>
            <Descriptions.Item label="下载链接">
              <Text copyable ellipsis className="download-url-text">
                {image.downloadUrl}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Space>
      )}
    </Drawer>
  )
}

export default ImageDetailDrawer
