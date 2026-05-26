import React from 'react'
import { Input, InputNumber, Select } from 'antd'

/**
 * 可编辑单元格组件
 * 职责：根据 type 渲染不同输入控件，并把变更统一回传给表格行状态。
 * 数据流：父组件把 value 传入；用户编辑后通过 onChange 返回新值；父组件再更新对应行。
 */
function EditableCell({
  type = 'text',
  value,
  placeholder,
  disabled,
  min,
  max,
  onChange,
  onPressEnter,
}) {
  if (type === 'textarea') {
    return (
      <Input.TextArea
        value={value}
        placeholder={placeholder}
        autoSize={{ minRows: 1, maxRows: 4 }}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onPressEnter={onPressEnter}
        className="editable-cell-textarea"
      />
    )
  }

  if (type === 'tags') {
    return (
      <Select
        mode="tags"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        tokenSeparators={[',', '，']}
        onChange={onChange}
        className="editable-cell-tags"
        suffixIcon={null}
      />
    )
  }

  if (type === 'number') {
    return (
      <InputNumber
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(nextValue) => onChange(nextValue || min || 1)}
        className="editable-cell-number"
      />
    )
  }

  return (
    <Input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onPressEnter={onPressEnter}
      className="editable-cell-input"
    />
  )
}

export default EditableCell
