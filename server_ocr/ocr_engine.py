"""
PaddleOCR 引擎封装：支持并发控制、线程池、模型预热
"""

import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional

import cv2
import numpy as np
from config import Settings
from paddleocr import PaddleOCR
from schemas import Box, OCRResult, Point, TextLine

logger = logging.getLogger(__name__)


class OCREngine:
    """
    并发安全设计：
    1. 启动时加载一次 PaddleOCR 模型，常驻内存
    2. asyncio.Semaphore 限制同时进入推理的请求数，防止 OOM/CPU 挤占
    3. ThreadPoolExecutor 把同步的 ocr.ocr() 调用包装为异步，避免阻塞事件循环
    4. 支持多 worker 进程横向扩展（每个 worker 独立一份模型）
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._semaphore = asyncio.Semaphore(settings.max_concurrent)
        self._executor = ThreadPoolExecutor(
            max_workers=settings.thread_workers,
            thread_name_prefix="ocr_worker",
        )
        self._ocr: Optional[PaddleOCR] = None

    def load(self) -> None:
        """同步加载模型，应在 startup 中调用一次"""
        logger.info("正在加载 PaddleOCR 模型...")
        start = time.time()

        os.makedirs(self.settings.model_dir, exist_ok=True)

        self._ocr = PaddleOCR(
            use_angle_cls=self.settings.ocr_use_angle_cls,
            lang=self.settings.ocr_lang,
            use_gpu=self.settings.ocr_use_gpu,
            det_model_dir=os.path.join(self.settings.model_dir, "det"),
            rec_model_dir=os.path.join(self.settings.model_dir, "rec"),
            cls_model_dir=os.path.join(self.settings.model_dir, "cls"),
            show_log=False,
        )
        logger.info(f"PaddleOCR 模型加载完成，耗时 {time.time() - start:.2f}s")

    def warmup(self) -> None:
        """用空白图预热一次，避免首次请求过慢"""
        if not self.settings.enable_warmup:
            return
        logger.info("模型预热中...")
        dummy = np.zeros((100, 100, 3), dtype=np.uint8)
        try:
            self._ocr.ocr(dummy, cls=self.settings.ocr_use_angle_cls)
            logger.info("模型预热完成")
        except Exception as exc:
            logger.warning(f"模型预热失败（不影响服务）: {exc}")

    async def recognize(
        self,
        img: np.ndarray,
        return_lines: bool = True,
    ) -> OCRResult:
        """
        异步识别接口
        """
        if self._ocr is None:
            raise RuntimeError("OCR 引擎尚未加载")

        async with self._semaphore:
            loop = asyncio.get_running_loop()
            start = time.time()
            raw_result = await loop.run_in_executor(
                self._executor,
                self._sync_ocr,
                img,
            )
            logger.info(f"单次 OCR 推理耗时 {time.time() - start:.2f}s")
            return self._format_result(raw_result, img, return_lines)

    def _sync_ocr(self, img: np.ndarray):
        """同步调用 PaddleOCR"""
        # 浅拷贝避免多线程下对同一张图的并发修改问题
        img_copy = img.copy()
        return self._ocr.ocr(
            img_copy,
            cls=self.settings.ocr_use_angle_cls,
        )

    def _format_result(
        self,
        raw_result,
        img: np.ndarray,
        return_lines: bool,
    ) -> OCRResult:
        height, width = img.shape[:2]
        lines: List[TextLine] = []
        full_text_parts: List[str] = []

        # PaddleOCR 返回 [[det_result]] 或 None
        if raw_result is None or len(raw_result) == 0:
            return OCRResult(text="", lines=[], image_width=width, image_height=height)

        page_result = raw_result[0]
        if page_result is None:
            return OCRResult(text="", lines=[], image_width=width, image_height=height)

        for item in page_result:
            if item is None:
                continue
            box_coords, (text, score) = item
            if text is None:
                continue
            full_text_parts.append(text)
            if return_lines:
                lines.append(
                    TextLine(
                        text=text,
                        confidence=float(score),
                        box=self._box_from_coords(box_coords),
                    )
                )

        return OCRResult(
            text="\n".join(full_text_parts),
            lines=lines,
            image_width=width,
            image_height=height,
        )

    @staticmethod
    def _box_from_coords(coords) -> Box:
        if len(coords) < 4:
            coords = list(coords) + [[0.0, 0.0]] * (4 - len(coords))
        return Box(
            top_left=Point(x=float(coords[0][0]), y=float(coords[0][1])),
            top_right=Point(x=float(coords[1][0]), y=float(coords[1][1])),
            bottom_right=Point(x=float(coords[2][0]), y=float(coords[2][1])),
            bottom_left=Point(x=float(coords[3][0]), y=float(coords[3][1])),
        )

    async def close(self) -> None:
        """优雅关闭线程池"""
        self._executor.shutdown(wait=True, cancel_futures=False)
