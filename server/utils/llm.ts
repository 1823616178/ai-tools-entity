import { ChatOpenAI } from '@langchain/openai'
import { logger } from './logger'
import { initDatabase } from './dataSource'
import { LlmConfig } from '../entities/LlmConfig'
import { getRedisClient } from './redis'

let configLogged = false

const DEFAULT_CACHE_KEY = 'llm:configs:default'
const DEFAULT_CACHE_TTL = 300

async function getActiveLlmConfig(): Promise<{
  baseURL: string
  apiKey: string
  model: string
  temperature: number
} | null> {
  try {
    // 先尝试从Redis缓存获取
    const redis = getRedisClient()
    const cached = await redis.get(DEFAULT_CACHE_KEY)
    if (cached) {
      const config = JSON.parse(cached)
      return {
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        temperature: config.temperature ?? 0.1,
      }
    }

    // 从数据库获取
    const ds = await initDatabase()
    const repo = ds.getRepository(LlmConfig)

    let config = await repo.findOne({
      where: { isDefault: true, isActive: true },
    })

    if (!config) {
      config = await repo.findOne({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
      })
    }

    if (!config) {
      return null
    }

    // 写入缓存
    await redis.setex(DEFAULT_CACHE_KEY, DEFAULT_CACHE_TTL, JSON.stringify(config))

    return {
      baseURL: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature ?? 0.1,
    }
  } catch (error: any) {
    logger.error('LLM', `获取配置失败: ${error.message}`)
    return null
  }
}

async function getLLM(): Promise<ChatOpenAI> {
  // 优先从数据库获取配置
  const dbConfig = await getActiveLlmConfig()

  const config = useRuntimeConfig()
  const baseURL = dbConfig?.baseURL || config.llm.baseUrl || 'https://api.openai.com/v1'
  const apiKey = dbConfig?.apiKey || config.llm.apiKey || ''
  const model = dbConfig?.model || config.llm.model || 'gpt-4o'
  const temperature = dbConfig?.temperature ?? 0.1

  if (!configLogged) {
    const source = dbConfig ? '数据库' : '环境变量'
    logger.section('LLM', '大模型配置')
    logger.info('LLM', `配置来源: ${source}`)
    logger.info('LLM', `Base URL: ${baseURL}`)
    logger.info('LLM', `API Key: ${apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '(未配置)'}`)
    logger.info('LLM', `Model: ${model}`)
    logger.info('LLM', `Temperature: ${temperature}`)
    logger.section('LLM', '配置完成')
    configLogged = true
  }

  return new ChatOpenAI({
    model,
    temperature,
    configuration: {
      baseURL,
      apiKey,
    },
  })
}

export { getLLM, getActiveLlmConfig }
