import { ChatOpenAI } from '@langchain/openai'
import { logger } from './logger'

let configLogged = false

function getLLM(): ChatOpenAI {
  const baseURL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1'
  const apiKey = process.env.LLM_API_KEY || ''
  const model = process.env.LLM_MODEL || 'gpt-4o'

  if (!configLogged) {
    logger.section('LLM', '大模型配置')
    logger.info('LLM', `Base URL: ${baseURL}`)
    logger.info('LLM', `API Key: ${apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '(未配置)'}`)
    logger.info('LLM', `Model: ${model}`)
    logger.info('LLM', 'Temperature: 0.1')
    logger.section('LLM', '配置完成')
    configLogged = true
  }

  return new ChatOpenAI({
    model,
    temperature: 0.1,
    configuration: {
      baseURL,
      apiKey,
    },
  })
}

export { getLLM }
