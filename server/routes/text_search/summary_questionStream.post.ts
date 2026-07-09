import { logger } from '../../utils/logger'
import { buildQaOutputFormat } from '../../utils/qaOutputFormat'
import { createQaSseStream, startSseResponse } from '../../utils/qaStream'

type UnknownRecord = Record<string, unknown>

/**
 * 摘要问答式检索（SSE 流式）
 * 对齐文档 POST /text_search/summary_questionStream
 *
 * 请求体 SummaryQuestionParam: { session_id?, summary, fourFold?, title?, author?, threshold?, topN?, mode?, history? }
 * 响应 text/event-stream: query_result -> [START] -> reason / answer / cite -> [DONE]
 * 本实现不接入 Java/Milvus，按文档模拟摘要检索结果，再交由本地大模型流式生成正式回答。
 */

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim()
  }
  if (value === null || value === undefined) {
    return ''
  }
  return String(value).trim()
}

function boundedNumber(value: unknown, fallback: number, minValue: number, maxValue: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(maxValue, Math.max(minValue, parsed))
}

function normalizeTopN(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 5
  }
  return Math.floor(parsed)
}

function stableBookId(...parts: string[]): number {
  const source = parts.filter(Boolean).join('|') || 'summary-question-stream'
  let hash = 0
  for (const character of source) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash || 1006408
}

function buildHistoryLines(history: unknown): string[] {
  if (!Array.isArray(history)) {
    return []
  }

  return history
    .filter(isRecord)
    .map((item) => {
      const content = textValue(item.content)
      if (!content) {
        return ''
      }
      const role = item.role === 'assistant' ? '助手' : '用户'
      return `${role}：${content}`
    })
    .filter(Boolean)
}

export default defineEventHandler(async (event) => {
  const MODULE = 'text_search/summary_questionStream'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const body = await readBody(event)
  const { session_id, summary, fourFold, title, author, threshold, topN, history } = body || {}

  const sessionId = typeof session_id === 'string' && session_id ? session_id : String(Date.now())
  const summaryText = textValue(summary)
  const fourFoldText = textValue(fourFold)
  const titleText = textValue(title)
  const authorText = textValue(author)
  const thresholdVal = boundedNumber(threshold, 0.55, 0, 1)
  const topNVal = normalizeTopN(topN)

  startSseResponse(event)

  if (!summaryText) {
    return `event: error\ndata: ${JSON.stringify({ message: '参数错误：summary 不能为空' })}\n\n`
  }

  logger.info(MODULE, `session=${sessionId} threshold=${thresholdVal} topN=${topNVal}`)

  const score = Number(Math.max(thresholdVal, 0.83).toFixed(2))
  const queryResultValue = [
    {
      bookId: stableBookId(summaryText, fourFoldText, titleText, authorText),
      fourFold: fourFoldText || '未指定',
      title: titleText || '模拟匹配古籍',
      author: authorText || '佚名',
      score,
    },
  ].slice(0, topNVal)
  const queryResultEvent = {
    session_id: sessionId,
    type: 'query_result',
    value: queryResultValue.slice(0, topNVal),
  }

  const historyLines = buildHistoryLines(history)
  const filterLines: string[] = []
  if (fourFoldText) filterLines.push(`四部分类：${fourFoldText}`)
  if (titleText) filterLines.push(`书名：${titleText}`)
  if (authorText) filterLines.push(`作者：${authorText}`)

  const systemPrompt = [
    '你是一位古汉语与古籍文献领域的智能问答助手。',
    buildQaOutputFormat(),
    '用户会给出一段「摘要/问题主体」以及可选过滤条件，请基于这些信息和模拟命中记录回答。',
    '信息不足时需说明依据不足；可以给出审慎推断，但不要虚构具体馆藏细节。',
    '使用现代汉语，条理清晰。',
  ].join('\n')

  const userPromptParts: string[] = []
  if (filterLines.length) userPromptParts.push(`过滤条件：\n${filterLines.join('\n')}`)
  userPromptParts.push(`模拟命中记录：\n${JSON.stringify(queryResultValue, null, 2)}`)
  if (historyLines.length) userPromptParts.push(`历史对话：\n${historyLines.join('\n')}`)
  userPromptParts.push(`摘要/问题主体：${summaryText}`)
  const userPrompt = userPromptParts.join('\n\n')

  logger.section(MODULE, `开始流式生成, 准备耗时: ${Date.now() - startTime}ms`)

  return createQaSseStream({
    sessionId,
    systemPrompt,
    userPrompt,
    preEvents: [queryResultEvent],
    module: MODULE,
  })
})
