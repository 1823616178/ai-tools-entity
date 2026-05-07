import { initDatabase } from '../../../utils/dataSource'
import { LlmConfig } from '../../../entities/LlmConfig'
import { logger } from '../../../utils/logger'

/**
 * 获取单个LLM配置
 * GET /api/admin/llm-configs/:id
 */
export default defineEventHandler(async (event) => {
  const MODULE = 'LLM配置管理'
  const id = getRouterParam(event, 'id')
  logger.section(MODULE, `获取配置 ID=${id}`)

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

    return {
      code: 200,
      message: 'success',
      data: config,
    }
  } catch (error: any) {
    logger.error(MODULE, `获取失败: ${error.message}`)
    return {
      code: 500,
      message: `获取配置失败: ${error.message}`,
      data: null,
    }
  }
})
