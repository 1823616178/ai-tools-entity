import { JsonOutputParser } from '@langchain/core/output_parsers'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'recognize/auto'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { image } = body || {}

    if (!image || typeof image !== 'string') {
      return {
        code: 400,
        message: '参数错误：image 字段不能为空',
        result: null,
      }
    }

    const llm = getLLM()
    const parser = new JsonOutputParser()
    const systemPrompt = [
      '你是古籍图片识别专家。',
      '请根据图片内容识别为 single_char、couplet、poem、ancient_book 之一。',
      '返回规则：',
      '1. 只输出 JSON。',
      '2. 顶层格式必须是 {"display": {...}, "recognition_context": {...}}。',
      '3. display 中必须包含 ocr_result、image_type、data。',
      '4. recognition_context 中必须包含 vl_ocr_result、guji_ocr_result、danzi_ocr_result。',
      '5. single_char 的 data 为 {}。',
      '6. couplet 的 data 包含 first_line、second_line、top_scroll、signature。',
      '7. poem 的 data 包含 title、author、content、signature。',
      '8. ancient_book 的 data 为 {}。',
      '9. 不要输出解释。',
    ].join('\n')

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage({
        content: [
          {
            type: 'image_url',
            image_url: { url: image },
          },
        ],
      }),
    ])

    const parsed = await parser.parse(typeof response.content === 'string' ? response.content : String(response.content || '{}'))
    const result = {
      display: parsed?.display || { ocr_result: '', image_type: '', data: {} },
      recognition_context: {
        vl_ocr_result: parsed?.recognition_context?.vl_ocr_result || '',
        guji_ocr_result: parsed?.recognition_context?.guji_ocr_result || '',
        danzi_ocr_result: parsed?.recognition_context?.danzi_ocr_result || '',
      },
    }

    logger.info(MODULE, `识别类型: ${result.display.image_type || '(未知)'}`)
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
      message: error.message || '拍照识别服务异常',
      result: null,
    }
  }
})
