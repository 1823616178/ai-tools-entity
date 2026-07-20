import { streamLlmText } from './llmStream'
import { logger } from './logger'

/**
 * 文件问题推荐（/document_recommended_questions）核心逻辑。
 *
 * 依据接口文档：
 *  - 接收应用端解析后的纯文本（不接收二进制文件）。
 *  - 多文件按传入顺序拼接，并在每段前加入文件序号和文件名。
 *  - 输入内容统一按 llm.max_input_tokens 做 token 预算，保留固定提示词和输出要求，只截断文件正文。
 *  - 推荐问题只基于传入文件文本生成，不引入外部信息。
 *  - 内部统一使用流式生成链路，stream=false 时消费完整流式结果后返回 JSON。
 */

export const MIN_DOCUMENTS = 1
export const MAX_DOCUMENTS = 50
export const MIN_QUESTION_COUNT = 1
export const MAX_QUESTION_COUNT = 10

/** 为系统提示词 + 输出内容预留的 token 预算 */
const RESERVED_TOKENS = 600
/** 兜底的最小正文预算，避免 max_input_tokens 配置过小导致正文被清空 */
const MIN_BODY_TOKEN_BUDGET = 200

export interface NormalizedDocument {
  fileName: string
  text: string
}

export interface DocumentValidationResult {
  ok: boolean
  message?: string
  normalized?: NormalizedDocument[]
}

/**
 * 校验并规范化 documents 参数。
 * file_name 为空时按 `文件N` 生成占位名。
 */
export function validateDocuments(documents: unknown): DocumentValidationResult {
  if (!Array.isArray(documents) || documents.length === 0) {
    return { ok: false, message: '参数错误：documents 不能为空' }
  }

  if (documents.length > MAX_DOCUMENTS) {
    return { ok: false, message: `参数错误：documents 数量不能超过 ${MAX_DOCUMENTS}` }
  }

  const normalized: NormalizedDocument[] = []

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return { ok: false, message: `参数错误：documents[${i}] 格式错误` }
    }

    const record = doc as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text : ''
    if (!text.trim()) {
      return { ok: false, message: `参数错误：documents[${i}].text 不能为空` }
    }

    if (record.file_name !== undefined && typeof record.file_name !== 'string') {
      return { ok: false, message: `参数错误：documents[${i}].file_name 须为字符串` }
    }

    const fileName = (typeof record.file_name === 'string' ? record.file_name.trim() : '') || `文件${i + 1}`
    normalized.push({ fileName, text })
  }

  return { ok: true, normalized }
}

/**
 * 将 question_count 收敛到 [MIN, MAX]，非法/缺省时回退到默认值。
 */
export function clampQuestionCount(value: unknown, defaultCount: number): number {
  const fallback = clampToRange(defaultCount, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT)
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return fallback
  }
  return clampToRange(value, MIN_QUESTION_COUNT, MAX_QUESTION_COUNT, fallback)
}

function clampToRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return Math.round(value)
}

/**
 * 粗略估算文本 token 数：中日韩字符约 1 token/字，其余字符约 1 token/4 字符。
 */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (isCjkCodePoint(code)) {
      cjk++
    } else {
      other++
    }
  }
  return Math.ceil(cjk + other / 4)
}

function isCjkCodePoint(code: number): boolean {
  return (
    (code >= 0x3040 && code <= 0x30ff) || // 平假名 / 片假名
    (code >= 0x3400 && code <= 0x4dbf) || // CJK 扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一表意文字
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容表意文字
    (code >= 0x20000 && code <= 0x2ebef) // CJK 扩展 B-F
  )
}

export function truncateToTokenBudget(text: string, tokenBudget: number): { text: string; truncated: boolean } {
  if (tokenBudget <= 0) {
    return { text: '', truncated: text.length > 0 }
  }
  if (estimateTokens(text) <= tokenBudget) {
    return { text, truncated: false }
  }

  // 最坏情况按 1 token/字符估算，先粗切再逐步收敛
  let sliced = text.slice(0, tokenBudget)
  while (sliced.length > 0 && estimateTokens(sliced) > tokenBudget) {
    sliced = sliced.slice(0, Math.floor(sliced.length * 0.9))
  }
  return { text: sliced, truncated: true }
}

function buildSystemPrompt(questionCount: number): string {
  return [
    '你是文件问题推荐助手。用户上传了一个或多个文件，你需要基于文件的实际内容，生成用户可能会进一步提问的推荐问题。',
    '要求：',
    `1. 推荐问题数量必须恰好为 ${questionCount} 个。`,
    '2. 问题必须且只能基于所给文件内容，不得引入外部信息或凭空编造。',
    '3. 每个问题应具体、清晰、可直接向助手提问。',
    '4. 涉及多个文件时，问题应尽量覆盖不同文件或不同方面，保持多样化，不要重复。',
    '5. 只输出推荐问题本身，使用阿拉伯数字编号，每行一个，形如：',
    '   1. 第一个问题',
    '   2. 第二个问题',
    '6. 不要输出问题列表以外的任何前言、解释或结尾。',
  ].join('\n')
}

