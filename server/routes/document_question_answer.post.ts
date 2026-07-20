import { logger } from '../utils/logger'
import { startSseResponse } from '../utils/qaStream'
import { validateDocuments } from '../utils/documentQuestions'
import {
  buildDocumentQaPrompt,
  clampAnswerMaxLength,
  createDocumentQaSseStream,
  generateDocumentAnswer,
  MAX_ANSWER_MAX_LENGTH,
  MIN_ANSWER_MAX_LENGTH,
} from '../utils/documentQuestionAnswer'

/**
 * 文件问答 POST /document_question_answer
 * 对齐《文件问答接口文档》：
 *  - 入参 documents（1-50）/ query（必填）/ answer_max_length（100-2000）/ stream（bool）
 *  - stream=false 返回 JSON：{ code, message, answer }
 *  - stream=true  返回 text/event-stream：[START] / answer / result / [DONE]
 *  - 参数错误发生在生成前，即使 stream=true 也返回普通 JSON 400
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'document_question_answer'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const body = await readBody(event)
  const { documents, query, answer_max_length, stream } = body || {}

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

  // 3. 校验 query
  if (typeof query !== 'string' || !query.trim()) {
    return { code: 400, message: '参数错误：query 不能为空' }
  }

  // 4. 校验 answer_max_length
  if (
    answer_max_length !== undefined &&
    (typeof answer_max_length !== 'number' ||
      answer_max_length < MIN_ANSWER_MAX_LENGTH ||
      answer_max_length > MAX_ANSWER_MAX_LENGTH)
  ) {
    return {
      code: 400,
      message: `参数错误：answer_max_length 须在 ${MIN_ANSWER_MAX_LENGTH}-${MAX_ANSWER_MAX_LENGTH} 范围内`,
    }
  }

  const config = useRuntimeConfig()
  const defaultLength = Number(config.documentQuestionAnswer?.answerMaxLength) || 800
  const maxInputTokens = Number(config.llm?.maxInputTokens) || 8000
  const answerMaxLength = clampAnswerMaxLength(answer_max_length, defaultLength)

  logger.info(
    MODULE,
    `文件数量: ${validation.normalized.length}, answer_max_length: ${answerMaxLength}, stream: ${useStream}`,
  )

  const { systemPrompt, userPrompt, truncated } = buildDocumentQaPrompt(
    validation.normalized,
    query.trim(),
    answerMaxLength,
    maxInputTokens,
  )
  if (truncated) {
    logger.info(MODULE, `文件正文超出 token 预算（${maxInputTokens}），已按预算截断`)
  }

  // 调试：打印实际拼给模型的用户提示词（长度 + 预览），便于定位“未找到相关信息”问题
  logger.info(MODULE, `userPrompt 长度: ${userPrompt.length}`)
  logger.info(MODULE, `userPrompt 预览: ${userPrompt.slice(0, 300)}`)

  // 5. 流式输出
  if (useStream) {
    startSseResponse(event)
    logger.section(MODULE, `开始流式生成, 准备耗时: ${Date.now() - startTime}ms`)
    return createDocumentQaSseStream({ systemPrompt, userPrompt, module: MODULE })
  }

  // 6. 非流式：内部消费完整流式结果后返回 JSON
  try {
    const result = await generateDocumentAnswer(systemPrompt, userPrompt, MODULE)
    logger.info(MODULE, `回答长度: ${result.answer.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)
    return result
  } catch (error: any) {
    logger.error(MODULE, error?.message || '未知错误')
    return {
      code: 500,
      message: error?.message || '模型处理失败或服务内部错误',
      answer: '',
    }
  }
})
