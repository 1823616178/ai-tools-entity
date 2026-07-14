import { logger } from '../../utils/logger'
import { recognizeWithPaddleOCR } from '../../utils/paddleOcr'

export default defineEventHandler(async (event) => {
  const MODULE = 'recognize/auto'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { image } = body || {}

    if (!image || typeof image !== 'string') {
      return {
        code: 400,
        message: '参数错误：image 字段不能为空',
        result: null,
      }
    }

    // 调用 PaddleOCR 识别
    const paddleResult = await recognizeWithPaddleOCR(image, true)
    if (!paddleResult) {
      return {
        code: 500,
        message: 'PaddleOCR 识别失败或服务不可用',
        result: null,
      }
    }

    const text = paddleResult.text.trim()
    const lines = paddleResult.lines.map(l => l.text.trim()).filter(Boolean)

    logger.info(MODULE, `PaddleOCR 识别完成，共 ${lines.length} 行，文本长度: ${text.length}`)

    // 基于规则做古籍分类和结构化
    const classified = classifyAncientText(text, lines)

    const result = {
      display: {
        ocr_result: text,
        image_type: classified.image_type,
        data: classified.data,
      },
      recognition_context: {
        vl_ocr_result: text,
        guji_ocr_result: text,
        danzi_ocr_result: classified.image_type === 'single_char' ? text : '',
      },
    }

    logger.info(MODULE, `识别类型: ${result.display.image_type || '(未知)'}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      result,
    }
  }
  catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '拍照识别服务异常',
      result: null,
    }
  }
})

interface ClassifiedResult {
  image_type: 'single_char' | 'couplet' | 'poem' | 'ancient_book'
  data: Record<string, any>
}

/**
 * 基于 PaddleOCR 识别结果做简单规则分类
 * 注意：此分类不含 LLM，准确率有限，适合快速预览或低延迟场景
 */
function classifyAncientText(text: string, lines: string[]): ClassifiedResult {
  // 1. 单字：只有一行且只有一个字符
  if (lines.length === 1 && lines[0]?.length === 1) {
    return {
      image_type: 'single_char',
      data: {},
    }
  }

  const fullText = text
  const lowerText = fullText.toLowerCase()

  // 2. 对联：包含上联/下联/横批等关键词
  const hasShanglian = fullText.includes('上联') || fullText.includes('上聯')
  const hasXialian = fullText.includes('下联') || fullText.includes('下聯')
  const hasHengpi = fullText.includes('横批') || fullText.includes('橫批')

  if (hasShanglian || hasXialian || hasHengpi) {
    return parseCouplet(fullText)
  }

  // 3. 诗词：行数较少，且常见诗词特征
  if (lines.length >= 2 && lines.length <= 8) {
    // 简单判断：每行长度相近，且不含大量散文连接词
    const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length
    const similarLength = lines.every(l => Math.abs(l.length - avgLen) <= 4)
    if (similarLength) {
      return parsePoem(lines)
    }
  }

  // 4. 默认古籍
  return {
    image_type: 'ancient_book',
    data: {},
  }
}

function parseCouplet(text: string): ClassifiedResult {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  let first_line = ''
  let second_line = ''
  let top_scroll = ''
  let signature = ''

  for (const line of lines) {
    const cleaned = line
      .replace(/^上联[：:]?\s*/, '')
      .replace(/^上聯[：:]?\s*/, '')
      .replace(/^下联[：:]?\s*/, '')
      .replace(/^下聯[：:]?\s*/, '')
      .replace(/^横批[：:]?\s*/, '')
      .replace(/^橫批[：:]?\s*/, '')
      .trim()

    if (line.includes('上联') || line.includes('上聯')) {
      first_line = cleaned
    }
    else if (line.includes('下联') || line.includes('下聯')) {
      second_line = cleaned
    }
    else if (line.includes('横批') || line.includes('橫批')) {
      top_scroll = cleaned
    }
    else if (!first_line) {
      first_line = cleaned
    }
    else if (!second_line) {
      second_line = cleaned
    }
    else if (!top_scroll) {
      top_scroll = cleaned
    }
    else {
      signature = signature ? `${signature} ${cleaned}` : cleaned
    }
  }

  // 兜底：如果只有两行且无标签，第一行为上联，第二行为下联
  if (!first_line && !second_line && lines.length >= 2) {
    first_line = lines[0] ?? ''
    second_line = lines[1] ?? ''
    if (lines.length >= 3) top_scroll = lines[2] ?? ''
  }

  return {
    image_type: 'couplet',
    data: { first_line, second_line, top_scroll, signature },
  }
}

function parsePoem(lines: string[]): ClassifiedResult {
  // 简单策略：第一行作为标题，第二行作为作者，其余作为内容
  // 如果行数太少，全部作为内容
  let title = ''
  let author = ''
  let content = ''
  let signature = ''

  if (lines.length >= 3) {
    title = lines[0] ?? ''
    author = lines[1] ?? ''
    content = lines.slice(2).join('\n')
  }
  else {
    content = lines.join('\n')
  }

  return {
    image_type: 'poem',
    data: { title, author, content, signature },
  }
}
