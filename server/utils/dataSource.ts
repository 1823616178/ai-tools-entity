import { DataSource } from 'typeorm'
import { LlmConfig } from '../entities/LlmConfig'
import { logger } from './logger'

let dataSource: DataSource | null = null

export function getDataSource(): DataSource {
  if (dataSource?.isInitialized) {
    return dataSource
  }

  const host = process.env.DB_HOST || 'localhost'
  const port = parseInt(process.env.DB_PORT || '3306', 10)
  const username = process.env.DB_USERNAME || 'root'
  const password = process.env.DB_PASSWORD || ''
  const database = process.env.DB_DATABASE || 'aitool'

  logger.section('DB', '初始化数据库连接')
  logger.info('DB', `Host: ${host}:${port}, Database: ${database}`)

  dataSource = new DataSource({
    type: 'mysql',
    host,
    port,
    username,
    password,
    database,
    synchronize: true,
    logging: false,
    entities: [LlmConfig],
  })

  return dataSource
}

export async function initDatabase(): Promise<DataSource> {
  const ds = getDataSource()
  if (!ds.isInitialized) {
    await ds.initialize()
    logger.info('DB', '数据库连接成功')
  }
  return ds
}
