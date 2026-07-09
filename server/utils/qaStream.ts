import type { H3Event } from 'h3'
import { getLLM, getResolvedLlmConfig, type ResolvedLlmConfig } from './llm'
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

function chunkContentToText(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
  }

  return String(content ?? '')
}

function isMessagesEndpoint(baseURL: string): boolean {
  return /\/messages\/?$/.test(baseURL.trim())
}

function extractString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractMessagesText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const data = payload as Record<string, any>
  const choiceDelta = data.choices?.[0]?.delta
  const openAiContent = chunkContentToText(choiceDelta?.content ?? data.content)
  if (openAiContent) {
    return openAiContent
  }

  const delta = data.delta
  const deltaType = extractString(delta?.type)
  if (deltaType === 'text_delta') {
    return extractString(delta?.text)
  }

  const contentBlock = data.content_block
  const contentBlockType = extractString(contentBlock?.type)
  if (contentBlockType === 'text') {
    return extractString(contentBlock?.text)
  }

  return ''
}

function buildMessagesRequestBody(config: ResolvedLlmConfig, systemPrompt: string, userPrompt: string) {
  return {
    model: config.model,
    max_tokens: 4096,
    stream: true,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  }
}

async function* streamMessagesEndpoint(
  config: ResolvedLlmConfig,
  systemPrompt: string,
  userPrompt: string,
): AsyncGenerator<string> {
  const response = await fetch(config.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${config.apiKey}`,
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(buildMessagesRequestBody(config, systemPrompt, userPrompt)),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Messages 接口请求失败（HTTP ${response.status}）${errorText ? `: ${errorText}` : ''}`)
  }

  if (!response.body) {
    const json = await response.json().catch(() => null)
    const answer = chunkContentToText((json as any)?.content)
    if (answer) {
      yield answer
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    let blockEnd = buffer.indexOf('\n\n')
    while (blockEnd >= 0) {
      const block = buffer.slice(0, blockEnd)
      buffer = buffer.slice(blockEnd + 2)

      for (const line of block.split(/\r?\n/)) {
        if (!line.startsWith('data:')) {
          continue
        }

        const data = line.replace(/^data:\s?/, '').trim()
        if (!data || data === '[DONE]') {
          continue
        }

        const parsed = JSON.parse(data)
        const text = extractMessagesText(parsed)
        if (text) {
          yield text
        }
      }

      blockEnd = buffer.indexOf('\n\n')
    }
  }
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

        if (isMessagesEndpoint(config.baseURL)) {
          logger.info(module, `使用 Messages 兼容端点: ${config.baseURL}`)
          for await (const text of streamMessagesEndpoint(config, systemPrompt, userPrompt)) {
            if (closed) {
              return
            }
            if (text) {
              send(sseData({ session_id: sessionId, type: 'answer', value: text }))
            }
          }
        } else {
          // 3. 调用 OpenAI ChatCompletions 兼容大模型流式生成正式回答
          const llm = await getLLM()
          const stream = await llm.stream([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ])

          for await (const chunk of stream) {
            if (closed) {
              return
            }

            const piece = chunkContentToText(chunk.content)
            if (piece) {
              send(sseData({ session_id: sessionId, type: 'answer', value: piece }))
            }
          }
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
