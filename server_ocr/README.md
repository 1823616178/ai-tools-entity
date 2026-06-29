# PaddleOCR 服务

为 `aiTool` 项目提供独立的 OCR 识别能力，支持高并发请求。

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

## 本地开发

```bash
cd server_ocr
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

服务启动后访问：http://localhost:8000/docs

## Docker 运行

```bash
cd server_ocr
docker build -t paddle-ocr-service .
docker run -d \
  -p 8000:8000 \
  -e OCR_MAX_CONCURRENT=4 \
  -e OCR_WORKERS=1 \
  --name paddle-ocr \
  paddle-ocr-service
```

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

## 并发模型

本服务采用三层并发控制：

1. **Semaphore 限流**：`OCR_MAX_CONCURRENT` 控制同时进入推理的请求数，防止 CPU/GPU 被挤占或 OOM。
2. **线程池**：`OCR_THREAD_WORKERS` 控制执行同步 PaddleOCR 推理的线程数，避免阻塞事件循环。
3. **多 Worker 进程**：`OCR_WORKERS` 控制 Uvicorn 工作进程数，每个进程独立加载一份模型，适合多核 CPU。

### 推荐配置

| 场景 | OCR_WORKERS | OCR_MAX_CONCURRENT | OCR_THREAD_WORKERS |
|---|---|---|---|
| 4 核 CPU 开发机 | 1 | 4 | 4 |
| 8 核 CPU 生产机 | 2 | 4~6 | 4 |
| GPU 单卡 | 1 | 2~4 | 2~4 |

> 注意：每增加一个 worker，内存会多一份模型占用（约 500MB~1GB）。

## 与主项目集成

在 `docker-compose.yml` 中已加入 `paddle-ocr` 服务，Nuxt 后端通过环境变量 `PADDLE_OCR_URL` 调用：

```
http://paddle-ocr:8000/ocr
```

详细集成方式见根目录 `docker-compose.yml` 和 `.env.example`。
