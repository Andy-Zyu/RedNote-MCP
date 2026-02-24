#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { AuthManager } from './auth/authManager'
import { RedNoteTools } from './tools/rednoteTools'
import { NoteManageTools } from './tools/noteManageTools'
import { CommentTools } from './tools/commentTools'
import { AnalyticsTools } from './tools/analyticsTools'
import { EngagementTools } from './tools/engagementTools'
import { NotificationTools } from './tools/notificationTools'
import { BrowserManager } from './browser/browserManager'
import logger, { LOGS_DIR, packLogs } from './utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createStdioLogger } from './utils/stdioLogger'

const execAsync = promisify(exec)

const name = 'rednote'
const description =
  'A friendly tool to help you access and interact with Xiaohongshu (RedNote) content through Model Context Protocol.'
const version = '0.2.3'

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

// Register tools
server.tool(
  'search_notes',
  '根据关键词搜索笔记',
  {
    keywords: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('返回结果数量限制')
  },
  async ({ keywords, limit = 10 }: { keywords: string; limit?: number }) => {
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
    try {
      const tools = new RedNoteTools()
      const notes = await tools.searchNotes(keywords, limit)
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
  }
)

server.tool(
  'get_note_content',
  '获取笔记内容',
  {
    url: z.string().describe('笔记 URL')
  },
  async ({ url }: { url: string }) => {
    logger.info(`Getting note content for URL: ${url}`)
    try {
      const tools = new RedNoteTools()
      const note = await tools.getNoteContent(url)
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
  {
    url: z.string().describe('笔记 URL')
  },
  async ({ url }: { url: string }) => {
    logger.info(`Getting comments for URL: ${url}`)
    try {
      const tools = new RedNoteTools()
      const comments = await tools.getNoteComments(url)
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
  '发布小红书笔记（图文或纯文字）',
  {
    title: z.string().describe('笔记标题（最多20字）'),
    content: z.string().describe('笔记正文'),
    images: z.array(z.string()).optional().describe('图片文件路径数组（本地绝对路径）'),
    tags: z.array(z.string()).optional().describe('标签/话题数组'),
    keepAlive: z.boolean().optional().describe('发布后是否保持浏览器打开（用于连续发布多篇笔记）')
  },
  async ({ title, content, images, tags, keepAlive }: { title: string; content: string; images?: string[]; tags?: string[]; keepAlive?: boolean }) => {
    logger.info(`Publishing note: ${title}`)
    try {
      const tools = new RedNoteTools()
      const result = await tools.publishNote({ title, content, images, tags, keepAlive })
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

// Dashboard tools
server.tool(
  'get_dashboard_overview',
  '获取创作者中心账号数据总览（曝光、观看、互动、涨粉等）',
  {
    period: z.enum(['7days', '30days']).optional().describe('统计周期，默认近7日')
  },
  async ({ period = '7days' }: { period?: string }) => {
    logger.info(`Getting dashboard overview for period: ${period}`)
    try {
      const tools = new RedNoteTools()
      const data = await tools.getDashboardOverview(period)
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
  {
    startDate: z.string().optional().describe('开始日期，格式 YYYY-MM-DD'),
    endDate: z.string().optional().describe('结束日期，格式 YYYY-MM-DD')
  },
  async ({ startDate, endDate }: { startDate?: string; endDate?: string }) => {
    logger.info('Getting content analytics')
    try {
      const tools = new RedNoteTools()
      const data = await tools.getContentAnalytics({ startDate, endDate })
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
  {
    period: z.enum(['7days', '30days']).optional().describe('统计周期，默认近7天')
  },
  async ({ period = '7days' }: { period?: string }) => {
    logger.info(`Getting fans analytics for period: ${period}`)
    try {
      const tools = new RedNoteTools()
      const data = await tools.getFansAnalytics(period)
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
server.tool('login', '登录小红书账号', {}, async () => {
  logger.info('Starting login process')
  const authManager = new AuthManager()
  try {
    await authManager.login()
    logger.info('Login successful')
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
  {},
  async () => {
    logger.info('Getting my notes')
    try {
      const tools = new NoteManageTools()
      const data = await tools.getMyNotes()
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
  {
    noteId: z.string().describe('笔记 ID 或标题关键词'),
    title: z.string().optional().describe('新标题（最多20字）'),
    content: z.string().optional().describe('新正文内容'),
    tags: z.array(z.string()).optional().describe('新标签数组'),
  },
  async ({ noteId, title, content, tags }: { noteId: string; title?: string; content?: string; tags?: string[] }) => {
    logger.info(`Editing note: ${noteId}`)
    try {
      const tools = new NoteManageTools()
      const result = await tools.editNote({ noteId, title, content, tags })
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
  {
    noteId: z.string().describe('笔记 ID 或标题关键词'),
  },
  async ({ noteId }: { noteId: string }) => {
    logger.info(`Deleting note: ${noteId}`)
    try {
      const tools = new NoteManageTools()
      const result = await tools.deleteNote(noteId)
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
  'reply_comment',
  '回复笔记下的评论',
  {
    noteUrl: z.string().describe('笔记 URL'),
    commentAuthor: z.string().describe('要回复的评论作者名'),
    commentContent: z.string().describe('要回复的评论内容片段（用于定位）'),
    replyText: z.string().describe('回复内容'),
  },
  async ({ noteUrl, commentAuthor, commentContent, replyText }: { noteUrl: string; commentAuthor: string; commentContent: string; replyText: string }) => {
    logger.info(`Replying to comment by ${commentAuthor}`)
    try {
      const tools = new CommentTools()
      const result = await tools.replyComment({ noteUrl, commentAuthor, commentContent, replyText })
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
  {
    noteUrl: z.string().describe('笔记 URL'),
  },
  async ({ noteUrl }: { noteUrl: string }) => {
    logger.info(`Filtering comments for: ${noteUrl}`)
    try {
      const tools = new CommentTools()
      const result = await tools.filterComments(noteUrl)
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
  {
    noteUrl: z.string().describe('笔记 URL'),
  },
  async ({ noteUrl }: { noteUrl: string }) => {
    logger.info(`Liking note: ${noteUrl}`)
    try {
      const tools = new EngagementTools()
      const result = await tools.likeNote(noteUrl)
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
  {
    noteUrl: z.string().describe('笔记 URL'),
  },
  async ({ noteUrl }: { noteUrl: string }) => {
    logger.info(`Collecting note: ${noteUrl}`)
    try {
      const tools = new EngagementTools()
      const result = await tools.collectNote(noteUrl)
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
  {
    noteUrl: z.string().describe('笔记 URL（通过笔记页面关注该作者）'),
  },
  async ({ noteUrl }: { noteUrl: string }) => {
    logger.info(`Following author from note: ${noteUrl}`)
    try {
      const tools = new EngagementTools()
      const result = await tools.followAuthor(noteUrl)
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
  {
    keywords: z.array(z.string()).describe('要分析的关键词数组'),
  },
  async ({ keywords }: { keywords: string[] }) => {
    logger.info(`Discovering trending for ${keywords.length} keywords`)
    try {
      const tools = new AnalyticsTools()
      const result = await tools.discoverTrending(keywords)
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
  {},
  async () => {
    logger.info('Analyzing best publish time')
    try {
      const tools = new AnalyticsTools()
      const result = await tools.analyzeBestPublishTime()
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
  {
    period: z.enum(['7days', '30days']).optional().describe('统计周期，默认近7日'),
  },
  async ({ period = '7days' }: { period?: string }) => {
    logger.info(`Generating content report for period: ${period}`)
    try {
      const tools = new AnalyticsTools()
      const result = await tools.generateContentReport(period)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }
    } catch (error) {
      logger.error('Error generating content report:', error)
      throw error
    }
  }
)

// === Notification Tools ===

server.tool(
  'get_notifications',
  '获取通知消息（评论和@、赞和收藏、新增关注）',
  {
    tab: z.enum(['comments', 'likes', 'follows']).optional().describe('通知类型：comments=评论和@, likes=赞和收藏, follows=新增关注。不传则获取全部'),
    limit: z.number().optional().describe('每个标签页返回的通知数量限制，默认20'),
  },
  async ({ tab, limit = 20 }: { tab?: 'comments' | 'likes' | 'follows'; limit?: number }) => {
    logger.info(`Getting notifications, tab: ${tab || 'all'}, limit: ${limit}`)
    try {
      const tools = new NotificationTools()
      const results = await tools.getNotifications(tab, limit)
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
  async ({ noteId }: { noteId: string }) => {
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

// Start the server
async function main() {
  logger.info('Starting RedNote MCP Server')

  // Register browser cleanup on process exit
  BrowserManager.registerProcessCleanup()

  // Start stdio logging
  const stopLogging = createStdioLogger(`${LOGS_DIR}/stdio.log`)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('RedNote MCP Server running on stdio')

  // Cleanup on process exit
  process.on('exit', () => {
    stopLogging()
  })
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
    .argument('[timeout]', 'Login timeout in seconds', (value: string) => parseInt(value, 10), 10)
    .usage('[options] [timeout]')
    .addHelpText('after', `
Examples:
  $ rednote-mcp init           # Login with default 10 seconds timeout
  $ rednote-mcp init 30        # Login with 30 seconds timeout
  $ rednote-mcp init --help    # Display help information

Notes:
  This command will launch a browser and open the RedNote login page.
  Please complete the login in the opened browser window.
  After successful login, the cookies will be automatically saved for future operations.
  The [timeout] parameter specifies the maximum waiting time (in seconds) for login, default is 10 seconds.
  The command will fail if the login is not completed within the specified timeout period.`)
    .action(async (timeout: number) => {
      logger.info(`Starting initialization process with timeout: ${timeout}s`)

      try {
        const authManager = new AuthManager()
        await authManager.login({ timeout })
        await authManager.cleanup()
        logger.info('Initialization successful')
        console.log('Login successful! Cookie has been saved.')
        process.exit(0)
      } catch (error) {
        logger.error('Error during initialization:', error)
        console.error('Error during initialization:', error)
        process.exit(1)
      }
    })

  program
    .command('pack-logs')
    .description('Pack all log files into a zip file')
    .action(async () => {
      try {
        const zipPath = await packLogs()
        console.log(`日志已打包到: ${zipPath}`)
        process.exit(0)
      } catch (error) {
        console.error('打包日志失败:', error)
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
        console.log(`日志目录已打开: ${LOGS_DIR}`)
        process.exit(0)
      } catch (error) {
        console.error('打开日志目录失败:', error)
        process.exit(1)
      }
    })

  program.parse(process.argv)
}
