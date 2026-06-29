/**
 * PaddleOCR 服务调用封装
 * 对应 server_ocr/ 独立 Python 服务
 */
import { logger } from './logger'

interface OCRLine {
  text: string
  confidence: number
  box: {
    top_left: { x: number; y: number }
    top_right: { x: number; y: number }
    bottom_right: { x: number; y: number }
    bottom_left: { x: number; y: number }
  }
}

interface OCRResult {
  text: string
  lines: OCRLine[]
  image_width?: number
  image_height?: number
}

interface OCRServiceResponse {
  code: number
  message: string
  result?: OCRResult
}

/**
 * 调用 PaddleOCR 服务识别图片
 * @param image base64 字符串或图片 URL
 * @param returnLines 是否返回逐行结果，默认 true
 */
export async function recognizeWithPaddleOCR(
  image: string,
  returnLines: boolean = true,
): Promise<OCRResult | null> {
  const MODULE = 'paddleOcr'
  const config = useRuntimeConfig()
  const apiUrl = config.paddleOcr?.apiUrl as string | undefined

  if (!apiUrl) {
    logger.error(MODULE, 'PADDLE_OCR_URL 未配置')
    return null
  }

  try {
    const response = await $fetch<OCRServiceResponse>(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, return_lines: returnLines }),
      timeout: 60000,
    })

    if (response.code !== 200 || !response.result) {
      logger.error(MODULE, `OCR 服务返回异常: ${response.message}`)
      return null
    }

    logger.info(MODULE, `PaddleOCR 识别成功，共 ${response.result.lines.length} 行`)
    return response.result
  }
  catch (error: any) {
    logger.error(MODULE, `PaddleOCR 调用失败: ${error?.message || '未知错误'}`)
    return null
  }
}
