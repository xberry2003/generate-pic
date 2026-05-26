@echo off
REM 简单后端启动脚本 - 如果 start-backend.bat 有问题用这个

cd /d %~dp0backend

if not exist "venv\" (
    python -m venv venv
)

call venv\Scripts\activate.bat

if not exist "venv\Lib\site-packages\fastapi\" (
    python -m pip install --upgrade pip setuptools wheel
    pip install -r requirements.txt
)

python -m app.main
