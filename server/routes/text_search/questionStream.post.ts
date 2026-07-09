import { logger } from '../../utils/logger'
import { buildQaOutputFormat } from '../../utils/qaOutputFormat'
import { createQaSseStream, startSseResponse } from '../../utils/qaStream'

type UnknownRecord = Record<string, unknown>

/**
 * 标准问答式检索（SSE 流式）
 * 对齐文档 POST /text_search/questionStream
 *
 * 请求体 QuestionParam: { session_id?, question, mode?, history?, context? }
 * 响应 text/event-stream: [START] / answer / cite / [DONE]
 * 本实现不接入 Java/Milvus，按文档模拟检索流程和 SSE 出参格式，context 作为召回上下文喂给模型。
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

function numericId(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function shortText(value: string, maxLength = 80): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
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

function buildContextLines(context: unknown): {
  contextLines: string[]
  book?: UnknownRecord
  chapter?: UnknownRecord
} {
  const contextRecord = isRecord(context) ? context : undefined
  const book = isRecord(contextRecord?.book) ? contextRecord.book : undefined
  const chapter = isRecord(contextRecord?.chapter) ? contextRecord.chapter : undefined
  const contextLines: string[] = []

  if (book) {
    const fields: Array<[string, unknown]> = [
      ['书名', book.title],
      ['作者', book.author],
      ['馆藏', book.library],
      ['四部分类', book['four-fold']],
      ['类型', book.type],
      ['内容', book.content],
    ]
    const parts = fields
      .map(([fieldName, fieldValue]) => {
        const normalizedValue = textValue(fieldValue)
        return normalizedValue ? `${fieldName}：${normalizedValue}` : ''
      })
      .filter(Boolean)

    if (parts.length) {
      contextLines.push(`【书籍信息】\n${parts.join('\n')}`)
    }
  }

  if (chapter) {
    const parts: string[] = []
    const title = textValue(chapter.title)
    const content = textValue(chapter.content)
    if (title) parts.push(`章节标题：${title}`)
    if (content) parts.push(`章节内容：${content}`)
    if (parts.length) {
      contextLines.push(`【章节信息】\n${parts.join('\n')}`)
    }
  }

  return { contextLines, book, chapter }
}

function buildDocLikeCite(book?: UnknownRecord, chapter?: UnknownRecord): Record<string, unknown> | null {
  if (!book) {
    return null
  }

  const title = textValue(book.title)
  const excerpt = textValue(chapter?.content) || textValue(book.content)
  if (!title && !excerpt) {
    return null
  }

  const bookId = numericId(book.id ?? book.bookId ?? book.book_id)
  const volumeId = numericId(chapter?.volId ?? chapter?.vol_id ?? book.volId ?? book.vol_id)
  const paraId = numericId(chapter?.paraId ?? chapter?.para_id ?? book.paraId ?? book.para_id)
  const ftpId = textValue(book.ftpId ?? book.ftp_id)

  return {
    image: {
      fileName: textValue(chapter?.title) || title || 'mock',
      imageId: paraId,
      filePath: textValue(book.filePath ?? book.file_path),
      text: excerpt,
      ftpId,
    },
    book: {
      creator: textValue(book.author ?? book.creator),
      coverPath: textValue(book.coverPath ?? book.cover_path),
      orgName: textValue(book.library ?? book.orgName ?? book.org_name),
      edition: textValue(book.type ?? book.edition),
      id: bookId,
      title,
      ftpId,
    },
    book_id: bookId,
    vol_id: volumeId,
    para_id: paraId,
  }
}

export default defineEventHandler(async (event) => {
  const MODULE = 'text_search/questionStream'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const body = await readBody(event)
  const { session_id, question, history, context } = body || {}

  const sessionId = typeof session_id === 'string' && session_id ? session_id : String(Date.now())
  const questionText = textValue(question)

  startSseResponse(event)

  if (!questionText) {
    return `event: error\ndata: ${JSON.stringify({ message: '参数错误：question 不能为空' })}\n\n`
  }

  logger.info(MODULE, `session=${sessionId} question=${shortText(questionText, 50)}`)

  const { contextLines, book, chapter } = buildContextLines(context)
  const historyLines = buildHistoryLines(history)

  const systemPrompt = [
    '你是一位古汉语与古籍文献领域的智能问答助手。',
    buildQaOutputFormat(),
    '优先基于提供的模拟检索上下文回答；上下文不足时说明依据不足，并可给出审慎推断。',
    '正式回答使用现代汉语，条理清晰；涉及书名、作者、馆藏等信息时保持原文名称。',
  ].join('\n')

  const userPromptParts: string[] = []
  if (contextLines.length) userPromptParts.push(`检索到的上下文：\n${contextLines.join('\n\n')}`)
  if (historyLines.length) userPromptParts.push(`历史对话：\n${historyLines.join('\n')}`)
  userPromptParts.push(`用户问题：${questionText}`)
  const userPrompt = userPromptParts.join('\n\n')

  const cite = buildDocLikeCite(book, chapter)
  const cites = cite ? [cite] : []
  logger.section(MODULE, `开始流式生成, 准备耗时: ${Date.now() - startTime}ms`)

  return createQaSseStream({
    sessionId,
    systemPrompt,
    userPrompt,
    cites,
    module: MODULE,
  })
})
