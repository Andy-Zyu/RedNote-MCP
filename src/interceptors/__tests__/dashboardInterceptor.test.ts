import { DashboardInterceptor } from '../dashboardInterceptor'
import { EventEmitter } from 'events'

function createMockPage() {
  const emitter = new EventEmitter()
  const page = {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => emitter.removeListener(event, handler),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue({}),
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

describe('DashboardInterceptor', () => {
  describe('matchUrl', () => {
    it('should match dashboard API URLs', () => {
      const { page } = createMockPage()
      const interceptor = new DashboardInterceptor(page as any)

      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/galaxy/creator/data/overview')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/galaxy/creator/statistics')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/gaia/creator/data/overview')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/feed')).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should return empty dashboard when no data', () => {
      const { page } = createMockPage()
      const interceptor = new DashboardInterceptor(page as any, '7days')

      const result = interceptor.parseResponse({ success: true })

      expect(result.period).toBe('7days')
      expect(result.overview.impressions.value).toBe('0')
      expect(result.interactions.likes.value).toBe('0')
      expect(result.followers.netGain.value).toBe('0')
    })

    it('should use provided period', () => {
      const { page } = createMockPage()
      const interceptor = new DashboardInterceptor(page as any, '30days')

      const result = interceptor.parseResponse({ data: {} })
      expect(result.period).toBe('30days')
    })
  })

  describe('intercept', () => {
    it('should fall back to DOM on timeout', async () => {
      const { page } = createMockPage()
      // Mock DOM fallback dependencies
      page.waitForSelector = jest.fn().mockResolvedValue(null)
      page.evaluate = jest.fn()
        .mockResolvedValueOnce({ diagnosisItems: [], dateRange: '' })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})

      const interceptor = new DashboardInterceptor(page as any, '7days', 200)

      const result = await interceptor.intercept(async () => {})

      expect(result.source).toBe('dom')
    })
  })
})
