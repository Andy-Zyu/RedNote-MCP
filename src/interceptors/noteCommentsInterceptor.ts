import { Page } from 'playwright'
import { BaseInterceptor } from './baseInterceptor'
import { Comment } from '../tools/types'
import logger from '../utils/logger'

export class NoteCommentsInterceptor extends BaseInterceptor<Comment[]> {
  constructor(page: Page, timeoutMs: number = 15000) {
    super(page, timeoutMs)
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/sns/web/v2/comment/page') || url.includes('/api/sns/web/v1/comment/page')
  }

  parseResponse(json: unknown): Comment[] {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined
    const comments = (data?.comments ?? []) as Array<Record<string, unknown>>

    const results: Comment[] = comments.map((item) => {
      const userInfo = (item.user_info ?? {}) as Record<string, unknown>
      return {
        author: (userInfo.nickname as string) || '',
        content: (item.content as string) || '',
        likes: parseInt((item.like_count as string) || '0', 10),
        time: (item.create_time as string) || '',
      }
    })

    logger.info(`Parsed ${results.length} comments from API response`)
    return results
  }

  async fallbackDom(): Promise<Comment[]> {
    logger.info('Using DOM fallback for comments')

    await this.page.waitForSelector('[role="dialog"] [role="list"]', { timeout: 15000 })

    const comments = await this.page.evaluate(() => {
      const items = document.querySelectorAll('[role="dialog"] [role="list"] [role="listitem"]')
      const results: { author: string; content: string; likes: number; time: string }[] = []

      items.forEach((item) => {
        const author = item.querySelector('[data-testid="user-name"]')?.textContent?.trim() || ''
        const content = item.querySelector('[data-testid="comment-content"]')?.textContent?.trim() || ''
        const likes = parseInt(item.querySelector('[data-testid="likes-count"]')?.textContent || '0')
        const time = item.querySelector('time')?.textContent?.trim() || ''
        results.push({ author, content, likes, time })
      })

      return results
    })

    logger.info(`DOM fallback extracted ${comments.length} comments`)
    return comments
  }
}
