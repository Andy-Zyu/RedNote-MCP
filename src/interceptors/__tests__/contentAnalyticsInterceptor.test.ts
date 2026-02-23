import { ContentAnalyticsInterceptor } from '../contentAnalyticsInterceptor'
import { EventEmitter } from 'events'

function createMockPage() {
  const emitter = new EventEmitter()
  const page = {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => emitter.removeListener(event, handler),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue({ notes: [], totalCount: 0 }),
  }
  return { page, emitter }
}

function createMockResponse(url: string, status: number, body: unknown) {
  return {
    url: () => url,
    status: () => status,
    json: () => Promise.resolve(body),
  }
}

describe('ContentAnalyticsInterceptor', () => {
  describe('matchUrl', () => {
    it('should match content analytics API URLs', () => {
      const { page } = createMockPage()
      const interceptor = new ContentAnalyticsInterceptor(page as any)

      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/galaxy/creator/data/note_list')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/gaia/creator/data/note_list')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/galaxy/creator/note/list')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/feed')).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should return empty analytics when no data', () => {
      const { page } = createMockPage()
      const interceptor = new ContentAnalyticsInterceptor(page as any)

      const result = interceptor.parseResponse({ success: true })
      expect(result.notes).toEqual([])
      expect(result.totalCount).toBe(0)
    })

    it('should return empty analytics when data exists but API varies', () => {
      const { page } = createMockPage()
      const interceptor = new ContentAnalyticsInterceptor(page as any)

      const result = interceptor.parseResponse({ data: { note_list: [] } })
      expect(result.notes).toEqual([])
      expect(result.totalCount).toBe(0)
    })
  })

  describe('intercept', () => {
    it('should fall back to DOM on timeout', async () => {
      const { page } = createMockPage()
      const interceptor = new ContentAnalyticsInterceptor(page as any, 200)

      const result = await interceptor.intercept(async () => {})

      expect(result.success).toBe(true)
      expect(result.source).toBe('dom')
    })
  })
})
