# 开放图片 API 接口文档

本文档整理当前项目对外可直接调用的图片能力。以下接口不需要登录、不需要 Cookie，也不需要 `Authorization` 请求头。

## 基础信息

- API 前缀：`/api`
- API 访问地址：`http://43.142.31.198:9876/api`
- 返回格式：JSON；图片预览/下载接口返回图片二进制
- 上传格式：`multipart/form-data`
- 创建图片格式：`application/json`

> 注意：响应里的 `previewUrl`、`thumbnailUrl`、`downloadUrl` 通常是相对路径。外部系统使用时需要拼接服务域名，例如 `http://43.142.31.198:9876`。

## 1. 图片库上传

上传本地图片到图片库，后端会校验图片类型和大小，转换为 PNG 后上传到远程存储，并写入图片库记录。

```http
POST /api/images/upload
Content-Type: multipart/form-data
```

### Form 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `file` | file | 是 | 图片文件，支持 `.png`、`.jpg`、`.jpeg`、`.gif`、`.webp` |
| `prompt` | string | 否 | 图片原始描述；用于展示和生成规范文件名 |
| `keywords` | string | 否 | 关键词，多个关键词可用逗号分隔 |
| `description` | string | 否 | 图片补充描述 |

限制：

- 文件不能为空
- 文件大小不能超过 50MB
- `prompt` 和 `description` 至少建议填写一个，否则无法生成规范中文文件名

### cURL 示例

```bash
curl -X POST "http://43.142.31.198:9876/api/images/upload" \
  -F "file=@/path/to/image.png" \
  -F "prompt=阳光书房音乐角" \
  -F "keywords=书房,吉他,阳光" \
  -F "description=阳光洒入书房，电吉他与音箱静立书架旁"
```

### 返回示例

```json
{
  "id": 123,
  "preview_url": "/api/images/123/preview",
  "download_url": "/api/images/123/download",
  "message": "Upload succeeded",
  "image": {
    "id": 123,
    "title": "阳光书房音乐角",
    "prompt": "阳光书房音乐角",
    "description": "阳光书房音乐角",
    "keywords": "书房,吉他,阳光",
    "fileName": "阳光书房音乐角.png",
    "cosKey": "ppt-素材/图片素材/阳光书房音乐角.png",
    "previewUrl": "/api/images/123/preview",
    "downloadUrl": "/api/images/123/download",
    "mime_type": "image/png",
    "source": "uploaded",
    "status": "done"
  }
}
```

## 2. 创建图片

根据文本提示词生成图片，生成成功后自动上传到图片库，并返回图片记录。

```http
POST /api/generate
Content-Type: application/json
```

### Body 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `prompt` | string | 是 | - | 文生图提示词 |
| `keywords` | string 或 string[] | 否 | `""` | 关键词 |
| `description` | string | 否 | `""` | 图片描述；为空时使用 `prompt` |
| `original_prompt` | string | 否 | `""` | 原始描述；用于生成文件名，为空时使用 `prompt` |
| `count` | integer | 否 | `1` | 生成数量，范围 `1-4` |

### cURL 示例

```bash
curl -X POST "http://43.142.31.198:9876/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "一间复古风格厨房，黑白棋盘格地面，窗边有绿色植物，真实摄影",
    "keywords": "厨房,复古,室内",
    "description": "复古风格厨房 黑白棋盘格",
    "original_prompt": "复古风格厨房 黑白棋盘格",
    "count": 1
  }'
```

### 返回示例

```json
{
  "message": "Generation succeeded",
  "success": true,
  "images": [
    {
      "id": 124,
      "title": "一间复古风格厨房，黑白棋盘格地面，窗边有绿色植物，真实摄影",
      "prompt": "一间复古风格厨房，黑白棋盘格地面，窗边有绿色植物，真实摄影",
      "description": "复古风格厨房 黑白棋盘格",
      "keywords": "厨房,复古,室内",
      "fileName": "复古风格厨房 黑白棋盘格.png",
      "cosKey": "ppt-素材/图片素材/复古风格厨房 黑白棋盘格.png",
      "previewUrl": "/api/images/124/preview",
      "downloadUrl": "/api/images/124/download",
      "mime_type": "image/png",
      "source": "generated",
      "status": "done"
    }
  ]
}
```

