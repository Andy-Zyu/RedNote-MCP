import { Page, Response } from 'patchright'
import logger from '../utils/logger'

export interface InterceptResult<T> {
  readonly success: boolean
  readonly data: T | null
  readonly source: 'api' | 'dom'
}

export abstract class BaseInterceptor<T> {
  protected readonly page: Page
  protected readonly timeoutMs: number

  constructor(page: Page, timeoutMs: number = 30000) {
    this.page = page
    this.timeoutMs = timeoutMs
  }

  abstract matchUrl(url: string): boolean
  abstract parseResponse(json: unknown): T
  abstract fallbackDom(): Promise<T>

  /**
   * Optional hook to validate the full Response object (e.g. check POST body).
   * Called after matchUrl succeeds. Override in subclasses for extra checks.
   */
  matchResponse(_response: Response): boolean {
    return true
  }

  async intercept(triggerAction: () => Promise<void>): Promise<InterceptResult<T>> {
    let settled = false
    let handler: ((response: Response) => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (handler) {
        this.page.removeListener('response', handler)
        handler = null
      }
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }

    /** Check if the page has been redirected to a captcha/risk-control page */
    const checkCaptcha = (): string | null => {
      try {
        const url = this.page.url()
        const isCaptchaUrl =
          /\/website-login\/captcha\b/.test(url) ||
          (/[?&]verifyType=/.test(url) && /(website-login|captcha)/.test(url))
        if (isCaptchaUrl) {
          return `⚠️ 该账号已被小红书风控拦截（需要验证码验证）。` +
            `请立即停止对该账号的所有操作，不要重试。` +
            `用户需要通过 VNC (noVNC 端口 6080) 或小红书 APP 手动完成验证后才能继续使用该账号。`
        }
      } catch { /* page may be closed */ }
      return null
    }

    return new Promise<InterceptResult<T>>((resolve, reject) => {
      handler = async (response: Response) => {
        if (settled) return
        if (response.status() !== 200) return
        if (!this.matchUrl(response.url())) return
        if (!this.matchResponse(response)) return

        try {
          const json = await response.json()
          const data = this.parseResponse(json)
          // Skip empty results — wait for a better response
          if (Array.isArray(data) && data.length === 0) {
            logger.info(`Skipping empty result from ${response.url()}, waiting for more responses`)
            return
          }
          if (settled) return
          settled = true
          cleanup()
          logger.info(`Intercepted API response from ${response.url()}, parsed ${Array.isArray(data) ? data.length : 'N/A'} items`)
          resolve({ success: true, data, source: 'api' })
        } catch (error) {
          logger.debug(`Non-JSON or parse error for ${response.url()}:`, error)
        }
      }

      this.page.on('response', handler)

      timer = setTimeout(async () => {
        if (settled) return
        settled = true
        cleanup()

        // Check for captcha BEFORE falling back to DOM
        const captchaMsg = checkCaptcha()
        if (captchaMsg) {
          reject(new Error(captchaMsg))
          return
        }

        logger.info('API intercept timed out, falling back to DOM extraction')
        try {
          const data = await this.fallbackDom()
          resolve({ success: true, data, source: 'dom' })
        } catch (domError) {
          logger.error('DOM fallback also failed:', domError)
          resolve({ success: false, data: null, source: 'dom' })
        }
      }, this.timeoutMs)

      triggerAction().catch((actionError) => {
        if (settled) return

        // Check for captcha — reject with clear message instead of swallowing
        const captchaMsg = checkCaptcha()
        if (captchaMsg) {
          settled = true
          cleanup()
          reject(new Error(captchaMsg))
          return
        }

        settled = true
        cleanup()
        logger.error('Trigger action failed:', actionError)
        resolve({ success: false, data: null, source: 'dom' })
      })
    })
  }
}
