import { EntitySchema } from 'typeorm'

export interface LlmConfigData {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  isActive: boolean
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * TypeORM EntitySchema — no decorators required, compatible with esbuild/Nuxt 4.
 * Exported under the name `LlmConfig` so existing imports remain unchanged.
 */
export const LlmConfig = new EntitySchema<LlmConfigData>({
  name: 'LlmConfig',
  tableName: 'llm_config',
  columns: {
    id: { type: Number, primary: true, generated: true },
    name: { type: String, length: 100 },
    baseUrl: { type: String, name: 'base_url', length: 500 },
    apiKey: { type: String, name: 'api_key', length: 500 },
    model: { type: String, length: 100 },
    temperature: { type: 'float', default: 0.1 },
    isActive: { type: Boolean, name: 'is_active', default: true },
    isDefault: { type: Boolean, name: 'is_default', default: false },
    createdAt: { type: Date, name: 'created_at', createDate: true },
    updatedAt: { type: Date, name: 'updated_at', updateDate: true },
  },
})
