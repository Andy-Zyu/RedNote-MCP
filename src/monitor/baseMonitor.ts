/**
 * 监控器基类
 * 提供通用的启动/停止/定时检查逻辑
 */

import logger from '../utils/logger'

export abstract class BaseMonitor {
  protected checkInterval: NodeJS.Timeout | null = null
  protected isChecking = false
  protected abstract readonly CHECK_INTERVAL: number
  protected abstract readonly monitorName: string

  /**
   * 启动监控
   */
  start(): void {
    if (this.checkInterval) {
      logger.warn(`${this.monitorName} already started`)
      return
    }

    logger.info(`Starting ${this.monitorName}`, {
      interval: `${this.CHECK_INTERVAL / 1000}s`
    })

    // 立即执行一次检查
    this.performCheck().catch(err => {
      logger.error(`Initial ${this.monitorName} check failed:`, err)
    })

    // 设置定时检查
    this.checkInterval = setInterval(() => {
      this.performCheck().catch(err => {
        logger.error(`Scheduled ${this.monitorName} check failed:`, err)
      })
    }, this.CHECK_INTERVAL)
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
      logger.info(`${this.monitorName} stopped`)
    }
  }

  /**
   * 获取监控状态
   */
  getStatus(): { running: boolean; checking: boolean; interval: number } {
    return {
      running: this.checkInterval !== null,
      checking: this.isChecking,
      interval: this.CHECK_INTERVAL,
    }
  }

  /**
   * 执行检查（带防重入保护）
   */
  private async performCheck(): Promise<void> {
    if (this.isChecking) {
      logger.warn(`${this.monitorName} check already in progress, skipping`)
      return
    }

    this.isChecking = true
    try {
      await this.doCheck()
    } finally {
      this.isChecking = false
    }
  }

  /**
   * 子类实现具体的检查逻辑
   */
  protected abstract doCheck(): Promise<void>
}
