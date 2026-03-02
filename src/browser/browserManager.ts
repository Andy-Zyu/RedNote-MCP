import { Browser, BrowserContext, chromium, Page } from 'playwright'
import { CookieManager } from '../auth/cookieManager'
import { accountManager } from '../auth/accountManager'
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

// Cache for account-specific browser managers
const browserManagers = new Map<string, BrowserManager>()

export class BrowserManager {
  private static instance: BrowserManager | null = null
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private readonly cookieManager: CookieManager
  private idleTimer: NodeJS.Timeout | null = null
  private activeLeases: Map<string, Page> = new Map()
  private leaseCounter = 0
  private readonly accountId?: string

  private constructor(accountId?: string) {
    this.accountId = accountId
    // Use account-specific cookie path if accountId is provided
    const cookiePath = accountId 
      ? path.join(os.homedir(), '.mcp', 'rednote', 'accounts', accountId, 'cookies.json')
      : COOKIE_PATH
    this.cookieManager = new CookieManager(cookiePath, accountId)
    logger.info(`BrowserManager initialized for account: ${accountId || 'default'}`)
  }

  static getInstance(accountId?: string): BrowserManager {
    if (!accountId) {
      // For backward compatibility: use default singleton
      if (!BrowserManager.instance) {
        BrowserManager.instance = new BrowserManager()
      }
      return BrowserManager.instance
    }
    
    // For account-specific: use cached instance
    if (!browserManagers.has(accountId)) {
      browserManagers.set(accountId, new BrowserManager(accountId))
    }
    return browserManagers.get(accountId)!
  }

  async acquirePage(accountId?: string): Promise<PageLease> {
    // If accountId is provided, delegate to the account-specific instance
    if (accountId && accountId !== this.accountId) {
      const accountManager = BrowserManager.getInstance(accountId)
      return accountManager.acquirePage()
    }

    this.clearIdleTimer()

    if (!this.context) {
      await this.launchBrowser()
    }

    const page = await this.context!.newPage()
    const leaseId = String(++this.leaseCounter)
    this.activeLeases.set(leaseId, page)
    logger.info(`Page lease acquired: ${leaseId} for account: ${this.accountId || 'default'} (active: ${this.activeLeases.size})`)

    return {
      page,
      release: async () => {
        this.activeLeases.delete(leaseId)
        logger.info(`Page lease released: ${leaseId} for account: ${this.accountId || 'default'} (active: ${this.activeLeases.size})`)
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
      const accountLabel = this.accountId || 'default'
      logger.info(`Cookies refreshed to disk for account: ${accountLabel}`)
    } catch (err) {
      logger.error('Error refreshing cookies:', err)
    }
  }

  async shutdown(): Promise<void> {
    this.clearIdleTimer()
    const accountLabel = this.accountId || 'default'
    logger.info(`BrowserManager shutting down for account: ${accountLabel}`)

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

    logger.info(`BrowserManager shutdown complete for account: ${accountLabel}`)
  }

  static registerProcessCleanup(): void {
    const handler = async () => {
      // Shutdown default instance
      if (BrowserManager.instance) {
        await BrowserManager.instance.shutdown()
      }
      // Shutdown all account-specific instances
      for (const [accountId, manager] of browserManagers) {
        try {
          await manager.shutdown()
        } catch (err) {
          logger.error(`Error shutting down browser for account ${accountId}:`, err)
        }
      }
      browserManagers.clear()
    }
    process.on('SIGINT', () => { handler().finally(() => process.exit(0)) })
    process.on('SIGTERM', () => { handler().finally(() => process.exit(0)) })
  }

  private async launchBrowser(): Promise<void> {
    const accountLabel = this.accountId || 'default'
    logger.info(`Launching browser with persistent profile for account: ${accountLabel}`)

    // Always use account-specific profile directory (including default account)
    const profileDir = path.join(
      os.homedir(),
      '.mcp',
      'rednote',
      'profiles',
      this.accountId || 'default'
    )

    // Ensure profile directory exists
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true })
      logger.info(`Created profile directory: ${profileDir}`)
    }

    // Set directory permissions to user-only access (rwx------)
    fs.chmodSync(profileDir, 0o700)

    // launchPersistentContext returns a BrowserContext directly (no separate Browser)
    this.context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-shared-workers',
        '--disable-background-networking',
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
        logger.warn(`Browser disconnected unexpectedly for account: ${accountLabel}, clearing state`)
        this.browser = null
        this.context = null
        this.activeLeases.clear()
        this.clearIdleTimer()
      })
    }

    // Add error handler for context
    this.context.on('page', (page) => {
      page.on('crash', () => {
        logger.error(`Page crashed for account: ${accountLabel}`)
      })
      page.on('pageerror', (error) => {
        logger.error(`Page error for account: ${accountLabel}:`, error.message)
      })
    })

    // Load cookies from file into persistent context (first time migration)
    const cookies = await this.cookieManager.loadCookies()
    if (cookies.length === 0) {
      throw new Error(
        `未检测到账号 ${accountLabel} 的登录信息，请先调用 login 工具扫码登录小红书账号。`
      )
    }
    logger.info(`Loading ${cookies.length} cookies into context for account: ${accountLabel}`)
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
