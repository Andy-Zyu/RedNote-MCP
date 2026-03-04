import { Browser, BrowserContext, chromium, Page } from 'playwright'
import { CookieManager } from '../auth/cookieManager'
import { accountManager } from '../auth/accountManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import logger from '../utils/logger'
import { SESSION_CHECK_CACHE_TTL } from '../constants/timeouts'

const IDLE_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes (heartbeat handles keep-alive)

// Cache for session validity checks: accountId -> last check timestamp
const sessionCheckCache = new Map<string, number>()

export interface PageLease {
  readonly page: Page
  release(): Promise<void>
}

// Cache for account-specific browser managers
const browserManagers = new Map<string, BrowserManager>()

export class BrowserManager {
  private isBrowserOwner = false // true if this process launched the browser server
  private static instance: BrowserManager | null = null
  private browser: Browser | null = null
  private context: BrowserContext | null = null
  private ownerContext: BrowserContext | null = null // Original persistent context, only owner has it
  private readonly cookieManager: CookieManager
  private idleTimer: NodeJS.Timeout | null = null
  private activeLeases: Map<string, Page> = new Map()
  private leaseCounter = 0
  private readonly accountId?: string

  private constructor(accountId?: string) {
    this.accountId = accountId
    const cookiePath = accountManager.getCookiePath(accountId)
    this.cookieManager = new (CookieManager as any)(cookiePath, accountId)
    logger.info(`BrowserManager initialized for account: ${accountId || 'default'}, cookies: ${cookiePath}`)
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

    // Only owner should refresh cookies to disk (avoid concurrent writes)
    if (this.isBrowserOwner) {
      await this.refreshCookies()
    }

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

    if (this.isBrowserOwner) {
      // === Owner shutdown: Close in correct order ===
      // Step 1: Disconnect CDP (doesn't kill Chromium)
      if (this.browser) {
        try {
          await this.browser.close()
          logger.info(`Disconnected CDP connection for account: ${accountLabel}`)
        } catch (err) {
          logger.error('Error disconnecting CDP:', err)
        }
      }
      // Step 2: Close ownerContext (this actually kills Chromium)
      if (this.ownerContext) {
        try {
          await this.ownerContext.close()
          logger.info(`Closed ownerContext (Chromium stopped) for account: ${accountLabel}`)
        } catch (err) {
          logger.error('Error closing ownerContext:', err)
        }
      }
    } else {
      // === Non-owner: Just disconnect CDP, don't affect owner ===
      if (this.browser) {
        try {
          await this.browser.close()
          logger.info(`Disconnected from shared browser for account: ${accountLabel}`)
        } catch (err) {
          logger.error('Error disconnecting from browser:', err)
        }
      }
    }

    // Clear all references
    this.context = null
    this.browser = null
    this.ownerContext = null

    // Clean up lockfile (only owner)
    if (this.isBrowserOwner) {
      const lockFile = path.join(
        os.homedir(),
        '.mcp',
        'rednote',
        'profiles',
        this.accountId || 'default',
        'browser.wsEndpoint'
      )
      if (fs.existsSync(lockFile)) {
        try {
          fs.unlinkSync(lockFile)
          logger.info(`Removed lockfile ${lockFile}`)
        } catch (e) {
          logger.error(`Failed to remove lockfile:`, e)
        }
      }
      this.isBrowserOwner = false // Reset owner state
    }

    // Remove from Map to avoid zombie instances
    if (this.accountId) {
      browserManagers.delete(this.accountId)
    } else {
      BrowserManager.instance = null
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
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', accountLabel)

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true })
      logger.info(`Created profile directory: ${profileDir}`)
    }
    fs.chmodSync(profileDir, 0o700)

    const lockFile = path.join(profileDir, 'browser.wsEndpoint')
    const launchLockFile = path.join(profileDir, 'browser.launch.lock')

    // === Step 1: Try to connect to existing shared browser server ===
    if (fs.existsSync(lockFile)) {
      try {
        const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim()
        logger.info(`Attempting to connect to shared browser at ${wsEndpoint} for account: ${accountLabel}`)
        this.browser = await chromium.connectOverCDP({
          endpointURL: wsEndpoint,
          timeout: 10000,
        })
        this.context = this.browser.contexts()[0]
        if (!this.context) throw new Error('No context found on connected browser')

        this.isBrowserOwner = false
        logger.info(`Successfully connected to shared browser server for account: ${accountLabel}`)
        await this.validateSession(accountLabel)
        this.setupBrowserEvents(accountLabel)
        return
      } catch (err) {
        logger.warn(`Failed to connect to shared browser, removing stale lockfile for account: ${accountLabel}`, err)
        try { fs.unlinkSync(lockFile) } catch (e) { }
      }
    }

    // === Step 2: Launch a new shared browser server (we are the owner) ===
    // Use atomic file creation to prevent race condition: only one process should launch
    let launchLockFd: number | null = null
    try {
      launchLockFd = fs.openSync(launchLockFile, 'wx') // 'wx' = create exclusive, fails if exists
      logger.info(`Acquired launch lock for account: ${accountLabel}`)
    } catch (err) {
      // Another process is launching, wait for it to finish and re-check
      logger.info(`Launch lock held by another process, waiting for account: ${accountLabel}`)
      for (let i = 0; i < 50; i++) { // Wait up to 5 seconds
        await new Promise(r => setTimeout(r, 100))
        if (!fs.existsSync(launchLockFile)) {
          // Lock released, try connecting to the newly launched browser
          if (fs.existsSync(lockFile)) {
            const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim()
            this.browser = await chromium.connectOverCDP({ endpointURL: wsEndpoint, timeout: 10000 })
            this.context = this.browser.contexts()[0]
            if (this.context) {
              this.isBrowserOwner = false
              this.setupBrowserEvents(accountLabel)
              return
            }
          }
        }
      }
      throw new Error(`Timeout waiting for launch lock for account: ${accountLabel}`)
    }

    try {
      logger.info(`Launching new browser server for account: ${accountLabel}`)

      // Cleanup stale Chromium locks
      const singletonLock = path.join(profileDir, 'SingletonLock')
      const devToolsPortFile = path.join(profileDir, 'DevToolsActivePort')
      try { if (fs.existsSync(singletonLock)) fs.unlinkSync(singletonLock) } catch (e) { }
      try { if (fs.existsSync(devToolsPortFile)) fs.unlinkSync(devToolsPortFile) } catch (e) { }

      const context = await chromium.launchPersistentContext(profileDir, {
        headless: false, // Force headed mode for maximum compatibility on Mac
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        args: [
          '--remote-debugging-port=0',
          '--remote-allow-origins=*',
          '--disable-blink-features=AutomationControlled',
          '--disable-shared-workers',
          '--disable-background-networking',
        ],
        ignoreDefaultArgs: ['--enable-automation']
      })

      // Poll for the CDP port assigned by the browser
      let portStr = ''
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (fs.existsSync(devToolsPortFile)) {
          const content = fs.readFileSync(devToolsPortFile, 'utf-8').split('\n')
          if (content.length >= 2) {
            portStr = content[0].trim()
            break
          }
        }
      }

      if (!portStr) {
        await context.close().catch(() => { })
        throw new Error(`Timeout waiting for DevToolsActivePort file at ${devToolsPortFile}`)
      }

      const wsEndpoint = `http://127.0.0.1:${portStr}`
      fs.writeFileSync(lockFile, wsEndpoint, 'utf-8')
      logger.info(`Browser server registered at: ${wsEndpoint}`)

      this.isBrowserOwner = true
      this.ownerContext = context // Store the original persistent context

      // Connect to itself over CDP to get a standardized Browser object
      try {
        this.browser = await chromium.connectOverCDP({
          endpointURL: wsEndpoint,
          timeout: 15000,
        })
      } catch (err) {
        // CDP connection failed, must shut down the already-started Chromium to avoid leak
        logger.error('Failed to connect to own browser via CDP, shutting down ownerContext', err)
        await context.close().catch(() => { })
        try { fs.unlinkSync(lockFile) } catch (e) { }
        this.isBrowserOwner = false
        this.ownerContext = null
        throw err
      }
      this.context = this.browser.contexts()[0]

      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })

      // Ensure cookies are loaded from the canonical disk storage (~/.mcp/rednote/cookies.json)
      const cookies = await this.cookieManager.loadCookies()
      if (cookies.length > 0) {
        logger.info(`Injecting ${cookies.length} valid cookies into account context: ${accountLabel}`)
        await this.context.addCookies(cookies)
      }

      await this.validateSession(accountLabel)
      this.setupBrowserEvents(accountLabel)
    } finally {
      // Always release the launch lock
      if (launchLockFd !== null) {
        try { fs.closeSync(launchLockFd) } catch (e) { }
        try { fs.unlinkSync(launchLockFile) } catch (e) { }
        logger.info(`Released launch lock for account: ${accountLabel}`)
      }
    }
  }

  private setupBrowserEvents(accountLabel: string): void {
    if (this.browser) {
      this.browser.on('disconnected', () => {
        logger.warn(`Browser disconnected unexpectedly for account: ${accountLabel}, clearing state`)
        this.browser = null
        this.context = null
        this.ownerContext = null // Also clear ownerContext
        this.activeLeases.clear()
        this.clearIdleTimer()

        // Clean up lockfile if owner
        if (this.isBrowserOwner) {
          const lockFile = path.join(
            os.homedir(),
            '.mcp',
            'rednote',
            'profiles',
            this.accountId || 'default',
            'browser.wsEndpoint'
          )
          try { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile) } catch (e) { }
          this.isBrowserOwner = false
        }
      })
    }

    if (this.context) {
      this.context.on('page', (page) => {
        page.on('crash', () => {
          logger.error(`Page crashed for account: ${accountLabel}`)
        })
        page.on('pageerror', (error) => {
          logger.error(`Page error for account: ${accountLabel}:`, error.message)
        })
      })
    }
  }

  /**
   * Validate session by visiting the homepage and checking login status.
   * Results are cached for SESSION_CHECK_CACHE_TTL to avoid redundant checks.
   */
  private async validateSession(accountLabel: string): Promise<void> {
    const cacheKey = this.accountId || 'default'
    const lastCheck = sessionCheckCache.get(cacheKey)
    const now = Date.now()

    if (lastCheck && (now - lastCheck) < SESSION_CHECK_CACHE_TTL) {
      logger.info(`Session check cached for account: ${accountLabel}, skipping`)
      return
    }

    logger.info(`Validating session for account: ${accountLabel}`)
    const page = await this.context!.newPage()

    try {
      logger.info(`Navigating to explore for session validation...`)
      await page.goto('https://www.xiaohongshu.com/explore', {
        waitUntil: 'domcontentloaded', // Faster than 'networkidle'
        timeout: 30000,
      })
      await page.waitForTimeout(2000)

      const currentUrl = page.url()
      const isLoggedIn = await page.evaluate(() => {
        // Look for the user indicator in the sidebar or avatar
        const hasUser = !!document.querySelector('.side-bar-component .user, .avatar, .user-avatar, img[alt*="用户"]')
        const isLoginMaskVisible = !!document.querySelector('.login-container, .login-box, .qrcode-img')
        return hasUser && !isLoginMaskVisible
      })

      if (isLoggedIn && !currentUrl.includes('/login')) {
        sessionCheckCache.set(cacheKey, now)
        logger.info(`Session valid for account: ${accountLabel}`)
      } else {
        const screenshotPath = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', accountLabel, `session-failed-${Date.now()}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        logger.warn(`Session invalid for ${accountLabel}. Redirected to: ${currentUrl}. Screenshot: ${screenshotPath}`)

        sessionCheckCache.delete(cacheKey)
        throw new Error(
          `账号 ${accountLabel} 的登录 Session 已过期，请先调用 login 工具重新扫码登录。`
        )
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Session 已过期')) {
        throw error
      }
      // Network errors should be thrown to prevent using a potentially broken session
      throw new Error(`Session validation failed for ${accountLabel}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (!page.isClosed()) {
        await page.close()
      }
    }
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
