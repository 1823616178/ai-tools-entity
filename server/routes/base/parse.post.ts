import { generateText } from '../../utils/textGeneration'
import { logger } from '../../utils/logger'

/**
 * 句读结果单项：在原文第 pos 个字符之后插入 punc 中的标点。
 * pos 从 0 开始计数，pos=0 表示在文本开头插入标点。
 */
interface PunctuationItem {
  pos: number
  punc: string[]
}

/**
 * 外部 BERT 句读服务 /predict 返回的单条结果。
 */
interface JudouPredictItem {
  source: string
  punctuated: string
}

/**
 * 外部 BERT 句读服务 /predict 的响应结构。
 */
interface PunctuationPredictResponse {
  results?: JudouPredictItem[]
  [key: string]: any
}

/**
 * 将外部服务返回的标点文本转换为前端需要的 PunctuationItem[]。
 *
 * 算法：按顺序对比原始文本 source 与加标点后文本 punctuated，
 * 当 punctuated 中的字符无法与 source 当前位置字符匹配时，视为插入的标点，
 * 缓存连续标点；遇到下一个匹配字符时，将缓存的标点归到当前 source 位置之后。
 */
function punctuatedTextToItems(source: string, punctuated: string): PunctuationItem[] {
  const results: PunctuationItem[] = []
  let srcIndex = 0
  let bufferedPuncs: string[] = []

  for (const char of punctuated) {
    if (srcIndex < source.length && char === source[srcIndex]) {
      // 匹配到原始字符，先把之前缓存的标点落盘
      if (bufferedPuncs.length > 0) {
        results.push({ pos: srcIndex, punc: bufferedPuncs })
        bufferedPuncs = []
      }
      srcIndex++
    }
    else {
      // 无法匹配原始字符，视为模型插入的标点
      bufferedPuncs.push(char)
    }
  }

  // 处理文本末尾的标点
  if (bufferedPuncs.length > 0) {
    results.push({ pos: srcIndex, punc: bufferedPuncs })
  }

  return results
}

/**
 * 将 LLM 返回的原始数组规范化为 PunctuationItem[]。
 * - 兼容 pos / position / index 等字段名
 * - 过滤掉无效项（非有限数字 pos 或空 punc 数组）
 */
function normalizePunctuationItems(items: unknown[]): PunctuationItem[] {
  return items
    .filter((item): item is Record<string, any> => item !== null && typeof item === 'object')
    .map((item) => ({
      pos: Number(item.pos ?? item.position ?? item.index ?? 0),
      punc: Array.isArray(item.punc)
        ? item.punc.filter((p: unknown): p is string => typeof p === 'string')
        : [],
    }))
    .filter((item) => Number.isFinite(item.pos) && item.punc.length > 0)
}

/**
 * 调用外部 BERT 句读服务。
 * @param apiUrl 外部 /predict 接口地址，来自 runtimeConfig.punctuation.apiUrl
 * @param content 待句读的古文内容
 * @returns 句读结果数组；若无法解析则返回 null
 */
async function callPunctuationApi(apiUrl: string, content: string): Promise<PunctuationItem[] | null> {
  const res = await $fetch<PunctuationPredictResponse>(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { text: content },
    timeout: 120000,
  })

  const item = res?.results?.[0]
  if (!item || typeof item.punctuated !== 'string') {
    return null
  }

  return punctuatedTextToItems(content, item.punctuated)
}

/**
 * 通过 LLM 进行句读（作为外部 BERT 服务不可用时的回退方案）。
 * 构造结构化 Prompt 要求模型只返回 JSON 数组，再从中解析结果。
 */
async function callPunctuationLlm(content: string): Promise<PunctuationItem[]> {
  const prompt = [
    '你是古文句读专家。请为输入的古文标注标点符号的插入位置。',
    '',
    '## 规则',
    '- pos 表示在第 pos 个字符之后插入标点（从 0 开始计数）。',
    '  例如原文为"天地玄黄宇宙洪荒"，pos=4 表示在"黄"字之后插入标点。',
    '- punc 是该位置应插入的标点数组，通常只有一个标点，如 ["，"]、["。"]、["；"]。',
    '  如果一个位置需要多个连续标点（如句末"。"紧跟"」"），可写多个，如 ["。", "」"]。',
    '- 只在需要插入标点的位置输出，不需要标点的位置不要输出。',
    '- 使用中文标点：，。、；：！？「」『』（）',
    '',
    '## 示例',
    '输入：天地玄黄宇宙洪荒',
    '输出：[{"pos":4,"punc":["，"]},{"pos":8,"punc":["。"]}]',
    '解释：在"黄"后加逗号，在"荒"后加句号 → 天地玄黄，宇宙洪荒。',
    '',
    '输入：子曰學而時習之不亦說乎',
    '输出：[{"pos":2,"punc":["："]},{"pos":7,"punc":["，"]},{"pos":11,"punc":["？"]}]',
    '解释：子曰：學而時習之，不亦說乎？',
    '',
    '## 重要：只输出 JSON 数组，不要输出任何解释文字',
    '',
    '## 待句读古文',
    content,
  ].join('\n')

  const raw = await generateText([{ role: 'user', content: prompt }])

  // 从模型输出中提取最外层 JSON 数组
  const match = raw.match(/\[[\s\S]*\]/m)
  if (!match) {
    throw new Error(`无法解析模型输出: ${raw.slice(0, 200)}`)
  }

  const parsed = JSON.parse(match[0])
  return Array.isArray(parsed) ? normalizePunctuationItems(parsed) : []
}

/**
 * /base/parse 接口处理器：古文自动句读。
 *
 * 处理流程：
 * 1. 校验请求参数 content
 * 2. 若配置了外部 BERT 句读服务，优先调用外部 /predict 接口
 * 3. 外部接口未配置、失败或返回空结果时，回退到 LLM 句读
 * 4. 统一返回 { code, message, results }
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'base/parse'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { content } = body || {}

    // 参数校验：content 必须为字符串且不能为空
    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: [],
      }
    }

    const config = useRuntimeConfig()
    const apiUrl = config.punctuation?.apiUrl as string | undefined

    let results: PunctuationItem[] = []

    if (apiUrl) {
      // 已配置外部 BERT 句读服务，优先调用
      try {
        logger.info(MODULE, `调用句读接口: ${apiUrl}`)
        const apiResults = await callPunctuationApi(apiUrl, content)
        if (apiResults && apiResults.length > 0) {
          results = apiResults
        }
        else {
          logger.warn(MODULE, '句读接口返回空结果，回退到 LLM')
          results = await callPunctuationLlm(content)
        }
      }
      catch (error: any) {
        logger.error(MODULE, `句读接口调用失败: ${error.message || '未知错误'}，回退到 LLM`)
        results = await callPunctuationLlm(content)
      }
    }
    else {
      // 未配置外部服务，使用 LLM 回退
      logger.info(MODULE, '未配置句读接口，使用 LLM 回退')
      results = await callPunctuationLlm(content)
    }

    logger.info(MODULE, `标点数量: ${results.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      results,
    }
  }
  catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '句读服务异常',
      results: [],
    }
  }
})
