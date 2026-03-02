import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z, ZodRawShape } from 'zod'
import { AuthManager } from './auth/authManager'
import { RedNoteTools } from './tools/rednoteTools'
import { NoteManageTools } from './tools/noteManageTools'
import { CommentTools } from './tools/commentTools'
import { AnalyticsTools } from './tools/analyticsTools'
import { EngagementTools } from './tools/engagementTools'
import { NotificationTools } from './tools/notificationTools'
import { BrowserManager } from './browser/browserManager'
import { getGuard } from './guard/apiKeyGuard'
import { startMatrixServer } from './matrix'
import logger, { LOGS_DIR, packLogs } from './utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createStdioLogger } from './utils/stdioLogger'
import { SubscriptionMonitor } from './monitor/subscriptionMonitor'
import { handleDegradation } from './monitor/degradationHandler'
import { MONITOR_INTERVAL, PAGE_TIMEOUT, LOGIN_TIMEOUT } from './constants/timeouts'

const execAsync = promisify(exec)

const name = 'rednote'
const description =
  'A friendly tool to help you access and interact with Xiaohongshu (RedNote) content through Model Context Protocol.\n\n' +
  'DISCLAIMER: This tool is provided for learning and testing purposes only. ' +
  'Users assume all risks associated with its use. ' +
  'The authors are not responsible for any consequences arising from the use of this tool.\n\n' +
  'Requires a PigBun AI API Key. Get yours at https://pigbunai.com'
const version = '0.5.0'

// Create server instance
const server = new McpServer({
  name,
  version,
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: true,
    sampling: {},
    roots: {
      listChanged: true
    }
  }
})

/**
 * Helper function to conditionally add accountId parameter
 * @param baseSchema - Base Zod schema object
 * @param hasMultiple - Whether multiple accounts exist
 * @returns Schema with or without accountId parameter
 */
export function withAccountId(baseSchema: ZodRawShape, hasMultiple: boolean): ZodRawShape {
  if (hasMultiple) {
    return {
      ...baseSchema,
      accountId: z.string().optional().describe('账号 ID（可选，不传则使用默认账号）')
    }
  }
  return baseSchema
}

/**
 * Wrap tool handler with logging and error handling
 */
function wrapToolHandler(toolName: string, handler: (args: any) => Promise<any>) {
  return async (args: any) => {
    const startTime = Date.now()
    logger.info(`Tool called: ${toolName}`, {
      args: JSON.stringify(args),
      timestamp: new Date().toISOString()
    })

    try {
      const result = await handler(args)
      const duration = Date.now() - startTime
      logger.info(`Tool completed: ${toolName}`, {
        durationMs: duration,
        success: true
      })
      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error(`Tool failed: ${toolName}`, {
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        args: JSON.stringify(args)
      })
      throw error
    }
  }
}

/**
 * Register all MCP tools with dynamic schema based on account count
 * @param server - MCP Server instance
 * @param hasMultipleAccounts - Whether multiple accounts exist
 */