export interface BuiltPrompt {
  systemPrompt: string
  userPrompt: string
  truncated: boolean
}

/**
 * 构建系统提示词与用户提示词，并按 token 预算截断文件正文。
 */
export function buildDocumentQuestionsPrompt(
  documents: NormalizedDocument[],
  questionCount: number,
  maxInputTokens: number,
): BuiltPrompt {
  const systemPrompt = buildSystemPrompt(questionCount)

  const totalBudget = Number.isFinite(maxInputTokens) && maxInputTokens > 0 ? maxInputTokens : 8000
  const bodyBudget = Math.max(MIN_BODY_TOKEN_BUDGET, totalBudget - RESERVED_TOKENS)
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
    `请基于以上文件内容，生成 ${questionCount} 个推荐问题。`,
  ].join('\n')

  return { systemPrompt, userPrompt, truncated }
}

function tryParseJsonQuestions(raw: string): string[] | null {
  const tryParse = (candidate: string): string[] | null => {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string')
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).recommended_questions)) {
        return (parsed as any).recommended_questions.filter((item: unknown): item is string => typeof item === 'string')
      }
    } catch {
      // ignore
    }
    return null
  }

  const direct = tryParse(raw.trim())
  if (direct) return direct

  const objMatch = raw.match(/\{[\s\S]*\}/)
  if (objMatch) {
    const parsed = tryParse(objMatch[0])
    if (parsed) return parsed
  }

  const arrMatch = raw.match(/\[[\s\S]*\]/)
  if (arrMatch) {
    const parsed = tryParse(arrMatch[0])
    if (parsed) return parsed
  }

  return null
}

/**
 * 从模型原始文本中解析推荐问题列表：优先兼容 JSON，退化到按行/编号解析。
 */
export function parseRecommendedQuestions(raw: string, questionCount: number): string[] {
  if (!raw || !raw.trim()) return []

  const jsonQuestions = tryParseJsonQuestions(raw)
  const candidates = jsonQuestions
    ? jsonQuestions
    : raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) =>
          line
            .replace(/^[-*•]\s*/, '')
            .replace(/^\d+\s*[.、)．)]\s*/, '')
            .trim(),
        )

  const unique = Array.from(
    new Set(candidates.map((item) => item.trim()).filter((item) => item.length > 0)),
  )

  return unique.slice(0, questionCount)
}

export interface RecommendResult {
  code: number
  message: string
  recommended_questions: string[]
}

/**
 * 非流式：消费完整流式结果后解析为推荐问题数组。
 */
export async function generateRecommendedQuestions(
  systemPrompt: string,
  userPrompt: string,
  questionCount: number,
  module: string,
): Promise<RecommendResult> {
  let raw = ''
  for await (const piece of streamLlmText(systemPrompt, userPrompt)) {
    raw += piece
  }

  logger.info(module, `模型原始输出: ${raw.slice(0, 200)}${raw.length > 200 ? '...' : ''}`)

  const recommended_questions = parseRecommendedQuestions(raw, questionCount)
  if (!recommended_questions.length) {
    return { code: 500, message: '模型处理失败或服务内部错误', recommended_questions: [] }
  }

  return { code: 200, message: 'success', recommended_questions }
}

export interface DocQuestionsStreamOptions {
  systemPrompt: string
  userPrompt: string
  questionCount: number
  module: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 600_000

/**
 * 流式：按接口文档输出 SSE。
 *   data: [START]
 *   data: {"type":"answer","value":"..."}
 *   data: {"type":"result","value":{"code":200,...,"recommended_questions":[...]}}
 *   data: [DONE]
 * 生成出错时输出 data: {"type":"error","value":"..."}
 */
export function createDocQuestionsSseStream(opts: DocQuestionsStreamOptions): ReadableStream<Uint8Array> {
  const { systemPrompt, userPrompt, questionCount, module, timeoutMs = DEFAULT_TIMEOUT_MS } = opts
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

        const recommended_questions = parseRecommendedQuestions(raw, questionCount)
        const result: RecommendResult =
          recommended_questions.length > 0
            ? { code: 200, message: 'success', recommended_questions }
            : { code: 500, message: '模型处理失败或服务内部错误', recommended_questions: [] }

        sendData({ type: 'result', value: result })
        send('data: [DONE]\n\n')
        logger.info(module, `SSE 生成完成, 推荐问题数量: ${recommended_questions.length}, 耗时: ${Date.now() - startTime}ms`)
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
