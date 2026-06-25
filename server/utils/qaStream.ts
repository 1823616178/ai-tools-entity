import type { H3Event } from 'h3'
import { getLLM, getResolvedLlmConfig, type ResolvedLlmConfig } from './llm'
import { logger } from './logger'

/**
 * 本地复刻 QueryController 问答式检索的 SSE 输出。
 *
 * 由于本服务没有接入 Milvus/向量库，这里用本地配置的大模型（.env / 数据库 LLM 配置）
 * 完成问答流式生成，并严格按文档约定输出：
 *   data: [START]
 *   data: {"session_id":"...","type":"reason","value":"..."}   （deepseek 模式可选）
 *   data: {"session_id":"...","type":"answer","value":"..."}
 *   data: {"session_id":"...","type":"cite","value":{...}}   （可选）
 *   data: [DONE]
 * 摘要接口会在 [START] 之前额外补发一条 query_result 事件。
 *
 * 非 deepseek 模式不主动输出 reason；deepseek 模式仅解析模型按 <think>...</think> 输出的内容。
 */

const DEFAULT_TIMEOUT_MS = 600_000
const THINK_OPEN_TAG = '<think>'
const THINK_CLOSE_TAG = '</think>'

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
  /** 是否把模型输出中的 <think>...</think> 解析成 reason 事件 */
  enableThink?: boolean
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

function chunkReasoningToText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') {
    return ''
  }

  const additionalKwargs = (chunk as { additional_kwargs?: Record<string, unknown> }).additional_kwargs
  return chunkContentToText(
    additionalKwargs?.reasoning_content ??
      additionalKwargs?.reasoningContent ??
      additionalKwargs?.reasoning ??
      '',
  )
}

function isMessagesEndpoint(baseURL: string): boolean {
  return /\/messages\/?$/.test(baseURL.trim())
}

function extractString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function extractMessagesDelta(payload: unknown): { type: 'reason' | 'answer'; value: string } | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const data = payload as Record<string, any>
  const choiceDelta = data.choices?.[0]?.delta
  const openAiReasoning = extractString(
    choiceDelta?.reasoning_content ?? choiceDelta?.reasoningContent ?? choiceDelta?.reasoning,
  )
  if (openAiReasoning) {
    return { type: 'reason', value: openAiReasoning }
  }

  const openAiContent = chunkContentToText(choiceDelta?.content ?? data.content)
  if (openAiContent) {
    return { type: 'answer', value: openAiContent }
  }

  const delta = data.delta
  const deltaType = extractString(delta?.type)
  if (deltaType === 'thinking_delta' || deltaType === 'reasoning_delta') {
    const thinking = extractString(delta?.thinking ?? delta?.text ?? delta?.reasoning)
    return thinking ? { type: 'reason', value: thinking } : null
  }
  if (deltaType === 'text_delta') {
    const text = extractString(delta?.text)
    return text ? { type: 'answer', value: text } : null
  }

  const contentBlock = data.content_block
  const contentBlockType = extractString(contentBlock?.type)
  if (contentBlockType === 'thinking') {
    const thinking = extractString(contentBlock?.thinking ?? contentBlock?.text)
    return thinking ? { type: 'reason', value: thinking } : null
  }
  if (contentBlockType === 'text') {
    const text = extractString(contentBlock?.text)
    return text ? { type: 'answer', value: text } : null
  }

  const directReasoning = extractString(data.reasoning_content ?? data.reasoningContent ?? data.reasoning)
  if (directReasoning) {
    return { type: 'reason', value: directReasoning }
  }

  return null
}

