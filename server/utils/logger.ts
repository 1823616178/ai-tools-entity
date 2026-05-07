import fs from 'fs'
import path from 'path'

const LOG_DIR = path.resolve(process.cwd(), 'logs')

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

/**
 * 获取当前日期字符串 YYYY-MM-DD
 */
function getDateStr(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 获取时间戳 [HH:MM:SS]
 */
function getTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * 写入日志文件
 * @param module 模块名（如 翻译/句读/NER/OCR/切换类型）
 * @param level 日志级别 INFO/WARN/ERROR
 * @param message 日志内容
 */
function writeLog(module: string, level: string, message: string) {
  const dateStr = getDateStr()
  const timestamp = getTimestamp()
  const logFile = path.join(LOG_DIR, `${dateStr}.log`)

  const line = `[${timestamp}] [${level}] [${module}] ${message}\n`

  try {
    fs.appendFileSync(logFile, line, 'utf-8')
  } catch (err) {
    // 写入失败时回退到控制台
    console.error('[日志] 写入文件失败:', err)
  }
}

/**
 * 同时输出到控制台和文件
 */
function log(module: string, level: string, message: string) {
  const prefix = `[${module}]`
  const fullMsg = `${prefix} ${message}`

  // 控制台输出
  switch (level) {
    case 'ERROR':
      console.error(fullMsg)
      break
    case 'WARN':
      console.warn(fullMsg)
      break
    default:
      console.log(fullMsg)
  }

  // 文件输出
  writeLog(module, level, message)
}

const logger = {
  info(module: string, message: string) {
    log(module, 'INFO', message)
  },
  warn(module: string, message: string) {
    log(module, 'WARN', message)
  },
  error(module: string, message: string) {
    log(module, 'ERROR', message)
  },
  /**
   * 记录分隔线和标记
   */
  section(module: string, title: string) {
    const line = '='.repeat(10)
    log(module, 'INFO', `${line} ${title} ${line}`)
  },
}

export { logger }
