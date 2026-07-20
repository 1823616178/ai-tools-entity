#!/usr/bin/env bash
# 本地启动 RapidOCR + OpenVINO 服务（非 Docker）
# 用法：
#   ./start-ocr.sh              前台运行
#   ./start-ocr.sh --daemon     后台运行（日志写入 server_ocr/logs/ocr.log）
#   ./start-ocr.sh --stop       停止后台进程
#   ./start-ocr.sh --status     查看后台进程状态

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/server_ocr"

PYTHON_CMD="${PYTHON_CMD:-python3}"
VENV_DIR="${VENV_DIR:-$SCRIPT_DIR/server_ocr/.venv}"
PID_FILE="${PID_FILE:-$SCRIPT_DIR/server_ocr/.ocr.pid}"

# 解析参数
DAEMON_MODE=false
STOP_MODE=false
STATUS_MODE=false

for arg in "$@"; do
    case "$arg" in
        --daemon|-d)
            DAEMON_MODE=true
            ;;
        --stop|-s)
            STOP_MODE=true
            ;;
        --status|-t)
            STATUS_MODE=true
            ;;
        --help|-h)
            echo "用法: $0 [--daemon|--stop|--status|--help]"
            echo "  --daemon, -d   后台运行"
            echo "  --stop, -s     停止后台进程"
            echo "  --status, -t   查看后台进程状态"
            echo "  --help, -h     显示帮助"
            exit 0
            ;;
        *)
            echo "[start-ocr] 未知参数: $arg"
            exit 1
            ;;
    esac
done

# 停止后台进程
if [ "$STOP_MODE" = true ]; then
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
    exit 0
fi

# 查看后台进程状态
if [ "$STATUS_MODE" = true ]; then
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
    exit 0
fi

# 检查 Python
if ! command -v "$PYTHON_CMD" &> /dev/null; then
    PYTHON_CMD="python"
    if ! command -v "$PYTHON_CMD" &> /dev/null; then
        echo "[start-ocr] 错误：未找到 Python，请安装 Python 3.10+"
        exit 1
    fi
fi

echo "[start-ocr] 使用 Python: $PYTHON_CMD"
"$PYTHON_CMD" --version

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

# 升级 pip
python -m pip install --upgrade pip

# 安装依赖
echo "[start-ocr] 正在安装依赖..."
pip install -r requirements.txt

# 提示当前推理后端
if [ -n "$OCR_PROVIDERS" ]; then
    echo "[start-ocr] 检测到 OCR_PROVIDERS=$OCR_PROVIDERS"
else
    export OCR_PROVIDERS="OpenVINOExecutionProvider,CPUExecutionProvider"
    echo "[start-ocr] 默认使用 OCR_PROVIDERS=$OCR_PROVIDERS"
fi

# 启动服务
if [ "$DAEMON_MODE" = true ]; then
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "[start-ocr] 错误：OCR 服务已在后台运行 (PID: $(cat "$PID_FILE"))"
        exit 1
    fi

    echo "[start-ocr] 正在后台启动 RapidOCR + OpenVINO 服务..."
    nohup python main.py > /dev/null 2>&1 &
    pid=$!
    echo "$pid" > "$PID_FILE"
    echo "[start-ocr] 服务已后台启动 (PID: $pid)"
    echo "[start-ocr] 健康检查地址: http://localhost:8000/health"
    echo "[start-ocr] API 地址: http://localhost:8000/ocr"
    echo "[start-ocr] 日志文件: server_ocr/logs/ocr.log"
    echo "[start-ocr] 停止命令: $0 --stop"
else
    echo "[start-ocr] 正在前台启动 RapidOCR + OpenVINO 服务..."
    echo "[start-ocr] 健康检查地址: http://localhost:8000/health"
    echo "[start-ocr] API 地址: http://localhost:8000/ocr"
    echo "[start-ocr] 按 Ctrl+C 停止"
    echo ""
    python main.py
fi
