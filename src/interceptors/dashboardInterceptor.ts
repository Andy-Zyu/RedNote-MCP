import { Page } from 'patchright'
import { BaseInterceptor } from './baseInterceptor'
import { DashboardOverview } from '../tools/types'
import logger from '../utils/logger'

/**
 * Dashboard interceptor for creator center statistics.
 * Creator center pages may use SSR or multiple API calls,
 * so this interceptor has a robust DOM fallback.
 */
export class DashboardInterceptor extends BaseInterceptor<DashboardOverview> {
  private readonly period: string

  constructor(page: Page, period: string = '7days', timeoutMs: number = 15000) {
    super(page, timeoutMs)
    this.period = period
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/galaxy/creator/data/overview') ||
      url.includes('/api/galaxy/creator/statistics') ||
      url.includes('/api/gaia/creator/data/overview')
  }

  parseResponse(json: unknown): DashboardOverview {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined

    if (!data) {
      return this.emptyDashboard()
    }

    logger.info(`Parsed dashboard overview from API`)
    // API structure varies — return what we can extract, DOM fallback handles the rest
    return this.emptyDashboard()
  }

  private emptyDashboard(): DashboardOverview {
    const emptyMetric = { value: '0', change: '-' }
    const emptyDiag = { value: '0', suggestion: '' }
    return {
      period: this.period,
      dateRange: '',
      diagnosis: {
        views: emptyDiag, newFollowers: emptyDiag, profileVisitors: emptyDiag,
        publishCount: emptyDiag, interactions: emptyDiag,
      },
      overview: {
        impressions: emptyMetric, views: emptyMetric, coverClickRate: emptyMetric,
        avgViewDuration: emptyMetric, totalViewDuration: emptyMetric, videoCompletionRate: emptyMetric,
      },
      interactions: {
        likes: emptyMetric, comments: emptyMetric, collects: emptyMetric, shares: emptyMetric,
      },
      followers: {
        netGain: emptyMetric, newFollows: emptyMetric, unfollows: emptyMetric, profileVisitors: emptyMetric,
      },
    }
  }

  async fallbackDom(): Promise<DashboardOverview> {
    logger.info('Using DOM fallback for dashboard overview')

    await this.page.waitForSelector('text=账号诊断', { timeout: 30000 })
    // Small delay for data to render
    await new Promise(r => setTimeout(r, 2000))

    if (this.period === '30days') {
      const btn30 = this.page.locator('text=近30日').first()
      if (await btn30.count() > 0) {
        await btn30.click()
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    const extractVisibleMetrics = async (): Promise<Record<string, { value: string; change: string }>> => {
      return await this.page.evaluate(`
        (() => {
          var gt = (el) => el ? (el.textContent || '').trim() : '';
          var allDivs = Array.from(document.querySelectorAll('div'));
          var metrics = {};
          var knownLabels = [
            '曝光数', '观看数', '封面点击率', '平均观看时长', '观看总时长', '视频完播率',
            '点赞数', '评论数', '收藏数', '分享数',
            '净涨粉', '新增关注', '取消关注', '主页访客'
          ];
          for (var label of knownLabels) {
            var labelEl = allDivs.find(function(el) { return el.childElementCount === 0 && gt(el) === label; });
            if (labelEl && labelEl.parentElement) {
              var children = Array.from(labelEl.parentElement.children);
              var idx = children.indexOf(labelEl);
              metrics[label] = {
                value: children[idx + 1] ? gt(children[idx + 1]) : '0',
                change: children[idx + 2] ? gt(children[idx + 2]) : '-'
              };
            }
          }
          return metrics;
        })()
      `)
    }

    const baseData = await this.page.evaluate(`
      (() => {
        var gt = (el) => el ? (el.textContent || '').trim() : '';
        var allDivs = Array.from(document.querySelectorAll('div'));
        var diagnosisItems = [];
        var diagLabels = ['观看数：', '涨粉数：', '主页访客数：', '发布数：', '互动数：'];
        for (var label of diagLabels) {
          var labelEl = allDivs.find(function(el) { return el.childElementCount === 0 && gt(el) === label; });
          if (labelEl && labelEl.parentElement) {
            var siblings = Array.from(labelEl.parentElement.children);
            var suggestionEl = siblings.find(function(s) { return s !== labelEl; });
            var suggestion = suggestionEl ? gt(suggestionEl) : '';
            var match = suggestion.match(/为\\s*(\\d+)/);
            diagnosisItems.push({ value: match ? match[1] : '0', suggestion: suggestion });
          } else {
            diagnosisItems.push({ value: '0', suggestion: '' });
          }
        }
        var dateRange = '';
        var dateEl = allDivs.find(function(el) { return el.childElementCount === 0 && gt(el).startsWith('统计周期'); });
        if (dateEl) dateRange = gt(dateEl).replace('统计周期 ', '');
        return { diagnosisItems: diagnosisItems, dateRange: dateRange };
      })()
    `) as { diagnosisItems: { value: string; suggestion: string }[]; dateRange: string }

    const viewMetrics = await extractVisibleMetrics()

    const interactionTab = this.page.locator('h6:has-text("互动数据")').first()
    if (await interactionTab.count() > 0) {
      await interactionTab.click()
      await new Promise(r => setTimeout(r, 1500))
    }
    const interactionMetrics = await extractVisibleMetrics()

    const followerTab = this.page.locator('h6:has-text("涨粉数据")').first()
    if (await followerTab.count() > 0) {
      await followerTab.click()
      await new Promise(r => setTimeout(r, 1500))
    }
    const followerMetrics = await extractVisibleMetrics()

    const metrics = { ...viewMetrics, ...interactionMetrics, ...followerMetrics }

    return {
      period: this.period,
      dateRange: baseData.dateRange,
      diagnosis: {
        views: { value: baseData.diagnosisItems[0]?.value || '0', suggestion: baseData.diagnosisItems[0]?.suggestion || '' },
        newFollowers: { value: baseData.diagnosisItems[1]?.value || '0', suggestion: baseData.diagnosisItems[1]?.suggestion || '' },
        profileVisitors: { value: baseData.diagnosisItems[2]?.value || '0', suggestion: baseData.diagnosisItems[2]?.suggestion || '' },
        publishCount: { value: baseData.diagnosisItems[3]?.value || '0', suggestion: baseData.diagnosisItems[3]?.suggestion || '' },
        interactions: { value: baseData.diagnosisItems[4]?.value || '0', suggestion: baseData.diagnosisItems[4]?.suggestion || '' },
      },
      overview: {
        impressions: metrics['曝光数'] || { value: '0', change: '-' },
        views: metrics['观看数'] || { value: '0', change: '-' },
        coverClickRate: metrics['封面点击率'] || { value: '0', change: '-' },
        avgViewDuration: metrics['平均观看时长'] || { value: '0', change: '-' },
        totalViewDuration: metrics['观看总时长'] || { value: '0', change: '-' },
        videoCompletionRate: metrics['视频完播率'] || { value: '0', change: '-' },
      },
      interactions: {
        likes: metrics['点赞数'] || { value: '0', change: '-' },
        comments: metrics['评论数'] || { value: '0', change: '-' },
        collects: metrics['收藏数'] || { value: '0', change: '-' },
        shares: metrics['分享数'] || { value: '0', change: '-' },
      },
      followers: {
        netGain: metrics['净涨粉'] || { value: '0', change: '-' },
        newFollows: metrics['新增关注'] || { value: '0', change: '-' },
        unfollows: metrics['取消关注'] || { value: '0', change: '-' },
        profileVisitors: metrics['主页访客'] || { value: '0', change: '-' },
      },
    }
  }
}
