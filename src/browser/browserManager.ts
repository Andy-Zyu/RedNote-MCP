import { Browser, BrowserContext, chromium, Page } from 'playwright'
import { CookieManager } from '../auth/cookieManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import logger from '../utils/logger'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const IDLE_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export interface PageLease {
  readonly page: Page
  release(): Promise<void>
}

export class BrowserManager {
  private static instance: BrowserManager | null = null
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private readonly cookieManager: CookieManager
  private idleTimer: NodeJS.Timeout | null = null
  private activeLeases: Map<string, Page> = new Map()
  private leaseCounter = 0

  private constructor() {
    this.cookieManager = new CookieManager(COOKIE_PATH)
  }

  static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager()
    }
    return BrowserManager.instance
  }

  async acquirePage(): Promise<PageLease> {
    this.clearIdleTimer()

    if (!this.context) {
      await this.launchBrowser()
    }

    const page = await this.context!.newPage()
    const leaseId = String(++this.leaseCounter)
    this.activeLeases.set(leaseId, page)
    logger.info(`Page lease acquired: ${leaseId} (active: ${this.activeLeases.size})`)

    return {
      page,
      release: async () => {
        this.activeLeases.delete(leaseId)
        logger.info(`Page lease released: ${leaseId} (active: ${this.activeLeases.size})`)
        try {
          if (!page.isClosed()) {
            await page.close()
          }
        } catch (err) {
          logger.error('Error closing leased page:', err)
        }
        this.resetIdleTimer()
      },
    }
  }

  async refreshCookies(): Promise<void> {
    if (!this.context) return
    try {
      const cookies = await this.context.cookies()
      await this.cookieManager.saveCookies(cookies)
      logger.info('Cookies refreshed to disk')
    } catch (err) {
      logger.error('Error refreshing cookies:', err)
    }
  }

  async shutdown(): Promise<void> {
    this.clearIdleTimer()
    logger.info('BrowserManager shutting down')

    await this.refreshCookies()

    // Close all active lease pages
    for (const [id, page] of this.activeLeases) {
      try {
        if (!page.isClosed()) {
          await page.close()
        }
      } catch (err) {
        logger.error(`Error closing lease ${id} during shutdown:`, err)
      }
    }
    this.activeLeases.clear()

    // For persistent context, closing context also closes the browser
    if (this.context) {
      try {
        await this.context.close()
      } catch (err) {
        logger.error('Error closing context:', err)
      }
      this.context = null
      this.browser = null
    }

    logger.info('BrowserManager shutdown complete')
  }

  static registerProcessCleanup(): void {
    const handler = async () => {
      if (BrowserManager.instance) {
        await BrowserManager.instance.shutdown()
      }
    }
    process.on('SIGINT', () => { handler().finally(() => process.exit(0)) })
    process.on('SIGTERM', () => { handler().finally(() => process.exit(0)) })
  }

  private async launchBrowser(): Promise<void> {
    logger.info('Launching browser with persistent profile')

    // Ensure profile directory exists
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true })
    }

    // launchPersistentContext returns a BrowserContext directly (no separate Browser)
    this.context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
      ],
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })

    // Get the underlying browser reference
    this.browser = this.context.browser()

    // Hide webdriver property to avoid bot detection
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })

    if (this.browser) {
      this.browser.on('disconnected', () => {
        logger.warn('Browser disconnected unexpectedly, clearing state')
        this.browser = null
        this.context = null
        this.activeLeases.clear()
        this.clearIdleTimer()
      })
    }

    // Load cookies from file into persistent context (first time migration)
    const cookies = await this.cookieManager.loadCookies()
    if (cookies.length === 0) {
      throw new Error(
        '未检测到登录信息，请先调用 login 工具扫码登录小红书账号。'
      )
    }
    logger.info(`Loading ${cookies.length} cookies into context`)
    await this.context.addCookies(cookies)
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer()
    if (this.activeLeases.size === 0 && this.browser) {
      logger.info('No active leases, starting idle timer')
      this.idleTimer = setTimeout(async () => {
        logger.info('Idle timeout reached, shutting down browser')
        await this.shutdown()
      }, IDLE_TIMEOUT_MS)
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
  }
}
