#!/bin/bash

# Linux/macOS 后端启动脚本

echo ""
echo "========================================"
echo "🚀 启动文生图图片库后端服务"
echo "========================================"
echo ""

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误：未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

# 进入后端目录
cd "$(dirname "$0")/backend"

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source venv/bin/activate

# 检查依赖是否已安装
if ! python3 -c "import fastapi" 2>/dev/null; then
    echo "📥 安装依赖..."
    pip install -r requirements.txt
fi

# 启动服务
echo ""
echo "✅ 虚拟环境已激活，依赖已安装"
echo ""
echo "🚀 启动 FastAPI 服务..."
echo "📍 访问地址：http://localhost:8000"
echo "📖 API 文档：http://localhost:8000/docs"
echo ""

python3 -m app.main
