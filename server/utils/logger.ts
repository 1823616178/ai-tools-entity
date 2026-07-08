import fs from 'fs'
import path from 'path'
import os from 'os'

let logDir: string | null = null
let fileLoggingDisabledReason = ''
let fileLoggingWarningShown = false

function resolveWritableLogDir(): string | null {
  const candidates = [
    process.env.NUXT_LOG_DIR,
    path.resolve(process.cwd(), 'logs'),
    path.join(os.tmpdir(), 'aiTool-logs'),
  ].filter((value): value is string => Boolean(value))

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      fs.accessSync(dir, fs.constants.W_OK)
      return dir
    } catch (error: any) {
      fileLoggingDisabledReason = `${dir}: ${error?.message || '目录不可写'}`
    }
  }

  return null
}

function getLogDir(): string | null {
  if (logDir !== null) {
    return logDir
  }

  logDir = resolveWritableLogDir()
  return logDir
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
  const currentLogDir = getLogDir()
  if (!currentLogDir) {
    if (!fileLoggingWarningShown) {
      fileLoggingWarningShown = true
      console.warn(`[日志] 文件日志已禁用: ${fileLoggingDisabledReason}`)
    }
    return
  }

  const dateStr = getDateStr()
  const timestamp = getTimestamp()
  const logFile = path.join(currentLogDir, `${dateStr}.log`)

  const line = `[${timestamp}] [${level}] [${module}] ${message}\n`

  try {
    fs.appendFileSync(logFile, line, 'utf-8')
  } catch (error: any) {
    logDir = null
    fileLoggingDisabledReason = `${logFile}: ${error?.message || '写入失败'}`
    if (!fileLoggingWarningShown) {
      fileLoggingWarningShown = true
      console.warn(`[日志] 文件日志已禁用: ${fileLoggingDisabledReason}`)
    }
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
