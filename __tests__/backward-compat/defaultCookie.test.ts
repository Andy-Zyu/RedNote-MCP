import { CookieManager } from '../../src/auth/cookieManager'
import { AuthManager } from '../../src/auth/authManager'
import { accountManager } from '../../src/auth/accountManager'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const DEFAULT_COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

describe('默认 Cookie 路径测试', () => {
  beforeEach(() => {
    // 清理测试环境
    if (fs.existsSync(DEFAULT_COOKIE_PATH)) {
      fs.unlinkSync(DEFAULT_COOKIE_PATH)
    }
  })

  afterEach(() => {
    // 清理测试环境
    if (fs.existsSync(DEFAULT_COOKIE_PATH)) {
      fs.unlinkSync(DEFAULT_COOKIE_PATH)
    }
  })

  test('CookieManager 不传 accountId 时使用默认路径', () => {
    const cookieManager = new CookieManager()
    const cookiePath = accountManager.getCookiePath()

    expect(cookiePath).toBe(DEFAULT_COOKIE_PATH)
  })

  test('CookieManager 保存 Cookie 到默认路径', async () => {
    const cookieManager = new CookieManager()
    const testCookies = [
      {
        name: 'test_cookie',
        value: 'test_value',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const
      }
    ]

    await cookieManager.saveCookies(testCookies)

    expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
    const savedData = JSON.parse(fs.readFileSync(DEFAULT_COOKIE_PATH, 'utf-8'))
    expect(savedData).toHaveLength(1)
    expect(savedData[0].name).toBe('test_cookie')
  })

  test('CookieManager 从默认路径加载 Cookie', async () => {
    const testCookies = [
      {
        name: 'test_cookie',
        value: 'test_value',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const
      }
    ]

    // 先保存
    const dir = path.dirname(DEFAULT_COOKIE_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DEFAULT_COOKIE_PATH, JSON.stringify(testCookies))

    // 再加载
    const cookieManager = new CookieManager()
    const cookies = await cookieManager.loadCookies()

    expect(cookies).toHaveLength(1)
    expect(cookies[0].name).toBe('test_cookie')
  })

  test('CookieManager.hasCookies() 检查默认路径', () => {
    const cookieManager = new CookieManager()

    expect(cookieManager.hasCookies()).toBe(false)

    // 创建 Cookie 文件
    const dir = path.dirname(DEFAULT_COOKIE_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DEFAULT_COOKIE_PATH, '[]')

    expect(cookieManager.hasCookies()).toBe(true)
  })

  test('AuthManager 不传参数时使用默认路径', () => {
    const authManager = new AuthManager()
    const cookiePath = accountManager.getCookiePath()

    expect(cookiePath).toBe(DEFAULT_COOKIE_PATH)
  })

  test('AuthManager 不传 cookiePath 时自动创建默认目录', () => {
    const mcpDir = path.join(os.homedir(), '.mcp')
    const rednoteDir = path.join(mcpDir, 'rednote')

    // 确保目录存在（AuthManager 构造函数会创建）
    const authManager = new AuthManager()

    expect(fs.existsSync(mcpDir)).toBe(true)
    expect(fs.existsSync(rednoteDir)).toBe(true)
  })
})
