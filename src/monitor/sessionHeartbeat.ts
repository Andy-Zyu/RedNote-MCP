import logger from '../utils/logger'
import { accountManager } from '../auth/accountManager'
import { BrowserManager } from '../browser/browserManager'
import { BaseMonitor } from './baseMonitor'
import { MONITOR_INTERVAL } from '../constants/timeouts'
import { SELECTORS } from '../selectors'

/**
 * Session 过期回调类型
 */
export type SessionExpiredCallback = (accountId: string, accountName: string) => void

/**
 * Session 心跳监测器
 * 定期访问小红书主页，保持所有账号的 session 活跃
 * 如果检测到 session 失效，通过回调通知上层（如 Web Manager）
 */
export class SessionHeartbeat extends BaseMonitor {
    protected readonly CHECK_INTERVAL = MONITOR_INTERVAL.SESSION_HEARTBEAT
    protected readonly monitorName = 'SessionHeartbeat'

    private onSessionExpired: SessionExpiredCallback | null = null

    /**
     * 设置 session 过期回调
     */
    setSessionExpiredCallback(callback: SessionExpiredCallback): void {
        this.onSessionExpired = callback
    }

    /**
     * 实现基类的检查逻辑
     */
    protected async doCheck(): Promise<void> {
        await this.refreshAllSessions()
    }

    /**
     * 刷新单个账号的 session
     * 访问主页，检查登录状态，保存最新 cookies
     * @returns true=session有效, false=session已过期
     */
    async refreshSession(accountId: string): Promise<boolean> {
        logger.info(`[SessionHeartbeat] Refreshing session for account: ${accountId}`)

        // 检查是否有 cookies
        if (!accountManager.hasCookies(accountId)) {
            logger.warn(`[SessionHeartbeat] Account ${accountId} has no cookies, skipping`)
            return false
        }

        const bm = BrowserManager.getInstance(accountId)
        let lease = null

        try {
            lease = await bm.acquirePage()
            const page = lease.page

            // 访问主页触发 session 续期
            await page.goto('https://www.xiaohongshu.com/explore', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            })

            // 等待页面加载
            await page.waitForTimeout(3000)

            // 检查是否登录成功
            const isLoggedIn = await page.evaluate((sidebarSel: string) => {
                const sidebar = document.querySelector(sidebarSel)
                return sidebar?.textContent?.trim() === '我'
            }, SELECTORS.auth.sidebarUser)

            if (isLoggedIn) {
                // Session 有效，刷新 cookies 到磁盘
                await bm.refreshCookies()
                logger.info(`[SessionHeartbeat] Session refreshed for account: ${accountId}`)
                return true
            } else {
                // Session 已过期
                logger.warn(`[SessionHeartbeat] Session expired for account: ${accountId}`)
                return false
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.error(`[SessionHeartbeat] Error refreshing session for ${accountId}:`, msg)
            return false
        } finally {
            if (lease) {
                await lease.release()
            }
        }
    }

    /**
     * 刷新所有账号的 session
     * 关键改进：每个账号之间加入 1~3 分钟随机延迟，
     * 避免同一时间窗口内多账号密集访问触发小红书风控
     */
    private async refreshAllSessions(): Promise<void> {
        const accounts = accountManager.listAccounts()
        const activeAccounts = accounts.filter(a => accountManager.hasCookies(a.id))
        logger.info(`[SessionHeartbeat] Refreshing sessions for ${activeAccounts.length}/${accounts.length} accounts (with randomized delays)`)

        for (let i = 0; i < activeAccounts.length; i++) {
            const account = activeAccounts[i]

            // 第一个账号之后，每个账号间加入 1~3 分钟随机延迟
            if (i > 0) {
                const delayMs = (60 + Math.random() * 120) * 1000 // 60~180 seconds
                logger.info(`[SessionHeartbeat] Waiting ${Math.round(delayMs / 1000)}s before refreshing next account...`)
                await new Promise(r => setTimeout(r, delayMs))
            }

            const isValid = await this.refreshSession(account.id)

            if (!isValid) {
                // 彻底清除已经失效的 Cookie 文件
                accountManager.clearCookies(account.id)
                // 更新账号状态
                accountManager.updateAccount(account.id, { isActive: false })

                // 触发过期回调
                if (this.onSessionExpired) {
                    this.onSessionExpired(account.id, account.name)
                }
            } else {
                // 更新最新活跃时间
                accountManager.updateAccount(account.id, {
                    isActive: true,
                    lastActiveTime: new Date().toISOString(),
                })
            }
        }

        logger.info('[SessionHeartbeat] All sessions refreshed')
    }
}
