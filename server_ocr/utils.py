"""
通用工具：图片/PDF/Office 解码、日志初始化
"""

import base64
import io
import logging
import logging.handlers
import os
import re
import subprocess
import sys
import tempfile
from typing import List, Tuple

import cv2
import numpy as np
import requests
from pdf2image import convert_from_bytes
from PIL import Image


def setup_logging(
    log_level: str = "INFO",
    log_dir: str = "./logs",
    log_file: str = "ocr.log",
    log_backup_days: int = 30,
    log_format: str = "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s",
) -> None:
    """
    初始化日志：同时输出到控制台和按天滚动的文件
    """
    level = getattr(logging, log_level.upper(), logging.INFO)
    formatter = logging.Formatter(log_format)

    # 根日志器
    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    # 清除已有 handler，避免重复
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)

    # 控制台 handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # 文件 handler（按天滚动）
    try:
        os.makedirs(log_dir, exist_ok=True)
        file_path = os.path.join(log_dir, log_file)
        file_handler = logging.handlers.TimedRotatingFileHandler(
            filename=file_path,
            when="midnight",
            interval=1,
            backupCount=log_backup_days,
            encoding="utf-8",
        )
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        # 滚动后文件名加上日期后缀
        file_handler.suffix = "%Y-%m-%d"
        root_logger.addHandler(file_handler)

        logging.getLogger(__name__).info(f"日志文件: {file_path}")
    except Exception as exc:
        logging.getLogger(__name__).warning(f"文件日志初始化失败: {exc}")


def decode_image(image_source: str) -> Tuple[bytes, np.ndarray]:
    """
    把输入（base64 或 URL）解码为原始 bytes 和 OpenCV 图片
    """
    logger = logging.getLogger(__name__)
    logger.info(
        f"开始解码图片，来源类型: {'URL' if image_source.startswith('http') else 'base64'}"
    )

    if image_source.startswith("http://") or image_source.startswith("https://"):
        return _load_from_url(image_source)
    return _load_from_base64(image_source)


def decode_file(file_source: str, filename: str = "uploaded_file") -> Tuple[str, bytes]:
    """
    把 base64 文件解码为原始 bytes，并返回识别出的文件类型
    """
    logger = logging.getLogger(__name__)
    logger.info(
        f"开始解码文件: {filename}，来源类型: {'URL' if file_source.startswith('http') else 'base64'}"
    )

    if file_source.startswith("http://") or file_source.startswith("https://"):
        return _load_file_from_url(file_source)
    return _load_file_from_base64(file_source, filename)


def _load_from_url(url: str, timeout: float = 30.0) -> Tuple[bytes, np.ndarray]:
    logger = logging.getLogger(__name__)
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        logger.info(f"图片下载成功: {url}, 大小: {len(resp.content)} bytes")
    except Exception as exc:
        logger.error(f"图片下载失败: {url}, 错误: {exc}")
        raise ValueError(f"无法下载图片: {exc}") from exc

    image_bytes = resp.content
    img = _bytes_to_cv2(image_bytes)
    return image_bytes, img


def _load_file_from_url(url: str, timeout: float = 30.0) -> Tuple[str, bytes]:
    logger = logging.getLogger(__name__)
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        logger.info(f"文件下载成功: {url}, 大小: {len(resp.content)} bytes")
    except Exception as exc:
        logger.error(f"文件下载失败: {url}, 错误: {exc}")
        raise ValueError(f"无法下载文件: {exc}") from exc

    content_type = resp.headers.get("Content-Type", "application/octet-stream")
    file_type = _normalize_file_type(content_type)
    logger.info(f"文件类型识别: {file_type}")
    return file_type, resp.content


def _load_from_base64(b64_string: str) -> Tuple[bytes, np.ndarray]:
    # 去除 data:image/xxx;base64, 前缀
    clean = re.sub(r"^data:image/[a-zA-Z0-9.+]+;base64,", "", b64_string)
    clean = clean.strip()
    if not clean:
        raise ValueError("图片 base64 为空")

    try:
        image_bytes = base64.b64decode(clean)
    except Exception as exc:
        raise ValueError(f"base64 解码失败: {exc}") from exc

    img = _bytes_to_cv2(image_bytes)
    return image_bytes, img


def _load_file_from_base64(b64_string: str, filename: str) -> Tuple[str, bytes]:
    logger = logging.getLogger(__name__)
    # 去除 data:xxx/yyy;base64, 前缀
    clean = re.sub(r"^data:[a-zA-Z0-9.+]+/[a-zA-Z0-9.+]+;base64,", "", b64_string)
    clean = clean.strip()
    if not clean:
        raise ValueError("文件 base64 为空")

    try:
        file_bytes = base64.b64decode(clean)
    except Exception as exc:
        logger.error(f"文件 base64 解码失败: {exc}")
        raise ValueError(f"文件 base64 解码失败: {exc}") from exc

    file_type = _detect_file_type(filename, file_bytes)
    logger.info(
        f"文件解码成功: {filename}, 类型: {file_type}, 大小: {len(file_bytes)} bytes"
    )
    return file_type, file_bytes


