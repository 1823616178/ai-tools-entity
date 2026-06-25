import { logger } from '../../utils/logger'

const EXTERNAL_API_URL = 'http://szocr.hw-ai.com:6003/chat'

const DEFAULT_NER_TYPE = '建筑;山水;时间;地点;动植物;著作;驿站;职官;人物;机构;器物'

// 类型中文 -> 英文映射
const TYPE_EN_MAP: Record<string, string> = {
  人物: 'person',
  地点: 'location',
  地名: 'location',
  时间: 'time',
  著作: 'work',
  职官: 'official',
  建筑: 'architecture',
  山水: 'landscape',
  驿站: 'station',
  机构: 'organization',
  器物: 'artifact',
  动植物: 'biology',
}

interface ExternalEntity {
  start: number
  end: number
  type: string
  value: string
}

interface ExternalGroupedEntityItem {
  start?: number | string
  end?: number | string
  value?: string
}

interface FormattedEntity {
  start: number
  end: number
  typeId: number
  del: boolean
  type: string
  typeEn: string
  value: string
}

function extractJson(text: string): unknown | null {
  // 先尝试匹配 ```json ... ``` 代码块
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]!)
      return parsed
    } catch {
      // ignore
    }
  }

  // 再尝试匹配最外层的 JSON 对象
  const objectMatch = text.match(/(\{[\s\S]*\})/)
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]!)
    } catch {
      // ignore
    }
  }

  // 兼容最外层 JSON 数组
  const arrayMatch = text.match(/(\[[\s\S]*\])/)
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[1]!)
    } catch {
      // ignore
    }
  }

  return null
}

function getPromptTypes(nerTypes: string): string[] {
  return nerTypes
    .split(';')
    .map(type => type.trim())
    .filter(Boolean)
    .map(type => type === '地点' ? '地名' : type)
}

function buildPrompt(content: string, nerTypes: string): string {
  const promptTypes = getPromptTypes(nerTypes)

  return [
    `请在以下内容中标记出${promptTypes.join('、')}等类型的实体"${content}"。`,
    `要求：请用一行JSON字符串返回，且只包含这 ${promptTypes.length} 个键：${promptTypes.join('、')}。`,
    '每个键的值为 JSON 数组，数组每项只包含 3 个属性：value、start、end。',
    '其中 start 从 0 开始，end 为开区间；多个实体用数组，无实体返空数组。',
    '只返回 JSON 字符串，不要任何解释文字或 markdown。',
  ].join('')
}

function flattenEntities(payload: unknown): ExternalEntity[] | null {
  if (Array.isArray(payload)) {
    return payload.map((item: any) => ({
      start: Number(item?.start),
      end: Number(item?.end),
      type: typeof item?.type === 'string' ? item.type : '未知',
      value: typeof item?.value === 'string' ? item.value : '',
    }))
  }

  if (!payload || typeof payload !== 'object') {
    return null
  }

  const entities: ExternalEntity[] = []
  let hasArrayField = false
  for (const [type, items] of Object.entries(payload as Record<string, ExternalGroupedEntityItem[]>)) {
    if (!Array.isArray(items)) {
      continue
    }

    hasArrayField = true
    for (const item of items) {
      entities.push({
        start: Number(item?.start),
        end: Number(item?.end),
        type,
        value: typeof item?.value === 'string' ? item.value : '',
      })
    }
  }

  return hasArrayField ? entities : null
}

function normalizeEntity(content: string, entity: ExternalEntity): ExternalEntity | null {
  const type = typeof entity.type === 'string' && entity.type.trim() ? entity.type.trim() : '未知'
  const value = typeof entity.value === 'string' ? entity.value : ''
  const start = Number.isInteger(entity.start) ? entity.start : Number(entity.start)
  const end = Number.isInteger(entity.end) ? entity.end : Number(entity.end)
  const hasValidRange = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= content.length

  if (hasValidRange) {
    const sliced = content.slice(start, end)
    if (!value || sliced === value) {
      return {
        start,
        end,
        type,
        value: value || sliced,
      }
    }
  }

  if (value) {
    const preferredIndex = Number.isInteger(start) && start >= 0 ? content.indexOf(value, start) : -1
    const fallbackIndex = content.indexOf(value)
    const matchIndex = preferredIndex >= 0 ? preferredIndex : fallbackIndex

    if (matchIndex >= 0) {
      return {
        start: matchIndex,
        end: matchIndex + value.length,
        type,
        value,
      }
    }
  }

  if (hasValidRange) {
    return {
      start,
      end,
      type,
      value: content.slice(start, end),
    }
  }

  return null
}

function formatEntities(content: string, entities: ExternalEntity[]): FormattedEntity[] {
  const typeIdMap = new Map<string, number>()
  let nextTypeId = 45
  const seen = new Set<string>()

  const normalizedEntities = entities
    .map(entity => normalizeEntity(content, entity))
    .filter((entity): entity is ExternalEntity => Boolean(entity))
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .filter((entity) => {
      const key = `${entity.type}-${entity.start}-${entity.end}-${entity.value}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

  return normalizedEntities.map((e) => {
    const type = e.type || '未知'
    if (!typeIdMap.has(type)) {
      typeIdMap.set(type, nextTypeId++)
    }

    return {
      start: typeof e.start === 'number' ? e.start : 0,
      end: typeof e.end === 'number' ? e.end : 0,
      typeId: typeIdMap.get(type)!,
      del: false,
      type,
      typeEn: TYPE_EN_MAP[type] || 'unknown',
      value: e.value || '',
    }
  })
}

export default defineEventHandler(async (event) => {
  const MODULE = 'base/ner_rela_external'
  const startTime = Date.now()
  logger.section(MODULE, '收到请求')

  try {
    const body = await readBody(event)
    const { jnEntryId, content, ner_type } = body || {}

    if (!content || typeof content !== 'string') {
      return {
        code: 400,
        message: '参数错误：content 字段不能为空',
        results: { entity: [], relation: [] },
      }
    }

    const nerTypes = typeof ner_type === 'string' && ner_type.trim() ? ner_type : DEFAULT_NER_TYPE
    const prompt = buildPrompt(content, nerTypes)

    logger.info(MODULE, `调用外部API: ${EXTERNAL_API_URL}`)

    const externalRes = await $fetch<{ code: number; data: string; msg: string }>(EXTERNAL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        prompt,
      },
      timeout: 120000,
    })

    if (externalRes.code !== 200) {
      throw new Error(externalRes.msg || '外部实体识别服务返回错误')
    }

    const rawText = externalRes.data || ''
    const extracted = flattenEntities(extractJson(rawText))

    if (!extracted) {
      logger.warn(MODULE, '未能从外部API响应中解析出实体数据')
      logger.warn(MODULE, `原始响应: ${rawText.slice(0, 500)}`)
      return {
        code: 200,
        message: 'success（外部API未返回可解析的实体数据）',
        results: { entity: [], relation: [] },
      }
    }

    const formattedEntities = formatEntities(content, extracted)

    logger.info(MODULE, `实体数量: ${formattedEntities.length}`)
    logger.section(MODULE, `请求完成, 总耗时: ${Date.now() - startTime}ms`)

    return {
      code: 200,
      message: 'success',
      results: {
        entity: formattedEntities,
        relation: [],
      },
    }
  } catch (error: any) {
    logger.error(MODULE, error.message || '未知错误')
    return {
      code: 500,
      message: error.message || '外部实体识别服务异常',
      results: { entity: [], relation: [] },
    }
  }
})
