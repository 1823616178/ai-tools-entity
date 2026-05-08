import Redis from 'ioredis'
import { logger } from './logger'

let redisClient: Redis | null = null

export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient
  }

  const config = useRuntimeConfig()
  const host = config.redis.host || 'localhost'
  const port = Number(config.redis.port) || 6379
  const password = config.redis.password || undefined
  const db = Number(config.redis.db) || 0

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
