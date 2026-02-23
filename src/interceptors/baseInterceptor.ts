import { Page, Response } from 'playwright'
import logger from '../utils/logger'

export interface InterceptResult<T> {
  readonly success: boolean
  readonly data: T | null
  readonly source: 'api' | 'dom'
}

export abstract class BaseInterceptor<T> {
  protected readonly page: Page
  protected readonly timeoutMs: number

  constructor(page: Page, timeoutMs: number = 15000) {
    this.page = page
    this.timeoutMs = timeoutMs
  }

  abstract matchUrl(url: string): boolean
  abstract parseResponse(json: unknown): T
  abstract fallbackDom(): Promise<T>

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

    return new Promise<InterceptResult<T>>((resolve) => {
      handler = async (response: Response) => {
        if (settled) return
        if (response.status() !== 200) return
        if (!this.matchUrl(response.url())) return

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
        settled = true
        cleanup()
        logger.error('Trigger action failed:', actionError)
        resolve({ success: false, data: null, source: 'dom' })
      })
    })
  }
}
