import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { EngagementTools } from '../engagementTools'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'
import { withAccountId } from '../../utils/toolUtils'

export function registerEngagementTools(server: McpServer, hasMultipleAccounts: boolean) {
    server.tool(
        'like_note',
        '给笔记点赞',
        withAccountId({
            noteUrl: z.string().describe('笔记 URL')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteUrl, accountId } = args
            await getGuard().verify('like_note')
            logger.info(`Liking note: ${noteUrl}`)
            try {
                const tools = new EngagementTools()
                const result = await tools.likeNote(noteUrl, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error liking note:', error)
                throw error
            }
        }
    )

    server.tool(
        'collect_note',
        '收藏笔记',
        withAccountId({
            noteUrl: z.string().describe('笔记 URL')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteUrl, accountId } = args
            await getGuard().verify('collect_note')
            logger.info(`Collecting note: ${noteUrl}`)
            try {
                const tools = new EngagementTools()
                const result = await tools.collectNote(noteUrl, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error collecting note:', error)
                throw error
            }
        }
    )

    server.tool(
        'follow_author',
        '关注笔记作者',
        withAccountId({
            noteUrl: z.string().describe('笔记 URL（通过笔记页面关注该作者）')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteUrl, accountId } = args
            await getGuard().verify('follow_author')
            logger.info(`Following author from note: ${noteUrl}`)
            try {
                const tools = new EngagementTools()
                const result = await tools.followAuthor(noteUrl, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error following author:', error)
                throw error
            }
        }
    )
}
