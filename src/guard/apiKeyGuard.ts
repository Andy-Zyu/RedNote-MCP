/**
 * PigBun AI API Key Guard
 * Verifies API key against auth-gateway before each tool call.
 */

const AUTH_GATEWAY_URL = process.env.PIGBUN_GATEWAY_URL || 'https://pigbunai.com'
const VERIFY_ENDPOINT = '/api/mcp/verify'

export class ApiKeyGuard {
  private apiKey: string | null

  constructor() {
    this.apiKey = process.env.PIGBUN_API_KEY || null
  }

  hasKey(): boolean {
    return !!this.apiKey
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
        console.error(`[PigBun AI] Auth gateway returned ${res.status}, proceeding with caution`)
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.startsWith('[PigBun AI]')) {
        throw err
      }
      console.error(`[PigBun AI] Auth gateway unreachable: ${err}. Proceeding with grace period.`)
    }
  }
}

let _guard: ApiKeyGuard | null = null

export function getGuard(): ApiKeyGuard {
  if (!_guard) _guard = new ApiKeyGuard()
  return _guard
}
