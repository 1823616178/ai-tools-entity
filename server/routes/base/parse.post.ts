import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

const parseResultSchema = z.object({
  items: z.array(z.object({
    pos: z.number().describe('标点插入位置，0 表示在第一个字之前'),
    punc: z.array(z.string()).describe('该位置插入的标点符号列表，可包含多个连续标点'),
  })).describe('句读结果列表'),
})

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

    const llm = await getLLM()

    const prompt = ChatPromptTemplate.fromTemplate([
      '你是古文句读专家。',
      '请为输入古文标注应插入的标点位置。',
      'pos 表示在该位置之后插入标点；0 表示在第一个字之前。',
      '',
      '古文：',
      '{content}',
    ].join('\n'))

    const chain = prompt.pipe(llm.withStructuredOutput(parseResultSchema))
    const parsed = await chain.invoke({ content })
    const results = Array.isArray(parsed?.items) ? parsed.items : []

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
