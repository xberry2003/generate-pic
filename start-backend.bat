@echo off
chcp 65001 >nul
REM Windows 后端启动脚本

setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"

echo.
echo ========================================
echo 启动文生图图片库后端服务
echo ========================================
echo.

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python
    echo.
    echo 请先安装 Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo Python 已安装: 
python --version

REM 进入后端目录
echo.
echo 进入后端目录...
cd /d "!SCRIPT_DIR!backend"

REM 检查虚拟环境是否存在
if not exist "venv\" (
    echo 创建虚拟环境中...
    python -m venv venv
    if errorlevel 1 (
        echo [错误] 无法创建虚拟环境
        pause
        exit /b 1
    )
)

REM 激活虚拟环境
echo 激活虚拟环境中...
call venv\Scripts\activate.bat
if errorlevel 1 (
    echo [错误] 无法激活虚拟环境
    pause
    exit /b 1
)

REM 检查依赖是否已安装
if not exist "venv\Lib\site-packages\fastapi\" (
    echo 升级 pip/构建工具...
    python -m pip install --upgrade pip setuptools wheel
    if errorlevel 1 (
        echo [错误] 无法升级 pip 或构建工具
        echo 请检查网络连接并重试
        pause
        exit /b 1
    )

    echo 安装依赖中（这可能需要几分钟）...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 无法安装依赖
        echo 如果使用 Anaconda Prompt，请改用普通 cmd 或 PowerShell 重试
        echo 并确保 pip、setuptools、wheel 已升级
        pause
        exit /b 1
    )
)

REM 启动服务
echo.
echo ========================================
echo 虚拟环境已激活，依赖已安装
echo.
echo 启动 FastAPI 服务...
echo.
echo 访问地址：http://localhost:8000
echo API 文档：http://localhost:8000/docs
echo.
echo 按 Ctrl+C 停止服务
echo ========================================
echo.

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

pause
