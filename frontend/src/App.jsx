import React, { useEffect, useState } from 'react'
import { Layout, Menu } from 'antd'
import { AppstoreOutlined, FileImageOutlined } from '@ant-design/icons'
import BatchGenerateTablePage from './pages/BatchGenerateTablePage'
import GalleryPage from './pages/GalleryPage'
import './App.css'

/**
 * 主应用入口
 * 数据流说明：
 * - 默认展示新的多维表格工作台，用户可以在一张表里完成生成、搜索、上传、下载和详情查看。
 * - 经典生成页不再作为侧边栏入口展示；旧生成页路径进入时统一回到多维表格工作台。
 * - 页面切换只发生在前端状态 currentPage，不改变任何后端接口路径。
 */
function App() {
  const pageFromLocation = () => {
    const route = `${window.location.pathname}${window.location.hash}`.toLowerCase()
    if (route.includes('gallery')) return 'gallery'
    return 'batch'
  }

  const redirectLegacyRoute = () => {
    const route = `${window.location.pathname}${window.location.hash}`.toLowerCase()
    if (/(classic|single|generator|generate)/.test(route)) {
      window.history.replaceState(null, '', '/')
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
    window.history.pushState(null, '', nextPage === 'gallery' ? '/gallery' : '/')
    setCurrentPage(nextPage)
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

export default App
