@echo off
chcp 65001 >nul
REM Windows 前端启动脚本

setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"

echo.
echo ========================================
echo 启动文生图图片库前端服务
echo ========================================
echo.

REM 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js
    echo.
    echo 请先安装 Node.js 16+
    echo 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js 已安装: 
node --version

echo npm 版本: 
call npm.cmd --version

REM 进入前端目录
echo.
echo 进入前端目录...
cd /d "!SCRIPT_DIR!frontend"

REM 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo 安装依赖中（这可能需要几分钟）...
    call npm.cmd install
    if errorlevel 1 (
        echo [错误] 无法安装依赖
        echo 请检查网络连接并重试
        pause
        exit /b 1
    )
)

REM 启动服务
echo.
echo ========================================
echo 依赖已安装
echo.
echo 启动 Vite 开发服务器...
echo.
echo 访问地址：http://localhost:5173
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

call npm.cmd run dev

pause
