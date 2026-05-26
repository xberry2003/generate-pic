import React, { useState } from 'react'
import { Layout, Menu } from 'antd'
import { AppstoreOutlined, FileImageOutlined, PictureOutlined } from '@ant-design/icons'
import BatchGenerateTablePage from './pages/BatchGenerateTablePage'
import GeneratePage from './pages/GeneratePage'
import GalleryPage from './pages/GalleryPage'
import './App.css'

/**
 * 主应用入口
 * 数据流说明：
 * - 默认展示新的多维表格工作台，用户可以在一张表里完成生成、搜索、上传、下载和详情查看。
 * - 原 GeneratePage、GalleryPage 仍保留在菜单中，避免删除旧功能导致已跑通代码不可访问。
 * - 页面切换只发生在前端状态 currentPage，不改变任何后端接口路径。
 */
function App() {
  const [currentPage, setCurrentPage] = useState('batch')

  const menuItems = [
    {
      key: 'batch',
      icon: <AppstoreOutlined />,
      label: '多维表格工作台',
    },
    {
      key: 'generate',
      icon: <PictureOutlined />,
      label: '经典生成页',
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
      case 'generate':
        return <GeneratePage />
      case 'gallery':
        return <GalleryPage />
      default:
        return <BatchGenerateTablePage />
    }
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
            onClick={(event) => setCurrentPage(event.key)}
            className="app-menu"
          />
        </Layout.Sider>

        <Layout.Content className="app-content">{renderContent()}</Layout.Content>
      </Layout>
    </Layout>
  )
}

export default App
