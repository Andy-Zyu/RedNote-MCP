import { RedNoteTools } from '../../src/tools/rednoteTools'
import { BrowserManager } from '../../src/browser/browserManager'
import { accountManager } from '../../src/auth/accountManager'
import * as path from 'path'
import * as os from 'os'

const DEFAULT_COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

// Mock BrowserManager 以避免实际启动浏览器
jest.mock('../../src/browser/browserManager')

describe('工具默认行为测试', () => {
  let redNoteTools: RedNoteTools
  let mockAcquirePage: jest.Mock
  let mockRelease: jest.Mock

  beforeEach(() => {
    redNoteTools = new RedNoteTools()

    // Mock page lease
    mockRelease = jest.fn().mockResolvedValue(undefined)
    mockAcquirePage = jest.fn().mockResolvedValue({
      page: {
        goto: jest.fn().mockResolvedValue(undefined),
        url: jest.fn().mockReturnValue('https://www.xiaohongshu.com'),
        isClosed: jest.fn().mockReturnValue(false),
        close: jest.fn().mockResolvedValue(undefined)
      },
      release: mockRelease
    })

    // Mock BrowserManager.getInstance
    const mockBrowserManager = {
      acquirePage: mockAcquirePage,
      shutdown: jest.fn().mockResolvedValue(undefined)
    }

    ;(BrowserManager.getInstance as jest.Mock).mockReturnValue(mockBrowserManager)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  test('searchNotes 不传 accountId 时使用默认实例', async () => {
    // 模拟搜索拦截器
    jest.spyOn(require('../../src/interceptors/searchInterceptor'), 'SearchInterceptor')
      .mockImplementation(() => ({
        intercept: jest.fn().mockResolvedValue({
          success: true,
          data: [],
          source: 'test'
        })
      }))

    await redNoteTools.searchNotes('test')

    // 验证调用了 BrowserManager.getInstance() 不带参数
    expect(BrowserManager.getInstance).toHaveBeenCalledWith()
    expect(mockAcquirePage).toHaveBeenCalledWith(undefined)
  })

  test('getNoteContent 不传 accountId 时使用默认实例', async () => {
    // 模拟笔记详情拦截器
    jest.spyOn(require('../../src/interceptors/noteDetailInterceptor'), 'NoteDetailInterceptor')
      .mockImplementation(() => ({
        intercept: jest.fn().mockResolvedValue({
          success: true,
          data: {
            title: 'Test Note',
            content: 'Test Content',
            author: 'Test Author',
            likes: 0,
            collects: 0,
            comments: 0,
            shares: 0
          },
          source: 'test'
        })
      }))

    await redNoteTools.getNoteContent('https://www.xiaohongshu.com/explore/123')

    expect(BrowserManager.getInstance).toHaveBeenCalledWith()
    expect(mockAcquirePage).toHaveBeenCalledWith(undefined)
  })

  test('工具方法正确释放页面资源', async () => {
    jest.spyOn(require('../../src/interceptors/searchInterceptor'), 'SearchInterceptor')
      .mockImplementation(() => ({
        intercept: jest.fn().mockResolvedValue({
          success: true,
          data: [],
          source: 'test'
        })
      }))

    await redNoteTools.searchNotes('test')

    // 验证 release 被调用
    expect(mockRelease).toHaveBeenCalled()
  })

  test('工具方法出错时仍然释放资源', async () => {
    jest.spyOn(require('../../src/interceptors/searchInterceptor'), 'SearchInterceptor')
      .mockImplementation(() => ({
        intercept: jest.fn().mockRejectedValue(new Error('Test error'))
      }))

    await expect(redNoteTools.searchNotes('test')).rejects.toThrow('Test error')

    // 验证即使出错也调用了 release
    expect(mockRelease).toHaveBeenCalled()
  })

  test('accountManager.getCookiePath() 不传参数返回默认路径', () => {
    const cookiePath = accountManager.getCookiePath()
    expect(cookiePath).toBe(DEFAULT_COOKIE_PATH)
  })

  test('accountManager.getCookiePath(undefined) 返回默认路径', () => {
    const cookiePath = accountManager.getCookiePath(undefined)
    expect(cookiePath).toBe(DEFAULT_COOKIE_PATH)
  })
})
