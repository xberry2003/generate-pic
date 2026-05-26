import React, { useState } from 'react'
import { Layout, Menu } from 'antd'
import { PictureOutlined, FileImageOutlined } from '@ant-design/icons'
import GeneratePage from './pages/GeneratePage'
import GalleryPage from './pages/GalleryPage'
import './App.css'

// 主应用程序入口
function App() {
  // 当前选中的菜单项，用于切换页面
  const [currentPage, setCurrentPage] = useState('generate')

  // 菜单项配置
  const menuItems = [
    {
      key: 'generate',
      icon: <PictureOutlined />,
      label: '生成图片',
    },
    {
      key: 'gallery',
      icon: <FileImageOutlined />,
      label: '图片库',
    },
  ]

  // 处理菜单点击
  const handleMenuClick = (e) => {
    setCurrentPage(e.key)
  }

  // 根据当前页面渲染相应内容
  const renderContent = () => {
    switch (currentPage) {
      case 'generate':
        return <GeneratePage />
      case 'gallery':
        return <GalleryPage />
      default:
        return <GeneratePage />
    }
  }

  return (
    <Layout style={{ height: '100vh' }}>
      {/* 页面顶部导航栏 */}
      <Layout.Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
            🎨 文生图图片库
          </h1>
        </div>
      </Layout.Header>

      <Layout style={{ height: 'calc(100vh - 64px)' }}>
        {/* 左侧菜单栏 */}
        <Layout.Sider width={200} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            items={menuItems}
            onClick={handleMenuClick}
            style={{ height: '100%', borderRight: 'none' }}
          />
        </Layout.Sider>

        {/* 主内容区域 */}
        <Layout.Content style={{ padding: '24px', overflow: 'auto' }}>
          {renderContent()}
        </Layout.Content>
      </Layout>
    </Layout>
  )
}

export default App
