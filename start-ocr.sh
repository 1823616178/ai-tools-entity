#!/usr/bin/env bash
# 本地管理 RapidOCR + OpenVINO 服务（非 Docker，后台进程模式）
# 用法：
#   ./start-ocr.sh start    后台启动
#   ./start-ocr.sh stop     停止
#   ./start-ocr.sh status   查看状态
#   ./start-ocr.sh restart  重启

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/server_ocr"

PYTHON_CMD="${PYTHON_CMD:-python3}"
VENV_DIR="${VENV_DIR:-$SCRIPT_DIR/server_ocr/.venv}"
PID_FILE="${PID_FILE:-$SCRIPT_DIR/server_ocr/.ocr.pid}"
LOG_DIR="${LOG_DIR:-$SCRIPT_DIR/server_ocr/logs}"

# 解析命令
COMMAND="${1:-start}"

case "$COMMAND" in
    start|stop|status|restart|--help|-h)
        ;;
    *)
        echo "用法: $0 [start|stop|status|restart|--help]"
        echo "  start    后台启动服务"
        echo "  stop     停止服务"
        echo "  status   查看服务状态"
        echo "  restart  重启服务"
        echo "  --help   显示帮助"
        exit 1
        ;;
esac

if [ "$COMMAND" = "--help" ] || [ "$COMMAND" = "-h" ]; then
    echo "用法: $0 [start|stop|status|restart|--help]"
    echo "  start    后台启动服务"
    echo "  stop     停止服务"
    echo "  status   查看服务状态"
    echo "  restart  重启服务"
    exit 0
fi

# 停止服务
stop_service() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "[start-ocr] 正在停止 OCR 服务 (PID: $pid)..."
            kill "$pid"
            rm -f "$PID_FILE"
            echo "[start-ocr] 已停止"
        else
            echo "[start-ocr] 后台进程不存在，清理 PID 文件"
            rm -f "$PID_FILE"
        fi
    else
        echo "[start-ocr] 未找到后台进程 PID 文件"
    fi
}

# 查看状态
show_status() {
    if [ -f "$PID_FILE" ]; then
        pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo "[start-ocr] OCR 服务正在后台运行 (PID: $pid)"
        else
            echo "[start-ocr] 后台进程已不存在，建议删除 PID 文件"
        fi
    else
        echo "[start-ocr] 未找到后台进程"
    fi
}

# 停止逻辑
if [ "$COMMAND" = "stop" ]; then
    stop_service
    exit 0
fi

# 状态逻辑
if [ "$COMMAND" = "status" ]; then
    show_status
    exit 0
fi

# 重启逻辑
if [ "$COMMAND" = "restart" ]; then
    stop_service
fi

# 检查 Python
if ! command -v "$PYTHON_CMD" &> /dev/null; then
    PYTHON_CMD="python"
    if ! command -v "$PYTHON_CMD" &> /dev/null; then
        echo "[start-ocr] 错误：未找到 Python，请安装 Python 3.10+"
        exit 1
    fi
fi

# 创建虚拟环境
if [ ! -d "$VENV_DIR" ]; then
    echo "[start-ocr] 创建虚拟环境: $VENV_DIR"
    "$PYTHON_CMD" -m venv "$VENV_DIR"
fi

# 激活虚拟环境
if [ -f "$VENV_DIR/bin/activate" ]; then
    # shellcheck source=/dev/null
    source "$VENV_DIR/bin/activate"
else
    echo "[start-ocr] 错误：无法找到虚拟环境激活脚本"
    exit 1
fi

# 安装/更新依赖
python -m pip install --upgrade pip
echo "[start-ocr] 正在安装依赖..."
pip install -r requirements.txt

# 默认推理后端
if [ -z "$OCR_PROVIDERS" ]; then
    export OCR_PROVIDERS="OpenVINOExecutionProvider,CPUExecutionProvider"
fi

# 检查是否已在运行
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "[start-ocr] 错误：OCR 服务已在后台运行 (PID: $(cat "$PID_FILE"))"
    exit 1
fi

# 创建日志目录
mkdir -p "$LOG_DIR"

echo "[start-ocr] 正在后台启动 RapidOCR + OpenVINO 服务..."
echo "[start-ocr] OCR_PROVIDERS=$OCR_PROVIDERS"
nohup python main.py > "$LOG_DIR/ocr.log" 2>&1 &
pid=$!
echo "$pid" > "$PID_FILE"

echo "[start-ocr] 服务已后台启动 (PID: $pid)"
echo "[start-ocr] 健康检查地址: http://localhost:8000/health"
echo "[start-ocr] API 地址: http://localhost:8000/ocr"
echo "[start-ocr] 日志文件: server_ocr/logs/ocr.log"
echo "[start-ocr] 停止命令: $0 stop"
