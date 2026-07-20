# RapidOCR + OpenVINO 服务

为 `aiTool` 项目提供独立的 OCR 识别能力，基于 [RapidOCR](https://github.com/RapidAI/RapidOCR) 与 ONNX Runtime，支持 OpenVINO Execution Provider 以在 Intel CPU/GPU 上加速推理。

## 目录结构

```
server_ocr/
├── main.py           # FastAPI 入口
├── ocr_engine.py     # OCR 引擎（并发控制、线程池、模型预热）
├── config.py         # 配置读取
├── schemas.py        # 请求/响应模型
├── utils.py          # 图片解码、日志等工具
├── requirements.txt
├── Dockerfile
└── README.md
```

## 本地开发（推荐）

项目根目录已提供启动脚本，默认使用**当前 Python 环境**后台启动服务。

### Linux / macOS

```bash
cd aiTool
./start-ocr.sh start        # 后台启动
./start-ocr.sh status       # 查看状态
./start-ocr.sh restart      # 重启
./start-ocr.sh stop         # 停止
```

### Windows

```cmd
cd aiTool
start-ocr.bat start         # 后台启动
start-ocr.bat status        # 查看状态
start-ocr.bat restart       # 重启
start-ocr.bat stop          # 停止
```

### 使用虚拟环境

如果需要使用虚拟环境，先手动创建并安装依赖，然后启动时指定 `USE_VENV=true`：

```bash
cd server_ocr
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 回到项目根目录，使用虚拟环境启动
USE_VENV=true ./start-ocr.sh start
```

服务启动后访问：http://localhost:8000/docs

## systemd 托管（生产环境推荐）

Linux 生产环境建议通过 systemd 托管，支持开机自启和异常自动重启。

### 自动安装

项目根目录提供了一键安装脚本：

```bash
cd aiTool
# 先创建虚拟环境并安装依赖
./start-ocr.sh start
./start-ocr.sh stop

# 安装 systemd service
sudo ./install-service.sh

# 启动服务
sudo systemctl start rapidocr

# 查看状态
sudo systemctl status rapidocr

# 查看日志
sudo journalctl -u rapidocr -f
```

### 手动安装

也可以复制模板文件手动安装：

```bash
cp rapidocr.service.template /etc/systemd/system/rapidocr.service
# 修改文件中的 YOUR_USER 和 /path/to/aiTool 为实际值
sudo vim /etc/systemd/system/rapidocr.service

sudo systemctl daemon-reload
sudo systemctl enable rapidocr
sudo systemctl start rapidocr
```

## Docker 运行（可选）

如果希望通过 Docker 运行：

```bash
cd server_ocr
docker build -t rapidocr-openvino-service .
docker run -d \
  -p 8000:8000 \
  -e OCR_MAX_CONCURRENT=4 \
  -e OCR_WORKERS=1 \
  --name rapidocr-openvino \
  rapidocr-openvino-service
```

### Intel GPU 加速（A770 / iGPU / Arc）

启动容器时映射 GPU 设备，并指定 OpenVINO provider：

```bash
docker run -d \
  --device /dev/dri \
  -p 8000:8000 \
  -e OCR_PROVIDERS="OpenVINOExecutionProvider,CPUExecutionProvider" \
  -e OCR_MAX_CONCURRENT=2 \
  --name rapidocr-openvino \
  rapidocr-openvino-service
```

> 宿主机必须已安装 Intel GPU 驱动（i915 / xe）。

## 推理后端配置

通过环境变量 `OCR_PROVIDERS` 控制 ONNX Runtime 使用的 Execution Provider：

| 硬件 | 推荐配置 |
|---|---|
| Intel CPU / iGPU / Arc A770 | `OpenVINOExecutionProvider,CPUExecutionProvider` |
| NVIDIA GPU | `CUDAExecutionProvider,CPUExecutionProvider` |
| 纯 CPU | `CPUExecutionProvider` |

多个 provider 按从左到右优先级依次尝试。

## API 接口

### `POST /ocr`

识别图片中的文字。

**请求体：**

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "return_lines": true
}
```

`image` 支持：
- Base64 字符串（可带 `data:image/xxx;base64,` 前缀）
- HTTP(S) 图片 URL

**响应：** 见下方 `/ocr/file` 中单页结构。

### `POST /ocr/file`

识别上传文件，支持图片、PDF、Office 文档（doc/docx/xls/xlsx/ppt/pptx）。

Office 文档会先用 LibreOffice 转成 PDF，再逐页识别。

**请求体：**

```json
{
  "file": "data:application/pdf;base64,JVBERi0xLjQK...",
  "filename": "example.pdf",
  "return_lines": true,
  "dpi": 200,
  "max_pages": 50
}
```

`file` 支持：
- Base64 文件（可带 `data:xxx/yyy;base64,` 前缀）
- HTTP(S) 文件 URL

**响应：**

```json
{
  "code": 200,
  "message": "success",
  "result": {
    "filename": "example.pdf",
    "file_type": "pdf",
    "total_pages": 2,
    "full_text": "--- 第 1 页 ---\n...",
    "pages": [
      {
        "page": 1,
        "text": "第一页文本",
        "lines": [
          {
            "text": "第一行",
            "confidence": 0.98,
            "box": { "top_left": {...}, "top_right": {...}, "bottom_right": {...}, "bottom_left": {...} }
          }
        ],
        "image_width": 1654,
        "image_height": 2339
      }
    ]
  }
}
```

### `GET /health`

健康检查。

### `GET /ready`

就绪检查（Kubernetes 风格）。

## 日志

默认同时输出到控制台和按天滚动的日志文件 `server_ocr/logs/ocr.log`。

可通过环境变量配置：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `OCR_LOG_LEVEL` | 日志级别（DEBUG/INFO/WARNING/ERROR） | `INFO` |
| `OCR_LOG_DIR` | 日志目录 | `./logs` |
| `OCR_LOG_FILE` | 日志文件名 | `ocr.log` |
| `OCR_LOG_BACKUP_DAYS` | 保留日志天数 | `30` |
| `OCR_LOG_REQUEST_BODY` | 是否记录请求体（含图片数据，谨慎开启） | `false` |
| `OCR_PROVIDERS` | ONNX Runtime Execution Provider 列表 | `OpenVINOExecutionProvider,CPUExecutionProvider` |

## 并发模型

本服务采用三层并发控制：

1. **Semaphore 限流**：`OCR_MAX_CONCURRENT` 控制同时进入推理的请求数，防止 CPU/GPU 被挤占或 OOM。
2. **线程池**：`OCR_THREAD_WORKERS` 控制执行同步 RapidOCR 推理的线程数，避免阻塞事件循环。
3. **多 Worker 进程**：`OCR_WORKERS` 控制 Uvicorn 工作进程数，每个进程独立加载一份模型，适合多核 CPU。

### 推荐配置

| 场景 | OCR_WORKERS | OCR_MAX_CONCURRENT | OCR_THREAD_WORKERS |
|---|---|---|---|
| 4 核 CPU 开发机 | 1 | 4 | 4 |
| 8 核 CPU 生产机 | 2 | 4~6 | 4 |
| Intel GPU 单卡 | 1 | 2~4 | 2~4 |

> 注意：每增加一个 worker，内存会多一份模型占用（约 200MB~500MB）。

## 与主项目集成

OCR 服务默认在容器/主机外部独立运行，Nuxt 后端通过环境变量 `NUXT_PADDLE_OCR_URL`（或旧名 `PADDLE_OCR_URL`）调用：

```
http://localhost:8000/ocr
```

> 服务内部已改为 RapidOCR + OpenVINO，但 API 路径保持不变，Nuxt 后端无需修改。

在 `.env` 中配置：

```env
NUXT_PADDLE_OCR_URL=http://localhost:8000/ocr
```

详细集成方式见根目录 `.env.example`。
