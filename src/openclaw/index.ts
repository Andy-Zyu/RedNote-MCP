/**
 * OpenClaw Plugin entry point for PigBun RedNote.
 *
 * Registers all RedNote tools via api.registerTool() so that
 * `openclaw plugins install` works out of the box.
 */

import { Type } from '@sinclair/typebox'
import { RedNoteTools } from '../tools/rednoteTools'
import { NoteManageTools } from '../tools/noteManageTools'
import { CommentTools } from '../tools/commentTools'
import { AnalyticsTools } from '../tools/analyticsTools'
import { EngagementTools } from '../tools/engagementTools'
import { NotificationTools } from '../tools/notificationTools'
import { BrowserManager } from '../browser/browserManager'
import { getGuard } from '../guard/apiKeyGuard'
import logger from '../utils/logger'

export default function register(api: any) {
  // Read API Key from plugin config and inject into env
  const config = api.config?.plugins?.entries?.['pigbun-rednote']?.config
  if (config?.apiKey && !process.env.PIGBUN_API_KEY) {
    process.env.PIGBUN_API_KEY = config.apiKey
  }

  // Register browser cleanup
  BrowserManager.registerProcessCleanup()

  // --- CLI commands ---
  api.registerCli(({ program }: any) => {
    const cmd = program.command('rednote')
    cmd
      .command('init')
      .description('Login to RedNote')
      .action(async () => {
        const { AuthManager } = await import('../auth/authManager')
        const auth = new AuthManager()
        try {
          await auth.login()
          console.log('Login successful!')
        } finally {
          await auth.cleanup()
        }
      })
  }, { commands: ['rednote'] })

  // --- Tools ---

  // 1. search_notes
  api.registerTool({
    name: 'search_notes',
    description: '根据关键词搜索笔记(返回的链接包含 xsec_token,可直接用于 get_note_content、get_note_comments 等工具)',
    parameters: Type.Object({
      keywords: Type.String({ description: '搜索关键词' }),
      limit: Type.Optional(Type.Number({ description: '返回结果数量限制' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('search_notes')
      const tools = new RedNoteTools()
      const notes = await tools.searchNotes(params.keywords, params.limit ?? 10)
      return {
        content: notes.map((note) => ({
          type: 'text',
          text: `标题: ${note.title}\n作者: ${note.author}\n内容: ${note.content}\n点赞: ${note.likes}\n评论: ${note.comments}\n链接: ${note.url}\n---`,
        })),
      }
    },
  })

  // 2. get_note_content
  api.registerTool({
    name: 'get_note_content',
    description: '获取笔记内容',
    parameters: Type.Object({
      url: Type.String({ description: '笔记 URL(必须使用 search_notes 返回的完整链接,包含 xsec_token 参数,否则会被反爬拦截)' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_note_content')
      const tools = new RedNoteTools()
      const note = await tools.getNoteContent(params.url)
      return { content: [{ type: 'text', text: JSON.stringify(note) }] }
    },
  })

  // 3. get_note_comments
  api.registerTool({
    name: 'get_note_comments',
    description: '获取笔记评论',
    parameters: Type.Object({
      url: Type.String({ description: '笔记 URL(必须使用 search_notes 返回的完整链接,包含 xsec_token 参数,否则会被反爬拦截)' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_note_comments')
      const tools = new RedNoteTools()
      const comments = await tools.getNoteComments(params.url)
      return {
        content: comments.map((c) => ({
          type: 'text',
          text: `作者: ${c.author}\n内容: ${c.content}\n点赞: ${c.likes}\n时间: ${c.time}\n---`,
        })),
      }
    },
  })

  // 4. publish_note
  api.registerTool({
    name: 'publish_note',
    description: '发布小红书笔记(图文笔记,必须提供至少一张图片)',
    parameters: Type.Object({
      title: Type.String({ description: '笔记标题(最多20字)' }),
      content: Type.String({ description: '笔记正文' }),
      images: Type.Array(Type.String(), { description: '图片文件路径数组(本地绝对路径,至少1张,小红书要求图文笔记必须有图片)', minItems: 1 }),
      tags: Type.Optional(Type.Array(Type.String(), { description: '标签/话题数组' })),
      keepAlive: Type.Optional(Type.Boolean({ description: '发布后是否保持浏览器打开(用于连续发布多篇笔记)' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('publish_note')
      const tools = new RedNoteTools()
      const result = await tools.publishNote(params)
      return { content: [{ type: 'text', text: result.message }] }
    },
  })

  // 5. publish_note_video
  api.registerTool({
    name: 'publish_note_video',
    description: '发布小红书视频笔记(必须提供一个视频文件)',
    parameters: Type.Object({
      title: Type.String({ description: '笔记标题(最多20字)' }),
      content: Type.String({ description: '笔记正文' }),
      video: Type.String({ description: '视频文件路径(本地绝对路径)' }),
      tags: Type.Optional(Type.Array(Type.String(), { description: '标签/话题数组' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('publish_note_video')
      const tools = new RedNoteTools()
      const result = await tools.publishVideoNote(params)
      return { content: [{ type: 'text', text: result.message }] }
    },
  })

  // 6. publish_note_text
  api.registerTool({
    name: 'publish_note_text',
    description: '发布小红书纯文字笔记(无需图片或视频,自动生成封面图)',
    parameters: Type.Object({
      title: Type.String({ description: '笔记标题(最多20字)' }),
      content: Type.String({ description: '笔记正文' }),
      tags: Type.Optional(Type.Array(Type.String(), { description: '标签/话题数组' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('publish_note_text')
      const tools = new RedNoteTools()
      const result = await tools.publishTextNote(params)
      return { content: [{ type: 'text', text: result.message }] }
    },
  })

  // 7. publish_note_article
  api.registerTool({
    name: 'publish_note_article',
    description: '发布小红书长文笔记(适合长篇内容,标题无字数限制)',
    parameters: Type.Object({
      title: Type.String({ description: '笔记标题' }),
      content: Type.String({ description: '笔记正文(支持长篇内容)' }),
      tags: Type.Optional(Type.Array(Type.String(), { description: '标签/话题数组' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('publish_note_article')
      const tools = new RedNoteTools()
      const result = await tools.publishArticle(params)
      return { content: [{ type: 'text', text: result.message }] }
    },
  })

  // 8. get_dashboard_overview
  api.registerTool({
    name: 'get_dashboard_overview',
    description: '获取创作者中心账号数据总览(曝光、观看、互动、涨粉等)',
    parameters: Type.Object({
      period: Type.Optional(Type.Union([Type.Literal('7days'), Type.Literal('30days')], { description: '统计周期,默认近7日' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_dashboard_overview')
      const tools = new RedNoteTools()
      const data = await tools.getDashboardOverview(params.period ?? '7days')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    },
  })

  // 9. get_content_analytics
  api.registerTool({
    name: 'get_content_analytics',
    description: '获取内容分析数据(每篇笔记的曝光、观看、点赞、评论、收藏等详细数据)',
    parameters: Type.Object({
      startDate: Type.Optional(Type.String({ description: '开始日期,格式 YYYY-MM-DD' })),
      endDate: Type.Optional(Type.String({ description: '结束日期,格式 YYYY-MM-DD' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_content_analytics')
      const tools = new RedNoteTools()
      const data = await tools.getContentAnalytics({ startDate: params.startDate, endDate: params.endDate })
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    },
  })

  // 10. get_fans_analytics
  api.registerTool({
    name: 'get_fans_analytics',
    description: '获取粉丝数据(总粉丝数、新增/流失粉丝、粉丝画像、活跃粉丝)',
    parameters: Type.Object({
      period: Type.Optional(Type.Union([Type.Literal('7days'), Type.Literal('30days')], { description: '统计周期,默认近7天' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_fans_analytics')
      const tools = new RedNoteTools()
      const data = await tools.getFansAnalytics(params.period ?? '7days')
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    },
  })

  // 11. login
  api.registerTool({
    name: 'login',
    description: '登录小红书账号',
    parameters: Type.Object({}),
    async execute() {
      await getGuard().verify('login')
      const { AuthManager } = await import('../auth/authManager')
      const authManager = new AuthManager()
      try {
        await authManager.login()
        return { content: [{ type: 'text', text: '登录成功! Cookie 已保存。' }] }
      } finally {
        await authManager.cleanup()
      }
    },
  })

  // 12. get_my_notes
  api.registerTool({
    name: 'get_my_notes',
    description: '获取自己的笔记列表(创作者中心)',
    parameters: Type.Object({}),
    async execute() {
      await getGuard().verify('get_my_notes')
      const tools = new NoteManageTools()
      const data = await tools.getMyNotes()
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    },
  })

  // 13. edit_note
  api.registerTool({
    name: 'edit_note',
    description: '编辑已发布的笔记(标题、正文、标签)',
    parameters: Type.Object({
      noteId: Type.String({ description: '笔记 ID 或标题关键词' }),
      title: Type.Optional(Type.String({ description: '新标题(最多20字)' })),
      content: Type.Optional(Type.String({ description: '新正文内容' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: '新标签数组' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('edit_note')
      const tools = new NoteManageTools()
      const result = await tools.editNote(params)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 14. delete_note
  api.registerTool({
    name: 'delete_note',
    description: '删除已发布的笔记',
    parameters: Type.Object({
      noteId: Type.String({ description: '笔记 ID 或标题关键词' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('delete_note')
      const tools = new NoteManageTools()
      const result = await tools.deleteNote(params.noteId)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 15. comment_note
  api.registerTool({
    name: 'comment_note',
    description: '在笔记下发表评论(一级评论)',
    parameters: Type.Object({
      noteUrl: Type.String({ description: '笔记 URL(必须使用 search_notes 返回的完整链接,包含 xsec_token 参数)' }),
      content: Type.String({ description: '评论内容' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('comment_note')
      const tools = new CommentTools()
      const result = await tools.commentNote({ noteUrl: params.noteUrl, content: params.content })
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 16. reply_comment
  api.registerTool({
    name: 'reply_comment',
    description: '回复笔记下的评论',
    parameters: Type.Object({
      noteUrl: Type.String({ description: '笔记 URL' }),
      commentAuthor: Type.String({ description: '要回复的评论作者名' }),
      commentContent: Type.String({ description: '要回复的评论内容片段(用于定位)' }),
      replyText: Type.String({ description: '回复内容' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('reply_comment')
      const tools = new CommentTools()
      const result = await tools.replyComment(params)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 17. filter_comments
  api.registerTool({
    name: 'filter_comments',
    description: '对笔记评论进行情感分类(正面/负面/问题/建议/中性)',
    parameters: Type.Object({
      noteUrl: Type.String({ description: '笔记 URL' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('filter_comments')
      const tools = new CommentTools()
      const result = await tools.filterComments(params.noteUrl)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 18. like_note
  api.registerTool({
    name: 'like_note',
    description: '给笔记点赞',
    parameters: Type.Object({
      noteUrl: Type.String({ description: '笔记 URL' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('like_note')
      const tools = new EngagementTools()
      const result = await tools.likeNote(params.noteUrl)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 19. collect_note
  api.registerTool({
    name: 'collect_note',
    description: '收藏笔记',
    parameters: Type.Object({
      noteUrl: Type.String({ description: '笔记 URL' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('collect_note')
      const tools = new EngagementTools()
      const result = await tools.collectNote(params.noteUrl)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 20. follow_author
  api.registerTool({
    name: 'follow_author',
    description: '关注笔记作者',
    parameters: Type.Object({
      noteUrl: Type.String({ description: '笔记 URL(通过笔记页面关注该作者)' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('follow_author')
      const tools = new EngagementTools()
      const result = await tools.followAuthor(params.noteUrl)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 21. discover_trending
  api.registerTool({
    name: 'discover_trending',
    description: '发现热门话题(输入多个关键词,分析各话题热度)',
    parameters: Type.Object({
      keywords: Type.Array(Type.String(), { description: '要分析的关键词数组' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('discover_trending')
      const tools = new AnalyticsTools()
      const result = await tools.discoverTrending(params.keywords)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 22. analyze_best_publish_time
  api.registerTool({
    name: 'analyze_best_publish_time',
    description: '分析最佳发布时间(基于历史笔记数据)',
    parameters: Type.Object({}),
    async execute() {
      await getGuard().verify('analyze_best_publish_time')
      const tools = new AnalyticsTools()
      const result = await tools.analyzeBestPublishTime()
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 23. generate_content_report
  api.registerTool({
    name: 'generate_content_report',
    description: '生成综合运营报告(汇总数据看板、内容分析、粉丝数据)',
    parameters: Type.Object({
      period: Type.Optional(Type.Union([Type.Literal('7days'), Type.Literal('30days')], { description: '统计周期,默认近7日' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('generate_content_report')
      const tools = new AnalyticsTools()
      const result = await tools.generateContentReport(params.period ?? '7days')
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 24. get_inspiration_topics
  api.registerTool({
    name: 'get_inspiration_topics',
    description: '获取笔记灵感话题(经典热门话题,含参与人数、浏览量和热门笔记示例)',
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: '话题分类:美食、美妆、时尚、出行、知识、兴趣爱好。不传默认美食' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_inspiration_topics')
      const tools = new AnalyticsTools()
      const result = await tools.getInspirationTopics(params.category)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 25. get_activity_center
  api.registerTool({
    name: 'get_activity_center',
    description: '获取活动中心数据(官方活动列表,含流量扶持、活动奖励、参与话题等信息)',
    parameters: Type.Object({}),
    async execute() {
      await getGuard().verify('get_activity_center')
      const tools = new AnalyticsTools()
      const result = await tools.getActivityCenter()
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })

  // 26. get_notifications
  api.registerTool({
    name: 'get_notifications',
    description: '获取通知消息(评论和@、赞和收藏、新增关注)',
    parameters: Type.Object({
      tab: Type.Optional(Type.Union([Type.Literal('comments'), Type.Literal('likes'), Type.Literal('follows')], { description: '通知类型:comments=评论和@, likes=赞和收藏, follows=新增关注。不传则获取全部' })),
      limit: Type.Optional(Type.Number({ description: '每个标签页返回的通知数量限制,默认20' })),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_notifications')
      const tools = new NotificationTools()
      const results = await tools.getNotifications(params.tab, params.limit ?? 20)
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
    },
  })

  // 27. get_share_link
  api.registerTool({
    name: 'get_share_link',
    description: '获取笔记的分享链接(支持笔记URL或笔记ID)',
    parameters: Type.Object({
      noteId: Type.String({ description: '笔记 ID 或笔记 URL' }),
    }),
    async execute(_id: string, params: any) {
      await getGuard().verify('get_share_link')
      const idMatch = params.noteId.match(/explore\/([a-f0-9]+)/) || params.noteId.match(/^([a-f0-9]{24})$/)
      const extractedId = idMatch ? idMatch[1] : params.noteId
      const result = {
        noteId: extractedId,
        webUrl: `https://www.xiaohongshu.com/explore/${extractedId}`,
        appUrl: `xhsdiscover://item/${extractedId}`,
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    },
  })
}
