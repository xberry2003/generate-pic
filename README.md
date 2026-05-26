# 文生图图片库 Web 小工具

一个完整的前后端分离的文生图图片库应用，支持生成、上传、搜索和下载图片。

## 🎯 功能特性

### 核心功能
- **图片生成**：支持自然语言提示词生成图片，10 秒无输入自动生成，或手动点击按钮立即生成
- **防抖输入**：使用 debounce 防止过于频繁的生成请求
- **图片库**：展示所有生成或上传的图片，支持缩略图预览
- **关键词搜索**：支持按 prompt、keywords、description 进行模糊搜索
- **图片下载**：支持点击下载图片到本地
- **图片上传**：支持直接上传本地图片到图片库
- **状态显示**：实时显示生成过程中的状态（idle、waiting、generating、done、failed）

### 技术特性
- 前后端完全分离
- 支持 CORS 跨域资源共享
- SQLite 数据库存储，可扩展至 PostgreSQL
- RESTful API 设计，易于第三方集成
- 详细的中文代码注释

## 🛠️ 技术栈

### 前端
- **React** 18.2.0
- **Vite** 5.0.0（快速开发服务器和构建工具）
- **Ant Design** 5.10.0（企业级 UI 库）
- **Axios** 1.6.0（HTTP 客户端）
- **Lodash** 4.17.21（函数库，用于 debounce）

### 后端
- **FastAPI** 0.104.1（现代 Python Web 框架）
- **Uvicorn** 0.24.0（ASGI 服务器）
- **SQLAlchemy** 2.0.23（ORM 框架）
- **Pydantic** 2.5.0（数据验证）
- **Python-Multipart** 0.0.6（文件上传支持）
- **Pillow** 10.1.0（图片处理）

### 数据库
- **SQLite**（默认，适合开发和小规模应用）
- 可扩展至 PostgreSQL、MySQL 等

## 📁 项目结构

```
generate-pic/
├── frontend/                      # 前端项目（React + Vite）
│   ├── src/
│   │   ├── components/            # React 组件（预留扩展）
│   │   ├── pages/
│   │   │   ├── GeneratePage.jsx   # 生成页面
│   │   │   ├── GeneratePage.css
│   │   │   ├── GalleryPage.jsx    # 图片库页面
│   │   │   └── GalleryPage.css
│   │   ├── services/
│   │   │   ├── api.js            # API 调用服务
│   │   │   └── debounce.js       # 防抖工具
│   │   ├── App.jsx               # 主应用
│   │   ├── App.css
│   │   ├── main.jsx              # 入口文件
│   │   └── index.css             # 全局样式
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── backend/                       # 后端项目（FastAPI）
│   ├── app/
│   │   ├── main.py              # FastAPI 主应用
│   │   ├── database.py          # 数据库配置
│   │   ├── models.py            # SQLAlchemy 模型
│   │   ├── routes/
│   │   │   ├── generate.py      # 生图接口
│   │   │   ├── images.py        # 图片搜索、下载接口
│   │   │   └── upload.py        # 图片上传接口
│   │   └── services/
│   │       └── image_generation_service.py  # 图片生成服务
│   ├── uploads/
│   │   └── images/              # 图片存储目录
│   ├── requirements.txt          # Python 依赖
│   └── generate_pic.db          # SQLite 数据库（自动生成）
│
└── README.md                      # 项目文档
```

## 🚀 快速开始

### 前置要求
- Node.js 16+ (用于前端)
- Python 3.8+ (用于后端)
- npm 或 yarn (前端包管理)
- pip (Python 包管理)

### 1️⃣ 后端启动

```bash
# 进入后端目录
cd backend

# 创建虚拟环境（可选但推荐）
python -m venv venv

# 激活虚拟环境
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python -m app.main

# 或使用 uvicorn 直接启动
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

服务启动成功后，你会看到：
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

你可以访问 http://localhost:8000/docs 查看 API 文档。

### 2️⃣ 前端启动

```bash
# 进入前端目录
cd frontend

