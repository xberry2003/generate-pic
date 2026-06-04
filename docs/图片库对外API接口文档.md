# 图片库对外 API 接口文档

本文档用于其他产品接入当前“文生图图片工作台”的图片库能力。

## 1. 当前图片库 API概况

当前图片库能力已经通过后端 FastAPI 暴露，基础前缀为：

```text
/api
```

线上访问地址：

```text
http://43.142.31.198:9876/api
```

主要能力包括：

- 获取图片库列表
- 搜索图片
- 获取 16:9 WebP 缩略图
- 获取大图预览
- 下载原图
- 更新图片 metadata
- 删除图片

## 2. 重要接入说明

当前这些接口默认走登录鉴权。

也就是说，其他产品直接调用时，如果没有登录态，会返回：

```json
{
  "authenticated": false,
  "message": "未登录或登录已过期"
}
```

状态码通常为：

```text
401 Unauthorized
```

如果后续要给其他产品稳定接入，建议新增一种对外鉴权方式，例如：

```http
Authorization: Bearer <API_TOKEN>
```

或：

```http
X-API-Key: <API_KEY>
```

当前本文档先按“已有登录鉴权接口”整理。

## 3. 图片对象字段

图片库列表返回的每张图片通常包含：

```json
{
  "id": 1,
  "title": "满天星",
  "prompt": "满天星",
  "originalPrompt": "满天星",
  "description": "",
  "fileName": "满天星.png",
  "cosKey": "ppt-素材/图片素材/满天星.png",
  "thumbnailUrl": "/api/images/thumbnail?key=...",
  "previewUrl": "/api/images/preview?key=...",
  "downloadUrl": "/api/images/download?key=...",
  "size": 123456,
  "createdAt": "2026-06-02T08:00:00",
  "lastModified": "2026-06-02T08:00:00"
}
```

字段使用建议：

| 场景 | 使用字段 |
| --- | --- |
| 卡片/列表小图 | `thumbnailUrl` |
| 点击查看大图 | `previewUrl` |
| 下载原图 | `downloadUrl` |
| 复制给用户下载 | `downloadUrl` |
| 搜索/展示标题 | `title` / `originalPrompt` |
| COS 原始 key | `cosKey` |

如果接口返回的是相对路径，例如：

```text
/api/images/download?key=xxx
```

外部产品需要拼接完整域名：

```text
http://43.142.31.198:9876/api/images/download?key=xxx
```

## 4. 获取图片库列表

```http
GET /api/images
```

完整示例：

```http
GET http://43.142.31.198:9876/api/images
```

### Query 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sync_remote` | boolean | 否 | 兼容旧参数；当前图片从 COS 读取并合并数据库 metadata |

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
      "originalPrompt": "满天星",
      "fileName": "满天星.png",
      "cosKey": "ppt-素材/图片素材/满天星.png",
      "thumbnailUrl": "/api/images/thumbnail?key=...",
      "previewUrl": "/api/images/preview?key=...",
      "downloadUrl": "/api/images/download?key=...",
      "size": 123456,
      "createdAt": "2026-06-02T08:00:00"
    }
  ]
}
```

## 5. 搜索图片

```http
GET /api/images/search
```

完整示例：

```http
GET http://43.142.31.198:9876/api/images/search?query=满天星
```

### Query 参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `query` | string | 否 | `""` | 搜索关键词 |
| `skip` | integer | 否 | `0` | 偏移量 |
| `limit` | integer | 否 | `100` | 返回数量，最大 `500` |
| `sync_remote` | boolean | 否 | `false` | 兼容旧参数 |

搜索范围包括：

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

## 6. 获取缩略图

```http
GET /api/images/thumbnail?key=<encoded cosKey>
```

完整示例：

```http
GET http://43.142.31.198:9876/api/images/thumbnail?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png
```

### 说明

- 返回 WebP
- 固定 16:9
- 尺寸：`640 x 360`
- 不拉伸变形
- 不覆盖 COS 原图
- 服务端会缓存生成后的缩略图

### 返回 Header

```http
Content-Type: image/webp
Content-Disposition: inline
Cache-Control: public, max-age=86400
```

## 7. 获取大图预览

```http
GET /api/images/preview?key=<encoded cosKey>
```

完整示例：

```http
GET http://43.142.31.198:9876/api/images/preview?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png
```

### 说明

- 返回 COS 原图 bytes
- `Content-Disposition: inline`
- 用于浏览器预览
- 不建议作为列表卡片图片源，卡片请使用 `thumbnailUrl`

## 8. 下载原图

```http
GET /api/images/download?key=<encoded cosKey>
```

完整示例：

```http
GET http://43.142.31.198:9876/api/images/download?key=ppt-%E7%B4%A0%E6%9D%90%2F%E5%9B%BE%E7%89%87%E7%B4%A0%E6%9D%90%2Fxxx.png
```

### 说明

- 返回 COS 原图 bytes
- `Content-Disposition: attachment`
- 用于下载原图
- 当前“复制链接”按钮复制的就是这个下载链接

## 9. 按数据库 ID 预览/下载

如果外部产品拿到的是数据库 `id`，也可以使用：

```http
GET /api/images/{image_id}/preview
GET /api/images/{image_id}/download
```

示例：

```http
GET http://43.142.31.198:9876/api/images/1/preview
GET http://43.142.31.198:9876/api/images/1/download
```

建议优先使用 `cosKey` 版本接口，因为当前图片库列表是以 COS 为真实图片来源。

## 10. 更新图片 metadata

```http
PATCH /api/images/{image_id}/metadata
```

请求体：

```json
{
  "originalPrompt": "原始描述",
  "expandedPrompt": "描述信息",
  "keywords": ""
}
```

返回示例：

```json
{
  "success": true,
  "message": "Metadata updated",
  "image": {}
}
```

## 11. 删除图片

```http
DELETE /api/images/{image_id}
```

可选 Query：

```text
cosKey=<cosKey>
fileName=<fileName>
```

示例：

```http
DELETE http://43.142.31.198:9876/api/images/1
```

注意：

- 该接口会删除对应 COS 对象
- 其他产品接入时不建议默认开放删除能力
- 如果只是展示或下载图片，不需要使用该接口

## 12. 错误返回

### 未登录

```http
401 Unauthorized
```

```json
{
  "authenticated": false,
  "message": "未登录或登录已过期"
}
```

### COS key 非法

```http
400 Bad Request
```

或：

```http
403 Forbidden
```

常见原因：

- `key` 为空
- `key` 包含 `..`
- `key` 不在允许的 `COS_KEY_PREFIX` 下

### 服务器读取 COS 失败

```http
500 Internal Server Error
```

```json
{
  "detail": "COS download failed ..."
}
```

## 13. 推荐外部产品接入流程

### 展示图片列表

1. 调用 `GET /api/images`
2. 卡片图片使用 `thumbnailUrl`
3. 点击图片时使用 `previewUrl`
4. 下载按钮使用 `downloadUrl`

### 搜索图片

1. 调用 `GET /api/images/search?query=关键词`
2. 返回结构和列表接口一致

### 复制图片链接

复制 `downloadUrl`，不要复制 `thumbnailUrl` 或 `previewUrl`。



