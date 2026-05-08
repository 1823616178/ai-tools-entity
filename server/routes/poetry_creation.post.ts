import { ChatPromptTemplate } from '@langchain/core/prompts'
import { getLLM } from '../utils/llm'
import { logger } from '../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'poetry_creation'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { request_text } = body || {}

    if (!request_text || typeof request_text !== 'string' || !request_text.trim()) {
      return {
        code: 400,
        message: '请求参数无效（如 request_text 为空）',
        result: '',
      }
    }

    const llm = await getLLM()
    const prompt = ChatPromptTemplate.fromTemplate([
      '你是古典诗词创作专家。',
      '请根据用户要求创作一首符合古典文学规范的诗词作品。',
      '要求：',
      '1. 严格遵循用户提供的主题、关键词、体裁和格式。',
      '2. 用语自然、意境完整，尽量符合传统诗词表达。',
      '3. 只输出最终诗词正文，不要解释、不要标题前后缀。',
      '',
      '用户要求：',
      '{requestText}',
      '',
      '诗词：',
    ].join('\n'))

    const chain = prompt.pipe(llm)
    const response = await chain.invoke({ requestText: request_text.trim() })
    const result = typeof response.content === 'string' ? response.content.trim() : String(response.content || '').trim()

    logger.info(MODULE, `结果长度: ${result.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: '诗词创作成功',
      result,
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '模型处理失败或服务内部错误',
      result: '',
    }
  }
})
