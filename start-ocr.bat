@echo off
chcp 65001 >nul
REM 本地管理 RapidOCR + OpenVINO 服务（非 Docker，后台进程模式）
REM 用法：
REM   start-ocr.bat start        后台启动（使用当前 Python 环境）
REM   start-ocr.bat stop         停止
REM   start-ocr.bat status       查看状态
REM   start-ocr.bat restart      重启
REM   set USE_VENV=true && start-ocr.bat start   使用 server_ocr\.venv 虚拟环境

setlocal EnableDelayedExpansion

cd /d "%~dp0server_ocr"

set PYTHON_CMD=python
set PID_FILE=.ocr.pid
set LOG_DIR=logs
set USE_VENV=%USE_VENV:false%
set OCR_PORT=%OCR_PORT:58700%

set COMMAND=%~1
if "%COMMAND%"=="" set COMMAND=start

if /I "%COMMAND%"=="--help" goto :show_help
if /I "%COMMAND%"=="-h" goto :show_help
if /I "%COMMAND%"=="start" goto :run_start
if /I "%COMMAND%"=="stop" goto :run_stop
if /I "%COMMAND%"=="status" goto :run_status
if /I "%COMMAND%"=="restart" goto :run_restart

echo [start-ocr] 未知参数: %COMMAND%
goto :show_help

:show_help
echo 用法: %~nx0 [start^|stop^|status^|restart^|--help]
echo   start    后台启动服务
echo   stop     停止服务
echo   status   查看服务状态
echo   restart  重启服务
echo.
echo 环境变量:
echo   USE_VENV=true     使用 server_ocr\.venv 虚拟环境
echo   PYTHON_CMD=python 指定 Python 命令
exit /b 0

:run_stop
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

:run_status
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    tasklist /FI "PID eq !PID!" 2>nul | findstr /I "python" >nul
    if !errorlevel! == 0 (
        echo [start-ocr] OCR 服务正在后台运行 (PID: !PID!)
    ) else (
        echo [start-ocr] 后台进程已不存在
    )
) else (
    echo [start-ocr] 未找到后台进程
)
exit /b 0

:run_restart
call :run_stop
goto :run_start

:run_start
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

REM 如果使用虚拟环境则激活
if /I "%USE_VENV%"=="true" (
    if exist ".venv\Scripts\activate.bat" (
        call .venv\Scripts\activate.bat
        echo [start-ocr] 已激活虚拟环境: .venv
    ) else (
        echo [start-ocr] 错误：未找到虚拟环境 .venv
        echo [start-ocr] 如需创建虚拟环境，请先手动创建：python -m venv .venv
        pause
        exit /b 1
    )
)

echo [start-ocr] 使用 Python: %PYTHON_CMD%
%PYTHON_CMD% --version

REM 默认推理后端
if not defined OCR_PROVIDERS (
    set OCR_PROVIDERS=OpenVINOExecutionProvider,CPUExecutionProvider
)

REM 检查是否已在运行
if exist "%PID_FILE%" (
    set /p PID=<"%PID_FILE%"
    tasklist /FI "PID eq !PID!" 2>nul | findstr /I "python" >nul
    if !errorlevel! == 0 (
        echo [start-ocr] 错误：OCR 服务已在后台运行 (PID: !PID!)
        exit /b 1
    )
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [start-ocr] 正在后台启动 RapidOCR + OpenVINO 服务...
echo [start-ocr] OCR_PROVIDERS=%OCR_PROVIDERS%
echo [start-ocr] OCR_PORT=%OCR_PORT%
set OCR_PORT=%OCR_PORT%
start /B %PYTHON_CMD% main.py > "%LOG_DIR%\ocr.log" 2>&1

echo [start-ocr] 服务已后台启动
echo [start-ocr] 健康检查地址: http://localhost:%OCR_PORT%/health
echo [start-ocr] API 地址: http://localhost:%OCR_PORT%/ocr
echo [start-ocr] 日志文件: server_ocr/logs/ocr.log
echo [start-ocr] 停止命令: %~nx0 stop

exit /b 0
