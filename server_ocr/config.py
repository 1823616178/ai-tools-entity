"""
OCR 服务配置
支持通过环境变量覆盖，默认前缀为 OCR_
"""

import os
from dataclasses import dataclass


@dataclass
class Settings:
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 1
    max_concurrent: int = 4
    thread_workers: int = 4

    # OCR 推理后端配置（基于 RapidOCR + onnxruntime-openvino）
    # 可用的 provider 示例：
    #   OpenVINOExecutionProvider  （Intel GPU / CPU，推荐 A770 使用）
    #   CUDAExecutionProvider      （NVIDIA GPU）
    #   CPUExecutionProvider       （纯 CPU 回退）
    # 多个 provider 用逗号分隔，按优先级从左到右尝试
    ocr_providers: str = "OpenVINOExecutionProvider,CPUExecutionProvider"

    # 是否使用方向分类器（RapidOCR 默认启用）
    ocr_use_angle_cls: bool = True

    # 模型下载/缓存目录（RapidOCR 会自动下载 ONNX 模型）
    model_dir: str = "./models"

    log_level: str = "INFO"
    log_dir: str = "./logs"
    log_file: str = "ocr.log"
    log_backup_days: int = 30
    log_format: str = "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s"
    request_timeout: float = 60.0
    enable_warmup: bool = True
    log_request_body: bool = False  # 是否记录请求体（可能包含图片数据，默认关闭）


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


def _env_str(key: str, default: str) -> str:
    return os.getenv(key, default)


def load_settings() -> Settings:
    return Settings(
        host=_env_str("OCR_HOST", "0.0.0.0"),
        port=_env_int("OCR_PORT", 8000),
        workers=_env_int("OCR_WORKERS", 1),
        max_concurrent=_env_int("OCR_MAX_CONCURRENT", 4),
        thread_workers=_env_int("OCR_THREAD_WORKERS", 4),
        ocr_providers=_env_str(
            "OCR_PROVIDERS",
            "OpenVINOExecutionProvider,CPUExecutionProvider",
        ),
        ocr_use_angle_cls=_env_bool("OCR_USE_ANGLE_CLS", True),
        model_dir=_env_str("OCR_MODEL_DIR", "./models"),
        log_level=_env_str("OCR_LOG_LEVEL", "INFO"),
        log_dir=_env_str("OCR_LOG_DIR", "./logs"),
        log_file=_env_str("OCR_LOG_FILE", "ocr.log"),
        log_backup_days=_env_int("OCR_LOG_BACKUP_DAYS", 30),
        log_format=_env_str(
            "OCR_LOG_FORMAT",
            "%(asctime)s | %(levelname)-8s | %(name)-20s | %(message)s",
        ),
        request_timeout=_env_float("OCR_REQUEST_TIMEOUT", 60.0),
        enable_warmup=_env_bool("OCR_ENABLE_WARMUP", True),
        log_request_body=_env_bool("OCR_LOG_REQUEST_BODY", False),
    )
