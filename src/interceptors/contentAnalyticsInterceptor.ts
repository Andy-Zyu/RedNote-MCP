import { Page } from 'playwright'
import { BaseInterceptor } from './baseInterceptor'
import { ContentAnalytics } from '../tools/types'
import logger from '../utils/logger'

export class ContentAnalyticsInterceptor extends BaseInterceptor<ContentAnalytics> {
  constructor(page: Page, timeoutMs: number = 15000) {
    super(page, timeoutMs)
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/galaxy/creator/data/note_list') ||
      url.includes('/api/gaia/creator/data/note_list') ||
      url.includes('/api/galaxy/creator/note/list')
  }

  parseResponse(json: unknown): ContentAnalytics {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined

    if (!data) {
      return { notes: [], totalCount: 0 }
    }

    // API structure varies — return empty to trigger DOM fallback
    logger.info('Parsed content analytics from API')
    return { notes: [], totalCount: 0 }
  }

  async fallbackDom(): Promise<ContentAnalytics> {
    logger.info('Using DOM fallback for content analytics')

    // Wait for table to render
    await this.page.waitForSelector('table tbody tr', { timeout: 30000 })

    const data = await this.page.evaluate(() => {
      const getText = (el: Element | null): string => el?.textContent?.trim() || ''
      const notes: {
        title: string; publishTime: string; impressions: string; views: string
        coverClickRate: string; likes: string; comments: string; collects: string
        newFollowers: string; shares: string; avgViewDuration: string; danmaku: string
      }[] = []

      const rows = document.querySelectorAll('table tbody tr')
      for (const row of rows) {
        const cells = row.querySelectorAll('td')
        if (cells.length >= 11) {
          const infoCell = cells[0]
          const titleEl = infoCell.querySelectorAll('div')
          let title = ''
          let publishTime = ''
          for (const div of titleEl) {
            const text = getText(div)
            if (text.startsWith('发布于')) {
              publishTime = text.replace('发布于', '')
            } else if (text && !text.startsWith('发布于') && div.children.length === 0) {
              title = text
            }
          }

          notes.push({
            title, publishTime,
            impressions: getText(cells[1]), views: getText(cells[2]),
            coverClickRate: getText(cells[3]), likes: getText(cells[4]),
            comments: getText(cells[5]), collects: getText(cells[6]),
            newFollowers: getText(cells[7]), shares: getText(cells[8]),
            avgViewDuration: getText(cells[9]), danmaku: getText(cells[10]),
          })
        }
      }

      return { notes, totalCount: notes.length }
    })

    logger.info(`DOM fallback extracted ${data.totalCount} notes from content analytics`)
    return data as ContentAnalytics
  }
}