export function registerTools(server: McpServer, hasMultipleAccounts: boolean) {
  logger.info(`Registering tools in ${hasMultipleAccounts ? 'multi-account' : 'single-account'} mode`)

// Register tools
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

// === P0: Note Management Tools ===

server.tool(
  'get_my_notes',
  '获取自己的笔记列表（创作者中心）',
  withAccountId({}, hasMultipleAccounts),
  async (args: any) => {
    const { accountId } = args
    await getGuard().verify('get_my_notes')
    logger.info('Getting my notes')
    try {
      const tools = new NoteManageTools()
      const data = await tools.getMyNotes(accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
      }
    } catch (error) {
      logger.error('Error getting my notes:', error)
      throw error
    }
  }
)

server.tool(
  'edit_note',
  '编辑已发布的笔记（标题、正文、标签）',
  withAccountId({
    noteId: z.string().describe('笔记 ID 或标题关键词'),
    title: z.string().optional().describe('新标题（最多20字）'),
    content: z.string().optional().describe('新正文内容'),
    tags: z.array(z.string()).optional().describe('新标签数组')
  }, hasMultipleAccounts),
  async (args: any) => {
    const { noteId, title, content, tags, accountId } = args
    await getGuard().verify('edit_note')
    logger.info(`Editing note: ${noteId}`)
    try {
      const tools = new NoteManageTools()
      const result = await tools.editNote({ noteId, title, content, tags, accountId })
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error editing note:', error)
      throw error
    }
  }
)

server.tool(
  'delete_note',
  '删除已发布的笔记',
  withAccountId({
    noteId: z.string().describe('笔记 ID 或标题关键词')
  }, hasMultipleAccounts),
  async (args: any) => {
    const { noteId, accountId } = args
    await getGuard().verify('delete_note')
    logger.info(`Deleting note: ${noteId}`)
    try {
      const tools = new NoteManageTools()
      const result = await tools.deleteNote(noteId, accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error deleting note:', error)
      throw error
    }
  }
)

// === P0: Comment Tools ===

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

// === Engagement Tools ===

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

// === P0: Analytics Tools ===

server.tool(
  'discover_trending',
  '发现热门话题（输入多个关键词，分析各话题热度）',
  withAccountId({
    keywords: z.array(z.string()).describe('要分析的关键词数组')
  }, hasMultipleAccounts),
  async (args: any) => {
    const { keywords, accountId } = args
    await getGuard().verify('discover_trending')
    logger.info(`Discovering trending for ${keywords.length} keywords`)
    try {
      const tools = new AnalyticsTools()
      const result = await tools.discoverTrending(keywords, accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error discovering trending:', error)
      throw error
    }
  }
)

server.tool(
  'analyze_best_publish_time',
  '分析最佳发布时间（基于历史笔记数据）',
  withAccountId({}, hasMultipleAccounts),
  async (args: any) => {
    const { accountId } = args
    await getGuard().verify('analyze_best_publish_time')
    logger.info('Analyzing best publish time')
    try {
      const tools = new AnalyticsTools()
      const result = await tools.analyzeBestPublishTime(accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error analyzing best publish time:', error)
      throw error
    }
  }
)

server.tool(
  'generate_content_report',
  '生成综合运营报告（汇总数据看板、内容分析、粉丝数据）',
  withAccountId({
    period: z.enum(['7days', '30days']).optional().describe('统计周期，默认近7日')
  }, hasMultipleAccounts),
  async (args: any) => {
    const { period = '7days', accountId } = args
    await getGuard().verify('generate_content_report')
    logger.info(`Generating content report for period: ${period}`)
    try {
      const tools = new AnalyticsTools()
      const result = await tools.generateContentReport(period, accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error generating content report:', error)
      throw error
    }
  }
)

server.tool(
  'get_inspiration_topics',
  '获取笔记灵感话题（经典热门话题，含参与人数、浏览量和热门笔记示例）',
  withAccountId({
    category: z.string().optional().describe('话题分类：美食、美妆、时尚、出行、知识、兴趣爱好。不传默认美食')
  }, hasMultipleAccounts),
  async (args: any) => {
    const { category, accountId } = args
    await getGuard().verify('get_inspiration_topics')
    logger.info(`Getting inspiration topics for category: ${category || '美食'}`)
    try {
      const tools = new AnalyticsTools()
      const result = await tools.getInspirationTopics(category, accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error getting inspiration topics:', error)
      throw error
    }
  }
)

server.tool(
  'get_activity_center',
  '获取活动中心数据（官方活动列表，含流量扶持、活动奖励、参与话题等信息）',
  withAccountId({}, hasMultipleAccounts),
  async (args: any) => {
    const { accountId } = args
    await getGuard().verify('get_activity_center')
    logger.info('Getting activity center data')
    try {
      const tools = new AnalyticsTools()
      const result = await tools.getActivityCenter(accountId)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error getting activity center:', error)
      throw error
    }
  }
)

// === Notification Tools ===

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

// === Share Tools ===

server.tool(
  'get_share_link',
  '获取笔记的分享链接（支持笔记URL或笔记ID）',
  {
    noteId: z.string().describe('笔记 ID 或笔记 URL'),
  },
  async (args: any) => {
    const { noteId } = args
    await getGuard().verify('get_share_link')
    // Extract noteId from URL if a full URL was provided
    const idMatch = noteId.match(/explore\/([a-f0-9]+)/) || noteId.match(/^([a-f0-9]{24})$/)
    const extractedId = idMatch ? idMatch[1] : noteId

    const result = {
      noteId: extractedId,
      webUrl: `https://www.xiaohongshu.com/explore/${extractedId}`,
      appUrl: `xhsdiscover://item/${extractedId}`,
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    }
  }
)

  // list_accounts tool - only register in multi-account mode
  if (hasMultipleAccounts) {
    server.tool(
      'list_accounts',
      '列出所有已登录的账号及其信息',
      {},
      async () => {
        await getGuard().verify('list_accounts')
        const { accountManager } = await import('./auth/accountManager')

        try {
          const accounts = await accountManager.listAccounts()
          const defaultAccount = await accountManager.getDefaultAccount()

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

            return `${isDefault ? '⭐ ' : ''}账号名称: ${acc.name}
账号 ID: ${acc.id}
状态: ${status}
最后登录: ${lastLogin}
创建时间: ${new Date(acc.createdAt).toLocaleString('zh-CN')}
${isDefault ? '(默认账号)' : ''}
---`
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
        const { accountManager } = await import('./auth/accountManager')

        try {
          let accounts = await accountManager.listAccounts()

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
            const hasCookies = accountManager.hasCookies(acc.id)
            const lastLoginTime = acc.lastLoginAt ? new Date(acc.lastLoginAt) : null
            const lastCheckTime = now.toISOString()

            // 判断状态：有 Cookie 且最近登录过视为 active
            let status: 'active' | 'inactive' | 'unknown' = 'unknown'
            if (hasCookies && lastLoginTime) {
              // 如果最后登录时间在 30 天内，视为 active
              const daysSinceLogin = (now.getTime() - lastLoginTime.getTime()) / (1000 * 60 * 60 * 24)
              status = daysSinceLogin <= 30 ? 'active' : 'inactive'
            } else if (hasCookies) {
              status = 'active'
            } else {
              status = 'inactive'
            }

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
            inactive: accountStatuses.filter(s => s.status === 'inactive').length,
            unknown: accountStatuses.filter(s => s.status === 'unknown').length
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
  }
}

// Start the server
async function main() {
  const startTime = Date.now()
  logger.info('Starting RedNote MCP Server', {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  })

  // === Global Error Handlers ===
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception - Server will continue running', {
      error: error.message,
      stack: error.stack,
      uptime: process.uptime()
    })
    // DO NOT exit - keep server running
  })

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Promise Rejection - Server will continue running', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise.toString(),
      uptime: process.uptime()
    })
    // DO NOT exit - keep server running
  })

  // === Heartbeat Logger ===
  const heartbeatInterval = setInterval(() => {
    const memUsage = process.memoryUsage()
    logger.info('MCP Server Heartbeat', {
      uptime: Math.floor(process.uptime()),
      uptimeFormatted: formatUptime(process.uptime()),
      memory: {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
      },
      pid: process.pid
    })
  }, MONITOR_INTERVAL.HEARTBEAT) // Every 60 seconds

  const guard = getGuard()
  if (guard.hasKey()) {
    logger.info('API Key configured, authentication enabled')
  } else {
    logger.warn('No PIGBUN_API_KEY found. Tools will require authentication.')
  }

  // Detect subscription mode and register tools dynamically
  let isMatrixMode = false
  try {
    const config = await guard.verifyAndGetConfig('mcp-startup')
    isMatrixMode = config.rednote.mode === 'matrix'
    logger.info(`Subscription mode: ${config.rednote.mode}, maxAccounts: ${config.rednote.maxAccounts}`)
  } catch (error) {
    logger.warn('Failed to verify subscription, falling back to personal mode', {
      error: error instanceof Error ? error.message : String(error)
    })
  }

  // Register tools with dynamic schema
  registerTools(server, isMatrixMode)
  logger.info(`Tools registered successfully (multi-account: ${isMatrixMode})`)

  // Register browser cleanup on process exit
  BrowserManager.registerProcessCleanup()

  // Start stdio logging
  const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

  // Wrap transport connection with error handling
  const transport = new StdioServerTransport()

  try {
    await server.connect(transport)
    const bootTime = Date.now() - startTime
    logger.info('RedNote MCP Server running on stdio', {
      bootTimeMs: bootTime,
      startedAt: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to connect MCP server transport', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }

  // Auto-start Matrix server in background AFTER MCP server is running
  let matrixServer: any = null
  setImmediate(() => {
    startMatrixServer(3001)
      .then((server) => {
        matrixServer = server
        logger.info('Matrix server started successfully on http://localhost:3001')
      })
      .catch((error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.info('Matrix server already running on port 3001')
        } else {
          logger.warn('Failed to start Matrix server, continuing without it', {
            error: error.message,
            code: error.code
          })
        }
      })
  })

  // Start subscription monitor
  const subscriptionMonitor = new SubscriptionMonitor()
  subscriptionMonitor.setModeChangeCallback((oldMode, newMode) => {
    logger.warn(`Subscription mode changed: ${oldMode} -> ${newMode}`)

    if (oldMode === 'matrix' && newMode === 'personal') {
      logger.warn('Subscription downgraded to personal mode', {
        action: 'Matrix features will be disabled',
        recommendation: 'Please upgrade your subscription to restore multi-account features'
      })

      // 触发降级处理
      handleDegradation(oldMode, newMode)

      // AccountHealthMonitor 会在 Matrix server 中自动停止
    } else if (oldMode === 'personal' && newMode === 'matrix') {
      logger.info('Subscription upgraded to matrix mode', {
        action: 'Multi-account features enabled'
      })
    }
  })
  subscriptionMonitor.start()

  // Cleanup on process exit
  process.on('exit', () => {
    logger.info('Process exiting', { uptime: process.uptime() })
    clearInterval(heartbeatInterval)
    stopLogging()
    subscriptionMonitor.stop()
    if (matrixServer) {
      try {
        matrixServer.close()
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  })

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully')
    clearInterval(heartbeatInterval)
    subscriptionMonitor.stop()
    if (matrixServer) {
      try {
        matrixServer.close()
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully')
    clearInterval(heartbeatInterval)
    subscriptionMonitor.stop()
    if (matrixServer) {
      try {
        matrixServer.close()
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    process.exit(0)
  })
}

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return `${hours}h ${minutes}m ${secs}s`
}

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  main().catch((error) => {
    logger.error('Fatal error in main():', error)
    process.exit(1)
  })
} else {
  const { Command } = require('commander')
  const program = new Command()

  program.name(name).description(description).version(version)

  program
    .command('init [timeout]')
    .description('Initialize and login to RedNote')
    .argument('[timeout]', 'Login timeout in seconds', (value: string) => parseInt(value, 10), LOGIN_TIMEOUT.DEFAULT)
    .usage('[options] [timeout]')
    .addHelpText('after', `
Examples:
  $ rednote-mcp init           # Login with default ${LOGIN_TIMEOUT.DEFAULT} seconds timeout
  $ rednote-mcp init 30        # Login with 30 seconds timeout
  $ rednote-mcp init --help    # Display help information

Notes:
  This command will launch a browser and open the RedNote login page.
  Please complete the login in the opened browser window.
  After successful login, the cookies will be automatically saved for future operations.
  The [timeout] parameter specifies the maximum waiting time (in seconds) for login, default is ${LOGIN_TIMEOUT.DEFAULT} seconds.
  The command will fail if the login is not completed within the specified timeout period.`)
    .action(async (timeout: number) => {
      logger.info(`Starting initialization process with timeout: ${timeout}s`)

      try {
        const authManager = new AuthManager()
        await authManager.login({ timeout })
        await authManager.cleanup()
        logger.info('Initialization successful')
        logger.info('Login successful! Cookie has been saved.')
        process.exit(0)
      } catch (error) {
        logger.error('Error during initialization:', error)
        logger.error('Error during initialization:', error)
        process.exit(1)
      }
    })

  program
    .command('pack-logs')
    .description('Pack all log files into a zip file')
    .action(async () => {
      try {
        const zipPath = await packLogs()
        logger.info(`日志已打包到: ${zipPath}`)
        process.exit(0)
      } catch (error) {
        logger.error('打包日志失败:', error)
        process.exit(1)
      }
    })

  program
    .command('open-logs')
    .description('Open the logs directory in file explorer')
    .action(async () => {
      try {
        let command
        switch (process.platform) {
          case 'darwin': // macOS
            command = `open "${LOGS_DIR}"`
            break
          case 'win32': // Windows
            command = `explorer "${LOGS_DIR}"`
            break
          case 'linux': // Linux
            command = `xdg-open "${LOGS_DIR}"`
            break
          default:
            throw new Error(`Unsupported platform: ${process.platform}`)
        }

        await execAsync(command)
        logger.info(`日志目录已打开: ${LOGS_DIR}`)
        process.exit(0)
      } catch (error) {
        logger.error('打开日志目录失败:', error)
        process.exit(1)
      }
    })

  program
    .command('matrix')
    .description('Start the Matrix multi-account management server')
    .option('-p, --port <port>', 'Port to run the server on', '3001')
    .action(async (options: { port: string }) => {
      try {
        const port = parseInt(options.port, 10)

        logger.info(`Starting Matrix server on port ${port}...`)
        const server = await startMatrixServer(port)

        logger.info(`\n🚀 Matrix server is running!`)
        logger.info(`   API: http://localhost:${port}`)
        logger.info(`   WebSocket: ws://localhost:${port}/ws`)
        logger.info(`\nPress Ctrl+C to stop the server.\n`)

        // Handle graceful shutdown
        process.on('SIGINT', () => {
          logger.info('\nShutting down Matrix server...')
          server.close(() => {
            logger.info('Matrix server stopped.')
            process.exit(0)
          })
        })
      } catch (error) {
        logger.error('Failed to start Matrix server:', error)
        logger.error('Failed to start Matrix server:', error)
        process.exit(1)
      }
    })

  program.parse(process.argv)
}
