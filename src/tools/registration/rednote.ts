import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RedNoteTools } from '../rednoteTools'
import { AuthManager } from '../../auth/authManager'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'
import { withAccountId, wrapToolHandler } from '../../utils/toolUtils'

export function registerRedNoteTools(server: McpServer, hasMultipleAccounts: boolean) {
    server.tool(
        'search_notes',
        '根据关键词搜索笔记（返回的链接包含 xsec_token，可直接用于 get_note_content、get_note_comments 等工具）',
        withAccountId({
            keywords: z.string().describe('搜索关键词'),
            limit: z.number().optional().describe('返回结果数量限制')
        }, hasMultipleAccounts),
        wrapToolHandler('search_notes', async (args: any) => {
            const { keywords, limit = 10, accountId } = args
            await getGuard().verify('search_notes')
            logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
            try {
                const tools = new RedNoteTools()
                const notes = await tools.searchNotes(keywords, limit, accountId)
                logger.info(`Found ${notes.length} notes`)
                return {
                    content: notes.map((note) => ({
                        type: 'text',
                        text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}\n---`
                    }))
                }
            } catch (error) {
                logger.error('Error searching notes:', error)
                throw error
            }
        })
    )

    server.tool(
        'get_note_content',
        '获取笔记内容',
        withAccountId({
            url: z.string().describe('笔记 URL（必须使用 search_notes 返回的完整链接，包含 xsec_token 参数，否则会被反爬拦截）')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { url, accountId } = args
            await getGuard().verify('get_note_content')
            logger.info(`Getting note content for URL: ${url}`)
            try {
                const tools = new RedNoteTools()
                const note = await tools.getNoteContent(url, accountId)
                logger.info(`Successfully retrieved note: ${note.title}`)

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(note)
                        }
                    ]
                }
            } catch (error) {
                logger.error('Error getting note content:', error)
                throw error
            }
        }
    )

    server.tool(
        'get_note_comments',
        '获取笔记评论',
        withAccountId({
            url: z.string().describe('笔记 URL（必须使用 search_notes 返回的完整链接，包含 xsec_token 参数，否则会被反爬拦截）')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { url, accountId } = args
            await getGuard().verify('get_note_comments')
            logger.info(`Getting comments for URL: ${url}`)
            try {
                const tools = new RedNoteTools()
                const comments = await tools.getNoteComments(url, accountId)
                logger.info(`Found ${comments.length} comments`)
                return {
                    content: comments.map((comment) => ({
                        type: 'text',
                        text: `作者: ${comment.author}\n内容: ${comment.content}\n点赞: ${comment.likes}\n时间: ${comment.time}\n---`
                    }))
                }
            } catch (error) {
                logger.error('Error getting note comments:', error)
                throw error
            }
        }
    )

    server.tool(
        'publish_note',
        '发布小红书笔记（图文笔记，必须提供至少一张图片）',
        withAccountId({
            title: z.string().describe('笔记标题（最多20字）'),
            content: z.string().describe('笔记正文'),
            images: z.array(z.string()).min(1).describe('图片文件路径数组（本地绝对路径，至少1张，小红书要求图文笔记必须有图片）'),
            tags: z.array(z.string()).optional().describe('标签/话题数组'),
            keepAlive: z.boolean().optional().describe('发布后是否保持浏览器打开（用于连续发布多篇笔记）')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { title, content, images, tags, keepAlive, accountId } = args
            await getGuard().verify('publish_note')
            logger.info(`Publishing note: ${title}`)
            try {
                const tools = new RedNoteTools()
                const result = await tools.publishNote({ title, content, images, tags, keepAlive, accountId })
                logger.info(`Publish result: ${result.message}`)
                return {
                    content: [
                        {
                            type: 'text',
                            text: result.message
                        }
                    ]
                }
            } catch (error) {
                logger.error('Error publishing note:', error)
                throw error
            }
        }
    )

    server.tool(
        'publish_note_video',
        '发布小红书视频笔记（必须提供一个视频文件）',
        withAccountId({
            title: z.string().describe('笔记标题（最多20字）'),
            content: z.string().describe('笔记正文'),
            video: z.string().describe('视频文件路径（本地绝对路径）'),
            tags: z.array(z.string()).optional().describe('标签/话题数组')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { title, content, video, tags, accountId } = args
            await getGuard().verify('publish_note_video')
            logger.info(`Publishing video note: ${title}`)
            try {
                const tools = new RedNoteTools()
                const result = await tools.publishVideoNote({ title, content, video, tags, accountId })
                logger.info(`Publish result: ${result.message}`)
                return {
                    content: [{ type: 'text', text: result.message }]
                }
            } catch (error) {
                logger.error('Error publishing video note:', error)
                throw error
            }
        }
    )

    server.tool(
        'publish_note_text',
        '发布小红书纯文字笔记（无需图片或视频，自动生成封面图）',
        withAccountId({
            title: z.string().describe('笔记标题（最多20字）'),
            content: z.string().describe('笔记正文'),
            tags: z.array(z.string()).optional().describe('标签/话题数组')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { title, content, tags, accountId } = args
            await getGuard().verify('publish_note_text')
            logger.info(`Publishing text note: ${title}`)
            try {
                const tools = new RedNoteTools()
                const result = await tools.publishTextNote({ title, content, tags, accountId })
                logger.info(`Publish result: ${result.message}`)
                return {
                    content: [{ type: 'text', text: result.message }]
                }
            } catch (error) {
                logger.error('Error publishing text note:', error)
                throw error
            }
        }
    )

    server.tool(
        'publish_note_article',
        '发布小红书长文笔记（适合长篇内容，标题无字数限制）',
        withAccountId({
            title: z.string().describe('笔记标题'),
            content: z.string().describe('笔记正文（支持长篇内容）'),
            tags: z.array(z.string()).optional().describe('标签/话题数组')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { title, content, tags, accountId } = args
            await getGuard().verify('publish_note_article')
            logger.info(`Publishing article: ${title}`)
            try {
                const tools = new RedNoteTools()
                const result = await tools.publishArticle({ title, content, tags, accountId })
                logger.info(`Publish result: ${result.message}`)
                return {
                    content: [{ type: 'text', text: result.message }]
                }
            } catch (error) {
                logger.error('Error publishing article:', error)
                throw error
            }
        }
    )

    // Dashboard tools
    server.tool(
        'get_dashboard_overview',
        '获取创作者中心账号数据总览（曝光、观看、互动、涨粉等）',
        withAccountId({
            period: z.enum(['7days', '30days']).optional().describe('统计周期，默认近7日')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { period = '7days', accountId } = args
            await getGuard().verify('get_dashboard_overview')
            logger.info(`Getting dashboard overview for period: ${period}`)
            try {
                const tools = new RedNoteTools()
                const data = await tools.getDashboardOverview(period, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
                }
            } catch (error) {
                logger.error('Error getting dashboard overview:', error)
                throw error
            }
        }
    )

    server.tool(
        'get_content_analytics',
        '获取内容分析数据（每篇笔记的曝光、观看、点赞、评论、收藏等详细数据）',
        withAccountId({
            startDate: z.string().optional().describe('开始日期，格式 YYYY-MM-DD'),
            endDate: z.string().optional().describe('结束日期，格式 YYYY-MM-DD')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { startDate, endDate, accountId } = args
            await getGuard().verify('get_content_analytics')
            logger.info('Getting content analytics')
            try {
                const tools = new RedNoteTools()
                const data = await tools.getContentAnalytics({ startDate, endDate, accountId })
                return {
                    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
                }
            } catch (error) {
                logger.error('Error getting content analytics:', error)
                throw error
            }
        }
    )

    server.tool(
        'get_fans_analytics',
        '获取粉丝数据（总粉丝数、新增/流失粉丝、粉丝画像、活跃粉丝）',
        withAccountId({
            period: z.enum(['7days', '30days']).optional().describe('统计周期，默认近7天')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { period = '7days', accountId } = args
            await getGuard().verify('get_fans_analytics')
            logger.info(`Getting fans analytics for period: ${period}`)
            try {
                const tools = new RedNoteTools()
                const data = await tools.getFansAnalytics(period, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
                }
            } catch (error) {
                logger.error('Error getting fans analytics:', error)
                throw error
            }
        }
    )

    // Add login tool
    server.tool('login', '登录小红书账号（多账号模式：自动打开 Web 管理界面）', {}, async () => {
        const guard = getGuard()
        const config = await guard.verifyAndGetConfig('login')
        const isMatrixMode = config.rednote.mode === 'matrix'

        logger.info(`Starting login process (mode: ${config.rednote.mode})`)

        // Matrix mode: open web interface
        if (isMatrixMode) {
            // Check if Matrix server is available
            try {
                const response = await fetch('http://localhost:3001/api/health').catch(() => null)
                if (!response || !response.ok) {
                    logger.error('Matrix server not available')
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Matrix 服务器未启动，请先启动 Matrix 服务器'
                            }
                        ]
                    }
                }
            } catch (error) {
                logger.error('Failed to check Matrix server:', error)
                return {
                    content: [
                        {
                            type: 'text',
                            text: 'Matrix 服务器未启动，请先启动 Matrix 服务器'
                        }
                    ]
                }
            }

            logger.info('Matrix server detected, opening web interface')
            const { exec } = require('child_process')
            const open = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start' : 'xdg-open'
            exec(`${open} http://localhost:3001`)

            return {
                content: [
                    {
                        type: 'text',
                        text: '已打开多账号管理界面：http://localhost:3001\n\n请在浏览器中完成登录操作。'
                    }
                ]
            }
        }

        // Personal mode: traditional login
        const authManager = new AuthManager()
        try {
            await authManager.login()
            logger.info('Login successful (personal mode)')
            return {
                content: [
                    {
                        type: 'text',
                        text: '登录成功！Cookie 已保存。'
                    }
                ]
            }
        } catch (error) {
            logger.error('Login failed:', error)
            throw error
        } finally {
            await authManager.cleanup()
        }
    })
}
