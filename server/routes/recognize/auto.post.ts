import { z } from 'zod'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

const ocrResultSchema = z.object({
  display: z.object({
    ocr_result: z.string().describe('识别出的文本内容'),
    image_type: z.enum(['single_char', 'couplet', 'poem', 'ancient_book']).describe('图片类型'),
    data: z.object({}).passthrough().describe('类型相关数据：couplet 含 first_line/second_line/top_scroll/signature，poem 含 title/author/content/signature，其他为 {}'),
  }),
  recognition_context: z.object({
    vl_ocr_result: z.string().describe('视觉模型 OCR 结果'),
    guji_ocr_result: z.string().describe('古籍 OCR 结果'),
    danzi_ocr_result: z.string().describe('单字 OCR 结果'),
  }),
})

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

    const llm = await getLLM()

    const systemPrompt = [
      '你是古籍图片识别专家。',
      '请根据图片内容识别为 single_char、couplet、poem、ancient_book 之一。',
      'couplet 需提取 first_line、second_line、top_scroll、signature。',
      'poem 需提取 title、author、content、signature。',
      '同时返回 recognition_context 供后续切换类型使用。',
    ].join('\n')

    const structuredLlm = llm.withStructuredOutput(ocrResultSchema)
    const parsed = await structuredLlm.invoke([
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

