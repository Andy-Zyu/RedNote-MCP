/**
 * PigBun AI API Key Guard
 * Verifies API key against auth-gateway before each tool call.
 */

import { ApiKeyConfig, ApiKeyVerifyResponse } from '../types/apiKey'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import logger from '../utils/logger'
import { CACHE_TTL } from '../constants/timeouts'

const AUTH_GATEWAY_URL = process.env.PIGBUN_GATEWAY_URL || 'https://pigbunai.com'
const VERIFY_ENDPOINT = '/api/mcp/verify'
const MEMORY_CACHE_TTL = CACHE_TTL.MEMORY
const DISK_CACHE_TTL = CACHE_TTL.DISK
const CACHE_DIR = path.join(os.homedir(), '.mcp', 'rednote')
const CACHE_FILE = path.join(CACHE_DIR, 'api-key-cache.json')

const DEFAULT_FREE_CONFIG: ApiKeyConfig = {
  tier: 'free',
  rednote: {
    mode: 'personal',
    maxAccounts: 1,
  },
  usage: {
    today: 0,
    remaining: 50,
  },
}

interface CachedConfig extends ApiKeyConfig {
  timestamp: number
}

export class ApiKeyGuard {
  private apiKey: string | null
  private memoryCache: CachedConfig | null = null

  constructor() {
    this.apiKey = process.env.PIGBUN_API_KEY || null
  }

  hasKey(): boolean {
    return !!this.apiKey
  }

  /**
   * 获取当前缓存的配置（不触发验证）
   */
  getConfig(): ApiKeyConfig | null {
    if (this.memoryCache && Date.now() - this.memoryCache.timestamp < MEMORY_CACHE_TTL) {
      const { timestamp, ...config } = this.memoryCache
      return config
    }
    return null
  }

  /**
   * 清除所有缓存（内存 + 磁盘）
   */
  clearCache(): void {
    logger.info('[PigBun AI] Clearing all caches')
    this.memoryCache = null
    // 异步删除磁盘缓存文件
    fs.unlink(CACHE_FILE).catch(() => {
      // 文件不存在时忽略错误
    })
  }

  /**
   * 验证响应签名，防止中间人篡改
   */
  private verifySignature(response: ApiKeyVerifyResponse): boolean {
    const { signature, ...data } = response
    const payload = JSON.stringify(data)
    const secret = process.env.PIGBUN_SIGNATURE_SECRET || process.env.JWT_SECRET || 'fallback-secret'
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')

    logger.debug('[PigBun AI] Signature verification:', {
      match: signature === expectedSignature,
      secretSource: process.env.PIGBUN_SIGNATURE_SECRET ? 'PIGBUN_SIGNATURE_SECRET' :
        process.env.JWT_SECRET ? 'JWT_SECRET' : 'fallback'
    })

    return signature === expectedSignature
  }

  /**
   * 检查时间戳，防止重放攻击（5分钟有效期）
   */
  private isTimestampValid(timestamp: number): boolean {
    const now = Date.now()
    const diff = Math.abs(now - timestamp)
    const isValid = diff < CACHE_TTL.TIMESTAMP_VALIDITY

    logger.debug('[PigBun AI] Timestamp validation:', {
      isValid,
      diff: `${Math.floor(diff / 1000)}s`,
      timestamp: new Date(timestamp).toISOString()
    })

    return isValid
  }

  /**
   * 检查是否有矩阵版权限
   */
  async hasMatrixAccess(toolName: string): Promise<boolean> {
    const config = await this.verifyAndGetConfig(toolName)
    return config.rednote.mode === 'matrix'
  }

  /**
   * 获取用户订阅模式
   */
  async getMode(toolName: string): Promise<'personal' | 'matrix'> {
    const config = await this.verifyAndGetConfig(toolName)
    return config.rednote.mode
  }

  /**
   * 验证 API Key 并获取配置
   * 实现三级缓存：内存缓存（2分钟）-> 磁盘缓存（1小时）-> 网络请求
   * @param toolName 工具名称
   * @param forceRefresh 是否强制刷新，跳过缓存直接请求
   */
  async verifyAndGetConfig(toolName: string, forceRefresh: boolean = false): Promise<ApiKeyConfig> {
    // 强制刷新时跳过所有缓存
    if (forceRefresh) {
      logger.info('[PigBun AI] Force refresh enabled, skipping cache')
      const networkConfig = await this.fetchFromNetwork(toolName)
      return networkConfig || this.getDegradedConfig()
    }

    // 1. 检查内存缓存
    if (this.memoryCache && Date.now() - this.memoryCache.timestamp < MEMORY_CACHE_TTL) {
      logger.debug('[PigBun AI] Using memory cache')
      const { timestamp, ...config } = this.memoryCache
      return config
    }

    // 2. 尝试网络请求
    const networkConfig = await this.fetchFromNetwork(toolName)
    if (networkConfig) {
      return networkConfig
    }

    // 3. 检查磁盘缓存（验证是否过期）
    const diskCache = await this.loadDiskCache()
    if (diskCache) {
      const age = Date.now() - diskCache.timestamp
      if (age < DISK_CACHE_TTL) {
        logger.info('[PigBun AI] Using disk cache')
        this.memoryCache = diskCache
        const { timestamp, ...config } = diskCache
        return config
      } else {
        logger.info('[PigBun AI] Disk cache expired, degrading to personal mode')
      }
    }

    // 4. 降级到个人版
    logger.warn('[PigBun AI] All verification methods failed, degrading to personal mode')
    return this.getDegradedConfig()
  }

