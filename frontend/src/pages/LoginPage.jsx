import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import './LoginPage.css'

const { Text, Title } = Typography

function LoginPage() {
  const { authenticated, login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authenticated) {
      window.history.replaceState(null, '', '/workspace')
      window.dispatchEvent(new Event('popstate'))
    }
  }, [authenticated])

  const handleFinish = async (values) => {
    try {
      setLoading(true)
      setError('')
      await login(values.username, values.password)
      window.history.replaceState(null, '', '/workspace')
      window.dispatchEvent(new Event('popstate'))
    } catch (err) {
      if (err?.response?.status === 401) {
        setError('用户名或密码错误')
      } else {
        setError('无法连接后端服务，请确认后端已启动')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">GP</span>
          <div>
            <Title level={3} className="login-title">文生图图片工作台</Title>
            <Text type="secondary">多维表格式批量生成与图库管理</Text>
          </div>
        </div>

        {error && <Alert type="error" message={error} showIcon className="login-error" />}

        <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" size="large" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}

export default LoginPage
