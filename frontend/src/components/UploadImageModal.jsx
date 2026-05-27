import React, { useState } from 'react'
import { Form, Input, Modal, Upload, message } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { uploadImage } from '../services/api'

const { Dragger } = Upload

/**
 * 图片上传弹窗
 * 职责：收集 file、prompt、keywords、description，并复用现有 uploadImage() 调用后端上传接口。
 * 接口约束：字段名由 services/api.js 中的 FormData 负责，保持 file/prompt/keywords/description 不变。
 */
function UploadImageModal({ open, onClose, onUploaded }) {
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)

  const resetModal = () => {
    form.resetFields()
    setFileList([])
    setUploading(false)
  }

  const handleCancel = () => {
    resetModal()
    onClose?.()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const file = fileList[0]?.originFileObj

    if (!file) {
      message.warning('请选择要上传的图片')
      return
    }

    try {
      setUploading(true)
      const response = await uploadImage(file, values.prompt || '', values.keywords || '', values.description || '')
      message.success('上传成功')
      resetModal()
      onUploaded?.(response.image || response)
      onClose?.()
    } catch (error) {
      message.error(error?.response?.data?.detail || '上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Modal
      title="上传图片"
      open={open}
      onOk={handleSubmit}
      onCancel={handleCancel}
      confirmLoading={uploading}
      okText="上传"
      cancelText="取消"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="upload-form">
        <Form.Item label="图片文件" required>
          <Dragger
            maxCount={1}
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            beforeUpload={() => false}
            fileList={fileList}
            onChange={({ fileList: nextFileList }) => setFileList(nextFileList)}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽图片到此处</p>
            <p className="ant-upload-hint">支持 PNG、JPG、GIF、WebP，上传后会刷新当前图片列表。</p>
          </Dragger>
        </Form.Item>

        <Form.Item
          name="prompt"
          label="原始描述"
          rules={[{ required: true, message: '请填写原始描述，用于生成规范文件名' }]}
        >
          <Input placeholder="例如：一朵向日葵" />
        </Form.Item>
        <Form.Item name="keywords" label="Keywords">
          <Input placeholder="关键词，可用逗号分隔" />
        </Form.Item>
        <Form.Item name="description" label="描述扩展">
          <Input.TextArea placeholder="可选；用于补充图片描述" autoSize={{ minRows: 3, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default UploadImageModal
