import { Page, Response } from 'playwright'
import { BaseInterceptor } from './baseInterceptor'
import { Note } from '../tools/types'
import logger from '../utils/logger'

export class SearchInterceptor extends BaseInterceptor<Note[]> {
  private readonly keywords: string
  private readonly limit: number

  constructor(page: Page, keywords: string, limit: number, timeoutMs: number = 15000) {
    super(page, timeoutMs)
    this.keywords = keywords
    this.limit = limit
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/sns/web/v1/search/notes')
  }

  matchResponse(response: Response): boolean {
    // The search API is a POST request with keyword in the JSON body.
    // Verify the request carries the correct keyword to avoid capturing
    // unrelated responses (e.g. recommendations or preloaded results).
    try {
      const postData = response.request().postData()
      if (postData) {
        const body = JSON.parse(postData)
        if (body.keyword && body.keyword !== this.keywords) {
          logger.debug(`Skipping search response with mismatched keyword: "${body.keyword}" (expected "${this.keywords}")`)
          return false
        }
      }
    } catch {
      // Not JSON or no post data — also check URL query params as fallback
      try {
        const u = new URL(response.url())
        const keyword = u.searchParams.get('keyword')
        if (keyword && keyword !== this.keywords) {
          logger.debug(`Skipping search response with mismatched URL keyword: "${keyword}" (expected "${this.keywords}")`)
          return false
        }
      } catch {
        // URL parsing failed — accept the response
      }
    }
    return true
  }

  parseResponse(json: unknown): Note[] {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined
    const items = (data?.items ?? []) as Array<Record<string, unknown>>

    const notes: Note[] = items.slice(0, this.limit).map((item) => {
      const noteCard = (item.note_card ?? {}) as Record<string, unknown>
      const user = (noteCard.user ?? {}) as Record<string, unknown>
      const interactInfo = (noteCard.interact_info ?? {}) as Record<string, unknown>
      const tagList = (noteCard.tag_list ?? []) as Array<Record<string, unknown>>

      const noteId = (noteCard.note_id as string) || (item.id as string) || ''
      const xsecToken = (item.xsec_token as string) || (noteCard.xsec_token as string) || ''
      const xsecSource = (item.xsec_source as string) || 'pc_search'

      let noteUrl = `https://www.xiaohongshu.com/explore/${noteId}`
      if (xsecToken) {
        noteUrl += `?xsec_token=${encodeURIComponent(xsecToken)}&xsec_source=${encodeURIComponent(xsecSource)}`
      }

      return {
        title: (noteCard.display_title as string) || (noteCard.title as string) || '',
        content: (noteCard.desc as string) || '',
        author: (user.nickname as string) || '',
        url: noteUrl,
        likes: parseInt((interactInfo.liked_count as string) || '0', 10),
        collects: parseInt((interactInfo.collected_count as string) || '0', 10),
        comments: parseInt((interactInfo.comment_count as string) || '0', 10),
        tags: tagList.map((t) => (t.name as string) || ''),
      }
    })

    logger.info(`Parsed ${notes.length} notes from API response`)
    return notes
  }

  async fallbackDom(): Promise<Note[]> {
    logger.info('Using DOM fallback for search results')

    await this.page.waitForSelector('.feeds-container', { timeout: 30000 })

    const notes = await this.page.evaluate((limit: number) => {
      const items = document.querySelectorAll('.feeds-container .note-item')
      const results: Note[] = []

      for (let i = 0; i < Math.min(items.length, limit); i++) {
        const item = items[i]
        const linkEl = item.querySelector('a.cover.mask.ld') as HTMLAnchorElement | null
        const titleEl = item.querySelector('.title span, .note-item-title, .title')
        const authorEl = item.querySelector('.author-wrapper .name, .author .name')

        const href = linkEl?.getAttribute('href') || ''
        const noteId = href.match(/\/explore\/([a-f0-9]+)/)?.[1] || ''

        results.push({
          title: titleEl?.textContent?.trim() || '',
          content: '',
          tags: [],
          url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '',
          author: authorEl?.textContent?.trim() || '',
        })
      }

      return results
    }, this.limit)

    logger.info(`DOM fallback extracted ${notes.length} notes`)
    return notes
  }
}
