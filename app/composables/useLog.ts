import { attachConsole, debug, info, error as pluginError, trace, warn } from '@tauri-apps/plugin-log'

/**
 * 日志级别枚举
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 日志选项接口
 */
export interface LogOptions {
  /** 是否在浏览器控制台显示 */
  console?: boolean
  /** 日志标签 */
  tag?: string
  /** 额外的上下文数据 */
  context?: Record<string, any>
}

/**
 * 日志工具 composable
 * 基于 Tauri 日志插件，提供统一的日志记录功能
 * 默认不写入文件，只输出到控制台和 Webview
 */
export function useLog() {
  let consoleDetach: (() => void) | null = null

  /**
   * 初始化日志系统
   * 启用浏览器控制台输出
   */
  async function initLog() {
    try {
      if (!consoleDetach) {
        consoleDetach = await attachConsole()
      }
    }
    catch (err) {
      console.warn('Failed to attach console logging:', err)
    }
  }

  /**
   * 清理日志系统
   * 分离浏览器控制台输出
   */
  function cleanupLog() {
    if (consoleDetach) {
      consoleDetach()
      consoleDetach = null
    }
  }

  /**
   * 格式化日志消息
   */
  function formatMessage(message: string, options?: LogOptions): string {
    let formattedMessage = message

    if (options?.tag) {
      formattedMessage = `[${options.tag}] ${formattedMessage}`
    }

    if (options?.context) {
      formattedMessage += ` | Context: ${JSON.stringify(options.context)}`
    }

    return formattedMessage
  }

  /**
   * 记录 TRACE 级别日志
   */
  async function logTrace(message: string, options?: LogOptions) {
    const formattedMessage = formatMessage(message, options)

    try {
      await trace(formattedMessage)
      if (options?.console !== false) {
        console.log(`🔍 TRACE: ${formattedMessage}`)
      }
    }
    catch (err) {
      console.error('Failed to log trace:', err)
    }
  }

  /**
   * 记录 DEBUG 级别日志
   */
  async function logDebug(message: string, options?: LogOptions) {
    const formattedMessage = formatMessage(message, options)

    try {
      await debug(formattedMessage)
      if (options?.console !== false) {
        console.log(`🐛 DEBUG: ${formattedMessage}`)
      }
    }
    catch (err) {
      console.error('Failed to log debug:', err)
    }
  }

  /**
   * 记录 INFO 级别日志
   */
  async function logInfo(message: string, options?: LogOptions) {
    const formattedMessage = formatMessage(message, options)

    try {
      await info(formattedMessage)
      if (options?.console !== false) {
        console.log(`ℹ️ INFO: ${formattedMessage}`)
      }
    }
    catch (err) {
      console.error('Failed to log info:', err)
    }
  }

  /**
   * 记录 WARN 级别日志
   */
  async function logWarn(message: string, options?: LogOptions) {
    const formattedMessage = formatMessage(message, options)

    try {
      await warn(formattedMessage)
      if (options?.console !== false) {
        console.warn(`⚠️ WARN: ${formattedMessage}`)
      }
    }
    catch (err) {
      console.error('Failed to log warn:', err)
    }
  }

  /**
   * 记录 ERROR 级别日志
   */
  async function logError(message: string, error?: Error | unknown, options?: LogOptions) {
    let formattedMessage = formatMessage(message, options)

    if (error) {
      if (error instanceof Error) {
        formattedMessage += ` | Error: ${error.message} | Stack: ${error.stack}`
      }
      else {
        formattedMessage += ` | Error: ${JSON.stringify(error)}`
      }
    }

    try {
      await pluginError(formattedMessage)
      if (options?.console !== false) {
        console.error(`❌ ERROR: ${formattedMessage}`)
      }
    }
    catch (err) {
      console.error('Failed to log error:', err)
    }
  }

  /**
   * 通用日志记录方法
   */
  async function log(level: LogLevel, message: string, errorOrOptions?: Error | LogOptions, options?: LogOptions) {
    let finalOptions: LogOptions | undefined
    let errorObj: Error | undefined

    if (errorOrOptions instanceof Error) {
      errorObj = errorOrOptions
      finalOptions = options
    }
    else {
      finalOptions = errorOrOptions
    }

    switch (level) {
      case LogLevel.TRACE:
        await logTrace(message, finalOptions)
        break
      case LogLevel.DEBUG:
        await logDebug(message, finalOptions)
        break
      case LogLevel.INFO:
        await logInfo(message, finalOptions)
        break
      case LogLevel.WARN:
        await logWarn(message, finalOptions)
        break
      case LogLevel.ERROR:
        await logError(message, errorObj, finalOptions)
        break
      default:
        await logInfo(message, finalOptions)
    }
  }

  // 自动初始化
  if (import.meta.client) {
    initLog()
  }

  return {
    // 初始化和清理
    initLog,
    cleanupLog,

    // 各级别日志方法
    trace: logTrace,
    debug: logDebug,
    info: logInfo,
    warn: logWarn,
    error: logError,

    // 通用日志方法
    log,

    // 日志级别枚举
    LogLevel,
  }
}

/**
 * 全局日志实例
 * 可以直接导入使用，无需在每个组件中创建
 */
export const logger = useLog()
