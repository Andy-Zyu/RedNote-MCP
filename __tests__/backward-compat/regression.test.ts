import { CookieManager } from '../../src/auth/cookieManager'
import { AuthManager } from '../../src/auth/authManager'
import { BrowserManager } from '../../src/browser/browserManager'
import { RedNoteTools } from '../../src/tools/rednoteTools'
import { accountManager } from '../../src/auth/accountManager'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const DEFAULT_COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

/**
 * 回归测试套件
 * 确保多账号功能不会破坏现有的单账号使用方式
 */
describe('向后兼容性回归测试', () => {
  beforeEach(() => {
    if (fs.existsSync(DEFAULT_COOKIE_PATH)) {
      fs.unlinkSync(DEFAULT_COOKIE_PATH)
    }
  })

  afterEach(() => {
    if (fs.existsSync(DEFAULT_COOKIE_PATH)) {
      fs.unlinkSync(DEFAULT_COOKIE_PATH)
    }
  })

  describe('场景1: 旧用户从未使用过多账号功能', () => {
    test('直接使用 CookieManager 不传参数', async () => {
      const cm = new CookieManager()
      const testCookies = [
        {
          name: 'test',
          value: 'value',
          domain: '.xiaohongshu.com',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const
        }
      ]

      await cm.saveCookies(testCookies)
      const loaded = await cm.loadCookies()

      expect(loaded).toHaveLength(1)
      expect(loaded[0].name).toBe('test')
      expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
    })

    test('直接使用 BrowserManager.getInstance()', () => {
      const bm1 = BrowserManager.getInstance()
      const bm2 = BrowserManager.getInstance()

      expect(bm1).toBe(bm2)
    })

    test('直接使用 RedNoteTools 不传 accountId', () => {
      const tools = new RedNoteTools()
      expect(tools).toBeDefined()
    })
  })

  describe('场景2: 旧代码示例仍然有效', () => {
    test('示例代码: 基本登录流程', async () => {
      // 这是文档中的示例代码
      const auth = new AuthManager()
      // 实际登录会打开浏览器，这里只测试 API 兼容性
      expect(auth).toBeDefined()
      expect(typeof auth.login).toBe('function')
    })

    test('示例代码: Cookie 管理', async () => {
      const cm = new CookieManager()
      const cookies = await cm.loadCookies()
      expect(Array.isArray(cookies)).toBe(true)
    })

    test('示例代码: 浏览器管理', () => {
      const bm = BrowserManager.getInstance()
      expect(bm).toBeDefined()
      expect(typeof bm.acquirePage).toBe('function')
    })
  })

  describe('场景3: API 签名保持不变', () => {
    test('CookieManager 构造函数接受可选参数', () => {
      expect(() => new CookieManager()).not.toThrow()
      expect(() => new CookieManager(undefined)).not.toThrow()
      expect(() => new CookieManager('/custom/path')).not.toThrow()
    })

    test('AuthManager 构造函数接受可选参数', () => {
      expect(() => new AuthManager()).not.toThrow()
      expect(() => new AuthManager(undefined)).not.toThrow()
      expect(() => new AuthManager('/custom/path')).not.toThrow()
    })

    test('BrowserManager.getInstance 接受可选参数', () => {
      expect(() => BrowserManager.getInstance()).not.toThrow()
      expect(() => BrowserManager.getInstance(undefined)).not.toThrow()
      expect(() => BrowserManager.getInstance('account1')).not.toThrow()
    })

    test('RedNoteTools 方法接受可选 accountId', () => {
      const tools = new RedNoteTools()

      // 验证方法签名
      expect(tools.searchNotes.length).toBeGreaterThanOrEqual(1) // keywords 必需
      expect(tools.getNoteContent.length).toBeGreaterThanOrEqual(1) // url 必需
    })
  })

  describe('场景4: 默认行为未改变', () => {
    test('不传 accountId 时使用 ~/.mcp/rednote/cookies.json', () => {
      const path1 = accountManager.getCookiePath()
      const path2 = accountManager.getCookiePath(undefined)

      expect(path1).toBe(DEFAULT_COOKIE_PATH)
      expect(path2).toBe(DEFAULT_COOKIE_PATH)
    })

    test('CookieManager 默认操作默认路径', async () => {
      const cm = new CookieManager()
      const testCookies = [
        {
          name: 'default_test',
          value: 'value',
          domain: '.xiaohongshu.com',
          path: '/',
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: 'Lax' as const
        }
      ]

      await cm.saveCookies(testCookies)

      // 验证保存到默认路径
      expect(fs.existsSync(DEFAULT_COOKIE_PATH)).toBe(true)
      const content = JSON.parse(fs.readFileSync(DEFAULT_COOKIE_PATH, 'utf-8'))
      expect(content[0].name).toBe('default_test')
    })

    test('BrowserManager 默认使用单例模式', () => {
      const instances = Array.from({ length: 10 }, () => BrowserManager.getInstance())
      const firstInstance = instances[0]

      instances.forEach(instance => {
        expect(instance).toBe(firstInstance)
      })
    })
  })

  describe('场景5: 错误处理保持一致', () => {
    test('加载不存在的 Cookie 返回空数组', async () => {
      const cm = new CookieManager()
      const cookies = await cm.loadCookies()

      expect(cookies).toEqual([])
    })

    test('hasCookies 正确检测文件不存在', () => {
      const cm = new CookieManager()
      expect(cm.hasCookies()).toBe(false)
    })

    test('clearCookies 不会因文件不存在而报错', async () => {
      const cm = new CookieManager()
      await expect(cm.clearCookies()).resolves.not.toThrow()
    })
  })

  describe('场景6: 多账号功能不影响默认行为', () => {
    test('创建账号后，默认路径仍然可用', async () => {
      // 创建一个账号
      const account = accountManager.createAccount('Test Account')

      // 默认路径仍然独立
      const defaultPath = accountManager.getCookiePath()
      const accountPath = accountManager.getCookiePath(account.id)

      expect(defaultPath).toBe(DEFAULT_COOKIE_PATH)
      expect(accountPath).not.toBe(DEFAULT_COOKIE_PATH)
      expect(accountPath).toContain(account.id)

      // 清理
      accountManager.deleteAccount(account.id)
    })

    test('使用账号功能后，不传 accountId 仍使用默认', () => {
      const account = accountManager.createAccount('Test Account')

      const bm1 = BrowserManager.getInstance()
      const bm2 = BrowserManager.getInstance(account.id)
      const bm3 = BrowserManager.getInstance()

      expect(bm1).toBe(bm3)
      expect(bm1).not.toBe(bm2)

      // 清理
      accountManager.deleteAccount(account.id)
    })
  })
})
