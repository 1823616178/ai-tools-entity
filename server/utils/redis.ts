import Redis from 'ioredis'
import { logger } from './logger'

let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient
  }

  const host = process.env.REDIS_HOST || 'localhost'
  const port = parseInt(process.env.REDIS_PORT || '6379', 10)
  const password = process.env.REDIS_PASSWORD || undefined
  const db = parseInt(process.env.REDIS_DB || '0', 10)

  logger.section('Redis', '初始化Redis连接')
  logger.info('Redis', `Host: ${host}:${port}, DB: ${db}`)

  redisClient = new Redis({
    host,
    port,
    password,
    db,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
    maxRetriesPerRequest: 3,
  })

  redisClient.on('connect', () => {
    logger.info('Redis', '连接成功')
  })

  redisClient.on('error', (err) => {
    logger.error('Redis', `连接错误: ${err.message}`)
  })

  return redisClient
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit()
    redisClient = null
    logger.info('Redis', '连接已关闭')
  }
}
