import { FansAnalyticsInterceptor } from '../fansAnalyticsInterceptor'
import { EventEmitter } from 'events'

function createMockPage() {
  const emitter = new EventEmitter()
  const page = {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => emitter.removeListener(event, handler),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue({
      overview: { totalFans: '0', newFans: '0', lostFans: '0' },
      portrait: null,
      activeFans: [],
    }),
    locator: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0), click: jest.fn() }),
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

describe('FansAnalyticsInterceptor', () => {
  describe('matchUrl', () => {
    it('should match fans analytics API URLs', () => {
      const { page } = createMockPage()
      const interceptor = new FansAnalyticsInterceptor(page as any)

      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/galaxy/creator/data/fans')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/gaia/creator/data/fans')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/galaxy/creator/fans')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/feed')).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should return empty fans data when no data', () => {
      const { page } = createMockPage()
      const interceptor = new FansAnalyticsInterceptor(page as any, '7days')

      const result = interceptor.parseResponse({ success: true })
      expect(result.period).toBe('7days')
      expect(result.overview.totalFans).toBe('0')
      expect(result.portrait).toBeNull()
      expect(result.activeFans).toEqual([])
    })

    it('should use provided period', () => {
      const { page } = createMockPage()
      const interceptor = new FansAnalyticsInterceptor(page as any, '30days')

      const result = interceptor.parseResponse({ data: {} })
      expect(result.period).toBe('30days')
    })
  })

  describe('intercept', () => {
    it('should fall back to DOM on timeout', async () => {
      const { page } = createMockPage()
      const interceptor = new FansAnalyticsInterceptor(page as any, '7days', 200)

      const result = await interceptor.intercept(async () => {})

      expect(result.success).toBe(true)
      expect(result.source).toBe('dom')
    })
  })
})
