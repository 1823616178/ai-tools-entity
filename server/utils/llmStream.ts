import { getLLM, getResolvedLlmConfig, type ResolvedLlmConfig } from './llm'

/**
 * 大模型流式文本生成的公共封装。
 *
 * 兼容两类端点：
 *  - Anthropic Messages 风格端点（baseURL 以 /messages 结尾）：直接用 fetch + SSE 解析。
 *  - OpenAI ChatCompletions 兼容端点：通过 LangChain 的 ChatOpenAI.stream()。
 *
 * 上层（qaStream / documentQuestions 等）只需消费 yield 出的纯文本增量，
 * 再各自按接口文档封装成不同的 SSE 事件结构。
 */

export function chunkContentToText(content: unknown): string {
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

/**
 * 按当前解析出的大模型配置，流式生成文本增量。
 */
export async function* streamLlmText(systemPrompt: string, userPrompt: string): AsyncGenerator<string> {
  const config = await getResolvedLlmConfig()

  if (isMessagesEndpoint(config.baseURL)) {
    yield* streamMessagesEndpoint(config, systemPrompt, userPrompt)
    return
  }

  const llm = await getLLM()
  const stream = await llm.stream([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ])

  for await (const chunk of stream) {
    const piece = chunkContentToText(chunk.content)
    if (piece) {
      yield piece
    }
  }
}
