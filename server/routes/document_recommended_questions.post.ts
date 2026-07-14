import { logger } from '../utils/logger'
import { startSseResponse } from '../utils/qaStream'
import {
  buildDocumentQuestionsPrompt,
  clampQuestionCount,
  createDocQuestionsSseStream,
  generateRecommendedQuestions,
  MAX_QUESTION_COUNT,
  MIN_QUESTION_COUNT,
  validateDocuments,
} from '../utils/documentQuestions'

/**
 * 文件问题推荐 POST /document_recommended_questions
 * 对齐《文件问题推荐接口文档》：
 *  - 入参 documents（1-50）/ question_count（1-10）/ stream（bool）
 *  - stream=false 返回 JSON：{ code, message, recommended_questions }
 *  - stream=true  返回 text/event-stream：[START] / answer / result / [DONE]
 *  - 参数错误发生在生成前，即使 stream=true 也返回普通 JSON 400
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'document_recommended_questions'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const body = await readBody(event)
  const { documents, question_count, stream } = body || {}

  // 1. stream 必须是布尔值（如果提供）
  if (stream !== undefined && typeof stream !== 'boolean') {
    return { code: 400, message: '参数错误：stream 须为布尔值' }
  }
  const useStream = stream === true

  // 2. 校验 documents
  const validation = validateDocuments(documents)
  if (!validation.ok || !validation.normalized) {
    logger.error(MODULE, validation.message || '参数错误')
    return { code: 400, message: validation.message || '参数错误：documents 无效' }
  }

  // 3. 校验 question_count
  if (
    question_count !== undefined &&
    (typeof question_count !== 'number' ||
      !Number.isInteger(question_count) ||
      question_count < MIN_QUESTION_COUNT ||
      question_count > MAX_QUESTION_COUNT)
  ) {
    return {
      code: 400,
      message: `参数错误：question_count 须为 ${MIN_QUESTION_COUNT}-${MAX_QUESTION_COUNT} 的整数`,
    }
  }

  const config = useRuntimeConfig()
  const defaultCount = Number(config.documentRecommendedQuestions?.questionCount) || 3
  const maxInputTokens = Number(config.llm?.maxInputTokens) || 8000
  const questionCount = clampQuestionCount(question_count, defaultCount)

  logger.info(
    MODULE,
    `文件数量: ${validation.normalized.length}, 目标问题数: ${questionCount}, stream: ${useStream}`,
  )

  const { systemPrompt, userPrompt, truncated } = buildDocumentQuestionsPrompt(
    validation.normalized,
    questionCount,
    maxInputTokens,
  )
  if (truncated) {
    logger.info(MODULE, `文件正文超出 token 预算（${maxInputTokens}），已按预算截断`)
  }

  // 4. 流式输出
  if (useStream) {
    startSseResponse(event)
    logger.section(MODULE, `开始流式生成, 准备耗时: ${Date.now() - startTime}ms`)
    return createDocQuestionsSseStream({ systemPrompt, userPrompt, questionCount, module: MODULE })
  }

  // 5. 非流式：内部消费完整流式结果后返回 JSON
  try {
    const result = await generateRecommendedQuestions(systemPrompt, userPrompt, questionCount, MODULE)
    logger.info(MODULE, `返回推荐问题数量: ${result.recommended_questions.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)
    return result
  } catch (error: any) {
    logger.error(MODULE, error?.message || '未知错误')
    return {
      code: 500,
      message: error?.message || '模型处理失败或服务内部错误',
      recommended_questions: [],
    }
  }
})
