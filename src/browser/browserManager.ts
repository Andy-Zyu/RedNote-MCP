import { Browser, BrowserContext, chromium, Page } from 'patchright'
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
  private cookiesInjected = false // Track if cookies were already injected at launch

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

  /**
   * Allocate a deterministic CDP port for a given accountId inside Docker.
   * Uses 9222 + account_index (based on accounts.json order) for predictable port mapping.
   */
  private static allocateCdpPort(accountId?: string): number {
    const basePort = 9222
    if (!accountId) return basePort
    const accounts = accountManager.listAccounts()
    const index = accounts.findIndex(a => a.id === accountId)
    return basePort + (index >= 0 ? index : accounts.length)
  }

  /**
   * Check if running inside Docker (Xvfb environment)
   */
  private static isDockerEnvironment(): boolean {
    return process.env.DISPLAY === ':99'
  }

  async acquirePage(accountId?: string, options?: { skipValidation?: boolean }): Promise<PageLease> {
    // If accountId is provided, delegate to the account-specific instance
    if (accountId && accountId !== this.accountId) {
      const accountManager = BrowserManager.getInstance(accountId)
      return accountManager.acquirePage(undefined, options)
    }

    this.clearIdleTimer()

    if (!this.context) {
      await this.launchBrowser(options?.skipValidation)
    }

    // NOTE: Cookies are injected once at browser launch time in launchBrowser().
    // DO NOT re-inject here - it can overwrite live session cookies and cause session drops.

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

  private async launchBrowser(skipValidation?: boolean): Promise<void> {
    const accountLabel = this.accountId || 'default'
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', accountLabel)

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true })
      logger.info(`Created profile directory: ${profileDir}`)
    }
    fs.chmodSync(profileDir, 0o700)

    const lockFile = path.join(profileDir, 'browser.wsEndpoint')
    const launchLockFile = path.join(profileDir, 'browser.launch.lock')

    // === Remote Mode: Connect to Docker container's browser via CDP Proxy ===
    const remoteUrl = process.env.BROWSER_MANAGER_URL
    if (remoteUrl) {
      try {
        logger.info(`[Remote Mode] Requesting browser for account: ${accountLabel} from ${remoteUrl}`)

        // Step 1: Ask Docker container to ensure a browser is running for this account
        const res = await fetch(`${remoteUrl}/api/browser/ensure`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: this.accountId }),
          signal: AbortSignal.timeout(60000),
        })

        if (!res.ok) {
          const errBody = await res.text()
          throw new Error(`Browser Manager returned ${res.status}: ${errBody}`)
        }

        const ensureResult = await res.json()
        logger.info(`[Remote Mode] Browser ready: ${JSON.stringify(ensureResult)}`)

        // Step 2: Connect via the CDP proxy on port 3001
        // Playwright fetches /cdp/<accountId>/json/version first, then connects via WebSocket
        const cdpProxyUrl = `${remoteUrl}/cdp/${this.accountId || 'default'}`
        logger.info(`[Remote Mode] Connecting via CDP proxy: ${cdpProxyUrl}`)

        this.browser = await chromium.connectOverCDP({
          endpointURL: cdpProxyUrl,
          timeout: 30000,
        })

        this.context = this.browser.contexts()[0]
        if (!this.context) throw new Error('No context found on remote browser')

        this.isBrowserOwner = false // Never own a remote browser
        logger.info(`[Remote Mode] Connected to Docker browser for account: ${accountLabel}`)

        if (!skipValidation) {
          await this.validateSession(accountLabel)
        }
        this.setupBrowserEvents(accountLabel)
        return
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.error(`[Remote Mode] Failed to connect to Docker browser: ${msg}`)
        throw new Error(`Cannot connect to Docker Browser Manager at ${remoteUrl}: ${msg}`)
      }
    }

    // === Local Mode: Try to connect to existing shared browser server ===
    const singletonLock = path.join(profileDir, 'SingletonLock')
    const isDocker = BrowserManager.isDockerEnvironment()

    // Docker mode: ALWAYS probe the deterministic CDP port first.
    // Don't rely on file markers (wsEndpoint, SingletonLock) which get deleted by process exits.
    // The CDP port is deterministic (9222+offset) so we can always reconstruct it.
    if (isDocker) {
      const cdpPort = BrowserManager.allocateCdpPort(this.accountId)
      const cdpEndpoint = `http://127.0.0.1:${cdpPort}`

      try {
        // Probe CDP port with a quick HTTP fetch
        const res = await fetch(`${cdpEndpoint}/json/version`, {
          signal: AbortSignal.timeout(3000),
        })
        if (res.ok) {
          // Chrome IS running and CDP is responding — connect!
          logger.info(`[Docker] CDP port ${cdpPort} is active, connecting to existing browser for account: ${accountLabel}`)
          this.browser = await chromium.connectOverCDP({
            endpointURL: cdpEndpoint,
            timeout: 10000,
          })
          this.context = this.browser.contexts()[0]
          if (!this.context) throw new Error('No context found on existing browser')

          this.isBrowserOwner = false
          // Restore the wsEndpoint file for non-Docker code paths
          fs.writeFileSync(lockFile, cdpEndpoint, 'utf-8')
          logger.info(`[Docker] Connected to existing browser for account: ${accountLabel}`)
          await this.applyStealthScripts(accountLabel)
          if (!skipValidation) {
            await this.validateSession(accountLabel)
          }
          this.setupBrowserEvents(accountLabel)
          return
        }
      } catch (err) {
        // CDP not responding — no browser running for this account
        logger.info(`[Docker] CDP port ${cdpPort} not responding, will launch new browser for account: ${accountLabel}`)
        // Kill any zombie Chrome processes using this profile to ensure clean launch
        try {
          const { execSync } = require('child_process')
          execSync(`pkill -9 -f "user-data-dir=.*${this.accountId || 'default'}" 2>/dev/null || true`, { stdio: 'ignore' })
        } catch (e) { /* ok if nothing to kill */ }
        // Clean stale files
        try { fs.unlinkSync(lockFile) } catch (e) { }
        try { fs.unlinkSync(singletonLock) } catch (e) { }
      }
    }

    // Standard lockFile-based connection (host mode or Docker fallback)
    if (fs.existsSync(lockFile)) {
      try {
        const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim()
        logger.info(`Attempting to connect to existing browser for account: ${accountLabel}`)
        this.browser = await chromium.connectOverCDP({
          endpointURL: wsEndpoint,
          timeout: 10000,
        })

        this.context = this.browser.contexts()[0]
        if (!this.context) throw new Error('No context found on connected browser')

        this.isBrowserOwner = false
        logger.info(`Connected to existing browser for account: ${accountLabel}`)
        await this.applyStealthScripts(accountLabel)
        if (!skipValidation) {
          await this.validateSession(accountLabel)
        }
        this.setupBrowserEvents(accountLabel)
        return
      } catch (err) {
        logger.warn(`Failed to connect to existing browser, will launch new one for account: ${accountLabel}`, err)
        try { fs.unlinkSync(lockFile) } catch (e) { }
      }
    }

    // === Step 2: Launch a new shared browser server (we are the owner) ===
    // Use atomic file creation to prevent race condition: only one process should launch
    // First, clean up stale launch locks (older than 30 seconds = crashed process)
    if (fs.existsSync(launchLockFile)) {
      try {
        const lockStat = fs.statSync(launchLockFile)
        const lockAge = Date.now() - lockStat.mtimeMs
        if (lockAge > 30000) {
          logger.warn(`Removing stale launch lock (age: ${Math.round(lockAge / 1000)}s) for account: ${accountLabel}`)
          fs.unlinkSync(launchLockFile)
        }
      } catch (e) { /* ignore */ }
    }

    let launchLockFd: number | null = null
    try {
      launchLockFd = fs.openSync(launchLockFile, 'wx') // 'wx' = create exclusive, fails if exists
      logger.info(`Acquired launch lock for account: ${accountLabel}`)
    } catch (err) {
      // Another process is launching, wait for it to finish and re-check
      logger.info(`Launch lock held by another process, waiting for account: ${accountLabel}`)
      for (let i = 0; i < 100; i++) { // Wait up to 10 seconds
        await new Promise(r => setTimeout(r, 100))
        if (!fs.existsSync(launchLockFile)) {
          // Lock released, try connecting to the newly launched browser
          if (fs.existsSync(lockFile)) {
            try {
              const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim()
              this.browser = await chromium.connectOverCDP({ endpointURL: wsEndpoint, timeout: 10000 })
              this.context = this.browser.contexts()[0]
              if (this.context) {
                this.isBrowserOwner = false
                this.setupBrowserEvents(accountLabel)
                return
              }
            } catch (connectErr) {
              logger.warn(`Failed to connect after lock released, will retry launch: ${connectErr}`)
            }
          }
          // Lock released but no valid browser to connect to — try to acquire lock ourselves
          try {
            launchLockFd = fs.openSync(launchLockFile, 'wx')
            logger.info(`Acquired launch lock after wait for account: ${accountLabel}`)
            break
          } catch (e) {
            // Another process grabbed it first, keep waiting
          }
        }
      }
      if (launchLockFd === null) {
        // Last resort: force remove stale lock and try once more
        logger.warn(`Force removing launch lock for account: ${accountLabel}`)
        try { fs.unlinkSync(launchLockFile) } catch (e) { }
        try {
          launchLockFd = fs.openSync(launchLockFile, 'wx')
        } catch (e) {
          throw new Error(`Cannot acquire launch lock for account: ${accountLabel}`)
        }
      }
    }

    try {
      logger.info(`Launching new browser server for account: ${accountLabel}`)

      // Cleanup stale Chromium locks
      const devToolsPortFile = path.join(profileDir, 'DevToolsActivePort')
      try { if (fs.existsSync(singletonLock)) fs.unlinkSync(singletonLock) } catch (e) { }
      try { if (fs.existsSync(devToolsPortFile)) fs.unlinkSync(devToolsPortFile) } catch (e) { }

      // Fix crash restore dialog: patch Preferences to mark clean exit
      // When Docker kills Chromium, it leaves exit_type: "Crashed" in Preferences.
      // On next launch, Chromium shows "Restore pages?" dialog which blocks Playwright.
      const prefsFile = path.join(profileDir, 'Default', 'Preferences')
      try {
        if (fs.existsSync(prefsFile)) {
          let prefs = fs.readFileSync(prefsFile, 'utf-8')
          // Replace "Crashed" exit type with "Normal"
          prefs = prefs.replace(/"exit_type"\s*:\s*"Crashed"/g, '"exit_type": "Normal"')
          prefs = prefs.replace(/"exited_cleanly"\s*:\s*false/g, '"exited_cleanly": true')
          fs.writeFileSync(prefsFile, prefs, 'utf-8')
          logger.info(`Patched Preferences for clean exit: ${accountLabel}`)
        }
      } catch (e) {
        logger.warn('Failed to patch Preferences file:', e)
      }

      // Both Docker and host need a CDP port for cross-process browser sharing:
      // - Docker: Matrix server launches browser, MCP (docker exec) connects via CDP
      // - Host: Browser Server mode, multiple MCP processes share one browser
      // Playwright's --remote-debugging-pipe (default) handles the initial launch IPC.
      // --remote-debugging-port handles cross-process connections - both coexist!
      const isDocker = BrowserManager.isDockerEnvironment()
      const cdpPort = isDocker ? BrowserManager.allocateCdpPort(this.accountId) : 0
      const cdpArgs = isDocker
        ? [`--remote-debugging-port=${cdpPort}`, '--remote-allow-origins=*']
        : ['--remote-debugging-port=0', '--remote-allow-origins=*']

      // Docker runs as root — needs --no-sandbox + GPU/shm flags for Xvfb
      const sandboxArgs = isDocker
        ? [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-gpu',                       // No GPU in Docker/Xvfb
          '--disable-dev-shm-usage',             // Docker's /dev/shm is too small
          '--disable-software-rasterizer',       // Avoid software rendering issues
        ]
        : []

      const context = await chromium.launchPersistentContext(profileDir, {
        headless: true, // Run in headless mode to avoid popping up 100 browser windows
        viewport: { width: 1280, height: 800 },
        args: [
          ...cdpArgs,
          ...sandboxArgs,
          '--disable-blink-features=AutomationControlled',
          '--disable-shared-workers',
          '--disable-background-networking',
          '--disable-session-crashed-bubble',   // Suppress "Restore pages?" dialog
          '--disable-infobars',                 // Suppress all info bars
          '--hide-crash-restore-bubble',        // Hide crash restore bubble
          ...(isDocker ? [] : ['--start-minimized']), // Only minimize on host (not Docker/Xvfb)
        ],
        ignoreDefaultArgs: ['--enable-automation', '--enable-features=CDPScreenshotNewSurface'],
      })

      // Docker (Plan B): use direct context + write CDP endpoint for cross-process sharing
      // Host: poll DevToolsActivePort for the random port
      if (isDocker) {
        // Use the context directly from launchPersistentContext
        this.isBrowserOwner = true
        this.ownerContext = context
        this.context = context
        this.browser = context.browser()!

        // Write the real CDP endpoint so other processes (MCP via docker exec) can connect
        const wsEndpoint = `http://127.0.0.1:${cdpPort}`
        fs.writeFileSync(lockFile, wsEndpoint, 'utf-8')
        logger.info(`[Docker] Browser launched for account: ${accountLabel}, CDP at ${wsEndpoint}`)
      } else {
        // Host: poll DevToolsActivePort file for the random CDP port
        let portStr = ''
        const pollAttempts = 50
        for (let i = 0; i < pollAttempts; i++) {
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
        this.ownerContext = context

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
      }

      // Shared initialization for both Docker and host modes
      await this.applyStealthScripts(accountLabel)

      // Ensure cookies are loaded from the canonical disk storage (~/.mcp/rednote/cookies.json)
      const cookies = await this.cookieManager.loadCookies()
      if (cookies.length > 0) {
        logger.info(`Injecting ${cookies.length} valid cookies into account context: ${accountLabel}`)
        await this.context!.addCookies(cookies)
      }

      if (!skipValidation) {
        await this.validateSession(accountLabel)
      }
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

  /**
   * Apply comprehensive anti-detection scripts to the browser context.
   * Must be called from ALL connection paths (Docker CDP, host CDP, fresh launch).
   * These scripts inject into every new page to hide Playwright/automation fingerprints.
   */
  private async applyStealthScripts(accountLabel: string): Promise<void> {
    if (!this.context) return

    await this.context.addInitScript(() => {
      // 1. Hide webdriver flag
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })

      // 2. Add chrome object (missing in headless/automation)
      if (!(window as any).chrome) {
        (window as any).chrome = {}
      }
      const chrome = (window as any).chrome
      if (!chrome.runtime) {
        chrome.runtime = {
          connect: () => { },
          sendMessage: () => { },
          onMessage: { addListener: () => { }, removeListener: () => { } },
          PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
          PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
          RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' },
        }
      }
      if (!chrome.app) {
        chrome.app = { isInstalled: false, InstallState: { INSTALLED: 'installed', NOT_INSTALLED: 'not_installed', DISABLED: 'disabled' }, RunningState: { RUNNING: 'running', CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run' } }
      }
      if (!chrome.csi) { chrome.csi = () => ({}) }
      if (!chrome.loadTimes) { chrome.loadTimes = () => ({}) }

      // 3. Fake plugins array (headless has 0 plugins)
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ] as any
          arr.length = 3
          arr.item = (i: number) => arr[i] || null
          arr.namedItem = (n: string) => arr.find((p: any) => p.name === n) || null
          arr.refresh = () => { }
          return arr
        }
      })

      // 4. Override languages
      Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] })

      // 5. Override permissions query to not expose automation
      const originalQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions)
      if (originalQuery) {
        (window.navigator.permissions as any).query = (params: any) => {
          if (params.name === 'notifications') {
            return Promise.resolve({ state: 'prompt', onchange: null, addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => true } as unknown as PermissionStatus)
          }
          return originalQuery(params)
        }
      }

      // 6. Fix iframe contentWindow.chrome (automation detection vector)
      const originalAttachShadow = Element.prototype.attachShadow
      Element.prototype.attachShadow = function (...args: [ShadowRootInit]) {
        return originalAttachShadow.apply(this, args)
      }
    })

    logger.info(`Applied stealth scripts for account: ${accountLabel}`)
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
   * Validate session by checking auth cookies (not DOM selectors).
   * Cookie-based validation is instant and stable against XHS UI changes.
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

    try {
      // Cookie-based validation: check for XHS auth cookies directly
      // This is much more stable than DOM selectors which break on UI changes
      const cookies = await this.context!.cookies('https://www.xiaohongshu.com')
      const webSession = cookies.find(c => c.name === 'web_session')
      const a1Cookie = cookies.find(c => c.name === 'a1')

      if (webSession && webSession.value) {
        // Check if cookie is expired
        const isExpired = webSession.expires > 0 && webSession.expires * 1000 < now
        if (!isExpired) {
          sessionCheckCache.set(cacheKey, now)
          logger.info(`Session valid for account: ${accountLabel} (web_session cookie present, a1=${!!a1Cookie})`)
          return
        }
        logger.warn(`web_session cookie expired for ${accountLabel}`)
      }

      // No valid web_session cookie — but check if we have cookies on disk
      // that might not be injected yet (e.g., after CDP reconnection)
      const diskCookies = await this.cookieManager.loadCookies()
      const diskSession = diskCookies.find((c: any) => c.name === 'web_session')
      if (diskSession && diskSession.value) {
        logger.info(`Found web_session on disk, re-injecting ${diskCookies.length} cookies for ${accountLabel}`)
        await this.context!.addCookies(diskCookies)
        sessionCheckCache.set(cacheKey, now)
        return
      }

      sessionCheckCache.delete(cacheKey)
      throw new Error(
        `账号 ${accountLabel} 的登录 Session 已过期，请先调用 login 工具重新扫码登录。`
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('Session 已过期')) {
        throw error
      }
      throw new Error(`Session validation failed for ${accountLabel}: ${error instanceof Error ? error.message : String(error)}`)
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
