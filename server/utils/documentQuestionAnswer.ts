import { streamLlmText } from './llmStream'
import { logger } from './logger'
import { buildQaOutputFormat } from './qaOutputFormat'
import { estimateTokens, truncateToTokenBudget, type NormalizedDocument } from './documentQuestions'

/**
 * 文件问答（/document_question_answer）核心逻辑。
 *
 * 依据接口文档：
 *  - 接收应用端解析后的纯文本（不接收二进制文件）。
 *  - 多文件按传入顺序拼接，并在每段前加入文件序号和文件名。
 *  - 回答 Prompt 约束模型只能依据文件内容回答；文件中没有依据时返回固定提示语。
 *  - 输入内容统一按 llm.max_input_tokens 做 token 预算，保留固定提示词、用户问题和输出要求，只截断文件正文。
 *  - 内部统一使用流式生成链路，stream=false 时消费完整流式结果后返回 JSON。
 */

export const MIN_ANSWER_MAX_LENGTH = 100
export const MAX_ANSWER_MAX_LENGTH = 2000

/** 为系统提示词、用户问题和输出要求预留的 token 预算 */
const RESERVED_TOKENS = 600
/** 兜底的最小正文预算，避免 max_input_tokens 配置过小导致正文被清空 */
const MIN_BODY_TOKEN_BUDGET = 200

/**
 * 收敛 answer_max_length 到 [MIN, MAX]，非法/缺省时回退到默认值。
 */
export function clampAnswerMaxLength(value: unknown, defaultLength: number): number {
  const fallback = clampToRange(defaultLength, MIN_ANSWER_MAX_LENGTH, MAX_ANSWER_MAX_LENGTH, MIN_ANSWER_MAX_LENGTH)
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return clampToRange(value, MIN_ANSWER_MAX_LENGTH, MAX_ANSWER_MAX_LENGTH, fallback)
}

function clampToRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return Math.round(value)
}

function buildSystemPrompt(answerMaxLength: number): string {
  return [
    '你是文件问答助手。用户上传了一个或多个文件，并提出了一个问题或要求。',
    '请以文件内容为主要依据来回答，同时可以结合你自己的知识、经验和见解进行补充、分析和延伸，给出有价值的观点。',
    '当文件内容与你的判断不一致时，请说明并给出你的看法；文件中没有直接依据时，也可以基于常识和推理作答，但需避免凭空编造具体事实。',
    `回答字数请控制在 ${answerMaxLength} 字以内。`,
    buildQaOutputFormat(),
  ].join('\n')
}

export interface BuiltAnswerPrompt {
  systemPrompt: string
  userPrompt: string
  truncated: boolean
}

/**
 * 构建系统提示词与用户提示词，并按 token 预算截断文件正文。
 */
export function buildDocumentQaPrompt(
  documents: NormalizedDocument[],
  query: string,
  answerMaxLength: number,
  maxInputTokens: number,
): BuiltAnswerPrompt {
  const systemPrompt = buildSystemPrompt(answerMaxLength)

  const totalBudget = Number.isFinite(maxInputTokens) && maxInputTokens > 0 ? maxInputTokens : 8000
  const bodyBudget = Math.max(MIN_BODY_TOKEN_BUDGET, totalBudget - RESERVED_TOKENS - estimateTokens(query))
  const perDocBudget = Math.max(1, Math.floor(bodyBudget / documents.length))

  let truncated = false
  const segments = documents.map((doc, idx) => {
    const { text, truncated: cut } = truncateToTokenBudget(doc.text.trim(), perDocBudget)
    if (cut) truncated = true
    const suffix = cut ? '\n（此文件内容较长，已截断）' : ''
    return `【文件${idx + 1}：${doc.fileName}】\n${text}${suffix}`
  })

  const userPrompt = [
    '以下是用户上传的文件内容：',
    '',
    segments.join('\n\n'),
    '',
    `用户的问题或要求：${query}`,
  ].join('\n')

  return { systemPrompt, userPrompt, truncated }
}

export interface AnswerResult {
  code: number
  message: string
  answer: string
}

/**
 * 非流式：消费完整流式结果后返回最终答案。
 */
export async function generateDocumentAnswer(
  systemPrompt: string,
  userPrompt: string,
  module: string,
): Promise<AnswerResult> {
  let raw = ''
  for await (const piece of streamLlmText(systemPrompt, userPrompt)) {
    raw += piece
  }

  logger.info(module, `模型原始输出: ${raw.slice(0, 200)}${raw.length > 200 ? '...' : ''}`)

  const answer = raw.trim()
  if (!answer) {
    return { code: 500, message: '模型处理失败或服务内部错误', answer: '' }
  }

  return { code: 200, message: 'success', answer }
}

export interface DocumentQaStreamOptions {
  systemPrompt: string
  userPrompt: string
  module: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 600_000

/**
 * 流式：按接口文档输出 SSE。
 *   data: [START]
 *   data: {"type":"answer","value":"..."}
 *   data: {"type":"result","value":{"code":200,"message":"success","answer":"..."}}
 *   data: [DONE]
 * 生成出错时输出 data: {"type":"error","value":"..."}
 */
export function createDocumentQaSseStream(opts: DocumentQaStreamOptions): ReadableStream<Uint8Array> {
  const { systemPrompt, userPrompt, module, timeoutMs = DEFAULT_TIMEOUT_MS } = opts
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
      const sendData = (payload: unknown) => send(`data: ${JSON.stringify(payload)}\n\n`)
      const close = () => {
        if (!closed) {
          closed = true
          controller.close()
        }
      }
      const timeout = setTimeout(() => {
        logger.warn(module, `SSE 请求超时: ${timeoutMs}ms`)
        sendData({ type: 'error', value: '请求超时' })
        close()
      }, timeoutMs)

      let raw = ''
      try {
        send('data: [START]\n\n')

        for await (const piece of streamLlmText(systemPrompt, userPrompt)) {
          if (closed) return
          if (!piece) continue
          raw += piece
          sendData({ type: 'answer', value: piece })
        }

        const answer = raw.trim()
        const result: AnswerResult = answer
          ? { code: 200, message: 'success', answer }
          : { code: 500, message: '模型处理失败或服务内部错误', answer: '' }

        sendData({ type: 'result', value: result })
        send('data: [DONE]\n\n')
        logger.info(module, `SSE 生成完成, 回答长度: ${answer.length}, 耗时: ${Date.now() - startTime}ms`)
      } catch (error: any) {
        logger.error(module, `生成失败: ${error?.message || error}`)
        sendData({ type: 'error', value: error?.message || '系统内部错误' })
      } finally {
        clearTimeout(timeout)
        close()
      }
    },
  })
}
