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
     */
    private async refreshAllSessions(): Promise<void> {
        const accounts = accountManager.listAccounts()
        logger.info(`[SessionHeartbeat] Refreshing sessions for ${accounts.length} accounts`)

        for (const account of accounts) {
            // 只刷新有 cookies 的账号
            if (!accountManager.hasCookies(account.id)) {
                continue
            }

            const isValid = await this.refreshSession(account.id)

            if (!isValid) {
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
