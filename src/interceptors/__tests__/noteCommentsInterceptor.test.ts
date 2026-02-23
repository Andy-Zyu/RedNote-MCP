import { NoteCommentsInterceptor } from '../noteCommentsInterceptor'
import { EventEmitter } from 'events'

function createMockPage() {
  const emitter = new EventEmitter()
  const page = {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => emitter.removeListener(event, handler),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue([]),
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

describe('NoteCommentsInterceptor', () => {
  describe('matchUrl', () => {
    it('should match comment page API URLs', () => {
      const { page } = createMockPage()
      const interceptor = new NoteCommentsInterceptor(page as any)

      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v2/comment/page')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/comment/page')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/feed')).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should parse valid comments API response', () => {
      const { page } = createMockPage()
      const interceptor = new NoteCommentsInterceptor(page as any)

      const apiResponse = {
        data: {
          comments: [
            {
              user_info: { nickname: '评论者A' },
              content: '写得真好！',
              like_count: '42',
              create_time: '2024-01-15',
            },
            {
              user_info: { nickname: '评论者B' },
              content: '收藏了',
              like_count: '8',
              create_time: '2024-01-16',
            },
          ],
        },
      }

      const comments = interceptor.parseResponse(apiResponse)

      expect(comments).toHaveLength(2)
      expect(comments[0].author).toBe('评论者A')
      expect(comments[0].content).toBe('写得真好！')
      expect(comments[0].likes).toBe(42)
      expect(comments[0].time).toBe('2024-01-15')
      expect(comments[1].author).toBe('评论者B')
    })

    it('should handle empty comments', () => {
      const { page } = createMockPage()
      const interceptor = new NoteCommentsInterceptor(page as any)

      const comments = interceptor.parseResponse({ data: { comments: [] } })
      expect(comments).toHaveLength(0)
    })

    it('should handle missing fields gracefully', () => {
      const { page } = createMockPage()
      const interceptor = new NoteCommentsInterceptor(page as any)

      const comments = interceptor.parseResponse({
        data: { comments: [{ user_info: {}, content: '', like_count: '', create_time: '' }] },
      })

      expect(comments).toHaveLength(1)
      expect(comments[0].author).toBe('')
      expect(comments[0].likes).toBe(0)
    })
  })

  describe('intercept', () => {
    it('should resolve with API data when response matches', async () => {
      const { page, emitter } = createMockPage()
      const interceptor = new NoteCommentsInterceptor(page as any)

      const resultPromise = interceptor.intercept(async () => {
        emitter.emit(
          'response',
          createMockResponse('https://edith.xiaohongshu.com/api/sns/web/v2/comment/page', 200, {
            data: {
              comments: [{
                user_info: { nickname: '用户' },
                content: '好文',
                like_count: '5',
                create_time: '2024-01-01',
              }],
            },
          })
        )
      })

      const result = await resultPromise
      expect(result.success).toBe(true)
      expect(result.source).toBe('api')
      expect(result.data).toHaveLength(1)
      expect(result.data![0].content).toBe('好文')
    })

    it('should fall back to DOM on timeout', async () => {
      const { page } = createMockPage()
      const interceptor = new NoteCommentsInterceptor(page as any, 200)

      const result = await interceptor.intercept(async () => {})

      expect(result.success).toBe(true)
      expect(result.source).toBe('dom')
    })
  })
})
