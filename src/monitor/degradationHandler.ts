/**
 * Degradation Handler
 * 处理订阅过期时的优雅降级
 */

import logger from '../utils/logger'
import { broadcast, stopHealthMonitor } from '../matrix/server'

type SubscriptionMode = 'personal' | 'matrix'

export interface DegradationNotification {
  type: 'subscription_downgrade'
  oldMode: SubscriptionMode
  newMode: SubscriptionMode
  reason: string
  timestamp: string
}

/**
 * 处理订阅降级
 */
export function handleDegradation(oldMode: SubscriptionMode, newMode: SubscriptionMode): void {
  const timestamp = new Date().toISOString()

  logger.warn('Subscription downgrade detected', {
    oldMode,
    newMode,
    timestamp
  })

  // 通过 Matrix WebSocket 推送降级通知
  try {
    broadcast({
      type: 'subscription_downgrade',
      oldMode,
      newMode,
      reason: 'Subscription expired',
      timestamp
    })

    logger.info('Degradation notification sent via WebSocket')
  } catch (error) {
    logger.error('Failed to send degradation notification:', error)
  }

  // 如果从 matrix 降级到 personal，停止账号监测
  if (oldMode === 'matrix' && newMode === 'personal') {
    logger.info('Stopping multi-account features due to downgrade')

    try {
      stopHealthMonitor()
      logger.info('AccountHealthMonitor stopped successfully')
    } catch (error) {
      logger.error('Failed to stop AccountHealthMonitor:', error)
    }
  }
}

/**
 * 生成降级提示消息
 */
export function getDegradationMessage(): string {
  return `
[提示] 您的订阅已过期，已自动切换到个人版模式。
个人版功能：单账号操作
升级到矩阵版：请访问 https://pigbunai.com 续费
`.trim()
}

/**
 * 检查是否需要显示降级提示
 * 用于在工具调用时提示用户
 */
let degradationMessageShown = false

export function shouldShowDegradationMessage(): boolean {
  if (degradationMessageShown) {
    return false
  }
  degradationMessageShown = true
  return true
}

export function resetDegradationMessageFlag(): void {
  degradationMessageShown = false
}
