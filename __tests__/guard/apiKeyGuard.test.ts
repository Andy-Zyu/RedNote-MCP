/**
 * ApiKeyGuard 单元测试
 */
import { ApiKeyGuard } from '../../src/guard/apiKeyGuard'
import { ApiKeyVerifyResponse } from '../../src/types/apiKey'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'

// Mock fetch
global.fetch = jest.fn()

// Helper: 生成签名
function generateSignature(data: any, secret: string): string {
  const payload = JSON.stringify(data)
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard
  const mockApiKey = 'pb_live_test_key'
  const cacheDir = path.join(os.homedir(), '.mcp', 'rednote')
  const cachePath = path.join(cacheDir, 'api-key-cache.json')

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.PIGBUN_API_KEY = mockApiKey
    process.env.JWT_SECRET = 'test-secret-key'
    guard = new ApiKeyGuard()
  })

  afterEach(async () => {
    delete process.env.PIGBUN_API_KEY
    delete process.env.JWT_SECRET
    delete process.env.PIGBUN_SIGNATURE_SECRET
    // 清理缓存文件
    try {
      await fs.unlink(cachePath)
    } catch {}
  })

  describe('verifyAndGetConfig', () => {
    it('应该成功验证并返回配置（新格式 - 个人版）', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'free',
        rednote: {
          mode: 'personal',
          maxAccounts: 1,
        },
        usage: {
          today: 10,
          remaining: 40,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config).toEqual({
        tier: 'free',
        rednote: {
          mode: 'personal',
          maxAccounts: 1,
        },
        usage: {
          today: 10,
          remaining: 40,
        },
      })
    })

    it('应该成功验证并返回配置（新格式 - 矩阵版）', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('pro')
      expect(config.rednote.mode).toBe('matrix')
      expect(config.rednote.maxAccounts).toBe(10)
    })

    it('应该处理缺少签名和时间戳的响应（向后兼容）', async () => {
      const mockResponse: any = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 5,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        // 没有 signature 和 timestamp 字段
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      // 没有签名和时间戳时，应该正常返回配置
      expect(config.tier).toBe('pro')
      expect(config.rednote.mode).toBe('matrix')
      expect(config.rednote.maxAccounts).toBe(5)
    })

    it('应该使用内存缓存（5分钟内）', async () => {
      const mockResponse: ApiKeyVerifyResponse = {
        valid: true,
        tier: 'basic',
        features: {
          multiAccount: false,
          maxAccounts: 1,
          dailyLimit: 100,
          matrixServer: false,
        },
        usage: {
          today: 10,
          remaining: 90,
        },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      // 第一次调用
      await guard.verifyAndGetConfig('test_tool')

      // 第二次调用应该使用缓存
      const config = await guard.verifyAndGetConfig('test_tool')

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(config.tier).toBe('basic')
    })

    it('应该在网络故障时使用磁盘缓存', async () => {
      const mockConfig = {
        tier: 'pro',
        features: {
          multiAccount: true,
          maxAccounts: 5,
          dailyLimit: 1000,
          matrixServer: true,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp: Date.now(),
      }

      // 创建磁盘缓存
      await fs.mkdir(cacheDir, { recursive: true })
      await fs.writeFile(cachePath, JSON.stringify(mockConfig))

      // 模拟网络故障
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('pro')
    })

    it('应该在无缓存时降级到个人版', async () => {
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('free')
      expect(config.rednote.mode).toBe('personal')
      expect(config.rednote.maxAccounts).toBe(1)
    })

    it('应该在缓存过期后重新请求', async () => {
      const oldConfig = {
        tier: 'basic',
        features: {
          multiAccount: false,
          maxAccounts: 1,
          dailyLimit: 100,
          matrixServer: false,
        },
        usage: {
          today: 10,
          remaining: 90,
        },
        timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25小时前
      }

      await fs.mkdir(cacheDir, { recursive: true })
      await fs.writeFile(cachePath, JSON.stringify(oldConfig))

      const newResponse: ApiKeyVerifyResponse = {
        valid: true,
        tier: 'pro',
        features: {
          multiAccount: true,
          maxAccounts: 5,
          dailyLimit: 1000,
          matrixServer: true,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => newResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('pro')
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('签名验证', () => {
    it('应该验证正确的签名', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.rednote.mode).toBe('matrix')
    })

    it('应该在签名错误时降级到个人版', async () => {
      const timestamp = Date.now()
      const mockResponse: ApiKeyVerifyResponse = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
        signature: 'invalid-signature',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      // 签名验证失败，应该降级到个人版
      expect(config.tier).toBe('free')
      expect(config.rednote.mode).toBe('personal')
      expect(config.rednote.maxAccounts).toBe(1)
    })

    it('应该使用 PIGBUN_SIGNATURE_SECRET 优先于 JWT_SECRET', async () => {
      process.env.PIGBUN_SIGNATURE_SECRET = 'pigbun-secret'
      const newGuard = new ApiKeyGuard()

      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'pigbun-secret')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await newGuard.verifyAndGetConfig('test_tool')

      expect(config.rednote.mode).toBe('matrix')
    })
  })

  describe('时间戳验证', () => {
    it('应该接受有效的时间戳（5分钟内）', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.rednote.mode).toBe('matrix')
    })

    it('应该拒绝过期的时间戳（超过5分钟）', async () => {
      const timestamp = Date.now() - 6 * 60 * 1000 // 6分钟前
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      // 时间戳过期，应该降级到个人版
      expect(config.tier).toBe('free')
      expect(config.rednote.mode).toBe('personal')
    })

    it('应该拒绝未来的时间戳（超过5分钟）', async () => {
      const timestamp = Date.now() + 6 * 60 * 1000 // 6分钟后
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      // 时间戳无效，应该降级到个人版
      expect(config.tier).toBe('free')
      expect(config.rednote.mode).toBe('personal')
    })
  })

  describe('hasMatrixAccess', () => {
    it('应该在矩阵版时返回 true', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const hasAccess = await guard.hasMatrixAccess('test_tool')

      expect(hasAccess).toBe(true)
    })

    it('应该在个人版时返回 false', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'free',
        rednote: {
          mode: 'personal',
          maxAccounts: 1,
        },
        usage: {
          today: 10,
          remaining: 40,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const hasAccess = await guard.hasMatrixAccess('test_tool')

      expect(hasAccess).toBe(false)
    })
  })

  describe('getMode', () => {
    it('应该返回 matrix 模式', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const mode = await guard.getMode('test_tool')

      expect(mode).toBe('matrix')
    })

    it('应该返回 personal 模式', async () => {
      const timestamp = Date.now()
      const dataToSign = {
        valid: true,
        tier: 'free',
        rednote: {
          mode: 'personal',
          maxAccounts: 1,
        },
        usage: {
          today: 10,
          remaining: 40,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const mode = await guard.getMode('test_tool')

      expect(mode).toBe('personal')
    })
  })

  describe('降级策略', () => {
    it('应该在签名验证失败时降级', async () => {
      const timestamp = Date.now()
      const mockResponse: ApiKeyVerifyResponse = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
        signature: 'tampered-signature',
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('free')
      expect(config.rednote.mode).toBe('personal')
      expect(config.rednote.maxAccounts).toBe(1)
      expect(config.usage.remaining).toBe(50)
    })

    it('应该在时间戳验证失败时降级', async () => {
      const timestamp = Date.now() - 10 * 60 * 1000 // 10分钟前
      const dataToSign = {
        valid: true,
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp,
      }
      const signature = generateSignature(dataToSign, 'test-secret-key')

      const mockResponse: ApiKeyVerifyResponse = {
        ...dataToSign,
        signature,
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('free')
      expect(config.rednote.mode).toBe('personal')
    })

    it('应该在网络故障时使用磁盘缓存而不是降级', async () => {
      const mockConfig = {
        tier: 'pro',
        rednote: {
          mode: 'matrix',
          maxAccounts: 10,
        },
        usage: {
          today: 50,
          remaining: 950,
        },
        timestamp: Date.now(),
      }

      // 创建磁盘缓存
      await fs.mkdir(cacheDir, { recursive: true })
      await fs.writeFile(cachePath, JSON.stringify(mockConfig))

      // 模拟网络故障
      ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const config = await guard.verifyAndGetConfig('test_tool')

      expect(config.tier).toBe('pro')
      expect(config.rednote.mode).toBe('matrix')
    })
  })

  describe('getConfig', () => {
    it('应该返回缓存的配置', async () => {
      const mockResponse: ApiKeyVerifyResponse = {
        valid: true,
        tier: 'enterprise',
        features: {
          multiAccount: true,
          maxAccounts: 10,
          dailyLimit: 5000,
          matrixServer: true,
        },
        usage: {
          today: 100,
          remaining: 4900,
        },
      }

      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      await guard.verifyAndGetConfig('test_tool')
      const config = guard.getConfig()

      expect(config).not.toBeNull()
      expect(config?.tier).toBe('enterprise')
    })

    it('应该在未验证时返回 null', () => {
      const config = guard.getConfig()
      expect(config).toBeNull()
    })
  })

  describe('verify (向后兼容)', () => {
    it('应该保持现有 verify 方法的行为', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      await expect(guard.verify('test_tool')).resolves.not.toThrow()
    })

    it('应该在 401 时抛出错误', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      await expect(guard.verify('test_tool')).rejects.toThrow('API Key 无效或已过期')
    })

    it('应该在 429 时抛出额度用完错误', async () => {
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
      })

      await expect(guard.verify('test_tool')).rejects.toThrow('API 调用额度已用完')
    })

    it('应该在无 API Key 时抛出错误', async () => {
      delete process.env.PIGBUN_API_KEY
      const guardNoKey = new ApiKeyGuard()

      await expect(guardNoKey.verify('test_tool')).rejects.toThrow('API Key 未配置')
    })
  })

  describe('hasKey', () => {
    it('应该在有 API Key 时返回 true', () => {
      expect(guard.hasKey()).toBe(true)
    })

    it('应该在无 API Key 时返回 false', () => {
      delete process.env.PIGBUN_API_KEY
      const guardNoKey = new ApiKeyGuard()
      expect(guardNoKey.hasKey()).toBe(false)
    })
  })

  describe('getGuard', () => {
    it('应该返回单例实例', () => {
      const { getGuard } = require('../../src/guard/apiKeyGuard')
      const guard1 = getGuard()
      const guard2 = getGuard()
      expect(guard1).toBe(guard2)
    })
  })
})
