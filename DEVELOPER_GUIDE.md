# 开发者指南

本文档为想要扩展或修改项目的开发者提供指导。

## 🏗️ 项目架构

### 整体架构

```
┌─────────────────────┐         ┌──────────────────────┐
│                     │  HTTP   │                      │
│   前端 (React)      │◄───────►│   后端 (FastAPI)     │
│   Vite + Ant Design │  REST   │   SQLAlchemy + Psyco │
└─────────────────────┘         └──────────────────────┘
         │                               │
         │                               │
         └──────────┬────────────────────┘
                    │
              ┌─────▼────────┐
              │  SQLite/PG   │
              │  数据库       │
              └──────────────┘
```

### 数据流

```
用户输入
  ↓
[防抖处理] (debounce)
  ↓
[API 请求]
  ↓
[后端处理]
  ├─ 验证输入
  ├─ 调用生图 API
  ├─ 保存图片
  └─ 存储数据库
  ↓
[返回结果]
  ↓
[前端显示]
```

## 📂 文件结构详解

### 前端项目结构

```
frontend/
├── src/
│   ├── pages/                    # 页面组件
│   │   ├── GeneratePage.jsx      # 生成页面
│   │   ├── GeneratePage.css
│   │   ├── GalleryPage.jsx       # 图片库页面
│   │   └── GalleryPage.css
│   │
│   ├── components/               # 可复用组件（预留扩展）
│   │   └── [components 目录]
│   │
│   ├── services/                 # API 和工具函数
│   │   ├── api.js               # HTTP 客户端和 API 调用
│   │   └── debounce.js          # 防抖工具
│   │
│   ├── App.jsx                  # 主应用组件（导航和路由）
│   ├── App.css                  # 主应用样式
│   ├── main.jsx                 # 应用入口
│   ├── index.css                # 全局样式
│   │
│   ├── package.json             # NPM 依赖配置
│   ├── vite.config.js           # Vite 构建配置
│   └── index.html               # HTML 入口
│
└── .gitignore
```

### 后端项目结构

```
backend/
├── app/
│   ├── main.py                  # FastAPI 应用主入口
│   ├── database.py              # 数据库配置和会话管理
│   ├── models.py                # SQLAlchemy ORM 模型
│   │
│   ├── routes/                  # API 路由模块
│   │   ├── __init__.py
│   │   ├── generate.py          # POST /api/generate
│   │   ├── images.py            # GET /api/images/search, GET /api/images/{id}/download
│   │   └── upload.py            # POST /api/images/upload
│   │
│   ├── services/                # 业务逻辑服务
│   │   ├── __init__.py
│   │   └── image_generation_service.py  # 图片生成和保存逻辑
│   │
│   └── __init__.py
│
├── uploads/
│   └── images/                  # 图片存储目录
│
├── requirements.txt             # Python 依赖
├── .env                         # 环境变量配置
└── .gitignore
```

## 🔄 关键工作流

### 图片生成流程

```
1. 用户输入 prompt
   ↓
2. 前端监听输入变化 (handlePromptChange)
   ↓
3. 设置状态为 "waiting"
   ↓
4. 触发防抖函数
   ├─ 10秒内有新输入 → 重置防抖计时
   └─ 10秒无新输入 → 执行防抖回调
   ↓
5. 调用后端 POST /api/generate
   ↓
6. 后端处理：
   ├─ 验证 prompt
   ├─ 调用外部生图 API (call_image_generation_api)
   ├─ 保存图片文件 (save_image_file)
   └─ 存储数据库
   ↓
7. 返回生成结果
   ↓
8. 前端显示图片预览
```

### 图片搜索流程

```
1. 用户输入搜索关键词
   ↓
2. 点击"搜索"或按 Enter
   ↓
3. 调用后端 GET /api/images/search?query=xxx
   ↓
4. 后端处理：
   ├─ 构建 SQL 查询条件
   ├─ 执行模糊搜索
   ├─ 应用分页
   └─ 返回结果
   ↓
5. 前端显示搜索结果
```

## 🔧 如何扩展功能

### 添加新页面

1. 在 `frontend/src/pages/` 创建新文件：

```jsx
// frontend/src/pages/MyNewPage.jsx
import React from 'react'
import { Card, Button } from 'antd'

function MyNewPage() {
  return (
    <Card title="我的新页面">
      {/* 内容 */}
    </Card>
  )
}

export default MyNewPage
```

2. 在 `App.jsx` 中导入并添加菜单项：

```jsx
import MyNewPage from './pages/MyNewPage'

const menuItems = [
  // 其他菜单项
  {
    key: 'my-new-page',
    icon: <SomeIcon />,
    label: '我的新页面',
  },
]

const renderContent = () => {
  switch (currentPage) {
    // 其他 case
    case 'my-new-page':
      return <MyNewPage />
  }
}
```

