import { ChatPromptTemplate } from '@langchain/core/prompts'
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

const DEFAULT_NER_TYPE = '建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物'

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

    const llm = getLLM()
    const parser = new JsonOutputParser()
    const prompt = ChatPromptTemplate.fromTemplate([
      '你是古文实体标引专家。',
      '请从原文中抽取指定类型的实体，并返回 JSON。',
      '可用实体类型：{nerTypes}',
      '输出规则：',
      '1. 只输出 JSON 对象。',
      '2. 格式必须是 {{"entity": [...], "relation": []}}。',
      '3. entity 中每项包含 start、end、typeId、del、type、typeEn、value。',
      '4. start 从 0 开始，end 为开区间。',
      '5. del 固定为 false。',
      '6. typeId 从 45 开始递增分配。',
      '7. relation 固定返回空数组，除非你非常确定存在且文档允许；本任务默认返回空数组。',
      '8. 不要输出解释。',
      '',
      '条目ID：{jnEntryId}',
      '原文：',
      '{content}',
      '',
      'JSON：',
    ].join('\n'))

    const chain = prompt.pipe(llm).pipe(parser)
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
