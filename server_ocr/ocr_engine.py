"""
OCR 引擎封装：基于 RapidOCR + ONNX Runtime（支持 OpenVINO Execution Provider）
提供并发控制、线程池、模型预热能力。
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
from rapidocr import EngineType, RapidOCR
from schemas import Box, OCRFileResult, OCRPageResult, OCRResult, Point, TextLine
from utils import office_to_pdf, pdf_to_images

logger = logging.getLogger(__name__)


class OCREngine:
    """
    并发安全设计：
    1. 启动时加载一次 RapidOCR 模型，常驻内存
    2. asyncio.Semaphore 限制同时进入推理的请求数
    3. ThreadPoolExecutor 把同步的 engine() 调用包装为异步，避免阻塞事件循环
    4. 支持多 worker 进程横向扩展（每个 worker 独立一份模型）
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self._semaphore = asyncio.Semaphore(settings.max_concurrent)
        self._executor = ThreadPoolExecutor(
            max_workers=settings.thread_workers,
            thread_name_prefix="ocr_worker",
        )
        self._ocr: Optional[RapidOCR] = None

    def load(self) -> None:
        """同步加载模型，应在 startup 中调用一次"""
        logger.info("=" * 50)
        logger.info("正在加载 RapidOCR 模型...")

        providers = self._parse_providers(self.settings.ocr_providers)
        logger.info(f"ONNX Runtime providers: {providers}")

        start = time.time()

        # 模型目录不存在时自动创建，RapidOCR 会自动下载 ONNX 模型到该目录
        os.makedirs(self.settings.model_dir, exist_ok=True)

        self._ocr = RapidOCR(
            params={
                "Det.engine_type": EngineType.ONNXRUNTIME,
                "Cls.engine_type": EngineType.ONNXRUNTIME,
                "Rec.engine_type": EngineType.ONNXRUNTIME,
                "EngineConfig.onnxruntime.providers": providers,
                "Global.model_root_dir": self.settings.model_dir,
                "Global.use_cls": self.settings.ocr_use_angle_cls,
            }
        )

        logger.info(f"RapidOCR 模型加载完成，耗时 {time.time() - start:.2f}s")
        logger.info("=" * 50)

    def warmup(self) -> None:
        """用空白图预热一次，避免首次请求过慢"""
        ocr = self._ocr
        if not self.settings.enable_warmup or ocr is None:
            return
        logger.info("模型预热中...")
        dummy = np.ones((100, 100, 3), dtype=np.uint8) * 255
        try:
            ocr(dummy)
            logger.info("模型预热完成")
        except Exception as exc:
            logger.warning(f"模型预热失败（不影响服务）: {exc}")

    async def recognize(
        self,
        img: np.ndarray,
        return_lines: bool = True,
    ) -> OCRResult:
        """异步识别接口"""
        if self._ocr is None:
            raise RuntimeError("OCR 引擎尚未加载")

        height, width = img.shape[:2]
        logger.info(f"开始 OCR 识别, 图片尺寸: {width}x{height}")

        async with self._semaphore:
            loop = asyncio.get_running_loop()
            start = time.time()
            raw_result = await loop.run_in_executor(
                self._executor,
                self._sync_ocr,
                img,
            )
            elapsed = time.time() - start
            result = self._format_result(raw_result, img, return_lines)
            logger.info(
                f"OCR 识别完成, 图片尺寸: {width}x{height}, "
                f"识别行数: {len(result.lines)}, 耗时: {elapsed:.2f}s"
            )
            return result

    def _sync_ocr(self, img):
        """同步调用 RapidOCR"""
        ocr = self._ocr
        if ocr is None:
            raise RuntimeError("OCR 引擎尚未加载")
        # numpy 数组做浅拷贝，避免多线程下对同一张图的并发修改问题
        # 字符串/URL/Path 等不可变输入直接传递
        input_data = img.copy() if isinstance(img, np.ndarray) else img
        return ocr(input_data)

    def _format_result(
        self,
        raw_result,
        img: np.ndarray,
        return_lines: bool,
    ) -> OCRResult:
        height, width = img.shape[:2]
        lines: List[TextLine] = []
        full_text_parts: List[str] = []

        if raw_result is None or raw_result.boxes is None:
            return OCRResult(text="", lines=[], image_width=width, image_height=height)

        boxes = raw_result.boxes
        txts = raw_result.txts or ()
        scores = raw_result.scores or ()

        for idx, box in enumerate(boxes):
            text = txts[idx] if idx < len(txts) else ""
            score = float(scores[idx]) if idx < len(scores) else 0.0
            if text is None:
                continue
            full_text_parts.append(text)
            if return_lines:
                lines.append(
                    TextLine(
                        text=text,
                        confidence=score,
                        box=self._box_from_coords(box),
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
        coords = np.asarray(coords, dtype=float)
        if coords.shape[0] < 4:
            padding = np.zeros((4 - coords.shape[0], 2), dtype=float)
            coords = np.vstack([coords, padding])
        return Box(
            top_left=Point(x=float(coords[0][0]), y=float(coords[0][1])),
            top_right=Point(x=float(coords[1][0]), y=float(coords[1][1])),
            bottom_right=Point(x=float(coords[2][0]), y=float(coords[2][1])),
            bottom_left=Point(x=float(coords[3][0]), y=float(coords[3][1])),
        )

    @staticmethod
    def _parse_providers(providers_str: str) -> List[str]:
        """把逗号分隔的 provider 字符串解析为列表"""
        if not providers_str:
            return ["CPUExecutionProvider"]
        return [p.strip() for p in providers_str.split(",") if p.strip()]

    async def recognize_file(
        self,
        file_type: str,
        file_bytes: bytes,
        filename: str,
        return_lines: bool = True,
        dpi: int = 200,
        max_pages: int = 0,
    ) -> OCRFileResult:
        """
        识别上传文件：图片直接识别，PDF 逐页转换后识别，Office 文档先转 PDF
        """
        if file_type == "office":
            loop = asyncio.get_running_loop()
            try:
                pdf_bytes = await loop.run_in_executor(
                    self._executor,
                    office_to_pdf,
                    file_bytes,
                    filename,
                )
            except Exception as exc:
                raise ValueError(f"Office 文档转 PDF 失败: {exc}") from exc
            return await self._recognize_pdf(
                pdf_bytes,
                filename,
                return_lines=return_lines,
                dpi=dpi,
                max_pages=max_pages,
            )

        if file_type == "pdf":
            return await self._recognize_pdf(
                file_bytes,
                filename,
                return_lines=return_lines,
                dpi=dpi,
                max_pages=max_pages,
            )

        if file_type == "image":
            img = cv2.imdecode(np.frombuffer(file_bytes, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("无法解析图片")
            result = await self.recognize(img, return_lines=return_lines)
            page = OCRPageResult(
                page=1,
                text=result.text,
                lines=result.lines,
                image_width=result.image_width,
                image_height=result.image_height,
            )
            return OCRFileResult(
                filename=filename,
                file_type="image",
                total_pages=1,
                pages=[page],
                full_text=result.text,
            )

        raise ValueError(f"暂不支持的文件类型: {file_type}（当前仅支持图片和 PDF）")

    async def _recognize_pdf(
        self,
        pdf_bytes: bytes,
        filename: str,
        return_lines: bool,
        dpi: int,
        max_pages: int,
    ) -> OCRFileResult:
        logger.info(f"开始识别 PDF: {filename}, 大小: {len(pdf_bytes)} bytes")
        loop = asyncio.get_running_loop()
        try:
            images = await loop.run_in_executor(
                self._executor,
                pdf_to_images,
                pdf_bytes,
                dpi,
                max_pages,
            )
        except Exception as exc:
            logger.error(f"PDF 转换失败: {exc}")
            raise ValueError(f"PDF 转换失败: {exc}") from exc

        logger.info(f"PDF 共 {len(images)} 页, 开始逐页识别...")

        pages: List[OCRPageResult] = []
        for idx, img in enumerate(images, start=1):
            logger.info(f"识别 PDF 第 {idx}/{len(images)} 页")
            result = await self.recognize(img, return_lines=return_lines)
            pages.append(
                OCRPageResult(
                    page=idx,
                    text=result.text,
                    lines=result.lines,
                    image_width=result.image_width,
                    image_height=result.image_height,
                )
            )

        full_text = "\n\n".join(f"--- 第 {p.page} 页 ---\n{p.text}" for p in pages)

        logger.info(f"PDF 识别完成: {filename}, 共 {len(pages)} 页")
        return OCRFileResult(
            filename=filename,
            file_type="pdf",
            total_pages=len(pages),
            pages=pages,
            full_text=full_text,
        )

    async def close(self) -> None:
        """优雅关闭线程池"""
        self._executor.shutdown(wait=True, cancel_futures=False)
