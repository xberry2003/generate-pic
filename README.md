# 文生图图片工作台

一个前后端分离的图片生成与素材管理工具。当前版本以“批量表格工作台”为核心，支持本地规则扩写、MiniMax 生图、生成草稿预览、手动上传到腾讯云 COS、图片库预览/下载、CSV 一键导入等流程。

## 核心功能

### 图片生成工作台

- 支持单条记录和批量表格模式。
- 每一行代表一条生图任务，可编辑：
  - 原始描述
  - 描述扩充
  - Keywords
  - 状态
  - 结果图片
  - 操作按钮
- 原始描述输入后：
  - 5 秒无输入会调用本地规则扩写接口，自动填充“描述扩充”列。
  - 10 秒无输入会进入生成队列，自动生成草稿图。
- 生成并发受控，当前最多 2 行同时生成，避免批量任务一次性打满生图 API。
- 操作栏支持：
  - 生成
  - 重试
  - 查看
  - 上传
  - 下载
  - 删除

### 两阶段生成流程

当前工作台严格区分“生成”和“上传”：

1. 生成 / 重试
   - 只调用 MiniMax 生成临时预览图。
   - 只显示在当前工作台。
   - 不上传 COS。
   - 不写数据库。
   - 不进入后端图片库。

2. 上传
   - 只有用户点击“上传”按钮后，才上传当前满意图片到 COS。
   - COS 上传成功后写入数据库。
   - 图片库刷新后才能看到该图片。

这可以避免重试时把不满意的图片反复写入图片库。

### 本地规则版描述扩充

由于 MiniMax `prompt_optimizer=true` 只影响内部出图效果，不返回可读取的优化 prompt 文本，项目新增了后端本地规则扩写接口：

```http
POST /api/prompts/expand
```

请求示例：

```json
{
  "prompt": "污水厂",
  "style": "realistic",
  "aspect": "default"
}
```

返回示例：

```json
{
  "originalPrompt": "污水厂",
  "expandedPrompt": "一座现代化污水处理厂，巨大的处理池排列整齐，大型设备和建筑结构清晰可见，场景布局整齐，具有真实工业环境氛围，广角构图，白天自然光，真实摄影风格，高细节，高清画质"
}
```

规则位置：

- `backend/app/services/prompt_expander.py`
- `backend/app/routes/prompts.py`

特点：

- 不调用任何外部 LLM。
- 不需要新的 API Key。
- 通过关键词分类和模板拼接生成扩写文本。
- 支持工业建筑、人物、自然风景、城市建筑、物体产品和默认模板。
- 如果用户手动编辑过“描述扩充”，后续自动扩写不会覆盖。
- 点击“重新扩写”可以强制重新生成描述扩充。

### CSV 一键导入

顶部“一键导入 CSV”按钮支持把本地 CSV 批量填入表格。

支持表头模式：

| CSV 字段名 | 映射到 |
| --- | --- |
| `prompt` / `原始描述` / `originalPrompt` | 原始描述 |
| `expandedPrompt` / `描述扩充` / `description` | 描述扩充 |
| `keywords` / `关键词` | Keywords |
| `count` / `数量` | 数量 |

也支持无表头模式：

| 列序号 | 映射到 |
| --- | --- |
| 第 1 列 | 原始描述 |
| 第 2 列 | 描述扩充 |
| 第 3 列 | Keywords |
| 第 4 列 | 数量 |

CSV 示例：

```csv
prompt,expandedPrompt,keywords,count
污水厂,一座现代化污水处理厂，巨大的处理池排列整齐,工业,1
自来水厂,一座现代化自来水厂，高耸的储水塔矗立在厂区中央,城市,1
```

导入行为：

- 空行会跳过。
- 原始描述为空的行会跳过。
- 没有描述扩充的行会继续走本地规则自动扩写。
- 有描述扩充的行会标记为用户已有内容，不会被自动覆盖。
- 导入后不会上传 COS，也不会写数据库。
- 导入后的行复用现有 10 秒自动生成逻辑和生成队列。

编码兼容：

- UTF-8
- UTF-8 with BOM
- GB18030
- GBK

### 图片库

图片库读取腾讯云 COS 中的真实对象列表，不再依赖 SFTP 或服务器本地目录。

当前 COS prefix：

```text
ppt-素材/图片素材/
```

图片库打开或刷新时，会从 COS prefix 拉取对象列表，并返回给前端展示。

预览和下载已分离：

- `previewUrl`：用于 `<img src>` 预览，返回 `Content-Disposition: inline`。
- `downloadUrl`：用于下载按钮，返回 `Content-Disposition: attachment`。

这可以避免把下载接口当作图片预览地址导致 broken image。

### 上传图片

首页上传图片会：

1. 上传到 COS。
2. 写入数据库。
3. 只把本次上传结果 append 到当前工作台。
4. 不拉取图片库历史数据到首页。

上传命名规则：

- 优先使用“原始描述”生成中文安全文件名。
- 没有原始描述/描述扩展时会拒绝上传。
- 去掉非法路径字符。
- 同名冲突时自动追加短时间戳。

最终 COS Key 形如：

```text
ppt-素材/图片素材/一颗西瓜.png
ppt-素材/图片素材/一颗西瓜_113302.png
```

### 删除生成中任务

删除某一行时会：

- 取消该行的自动生成 debounce。
- 从生成队列移除。
- 如果前端正在请求 `/api/generate/draft`，会通过 `AbortController` 取消该前端 HTTP 请求。
- 被取消的结果不会再回写到表格。

注意：如果后端已经把请求发给 MiniMax，MiniMax 服务端是否真正停止取决于 MiniMax 是否支持任务取消；当前 MiniMax 生图接口没有单独的取消任务接口。

## 技术栈

