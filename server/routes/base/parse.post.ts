import { ChatPromptTemplate } from '@langchain/core/prompts'
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'base/parse'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { content } = body || {}

    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: [],
      }
    }

    const llm = getLLM()
    const parser = new JsonOutputParser()
    const prompt = ChatPromptTemplate.fromTemplate([
      '你是古文句读专家。',
      '请为输入古文标注应插入的标点位置。',
      '返回规则：',
      '1. 只返回 JSON 数组。',
      '2. 每项格式为 {{"pos": number, "punc": string[]}}。',
      '3. pos 表示在该位置之后插入标点；0 表示在第一个字之前。',
      '4. punc 中可以包含多个连续标点，例如 ["》", "："]。',
      '5. 不要输出任何解释。',
      '',
      '古文：',
      '{content}',
      '',
      'JSON：',
    ].join('\n'))

    const chain = prompt.pipe(llm).pipe(parser)
    const parsed = await chain.invoke({ content })
    const results = Array.isArray(parsed) ? parsed : []

    logger.info(MODULE, `标点数量: ${results.length}`)
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
      message: error.message || '句读服务异常',
      results: [],
    }
  }
})
