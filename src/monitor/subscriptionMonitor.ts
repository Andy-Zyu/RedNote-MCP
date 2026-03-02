/**
 * Subscription Monitor
 * 定期检测订阅状态变化，触发降级流程
 */

import { getGuard } from '../guard/apiKeyGuard'
import logger from '../utils/logger'
import { BaseMonitor } from './baseMonitor'
import { MONITOR_INTERVAL } from '../constants/timeouts'

type SubscriptionMode = 'personal' | 'matrix'

export class SubscriptionMonitor extends BaseMonitor {
  protected readonly CHECK_INTERVAL = MONITOR_INTERVAL.SUBSCRIPTION
  protected readonly monitorName = 'SubscriptionMonitor'

  private currentMode: SubscriptionMode = 'personal'
  private onModeChangeCallback?: (oldMode: SubscriptionMode, newMode: SubscriptionMode) => void

  /**
   * 实现基类的检查逻辑
   */
  protected async doCheck(): Promise<void> {
    await this.checkSubscription()
  }

  /**
   * 检查订阅状态
   */
  private async checkSubscription(): Promise<void> {
    try {
      const guard = getGuard()

      // 强制刷新配置（不使用缓存）
      const response = await guard.verifyAndGetConfig('subscription-check', true)

      const newMode = response.rednote.mode

      logger.info('Subscription check completed', {
        currentMode: this.currentMode,
        newMode,
        tier: response.tier,
        maxAccounts: response.rednote.maxAccounts
      })

      // 检测模式变化
      if (newMode !== this.currentMode) {
        const oldMode = this.currentMode
        this.currentMode = newMode

        logger.warn('Subscription mode changed', {
          from: oldMode,
          to: newMode
        })

        // 触发回调
        if (this.onModeChangeCallback) {
          try {
            this.onModeChangeCallback(oldMode, newMode)
          } catch (err) {
            logger.error('Mode change callback failed:', err)
          }
        }
      }
    } catch (error) {
      logger.error('Failed to check subscription:', error)
    }
  }

  /**
   * 设置模式变化回调
   */
  setModeChangeCallback(callback: (oldMode: SubscriptionMode, newMode: SubscriptionMode) => void): void {
    this.onModeChangeCallback = callback
  }

  /**
   * 获取当前模式
   */
  getCurrentMode(): SubscriptionMode {
    return this.currentMode
  }
}
