import { NoteDetailInterceptor } from '../noteDetailInterceptor'
import { EventEmitter } from 'events'

function createMockPage() {
  const emitter = new EventEmitter()
  const page = {
    on: (event: string, handler: (...args: unknown[]) => void) => emitter.on(event, handler),
    removeListener: (event: string, handler: (...args: unknown[]) => void) => emitter.removeListener(event, handler),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue({
      title: 'DOM标题', content: 'DOM内容', tags: [], imgs: [], videos: [],
      url: '', author: 'DOM作者', likes: 0, collects: 0, comments: 0,
    }),
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

describe('NoteDetailInterceptor', () => {
  describe('matchUrl', () => {
    it('should match feed API URL', () => {
      const { page } = createMockPage()
      const interceptor = new NoteDetailInterceptor(page as any, 'https://www.xiaohongshu.com/explore/note001')

      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/feed')).toBe(true)
      expect(interceptor.matchUrl('https://edith.xiaohongshu.com/api/sns/web/v1/search/notes')).toBe(false)
      expect(interceptor.matchUrl('https://google.com')).toBe(false)
    })
  })

  describe('parseResponse', () => {
    it('should parse valid feed API response', () => {
      const { page } = createMockPage()
      const noteUrl = 'https://www.xiaohongshu.com/explore/note001'
      const interceptor = new NoteDetailInterceptor(page as any, noteUrl)

      const apiResponse = {
        data: {
          items: [
            {
              note_card: {
                display_title: '测试笔记标题',
                desc: '笔记正文内容',
                user: { nickname: '小红薯作者' },
                interact_info: {
                  liked_count: '256',
                  collected_count: '128',
                  comment_count: '64',
                },
                tag_list: [{ name: '美食' }, { name: '探店' }],
                image_list: [{ url_pre: 'https://img.xhs.com/1.jpg' }],
                video: { url: 'https://video.xhs.com/v1.mp4' },
              },
            },
          ],
        },
      }

      const detail = interceptor.parseResponse(apiResponse)

      expect(detail.title).toBe('测试笔记标题')
      expect(detail.content).toBe('笔记正文内容')
      expect(detail.author).toBe('小红薯作者')
      expect(detail.url).toBe(noteUrl)
      expect(detail.likes).toBe(256)
      expect(detail.collects).toBe(128)
      expect(detail.comments).toBe(64)
      expect(detail.tags).toEqual(['美食', '探店'])
      expect(detail.imgs).toEqual(['https://img.xhs.com/1.jpg'])
      expect(detail.videos).toEqual(['https://video.xhs.com/v1.mp4'])
    })

    it('should handle empty items', () => {
      const { page } = createMockPage()
      const noteUrl = 'https://www.xiaohongshu.com/explore/note001'
      const interceptor = new NoteDetailInterceptor(page as any, noteUrl)

      const detail = interceptor.parseResponse({ data: { items: [] } })

      expect(detail.title).toBe('')
      expect(detail.url).toBe(noteUrl)
    })

    it('should handle missing fields gracefully', () => {
      const { page } = createMockPage()
      const interceptor = new NoteDetailInterceptor(page as any, 'url')

      const detail = interceptor.parseResponse({
        data: { items: [{ note_card: {} }] },
      })

      expect(detail.title).toBe('')
      expect(detail.author).toBe('')
      expect(detail.likes).toBe(0)
      expect(detail.tags).toEqual([])
      expect(detail.imgs).toBeUndefined()
      expect(detail.videos).toBeUndefined()
    })
  })

  describe('intercept', () => {
    it('should resolve with API data when response matches', async () => {
      const { page, emitter } = createMockPage()
      const interceptor = new NoteDetailInterceptor(page as any, 'https://www.xiaohongshu.com/explore/n1')

      const resultPromise = interceptor.intercept(async () => {
        emitter.emit(
          'response',
          createMockResponse('https://edith.xiaohongshu.com/api/sns/web/v1/feed', 200, {
            data: {
              items: [{
                note_card: {
                  display_title: 'API笔记',
                  desc: '内容',
                  user: { nickname: '作者' },
                  interact_info: { liked_count: '10', collected_count: '5', comment_count: '2' },
                  tag_list: [],
                  image_list: [],
                },
              }],
            },
          })
        )
      })

      const result = await resultPromise
      expect(result.success).toBe(true)
      expect(result.source).toBe('api')
      expect(result.data!.title).toBe('API笔记')
    })

    it('should fall back to DOM on timeout', async () => {
      const { page } = createMockPage()
      const interceptor = new NoteDetailInterceptor(page as any, 'url', 200)

      const result = await interceptor.intercept(async () => {})

      expect(result.success).toBe(true)
      expect(result.source).toBe('dom')
    })
  })
})
