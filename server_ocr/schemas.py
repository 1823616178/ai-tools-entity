"""
请求/响应数据模型
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float


class Box(BaseModel):
    top_left: Point
    top_right: Point
    bottom_right: Point
    bottom_left: Point


class TextLine(BaseModel):
    text: str
    confidence: float
    box: Box


class OCRResult(BaseModel):
    text: str = Field(..., description="识别出的完整文本，按行拼接")
    lines: List[TextLine] = Field(default_factory=list, description="每一行的识别结果")
    image_width: Optional[int] = None
    image_height: Optional[int] = None


class OCRRequest(BaseModel):
    image: str = Field(
        ...,
        description="图片数据：支持 base64 字符串（可带 data:image 头）或 HTTP(S) URL",
    )
    return_lines: bool = Field(
        default=True,
        description="是否返回逐行结果（含坐标和置信度）",
    )
    return_base64: bool = Field(
        default=False,
        description="是否把识别结果中的坐标按原图尺寸返回（当前恒为 True）",
    )


class OCRPageResult(BaseModel):
    page: int = Field(..., description="页码，从 1 开始")
    text: str
    lines: List[TextLine] = Field(default_factory=list)
    image_width: Optional[int] = None
    image_height: Optional[int] = None


class OCRFileResult(BaseModel):
    filename: str
    file_type: str
    total_pages: int
    pages: List[OCRPageResult]
    full_text: str


class OCRFileRequest(BaseModel):
    file: str = Field(
        ...,
        description="文件 base64（可带 data:application/pdf;base64 等 MIME 头）",
    )
    filename: str = Field(default="uploaded_file", description="原始文件名")
    return_lines: bool = Field(default=True)
    dpi: int = Field(default=200, description="PDF 转图片分辨率，默认 200")
    max_pages: int = Field(
        default=0,
        description="最大识别页数，0 表示不限制",
    )


class OCRResponse(BaseModel):
    code: int
    message: str
    result: Optional[OCRResult] = None
