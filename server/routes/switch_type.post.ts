import { ChatPromptTemplate } from '@langchain/core/prompts'
import { JsonOutputParser } from '@langchain/core/output_parsers'
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
    const parser = new JsonOutputParser()
    const prompt = ChatPromptTemplate.fromTemplate([
      '你是 OCR 结果格式转换专家。',
      '请根据 recognition_context 中已有的识别上下文，将内容整理为目标类型。',
      '目标类型：{targetType}',
      '输出规则：',
      '1. 只输出 JSON。',
      '2. 顶层格式必须是 {{"display": {{...}}}}。',
      '3. display 中必须包含 ocr_result、image_type、data。',
      '4. 当目标类型为 couplet 时，data 包含 first_line、second_line、top_scroll、signature。',
      '5. 当目标类型为 poem 时，data 包含 title、author、content、signature。',
      '6. 当目标类型为 single_char 或 ancient_book 时，data 为 {{}}。',
      '7. 如果无法可靠提取对联字段，允许返回空字符串，但 image_type 仍需等于目标类型。',
      '8. 不要输出解释。',
      '',
      'vl_ocr_result: {vl}',
      'guji_ocr_result: {guji}',
      'danzi_ocr_result: {danzi}',
      '',
      'JSON：',
    ].join('\n'))

    const chain = prompt.pipe(llm).pipe(parser)
    const parsed = await chain.invoke({
      targetType: target_type,
      vl: recognition_context.vl_ocr_result || '',
      guji: recognition_context.guji_ocr_result || '',
      danzi: recognition_context.danzi_ocr_result || '',
    })

    const result = {
      display: parsed?.display || { ocr_result: '', image_type: target_type, data: {} },
    }

    logger.info(MODULE, `输出类型: ${result.display.image_type || '(未知)'}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      result,
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
