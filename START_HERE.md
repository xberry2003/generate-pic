# 🎨 文生图图片库 - 项目已完成！

欢迎使用**文生图图片库 Web 小工具**！

## 🎯 项目概览

这是一个完整的前后端分离的文生图管理应用，包含：

- ✅ React + Vite + Ant Design 前端
- ✅ FastAPI + SQLAlchemy 后端
- ✅ SQLite 数据库
- ✅ 5 个 RESTful API 接口
- ✅ 完整的中文代码注释
- ✅ 详细的文档

## 📁 核心功能

### 前端页面

1. **生成页面** (`/generate`)
   - Prompt 输入框
   - Keywords 关键词输入
   - 防抖自动生成（10秒无输入自动触发）
   - "立即生成"按钮
   - 生成状态显示（idle/waiting/generating/done/failed）
   - 图片预览和下载

2. **图片库页面** (`/gallery`)
   - 图片缩略图展示
   - 关键词搜索功能
   - 分页展示
   - 图片下载

### 后端 API

| 接口 | 方法 | 功能 |
|------|------|------|
| `/api/generate` | POST | 生成图片 |
| `/api/images/search` | GET | 搜索图片库 |
| `/api/images/{id}/download` | GET | 下载图片 |
| `/api/images/upload` | POST | 上传图片 |
| `/health` | GET | 健康检查 |

## 🚀 快速开始 (3 分钟)

### Windows 用户 - 三种启动方式

#### 方式 1️⃣：一键启动（推荐首先尝试）

双击：`start-all.bat`

#### 方式 2️⃣：双窗口启动（如果方式1不行）

打开两个命令行窗口：

**窗口 1 - 启动后端：**
```
双击：启动后端.bat
```

**窗口 2 - 启动前端：**
```
双击：启动前端.bat
```

#### 方式 3️⃣：手动命令行启动（最可靠）

⚠️ **如果以上方式都不行，请查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md) 中的"手动启动方法"**

### ⚠️ 双击 .bat 文件出现问题？

**建议按顺序尝试：**

1. 尝试方式 2（`启动后端.bat` 和 `启动前端.bat`）
2. 如果仍然不行，查看 [快速启动.txt](快速启动.txt) 获取一键命令
3. 详细帮助请查看 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

### Mac/Linux 用户

```bash
bash start-all.sh
```

然后访问 http://localhost:5173

### 手动启动（如果脚本失效）

**终端 1 - 启动后端：**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Mac/Linux
# venv\Scripts\activate  # Windows

pip install -r requirements.txt
python -m app.main
```

**终端 2 - 启动前端：**
```bash
cd frontend
npm install
npm run dev
```

## 📚 文档导航

| 文档 | 内容 | 何时查看 |
|------|------|---------|
| [QUICKSTART.md](QUICKSTART.md) | 5 分钟快速上手指南 | 首次使用 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | **启动故障排查和手动启动方法** | **❌ 双击 bat 出问题时** |
| [README.md](README.md) | 项目完整文档和功能说明 | 想了解全部功能 |
| [API_REFERENCE.md](API_REFERENCE.md) | API 接口详细参考和示例 | 调用 API 时 |
| [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) | 集成真实生图 API 的指南 | 要用真实 API 时 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 部署到生产环境的指南 | 要上线时 |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | 开发者指南和扩展说明 | 要修改代码时 |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | 项目完成总结 | 了解项目规模 |

## 🧪 测试应用

### 1. 测试生成功能

1. 进入"生成图片"页面
2. 在输入框输入：`一只可爱的小猫坐在阳光下`
3. 等待 10 秒，或点击"立即生成"按钮
4. 看到图片预览表示成功 ✅

### 2. 测试搜索功能

1. 切换到"图片库"页面
2. 输入搜索关键词（如：`小猫`）
3. 点击"搜索"看到结果 ✅

### 3. 测试 API（使用 curl）

```bash
# 生成图片
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"蓝色的天空","keywords":"天空,蓝色","count":1}'

# 搜索图片
curl "http://localhost:8000/api/images/search?query=蓝色"

