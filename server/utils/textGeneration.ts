import { getResolvedLlmConfig, type ResolvedLlmConfig } from './llm'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function normalizeBaseUrl(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

function isMessagesEndpoint(baseURL: string): boolean {
  return /\/messages\/?$/.test(baseURL.trim())
}

function isChatCompletionsEndpoint(baseURL: string): boolean {
  return /\/chat\/completions\/?$/.test(baseURL.trim())
}

function getChatCompletionsUrl(baseURL: string): string {
  const normalized = normalizeBaseUrl(baseURL)
  return isChatCompletionsEndpoint(normalized) ? normalized : `${normalized}/chat/completions`
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          if (typeof record.text === 'string') {
            return record.text
          }
          if (typeof record.content === 'string') {
            return record.content
          }
        }
        return ''
      })
      .join('')
  }

  return ''
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const data = payload as Record<string, any>
  const choice = data.choices?.[0]
  const choiceText = textFromContent(choice?.message?.content ?? choice?.delta?.content ?? choice?.text)
  if (choiceText) {
    return choiceText
  }

  const contentText = textFromContent(data.content)
  if (contentText) {
    return contentText
  }

  return textFromContent(data.data)
}

async function postJson(url: string, apiKey: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  let payload: unknown = null

  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { data: text }
    }
  }

  if (!response.ok) {
    const message =
      typeof (payload as Record<string, any>)?.error?.message === 'string'
        ? (payload as Record<string, any>).error.message
        : text || `HTTP ${response.status}`
    throw new Error(message)
  }

  return payload
}

async function invokeMessages(config: ResolvedLlmConfig, messages: ChatMessage[]): Promise<string> {
  const systemMessage = messages.find((item) => item.role === 'system')?.content
  const userMessages = messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role,
      content: item.content,
    }))

  const payload = await postJson(config.baseURL, config.apiKey, {
    model: config.model,
    max_tokens: 4096,
    stream: false,
    ...(systemMessage ? { system: systemMessage } : {}),
    messages: userMessages,
  })

  return extractResponseText(payload)
}

async function invokeChatCompletions(config: ResolvedLlmConfig, messages: ChatMessage[]): Promise<string> {
  const payload = await postJson(getChatCompletionsUrl(config.baseURL), config.apiKey, {
    model: config.model,
    temperature: config.temperature,
    stream: false,
    messages,
  })

  return extractResponseText(payload)
}

export async function generateText(messages: ChatMessage[]): Promise<string> {
  const config = await getResolvedLlmConfig()

  if (isMessagesEndpoint(config.baseURL)) {
    return invokeMessages(config, messages)
  }

  return invokeChatCompletions(config, messages)
}
