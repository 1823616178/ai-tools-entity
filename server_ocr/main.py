"""
PaddleOCR HTTP 服务入口
- 并发控制：asyncio.Semaphore + ThreadPoolExecutor
- 进程扩展：通过 Uvicorn workers 横向扩展
- 输入支持：base64 / URL
- 输出：完整文本 + 逐行坐标/置信度
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from config import load_settings
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ocr_engine import OCREngine
from schemas import OCRFileRequest, OCRFileResult, OCRRequest, OCRResponse, OCRResult
from utils import decode_file, decode_image, setup_logging

settings = load_settings()
setup_logging(
    log_level=settings.log_level,
    log_dir=settings.log_dir,
    log_file=settings.log_file,
    log_backup_days=settings.log_backup_days,
    log_format=settings.log_format,
)
logger = logging.getLogger(__name__)

engine: Optional[OCREngine] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine
    engine = OCREngine(settings)
    engine.load()
    engine.warmup()
    logger.info(
        f"OCR 服务已启动 | host={settings.host}, port={settings.port}, "
        f"workers={settings.workers}, max_concurrent={settings.max_concurrent}, "
        f"thread_workers={settings.thread_workers}, timeout={settings.request_timeout}s"
    )
    logger.info(f"日志级别: {settings.log_level}, 日志目录: {settings.log_dir}")
    yield
    logger.info("OCR 服务正在关闭...")
    if engine:
        await engine.close()


app = FastAPI(
    title="PaddleOCR Service",
    description="支持并发请求的 PaddleOCR HTTP 服务",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("未捕获异常")
    return JSONResponse(
        status_code=500,
        content={"code": 500, "message": f"服务器内部错误: {exc}", "result": None},
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "engine_ready": engine is not None and engine._ocr is not None,
    }


@app.get("/ready")
async def ready():
    if engine is None or engine._ocr is None:
        raise HTTPException(status_code=503, detail="OCR 引擎未就绪")
    return {"status": "ready"}


@app.post("/ocr", response_model=OCRResponse)
async def ocr_endpoint(req: OCRRequest):
    if engine is None:
        raise HTTPException(status_code=503, detail="OCR 引擎未加载")

    start = time.time()
    logger.info(
        f"收到 /ocr 请求, return_lines={req.return_lines}, "
        f"图片长度: {len(req.image)} 字符"
    )

    try:
        _, img = decode_image(req.image)
        logger.info(f"图片解码成功, 尺寸: {img.shape}")
    except ValueError as exc:
        logger.warning(f"图片解析失败: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.warning(f"图片下载/解码异常: {exc}")
        raise HTTPException(status_code=400, detail=f"图片处理失败: {exc}")

    try:
        result: OCRResult = await asyncio.wait_for(
            engine.recognize(img, return_lines=req.return_lines),
            timeout=settings.request_timeout,
        )
    except asyncio.TimeoutError:
        logger.error("OCR 推理超时")
        raise HTTPException(status_code=504, detail="OCR 识别超时")
    except Exception as exc:
        logger.exception("OCR 识别失败")
        raise HTTPException(status_code=500, detail=f"OCR 识别失败: {exc}")

    logger.info(
        f"/ocr 请求完成, 识别行数: {len(result.lines)}, "
        f"总耗时: {time.time() - start:.2f}s"
    )
    return OCRResponse(code=200, message="success", result=result)


@app.post("/ocr/base64")
async def ocr_base64(req: OCRRequest):
    """与 /ocr 等价，保留旧版兼容命名"""
    return await ocr_endpoint(req)


@app.post("/ocr/file")
async def ocr_file_endpoint(req: OCRFileRequest):
    """
    文件识别接口：支持图片、PDF 和 Office 文档
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="OCR 引擎未加载")

    start = time.time()
    logger.info(
        f"收到 /ocr/file 请求, filename={req.filename}, "
        f"return_lines={req.return_lines}, dpi={req.dpi}, "
        f"max_pages={req.max_pages}, 文件数据长度: {len(req.file)} 字符"
    )

    try:
        file_type, file_bytes = decode_file(req.file, req.filename)
        logger.info(
            f"文件解析成功: {req.filename}, 类型: {file_type}, 大小: {len(file_bytes)} bytes"
        )
    except ValueError as exc:
        logger.warning(f"文件解析失败: {exc}")
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.warning(f"文件下载/解码异常: {exc}")
        raise HTTPException(status_code=400, detail=f"文件处理失败: {exc}")

    try:
        result: OCRFileResult = await asyncio.wait_for(
            engine.recognize_file(
                file_type=file_type,
                file_bytes=file_bytes,
                filename=req.filename,
                return_lines=req.return_lines,
                dpi=req.dpi,
                max_pages=req.max_pages,
            ),
            timeout=settings.request_timeout,
        )
    except asyncio.TimeoutError:
        logger.error("文件 OCR 推理超时")
        raise HTTPException(status_code=504, detail="文件识别超时")
    except Exception as exc:
        logger.exception("文件 OCR 识别失败")
        raise HTTPException(status_code=500, detail=f"文件识别失败: {exc}")

    logger.info(
        f"/ocr/file 请求完成: filename={result.filename}, "
        f"file_type={result.file_type}, total_pages={result.total_pages}, "
        f"总耗时: {time.time() - start:.2f}s"
    )
    return {"code": 200, "message": "success", "result": result}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        workers=settings.workers,
        log_level=settings.log_level.lower(),
    )
