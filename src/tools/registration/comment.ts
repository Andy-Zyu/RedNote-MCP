import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CommentTools } from '../commentTools'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'
import { withAccountId } from '../../utils/toolUtils'

export function registerCommentTools(server: McpServer, hasMultipleAccounts: boolean) {
    server.tool(
        'comment_note',
        '在笔记下发表评论（一级评论）',
        withAccountId({
            noteUrl: z.string().describe('笔记 URL（必须使用 search_notes 返回的完整链接，包含 xsec_token 参数）'),
            content: z.string().describe('评论内容')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteUrl, content, accountId } = args
            await getGuard().verify('comment_note')
            logger.info(`Commenting on note: ${noteUrl}`)
            try {
                const tools = new CommentTools()
                const result = await tools.commentNote({ noteUrl, content, accountId })
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error commenting on note:', error)
                throw error
            }
        }
    )

    server.tool(
        'reply_comment',
        '回复笔记下的评论',
        withAccountId({
            noteUrl: z.string().describe('笔记 URL'),
            commentAuthor: z.string().describe('要回复的评论作者名'),
            commentContent: z.string().describe('要回复的评论内容片段（用于定位）'),
            replyText: z.string().describe('回复内容')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteUrl, commentAuthor, commentContent, replyText, accountId } = args
            await getGuard().verify('reply_comment')
            logger.info(`Replying to comment by ${commentAuthor}`)
            try {
                const tools = new CommentTools()
                const result = await tools.replyComment({ noteUrl, commentAuthor, commentContent, replyText, accountId })
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error replying to comment:', error)
                throw error
            }
        }
    )

    server.tool(
        'filter_comments',
        '对笔记评论进行情感分类（正面/负面/问题/建议/中性）',
        withAccountId({
            noteUrl: z.string().describe('笔记 URL')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteUrl, accountId } = args
            await getGuard().verify('filter_comments')
            logger.info(`Filtering comments for: ${noteUrl}`)
            try {
                const tools = new CommentTools()
                const result = await tools.filterComments(noteUrl, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error filtering comments:', error)
                throw error
            }
        }
    )
}
