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

    const data = await this.page.evaluate(`
      (() => {
        const notes = [];
        const rows = document.querySelectorAll('table tbody tr');
        for (const row of rows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 11) {
            const infoCell = cells[0];
            const titleEl = infoCell.querySelectorAll('div');
            let title = '';
            let publishTime = '';
            for (const div of titleEl) {
              const text = (div.textContent || '').trim();
              if (text.startsWith('发布于')) {
                publishTime = text.replace('发布于', '');
              } else if (text && !text.startsWith('发布于') && div.children.length === 0) {
                title = text;
              }
            }
            const gt = (el) => (el ? (el.textContent || '').trim() : '');
            notes.push({
              title, publishTime,
              impressions: gt(cells[1]), views: gt(cells[2]),
              coverClickRate: gt(cells[3]), likes: gt(cells[4]),
              comments: gt(cells[5]), collects: gt(cells[6]),
              newFollowers: gt(cells[7]), shares: gt(cells[8]),
              avgViewDuration: gt(cells[9]), danmaku: gt(cells[10]),
            });
          }
        }
        return { notes, totalCount: notes.length };
      })()
    `) as ContentAnalytics

    logger.info(`DOM fallback extracted ${data.totalCount} notes from content analytics`)
    return data as ContentAnalytics
  }
}
