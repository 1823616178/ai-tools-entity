import { logger } from '../../utils/logger'
import { createQaSseStream, startSseResponse } from '../../utils/qaStream'

/**
 * 摘要问答式检索（SSE 流式）
 * 对齐文档 POST /text_search/summary_questionStream
 *
 * 请求体 SummaryQuestionParam: { session_id?, summary, fourFold?, title?, author?, threshold?, topN?, mode?, history? }
 * 响应 text/event-stream: query_result -> [START] -> reason / answer / cite -> [DONE]
 * 本实现无 Milvus，query_result 依据传入的精确过滤条件（title/author/fourFold）回显匹配摘要，
 * 再交由本地大模型基于这些条件流式问答。
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'text_search/summary_questionStream'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const body = await readBody(event)
  const { session_id, summary, fourFold, title, author, threshold, topN, mode, history } = body || {}

  const sessionId = typeof session_id === 'string' && session_id ? session_id : String(Date.now())
  const thresholdVal = typeof threshold === 'number' ? threshold : 0.55
  const topNVal = typeof topN === 'number' && topN > 0 ? topN : 5

  startSseResponse(event)

  if (!summary || typeof summary !== 'string') {
    return `event: error\ndata: ${JSON.stringify({ message: '参数错误：summary 不能为空' })}\n\n`
  }

  logger.info(MODULE, `session=${sessionId} mode=${mode || '-'} threshold=${thresholdVal} topN=${topNVal}`)

  // 构造 query_result：依据精确过滤条件回显匹配记录（无向量库，做轻量复刻）
  const queryResultValue: Array<Record<string, unknown>> = []
  if (title || author || fourFold) {
    queryResultValue.push({
      bookId: 0,
      fourFold: fourFold ?? '',
      title: title ?? '',
      author: author ?? '',
      score: Number(Math.max(thresholdVal, 0.8).toFixed(2)),
    })
  }
  const queryResultEvent = {
    session_id: sessionId,
    type: 'query_result',
    value: queryResultValue.slice(0, topNVal),
  }

  // 历史对话
  const historyLines: string[] = []
  if (Array.isArray(history)) {
    for (const h of history) {
      if (h && typeof h.content === 'string') {
        const role = h.role === 'assistant' ? '助手' : '用户'
        historyLines.push(`${role}：${h.content}`)
      }
    }
  }

  // 过滤条件描述
  const filterLines: string[] = []
  if (fourFold) filterLines.push(`四部分类：${fourFold}`)
  if (title) filterLines.push(`书名：${title}`)
  if (author) filterLines.push(`作者：${author}`)

  const systemPrompt = [
    '你是一位古汉语与古籍文献领域的智能问答助手。',
    '用户会给出一段「摘要/问题主体」以及可选的过滤条件（四部分类、书名、作者）。',
    '请基于这些信息进行问答式回答；信息不足时可结合自身知识，但需保持严谨。',
    '输出要求：先输出简短的推理过程，再输出正式回答；',
    '两部分之间用单独一行的分隔符 "===ANSWER===" 隔开。分隔符之前为推理过程，之后为正式回答。',
    '正式回答使用现代汉语，条理清晰；不要重复输出分隔符。',
  ].join('\n')

  const userPromptParts: string[] = []
  if (filterLines.length) userPromptParts.push(`过滤条件：\n${filterLines.join('\n')}`)
  if (historyLines.length) userPromptParts.push(`历史对话：\n${historyLines.join('\n')}`)
  userPromptParts.push(`摘要/问题主体：${summary}`)
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
