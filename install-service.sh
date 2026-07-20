#!/usr/bin/env bash
# 安装 RapidOCR + OpenVINO 的 systemd 服务
# 用法：sudo ./install-service.sh
# 安装后会自动启用服务，但不会自动启动，需手动执行：sudo systemctl start rapidocr

set -e

if [ "$EUID" -ne 0 ]; then
    echo "[install-service] 错误：请使用 sudo 运行此脚本"
    exit 1
fi

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="rapidocr"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# 运行脚本的用户（调用 sudo 前的用户）
RUN_USER="${SUDO_USER:-$USER}"
if [ "$RUN_USER" = "root" ]; then
    RUN_USER="ocr"
    echo "[install-service] 警告：未检测到普通用户，默认使用用户 $RUN_USER"
    echo "[install-service] 如需使用其他用户运行，请先创建该用户并修改 service 文件"
fi

# 确保虚拟环境已存在
VENV_PYTHON="$PROJECT_DIR/server_ocr/.venv/bin/python"
if [ ! -f "$VENV_PYTHON" ]; then
    echo "[install-service] 错误：未找到虚拟环境 $PROJECT_DIR/server_ocr/.venv"
    echo "[install-service] 请先运行 ./start-ocr.sh start 创建虚拟环境并安装依赖"
    exit 1
fi

# 创建运行用户（如果不存在）
if ! id "$RUN_USER" &>/dev/null; then
    echo "[install-service] 创建运行用户: $RUN_USER"
    useradd -r -s /bin/false "$RUN_USER" || true
fi

# 确保目录权限正确
chown -R "$RUN_USER:$RUN_USER" "$PROJECT_DIR/server_ocr"
mkdir -p "$PROJECT_DIR/server_ocr/logs"
mkdir -p "$PROJECT_DIR/server_ocr/models"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=RapidOCR OpenVINO Service
After=network.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_USER
WorkingDirectory=$PROJECT_DIR/server_ocr
Environment=OCR_PROVIDERS=OpenVINOExecutionProvider,CPUExecutionProvider
Environment=OCR_HOST=0.0.0.0
Environment=OCR_PORT=8000
Environment=OCR_WORKERS=1
Environment=OCR_MAX_CONCURRENT=4
Environment=OCR_THREAD_WORKERS=4
Environment=OCR_LOG_DIR=$PROJECT_DIR/server_ocr/logs
Environment=OCR_MODEL_DIR=$PROJECT_DIR/server_ocr/models
ExecStart=$VENV_PYTHON $PROJECT_DIR/server_ocr/main.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "[install-service] 已安装并启用 $SERVICE_NAME.service"
echo "[install-service] 启动命令: sudo systemctl start $SERVICE_NAME"
echo "[install-service] 查看状态: sudo systemctl status $SERVICE_NAME"
echo "[install-service] 查看日志: sudo journalctl -u $SERVICE_NAME -f"
