import React, { useEffect, useState } from 'react'
import { Button, Layout, Menu, Spin } from 'antd'
import { AppstoreOutlined, FileImageOutlined, LogoutOutlined } from '@ant-design/icons'
import { AuthProvider, useAuth } from './context/AuthContext'
import BatchGenerateTablePage from './pages/BatchGenerateTablePage'
import GalleryPage from './pages/GalleryPage'
import LoginPage from './pages/LoginPage'
import { workspacePath } from './utils/workspacePaths'
import './App.css'

const DEV_BYPASS_AUTH = import.meta.env.DEV

function routeFromLocation() {
  const route = `${window.location.pathname}${window.location.hash}`.toLowerCase()
  if (DEV_BYPASS_AUTH && (route.includes('login') || route.includes('register') || route.includes('forgot-password'))) {
    window.history.replaceState(null, '', workspacePath('/workspace'))
    return 'batch'
  }
  if (route.includes('register')) return 'register'
  if (route.includes('forgot-password')) return 'forgot'
  if (route.includes('login')) return 'login'
  if (route.includes('gallery')) return 'gallery'
  if (/(classic|single|generator|generate)/.test(route)) {
    window.history.replaceState(null, '', workspacePath('/workspace'))
    return 'batch'
  }
  return 'batch'
}

function App() {
  const { authenticated, checkingAuth, logout, user } = useAuth()
  const [currentPage, setCurrentPage] = useState(routeFromLocation)

  useEffect(() => {
    const handlePopState = () => setCurrentPage(routeFromLocation())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return
    if (checkingAuth) return
    const authPages = ['login', 'register', 'forgot']
    if (!authenticated && !authPages.includes(currentPage)) {
      window.history.replaceState(null, '', workspacePath('/login'))
      setCurrentPage('login')
    }
    if (authenticated && authPages.includes(currentPage)) {
      window.history.replaceState(null, '', workspacePath('/workspace'))
      setCurrentPage('batch')
    }
  }, [authenticated, checkingAuth, currentPage])

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
        return <LoginPage mode="login" />
      case 'register':
        return <LoginPage mode="register" />
      case 'forgot':
        return <LoginPage mode="forgot" />
      case 'gallery':
        return <GalleryPage />
      case 'batch':
      default:
        return <BatchGenerateTablePage />
    }
  }

  const renderWorkspaceContent = () => (
    <>
      <div style={{ display: currentPage === 'batch' ? 'block' : 'none', height: '100%' }}>
        <BatchGenerateTablePage active={currentPage === 'batch'} />
      </div>
      <div style={{ display: currentPage === 'gallery' ? 'block' : 'none', height: '100%' }}>
        <GalleryPage active={currentPage === 'gallery'} />
      </div>
    </>
  )

  const handleMenuClick = (event) => {
    const nextPage = event.key
    const pathMap = {
      gallery: workspacePath('/gallery'),
      batch: workspacePath('/workspace'),
    }
    window.history.pushState(null, '', pathMap[nextPage] || workspacePath('/workspace'))
    setCurrentPage(nextPage)
    // Keep page navigation predictable: switching from a long workspace or a
    // later gallery page must always reveal the top of the next view.
    requestAnimationFrame(() => {
      document.querySelector('.app-content')?.scrollTo({ top: 0, behavior: 'smooth' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const handleLogout = async () => {
    await logout()
    window.history.replaceState(null, '', DEV_BYPASS_AUTH ? workspacePath('/workspace') : workspacePath('/login'))
    setCurrentPage(DEV_BYPASS_AUTH ? 'batch' : 'login')
  }

  if (!DEV_BYPASS_AUTH && checkingAuth) {
    return (
      <div className="app-auth-loading">
        <Spin tip="正在校验登录状态..." />
      </div>
    )
  }

  if (!DEV_BYPASS_AUTH && (!authenticated || ['login', 'register', 'forgot'].includes(currentPage))) {
    return renderContent()
  }

  return (
    <Layout className="app-shell">
      <Layout.Header className="app-header">
        <div className="app-brand">
          <span className="brand-mark">AI</span>
          <div>
            <div className="brand-title">文生图图片工作台</div>
            <div className="brand-subtitle">多维表格式批量生成与图库管理</div>
          </div>
        </div>
        <div className="app-user">
          <span>{user?.name || user?.username || '员工'}</span>
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

        <Layout.Content className="app-content">{renderWorkspaceContent()}</Layout.Content>
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
