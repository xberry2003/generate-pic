import React, { useEffect, useState } from 'react'
import { Button, Layout, Menu, Spin } from 'antd'
import { AppstoreOutlined, FileImageOutlined, LogoutOutlined } from '@ant-design/icons'
import { AuthProvider, useAuth } from './context/AuthContext'
import BatchGenerateTablePage from './pages/BatchGenerateTablePage'
import GalleryPage from './pages/GalleryPage'
import LoginPage from './pages/LoginPage'
import './App.css'

/**
 * 主应用入口
 * 数据流说明：
 * - 默认展示新的多维表格工作台，用户可以在一张表里完成生成、搜索、上传、下载和详情查看。
 * - 经典生成页不再作为侧边栏入口展示；旧生成页路径进入时统一回到多维表格工作台。
 * - 页面切换只发生在前端状态 currentPage，不改变任何后端接口路径。
 */
function App() {
  const { authenticated, checkingAuth, logout, user } = useAuth()

  const pageFromLocation = () => {
    const route = `${window.location.pathname}${window.location.hash}`.toLowerCase()
    if (route.includes('gallery')) return 'gallery'
    return 'batch'
  }

  const redirectLegacyRoute = () => {
    const route = `${window.location.pathname}${window.location.hash}`.toLowerCase()
    if (route.includes('login')) return 'login'
    if (/(classic|single|generator|generate)/.test(route)) {
      window.history.replaceState(null, '', '/workspace')
      return 'batch'
    }
    return pageFromLocation()
  }

  const [currentPage, setCurrentPage] = useState(redirectLegacyRoute)

  useEffect(() => {
    const handlePopState = () => setCurrentPage(redirectLegacyRoute())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (checkingAuth) return
    const isLoginRoute = window.location.pathname.toLowerCase().includes('login')
    if (!authenticated && !isLoginRoute) {
      window.history.replaceState(null, '', '/login')
      setCurrentPage('login')
    }
    if (authenticated && isLoginRoute) {
      window.history.replaceState(null, '', '/workspace')
      setCurrentPage('batch')
    }
  }, [authenticated, checkingAuth])

  const menuItems = [
    {
      key: 'batch',
      icon: <AppstoreOutlined />,
      label: '多维表格工作台',
    },
    {
      key: 'gallery',
      icon: <FileImageOutlined />,
      label: '图片库',
    },
  ]

  const renderContent = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage />
      case 'batch':
        return <BatchGenerateTablePage />
      case 'gallery':
        return <GalleryPage />
      default:
        return <BatchGenerateTablePage />
    }
  }

  const handleMenuClick = (event) => {
    const nextPage = event.key
    window.history.pushState(null, '', nextPage === 'gallery' ? '/gallery' : '/workspace')
    setCurrentPage(nextPage)
  }

  const handleLogout = async () => {
    await logout()
    window.history.replaceState(null, '', '/login')
    setCurrentPage('login')
  }

  if (checkingAuth) {
    return (
      <div className="app-auth-loading">
        <Spin tip="正在校验登录状态..." />
      </div>
    )
  }

  if (!authenticated || currentPage === 'login') {
    return <LoginPage />
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <div className="app-brand">
          <span className="brand-mark">GP</span>
          <div>
            <div className="brand-title">文生图图片工作台</div>
            <div className="brand-subtitle">多维表格式批量生成与图库管理</div>
          </div>
        </div>
        <div className="app-user">
          <span>{user?.username || 'admin'}</span>
          <Button size="small" icon={<LogoutOutlined />} onClick={handleLogout}>
            退出登录
          </Button>
        </div>
      </Layout.Header>

      <Layout className="app-body">
        <Layout.Sider width={216} className="app-sider">
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            items={menuItems}
            onClick={handleMenuClick}
            className="app-menu"
          />
        </Layout.Sider>

        <Layout.Content className="app-content">{renderContent()}</Layout.Content>
      </Layout>
    </Layout>
  )
}

export default function AppRoot() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  )
}
