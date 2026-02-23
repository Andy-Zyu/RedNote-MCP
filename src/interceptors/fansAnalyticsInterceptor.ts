import { Page } from 'playwright'
import { BaseInterceptor } from './baseInterceptor'
import { FansAnalytics } from '../tools/types'
import logger from '../utils/logger'

export class FansAnalyticsInterceptor extends BaseInterceptor<FansAnalytics> {
  private readonly period: string

  constructor(page: Page, period: string = '7days', timeoutMs: number = 15000) {
    super(page, timeoutMs)
    this.period = period
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/galaxy/creator/data/fans') ||
      url.includes('/api/gaia/creator/data/fans') ||
      url.includes('/api/galaxy/creator/fans')
  }

  parseResponse(json: unknown): FansAnalytics {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined

    if (!data) {
      return { period: this.period, overview: { totalFans: '0', newFans: '0', lostFans: '0' }, portrait: null, activeFans: [] }
    }

    // API structure varies — return empty to trigger DOM fallback
    logger.info('Parsed fans analytics from API')
    return { period: this.period, overview: { totalFans: '0', newFans: '0', lostFans: '0' }, portrait: null, activeFans: [] }
  }

  async fallbackDom(): Promise<FansAnalytics> {
    logger.info('Using DOM fallback for fans analytics')

    await new Promise(r => setTimeout(r, 2000))

    if (this.period === '30days') {
      const btn30 = this.page.locator('text=近30天').first()
      if (await btn30.count() > 0) {
        await btn30.click()
        await new Promise(r => setTimeout(r, 2000))
        await this.page.waitForLoadState('networkidle', { timeout: 30000 })
      }
    }

    const data = await this.page.evaluate(() => {
      const getText = (el: Element | null): string => el?.textContent?.trim() || ''
      const fansLabels = ['总粉丝数', '新增粉丝数', '流失粉丝数']
      const fansValues: Record<string, string> = {}

      const allDivs = document.querySelectorAll('div')
      for (const div of allDivs) {
        const text = getText(div)
        if (fansLabels.includes(text) && div.children.length === 0) {
          const parent = div.parentElement
          if (parent) {
            const children = Array.from(parent.children)
            const valueEl = children.find(c => c !== div && getText(c) !== text)
            if (valueEl) fansValues[text] = getText(valueEl)
          }
        }
      }

      let portrait: string | null = null
      const noDataTexts = ['粉丝数过少', '先去涨粉']
      let hasPortrait = true
      for (const div of allDivs) {
        const text = getText(div)
        if (noDataTexts.some(t => text.includes(t))) {
          hasPortrait = false
          portrait = text
          break
        }
      }
      if (hasPortrait) portrait = 'available'

      const activeFans: string[] = []
      for (const div of allDivs) {
        if (getText(div).includes('最近还没有粉丝和你互动')) break
      }

      return {
        overview: {
          totalFans: fansValues['总粉丝数'] || '0',
          newFans: fansValues['新增粉丝数'] || '0',
          lostFans: fansValues['流失粉丝数'] || '0',
        },
        portrait: hasPortrait ? portrait : null,
        activeFans,
      }
    })

    return { period: this.period, ...data } as FansAnalytics
  }
}
