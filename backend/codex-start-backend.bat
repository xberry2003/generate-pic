@echo off
cd /d "%~dp0"
"%~dp0venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > "%~dp0codex-backend.log" 2>&1
