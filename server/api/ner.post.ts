import { logger } from '../utils/logger'

const API_URL = 'http://139.198.14.64:8082/base/ner_rela'

const DEFAULT_NER_TYPE = '建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物'

type NerEntity = Record<string, any>
type NerRelation = Record<string, any>

/**
 * 实体标引接口
 * POST /api/ner
 * 请求格式: { "jnEntryId": "实体标引(20260507103951)", "content": "古文内容", "ner_type": "建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物" }
 * 返回格式: { "code": 200, "message": "success", "results": { "entity": [...], "relation": [] } }
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'NER'
  const startTime = Date.now()
  logger.section(MODULE, '收到实体识别请求')

  try {
    const body = await readBody(event)
    const { jnEntryId, content, ner_type } = body || {}

    logger.info(MODULE, `请求参数 - 条目ID: ${jnEntryId || '(未提供)'}, 内容长度: ${content?.length || 0}`)
    logger.info(MODULE, `实体类型: ${ner_type || DEFAULT_NER_TYPE}`)

    if (!content || typeof content !== 'string') {
      logger.warn(MODULE, '参数校验失败：content 为空')
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: { entity: [], relation: [] },
      }
    }

    logger.info(MODULE, `开始请求文档接口: ${API_URL}`)
    const upstream = await $fetch<{
      code: number
      message: string
      results: { entity: NerEntity[]; relation: NerRelation[] }
    }>(API_URL, {
      method: 'POST',
      body: {
        jnEntryId: typeof jnEntryId === 'string' && jnEntryId.trim() ? jnEntryId : undefined,
        content,
        ner_type: typeof ner_type === 'string' && ner_type.trim() ? ner_type : DEFAULT_NER_TYPE,
      },
    })

    logger.info(MODULE, `上游返回 code=${upstream?.code}, message=${upstream?.message}`)
    logger.info(MODULE, `实体数量: ${Array.isArray(upstream?.results?.entity) ? upstream.results.entity.length : 0}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: upstream?.code ?? 500,
      message: upstream?.message ?? 'success',
      results: {
        entity: Array.isArray(upstream?.results?.entity) ? upstream.results.entity : [],
        relation: Array.isArray(upstream?.results?.relation) ? upstream.results.relation : [],
      },
    }
  } catch (error: any) {
    logger.section(MODULE, '请求失败')
    logger.error(MODULE, `错误信息: ${error.message}`)
    logger.error(MODULE, `总耗时: ${Date.now() - startTime}ms`)

    return {
      code: error?.data?.code || error?.statusCode || 500,
      message: error?.data?.message || error.message || '实体识别服务异常',
      results: {
        entity: Array.isArray(error?.data?.results?.entity) ? error.data.results.entity : [],
        relation: Array.isArray(error?.data?.results?.relation) ? error.data.results.relation : [],
      },
    }
  }
})
