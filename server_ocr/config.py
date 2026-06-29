"""
OCR 服务配置
支持通过环境变量覆盖，默认前缀为 OCR_
"""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1
    max_concurrent: int = 4
    thread_workers: int = 4
    ocr_use_angle_cls: bool = True
    ocr_lang: str = "ch"
    ocr_use_gpu: bool = False
    model_dir: str = "./models"
    log_level: str = "INFO"
    request_timeout: float = 60.0
    enable_warmup: bool = True


def _env_bool(key: str, default: bool) -> bool:
    val = os.getenv(key)
    if val is None:
        return default
    return val.lower() in ("1", "true", "yes", "on")


def _env_int(key: str, default: int) -> int:
    val = os.getenv(key)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


def _env_float(key: str, default: float) -> float:
    val = os.getenv(key)
    if val is None:
        return default
    try:
        return float(val)
    except ValueError:
        return default


def load_settings() -> Settings:
    return Settings(
        host=os.getenv("OCR_HOST", "0.0.0.0"),
        port=_env_int("OCR_PORT", 8000),
        workers=_env_int("OCR_WORKERS", 1),
        max_concurrent=_env_int("OCR_MAX_CONCURRENT", 4),
        thread_workers=_env_int("OCR_THREAD_WORKERS", 4),
        ocr_use_angle_cls=_env_bool("OCR_USE_ANGLE_CLS", True),
        ocr_lang=os.getenv("OCR_LANG", "ch"),
        ocr_use_gpu=_env_bool("OCR_USE_GPU", False),
        model_dir=os.getenv("OCR_MODEL_DIR", "./models"),
        log_level=os.getenv("OCR_LOG_LEVEL", "INFO"),
        request_timeout=_env_float("OCR_REQUEST_TIMEOUT", 60.0),
        enable_warmup=_env_bool("OCR_ENABLE_WARMUP", True),
    )
