#!/usr/bin/env bash
# 启动 PaddleOCR 服务（本地开发用，使用系统 Python）
# 用法：./start-ocr.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/server_ocr"

PYTHON_CMD="${PYTHON_CMD:-python3}"

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

# 检查 oneAPI 环境（使用 Intel XPU 时需要）
if [ "$OCR_USE_XPU" = "true" ] || [ "$OCR_USE_XPU" = "1" ]; then
    echo "[start-ocr] 检测到 OCR_USE_XPU=true，启用 Intel GPU 模式"
    if [ -z "$ONEAPI_ROOT" ] && [ -z "$SYCL_DEVICE_FILTER" ]; then
        echo "[start-ocr] 警告：未检测到 oneAPI 环境变量，Intel GPU 可能无法正常工作"
        echo "[start-ocr] 如需使用 Intel GPU，请先执行：source /opt/intel/oneapi/setvars.sh"
    fi
fi

# 安装/更新依赖
echo "[start-ocr] 正在安装依赖..."
"$PYTHON_CMD" -m pip install -r requirements.txt

# 启动服务
echo "[start-ocr] 正在启动 PaddleOCR 服务..."
echo "[start-ocr] 健康检查地址: http://localhost:8000/health"
echo "[start-ocr] API 地址: http://localhost:8000/ocr"
echo "[start-ocr] 按 Ctrl+C 停止"
echo ""

"$PYTHON_CMD" main.py
