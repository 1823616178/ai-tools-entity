import { initDatabase } from '../../utils/dataSource'
import { LlmConfig } from '../../entities/LlmConfig'
import { getRedisClient } from '../../utils/redis'
import { logger } from '../../utils/logger'

const CACHE_KEY = 'llm:configs:list'
const CACHE_TTL = 60 // 秒

/**
 * 获取所有LLM配置列表
 * GET /api/admin/llm-configs
 */
export default defineEventHandler(async (_event) => {
  const MODULE = 'LLM配置管理'
  logger.section(MODULE, '获取配置列表')

  try {
    // 先尝试从Redis缓存获取
    const redis = getRedisClient()
    const cached = await redis.get(CACHE_KEY)
    if (cached) {
      logger.info(MODULE, '命中Redis缓存')
      return {
        code: 200,
        message: 'success',
        data: JSON.parse(cached),
        fromCache: true,
      }
    }

    const ds = await initDatabase()
    const repo = ds.getRepository(LlmConfig)
    const configs = await repo.find({
      order: { createdAt: 'DESC' },
    })

    // 写入缓存
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(configs))
    logger.info(MODULE, `从数据库获取 ${configs.length} 条配置，已写入缓存`)

    return {
      code: 200,
      message: 'success',
      data: configs,
      fromCache: false,
    }
  } catch (error: any) {
    logger.error(MODULE, `获取失败: ${error.message}`)
    return {
      code: 500,
      message: `获取配置列表失败: ${error.message}`,
      data: [],
    }
  }
})
