import { SearchInterceptor } from '../searchInterceptor'
import { EventEmitter } from 'events'

// Mock Page that emits 'response' events
function createMockPage() {
  const emitter = new EventEmitter()
  const page = {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => emitter.removeListener(event, handler),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue([]),
    $$: jest.fn().mockResolvedValue([]),
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

describe('SearchInterceptor', () => {
  describe('matchUrl', () => {
    it('should match xiaohongshu search API URL', () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10)

      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/search/notes?keyword=test')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/search/onebox')).toBe(false)
      expect(interceptor.matchUrl('https://www.xiaohongshu.com/api/sns/web/v1/search/notes')).toBe(true)
      expect(interceptor.matchUrl('https://www.xiaohongshu.com/api/sns/web/v1/feed')).toBe(false)
      expect(interceptor.matchUrl('https://google.com')).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should parse valid search API response', () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 5)

      const apiResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'abc123',
              xsec_token: 'ABCtoken123=',
              xsec_source: 'pc_search',
              note_card: {
                display_title: '测试标题',
                desc: '测试内容描述',
                note_id: 'note001',
                user: { nickname: '测试作者', user_id: 'user001' },
                interact_info: {
                  liked_count: '128',
                  collected_count: '56',
                  comment_count: '23',
                },
                tag_list: [{ name: '旅行' }, { name: '攻略' }],
              },
            },
            {
              id: 'def456',
              note_card: {
                title: '第二篇笔记',
                desc: '',
                note_id: 'note002',
                user: { nickname: '另一个作者' },
                interact_info: {
                  liked_count: '50',
                  collected_count: '10',
                  comment_count: '5',
                },
                tag_list: [],
              },
            },
          ],
        },
      }

      const notes = interceptor.parseResponse(apiResponse)

      expect(notes).toHaveLength(2)

      // First note
      expect(notes[0].title).toBe('测试标题')
      expect(notes[0].content).toBe('测试内容描述')
      expect(notes[0].author).toBe('测试作者')
      expect(notes[0].url).toBe('https://www.xiaohongshu.com/explore/note001?xsec_token=ABCtoken123%3D&xsec_source=pc_search')
      expect(notes[0].likes).toBe(128)
      expect(notes[0].collects).toBe(56)
      expect(notes[0].comments).toBe(23)
      expect(notes[0].tags).toEqual(['旅行', '攻略'])

      // Second note - uses title fallback, no display_title
      expect(notes[1].title).toBe('第二篇笔记')
      expect(notes[1].author).toBe('另一个作者')
      expect(notes[1].url).toBe('https://www.xiaohongshu.com/explore/note002')
    })

    it('should respect limit', () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 1)

      const apiResponse = {
        success: true,
        data: {
          items: [
            { id: '1', note_card: { title: 'A', user: {}, interact_info: {}, tag_list: [] } },
            { id: '2', note_card: { title: 'B', user: {}, interact_info: {}, tag_list: [] } },
          ],
        },
      }

      const notes = interceptor.parseResponse(apiResponse)
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('A')
    })

    it('should handle missing fields gracefully', () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10)

      const apiResponse = {
        success: true,
        data: {
          items: [
            { id: 'xyz', note_card: {} },
          ],
        },
      }

      const notes = interceptor.parseResponse(apiResponse)
      expect(notes).toHaveLength(1)
      expect(notes[0].title).toBe('')
      expect(notes[0].author).toBe('')
      expect(notes[0].likes).toBe(0)
      expect(notes[0].tags).toEqual([])
      // No xsec_token — URL should not have query params
      expect(notes[0].url).toBe('https://www.xiaohongshu.com/explore/xyz')
    })

    it('should include xsec_token in URL when present', () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10)

      const apiResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'n1',
              xsec_token: 'tok=',
              xsec_source: 'pc_search',
              note_card: { note_id: 'n1', user: {}, interact_info: {}, tag_list: [] },
            },
            {
              id: 'n2',
              note_card: { note_id: 'n2', user: {}, interact_info: {}, tag_list: [] },
            },
          ],
        },
      }

      const notes = interceptor.parseResponse(apiResponse)
      expect(notes[0].url).toBe('https://www.xiaohongshu.com/explore/n1?xsec_token=tok%3D&xsec_source=pc_search')
      expect(notes[1].url).toBe('https://www.xiaohongshu.com/explore/n2')
    })
  })

  describe('intercept', () => {
    it('should resolve with API data when response matches', async () => {
      const { page, emitter } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10)

      const apiResponse = {
        success: true,
        data: {
          items: [
            {
              id: '1',
              note_card: {
                display_title: 'API结果',
                desc: '内容',
                note_id: 'n1',
                user: { nickname: '作者' },
                interact_info: { liked_count: '10', collected_count: '5', comment_count: '2' },
                tag_list: [],
              },
            },
          ],
        },
      }

      const resultPromise = interceptor.intercept(async () => {
        // Simulate API response after navigation
        emitter.emit(
          'response',
          createMockResponse('https://edith.xiaohongshu.com/api/sns/web/v1/search/notes?keyword=test', 200, apiResponse)
        )
      })

      const result = await resultPromise

      expect(result.success).toBe(true)
      expect(result.source).toBe('api')
      expect(result.data).toHaveLength(1)
      expect(result.data![0].title).toBe('API结果')
    })

    it('should ignore non-matching URLs', async () => {
      const { page, emitter } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10, 500) // 500ms timeout

      const resultPromise = interceptor.intercept(async () => {
        // Emit a non-matching response
        emitter.emit(
          'response',
          createMockResponse('https://www.xiaohongshu.com/api/sns/web/v1/feed', 200, { data: {} })
        )
      })

      const result = await resultPromise

      // Should fall back to DOM since no matching URL
      expect(result.source).toBe('dom')
    })

    it('should ignore non-200 responses', async () => {
      const { page, emitter } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10, 500)

      const resultPromise = interceptor.intercept(async () => {
        emitter.emit(
          'response',
          createMockResponse('https://edith.xiaohongshu.com/api/sns/web/v1/search/notes', 403, {})
        )
      })

      const result = await resultPromise
      expect(result.source).toBe('dom')
    })

    it('should fall back to DOM on timeout', async () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10, 200) // 200ms timeout

      const result = await interceptor.intercept(async () => {
        // Don't emit any response — let it timeout
      })

      expect(result.success).toBe(true)
      expect(result.source).toBe('dom')
    })

    it('should handle triggerAction failure', async () => {
      const { page } = createMockPage()
      const interceptor = new SearchInterceptor(page as any, 'test', 10)

      const result = await interceptor.intercept(async () => {
        throw new Error('Navigation failed')
      })

      expect(result.success).toBe(false)
      expect(result.source).toBe('dom')
    })
  })
})
