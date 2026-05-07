import { initDatabase } from '../../../utils/dataSource'
import { LlmConfig } from '../../../entities/LlmConfig'
import { getRedisClient } from '../../../utils/redis'
import { logger } from '../../../utils/logger'

const CACHE_KEY = 'llm:configs:list'

/**
 * 更新LLM配置
 * PUT /api/admin/llm-configs/:id
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'LLM配置管理'
  const id = getRouterParam(event, 'id')
  logger.section(MODULE, `更新配置 ID=${id}`)

  try {
    if (!id || isNaN(Number(id))) {
      return {
        code: 400,
        message: '参数错误：id 必须是数字',
        data: null,
      }
    }

    const body = await readBody(event)
    const { name, baseUrl, apiKey, model, temperature, isActive, isDefault } = body || {}

    const ds = await initDatabase()
    const repo = ds.getRepository(LlmConfig)
    const config = await repo.findOne({ where: { id: Number(id) } })

    if (!config) {
      return {
        code: 404,
        message: '配置不存在',
        data: null,
      }
    }

    // 如果设为默认，先取消其他默认配置
    if (isDefault === true && !config.isDefault) {
      await repo.update({ isDefault: true }, { isDefault: false })
    }

    if (name !== undefined) config.name = name
    if (baseUrl !== undefined) config.baseUrl = baseUrl
    if (apiKey !== undefined) config.apiKey = apiKey
    if (model !== undefined) config.model = model
    if (temperature !== undefined) config.temperature = temperature
    if (isActive !== undefined) config.isActive = isActive
    if (isDefault !== undefined) config.isDefault = isDefault

    const saved = await repo.save(config)
    logger.info(MODULE, `配置已更新, ID=${saved.id}`)

    // 清除缓存
    const redis = getRedisClient()
    await redis.del(CACHE_KEY)
    await redis.del('llm:configs:default')

    return {
      code: 200,
      message: '更新成功',
      data: saved,
    }
  } catch (error: any) {
    logger.error(MODULE, `更新失败: ${error.message}`)
    return {
      code: 500,
      message: `更新配置失败: ${error.message}`,
      data: null,
    }
  }
})
