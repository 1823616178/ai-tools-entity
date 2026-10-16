# aiTool — AI 工具平台

基于 Nuxt 4 的全栈 AI 工具平台，集成大模型对话、摘要生成、文件问答、问答式检索、OCR 文字识别、NER 实体识别等能力，前后端一体部署。

## 功能特性

- **大模型对话** — 基于 LangChain 接入 OpenAI 兼容接口（DeepSeek 等），支持流式输出
- **摘要生成** — 对输入文本自动生成摘要，支持流式返回
- **文件问答** — 上传文档内容后针对文件内容提问
- **文件问题推荐** — 自动分析文件内容并生成推荐问题
- **问答式检索** — 结合检索结果的问答案流式输出
- **OCR 识别** — 独立 Python 服务（RapidOCR + OpenVINO），支持图片 / PDF / Office 文档
- **NER 实体识别** — 调用外部命名实体识别服务
- **管理后台** — LLM 配置的增删改查（TypeORM + MySQL）
- **辅助接口** — 预设问题、后续问题推荐、诗词创作、句读解析、翻译、类型智能切换等

## 技术栈

| 层次 | 技术 |
|---|---|
| 前端 / 后端框架 | Nuxt 4（Vue 3 + Nitro） |
| 语言 | TypeScript |
| 数据库 | MySQL（TypeORM） |
| 缓存 | Redis（ioredis） |
| 大模型 | LangChain + OpenAI 兼容接口 |
| OCR 服务 | Python FastAPI + RapidOCR + ONNX Runtime / OpenVINO |
| 部署 | Docker / docker-compose |

## 目录结构

```
├── app/pages/            # 前端页面（对话、摘要、文件问答、OCR、管理后台等）
├── server/
│   ├── api/              # 管理类 API（LLM 配置）
│   ├── routes/           # 业务接口（问答、摘要、检索、OCR 代理等）
│   ├── entities/         # TypeORM 实体
│   ├── types/            # 全局类型声明
│   └── utils/            # LLM 封装、Redis、日志、数据源等
├── server_ocr/           # 独立 OCR 服务（FastAPI + RapidOCR）
├── doc/                  # 接口文档
├── Dockerfile            # 主应用多阶段构建
├── docker-compose.yml    # 主应用编排（端口 54350）
├── start-ocr.sh / .bat   # OCR 服务本地启动脚本
└── install-service.sh    # OCR 服务 systemd 安装脚本
```

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 按实际情况修改数据库、Redis、LLM、OCR 等配置
```

核心配置项（均以 `NUXT_` 前缀命名，与 `runtimeConfig` 自动对应）：

| 变量 | 说明 |
|---|---|
| `NUXT_DB_*` | MySQL 数据库连接 |
| `NUXT_REDIS_*` | Redis 连接 |
| `NUXT_LLM_BASE_URL` / `NUXT_LLM_API_KEY` / `NUXT_LLM_MODEL` | 大模型接口地址、密钥、模型名 |
| `NUXT_PADDLE_OCR_URL` | OCR 服务地址（默认 `http://localhost:58700/ocr`） |
| `NUXT_NER_API_URL` | NER 服务地址 |
| `NUXT_PUNCTUATION_API_URL` | 句读服务地址 |

### 2. 安装依赖并启动

```bash
yarn install
yarn dev        # http://localhost:3000
```

### 3. 启动 OCR 服务（可选）

OCR 为独立服务，不参与 Nuxt 构建。详见 [server_ocr/README.md](server_ocr/README.md)。

```bash
./start-ocr.sh start        # Linux / macOS
start-ocr.bat start         # Windows
```

启动后访问 http://localhost:58700/docs 查看接口文档。

## 生产部署

### Docker（主应用）

```bash
docker compose up -d --build
# 访问 http://localhost:54350
```

### OCR 服务（systemd，生产推荐）

```bash
sudo ./install-service.sh
sudo systemctl start rapidocr
sudo systemctl status rapidocr
```

也可直接以 Docker 运行 OCR 服务（支持 Intel GPU 加速），详见 [server_ocr/README.md](server_ocr/README.md)。

## API 概览

业务接口位于 `server/routes/`，均为 POST：

| 接口 | 说明 |
|---|---|
| `/chat` | 大模型对话（流式） |
| `/summary_generation` | 摘要生成 |
| `/document_question_answer` | 文件问答 |
| `/document_recommended_questions` | 文件问题推荐 |
| `/follow_up_questions` | 后续问题推荐 |
| `/preset_questions` | 预设问题 |
| `/poetry_creation` | 诗词创作 |
| `/switch_type` | 类型智能切换 |
| `/base/parse` `/base/trans` `/base/ner_rela` | 句读解析 / 翻译 / 实体关系 |
| `/recognize/auto` | 自动识别 |
| `/text_search/questionStream` | 问答式检索（流式） |
| `/api/admin/llm-configs` | LLM 配置管理（GET / POST） |

详细接口定义见 [doc/](doc/) 目录。

## 常用命令

```bash
yarn dev          # 开发
yarn build        # 生产构建
yarn preview      # 预览生产构建
yarn ocr          # 启动 OCR 服务（等价于 ./start-ocr.sh start）
```
