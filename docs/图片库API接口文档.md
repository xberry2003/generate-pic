# 图片库 API 接口文档

本文档基于当前项目后端 `backend/app/routes/images.py` 和前端 `frontend/src/services/api.js` 整理。

## 基础信息

- API 前缀：`/api`
- 图片库路由模块：`backend/app/routes/images.py`
- 鉴权：图片库接口在 `app.main` 中通过 `Depends(require_auth)` 统一保护，未登录会返回 `401`
- 存储来源：腾讯云 COS
- 图片对象目录由环境变量 `COS_KEY_PREFIX` 控制，当前业务目录为 `ppt-素材/图片素材/`
- 元数据来源：SQLite `images` 表
- 缩略图缓存目录：默认 `backend/data/thumbnails/`

## 通用图片字段

图片库列表和搜索接口返回的图片对象通常包含：

```json
{
  "id": 1,
  "title": "一张图片标题",
  "prompt": "原始描述",
  "originalPrompt": "原始描述",
  "original_prompt": "原始描述",
  "description": "描述信息",
  "expandedPrompt": "描述信息",
  "expanded_prompt": "描述信息",
  "keywords": "",
  "file_name": "xxx.png",
  "fileName": "xxx.png",
  "storage_provider": "cos",
  "remote_path": "ppt-素材/图片素材/xxx.png",
  "cosKey": "ppt-素材/图片素材/xxx.png",
  "thumbnail_url": "/api/images/thumbnail?key=...",
  "thumbnailUrl": "/api/images/thumbnail?key=...",
  "preview_url": "/api/images/preview?key=...",
  "previewUrl": "/api/images/preview?key=...",
  "download_url": "/api/images/download?key=...",
  "downloadUrl": "/api/images/download?key=...",
  "url": "/api/images/preview?key=...",
  "mime_type": "image/png",
  "file_size": 123456,
  "size": 123456,
  "createdAt": "2026-06-02T08:00:00",
  "created_at": "2026-06-02T08:00:00",
  "updated_at": "2026-06-02T08:00:00",
  "lastModified": "2026-06-02T08:00:00",
  "source": "cos",
  "status": "done"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `cosKey` / `remote_path` | COS 对象 key，例如 `ppt-素材/图片素材/xxx.png` |
| `thumbnailUrl` | 图片库卡片和工作台小图使用的 WebP 缩略图接口 |
| `previewUrl` | 点击图片预览时使用的大图预览接口 |
| `downloadUrl` | 下载原图接口；复制链接按钮当前复制该字段 |
| `title` | 卡片标题，优先来自数据库元数据 |
| `originalPrompt` / `prompt` | 原始描述 |
| `description` / `expandedPrompt` | 描述信息，当前项目可能为空 |

## 1. 获取图片库列表

```http
GET /api/images
```

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sync_remote` | boolean | 否 | 兼容旧参数；当前图片列表直接从 COS 读取并合并数据库 metadata |

### 返回示例

```json
{
  "success": true,
  "total": 471,
  "synced": 0,
  "images": [
    {
      "id": 1,
      "title": "满天星",
      "cosKey": "ppt-素材/图片素材/满天星.png",
      "thumbnailUrl": "/api/images/thumbnail?key=ppt-%E7%B4%A0%E6%9D%90%2F...",
      "previewUrl": "/api/images/preview?key=ppt-%E7%B4%A0%E6%9D%90%2F...",
      "downloadUrl": "/api/images/download?key=ppt-%E7%B4%A0%E6%9D%90%2F...",
      "size": 123456,
      "createdAt": "2026-06-02T08:00:00"
    }
  ]
}
```

### 实现说明

- 后端调用 `SFTPStorageClient().list_images()`，在 COS provider 下实际列举 COS 对象
- 按 `remote_path/cosKey` 查询 SQLite `images` 表 metadata 并合并
- COS 是真实图片来源；数据库是 metadata 来源
- 远端图片按 `modified_at` 倒序返回

## 2. 搜索图片库

```http
GET /api/images/search
```

### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `query` | string | 否 | `""` | 搜索关键词 |
| `sync_remote` | boolean | 否 | `false` | 兼容旧参数 |
| `skip` | integer | 否 | `0` | 分页偏移 |
| `limit` | integer | 否 | `100` | 返回数量，范围 `1-500` |

### 搜索字段

后端会在以下字段中做包含匹配：

- `prompt`
- `description`
- `keywords`
- `file_name`
- `cosKey`

### 返回示例

```json
{
  "success": true,
  "message": "Search succeeded",
  "total": 12,
  "synced": 0,
  "images": []
}
```

## 3. 获取 WebP 缩略图

```http
GET /api/images/thumbnail?key=<encoded cosKey>
GET /api/images/cos/thumbnail?key=<encoded cosKey>
```

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 是 | URL 编码后的 COS object key |

