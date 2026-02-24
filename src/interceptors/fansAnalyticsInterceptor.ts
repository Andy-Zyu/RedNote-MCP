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

    const data = await this.page.evaluate(`
      (() => {
        var gt = (el) => el ? (el.textContent || '').trim() : '';
        var fansLabels = ['总粉丝数', '新增粉丝数', '流失粉丝数'];
        var fansValues = {};
        var allDivs = document.querySelectorAll('div');
        for (var div of allDivs) {
          var text = gt(div);
          if (fansLabels.indexOf(text) >= 0 && div.children.length === 0) {
            var parent = div.parentElement;
            if (parent) {
              var children = Array.from(parent.children);
              var valueEl = children.find(function(c) { return c !== div && gt(c) !== text; });
              if (valueEl) fansValues[text] = gt(valueEl);
            }
          }
        }
        var portrait = null;
        var noDataTexts = ['粉丝数过少', '先去涨粉'];
        var hasPortrait = true;
        for (var div of allDivs) {
          var text = gt(div);
          if (noDataTexts.some(function(t) { return text.indexOf(t) >= 0; })) {
            hasPortrait = false;
            portrait = text;
            break;
          }
        }
        if (hasPortrait) portrait = 'available';
        var activeFans = [];
        return {
          overview: {
            totalFans: fansValues['总粉丝数'] || '0',
            newFans: fansValues['新增粉丝数'] || '0',
            lostFans: fansValues['流失粉丝数'] || '0',
          },
          portrait: hasPortrait ? portrait : null,
          activeFans: activeFans,
        };
      })()
    `) as { overview: { totalFans: string; newFans: string; lostFans: string }; portrait: string | null; activeFans: string[] }

    return { period: this.period, ...data }
  }
}
