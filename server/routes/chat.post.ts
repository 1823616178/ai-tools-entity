import { generateText } from '../utils/textGeneration'
import { logger } from '../utils/logger'

export default defineEventHandler(async (event) => {
  const MODULE = 'hv_model/chat'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  const contentType = getHeader(event, 'content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return {
      code: 400,
      msg: "请求 Content-Type 必须为 'application/json'",
      data: null,
    }
  }

  let body: any
  try {
    body = await readBody(event)
  } catch (error: any) {
    logger.error(MODULE, `JSON 解析失败: ${error?.message || error}`)
    return {
      code: 400,
      msg: 'JSON 解析失败',
      data: null,
    }
  }

  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return {
      code: 400,
      msg: "参数'prompt'不能为空",
      data: null,
    }
  }

  try {
    const data = await generateText([
      {
        role: 'system',
        content: '你是 HV 大模型模块的智能助手。请直接回答用户问题，不要输出额外格式说明。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ])

    logger.info(MODULE, `结果长度: ${data.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      msg: '操作成功',
      data,
    }
  } catch (error: any) {
    logger.error(MODULE, error?.message || '未知错误')
    return {
      code: 500,
      msg: error?.message || '模型推理异常',
      data: null,
    }
  }
})
