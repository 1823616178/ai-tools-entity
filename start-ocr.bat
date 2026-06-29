@echo off
chcp 65001 >nul
REM 启动 PaddleOCR 服务（本地开发用，使用系统 Python）
REM 用法：双击运行 或 start-ocr.bat

cd /d "%~dp0server_ocr"

set PYTHON_CMD=python

%PYTHON_CMD% --version >nul 2>&1
if errorlevel 1 (
    set PYTHON_CMD=py
    %PYTHON_CMD% --version >nul 2>&1
    if errorlevel 1 (
        echo [start-ocr] 错误：未找到 Python，请安装 Python 3.10+
        pause
        exit /b 1
    )
)

echo [start-ocr] 使用 Python: %PYTHON_CMD%
%PYTHON_CMD% --version

if /I "%OCR_USE_XPU%"=="true" (
    echo [start-ocr] 检测到 OCR_USE_XPU=true，启用 Intel GPU 模式
    echo [start-ocr] 如需使用 Intel GPU，请先激活 oneAPI 环境：
    echo [start-ocr]   "C:\Program Files (x86)\Intel\oneAPI\setvars.bat"
)

echo [start-ocr] 正在安装依赖...
%PYTHON_CMD% -m pip install -r requirements.txt

echo [start-ocr] 正在启动 PaddleOCR 服务...
echo [start-ocr] 健康检查地址: http://localhost:8000/health
echo [start-ocr] API 地址: http://localhost:8000/ocr
echo [start-ocr] 按 Ctrl+C 停止
echo.

%PYTHON_CMD% main.py

pause
