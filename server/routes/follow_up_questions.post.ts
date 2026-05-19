import { ChatPromptTemplate } from '@langchain/core/prompts'
import { z } from 'zod'
import { getLLM } from '../utils/llm'
import { logger } from '../utils/logger'

const DEFAULT_MAX_QUESTIONS = 3
const MIN_QUESTIONS = 1
const MAX_QUESTIONS = 5

const followUpQuestionsSchema = z.object({
  follow_up_questions: z.array(z.string().min(1)),
})

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
      const time = item.timestamp ? ` [${item.timestamp}]` : ''
      return `${role}${time}：${item.content}`
    })
    .join('\n')
}

export default defineEventHandler(async (event) => {
  const MODULE = 'follow_up_questions'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { query, conversation_history, max_questions } = body || {}

    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        code: 400,
        message: '请求参数无效（如 query 为空）',
        follow_up_questions: [],
      }
    }

    if (
      conversation_history !== undefined &&
      (!Array.isArray(conversation_history) ||
        !conversation_history.every(
          (item: any) =>
            typeof item === 'object' &&
            item !== null &&
            typeof item.role === 'string' &&
            (item.role === 'user' || item.role === 'assistant') &&
            typeof item.content === 'string' &&
            (item.timestamp === undefined || typeof item.timestamp === 'string'),
        ))
    ) {
      return {
        code: 400,
        message: '请求参数无效（如 conversation_history 格式错误）',
        follow_up_questions: [],
      }
    }

    const targetCount = clampMaxQuestions(max_questions)
    const history = Array.isArray(conversation_history) ? conversation_history : []

    logger.info(MODULE, `query: ${query.trim()}`)
    logger.info(MODULE, `历史对话数量: ${history.length}, 目标追问数量: ${targetCount}`)

    const llm = await getLLM()
    const prompt = ChatPromptTemplate.fromTemplate([
      '你是智能问答助手的追问生成器。',
      '请根据用户当前的问题和历史对话记录，生成 {targetCount} 个进一步追问的问题。',
      '要求：',
      '1. 追问问题要围绕当前话题深入展开，引导用户获取更有价值的信息。',
      '2. 每个问题要具体、自然、可直接提问。',
      '3. 问题之间要保持多样化，从不同角度切入。',
      '4. 不要输出与历史对话中已回答过的问题重复的内容。',
      '5. 输出问题数量必须恰好为 {targetCount} 条，不要输出编号。',
      '',
      '当前用户问题：{query}',
      '历史对话记录：',
      '{history}',
    ].join('\n'))

    const chain = prompt.pipe(llm.withStructuredOutput(followUpQuestionsSchema))
    const parsed = await chain.invoke({
      targetCount,
      query: query.trim(),
      history: formatConversationHistory(history),
    })

    const uniqueQuestions = Array.from(
      new Set(
        (Array.isArray(parsed?.follow_up_questions) ? parsed.follow_up_questions : [])
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => item.length > 0),
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
