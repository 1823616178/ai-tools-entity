import { ChatPromptTemplate } from '@langchain/core/prompts'
import { getLLM } from '../../utils/llm'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'base/parse'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { content } = body || {}

    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: [],
      }
    }

    const llm = await getLLM()

    const prompt = ChatPromptTemplate.fromTemplate([
      '你是古文句读专家。请为输入的古文标注标点符号的插入位置。',
      '',
      '## 规则',
      '- pos 表示在第 pos 个字符之后插入标点（从 1 开始计数）。',
      '  例如原文为"天地玄黄宇宙洪荒"，pos=4 表示在"黄"字之后插入标点。',
      '- punc 是该位置应插入的标点数组，通常只有一个标点，如 ["，"]、["。"]、["；"]。',
      '  如果一个位置需要多个连续标点（如句末"。"紧跟"」"），可写多个，如 ["。", "」"]。',
      '- 只在需要插入标点的位置输出，不需要标点的位置不要输出。',
      '- 使用中文标点：，。、；：！？「」『』（）',
      '',
      '## 示例',
      '输入：天地玄黄宇宙洪荒',
      '输出：[{{"pos":4,"punc":["，"]}},{{"pos":8,"punc":["。"]}}]',
      '解释：在"黄"后加逗号，在"荒"后加句号 → 天地玄黄，宇宙洪荒。',
      '',
      '输入：子曰學而時習之不亦說乎',
      '输出：[{{"pos":2,"punc":["："]}},{{"pos":7,"punc":["，"]}},{{"pos":11,"punc":["？"]}}]',
      '解释：子曰：學而時習之，不亦說乎？',
      '',
      '## 重要：只输出 JSON 数组，不要输出任何解释文字',
      '',
      '## 待句读古文',
      '{content}',
    ].join('\n'))

    const messages = await prompt.formatMessages({ content })
    const response = await llm.invoke(messages)
    const raw = typeof response.content === 'string' ? response.content.trim() : String(response.content || '').trim()

    // 提取 JSON 数组部分（防止模型输出多余文字）
    const match = raw.match(/\[[\s\S]*\]/m)
    if (!match) {
      throw new Error(`无法解析模型输出: ${raw.slice(0, 200)}`)
    }

    const parsed = JSON.parse(match[0])
    const results = Array.isArray(parsed) ? parsed : []

    logger.info(MODULE, `标点数量: ${results.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      results,
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '句读服务异常',
      results: [],
    }
  }
})
