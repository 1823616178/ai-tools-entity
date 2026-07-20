@echo off
chcp 65001 >nul
REM 本地启动 RapidOCR + OpenVINO 服务（非 Docker）
REM 用法：
REM   start-ocr.bat              前台运行
REM   start-ocr.bat --daemon     后台运行（新窗口）
REM   start-ocr.bat --stop       停止后台进程

setlocal EnableDelayedExpansion

cd /d "%~dp0server_ocr"

set PYTHON_CMD=python
set VENV_DIR=.venv
set PID_FILE=.ocr.pid

if /I "%~1"=="--help" (
    echo 用法: %~nx0 [--daemon^|--stop^|--help]
    echo   --daemon, -d   后台运行（新窗口）
    echo   --stop, -s     停止后台进程
    echo   --help, -h     显示帮助
    exit /b 0
)

if /I "%~1"=="-h" (
    echo 用法: %~nx0 [--daemon^|--stop^|--help]
    echo   --daemon, -d   后台运行（新窗口）
    echo   --stop, -s     停止后台进程
    echo   --help, -h     显示帮助
    exit /b 0
)

REM 停止后台进程
if /I "%~1"=="--stop" goto :stop_service
if /I "%~1"=="-s" goto :stop_service

REM 后台运行
if /I "%~1"=="--daemon" goto :daemon_mode
if /I "%~1"=="-d" goto :daemon_mode

REM 未知参数
if not "%~1"=="" (
    echo [start-ocr] 未知参数: %~1
    exit /b 1
)

goto :run_foreground

:stop_service
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    echo [start-ocr] 正在停止 OCR 服务 (PID: !PID!)...
    taskkill /PID !PID! /F >nul 2>&1
    del "%PID_FILE%"
    echo [start-ocr] 已停止
) else (
    echo [start-ocr] 未找到后台进程 PID 文件
)
exit /b 0

:daemon_mode
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    tasklist /FI "PID eq !PID!" 2>nul | findstr /I "python" >nul
    if !errorlevel! == 0 (
        echo [start-ocr] 错误：OCR 服务已在后台运行 (PID: !PID!)
        exit /b 1
    )
)

echo [start-ocr] 正在后台启动 RapidOCR + OpenVINO 服务...
start "RapidOCR Service" cmd /c "cd /d "%CD%" && call .venv\Scripts\activate.bat && python main.py"
REM 获取最后启动的窗口进程 PID 较复杂，这里仅提示用户手动关闭窗口或重启后使用 taskkill
exit /b 0

:run_foreground
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

REM 创建虚拟环境
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo [start-ocr] 创建虚拟环境: %VENV_DIR%
    %PYTHON_CMD% -m venv %VENV_DIR%
)

REM 激活虚拟环境并安装依赖
call %VENV_DIR%\Scripts\activate.bat
python -m pip install --upgrade pip
echo [start-ocr] 正在安装依赖...
pip install -r requirements.txt

REM 提示当前推理后端
if defined OCR_PROVIDERS (
    echo [start-ocr] 检测到 OCR_PROVIDERS=%OCR_PROVIDERS%
) else (
    set OCR_PROVIDERS=OpenVINOExecutionProvider,CPUExecutionProvider
    echo [start-ocr] 默认使用 OCR_PROVIDERS=%OCR_PROVIDERS%
)

echo [start-ocr] 正在前台启动 RapidOCR + OpenVINO 服务...
echo [start-ocr] 健康检查地址: http://localhost:8000/health
echo [start-ocr] API 地址: http://localhost:8000/ocr
echo [start-ocr] 按 Ctrl+C 停止
echo.

python main.py

pause
