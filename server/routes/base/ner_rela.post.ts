import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

const DEFAULT_NER_TYPE = '建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物'

const nerResultSchema = z.object({
  entity: z.array(z.object({
    start: z.number().describe('实体起始位置，从0开始'),
    end: z.number().describe('实体结束位置，开区间'),
    typeId: z.number().describe('类型编号，从45开始递增'),
    del: z.boolean().describe('固定为 false'),
    type: z.string().describe('中文实体类型名称，如：地点、人物、时间'),
    typeEn: z.string().describe('英文实体类型名称，如：location、person、time'),
    value: z.string().describe('实体原文文本'),
  })),
  relation: z.array(z.object({}).passthrough()),
})

export default defineEventHandler(async (event) => {
  const MODULE = 'base/ner_rela'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { jnEntryId, content, ner_type } = body || {}

    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: { entity: [], relation: [] },
      }
    }

    const llm = await getLLM()

    const prompt = ChatPromptTemplate.fromTemplate([
      '你是古文实体标引专家。',
      '请从原文中抽取指定类型的实体。',
      '可用实体类型：{nerTypes}',
      '',
      '条目ID：{jnEntryId}',
      '原文：',
      '{content}',
    ].join('\n'))

    const chain = prompt.pipe(llm.withStructuredOutput(nerResultSchema))
    const parsed = await chain.invoke({
      jnEntryId: typeof jnEntryId === 'string' ? jnEntryId : '',
      nerTypes: typeof ner_type === 'string' && ner_type.trim() ? ner_type : DEFAULT_NER_TYPE,
      content,
    })

    const results = {
      entity: Array.isArray(parsed?.entity) ? parsed.entity : [],
      relation: Array.isArray(parsed?.relation) ? parsed.relation : [],
    }

    logger.info(MODULE, `实体数量: ${results.entity.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      results,
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
