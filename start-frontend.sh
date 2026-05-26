#!/bin/bash

# Linux/macOS 前端启动脚本

echo ""
echo "========================================"
echo "🚀 启动文生图图片库前端服务"
echo "========================================"
echo ""

# 检查 Node.js 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到 Node.js，请先安装 Node.js 16+"
    exit 1
fi

# 进入前端目录
cd "$(dirname "$0")/frontend"

# 检查 node_modules 是否存在
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 启动服务
echo ""
echo "✅ 依赖已安装"
echo ""
echo "🚀 启动 Vite 开发服务器..."
echo "📍 访问地址：http://localhost:5173"
echo ""

npm run dev
