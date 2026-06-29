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

**响应：**

```json
{
  "code": 200,
  "message": "success",
  "result": {
    "text": "第一行\n第二行",
    "lines": [
      {
        "text": "第一行",
        "confidence": 0.98,
        "box": {
          "top_left": {"x": 10, "y": 10},
          "top_right": {"x": 100, "y": 10},
          "bottom_right": {"x": 100, "y": 30},
          "bottom_left": {"x": 10, "y": 30}
        }
      }
    ],
    "image_width": 800,
    "image_height": 600
  }
}
```

### `GET /health`

健康检查。

### `GET /ready`

就绪检查（Kubernetes 风格）。

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
