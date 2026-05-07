import { initDatabase } from '../../../utils/dataSource'
import { LlmConfig } from '../../../entities/LlmConfig'
import { getRedisClient } from '../../../utils/redis'
import { logger } from '../../../utils/logger'

const CACHE_KEY = 'llm:configs:list'

/**
 * 删除LLM配置
 * DELETE /api/admin/llm-configs/:id
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'LLM配置管理'
  const id = getRouterParam(event, 'id')
  logger.section(MODULE, `删除配置 ID=${id}`)

  try {
    if (!id || isNaN(Number(id))) {
      return {
        code: 400,
        message: '参数错误：id 必须是数字',
        data: null,
      }
    }

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

    await repo.remove(config)
    logger.info(MODULE, `配置已删除, ID=${id}`)

    // 清除缓存
    const redis = getRedisClient()
    await redis.del(CACHE_KEY)
    await redis.del('llm:configs:default')

    return {
      code: 200,
      message: '删除成功',
      data: null,
    }
  } catch (error: any) {
    logger.error(MODULE, `删除失败: ${error.message}`)
    return {
      code: 500,
      message: `删除配置失败: ${error.message}`,
      data: null,
    }
  }
})
