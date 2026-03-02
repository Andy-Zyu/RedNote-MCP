import { AuthManager } from '../../src/auth/authManager'
import { accountManager } from '../../src/auth/accountManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const DEFAULT_COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: jest.fn().mockResolvedValue({
        addCookies: jest.fn().mockResolvedValue(undefined),
        cookies: jest.fn().mockResolvedValue([
          {
            name: 'session',
            value: 'test_session',
            domain: '.xiaohongshu.com',
            path: '/',
            expires: -1,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax'
          }
        ]),
        close: jest.fn().mockResolvedValue(undefined),
        newPage: jest.fn().mockResolvedValue({
          goto: jest.fn().mockResolvedValue(undefined),
          $: jest.fn().mockResolvedValue(null),
          waitForSelector: jest.fn().mockResolvedValue(undefined),
          evaluate: jest.fn().mockResolvedValue(true),
          close: jest.fn().mockResolvedValue(undefined)
        })
      }),
      close: jest.fn().mockResolvedValue(undefined)
    })
  }
}))

describe('登录流程默认行为测试', () => {
  beforeEach(() => {
    // 清理测试环境
    if (fs.existsSync(DEFAULT_COOKIE_PATH)) {
      fs.unlinkSync(DEFAULT_COOKIE_PATH)
    }
  })

  afterEach(async () => {
    // 清理测试环境
    if (fs.existsSync(DEFAULT_COOKIE_PATH)) {
      fs.unlinkSync(DEFAULT_COOKIE_PATH)
    }
  })

  test('AuthManager.login() 不传参数使用默认路径', async () => {
    const authManager = new AuthManager()

    await authManager.login({ timeout: 1 })
    await authManager.cleanup()

    // 验证 Cookie 保存到默认路径
    expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
  })

  test('AuthManager.login() 不传 options 使用默认配置', async () => {
    const authManager = new AuthManager()

    // 不传任何参数
    await authManager.login()
    await authManager.cleanup()

    expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
  })

  test('AuthManager 构造函数不传参数使用默认路径', () => {
    const authManager = new AuthManager()
    const cookiePath = accountManager.getCookiePath()

    expect(cookiePath).toBe(DEFAULT_COOKIE_PATH)
  })

  test('AuthManager 保存的 Cookie 可以被 CookieManager 读取', async () => {
    const authManager = new AuthManager()

    await authManager.login({ timeout: 1 })
    await authManager.cleanup()

    // 使用 accountManager 读取
    const cookies = await accountManager.getCookies()

    expect(cookies.length).toBeGreaterThan(0)
    expect(cookies[0].name).toBe('session')
  })

  test('旧代码模式：直接 new AuthManager() 然后 login()', async () => {
    // 模拟旧用户代码
    const auth = new AuthManager()
    await auth.login()
    await auth.cleanup()

    // 验证功能正常
    expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
  })

  test('旧代码模式：传入自定义 cookiePath（已弃用但不报错）', async () => {
    const customPath = path.join(os.tmpdir(), 'test-cookies.json')

    // cookiePath 参数已弃用，但为了向后兼容仍然接受
    // 实际会使用默认路径
    const auth = new AuthManager(customPath)
    await auth.login()
    await auth.cleanup()

    // 验证不会报错，但实际使用默认路径
    expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
  })
})