# 查看 API 文档
# 访问 http://localhost:8000/docs
```

## 📖 查看 API 文档

后端启动后，可以在浏览器访问：

- **Swagger UI**：http://localhost:8000/docs （推荐）
- **ReDoc**：http://localhost:8000/redoc

你可以在这些界面中直接测试所有 API 接口！

## 🔧 下一步：集成真实生图 API

当前项目使用 Mock 数据生成随机色块图片进行演示。

要集成真实的生图 API（如 OpenAI DALL-E、Stability AI 等），请：

1. 查看 [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) 获取详细指导
2. 修改 `backend/app/services/image_generation_service.py` 中的 `call_image_generation_api()` 函数
3. 获取 API 密钥，配置到 `.env` 文件
4. 重启后端服务即可

示例集成已在指南中提供（OpenAI、Stability AI、自定义 API）。

## 📁 项目文件结构

```
generate-pic/
├── 📄 README.md                    # 项目完整文档
├── 📄 QUICKSTART.md               # 快速开始
├── 📄 API_REFERENCE.md            # API 参考
├── 📄 INTEGRATION_GUIDE.md        # API 集成指南
├── 📄 DEPLOYMENT.md               # 部署指南
├── 📄 DEVELOPER_GUIDE.md          # 开发指南
├── 📄 PROJECT_SUMMARY.md          # 项目总结
│
├── 🚀 start-all.bat/sh            # 一键启动脚本
├── 🚀 start-backend.bat/sh        # 后端启动脚本
├── 🚀 start-frontend.bat/sh       # 前端启动脚本
│
├── frontend/                       # React 前端项目
│   ├── src/pages/                 # 生成、图片库页面
│   ├── src/services/              # API 调用、防抖工具
│   ├── package.json               # NPM 依赖
│   └── vite.config.js             # Vite 配置
│
└── backend/                        # FastAPI 后端项目
    ├── app/routes/                # API 路由
    ├── app/services/              # 业务逻辑
    ├── app/models.py              # 数据库模型
    ├── app/main.py                # FastAPI 应用
    ├── requirements.txt           # Python 依赖
    └── uploads/images/            # 图片存储目录
```

## 💡 核心特性说明

### 防抖生成

使用 lodash 的 debounce 函数实现：
- 用户输入时，状态变为 "waiting"
- 10 秒内无新输入，自动生成图片
- 用户也可点击"立即生成"按钮手动生成

### Mock 生图 API

当前使用 PIL 生成随机彩色图片：
```python
# 可在此处替换为真实 API 调用
img = Image.new('RGB', (512, 512), color=(r, g, b))
```

### 关键词搜索

支持在以下字段中模糊搜索：
- Prompt（生图提示词）
- Keywords（关键词）
- Description（描述）

## ⚙️ 环境要求

- **Node.js** 16+ （前端开发）
- **Python** 3.8+ （后端开发）
- **npm** 或 **yarn** （前端包管理）
- **pip** （Python 包管理）

## 🔐 安全信息

- ✅ 所有输入都经过验证
- ✅ 文件上传有大小和类型限制（50MB，支持 PNG/JPG/GIF/WebP）
- ✅ 使用 SQLAlchemy 参数化查询防止 SQL 注入
- ✅ 前端和后端分离，CORS 正确配置
- ✅ 所有 API 密钥应存储在 `.env` 环境变量中

生产环境建议：
- [ ] 启用 HTTPS
- [ ] 配置防火墙
- [ ] 定期备份数据库
- [ ] 监控系统性能
- [ ] 使用 PostgreSQL 而非 SQLite

## 📞 常见问题

### Q: 如何修改生图数量？
A: 在"生成图片"页面的"生成图片数量"输入框中修改（1-4 张）

### Q: 如何查看所有 API 接口？
A: 启动后端后，访问 http://localhost:8000/docs

### Q: 如何集成真实的生图 API？
A: 查看 [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)

### Q: 如何部署到生产环境？
A: 查看 [DEPLOYMENT.md](DEPLOYMENT.md)

### Q: 如何扩展功能？
A: 查看 [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)

### Q: 生成失败怎么办？
A: 
1. 检查后端是否正常运行
2. 查看浏览器控制台错误信息
3. 查看后端日志
4. 确保 prompt 不为空

## 🎓 代码质量

- ✅ 所有关键函数都有中文详细注释
- ✅ 所有 API 接口都有完整的文档说明
- ✅ 数据验证使用 Pydantic（后端）
- ✅ 遵循 PEP 8 Python 代码风格
- ✅ 遵循 React Hooks 最佳实践

## 📊 项目规模

| 指标 | 数值 |
|------|------|
| 前端代码 | ~1000 行 |
| 后端代码 | ~800 行 |
| 文档 | ~5000 行 |
| API 接口 | 5 个 |
| 页面 | 2 个 |
| 数据库表 | 1 个 |

## 🚀 后续计划

### 立即可做
- [ ] 集成真实生图 API
- [ ] 测试应用功能
- [ ] 根据需求调整样式

### 短期（1-2 周）
- [ ] 添加用户认证
- [ ] 图片删除功能
- [ ] 批量操作

### 中期（1-2 个月）
- [ ] 迁移至 PostgreSQL
- [ ] 用户个人库功能
- [ ] 图片评分系统

### 长期（3-6 个月）
- [ ] 分布式存储
- [ ] 推荐算法
- [ ] 社区功能
- [ ] 移动端应用

## 💬 反馈和支持

- 查看代码中的注释获取详细说明
- 查看相关文档获取使用指导
- 修改代码并测试你的改进
- 分享你的使用体验

## 📄 许可证

MIT License - 自由使用和修改

## 🎉 项目完成！

所有功能已实现，文档已完成，代码已优化。

**现在就开始使用吧！** 🚀

---

**项目开发日期**：2024-01-01
**版本**：1.0.0
**作者**：GitHub Copilot

祝你使用愉快！ 🎨✨
