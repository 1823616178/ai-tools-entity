import { initDatabase } from '../../utils/dataSource'
import { LlmConfig } from '../../entities/LlmConfig'
import { getRedisClient } from '../../utils/redis'
import { logger } from '../../utils/logger'

const CACHE_KEY = 'llm:configs:list'

/**
 * 创建LLM配置
 * POST /api/admin/llm-configs
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'LLM配置管理'
  logger.section(MODULE, '创建配置')

  try {
    const body = await readBody(event)
    const { name, baseUrl, apiKey, model, temperature = 0.1, isActive = true, isDefault = false } = body || {}

    if (!name || !baseUrl || !apiKey || !model) {
      logger.warn(MODULE, '参数校验失败')
      return {
        code: 400,
        message: '参数错误：name、baseUrl、apiKey、model 不能为空',
        data: null,
      }
    }

    const ds = await initDatabase()
    const repo = ds.getRepository(LlmConfig)

    // 如果设为默认，先取消其他默认配置
    if (isDefault) {
      await repo.update({ isDefault: true }, { isDefault: false })
    }

    const config = repo.create({
      name,
      baseUrl,
      apiKey,
      model,
      temperature,
      isActive,
      isDefault,
    })

    const saved = await repo.save(config)
    logger.info(MODULE, `配置已创建, ID=${saved.id}`)

    // 清除缓存
    await getRedisClient().del(CACHE_KEY)
    await getRedisClient().del('llm:configs:default')

    return {
      code: 200,
      message: '创建成功',
      data: saved,
    }
  } catch (error: any) {
    logger.error(MODULE, `创建失败: ${error.message}`)
    return {
      code: 500,
      message: `创建配置失败: ${error.message}`,
      data: null,
    }
  }
})
