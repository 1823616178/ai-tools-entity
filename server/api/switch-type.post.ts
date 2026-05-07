import { logger } from '../utils/logger'

const API_URL = 'http://szocr.hw-ai.com:6002/switch_type'

/**
 * 切换类型接口
 * POST /api/switch-type
 * 请求格式: { "recognition_context": { "vl_ocr_result": "...", "guji_ocr_result": "...", "danzi_ocr_result": "..." }, "target_type": "couplet" }
 * 返回格式: { "code": 200, "message": "success", "result": { "display": {...} } }
 */
export default defineEventHandler(async (event) => {
  const MODULE = '切换类型'
  const startTime = Date.now()
  logger.section(MODULE, '收到切换类型请求')

  try {
    const body = await readBody(event)
    const { recognition_context, target_type } = body || {}

    logger.info(MODULE, `请求参数 - 目标类型: ${target_type || '(空)'}`)

    if (!recognition_context || typeof recognition_context !== 'object') {
      logger.warn(MODULE, '参数校验失败：recognition_context 为空')
      return {
        code: 400,
        message: '参数错误：recognition_context 字段不能为空',
        result: null,
      }
    }

    if (!target_type || typeof target_type !== 'string') {
      logger.warn(MODULE, '参数校验失败：target_type 为空')
      return {
        code: 400,
        message: '参数错误：target_type 字段不能为空',
        result: null,
      }
    }

    logger.info(MODULE, `开始请求文档接口: ${API_URL}`)
    const upstream = await $fetch<{ code: number; message: string; result: any }>(API_URL, {
      method: 'POST',
      body: {
        recognition_context: {
          vl_ocr_result: recognition_context.vl_ocr_result || '',
          guji_ocr_result: recognition_context.guji_ocr_result || '',
          danzi_ocr_result: recognition_context.danzi_ocr_result || '',
        },
        target_type,
      },
    })

    logger.info(MODULE, `上游返回 code=${upstream?.code}, message=${upstream?.message}`)
    logger.info(MODULE, `输出类型: ${upstream?.result?.display?.image_type || '(未知)'}`)
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
      message: error?.data?.message || error.message || '切换类型服务异常',
      result: error?.data?.result ?? null,
    }
  }
})
