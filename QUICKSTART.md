# 快速开始指南

本文档提供快速启动项目的步骤。

## 🎯 5 分钟快速上手

### 第一步：启动后端 (Windows)

双击 `start-backend.bat` 文件：

```
✅ 虚拆环境已激活，依赖已安装

🚀 启动 FastAPI 服务...
📍 访问地址：http://localhost:8000
📖 API 文档：http://localhost:8000/docs
```

看到上面的信息说明后端已成功启动！

### 第一步：启动后端 (Mac/Linux)

```bash
bash start-backend.sh
```

### 第二步：启动前端 (Windows)

打开新的命令行窗口，双击 `start-frontend.bat` 文件：

```
✅ 依赖已安装

🚀 启动 Vite 开发服务器...
📍 访问地址：http://localhost:5173
```

### 第二步：启动前端 (Mac/Linux)

打开新的终端窗口，运行：

```bash
bash start-frontend.sh
```

### 第三步：打开浏览器

在浏览器中打开 **http://localhost:5173**

恭喜！你现在可以使用应用了 🎉

## 📌 一键启动

如果想同时启动前后端，可以使用一键启动脚本：

**Windows：** 双击 `start-all.bat`

**Mac/Linux：** 运行 `bash start-all.sh`

## 🧪 测试应用

### 1. 测试生图功能

1. 进入"生成图片"页面
2. 在输入框中输入：`一只可爱的小猫`
3. 等待 10 秒自动生成，或点击"立即生成"
4. 看到图片预览表示成功 ✅

### 2. 测试图片库

1. 切换到"图片库"页面
2. 输入搜索关键词（如 `猫`）点击搜索
3. 应该能看到之前生成的图片 ✅

### 3. 测试 API（使用 curl）

打开命令行，运行以下命令测试后端 API：

```bash
# 测试健康检查
curl http://localhost:8000/health

# 测试生图接口
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"蓝色的天空","keywords":"天空,蓝色","count":1}'

# 测试搜索接口
curl http://localhost:8000/api/images/search?query=蓝色
```

## 📊 查看 API 文档

后端启动后，访问以下地址可以查看完整的 API 文档和在线测试：

**Swagger UI：** http://localhost:8000/docs

**ReDoc：** http://localhost:8000/redoc

## ⚙️ 常见问题

### Q: 启动脚本没反应？

A: 
- 确保已安装 Python 3.8+ 和 Node.js 16+
- 尝试手动启动：
  - 后端：`cd backend && python -m app.main`
  - 前端：`cd frontend && npm run dev`

### Q: 端口已被占用？

A: 修改 Vite 配置或使用其他端口：
```bash
# 前端使用 3000 端口
npm run dev -- --port 3000

# 后端使用其他端口
uvicorn app.main:app --port 8001
```

### Q: 跨域错误？

A: 确保后端正确配置了 CORS，检查 `backend/app/main.py` 中的 CORS 配置

### Q: 无法访问 API 文档？

A: 确保后端服务在运行中，访问 http://localhost:8000/docs

## 🚀 下一步

1. **集成真实生图 API**：修改 `backend/app/services/image_generation_service.py`
2. **自定义样式**：编辑前端 CSS 文件
3. **添加新功能**：参考主 README.md 的开发指南
4. **部署到生产**：参考部署文档

## 💡 提示

- 前端自动代理 API 请求到 `http://localhost:8000`
- 生成图片时使用 MOCK 数据演示，可自行集成真实 API
- 所有代码都有详细的中文注释，便于学习和修改

## 📞 需要帮助？

查看 README.md 获取完整文档，或检查代码中的注释。

---

**祝你使用愉快！** 🎉