# 安装依赖
npm install
# 或使用 yarn
yarn install

# 启动开发服务器
npm run dev
# 或使用 yarn
yarn dev
```

服务启动成功后，你会看到：
```
  VITE v5.0.0  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

在浏览器中打开 http://localhost:5173/ 即可使用应用。

## 📡 API 接口文档

### 生图接口

#### POST /api/generate

生成图片接口。

**请求示例：**
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一只可爱的小猫坐在窗边，阳光洒落，温暖的色调",
    "keywords": "可爱,温暖,日光,插画风格",
    "count": 1
  }'
```

**请求参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| prompt | string | ✅ | 生图提示词，描述要生成的图片内容 |
| keywords | string | ❌ | 关键词，用逗号分隔，默认空 |
| count | integer | ❌ | 生成数量，1-4，默认 1 |

**响应示例（200 OK）：**
```json
{
  "message": "图片生成成功",
  "images": [
    {
      "id": 1,
      "prompt": "一只可爱的小猫坐在窗边，阳光洒落，温暖的色调",
      "keywords": "可爱,温暖,日光,插画风格",
      "preview_url": "/uploads/images/20240101_120000_abc12345.png",
      "created_at": "2024-01-01T12:00:00"
    }
  ]
}
```

### 搜索接口

#### GET /api/images/search

搜索图片库。

**请求示例：**
```bash
curl "http://localhost:8000/api/images/search?query=猫&skip=0&limit=10"
```

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | ❌ | 搜索关键词，可搜索 prompt、keywords、description，默认空 |
| skip | integer | ❌ | 分页偏移，默认 0 |
| limit | integer | ❌ | 分页限制，默认 50，最多 100 |

**响应示例（200 OK）：**
```json
{
  "message": "搜索成功",
  "total": 1,
  "images": [
    {
      "id": 1,
      "prompt": "一只可爱的小猫",
      "keywords": "可爱,宠物,温暖",
      "description": null,
      "preview_url": "/uploads/images/20240101_120000_abc12345.png",
      "download_url": "/api/images/1/download",
      "created_at": "2024-01-01T12:00:00"
    }
  ]
}
```

### 下载接口

#### GET /api/images/{image_id}/download

下载图片。

**请求示例：**
```bash
curl http://localhost:8000/api/images/1/download -O
```

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image_id | integer | ✅ | 图片 ID |

**响应：**
- 200 OK：返回图片文件
- 404 Not Found：图片不存在

### 上传接口

#### POST /api/images/upload

上传图片。

**请求示例：**
```bash
curl -X POST http://localhost:8000/api/images/upload \
  -F "file=@/path/to/image.png" \
  -F "prompt=我的图片描述" \
  -F "keywords=标签,关键词" \
  -F "description=详细描述"
```

**请求参数（multipart/form-data）：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | ✅ | 图片文件，支持 PNG、JPG、GIF、WebP |
| prompt | string | ❌ | 图片描述 |
| keywords | string | ❌ | 关键词，用逗号分隔 |
| description | string | ❌ | 详细描述 |

**响应示例（200 OK）：**
```json
{
  "id": 2,
  "preview_url": "/uploads/images/uploaded_image.png",
  "download_url": "/api/images/2/download",
  "message": "上传成功"
}
```

## ⚙️ 配置说明

### 后端配置

编辑 `backend/app/database.py` 可以配置数据库：

```python
# SQLite（默认）
DATABASE_URL = "sqlite:///./generate_pic.db"

# PostgreSQL
DATABASE_URL = "postgresql://user:password@localhost/generate_pic"