## 3. 图片库对外开放

图片库开放接口用于外部系统读取、搜索、预览、缩略图和下载图片。以下读取类接口均不需要鉴权。

### 3.1 获取图片列表

```http
GET /api/images
```

Query 参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sync_remote` | boolean | 否 | 兼容旧参数；当前列表直接从远程图片目录读取并合并数据库 metadata |

cURL：

```bash
curl "http://43.142.31.198:9876/api/images"
```

返回示例：

```json
{
  "success": true,
  "total": 479,
  "synced": 0,
  "images": [
    {
      "id": 1,
      "title": "满天星问号",
      "prompt": "满天星问号",
      "description": "",
      "fileName": "满天星问号.png",
      "cosKey": "ppt-素材/图片素材/满天星问号.png",
      "thumbnailUrl": "/api/images/thumbnail?key=...",
      "previewUrl": "/api/images/preview?key=...",
      "downloadUrl": "/api/images/download?key=...",
      "size": 123456,
      "createdAt": "2026-06-07T12:54:48",
      "source": "cos",
      "status": "done"
    }
  ]
}
```

### 3.2 搜索图片

```http
GET /api/images/search
```

Query 参数：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `query` | string | 否 | `""` | 搜索关键词 |
| `skip` | integer | 否 | `0` | 分页偏移 |
| `limit` | integer | 否 | `100` | 返回数量，范围 `1-500` |
| `sync_remote` | boolean | 否 | `false` | 兼容旧参数 |

搜索范围包括：`prompt`、`description`、`keywords`、`file_name`、`cosKey`。

```bash
curl "http://43.142.31.198:9876/api/images/search?query=厨房&skip=0&limit=20"
```

### 3.3 获取缩略图

```http
GET /api/images/thumbnail?key=<URL编码后的cosKey>
GET /api/images/cos/thumbnail?key=<URL编码后的cosKey>
```

返回：

- `Content-Type: image/webp`
- 固定 16:9，默认 `640 x 360`
- 用于图片卡片、列表封面

```bash
curl -L "http://43.142.31.198:9876/api/images/thumbnail?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png" -o thumb.webp
```

### 3.4 预览原图

```http
GET /api/images/preview?key=<URL编码后的cosKey>
GET /api/images/cos/preview?key=<URL编码后的cosKey>
GET /api/images/{image_id}/preview
```

返回图片二进制，`Content-Disposition: inline`，适合浏览器预览。

### 3.5 下载原图

```http
GET /api/images/download?key=<URL编码后的cosKey>
GET /api/images/cos/download?key=<URL编码后的cosKey>
GET /api/images/{image_id}/download
```

返回图片二进制，`Content-Disposition: attachment`，适合下载或复制下载链接给外部用户。

```bash
curl -L "http://43.142.31.198:9876/api/images/124/download" -o image.png
```

## 错误返回

常见错误：

| 状态码 | 场景 | 示例 |
| --- | --- | --- |
| `400` | 参数缺失、文件为空、格式不支持、非法 COS key | `{"detail":"Prompt is required"}` |
| `403` | COS key 不在允许的图片目录内 | `{"detail":"COS key is outside image prefix"}` |
| `404` | 图片 ID 不存在或本地文件不存在 | `{"detail":"Image 1 not found"}` |
| `413` | 上传文件超过 50MB | `{"detail":"File is larger than 50MB"}` |
| `500` | 生成服务、远程存储或下载失败 | `{"detail":"Generation failed: ..."}` |

## 调用建议

- 图片卡片展示优先使用 `thumbnailUrl`。
- 点击查看大图使用 `previewUrl`。
- 下载和复制给外部系统使用 `downloadUrl`。
- 外部系统收到相对 URL 时，统一拼接后端域名。
- 当前只开放上传、生成、读取、预览、下载；删除图片和修改 metadata 仍需要登录鉴权。
