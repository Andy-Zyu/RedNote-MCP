/**
 * 统一错误处理工具
 */

import logger from './logger'

/**
 * 包装异步函数，自动处理错误日志
 */
export async function withErrorLogging<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    logger.error(`${context}:`, error)
    throw error
  }
}

/**
 * 提取错误消息
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 安全执行回调，捕获错误但不抛出
 */
export async function safeCallback<T>(
  callback: () => Promise<T> | T,
  context: string
): Promise<T | null> {
  try {
    return await callback()
  } catch (error) {
    logger.error(`${context} callback failed:`, error)
    return null
  }
}
