import type { H3Event } from 'h3'
import { getLLM } from './llm'
import { logger } from './logger'

/**
 * 本地复刻 QueryController 问答式检索的 SSE 输出。
 *
 * 由于本服务没有接入 Milvus/向量库，这里用本地配置的大模型（.env / 数据库 LLM 配置）
 * 完成「推理 + 问答」的流式生成，并严格按文档约定输出：
 *   data: [START]
 *   data: {"session_id":"...","type":"reason","value":"..."}
 *   data: {"session_id":"...","type":"answer","value":"..."}
 *   data: {"session_id":"...","type":"cite","value":{...}}   （可选）
 *   data: [DONE]
 * 摘要接口会在 [START] 之前额外补发一条 query_result 事件。
 */

// 推理与正文之间的分隔符，提示大模型严格输出
const ANSWER_SEPARATOR = '===ANSWER==='

export interface QaStreamOptions {
  sessionId: string
  /** 提供给大模型的系统/任务提示 */
  systemPrompt: string
  /** 拼接好的用户问题 + 上下文 */
  userPrompt: string
  /** [START] 之前需要补发的事件（如摘要检索的 query_result），已是完整事件对象 */
  preEvents?: Array<Record<string, unknown>>
  /** [DONE] 之前补发的引用事件 value 列表（cite） */
  cites?: Array<Record<string, unknown>>
  module: string
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function sseError(message: string): string {
  return `event: error\ndata: ${JSON.stringify({ message })}\n\n`
}

export function createQaSseStream(opts: QaStreamOptions): ReadableStream<Uint8Array> {
  const { sessionId, systemPrompt, userPrompt, preEvents = [], cites = [], module } = opts
  const encoder = new TextEncoder()
  const startTime = Date.now()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => controller.enqueue(encoder.encode(text))

      try {
        // 1. 先补发前置事件（摘要接口的 query_result）
        for (const ev of preEvents) {
          send(sseData(ev))
        }

        // 2. 开始标记
        send('data: [START]\n\n')

        // 3. 调用大模型流式生成，按分隔符切分 reason / answer
        const llm = await getLLM()
        const stream = await llm.stream([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ])

        let phase: 'reason' | 'answer' = 'reason'
        let buffer = ''
        const keep = ANSWER_SEPARATOR.length - 1

        for await (const chunk of stream) {
          const piece = typeof chunk.content === 'string' ? chunk.content : String(chunk.content ?? '')
          if (!piece) continue
          buffer += piece

          if (phase === 'reason') {
            const sepIdx = buffer.indexOf(ANSWER_SEPARATOR)
            if (sepIdx >= 0) {
              const reasonPart = buffer.slice(0, sepIdx)
              if (reasonPart) send(sseData({ session_id: sessionId, type: 'reason', value: reasonPart }))
              phase = 'answer'
              // 分隔符之后的内容，去掉紧跟的换行
              buffer = buffer.slice(sepIdx + ANSWER_SEPARATOR.length).replace(/^\r?\n/, '')
            } else {
              // 防止分隔符被切割到两个 chunk，保留尾部 keep 个字符
              const safeLen = buffer.length - keep
              if (safeLen > 0) {
                send(sseData({ session_id: sessionId, type: 'reason', value: buffer.slice(0, safeLen) }))
                buffer = buffer.slice(safeLen)
              }
              continue
            }
          }

          // answer 阶段：直接透传
          if (phase === 'answer' && buffer) {
            send(sseData({ session_id: sessionId, type: 'answer', value: buffer }))
            buffer = ''
          }
        }

        // 4. flush 剩余 buffer
        if (buffer) {
          send(sseData({ session_id: sessionId, type: phase, value: buffer }))
        }

        // 5. 引用事件（cite）
        for (const cite of cites) {
          send(sseData({ session_id: sessionId, type: 'cite', value: cite }))
        }

        // 6. 结束标记
        send('data: [DONE]\n\n')
        logger.info(module, `SSE 生成完成, 耗时: ${Date.now() - startTime}ms`)
      } catch (error: any) {
        logger.error(module, `生成失败: ${error?.message || error}`)
        send(sseError(error?.message || '系统内部错误'))
      } finally {
        controller.close()
      }
    },
  })
}

export function startSseResponse(event: H3Event) {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream;charset=UTF-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}