function buildMessagesRequestBody(config: ResolvedLlmConfig, systemPrompt: string, userPrompt: string, enableThink: boolean) {
  const body: Record<string, unknown> = {
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

  if (enableThink) {
    body.thinking = { type: 'enabled' }
    body.reasoning_effort = 'high'
    body.output_config = { effort: 'high' }
  } else {
    body.thinking = { type: 'disabled' }
    body.temperature = config.temperature
  }

  return body
}

async function* streamMessagesEndpoint(
  config: ResolvedLlmConfig,
  systemPrompt: string,
  userPrompt: string,
  enableThink: boolean,
): AsyncGenerator<{ type: 'reason' | 'answer'; value: string }> {
  const response = await fetch(config.baseURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${config.apiKey}`,
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(buildMessagesRequestBody(config, systemPrompt, userPrompt, enableThink)),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Messages 接口请求失败（HTTP ${response.status}）${errorText ? `: ${errorText}` : ''}`)
  }

  if (!response.body) {
    const json = await response.json().catch(() => null)
    const answer = chunkContentToText((json as any)?.content)
    if (answer) {
      yield { type: 'answer', value: answer }
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
        const delta = extractMessagesDelta(parsed)
        if (delta && (enableThink || delta.type === 'answer')) {
          yield delta
        }
      }

      blockEnd = buffer.indexOf('\n\n')
    }
  }
}

function createThinkParser(sessionId: string, send: (text: string) => void) {
  let phase: 'beforeThink' | 'reason' | 'answer' = 'beforeThink'
  let buffer = ''

  const sendTyped = (type: 'reason' | 'answer', value: string) => {
    if (value) {
      send(sseData({ session_id: sessionId, type, value }))
    }
  }

  const flush = (piece: string) => {
    buffer += piece

    while (buffer) {
      if (phase === 'beforeThink') {
        const openIndex = buffer.indexOf(THINK_OPEN_TAG)
        if (openIndex >= 0) {
          const beforeThink = buffer.slice(0, openIndex)
          if (beforeThink.trim()) {
            sendTyped('answer', beforeThink)
          }
          phase = 'reason'
          buffer = buffer.slice(openIndex + THINK_OPEN_TAG.length)
          continue
        }

        const safeLength = buffer.length - (THINK_OPEN_TAG.length - 1)
        if (safeLength > 0) {
          const directAnswer = buffer.slice(0, safeLength)
          if (directAnswer.trim()) {
            sendTyped('answer', directAnswer)
          }
          buffer = buffer.slice(safeLength)
        }
        break
      }

      if (phase === 'reason') {
        const closeIndex = buffer.indexOf(THINK_CLOSE_TAG)
        if (closeIndex >= 0) {
          sendTyped('reason', buffer.slice(0, closeIndex))
          phase = 'answer'
          buffer = buffer.slice(closeIndex + THINK_CLOSE_TAG.length).replace(/^\s*\r?\n/, '')
          continue
        }

        const safeLength = buffer.length - (THINK_CLOSE_TAG.length - 1)
        if (safeLength > 0) {
          sendTyped('reason', buffer.slice(0, safeLength))
          buffer = buffer.slice(safeLength)
        }
        break
      }

      sendTyped('answer', buffer)
      buffer = ''
    }
  }

  const finish = () => {
    if (!buffer) {
      return
    }

    if (phase === 'reason') {
      sendTyped('reason', buffer)
    } else {
      sendTyped('answer', buffer)
    }
    buffer = ''
  }

  return { flush, finish }
}

export function createQaSseStream(opts: QaStreamOptions): ReadableStream<Uint8Array> {
  const {
    sessionId,
    systemPrompt,
    userPrompt,
    preEvents = [],
    cites = [],
    enableThink = false,
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

        const thinkParser = enableThink ? createThinkParser(sessionId, send) : null
        const config = await getResolvedLlmConfig()

        if (isMessagesEndpoint(config.baseURL)) {
          logger.info(module, `使用 Messages 兼容端点: ${config.baseURL}`)
          for await (const delta of streamMessagesEndpoint(config, systemPrompt, userPrompt, enableThink)) {
            if (closed) {
              return
            }
            send(sseData({ session_id: sessionId, type: delta.type, value: delta.value }))
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
            const reasoningPiece = enableThink ? chunkReasoningToText(chunk) : ''
            if (reasoningPiece) {
              send(sseData({ session_id: sessionId, type: 'reason', value: reasoningPiece }))
            }

            const piece = chunkContentToText(chunk.content)
            if (!piece) continue
            if (thinkParser) {
              thinkParser.flush(piece)
            } else {
              send(sseData({ session_id: sessionId, type: 'answer', value: piece }))
            }
          }

          if (thinkParser) {
            thinkParser.finish()
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
