import { logger } from '../../utils/logger'

interface NerEntity {
  start: number
  end: number
  typeId: number
  del: boolean
  type: string
  typeEn: string
  value: string
}

interface NerPredictResponse {
  text: string
  entityList: NerEntity[]
  cost_ms: number
}

export default defineEventHandler(async (event) => {
  const MODULE = 'base/ner_rela'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { content } = body || {}

    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: { entity: [], relation: [] },
      }
    }

    const config = useRuntimeConfig()
    const nerApiUrl = config.ner.apiUrl

    logger.info(MODULE, `调用 NER 接口: ${nerApiUrl}`)

    const res = await $fetch<NerPredictResponse>(nerApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { text: content },
      timeout: 120000,
    })

    const entities = Array.isArray(res?.entityList) ? res.entityList : []

    logger.info(MODULE, `实体数量: ${entities.length}, NER 耗时: ${res?.cost_ms ?? '-'}ms`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      results: {
        entity: entities,
        relation: [],
      },
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '实体识别服务异常',
      results: { entity: [], relation: [] },
    }
  }
})
