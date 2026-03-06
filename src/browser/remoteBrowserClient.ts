/**
 * Remote Browser Manager Client
 *
 * When BROWSER_MANAGER_URL is set, the MCP Server does not launch local
 * browsers. Instead, it delegates all browser operations to the Browser
 * Manager service (running in Docker) via HTTP API.
 *
 * This provides the same interface as BrowserManager but over HTTP,
 * ensuring the MCP process can be restarted without affecting browser sessions.
 */

import logger from '../utils/logger'

/** Result of executing a page action on the remote browser manager */
export interface RemotePageResult {
    success: boolean
    data?: any
    error?: string
    screenshot?: string // base64
}

/**
 * Client for communicating with the remote Browser Manager service.
 * Used when BROWSER_MANAGER_URL environment variable is set.
 */
export class RemoteBrowserClient {
    private readonly baseUrl: string
    private readonly timeout: number

    constructor(baseUrl: string, timeout = 60000) {
        this.baseUrl = baseUrl.replace(/\/$/, '')
        this.timeout = timeout
        logger.info(`[RemoteBrowserClient] Initialized with base URL: ${this.baseUrl}`)
    }

    /**
     * Check if the remote Browser Manager is healthy
     */
    async isHealthy(): Promise<boolean> {
        try {
            const res = await fetch(`${this.baseUrl}/api/health`, {
                signal: AbortSignal.timeout(5000),
            })
            return res.ok
        } catch {
            return false
        }
    }

    /**
     * Wait for the remote Browser Manager to become healthy
     */
    async waitForHealthy(maxWaitMs = 30000): Promise<void> {
        const start = Date.now()
        while (Date.now() - start < maxWaitMs) {
            if (await this.isHealthy()) {
                logger.info('[RemoteBrowserClient] Browser Manager is healthy')
                return
            }
            await new Promise(r => setTimeout(r, 1000))
        }
        throw new Error(`Browser Manager at ${this.baseUrl} is not reachable after ${maxWaitMs}ms`)
    }

    /**
     * Execute a page action on the remote Browser Manager.
     * The Browser Manager acquires a page, runs the action, and returns the result.
     */
    async executePageAction(
        accountId: string | undefined,
        action: string,
        params: Record<string, any> = {},
        options?: { skipValidation?: boolean }
    ): Promise<RemotePageResult> {
        try {
            const res = await fetch(`${this.baseUrl}/api/browser/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accountId: accountId || undefined,
                    action,
                    params,
                    skipValidation: options?.skipValidation,
                }),
                signal: AbortSignal.timeout(this.timeout),
            })

            if (!res.ok) {
                const errBody = await res.text()
                throw new Error(`Browser Manager returned ${res.status}: ${errBody}`)
            }

            return await res.json()
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error)
            logger.error(`[RemoteBrowserClient] executePageAction failed: ${msg}`)
            return { success: false, error: msg }
        }
    }

    /**
     * Navigate to a URL and return page content / evaluate JS
     */
    async navigateAndEvaluate(
        accountId: string | undefined,
        url: string,
        evaluateScript?: string,
        options?: {
            waitUntil?: string
            timeout?: number
            waitForSelector?: string
            skipValidation?: boolean
        }
    ): Promise<RemotePageResult> {
        return this.executePageAction(accountId, 'navigate_and_evaluate', {
            url,
            evaluateScript,
            ...options,
        }, { skipValidation: options?.skipValidation })
    }

    /**
     * Take a screenshot of the current page
     */
    async screenshot(
        accountId: string | undefined,
        url?: string
    ): Promise<RemotePageResult> {
        return this.executePageAction(accountId, 'screenshot', { url })
    }

    /**
     * List all accounts from the remote Browser Manager
     */
    async listAccounts(): Promise<any[]> {
        try {
            const res = await fetch(`${this.baseUrl}/api/accounts`, {
                signal: AbortSignal.timeout(10000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.json()
        } catch (error) {
            logger.error('[RemoteBrowserClient] Failed to list accounts:', error)
            return []
        }
    }

    /**
     * Get a single account by ID
     */
    async getAccount(accountId: string): Promise<any | null> {
        try {
            const res = await fetch(`${this.baseUrl}/api/accounts/${accountId}`, {
                signal: AbortSignal.timeout(10000),
            })
            if (res.status === 404) return null
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return await res.json()
        } catch (error) {
            logger.error(`[RemoteBrowserClient] Failed to get account ${accountId}:`, error)
            return null
        }
    }

    /**
     * Get the default account
     */
    async getDefaultAccount(): Promise<any | null> {
        const accounts = await this.listAccounts()
        if (accounts.length === 0) return null
        return accounts.find((a: any) => a.isDefault) || accounts[0]
    }

    /**
     * Check if an account has cookies
     */
    hasCookies(accountId: string, accounts?: any[]): boolean {
        // If we already have the accounts list, check from it
        if (accounts) {
            const acc = accounts.find((a: any) => a.id === accountId)
            return acc?.hasCookies ?? false
        }
        // Otherwise need to make a sync-compatible check (the API response includes hasCookies)
        return true // Default to true, actual check happens via listAccounts
    }

    /**
     * Clear cookies for an account (triggers relogin flow)
     */
    async clearCookies(accountId: string): Promise<void> {
        const res = await fetch(`${this.baseUrl}/api/accounts/${accountId}/relogin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
            const errBody = await res.text()
            throw new Error(`Clear cookies failed: ${errBody}`)
        }
    }

    /**
     * Set default account
     */
    async setDefaultAccount(accountId: string): Promise<void> {
        const res = await fetch(`${this.baseUrl}/api/accounts/${accountId}/default`, {
            method: 'POST',
            signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
            const errBody = await res.text()
            throw new Error(`Set default account failed: ${errBody}`)
        }
    }

    /**
     * Trigger a QR code scan for an account
     */
    async startScan(accountId: string): Promise<{ scanId: string; status: string }> {
        const res = await fetch(`${this.baseUrl}/api/scan/${accountId}`, {
            method: 'POST',
            signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
            const errBody = await res.text()
            throw new Error(`Scan failed: ${errBody}`)
        }
        return await res.json()
    }

    /**
     * Refresh cookies for an account (trigger heartbeat)
     */
    async refreshSession(accountId: string): Promise<boolean> {
        const result = await this.executePageAction(accountId, 'refresh_session', {})
        return result.success
    }
}

/**
 * Singleton accessor for the remote browser client.
 * Returns null if BROWSER_MANAGER_URL is not set (local mode).
 */
let _remoteClient: RemoteBrowserClient | null = null

export function getRemoteBrowserClient(): RemoteBrowserClient | null {
    const url = process.env.BROWSER_MANAGER_URL
    if (!url) return null

    if (!_remoteClient) {
        _remoteClient = new RemoteBrowserClient(url)
    }
    return _remoteClient
}

/**
 * Check if running in remote browser mode
 */
export function isRemoteBrowserMode(): boolean {
    return !!process.env.BROWSER_MANAGER_URL
}