# MySQL
DATABASE_URL = "mysql+pymysql://user:password@localhost/generate_pic"
```

### 集成真实生图 API

编辑 `backend/app/services/image_generation_service.py` 中的 `call_image_generation_api` 函数：

```python
async def call_image_generation_api(prompt: str, keywords: str = "", count: int = 1):
    """
    调用真实的生图 API
    """
    import aiohttp
    import base64
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://your-api-endpoint.com/generate",
            json={
                "prompt": prompt,
                "keywords": keywords,
                "count": count
            },
            headers={"Authorization": "Bearer YOUR_API_KEY"}
        ) as resp:
            result = await resp.json()
            # 假设 API 返回 base64 编码的图片
            images = [
                base64.b64decode(img['data']) 
                for img in result['images']
            ]
            return images
```

## 🔌 API 可扩展性设计

搜索接口 `GET /api/images/search` 设计成通用 API，可供其他应用调用：

```javascript
// 示例：从其他应用调用
fetch('http://localhost:8000/api/images/search?query=风景')
  .then(res => res.json())
  .then(data => {
    console.log(`找到 ${data.total} 张图片`);
    data.images.forEach(img => {
      console.log(`${img.prompt} - ${img.download_url}`);
    });
  });
```

## 📝 使用示例

### 场景 1：生成图片并下载

1. 打开前端应用 http://localhost:5173/
2. 在"生成图片"页面的提示词框中输入描述
3. 等待 10 秒自动生成，或点击"立即生成"按钮
4. 生成完成后点击"下载"按钮下载图片

### 场景 2：搜索和浏览图片库

1. 切换到"图片库"页面
2. 在搜索框中输入关键词（如"猫"）
3. 点击"搜索"或按 Enter 查询
4. 点击图片卡片可预览大图
5. 点击"下载"按钮下载图片

### 场景 3：上传本地图片

虽然前端暂未实现上传界面，但可以通过 API 上传：

```bash
curl -X POST http://localhost:8000/api/images/upload \
  -F "file=@my_image.png" \
  -F "prompt=我的图片" \
  -F "keywords=风景,日落"
```

## 🔐 安全注意事项

1. **CORS 配置**：当前允许本地开发，生产环境应改为具体域名
2. **文件上传**：限制文件大小（50MB）和类型（PNG/JPG/GIF/WebP）
3. **数据库**：生产环境建议使用 PostgreSQL，并配置数据库密码
4. **API 密钥**：集成真实生图 API 时，使用环境变量存储密钥

## 📚 开发指南

### 添加新的 API 接口

1. 在 `backend/app/routes/` 下创建新路由文件
2. 使用 Pydantic 定义请求/响应模型
3. 在 `backend/app/main.py` 中注册路由

示例：
```python
# routes/new_feature.py
from fastapi import APIRouter
router = APIRouter()

@router.get("/new-endpoint")
async def new_endpoint():
    return {"message": "success"}

# main.py
app.include_router(new_feature.router, prefix="/api")
```

### 扩展前端功能

1. 创建新页面文件到 `frontend/src/pages/`
2. 在 `frontend/src/App.jsx` 中添加菜单项和路由
3. 使用 Ant Design 组件保持 UI 一致性

## 🐛 故障排查

### 后端错误：`ModuleNotFoundError: No module named 'fastapi'`
**解决方案**：确保已激活虚拟环境并运行 `pip install -r requirements.txt`

### 前端错误：`Cannot find module 'axios'`
**解决方案**：运行 `npm install` 安装前端依赖

### 跨域请求失败
**解决方案**：确保后端正确配置了 CORS，访问 http://localhost:8000/docs 验证

### 图片下载失败
**解决方案**：检查 `backend/uploads/images/` 目录是否存在且有读权限

## 🎓 学习资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [React 官方文档](https://react.dev/)
- [Ant Design 组件库](https://ant.design/)
- [SQLAlchemy ORM 教程](https://docs.sqlalchemy.org/)

## 📄 许可证

MIT License

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

## 📞 联系方式

有任何问题或建议，请提交 Issue。

---

**祝你使用愉快！** 🎉