### 返回

- `Content-Type: image/webp`
- `Content-Disposition: inline`
- `Cache-Control: public, max-age=86400`

### 缩略图规则

- 尺寸：`640 x 360`
- 比例：`16:9`
- 格式：WebP
- 处理方式：后端读取 COS 原图后使用 cover 裁切缩放，不拉伸变形
- 缓存：生成后缓存到 `backend/data/thumbnails/<sha256(cosKey)>.webp`
- 不覆盖 COS 原图

### 示例

```http
GET /api/images/thumbnail?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png
```

## 4. 获取 COS 图片预览

```http
GET /api/images/preview?key=<encoded cosKey>
GET /api/images/cos/preview?key=<encoded cosKey>
```

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 是 | URL 编码后的 COS object key |

### 返回

- 返回 COS 原图 bytes
- `Content-Type` 根据文件扩展名推断，例如 `image/png`
- `Content-Disposition: inline`

### 用途

- 图片点击大图预览
- 不建议用于卡片缩略图展示

## 5. 下载 COS 原图

```http
GET /api/images/download?key=<encoded cosKey>
GET /api/images/cos/download?key=<encoded cosKey>
```

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `key` | string | 是 | URL 编码后的 COS object key |

### 返回

- 返回 COS 原图 bytes
- `Content-Disposition: attachment`
- 浏览器会按附件下载

### 用途

- 图片库下载按钮
- 工作台下载按钮
- 复制链接按钮当前复制该下载接口链接

## 6. 按数据库 ID 获取图片预览

```http
GET /api/images/{image_id}/preview
```

### Path 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `image_id` | integer | SQLite `images.id` |

### 返回

- 返回图片 bytes
- `Content-Disposition: inline`

### 说明

该接口通过数据库记录找到本地旧文件或远程 `remote_path`，再由后端读取图片内容。

## 7. 按数据库 ID 下载图片

```http
GET /api/images/{image_id}/download
```

### Path 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `image_id` | integer | SQLite `images.id` |

### 返回

- 返回图片 bytes
- `Content-Disposition: attachment`

## 8. 更新图片 metadata

```http
PATCH /api/images/{image_id}/metadata
```

### Path 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `image_id` | integer | SQLite `images.id` |

### 请求体

```json
{
  "originalPrompt": "原始描述",
  "expandedPrompt": "描述信息",
  "keywords": ""
}
```

### 更新字段

| 请求字段 | 数据库字段 |
| --- | --- |
| `originalPrompt` | `images.prompt` |
| `expandedPrompt` | `images.description` |
| `keywords` | `images.keywords` |

### 返回示例

```json
{
  "success": true,
  "message": "Metadata updated",
  "image": {
    "id": 1,
    "prompt": "原始描述",
    "description": "描述信息"
  }
}
```

## 9. 删除图片

```http
DELETE /api/images/{image_id}
```

### Path 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `image_id` | integer | SQLite `images.id` |

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `cosKey` | string | 否 | 当数据库记录不存在时，可按 COS key 删除 |
| `fileName` | string | 否 | 当需要按文件名兜底删除时使用 |

### 删除行为

1. 如果数据库存在该 `image_id`，优先使用 `image.remote_path` 删除远程文件
2. 如果没有数据库记录，则使用 query 中的 `cosKey`
3. 如果提供 `fileName` 且需要兜底，会按文件名删除
4. 删除远程文件后，删除 SQLite `images` 表记录

### 返回示例

```json
{
  "success": true
}
```

### 注意

- 当前接口会删除对应 COS 对象，请谨慎调用
- 工作台删除已上传行时，推荐优先调用 `DELETE /api/workspace/rows/{row_id}`，由工作台接口联动删除 COS、`images`、`workspace_rows`

## 安全校验

涉及 `key` 的接口都会调用 `validate_cos_key(key)`：

- `key` 不能为空
- `key` 不能包含 `..`
- `key` 必须位于配置的 `COS_KEY_PREFIX` 目录下
- 不允许通过接口读取或删除目录外对象

## 前端使用建议

| 场景 | 使用字段 |
| --- | --- |
| 图片库卡片小图 | `thumbnailUrl` |
| 工作台结果小图 | `thumbnailUrl`，没有时 fallback 到 `previewUrl/tempPreviewUrl` |
| 点击图片大图预览 | `previewUrl` |
| 下载图片 | `downloadUrl` |
| 复制链接 | `downloadUrl` |

## cURL 示例

### 获取图片库列表

```bash
curl -i "http://43.142.31.198:9876/api/images"
```

### 获取缩略图

```bash
curl -L "http://43.142.31.198:9876/api/images/thumbnail?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png" -o thumb.webp
```

### 下载原图

```bash
curl -L "http://43.142.31.198:9876/api/images/download?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png" -o image.png
```

