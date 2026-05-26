# API 接口参考

本文档详细列出所有可用的 API 接口。

## 基础信息

- **基础 URL**：`http://localhost:8000`
- **API 前缀**：`/api`
- **请求格式**：JSON（除了文件上传使用 multipart/form-data）
- **响应格式**：JSON

## 🔄 健康检查

### GET /health

检查服务是否正常运行。

**请求：**
```bash
curl http://localhost:8000/health
```

**响应：**
```json
{
  "status": "healthy"
}
```

## 🎨 生图接口

### POST /api/generate

生成图片。

**请求头：**
```
Content-Type: application/json
```

**请求体：**
```json
{
  "prompt": "一只可爱的小猫坐在窗边",
  "keywords": "可爱,温暖,插画",
  "count": 1
}
```

**请求参数说明：**
| 参数 | 类型 | 必填 | 范围 | 说明 |
|------|------|------|------|------|
| prompt | string | ✅ | 1-500 字符 | 生图提示词 |
| keywords | string | ❌ | 0-255 字符 | 关键词，逗号分隔 |
| count | integer | ❌ | 1-4 | 生成数量 |

**成功响应 (200)：**
```json
{
  "message": "图片生成成功",
  "images": [
    {
      "id": 1,
      "prompt": "一只可爱的小猫坐在窗边",
      "keywords": "可爱,温暖,插画",
      "preview_url": "/uploads/images/20240101_120000_abc12345.png",
      "created_at": "2024-01-01T12:00:00"
    }
  ]
}
```

**错误响应 (400)：**
```json
{
  "detail": "prompt 不能为空"
}
```

**错误响应 (500)：**
```json
{
  "detail": "生成图片失败: 错误信息"
}
```

**cURL 示例：**
```bash
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一只可爱的小猫",
    "keywords": "可爱,宠物",
    "count": 1
  }'
```

**Python 示例：**
```python
import requests

response = requests.post(
    "http://localhost:8000/api/generate",
    json={
        "prompt": "一只可爱的小猫",
        "keywords": "可爱,宠物",
        "count": 1
    }
)
print(response.json())
```

**JavaScript 示例：**
```javascript
fetch('http://localhost:8000/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    prompt: '一只可爱的小猫',
    keywords: '可爱,宠物',
    count: 1
  })
})
.then(res => res.json())
.then(data => console.log(data))
```

## 🔍 搜索接口

### GET /api/images/search

搜索图片库。

**请求参数：**
| 参数 | 类型 | 必填 | 范围 | 说明 |
|------|------|------|------|------|
| query | string | ❌ | - | 搜索关键词 |
| skip | integer | ❌ | ≥0 | 分页偏移，默认 0 |
| limit | integer | ❌ | 1-100 | 每页数量，默认 50 |

**成功响应 (200)：**
```json
{
  "message": "搜索成功",
  "total": 10,
  "images": [
    {
      "id": 1,
      "prompt": "一只可爱的小猫",
      "keywords": "可爱,宠物,温暖",
      "description": "生成的图片",
      "preview_url": "/uploads/images/20240101_120000_abc12345.png",
      "download_url": "/api/images/1/download",
      "created_at": "2024-01-01T12:00:00"
    }
  ]
}
```

**cURL 示例：**
```bash
# 搜索所有图片
curl "http://localhost:8000/api/images/search"

# 搜索关键词"猫"
curl "http://localhost:8000/api/images/search?query=猫"

# 分页搜索：第 2 页，每页 10 条
curl "http://localhost:8000/api/images/search?query=猫&skip=10&limit=10"
```

## 📥 上传接口

### POST /api/images/upload

上传图片文件。

**请求头：**
```
Content-Type: multipart/form-data
```

**请求参数（form-data）：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | file | ✅ | 图片文件 (PNG/JPG/GIF/WebP) |
| prompt | string | ❌ | 图片描述 |
| keywords | string | ❌ | 关键词，逗号分隔 |
| description | string | ❌ | 详细描述 |

**成功响应 (200)：**
```json
{
  "id": 2,
  "preview_url": "/uploads/images/my_image.png",
  "download_url": "/api/images/2/download",
  "message": "上传成功"
}
```

**错误响应 (400)：**
```json
{
  "detail": "不支持的文件格式。支持的格式：.png, .jpg, .jpeg, .gif, .webp"
}
```

**错误响应 (413)：**
```json
{
  "detail": "文件大小超过限制（最大 50MB）"
}
```

**cURL 示例：**
```bash
curl -X POST http://localhost:8000/api/images/upload \
  -F "file=@/path/to/image.png" \
  -F "prompt=我的图片描述" \
  -F "keywords=风景,日落" \
  -F "description=这是一张漂亮的风景照"
```

**Python 示例：**
```python
import requests

with open('image.png', 'rb') as f:
    files = {'file': f}
    data = {
        'prompt': '我的图片',
        'keywords': '风景,日落'
    }
    response = requests.post(
        'http://localhost:8000/api/images/upload',
        files=files,
        data=data
    )
    print(response.json())
```

**JavaScript 示例：**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('prompt', '我的图片');
formData.append('keywords', '风景,日落');

fetch('http://localhost:8000/api/images/upload', {
  method: 'POST',
  body: formData
})
.then(res => res.json())
.then(data => console.log(data))
```

## 📥 下载接口

### GET /api/images/{image_id}/download

下载图片文件。

**路径参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| image_id | integer | ✅ | 图片 ID |

**成功响应 (200)：**
- 返回图片二进制内容
- Content-Type: image/png

**错误响应 (404)：**
```json
{
  "detail": "图片 ID 1 不存在"
}
```

**cURL 示例：**
```bash
# 下载图片到本地
curl http://localhost:8000/api/images/1/download -o image.png

# 在浏览器中打开
# 直接访问 http://localhost:8000/api/images/1/download
```

**Python 示例：**
```python
import requests

response = requests.get('http://localhost:8000/api/images/1/download')
if response.status_code == 200:
    with open('image.png', 'wb') as f:
        f.write(response.content)
    print("下载成功")
else:
    print(f"下载失败: {response.status_code}")
```

## 📖 API 文档

启动后端服务后，可以访问交互式 API 文档：

- **Swagger UI**：http://localhost:8000/docs
- **ReDoc**：http://localhost:8000/redoc

## 🔒 错误处理

所有 API 响应都遵循 HTTP 状态码规范：

| 状态码 | 含义 | 示例 |
|--------|------|------|
| 200 | 成功 | 请求正常完成 |
| 400 | 请求错误 | 参数不合法 |
| 404 | 未找到 | 图片不存在 |
| 413 | 文件过大 | 上传文件超过限制 |
| 500 | 服务器错误 | 处理请求时出错 |

## 🔐 跨域请求

后端已配置 CORS，允许来自以下源的跨域请求：
- http://localhost:5173
- http://localhost:3000
- http://127.0.0.1:5173
- http://127.0.0.1:3000

## 📊 数据类型说明

### Image 对象

```json
{
  "id": 1,                                          // 图片唯一 ID
  "prompt": "一只可爱的小猫",                        // 生图提示词
  "keywords": "可爱,宠物,温暖",                      // 关键词
  "description": "生成的图片",                       // 描述
  "preview_url": "/uploads/images/abc123.png",      // 预览 URL
  "download_url": "/api/images/1/download",         // 下载 URL
  "created_at": "2024-01-01T12:00:00"               // 创建时间
}
```

---

**最后更新时间**：2024-01-01
