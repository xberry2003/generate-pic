#!/bin/bash

# Linux/macOS 一键启动脚本（同时启动前后端）

echo ""
echo "============================================================"
echo "🎨 欢迎使用文生图图片库 Web 小工具"
echo "============================================================"
echo ""
echo "本脚本将同时启动前端和后端服务"
echo ""
echo "📌 注意：此脚本需要同时打开两个终端窗口"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 启动后端服务（在新终端中）
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open -a Terminal "$SCRIPT_DIR/start-backend.sh"
else
    # Linux
    gnome-terminal -- bash "$SCRIPT_DIR/start-backend.sh" &
fi

# 等待后端启动
echo "等待后端服务启动..."
sleep 3

# 启动前端服务（在新终端中）
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    open -a Terminal "$SCRIPT_DIR/start-frontend.sh"
else
    # Linux
    gnome-terminal -- bash "$SCRIPT_DIR/start-frontend.sh" &
fi

echo ""
echo "✅ 已启动后端和前端服务！"
echo ""
echo "📍 前端地址：http://localhost:5173"
echo "📍 后端地址：http://localhost:8000"
echo "📖 API 文档：http://localhost:8000/docs"
echo ""
echo "💡 提示：在新打开的终端中按 Ctrl+C 可以停止服务"
echo ""
