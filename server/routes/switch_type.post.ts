import { ChatPromptTemplate } from '@langchain/core/prompts'
import { getLLM } from '../utils/llm'
import { logger } from '../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'switch_type'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { recognition_context, target_type } = body || {}

    if (!recognition_context || typeof recognition_context !== 'object') {
      return {
        code: 400,
        message: '参数错误：recognition_context 字段不能为空',
        result: null,
      }
    }

    if (!target_type || typeof target_type !== 'string') {
      return {
        code: 400,
        message: '参数错误：target_type 字段不能为空',
        result: null,
      }
    }

    const llm = await getLLM()

    const prompt = ChatPromptTemplate.fromTemplate([
      '你是 OCR 结果格式转换专家。',
      '请根据 recognition_context 中已有的识别上下文，将内容整理为目标类型。',
      '目标类型：{targetType}',
      'couplet 需包含 first_line、second_line、top_scroll、signature。',
      'poem 需包含 title、author、content、signature。',
      'single_char 和 ancient_book 的 data 为 {}。',
      '如果无法可靠提取字段，允许返回空字符串，但 image_type 仍需等于目标类型。',
      '',
      'vl_ocr_result: {vl}',
      'guji_ocr_result: {guji}',
      'danzi_ocr_result: {danzi}',
      '',
      '## 重要：只输出 JSON，格式如下，不要输出任何解释文字',
      '{{"display": {{"ocr_result": "...", "image_type": "{targetType}", "data": {{...}}}}}}',
    ].join('\n'))

    const messages = await prompt.formatMessages({
      targetType: target_type,
      vl: recognition_context.vl_ocr_result || '',
      guji: recognition_context.guji_ocr_result || '',
      danzi: recognition_context.danzi_ocr_result || '',
    })
    const response = await llm.invoke(messages)
    const raw = typeof response.content === 'string' ? response.content.trim() : String(response.content || '').trim()

    const match = raw.match(/\{[\s\S]*\}/m)
    if (!match) {
      throw new Error(`无法解析模型输出: ${raw.slice(0, 200)}`)
    }

    const parsed = JSON.parse(match[0])
    const display = parsed?.display || { ocr_result: '', image_type: target_type, data: {} }

    logger.info(MODULE, `输出类型: ${display.image_type || '(未知)'}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      result: { display },
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '切换类型服务异常',
      result: null,
    }
  }
})