def _detect_file_type(filename: str, file_bytes: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".pdf",):
        return "pdf"
    if ext in (".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tiff", ".tif", ".gif"):
        return "image"
    if ext in (".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"):
        return "office"
    # 通过魔数兜底
    if file_bytes.startswith(b"%PDF"):
        return "pdf"
    if file_bytes.startswith(b"\x89PNG") or file_bytes.startswith(b"\xff\xd8"):
        return "image"
    if file_bytes.startswith(b"PK") or file_bytes.startswith(b"\xd0\xcf\x11\xe0"):
        return "office"
    return "unknown"


def _normalize_file_type(content_type: str) -> str:
    ct = content_type.lower()
    if "pdf" in ct:
        return "pdf"
    if "image" in ct:
        return "image"
    if any(x in ct for x in ["word", "excel", "powerpoint", "officedocument"]):
        return "office"
    return "unknown"


def _bytes_to_cv2(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("无法解析图片，请确认格式正确（jpg/png/bmp 等）")
    return img


def cv2_to_bytes(img: np.ndarray, ext: str = ".png") -> bytes:
    success, encoded = cv2.imencode(ext, img)
    if not success:
        raise ValueError("OpenCV 编码失败")
    return encoded.tobytes()


def pdf_to_images(
    pdf_bytes: bytes,
    dpi: int = 200,
    max_pages: int = 0,
) -> List[np.ndarray]:
    """
    把 PDF bytes 转成 OpenCV 图片列表
    """
    logger = logging.getLogger(__name__)
    logger.info(
        f"开始 PDF 转图片, 大小: {len(pdf_bytes)} bytes, dpi: {dpi}, max_pages: {max_pages or '无限制'}"
    )

    try:
        pil_images = convert_from_bytes(
            pdf_bytes,
            dpi=dpi,
            fmt="png",
            thread_count=2,
        )
    except Exception as exc:
        logger.error(f"PDF 解析失败: {exc}")
        raise ValueError(f"PDF 解析失败: {exc}") from exc

    if max_pages > 0:
        pil_images = pil_images[:max_pages]

    logger.info(f"PDF 共 {len(pil_images)} 页")

    images: List[np.ndarray] = []
    for pil_img in pil_images:
        # RGB 转 BGR 供 OpenCV 使用
        cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        images.append(cv_img)

    return images


def pil_to_cv2(pil_img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)


def office_to_pdf(file_bytes: bytes, filename: str, timeout: float = 120.0) -> bytes:
    """
    使用 LibreOffice 把 Office 文档（doc/docx/xls/xlsx/ppt/pptx）转成 PDF
    返回 PDF 文件 bytes
    """
    logger = logging.getLogger(__name__)
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"):
        raise ValueError(f"不支持的 Office 格式: {ext}")

    logger.info(f"开始 Office 转 PDF: {filename}, 大小: {len(file_bytes)} bytes")

    with tempfile.TemporaryDirectory() as tmpdir:
        input_path = os.path.join(tmpdir, filename)
        with open(input_path, "wb") as f:
            f.write(file_bytes)

        try:
            proc = subprocess.run(
                [
                    "libreoffice",
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    tmpdir,
                    input_path,
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            logger.error(f"LibreOffice 转换超时（>{timeout}s）")
            raise ValueError(f"LibreOffice 转换超时（>{timeout}s）") from exc
        except FileNotFoundError as exc:
            logger.error("未找到 LibreOffice，请确认已安装")
            raise ValueError("未找到 LibreOffice，请确认已安装") from exc

        if proc.returncode != 0:
            err = proc.stderr.decode("utf-8", errors="ignore")[:500]
            logger.error(f"LibreOffice 转换失败: {err}")
            raise ValueError(f"LibreOffice 转换失败: {err}")

        # 转换后的文件名与输入文件同名，只是扩展名变为 .pdf
        base_name = os.path.splitext(filename)[0]
        pdf_path = os.path.join(tmpdir, base_name + ".pdf")

        # LibreOffice 有时会用原始文件名输出，但实际文件名可能不同，兜底查找
        if not os.path.exists(pdf_path):
            pdf_files = [f for f in os.listdir(tmpdir) if f.lower().endswith(".pdf")]
            if not pdf_files:
                raise ValueError("LibreOffice 转换后未找到 PDF 文件")
            pdf_path = os.path.join(tmpdir, pdf_files[0])

        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    logger.info(f"Office 转 PDF 成功: {filename} -> {len(pdf_bytes)} bytes")
    return pdf_bytes
