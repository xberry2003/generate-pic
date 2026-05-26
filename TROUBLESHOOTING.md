# 启动故障排查指南

如果双击 `.bat` 文件出现问题，请按照本指南操作。

## 🔧 前置条件检查

### 1️⃣ 检查 Python 是否已安装

打开命令行（按 `Win + R`，输入 `cmd`），运行：

```bash
python --version
```

**预期输出：**
```
Python 3.8.0
```

如果显示"未找到 python"或类似错误：
1. 从 [https://www.python.org/downloads/](https://www.python.org/downloads/) 下载 Python 3.8+
2. **重要：安装时勾选 "Add Python to PATH"**
3. 重启计算机
4. 再次测试 `python --version`

### 2️⃣ 检查 Node.js 是否已安装

在同一个命令行窗口，运行：

```bash
node --version
npm --version
```

**预期输出：**
```
v18.0.0
9.0.0
```

如果显示"未找到 node"或类似错误：
1. 从 [https://nodejs.org/](https://nodejs.org/) 下载 Node.js 16+
2. 按默认选项安装
3. 重启计算机
4. 再次测试 `node --version` 和 `npm --version`

## 💻 手动启动方法（推荐）

如果双击 `.bat` 文件有问题，请使用这个方法：

### 方法 1：使用命令行（最可靠）

**第一步：打开命令行窗口**

按 `Win + R`，输入 `cmd`，按 Enter

**第二步：进入项目目录**

```bash
cd d:\桌面\generate-pic
```

**第三步：启动后端（在此窗口中）**

```bash
cd backend
python -m venv venv
venv\Scripts\activate.bat
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
python -m app.main
```

你会看到：
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

> 如果你在 Anaconda Prompt 中遇到依赖安装失败，建议改用普通 Windows CMD 或 PowerShell 重新运行上述命令。Anaconda 环境有时会影响 `python -m venv` 和 `pip` 的行为。
**第四步：启动前端（打开新的命令行窗口）**

再按一次 `Win + R`，输入 `cmd`，按 Enter

```bash
cd d:\桌面\generate-pic\frontend
npm install
npm run dev
```

你会看到：
```
VITE v5.0.0  ready in XXX ms
  ➜  Local:   http://localhost:5173/
```

**第五步：访问应用**

在浏览器打开：http://localhost:5173

---

### 方法 2：逐个启动（更简单）

**启动后端：**
1. 打开 `文件资源管理器`
2. 进入 `d:\桌面\generate-pic\backend`
3. 在地址栏输入 `cmd` 并按 Enter（会在当前文件夹打开命令行）
4. 复制粘贴以下命令：

```bash
python -m venv venv && venv\Scripts\activate.bat && pip install -r requirements.txt && python -m app.main
```

---

**启动前端：**
1. 再打开一个 `文件资源管理器`
2. 进入 `d:\桌面\generate-pic\frontend`
3. 在地址栏输入 `cmd` 并按 Enter
4. 复制粘贴以下命令：

```bash
npm install && npm run dev
```

---

## 🔍 常见问题排查

### ❌ 问题：命令行立即关闭

**原因：** 脚本执行出错

**解决方案：**
- 使用"方法 1"中的命令行手动启动
- 观察具体的错误信息
- 根据错误信息进行调试

### ❌ 问题：Python: command not found

**解决方案：**
1. 检查是否安装了 Python：
   ```bash
   python --version
   ```
2. 如果未找到，说明 Python 未添加到 PATH
   - 重新安装 Python，**一定要勾选 "Add Python to PATH"**
   - 重启计算机

### ❌ 问题：npm: command not found

**解决方案：**
1. 检查是否安装了 Node.js：
   ```bash
   node --version
   ```
2. 如果未找到，说明 Node.js 未正确安装
   - 从 [https://nodejs.org/](https://nodejs.org/) 重新下载安装
   - 重启计算机

### ❌ 问题：pip install 很慢或失败

**解决方案：**

如果网络较慢，使用清华镜像源：

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

或修改 pip 配置文件 `%APPDATA%\pip\pip.ini`（如不存在则新建）：

```ini
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple
```

### ❌ 问题：npm install 很慢或失败

**解决方案：**

使用淘宝 NPM 镜像：

```bash
npm install -registry https://registry.npmmirror.com
```

或永久设置：

```bash
npm config set registry https://registry.npmmirror.com
```

### ❌ 问题：端口已被占用

**后端端口 8000 被占用：**

```bash
# 查找占用端口 8000 的进程
netstat -ano | findstr :8000

# 获得 PID 后，终止进程（假设 PID 是 1234）
taskkill /PID 1234 /F
```

然后重新启动后端。

**前端端口 5173 被占用：**

使用其他端口：

```bash
npm run dev -- --port 3000
```

### ❌ 问题：生成图片时后端报错

**检查网络连接：**
```bash
ping baidu.com
```

**检查后端日志中的具体错误信息**

### ❌ 问题：数据库文件丢失

**重新初始化数据库：**

后端启动时会自动创建数据库文件 `backend/generate_pic.db`

如果出现问题，可以删除该文件，重启后端会自动重建

## 📊 快速诊断清单

运行以下命令检查你的环境：

```bash
echo === 系统信息 ===
systeminfo | findstr /C:"OS"

echo === Python ===
python --version
pip --version

echo === Node.js ===
node --version
npm --version

echo === 项目目录 ===
cd d:\桌面\generate-pic
dir

echo === 后端依赖 ===
cd backend
dir requirements.txt

echo === 前端依赖 ===
cd ..\frontend
dir package.json
```

## ✅ 验证安装成功

当你看到以下输出说明安装成功：

**后端：**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**前端：**
```
VITE v5.0.0  ready in XXX ms
  ➜  Local:   http://localhost:5173/
```

然后在浏览器访问 http://localhost:5173 即可使用应用！

## 🆘 还是有问题？

### 选项 1：查看详细文档

- [README.md](README.md) - 完整使用文档
- [QUICKSTART.md](QUICKSTART.md) - 快速开始
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - 开发指南

### 选项 2：查看后端日志

后端启动时会打印详细的初始化日志，可以了解发生了什么

### 选项 3：手动检查每一步

按照"方法 1"的步骤逐个运行命令，看在哪一步出错

---

**如果仍有问题，请：**
1. 复制完整的错误信息
2. 检查所有前置条件
3. 尝试使用方法 1 手动启动

祝你使用愉快！ 🚀
