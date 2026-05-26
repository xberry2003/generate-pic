@echo off
REM 简单前端启动脚本 - 如果 start-frontend.bat 有问题用这个

cd /d %~dp0frontend

if not exist "node_modules\" (
    npm.cmd install
)

npm.cmd run dev
