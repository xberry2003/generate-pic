import React from 'react'
import { LoadingOutlined } from '@ant-design/icons'
import { Tag } from 'antd'

// 表格任务状态的展示映射。这里不改变后端状态，只把前端内部状态翻译成用户可读的中文标签。
const STATUS_META = {
  idle: { color: 'default', text: '未开始' },
  waiting: { color: 'blue', text: '等待生成' },
  generating: { color: 'orange', text: '生成中' },
  done: { color: 'green', text: '已完成' },
  failed: { color: 'red', text: '失败' },
}

/**
 * 状态标签组件
 * 职责：统一渲染表格里的任务状态，避免各列重复写颜色、文案和 loading 图标逻辑。
 */
function StatusTag({ status }) {
  const meta = STATUS_META[status] || STATUS_META.idle

  return (
    <Tag color={meta.color} className="status-tag">
      {status === 'generating' && <LoadingOutlined className="status-loading-icon" />}
      {meta.text}
    </Tag>
  )
}

export default StatusTag