### 前端

- React 18
- Vite 5
- Ant Design 5
- Axios
- Lodash debounce

### 后端

- FastAPI
- Uvicorn
- SQLAlchemy
- Pydantic
- Pillow
- Tencent COS SDK
- MiniMax image generation API

### 数据与存储

- SQLite：默认本地数据库
- 腾讯云 COS：正式图片素材存储
- COS prefix：`ppt-素材/图片素材/`

## 项目结构

```text
generate-pic/
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ database.py
│  │  ├─ models.py
│  │  ├─ routes/
│  │  │  ├─ generate.py
│  │  │  ├─ images.py
│  │  │  ├─ prompts.py
│  │  │  ├─ storage.py
│  │  │  └─ upload.py
│  │  └─ services/
│  │     ├─ image_generation_service.py
│  │     ├─ image_record_service.py
│  │     ├─ minimax_client.py
│  │     ├─ prompt_expander.py
│  │     └─ remote_storage_service.py
│  ├─ requirements.txt
│  └─ generate_pic.db
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ pages/
│  │  │  ├─ BatchGenerateTablePage.jsx
│  │  │  ├─ GalleryPage.jsx
│  │  │  └─ GeneratePage.jsx
│  │  └─ services/
│  │     ├─ api.js
│  │     └─ debounce.js
│  └─ package.json
└─ README.md
```

## 快速启动

### 后端

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

后端文档地址：

```text
http://localhost:8000/docs
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端地址：

```text
http://localhost:5173/
```

## 环境变量

后端配置文件：

```text
backend/.env
```

示例文件：

```text
backend/.env.example
```

关键配置：

```env
MINIMAX_API_BASE_URL=https://api.minimax.chat
MINIMAX_API_KEY=your_minimax_key
MINIMAX_MODEL=image-01
MINIMAX_IMAGE_ENDPOINT=/v1/image_generation
MINIMAX_RESPONSE_FORMAT=base64
MINIMAX_ASPECT_RATIO=1:1
MINIMAX_PROMPT_OPTIMIZER=true
MINIMAX_TIMEOUT_SECONDS=180

STORAGE_PROVIDER=cos
COS_SECRET_ID=your_secret_id
COS_SECRET_KEY=your_secret_key
COS_REGION=ap-shanghai
COS_BUCKET=teachvideo-1311931714
COS_KEY_PREFIX=ppt-素材/图片素材
```

注意：

- 不要把真实 SecretId、SecretKey、MiniMax Key 写入代码。
- `.env` 只在后端读取，不返回给前端。
- `MINIMAX_PROMPT_OPTIMIZER=true` 只影响 MiniMax 内部出图效果，不会返回优化后的 prompt 文本。

## API 摘要

### POST `/api/prompts/expand`

本地规则扩写，不调用外部 API。

```json
{
  "prompt": "污水厂",
  "style": "realistic",
  "aspect": "default"
}
```

### POST `/api/generate/draft`

生成临时草稿图，不上传 COS，不写数据库。

```json
{
  "prompt": "一座现代化污水处理厂...",
  "keywords": "工业",
  "count": 1,
  "description": "一座现代化污水处理厂..."
}
```

### POST `/api/generate/upload`

上传已满意的草稿图到 COS，并写数据库。

### GET `/api/images`

从 COS prefix 拉取图片库列表。

### GET `/api/images/preview?key=<encoded cosKey>`

图片预览接口，返回 inline 图片二进制。

### GET `/api/images/download?key=<encoded cosKey>`

图片下载接口，返回 attachment。

### POST `/api/images/upload`

上传本地图片到 COS，并写数据库。

## 使用流程

### 批量 CSV 生成

1. 点击“批量生成”进入表格模式。
2. 点击“一键导入 CSV”选择本地 CSV。
3. 检查原始描述、描述扩充、Keywords。
4. 等待 10 秒自动生成，或点击“生成全部待处理”。
5. 对不满意的行点击“重试”。
6. 满意后点击该行“上传”。
7. 到图片库刷新查看已上传图片。

### 手动输入生成

1. 点击“新增记录”或进入批量表格模式。
2. 输入“原始描述”。
3. 等待本地规则自动填充“描述扩充”。
4. 等待自动生成，或手动点击“生成”。
5. 满意后点击“上传”。

## 安全与边界

- 生成草稿不会进入图片库。
- 重试不会上传 COS。
- CSV 导入不会上传 COS，也不会写数据库。
- 只有点击“上传”才会写 COS 和数据库。
- 图片库只展示 COS 中真实存在的图片对象。
- 首页工作台刷新后不恢复历史图片库数据。
- 不使用 mock/demo/localStorage 恢复历史生成记录。

## 常见问题

### CSV 导入中文乱码

当前前端会自动尝试 UTF-8、UTF-8 with BOM、GB18030、GBK。若仍乱码，建议从 Excel 另存为 UTF-8 CSV。

### MiniMax 是否会返回优化后的 prompt？

不会。真实响应中没有 `optimized_prompt`、`revised_prompt`、`expanded_prompt` 等可读取字段。`prompt_optimizer=true` 只用于 MiniMax 内部优化出图效果。

### 删除生成中的行会取消请求吗？

前端会取消该行 `/api/generate/draft` 请求，并阻止结果回写。若后端已经请求 MiniMax，MiniMax 侧是否停止取决于第三方接口是否支持取消。

## 开发提示

- 后端新增接口放在 `backend/app/routes/`。
- 后端通用逻辑放在 `backend/app/services/`。
- 前端 API 封装放在 `frontend/src/services/api.js`。
- 批量表格主逻辑在 `frontend/src/pages/BatchGenerateTablePage.jsx`。
- 图片库逻辑在 `frontend/src/pages/GalleryPage.jsx`。
