/**
 * API Key 验证响应类型
 */
export interface ApiKeyVerifyResponse {
  valid: boolean
  tier: 'free' | 'basic' | 'pro' | 'admin'
  rednote: {
    mode: 'personal' | 'matrix'
    maxAccounts: number
  }
  usage: {
    today: number
    remaining: number
  }
  timestamp: number
  signature: string
}

/**
 * API Key 配置类型
 */
export interface ApiKeyConfig {
  tier: string
  rednote: {
    mode: 'personal' | 'matrix'
    maxAccounts: number
  }
  usage: {
    today: number
    remaining: number
  }
}
