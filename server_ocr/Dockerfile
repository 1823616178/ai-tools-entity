# RapidOCR + OpenVINO 服务镜像
# 默认 CPU 版本；如需 Intel GPU 加速，启动容器时映射 /dev/dri 设备，
# 并设置 OCR_PROVIDERS=OpenVINOExecutionProvider,CPUExecutionProvider
FROM python:3.11-slim-bookworm

WORKDIR /app

# 安装系统依赖（OpenCV、PDF/Office 转换等需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgl1-mesa-glx \
    poppler-utils \
    libreoffice \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖并安装
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 复制业务代码
COPY . /app

# 预加载 RapidOCR 模型到 models/ 目录，避免首次请求下载导致超时
RUN python -c "from rapidocr import RapidOCR; RapidOCR()" || true

# 创建非 root 用户
RUN useradd -m -u 1001 ocr && chown -R ocr:ocr /app
USER ocr

EXPOSE 8000

ENV OCR_HOST=0.0.0.0
ENV OCR_PORT=8000
ENV OCR_PROVIDERS="OpenVINOExecutionProvider,CPUExecutionProvider"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRYTECODE=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["python", "main.py"]
