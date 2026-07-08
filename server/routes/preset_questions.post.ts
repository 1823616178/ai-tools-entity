import { generateText } from '../utils/textGeneration'
import { logger } from '../utils/logger'

const MAX_HISTORY_ITEMS = 200
const MAX_HISTORY_CHARS = 20000
const MIN_PRESET_COUNT = 5
const MAX_PRESET_COUNT = 10

function clampPresetCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return MAX_PRESET_COUNT
  if (value < MIN_PRESET_COUNT) return MIN_PRESET_COUNT
  if (value > MAX_PRESET_COUNT) return MAX_PRESET_COUNT
  return value
}

function normalizeRecentQuestions(input: string[]): string[] {
  const cleaned = input
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)

  while (cleaned.length > MAX_HISTORY_ITEMS) {
    cleaned.shift()
  }

  let totalChars = cleaned.reduce((sum, item) => sum + item.length, 0)
  while (totalChars > MAX_HISTORY_CHARS && cleaned.length > 0) {
    const removed = cleaned.shift()!
    totalChars -= removed.length
  }

  return cleaned
}

function formatHistoryForPrompt(questions: string[]): string {
  if (!questions.length) return '(无历史问题)'
  return questions.map((item, idx) => `${idx + 1}. ${item}`).join('\n')
}

function extractJsonFromText(text: string): unknown {
  try {
    return JSON.parse(text.trim())
  } catch {
    // ignore
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {
      // ignore
    }
  }

  const jsonMatch = text.match(/(\{[\s\S]*\})/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim())
    } catch {
      // ignore
    }
  }

  return null
}

export default defineEventHandler(async (event) => {
  const MODULE = 'preset_questions'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { user_id, recent_questions, max_preset_count } = body || {}

    if (!user_id || typeof user_id !== 'string' || !user_id.trim()) {
      return {
        code: 400,
        message: '请求参数无效（如 user_id 为空）',
        preset_questions: [],
      }
    }

    if (!Array.isArray(recent_questions) || !recent_questions.every((item) => typeof item === 'string')) {
      return {
        code: 400,
        message: '请求参数无效（如 recent_questions 格式错误）',
        preset_questions: [],
      }
    }

    const targetCount = clampPresetCount(max_preset_count)
    const normalizedHistory = normalizeRecentQuestions(recent_questions)
    const totalChars = normalizedHistory.reduce((sum, item) => sum + item.length, 0)

    logger.info(MODULE, `user_id: ${user_id.trim()}`)
    logger.info(MODULE, `历史问题数量: ${normalizedHistory.length}, 总字数: ${totalChars}, 目标返回数量: ${targetCount}`)

    const prompt = [
      '你是问题推荐助手。',
      '请基于用户近30天历史问题，生成用户下一步可能感兴趣的预设问题推荐。',
      '要求：',
      '1. 输出问题数量必须恰好为 ' + targetCount + ' 条。',
      '2. 每条问题都要具体、自然、可直接提问。',
      '3. 推荐要与历史兴趣相关，同时保持多样化。',
      '4. 不要输出重复问题。',
      '5. 必须按下面格式严格输出 JSON（不要加 Markdown 代码块标记，不要输出额外说明）：',
      '',
      '{"preset_questions": ["问题1", "问题2", ...]}',
      '',
      '用户ID：' + user_id.trim(),
      '历史问题列表：',
      formatHistoryForPrompt(normalizedHistory),
    ].join('\n')

    const rawText = await generateText([{ role: 'user', content: prompt }])

    logger.info(MODULE, `模型原始输出: ${rawText.slice(0, 200)}...`)

    const extracted = extractJsonFromText(rawText)
    if (!extracted || typeof extracted !== 'object') {
      logger.error(MODULE, `模型输出解析失败`)
      return {
        code: 500,
        message: '模型输出格式异常',
        preset_questions: [],
      }
    }

    const preset_questions_raw = (extracted as any)?.preset_questions
    if (!Array.isArray(preset_questions_raw)) {
      logger.error(MODULE, `模型输出格式异常: preset_questions 不是数组`)
      return {
        code: 500,
        message: '模型输出格式异常',
        preset_questions: [],
      }
    }

    const uniqueQuestions = Array.from(
      new Set(
        preset_questions_raw
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0),
      ),
    )

    const preset_questions = uniqueQuestions.slice(0, targetCount)

    if (preset_questions.length < MIN_PRESET_COUNT) {
      logger.error(MODULE, `模型返回问题数量不足: ${preset_questions.length}`)
      return {
        code: 500,
        message: '模型处理失败或服务内部错误',
        preset_questions: [],
      }
    }

    logger.info(MODULE, `返回问题数量: ${preset_questions.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      preset_questions,
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '模型处理失败或服务内部错误',
      preset_questions: [],
    }
  }
})
