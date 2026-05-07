import { logger } from '../utils/logger'

const API_URL = 'http://139.198.14.64:8082/base/trans'

/**
 * 自动翻译接口
 * POST /api/translate
 * 请求格式: { "content": "要翻译的古文内容" }
 * 返回格式: { "code": 200, "message": "success", "results": "翻译后的现代中文" }
 */
export default defineEventHandler(async (event) => {
  const MODULE = '翻译'
  const startTime = Date.now()
  logger.section(MODULE, '收到翻译请求')

  try {
    const body = await readBody(event)
    const { content } = body || {}

    logger.info(MODULE, `请求参数 - 内容长度: ${content?.length || 0}, 预览: "${content?.substring(0, 80) || '(空)'}"`)

    if (!content || typeof content !== 'string') {
      logger.warn(MODULE, '参数校验失败：content 为空')
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: '',
      }
    }

    logger.info(MODULE, `开始请求文档接口: ${API_URL}`)
    const upstream = await $fetch<{ code: number; message: string; results: string }>(API_URL, {
      method: 'POST',
      body: { content },
    })

    logger.info(MODULE, `上游返回 code=${upstream?.code}, message=${upstream?.message}`)
    logger.info(MODULE, `结果预览: "${upstream?.results?.substring?.(0, 120) || ''}"`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: upstream?.code ?? 500,
      message: upstream?.message ?? 'success',
      results: typeof upstream?.results === 'string' ? upstream.results : '',
    }
  } catch (error: any) {
    logger.section(MODULE, '请求失败')
    logger.error(MODULE, `错误信息: ${error.message}`)
    logger.error(MODULE, `总耗时: ${Date.now() - startTime}ms`)

    return {
      code: error?.data?.code || error?.statusCode || 500,
      message: error?.data?.message || error.message || '翻译服务异常',
      results: typeof error?.data?.results === 'string' ? error.data.results : '',
    }
  }
})
