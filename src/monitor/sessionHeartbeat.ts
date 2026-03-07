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
     * 辅助方法：模拟鼠标随机移动
     */
    private async simulateMouseMovement(page: any): Promise<void> {
        const viewport = page.viewportSize()
        if (!viewport) return

        const steps = 5 + Math.floor(Math.random() * 5) // 5 to 10 steps
        let currentX = viewport.width / 2
        let currentY = viewport.height / 2

        for (let i = 0; i < steps; i++) {
            // Random movement within a reasonable radius
            currentX += (Math.random() - 0.5) * 200
            currentY += (Math.random() - 0.5) * 200

            // Keep within bounds
            currentX = Math.max(10, Math.min(currentX, viewport.width - 10))
            currentY = Math.max(10, Math.min(currentY, viewport.height - 10))

            await page.mouse.move(currentX, currentY, { steps: 2 + Math.floor(Math.random() * 5) })
            await page.waitForTimeout(50 + Math.random() * 200)
        }
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

        // ======================================
        // 高阶保活机制 1：生物钟与随机怠惰 (Circadian Rhythm & Daytime Jitter)
        // ======================================
        const now = new Date()
        const hour = now.getHours()

        // 凌晨 2:00 ~ 7:00 (人类睡眠周期) - 80% 概率直接跳过本次心跳
        if (hour >= 2 && hour <= 7) {
            if (Math.random() < 0.8) {
                logger.info(`[SessionHeartbeat] Skipping account ${accountId}: Sleep cycle (80% chance triggered)`)
                return true // 假装成功，不判定为过期，只是今天在这刻不刷小红书了
            }
        } else {
            // 白天正常时间 - 30% 概率偷懒，打乱 20 分钟一刷的机器人规律
            if (Math.random() < 0.3) {
                logger.info(`[SessionHeartbeat] Skipping account ${accountId}: Daytime jitter (30% chance triggered)`)
                return true
            }
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

            // 等待页面初步加载
            await page.waitForTimeout(3000)

            // ======================================
            // 高阶保活机制 2：人类级信息流滚动与停顿 (Feed Interaction)
            // ======================================
            try {
                // 模拟鼠标在屏幕上随机晃动
                await this.simulateMouseMovement(page)

                // 决定今天的心情：往下刷 2 到 4 屏
                const scrolls = 2 + Math.floor(Math.random() * 3)
                logger.info(`[SessionHeartbeat] Simulating ${scrolls} human-like feed scrolls for ${accountId}`)

                for (let i = 0; i < scrolls; i++) {
                    // 每次向下滚动 600 ~ 1200 像素
                    const scrollAmount = 600 + Math.floor(Math.random() * 600)
                    await page.mouse.wheel(0, scrollAmount)

                    // 模拟鼠标移动（假装在看图或者找感兴趣的笔记）
                    await this.simulateMouseMovement(page)

                    // 在这个位置停顿阅读 1.5 秒 ~ 4 秒
                    const readTime = 1500 + Math.floor(Math.random() * 2500)
                    await page.waitForTimeout(readTime)
                }
            } catch (err) {
                logger.warn(`[SessionHeartbeat] Feed simulation error for ${accountId} (ignored):`, err)
            }

            // 检查是否登录成功 (寻找侧边栏的“我”)
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
