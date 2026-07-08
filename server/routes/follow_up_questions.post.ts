import { generateText } from '../utils/textGeneration'
import { logger } from '../utils/logger'

const DEFAULT_MAX_QUESTIONS = 3
const MIN_QUESTIONS = 1
const MAX_QUESTIONS = 5

function clampMaxQuestions(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_MAX_QUESTIONS
  if (value < MIN_QUESTIONS) return MIN_QUESTIONS
  if (value > MAX_QUESTIONS) return MAX_QUESTIONS
  return value
}

function formatConversationHistory(
  history: Array<{ role: string; content: string; timestamp?: string }>,
): string {
  if (!history.length) return '(无历史对话)'
  return history
    .map((item) => {
      const role = item.role === 'user' ? '用户' : '助手'
      return `${role}：${item.content}`
    })
    .join('\n')
}

function getLastUserQuestion(
  history: Array<{ role: string; content: string }>,
): string {
  const lastUserMsg = [...history].reverse().find((item) => item.role === 'user')
  return lastUserMsg?.content?.trim() || '用户当前问题未知'
}

export default defineEventHandler(async (event) => {
  const MODULE = 'follow_up_questions'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { conversation_history, max_questions } = body || {}

    if (
      !conversation_history ||
      !Array.isArray(conversation_history) ||
      conversation_history.length === 0 ||
      !conversation_history.every(
        (item: any) =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.role === 'string' &&
          (item.role === 'user' || item.role === 'assistant') &&
          typeof item.content === 'string' &&
          (item.timestamp === undefined || typeof item.timestamp === 'string'),
      )
    ) {
      return {
        code: 400,
        message: '请求参数无效（conversation_history 不能为空或格式错误）',
        follow_up_questions: [],
      }
    }

    const targetCount = clampMaxQuestions(max_questions)

    logger.info(MODULE, `历史对话数量: ${conversation_history.length}, 目标追问数量: ${targetCount}`)

    const question = getLastUserQuestion(conversation_history)
    const historyText = formatConversationHistory(conversation_history)

    const promptText = [
      '请根据用户当前的问题和历史对话记录，生成 ' + targetCount + ' 个进一步追问的问题。',
      '',
      '要求：',
      '1. 追问问题要围绕当前话题深入展开，引导用户获取更有价值的信息。',
      '2. 每个问题要具体、自然、可直接提问。',
      '3. 问题之间要保持多样化，从不同角度切入。',
      '4. 不要输出与历史对话中已回答过的问题重复的内容。',
      '5. 输出问题数量必须恰好为 ' + targetCount + ' 条，不要输出编号。',
      '',
      '## 重要：请严格按以下 JSON 格式输出，不要包含 ```json 等代码块标记，不要输出任何解释文字',
      '{"follow_up_questions": ["问题1", "问题2", "问题3"]}',
      '',
      '当前用户问题：' + question,
      '',
      '历史对话记录：',
      historyText,
    ].join('\n')

    const raw = await generateText([{ role: 'user', content: promptText }])

    const match = raw.match(/\{[\s\S]*\}/m)
    if (!match) {
      throw new Error(`无法解析模型输出: ${raw.slice(0, 200)}`)
    }

    const parsed = JSON.parse(match[0])
    const uniqueQuestions = Array.from(
      new Set(
        (Array.isArray(parsed?.follow_up_questions) ? parsed.follow_up_questions : [])
          .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item: string) => item.length > 0),
      ),
    )

    const follow_up_questions = uniqueQuestions.slice(0, targetCount)

    if (follow_up_questions.length < 1) {
      logger.error(MODULE, `模型返回追问问题数量不足: ${follow_up_questions.length}`)
      return {
        code: 500,
        message: '模型处理失败或服务内部错误',
        follow_up_questions: [],
      }
    }

    logger.info(MODULE, `返回追问问题数量: ${follow_up_questions.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      follow_up_questions,
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '模型处理失败或服务内部错误',
      follow_up_questions: [],
    }
  }
})
