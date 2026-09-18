import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { IdcardOutlined, LockOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { workspacePath } from '../utils/workspacePaths'
import './LoginPage.css'

const { Text, Title } = Typography

function navigateTo(path) {
  window.history.replaceState(null, '', path)
  window.dispatchEvent(new Event('popstate'))
}

function getSafeRedirectPath() {
  const params = new URLSearchParams(window.location.search)
  const redirect = params.get('redirect') || ''
  if (!redirect.startsWith('/') || redirect.startsWith('//')) return ''
  return redirect
}

function navigateAfterLogin() {
  const redirect = getSafeRedirectPath()
  if (redirect) {
    window.location.href = redirect
    return
  }
  navigateTo(workspacePath('/workspace'))
}

function AuthLinks({ mode }) {
  if (mode === 'login') {
    return (
      <div className="login-links">
        <button type="button" onClick={() => navigateTo(workspacePath('/register'))}>没有密码？去注册</button>
        <button type="button" onClick={() => navigateTo(workspacePath('/forgot-password'))}>忘记密码？</button>
      </div>
    )
  }
  if (mode === 'register') {
    return (
      <div className="login-links">
        <button type="button" onClick={() => navigateTo(workspacePath('/login'))}>已有密码？去登录</button>
      </div>
    )
  }
  return (
    <div className="login-links">
      <button type="button" onClick={() => navigateTo(workspacePath('/login'))}>返回登录</button>
    </div>
  )
}

function LoginPage({ mode = 'login' }) {
  const { authenticated, forgotPassword, login, register } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (authenticated) navigateAfterLogin()
  }, [authenticated])

  const submitLogin = async (values) => {
    const user = await login(values.name, values.password)
    return user
  }

  const submitRegister = async (values) => {
    return register(values)
  }

  const submitForgot = async (values) => {
    await forgotPassword(values)
    setSuccess('密码已重置，请重新登录')
    setTimeout(() => navigateTo(workspacePath('/login')), 900)
  }

  const handleFinish = async (values) => {
    try {
      setLoading(true)
      setError('')
      setSuccess('')
      if (mode === 'register') {
        await submitRegister(values)
        navigateTo(workspacePath('/workspace'))
        return
      }
      if (mode === 'forgot') {
        await submitForgot(values)
        return
      }
      await submitLogin(values)
      navigateAfterLogin()
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || '操作失败'
      setError(message)
      if (err?.response?.data?.code === 'not_registered') {
        setTimeout(() => navigateTo(workspacePath('/register')), 900)
      }
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'register' ? '员工注册' : mode === 'forgot' ? '找回密码' : '员工登录'
  const buttonText = mode === 'register' ? '注册并登录' : mode === 'forgot' ? '重置密码' : '登录'

  return (
    <div className="login-page">
      <Card className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">AI</span>
          <div>
            <Title level={3} className="login-title">文生图图片工作台</Title>
            <Text type="secondary">多维表格式批量生成与图库管理</Text>
          </div>
        </div>

        <Title level={4} className="login-section-title">{title}</Title>
        {error && <Alert type="error" message={error} showIcon className="login-error" />}
        {success && <Alert type="success" message={success} showIcon className="login-error" />}

        <Form layout="vertical" onFinish={handleFinish} requiredMark={false}>
          <Form.Item label="账号（员工姓名）" name="name" rules={[{ required: true, message: '请输入员工姓名' }]}>
            <Input prefix={<UserOutlined />} placeholder="请输入员工姓名" autoComplete="username" size="large" />
          </Form.Item>

          {(mode === 'register' || mode === 'forgot') && (
            <Form.Item
              label="身份证号"
              name="idCard"
              rules={[
                { required: true, message: '请输入身份证号' },
                {
                  validator: (_, value) => {
                    if (!value || value.length === 15 || value.length === 18) return Promise.resolve()
                    return Promise.reject(new Error('身份证号位数不正确'))
                  },
                },
              ]}
            >
              <Input prefix={<IdcardOutlined />} placeholder="请输入身份证号" size="large" />
            </Form.Item>
          )}

          {mode === 'register' && (
            <Form.Item label="手机号" name="phone" rules={[{ required: true, message: '请输入手机号' }]}>
              <Input prefix={<PhoneOutlined />} placeholder="请输入手机号" size="large" />
            </Form.Item>
          )}

          <Form.Item
            label={mode === 'forgot' ? '新密码' : '密码'}
            name="password"
            rules={[{ required: true, message: mode === 'forgot' ? '请输入新密码' : '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={mode === 'forgot' ? '请输入新密码' : '请输入密码'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              size="large"
            />
          </Form.Item>

          {(mode === 'register' || mode === 'forgot') && (
            <Form.Item
              label={mode === 'forgot' ? '确认新密码' : '确认密码'}
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: mode === 'forgot' ? '请确认新密码' : '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve()
                    return Promise.reject(new Error(mode === 'forgot' ? '两次新密码不一致' : '两次密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="请再次输入密码" autoComplete="new-password" size="large" />
            </Form.Item>
          )}

          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            {buttonText}
          </Button>
        </Form>

        <AuthLinks mode={mode} />
      </Card>
    </div>
  )
}

export default LoginPage
