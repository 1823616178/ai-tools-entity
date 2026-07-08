import { generateText } from '../../utils/textGeneration'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'base/trans'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { content } = body || {}

    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: '',
      }
    }

    const prompt = [
      '你是古文翻译专家。',
      '请将输入的古文翻译成现代汉语。',
      '要求：',
      '1. 保持原意准确。',
      '2. 自动补全合理标点。',
      '3. 人名、地名、书名等专名按自然中文方式表达。',
      '4. 只输出最终翻译文本，不要解释。',
      '',
      '古文：',
      content,
      '',
      '翻译结果：',
    ].join('\n')

    const results = await generateText([{ role: 'user', content: prompt }])

    logger.info(MODULE, `结果长度: ${results.length}`)
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
      message: error.message || '翻译服务异常',
      results: '',
    }
  }
})
