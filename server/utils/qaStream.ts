import type { H3Event } from 'h3'
import { streamLlmText } from './llmStream'
import { getResolvedLlmConfig } from './llm'
import { logger } from './logger'

/**
 * 本地复刻 QueryController 问答式检索的 SSE 输出。
 *
 * 由于本服务没有接入 Milvus/向量库，这里用本地配置的大模型（.env / 数据库 LLM 配置）
 * 完成问答流式生成，并严格按文档约定输出：
 *   data: [START]
 *   data: {"session_id":"...","type":"answer","value":"..."}
 *   data: {"session_id":"...","type":"cite","value":{...}}   （可选）
 *   data: [DONE]
 * 摘要接口会在 [START] 之前额外补发一条 query_result 事件。
 */

const DEFAULT_TIMEOUT_MS = 600_000

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
  /** SSE 超时时间，默认对齐 Java 接口文档的 600000ms */
  timeoutMs?: number
  module: string
}

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function sseError(message: string): string {
  return `event: error\ndata: ${JSON.stringify({ message })}\n\n`
}

export function createQaSseStream(opts: QaStreamOptions): ReadableStream<Uint8Array> {
  const {
    sessionId,
    systemPrompt,
    userPrompt,
    preEvents = [],
    cites = [],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    module,
  } = opts
  const encoder = new TextEncoder()
  const startTime = Date.now()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
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
      const timeout = setTimeout(() => {
        logger.warn(module, `SSE 请求超时: ${timeoutMs}ms`)
        send(sseError('请求超时'))
        close()
      }, timeoutMs)

      try {
        // 1. 先补发前置事件（摘要接口的 query_result）
        for (const ev of preEvents) {
          send(sseData(ev))
        }

        // 2. 开始标记
        send('data: [START]\n\n')

        const config = await getResolvedLlmConfig()
        logger.info(module, `使用大模型端点: ${config.baseURL}`)

        // 3. 调用大模型流式生成正式回答
        for await (const text of streamLlmText(systemPrompt, userPrompt)) {
          if (closed) {
            return
          }
          if (text) {
            send(sseData({ session_id: sessionId, type: 'answer', value: text }))
          }
        }

        // 4. 引用事件（cite）
        for (const cite of cites) {
          send(sseData({ session_id: sessionId, type: 'cite', value: cite }))
        }

        // 5. 结束标记
        send('data: [DONE]\n\n')
        logger.info(module, `SSE 生成完成, 耗时: ${Date.now() - startTime}ms`)
      } catch (error: any) {
        logger.error(module, `生成失败: ${error?.message || error}`)
        send(sseError(error?.message || '系统内部错误'))
      } finally {
        clearTimeout(timeout)
        close()
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
