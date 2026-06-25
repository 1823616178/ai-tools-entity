import { logger } from '../../utils/logger'
import { createQaSseStream, startSseResponse } from '../../utils/qaStream'

/**
 * 标准问答式检索（SSE 流式）
 * 对齐文档 POST /text_search/questionStream
 *
 * 请求体 QuestionParam: { session_id?, question, mode?, history?, context? }
 * 响应 text/event-stream: [START] / reason / answer / cite / [DONE]
 * 本实现使用本地配置的大模型完成问答（无向量库，context 即作为检索上下文喂给模型）。
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'text_search/questionStream'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const body = await readBody(event)
  const { session_id, question, mode, history, context } = body || {}

  const sessionId = typeof session_id === 'string' && session_id ? session_id : String(Date.now())

  startSseResponse(event)

  if (!question || typeof question !== 'string') {
    return `event: error\ndata: ${JSON.stringify({ message: '参数错误：question 不能为空' })}\n\n`
  }

  logger.info(MODULE, `session=${sessionId} mode=${mode || '-'} question=${question.slice(0, 50)}`)

  // 组装上下文文本
  const contextLines: string[] = []
  const book = context?.book
  if (book && typeof book === 'object') {
    const fields: Array<[string, unknown]> = [
      ['书名', book.title],
      ['作者', book.author],
      ['馆藏', book.library],
      ['四部分类', book['four-fold']],
      ['类型', book.type],
      ['内容', book.content],
    ]
    const parts = fields.filter(([, v]) => v).map(([k, v]) => `${k}：${v}`)
    if (parts.length) contextLines.push(`【书籍信息】\n${parts.join('\n')}`)
  }
  const chapter = context?.chapter
  if (chapter && typeof chapter === 'object') {
    const parts: string[] = []
    if (chapter.title) parts.push(`章节标题：${chapter.title}`)
    if (chapter.content) parts.push(`章节内容：${chapter.content}`)
    if (parts.length) contextLines.push(`【章节信息】\n${parts.join('\n')}`)
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

  const systemPrompt = [
    '你是一位古汉语与古籍文献领域的智能问答助手。',
    '请基于提供的检索上下文（书籍、章节信息）回答用户问题；上下文不足时可结合自身知识，但需保持严谨。',
    '输出要求：先输出简短的推理过程，再输出正式回答；',
    `两部分之间用单独一行的分隔符 "===ANSWER===" 隔开。分隔符之前为推理过程，之后为正式回答。`,
    '正式回答使用现代汉语，条理清晰；不要重复输出分隔符。',
  ].join('\n')

  const userPromptParts: string[] = []
  if (contextLines.length) userPromptParts.push(`检索到的上下文：\n${contextLines.join('\n\n')}`)
  if (historyLines.length) userPromptParts.push(`历史对话：\n${historyLines.join('\n')}`)
  userPromptParts.push(`用户问题：${question}`)
  const userPrompt = userPromptParts.join('\n\n')

  // 若提供了书籍上下文，则构造一条 cite 事件，结构对齐文档
  const cites: Array<Record<string, unknown>> = []
  if (book && typeof book === 'object' && (book.title || book.content)) {
    cites.push({
      book: {
        creator: book.author ?? '',
        orgName: book.library ?? '',
        edition: book.type ?? '',
        title: book.title ?? '',
        'four-fold': book['four-fold'] ?? '',
      },
      text: chapter?.content ?? book.content ?? '',
    })
  }

  logger.section(MODULE, `开始流式生成, 准备耗时: ${Date.now() - startTime}ms`)

  return createQaSseStream({
    sessionId,
    systemPrompt,
    userPrompt,
    cites,
    module: MODULE,
  })
})
