import React from 'react'
import { Button, Descriptions, Drawer, Image, Space, Tag, Typography, message } from 'antd'
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography

/**
 * 图片详情抽屉
 * 职责：展示用户在表格缩略图或图库卡片中选中的图片详情。
 * 接口约束：下载按钮使用传入的 downloadUrl，该值由现有 getImageDownloadUrl(imageId) 生成，继续走后端下载接口。
 */
function ImageDetailDrawer({ open, image, row, onClose, onDownload }) {
  const keywords = row?.keywords || []

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
          <Image src={image.previewUrl || image.url} alt={row?.originalPrompt || '图片预览'} className="drawer-image" />

          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="原始描述">
              <Paragraph className="drawer-paragraph">{row?.originalPrompt || '-'}</Paragraph>
            </Descriptions.Item>
            <Descriptions.Item label="描述扩充">
              <Paragraph className="drawer-paragraph">{row?.description || '-'}</Paragraph>
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
