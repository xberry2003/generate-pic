@echo off
chcp 65001 >nul
REM Windows 一键启动脚本（同时启动前后端）

setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"

echo.
echo ============================================================
echo 欢迎使用文生图图片库 Web 小工具
echo ============================================================
echo.
echo 本脚本将同时启动前端和后端服务
echo.

REM 检查前置条件
echo 检查前置条件...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [错误] Python 未安装或未在 PATH 中
    echo 请先安装 Python 3.8+ 然后重试
    pause
    exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [错误] Node.js 未安装或未在 PATH 中
    echo 请先安装 Node.js 16+ 然后重试
    pause
    exit /b 1
)

echo 前置条件检查通过
echo.
echo 按任意键继续启动服务...
pause >nul

REM 启动后端服务（在新窗口中）
echo 正在启动后端服务...
start "generate-pic-backend" cmd /k "cd /d "!SCRIPT_DIR!" && call start-backend.bat"

REM 等待后端启动
echo 等待后端服务启动...
timeout /t 5 >nul

REM 启动前端服务（在新窗口中）
echo 正在启动前端服务...
start "generate-pic-frontend" cmd /k "cd /d "!SCRIPT_DIR!" && call start-frontend.bat"

echo.
echo ============================================================
echo 已启动后端和前端服务！
echo.
echo 前端地址：http://localhost:5173
echo 后端地址：http://localhost:8000
echo API 文档：http://localhost:8000/docs
echo.
echo 提示：在弹出的窗口中按 Ctrl+C 可以停止服务
echo ============================================================
echo.
pause
