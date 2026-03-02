/**
 * 时间常量定义
 * 统一管理所有超时和间隔时间
 */

// 缓存时间
export const CACHE_TTL = {
  MEMORY: 2 * 60 * 1000, // 2分钟
  DISK: 60 * 60 * 1000, // 1小时
  TIMESTAMP_VALIDITY: 5 * 60 * 1000, // 5分钟（防重放攻击）
} as const

// 监控间隔
export const MONITOR_INTERVAL = {
  ACCOUNT_HEALTH: 10 * 60 * 1000, // 10分钟
  SUBSCRIPTION: 5 * 60 * 1000, // 5分钟
  HEARTBEAT: 60 * 1000, // 60秒
} as const

// 页面超时
export const PAGE_TIMEOUT = {
  SHORT: 10 * 1000, // 10秒
  MEDIUM: 15 * 1000, // 15秒
  STANDARD: 30 * 1000, // 30秒
  LONG: 60 * 1000, // 60秒
  VERY_LONG: 120 * 1000, // 120秒
} as const

// 延迟时间（秒）
export const DELAY = {
  MIN_SHORT: 0.3,
  MAX_SHORT: 0.6,
  MIN_MEDIUM: 1,
  MAX_MEDIUM: 2,
  MIN_LONG: 2,
  MAX_LONG: 4,
  MIN_VERY_LONG: 3,
  MAX_VERY_LONG: 5,
  MIN_EXTRA_LONG: 5,
  MAX_EXTRA_LONG: 8,
} as const

// 登录超时
export const LOGIN_TIMEOUT = {
  DEFAULT: 10, // 10秒
} as const
