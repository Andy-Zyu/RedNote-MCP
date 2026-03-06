import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'

export function registerAccountTools(server: McpServer, hasMultipleAccounts: boolean) {
    if (!hasMultipleAccounts) return

    server.tool(
        'list_accounts',
        '列出所有已登录的账号及其信息',
        {},
        async () => {
            await getGuard().verify('list_accounts')
            const { isRemoteBrowserMode, getRemoteBrowserClient } = await import('../../browser/remoteBrowserClient')
            const { accountManager } = await import('../../auth/accountManager')

            try {
                // Use remote API in Docker mode, local disk otherwise
                const remote = getRemoteBrowserClient()
                const accounts = remote ? await remote.listAccounts() : await accountManager.listAccounts()
                const defaultAccount = remote ? await remote.getDefaultAccount() : await accountManager.getDefaultAccount()

                if (accounts.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: '暂无已登录账号。请使用 login 工具登录。'
                            }
                        ]
                    }
                }

                const accountList = accounts.map(acc => {
                    const isDefault = defaultAccount?.id === acc.id
                    const status = acc.lastLoginAt ? '已登录' : '未登录'
                    const lastLogin = acc.lastLoginAt
                        ? new Date(acc.lastLoginAt).toLocaleString('zh-CN')
                        : '从未登录'

                    return `${isDefault ? '⭐ ' : ''}账号名称: ${acc.name}\n账号 ID: ${acc.id}\n状态: ${status}\n最后登录: ${lastLogin}\n创建时间: ${new Date(acc.createdAt).toLocaleString('zh-CN')}\n${isDefault ? '(默认账号)' : ''}\n---`
                }).join('\n')

                return {
                    content: [
                        {
                            type: 'text',
                            text: `共有 ${accounts.length} 个账号：\n\n${accountList}`
                        }
                    ]
                }
            } catch (error) {
                logger.error('Error listing accounts:', error)
                throw error
            }
        }
    )

    server.tool(
        'check_accounts_status',
        '批量检查所有账号的登录状态',
        {
            accountIds: z.array(z.string()).optional().describe('要检查的账号 ID 数组（可选，不传则检查所有账号）')
        },
        async (args: any) => {
            const { accountIds } = args
            await getGuard().verify('check_accounts_status')
            const { getRemoteBrowserClient } = await import('../../browser/remoteBrowserClient')
            const { accountManager } = await import('../../auth/accountManager')

            try {
                const remote = getRemoteBrowserClient()
                let accounts = remote ? await remote.listAccounts() : await accountManager.listAccounts()

                // 如果指定了 accountIds，只检查这些账号
                if (accountIds && accountIds.length > 0) {
                    accounts = accounts.filter(acc => accountIds.includes(acc.id))
                }

                if (accounts.length === 0) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: '未找到任何账号。'
                            }
                        ]
                    }
                }

                const now = new Date()
                const accountStatuses = accounts.map(acc => {
                    const hasCookies = remote ? (acc.hasCookies ?? false) : accountManager.hasCookies(acc.id)
                    const lastLoginTime = acc.lastLoginAt ? new Date(acc.lastLoginAt) : null
                    const lastCheckTime = now.toISOString()

                    // 判断状态：有 Cookie 且最近登录过视为 active
                    let status: 'active' | 'inactive' = hasCookies ? 'active' : 'inactive'

                    return {
                        id: acc.id,
                        name: acc.name,
                        isActive: hasCookies,
                        lastCheckTime,
                        lastActiveTime: acc.lastLoginAt || '',
                        status
                    }
                })

                const summary = {
                    total: accountStatuses.length,
                    active: accountStatuses.filter(s => s.status === 'active').length,
                    inactive: accountStatuses.filter(s => s.status === 'inactive').length
                }

                const result = {
                    accounts: accountStatuses,
                    summary
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                }
            } catch (error) {
                logger.error('Error checking accounts status:', error)
                throw error
            }
        }
    )

    server.tool(
        'relogin',
        '重新登录指定账号（清除 Cookie 并触发扫码流程）',
        {
            accountId: z.string().describe('要重新登录的账号 ID')
        },
        async (args: any) => {
            const { accountId } = args
            await getGuard().verify('relogin')
            const { getRemoteBrowserClient } = await import('../../browser/remoteBrowserClient')
            const { accountManager } = await import('../../auth/accountManager')

            try {
                const remote = getRemoteBrowserClient()
                // 验证账号是否存在
                const account = remote ? await remote.getAccount(accountId) : accountManager.getAccount(accountId)
                if (!account) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `账号不存在: ${accountId}`
                            }
                        ]
                    }
                }

                logger.info(`Relogin requested for account: ${accountId} (${account.name})`)

                // 清除该账号的 Cookie
                if (remote) {
                    await remote.clearCookies(accountId)
                } else {
                    await accountManager.clearCookies(accountId)
                }
                logger.info(`Cleared cookies for account: ${accountId}`)

                // 检查 Matrix 服务器是否运行
                const { isMatrixServerRunning } = await import('../../matrix/server')
                if (!isMatrixServerRunning()) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Matrix 服务器未启动，无法触发扫码流程。请先启动 Matrix 服务器。'
                            }
                        ]
                    }
                }

                // 触发扫码流程
                const { startScan } = await import('../../matrix/scanner')

                // 异步启动扫码流程（不阻塞响应）
                startScan(accountId).catch(err => {
                    logger.error(`Scan failed for account ${accountId}:`, err)
                })

                // 打开 Web 界面
                const { exec } = require('child_process')
                const open = process.platform === 'darwin' ? 'open' :
                    process.platform === 'win32' ? 'start' : 'xdg-open'
                exec(`${open} http://localhost:3001`)

                return {
                    content: [
                        {
                            type: 'text',
                            text: `已清除账号 "${account.name}" (${accountId}) 的登录信息。\n\n扫码流程已启动，请在浏览器中完成扫码登录：http://localhost:3001`
                        }
                    ]
                }
            } catch (error) {
                logger.error('Error during relogin:', error)
                throw error
            }
        }
    )
}
