import { initDatabase } from '../../../utils/dataSource'
import { LlmConfig } from '../../../entities/LlmConfig'
import { getRedisClient } from '../../../utils/redis'
import { logger } from '../../../utils/logger'

const CACHE_KEY = 'llm:configs:default'
const CACHE_TTL = 300 // 秒

/**
 * 获取默认/启用的LLM配置（供业务接口使用）
 * GET /api/admin/llm-configs/default
 */
export default defineEventHandler(async (_event) => {
  const MODULE = 'LLM配置管理'
  logger.section(MODULE, '获取默认配置')

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

    // 先查找默认且启用的配置
    let config = await repo.findOne({
      where: { isDefault: true, isActive: true },
    })

    // 如果没有默认配置，取第一个启用的配置
    if (!config) {
      config = await repo.findOne({
        where: { isActive: true },
        order: { createdAt: 'DESC' },
      })
    }

    if (!config) {
      return {
        code: 404,
        message: '未找到可用的LLM配置，请先在管理界面添加配置',
        data: null,
      }
    }

    // 写入缓存
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(config))
    logger.info(MODULE, `获取到默认配置: ${config.name}`)

    return {
      code: 200,
      message: 'success',
      data: config,
      fromCache: false,
    }
  } catch (error: any) {
    logger.error(MODULE, `获取失败: ${error.message}`)
    return {
      code: 500,
      message: `获取默认配置失败: ${error.message}`,
      data: null,
    }
  }
})