  /**
   * 从网络获取配置
   */
  private async fetchFromNetwork(toolName: string): Promise<ApiKeyConfig | null> {
    if (!this.apiKey) {
      return null
    }

    try {
      logger.info('[PigBun AI] Fetching config from auth gateway:', {
        url: `${AUTH_GATEWAY_URL}${VERIFY_ENDPOINT}`,
        toolName
      })

      const res = await fetch(`${AUTH_GATEWAY_URL}${VERIFY_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Original-URI': `/rednote/${toolName}`,
        },
      })

      if (res.ok) {
        const response = await res.json() as ApiKeyVerifyResponse

        logger.info('[PigBun AI] Received response:', {
          tier: response.tier,
          mode: response.rednote?.mode,
          maxAccounts: response.rednote?.maxAccounts,
          hasSignature: !!response.signature,
          hasTimestamp: !!response.timestamp
        })

        // 验证签名
        if (response.signature && !this.verifySignature(response)) {
          logger.warn('[PigBun AI] Response signature verification failed, degrading to personal mode')
          return this.getDegradedConfig()
        }

        // 验证时间戳
        if (response.timestamp && !this.isTimestampValid(response.timestamp)) {
          logger.warn('[PigBun AI] Response timestamp expired, degrading to personal mode')
          return this.getDegradedConfig()
        }

        const config: ApiKeyConfig = {
          tier: response.tier,
          rednote: response.rednote,
          usage: response.usage,
        }

        // 更新内存缓存
        this.memoryCache = {
          ...config,
          timestamp: Date.now(),
        }

        logger.info('[PigBun AI] Config cached successfully')

        // 异步更新磁盘缓存
        this.saveDiskCache(this.memoryCache).catch(err => {
          logger.error('[PigBun AI] Failed to save disk cache:', err)
        })

        return config
      } else {
        logger.warn('[PigBun AI] Auth gateway returned non-OK status:', res.status)
      }
    } catch (err) {
      logger.error('[PigBun AI] Network request failed:', err)
    }

    return null
  }

  /**
   * 获取降级配置（个人版）
   */
  private getDegradedConfig(): ApiKeyConfig {
    return {
      tier: 'free',
      rednote: { mode: 'personal', maxAccounts: 1 },
      usage: { today: 0, remaining: 50 },
    }
  }

  /**
   * 加载磁盘缓存
   */
  private async loadDiskCache(): Promise<CachedConfig | null> {
    try {
      const data = await fs.readFile(CACHE_FILE, 'utf-8')
      return JSON.parse(data) as CachedConfig
    } catch {
      return null
    }
  }

  /**
   * 保存磁盘缓存
   */
  private async saveDiskCache(config: CachedConfig): Promise<void> {
    await fs.mkdir(CACHE_DIR, { recursive: true })
    await fs.writeFile(CACHE_FILE, JSON.stringify(config, null, 2))
  }

  /**
   * Verify API key and record usage for a tool call.
   * Throws a user-friendly error if verification fails.
   */
  async verify(toolName: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error(
        `[PigBun AI] API Key 未配置。\n\n` +
        `请在环境变量中设置 PIGBUN_API_KEY：\n` +
        `  "env": { "PIGBUN_API_KEY": "pb_live_your_key_here" }\n\n` +
        `注册并获取 API Key → ${AUTH_GATEWAY_URL}/login\n` +
        `联系作者 → ${AUTH_GATEWAY_URL}\n\n` +
        `本工具仅供学习和测试用途，使用者需自行承担使用风险。`
      )
    }

    try {
      const res = await fetch(`${AUTH_GATEWAY_URL}${VERIFY_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Original-URI': `/rednote/${toolName}`,
        },
      })

      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `[PigBun AI] API Key 无效或已过期。\n\n` +
          `请检查您的 API Key 是否正确，或前往官网重新注册申请：\n` +
          `→ ${AUTH_GATEWAY_URL}/login\n` +
          `联系作者 → ${AUTH_GATEWAY_URL}\n\n` +
          `本工具仅供学习和测试用途，使用者需自行承担使用风险。`
        )
      }

      if (res.status === 429) {
        throw new Error(
          `[PigBun AI] API 调用额度已用完。\n\n` +
          `当前套餐额度已耗尽，请前往官网升级或联系作者：\n` +
          `→ ${AUTH_GATEWAY_URL}/login\n` +
          `联系作者 → ${AUTH_GATEWAY_URL}\n\n` +
          `本工具仅供学习和测试用途，使用者需自行承担使用风险。`
        )
      }

      if (!res.ok) {
        logger.error(`[PigBun AI] Auth gateway returned ${res.status}, proceeding with caution`)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('[PigBun AI]')) {
        throw err
      }
      logger.error(`[PigBun AI] Auth gateway unreachable: ${err}. Proceeding with grace period.`)
    }
  }
}

let _guard: ApiKeyGuard | null = null

export function getGuard(): ApiKeyGuard {
  if (!_guard) _guard = new ApiKeyGuard()
  return _guard
}
