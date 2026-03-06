import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { AnalyticsTools } from '../analyticsTools'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'
import { withAccountId } from '../../utils/toolUtils'

export function registerAnalyticsTools(server: McpServer, hasMultipleAccounts: boolean) {
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
}
