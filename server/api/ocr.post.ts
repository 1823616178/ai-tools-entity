import { logger } from '../utils/logger'

const API_URL = 'http://szocr.hw-ai.com:6002/recognize/auto'

/**
 * 拍照智能识别接口
 * POST /api/ocr
 * 请求格式: { "image": "data:image/jpeg;base64,..." }
 * 返回格式: 与文档一致，包含 display 和 recognition_context
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'OCR'
  const startTime = Date.now()
  logger.section(MODULE, '收到拍照识别请求')

  try {
    const body = await readBody(event)
    const { image } = body || {}

    logger.info(MODULE, `请求参数 - 图片Base64长度: ${image?.length || 0}`)

    if (!image || typeof image !== 'string') {
      logger.warn(MODULE, '参数校验失败：image 为空')
      return {
        code: 400,
        message: '参数错误：image 字段不能为空',
        result: null,
      }
    }

    logger.info(MODULE, `开始请求文档接口: ${API_URL}`)
    const upstream = await $fetch<{ code: number; message: string; result: any }>(API_URL, {
      method: 'POST',
      body: { image },
    })

    logger.info(MODULE, `上游返回 code=${upstream?.code}, message=${upstream?.message}`)
    logger.info(MODULE, `识别类型: ${upstream?.result?.display?.image_type || '(未知)'}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: upstream?.code ?? 500,
      message: upstream?.message ?? 'success',
      result: upstream?.result ?? null,
    }
  } catch (error: any) {
    logger.section(MODULE, '请求失败')
    logger.error(MODULE, `错误信息: ${error.message}`)
    logger.error(MODULE, `总耗时: ${Date.now() - startTime}ms`)

    return {
      code: error?.data?.code || error?.statusCode || 500,
      message: error?.data?.message || error.message || '拍照识别服务异常',
      result: error?.data?.result ?? null,
    }
  }
})
