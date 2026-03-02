/**
 * 参数提取工具
 * 统一处理 Express 路由参数
 */

/**
 * 从 Express 参数中提取字符串值
 * 处理数组和字符串两种情况
 */
export function extractParam(param: string | string[]): string {
  return Array.isArray(param) ? param[0] : param
}

/**
 * 从 Express 参数中提取可选字符串值
 */
export function extractOptionalParam(param: string | string[] | undefined): string | undefined {
  if (!param) return undefined
  return Array.isArray(param) ? param[0] : param
}
