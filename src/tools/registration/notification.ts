import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NotificationTools } from '../notificationTools'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'
import { withAccountId } from '../../utils/toolUtils'

export function registerNotificationTools(server: McpServer, hasMultipleAccounts: boolean) {
    server.tool(
        'get_notifications',
        '获取通知消息（评论和@、赞和收藏、新增关注）',
        withAccountId({
            tab: z.enum(['comments', 'likes', 'follows']).optional().describe('通知类型：comments=评论和@, likes=赞和收藏, follows=新增关注。不传则获取全部'),
            limit: z.number().optional().describe('每个标签页返回的通知数量限制，默认20')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { tab, limit = 20, accountId } = args
            await getGuard().verify('get_notifications')
            logger.info(`Getting notifications, tab: ${tab || 'all'}, limit: ${limit}`)
            try {
                const tools = new NotificationTools()
                const results = await tools.getNotifications(tab, limit, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(results, null, 2) }]
                }
            } catch (error) {
                logger.error('Error getting notifications:', error)
                throw error
            }
        }
    )
}
