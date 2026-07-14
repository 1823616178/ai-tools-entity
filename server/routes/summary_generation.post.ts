import { generateText } from '../utils/textGeneration'
import { streamLlmText } from '../utils/llmStream'
import { logger } from '../utils/logger'

/**
 * 摘要生成接口
 * 对齐文档 POST /summary_generation
 *
 * 请求体: { text_list: string[], max_length?: number, stream?: boolean }
 * 非流式响应: { code: 200, message: 'success', summary: string }
 * 流式响应: text/event-stream
 *   data: [START]
 *   data: {"type":"answer","value":"..."}
 *   data: {"type":"result","value":{"code":200,"message":"success","summary":"..."}}
 *   data: [DONE]
 */

function validateBody(body: any): { valid: boolean; error?: string; textList?: string[]; maxLength?: number; stream?: boolean } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: '参数错误：请求体不能为空' }
  }

  const { text_list, max_length, stream } = body

  // Validate text_list
  if (!Array.isArray(text_list) || text_list.length === 0) {
    return { valid: false, error: '参数错误：text_list 不能为空' }
  }
  if (text_list.length > 50) {
    return { valid: false, error: '参数错误：text_list 长度不能超过 50' }
  }
  for (let i = 0; i < text_list.length; i++) {
    if (typeof text_list[i] !== 'string') {
      return { valid: false, error: `参数错误：text_list[${i}] 必须是字符串` }
    }
  }

  // Validate stream
  if (stream !== undefined && typeof stream !== 'boolean') {
    return { valid: false, error: '参数错误：stream 须为布尔值' }
  }

  // Validate max_length
  let maxLen = 200
  if (max_length !== undefined) {
    if (typeof max_length !== 'number' || max_length < 50 || max_length > 500) {
      return { valid: false, error: '参数错误：max_length 须在 50-500 范围内' }
    }
    maxLen = max_length
  }

  return { valid: true, textList: text_list, maxLength: maxLen, stream: stream ?? false }
}

export default defineEventHandler(async (event) => {
  const MODULE = 'summary_generation'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const validation = validateBody(body)

    if (!validation.valid) {
      logger.warn(MODULE, validation.error!)
      return {
        code: 400,
        message: validation.error,
      }
    }

    const { textList, maxLength, stream: useStream } = validation

    // Concatenate text_list
    const fullText = textList!.join('\n')

    // Build prompt
    const prompt = [
      '你是一位文本摘要专家。',
      '请将以下多段文本按顺序拼接后，生成一段简洁、连贯、覆盖核心内容的摘要。',
      `摘要字数请控制在 ${maxLength} 字以内。`,
      '要求：',
      '1. 保持原意准确，不添加原文未提及的信息。',
      '2. 语言通顺流畅，逻辑清晰。',
      '3. 只输出最终摘要文本，不要解释或添加标题。',
      '',
      '原始文本：',
      fullText,
      '',
      '摘要：',
    ].join('\n')

    logger.info(MODULE, `text_list 长度: ${textList!.length}, max_length: ${maxLength}, stream: ${useStream}`)
    logger.section(MODULE, `开始生成摘要`)

    if (useStream) {
      // ===== Streaming Mode =====
      const encoder = new TextEncoder()

      // Set SSE headers
      setResponseHeaders(event, {
        'Content-Type': 'text/event-stream;charset=UTF-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      })

      return new ReadableStream<Uint8Array>({
        async start(controller) {
          let fullSummary = ''
          let closed = false

          const send = (text: string) => {
            if (!closed) {
              controller.enqueue(encoder.encode(text))
            }
          }

          const close = () => {
            if (!closed) {
              closed = true
              controller.close()
            }
          }

          try {
            // Send start marker
            send('data: [START]\n\n')

            // Generate text as stream
            for await (const piece of streamLlmText(
              '你是一位文本摘要专家。',
              prompt
            )) {
              fullSummary += piece
              send(`data: ${JSON.stringify({ type: 'answer', value: piece })}\n\n`)
            }

            const summary = fullSummary.trim()

            // Send final result event
            send(`data: ${JSON.stringify({ type: 'result', value: { code: 200, message: 'success', summary } })}\n\n`)

            // Send done marker
            send('data: [DONE]\n\n')

            logger.info(MODULE, `流式摘要生成完成, 摘要长度: ${summary.length}, 总耗时: ${Date.now() - startTime}ms`)
          } catch (error: any) {
            logger.error(MODULE, `流式生成失败: ${error?.message || error}`)
            send(`data: ${JSON.stringify({ type: 'error', value: error?.message || '系统内部错误' })}\n\n`)
          } finally {
            close()
          }
        },
      })
    } else {
      // ===== Non-Streaming Mode =====
      const result = await generateText([{ role: 'user', content: prompt }])
      const summary = result.trim()

      logger.info(MODULE, `摘要长度: ${summary.length}, 总耗时: ${Date.now() - startTime}ms`)
      logger.section(MODULE, `请求完成`)

      return {
        code: 200,
        message: 'success',
        summary,
      }
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '摘要生成异常',
    }
  }
})
