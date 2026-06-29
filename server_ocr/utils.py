"""
通用工具：图片解码、日志初始化
"""

import base64
import io
import logging
import re
import sys
from typing import Tuple

import cv2
import numpy as np
import requests


def setup_logging(log_level: str = "INFO") -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    logging.basicConfig(
        level=level,
        format=fmt,
        handlers=[logging.StreamHandler(sys.stdout)],
    )


def decode_image(image_source: str) -> Tuple[bytes, np.ndarray]:
    """
    把输入（base64 或 URL）解码为原始 bytes 和 OpenCV 图片
    """
    if image_source.startswith("http://") or image_source.startswith("https://"):
        return _load_from_url(image_source)
    return _load_from_base64(image_source)


def _load_from_url(url: str, timeout: float = 30.0) -> Tuple[bytes, np.ndarray]:
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
    except Exception as exc:
        raise ValueError(f"无法下载图片: {exc}") from exc

    image_bytes = resp.content
    img = _bytes_to_cv2(image_bytes)
    return image_bytes, img


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
