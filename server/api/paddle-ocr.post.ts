/**
 * PaddleOCR 文件上传中转接口
 * 支持：图片（jpg/png/bmp/webp 等）、PDF
 */
import { logger } from '../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'api/paddle-ocr'
  logger.section(MODULE, '收到文件上传识别请求')

  try {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      return { code: 400, message: '请上传文件', result: null }
    }

    const filePart = formData.find(item => item.name === 'file')
    if (!filePart || !filePart.data || !filePart.filename) {
      return { code: 400, message: '缺少 file 字段', result: null }
    }

    const filename = filePart.filename
    const fileType = filePart.type || 'application/octet-stream'
    const fileData = filePart.data

    logger.info(MODULE, `文件名: ${filename}, MIME: ${fileType}, 大小: ${fileData.length} bytes`)

    // 转成 base64 data URI
    const base64 = fileData.toString('base64')
    const dataUri = `data:${fileType};base64,${base64}`

    const config = useRuntimeConfig()
    const apiUrl = config.paddleOcr?.apiUrl as string | undefined
    if (!apiUrl) {
      return { code: 500, message: 'PADDLE_OCR_URL 未配置', result: null }
    }

    // 转发到 Python OCR 服务
    const result = await $fetch(`${apiUrl}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file: dataUri,
        filename,
        return_lines: true,
        dpi: 200,
        max_pages: 50,
      }),
      timeout: 120000,
    })

    logger.section(MODULE, '请求完成')
    return result
  }
  catch (error: any) {
    logger.error(MODULE, error?.message || '未知错误')
    return {
      code: 500,
      message: error?.message || '文件识别服务异常',
      result: null,
    }
  }
})