### 添加新的 API 接口

1. 在 `backend/app/routes/` 创建新文件：

```python
# backend/app/routes/my_feature.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db

router = APIRouter()

@router.post("/my-endpoint")
async def my_endpoint(data: dict, db: Session = Depends(get_db)):
    """
    我的新接口描述
    """
    # 实现逻辑
    return {"message": "success"}
```

2. 在 `main.py` 中注册路由：

```python
from app.routes import my_feature

app.include_router(my_feature.router, prefix="/api")
```

3. 在前端调用新接口：

```javascript
// frontend/src/services/api.js
export const callMyEndpoint = async (data) => {
  const response = await apiClient.post('/my-endpoint', data)
  return response.data
}
```

### 修改数据库模型

1. 编辑 `backend/app/models.py`：

```python
from sqlalchemy import Column, String, Integer
from app.database import Base

class MyModel(Base):
    __tablename__ = "my_table"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(100))
```

2. 重新初始化数据库：

```python
# 自动创建新表
from app.database import init_db
init_db()
```

## 💾 数据库迁移

当修改数据库模型后，使用迁移工具（如 Alembic）管理数据库版本。

### 安装 Alembic

```bash
pip install alembic
alembic init alembic
```

### 创建迁移

```bash
alembic revision --autogenerate -m "Add new column"
alembic upgrade head
```

## 📝 代码风格指南

### Python 代码风格

遵循 PEP 8：

```python
# ✅ 正确的代码风格
def my_function(param1: str, param2: int) -> dict:
    """
    函数说明
    
    Args:
        param1: 参数说明
        param2: 参数说明
    
    Returns:
        返回值说明
    """
    result = {}
    return result

# ❌ 避免
def myFunction(param1,param2):
    return {"result":1}
```

### JavaScript/React 代码风格

```javascript
// ✅ 使用函数式组件和 Hooks
function MyComponent() {
  const [state, setState] = React.useState(null)
  
  return <div>{state}</div>
}

// ✅ 使用描述性的变量名
const handleSubmitForm = () => {}

// ❌ 避免使用 var
var x = 1

// ❌ 避免匿名函数
const onClick = () => {}
```

## 🧪 测试

### 后端单元测试

```python
# backend/tests/test_api.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_generate_image():
    response = client.post("/api/generate", json={
        "prompt": "test",
        "keywords": "",
        "count": 1
    })
    assert response.status_code == 200
    assert "images" in response.json()
```

运行测试：

```bash
pip install pytest
pytest backend/tests/
```

### 前端测试

使用 Vitest 或 Jest：

```bash
npm install --save-dev vitest
```

```javascript
// frontend/src/services/api.test.js
import { describe, it, expect, vi } from 'vitest'

describe('API Service', () => {
  it('should call generate API', async () => {
    // 测试代码
  })
})
```

## 🐛 调试技巧

### 后端调试

使用 Python 调试器：

```python
import pdb

# 在代码中设置断点
pdb.set_trace()

# 或使用 VS Code 调试器
# 在 .vscode/launch.json 中配置
```

### 前端调试

1. 使用浏览器开发者工具 (F12)
2. 使用 React DevTools
3. 在代码中使用 console.log()

```javascript
console.log('Debug:', variable)
console.error('Error:', error)
```

## 📊 性能优化

### 前端优化

1. **代码分割**：

```javascript
// 延迟加载组件
const GalleryPage = React.lazy(() => import('./pages/GalleryPage'))
```

2. **记忆化**：

```javascript
const memoized = React.useMemo(() => expensiveComputation(), [deps])
```

3. **虚拟列表**：用于长列表

```bash
npm install react-window
```

### 后端优化

1. **数据库索引**：

```python
class Image(Base):
    __tablename__ = "images"
    prompt = Column(String(500), index=True)  # 添加索引
```

2. **查询优化**：

```python
# 使用 select() 和 join()
from sqlalchemy import select

query = select(Image).where(Image.prompt.ilike('%cat%'))
```

3. **缓存**：

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def expensive_function(param):
    return result
```

## 📚 学习资源

### 前端
- [React 官方文档](https://react.dev/)
- [Ant Design 文档](https://ant.design/)
- [Vite 文档](https://vitejs.dev/)

### 后端
- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- [Pydantic 文档](https://docs.pydantic.dev/)

### 数据库
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
- [SQLite 文档](https://www.sqlite.org/docs.html)

## 🚀 贡献指南

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/my-feature`
3. 提交更改：`git commit -m 'Add my feature'`
4. 推送到分支：`git push origin feature/my-feature`
5. 提交 Pull Request

## 📞 联系和支持

- 提交 Issue 报告 bug
- 提交 Pull Request 贡献代码
- 查看代码注释了解细节

---

**祝你开发顺利！** 🚀
