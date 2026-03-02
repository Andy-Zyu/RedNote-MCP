import logger from '../utils/logger'
import { BaseTools } from './baseTools'
import { RedNoteTools } from './rednoteTools'
import {
  Note,
  NoteAnalytics,
  TrendingTopic,
  DiscoverTrendingResult,
  TimeSlotPerformance,
  BestPublishTimeResult,
  ContentReport,
  InspirationTopic,
  InspirationResult,
  ActivityItem,
  ActivityCenterResult,
} from './types'

export class AnalyticsTools extends BaseTools {
  async discoverTrending(keywords: string[], accountId?: string): Promise<DiscoverTrendingResult> {
    logger.info(`Discovering trending topics for ${keywords.length} keywords`)
    const tools = new RedNoteTools()

    const topics: TrendingTopic[] = []

    for (const keyword of keywords) {
      try {
        const notes = await tools.searchNotes(keyword, 10, accountId)
        if (notes.length === 0) continue

        const totalLikes = notes.reduce((sum, n) => sum + (n.likes ?? 0), 0)
        const totalCollects = notes.reduce((sum, n) => sum + (n.collects ?? 0), 0)
        const totalComments = notes.reduce((sum, n) => sum + (n.comments ?? 0), 0)
        const avgLikes = Math.round(totalLikes / notes.length)
        const avgCollects = Math.round(totalCollects / notes.length)
        const avgComments = Math.round(totalComments / notes.length)

        // Hot score: likes*1 + collects*2 + comments*3
        const hotScore = avgLikes + avgCollects * 2 + avgComments * 3

        topics.push({
          keyword,
          totalNotes: notes.length,
          avgLikes,
          avgCollects,
          avgComments,
          hotScore,
          topNotes: notes.slice(0, 3),
        })
      } catch (error) {
        logger.warn(`Failed to search keyword "${keyword}":`, error)
      }
    }

    // Sort by hot score descending
    topics.sort((a, b) => b.hotScore - a.hotScore)

    logger.info(`Discovered ${topics.length} trending topics`)
    return {
      topics,
      analyzedAt: new Date().toISOString(),
    }
  }

  async analyzeBestPublishTime(accountId?: string): Promise<BestPublishTimeResult> {
    logger.info('Analyzing best publish time')
    const tools = new RedNoteTools()
    const analytics = await tools.getContentAnalytics({ accountId })

    const timeSlots = new Map<string, {
      impressions: number[]
      likes: number[]
      comments: number[]
    }>()

    let analyzedCount = 0

    for (const note of analytics.notes) {
      if (!note.publishTime) continue

      // Extract hour from publishTime (format: "2024-02-23 14:30" or similar)
      const hourMatch = note.publishTime.match(/(\d{1,2}):\d{2}/)
      if (!hourMatch) continue

      const hour = parseInt(hourMatch[1], 10)
      // Group into 2-hour slots
      const slotStart = Math.floor(hour / 2) * 2
      const slotEnd = slotStart + 2
      const slotKey = `${String(slotStart).padStart(2, '0')}:00-${String(slotEnd).padStart(2, '0')}:00`

      if (!timeSlots.has(slotKey)) {
        timeSlots.set(slotKey, { impressions: [], likes: [], comments: [] })
      }

      const slot = timeSlots.get(slotKey)!
      slot.impressions.push(this.parseMetric(note.impressions))
      slot.likes.push(this.parseMetric(note.likes))
      slot.comments.push(this.parseMetric(note.comments))
      analyzedCount++
    }

    const performances: TimeSlotPerformance[] = []

    for (const [timeSlot, data] of timeSlots) {
      const noteCount = data.impressions.length
      const avgImpressions = Math.round(this.avg(data.impressions))
      const avgLikes = Math.round(this.avg(data.likes))
      const avgComments = Math.round(this.avg(data.comments))
      // Performance score weighted: impressions*1 + likes*5 + comments*10
      const performanceScore = avgImpressions + avgLikes * 5 + avgComments * 10

      performances.push({
        timeSlot,
        noteCount,
        avgImpressions,
        avgLikes,
        avgComments,
        performanceScore,
      })
    }

    performances.sort((a, b) => b.performanceScore - a.performanceScore)

    const bestTimeSlots = performances.slice(0, 3)
    const worstTimeSlots = performances.length > 3
      ? performances.slice(-3).reverse()
      : []

    const recommendation = bestTimeSlots.length > 0
      ? `建议在 ${bestTimeSlots.map(s => s.timeSlot).join('、')} 时段发布，这些时段的平均表现最佳。`
      : '数据不足，建议积累更多发布数据后再分析。'

    logger.info(`Analyzed ${analyzedCount} notes across ${performances.length} time slots`)
    return {
      bestTimeSlots,
      worstTimeSlots,
      recommendation,
      analyzedNoteCount: analyzedCount,
    }
  }

  async generateContentReport(period: string = '7days', accountId?: string): Promise<ContentReport> {
    logger.info(`Generating content report for period: ${period}`)
    const tools = new RedNoteTools()

    // Fetch data sources sequentially — each call triggers SSO navigation
    // which opens a new creator tab. Concurrent SSO flows on the same
    // BrowserContext cause net::ERR_ABORTED because the main page gets
    // navigated away while another lease is still using it.
    const dashboard = await tools.getDashboardOverview(period, accountId)
    const contentAnalytics = await tools.getContentAnalytics({ accountId })
    const fansAnalytics = await tools.getFansAnalytics(period, accountId)

    // Aggregate content metrics
    const notes = contentAnalytics.notes
    let totalImpressions = 0
    let totalViews = 0
    let totalLikes = 0
    let totalComments = 0
    let totalCollects = 0
    let totalShares = 0

    for (const note of notes) {
      totalImpressions += this.parseMetric(note.impressions)
      totalViews += this.parseMetric(note.views)
      totalLikes += this.parseMetric(note.likes)
      totalComments += this.parseMetric(note.comments)
      totalCollects += this.parseMetric(note.collects)
      totalShares += this.parseMetric(note.shares)
    }

    const totalEngagement = totalLikes + totalComments + totalCollects + totalShares
    const avgEngagementRate = totalImpressions > 0
      ? Math.round((totalEngagement / totalImpressions) * 10000) / 100
      : 0

    // Sort notes by engagement for top/bottom performers
    const sortedNotes = [...notes].sort((a, b) => {
      const engA = this.parseMetric(a.likes) + this.parseMetric(a.comments) + this.parseMetric(a.collects)
      const engB = this.parseMetric(b.likes) + this.parseMetric(b.comments) + this.parseMetric(b.collects)
      return engB - engA
    })

    const topPerformingNotes = sortedNotes.slice(0, 3)
    const underPerformingNotes = sortedNotes.length > 3
      ? sortedNotes.slice(-3).reverse()
      : []

    // Fans insight
    const fansGrowth = typeof fansAnalytics.overview.newFans === 'number'
      ? fansAnalytics.overview.newFans
      : parseInt(String(fansAnalytics.overview.newFans), 10) || 0

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      avgEngagementRate, totalImpressions, fansGrowth, notes.length
    )

    logger.info('Content report generated successfully')
    return {
      period,
      generatedAt: new Date().toISOString(),
      overview: {
        totalImpressions,
        totalViews,
        totalLikes,
        totalComments,
        totalCollects,
        totalShares,
        avgEngagementRate,
        fansGrowth,
      },
      topPerformingNotes,
      underPerformingNotes,
      fansInsight: {
        totalFans: String(fansAnalytics.overview.totalFans),
        newFans: String(fansAnalytics.overview.newFans),
        lostFans: String(fansAnalytics.overview.lostFans),
        netGrowth: String(dashboard.followers.netGain.value),
      },
      recommendations,
    }
  }

  async getInspirationTopics(category?: string, accountId?: string): Promise<InspirationResult> {
    const targetCategory = category || '美食'
    logger.info(`Getting inspiration topics for category: ${targetCategory}`)

    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/new/inspiration?source=official',
      async (creatorPage) => {
        await this.randomDelay(2, 3)

        // Click the target category tab if not default
        if (targetCategory !== '美食') {
          const tab = creatorPage.locator(`.d-tabs-header:has-text("${targetCategory}")`).first()
          if (await tab.count() > 0) {
            await tab.click()
            await this.randomDelay(2, 3)
          } else {
            logger.warn(`Category "${targetCategory}" not found, using default`)
          }
        }

        // Parse topics from the page text
        const pageText = await creatorPage.evaluate(() => {
          const container = document.querySelector('.classic-topics-container, [class*="topics-container"]')
          return container ? (container as HTMLElement).innerText : document.body.innerText
        })

        const topics = this.parseInspirationTopics(pageText)
        logger.info(`Parsed ${topics.length} inspiration topics for ${targetCategory}`)

        return {
          category: targetCategory,
          topics,
        }
      },
      accountId
    )
  }

  async getActivityCenter(accountId?: string): Promise<ActivityCenterResult> {
    logger.info('Fetching activity center data')

    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/new/events?source=official',
      async (creatorPage) => {
        // Intercept the activity_center/list API response
        const apiPromise = creatorPage.waitForResponse(
          res => res.url().includes('activity_center/list') && res.status() === 200,
          { timeout: 30000 }
        )

        // Reload to ensure we capture the API call
        await creatorPage.reload({ waitUntil: 'domcontentloaded' })

        const response = await apiPromise
        const json = await response.json()

        if (!json.success || json.code !== 0) {
          throw new Error(`Activity center API failed: ${json.msg || 'unknown error'}`)
        }

        const data = json.data
        const rawList: any[] = data.activity_list || []
        const focusTotal: number = data.focus_total || 0

        const activities: ActivityItem[] = rawList.map((item: any) => {
          const topics = (item.topic_infos || []).map((t: any) => ({
            id: t.id || '',
            name: t.name || '',
            link: t.link || '',
          }))

          const startDate = item.start_time ? new Date(item.start_time).toISOString().split('T')[0] : ''
          const endDate = item.end_time ? new Date(item.end_time).toISOString().split('T')[0] : ''

          // activity_status: 1 = ongoing, 2 = ended, 0 = upcoming
          let status = '进行中'
          if (item.activity_status === 2) status = '已结束'
          else if (item.activity_status === 0) status = '未开始'

          return {
            activityId: item.activity_id || 0,
            title: topics.length > 0 ? topics[0].name : `活动${item.activity_id}`,
            reward: item.activity_reward || '',
            startTime: startDate,
            endTime: endDate,
            status,
            pictureUrl: item.picture_link || '',
            activityLink: item.activity_link || '',
            postLink: item.pc_post_link || '',
            topics,
            isFocused: item.focus_status === 1,
          }
        })

        logger.info(`Fetched ${activities.length} activities (${focusTotal} focused)`)
        return {
          activities,
          totalCount: activities.length,
          focusedCount: focusTotal,
        }
      },
      accountId
    )
  }

  private parseInspirationTopics(text: string): InspirationTopic[] {
    const topics: InspirationTopic[] = []
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

    // Skip header lines (经典话题, description, category tabs)
    let i = 0
    // Skip until we find a topic name (followed by participants line)
    while (i < lines.length) {
      // A topic block looks like:
      //   话题名
      //   28.4万人参与 · 13.8亿次浏览
      //   6.8万
      //   笔记标题1
      //   8477
      //   笔记标题2
      //   ...
      const participantsMatch = i + 1 < lines.length && lines[i + 1].match(/[\d.]+万?人参与/)
      if (participantsMatch) {
        const name = lines[i]
        const statsLine = lines[i + 1]
        const pMatch = statsLine.match(/([\d.]+万?)人参与/)
        const vMatch = statsLine.match(/([\d.]+[万亿]?)次浏览/)
        const participants = pMatch ? pMatch[1] : ''
        const views = vMatch ? vMatch[1] : ''

        // Parse top notes (pairs of likes + title, or title + likes)
        const topNotes: { title: string; likes: string }[] = []
        let j = i + 2
        while (j < lines.length && topNotes.length < 4) {
          // Check if next line is a participants line (start of new topic)
          if (j + 1 < lines.length && lines[j + 1].match(/[\d.]+万?人参与/)) break

          const likesStr = lines[j]
          // Likes line is a number like "6.8万" or "8477"
          if (likesStr.match(/^[\d.]+万?$/)) {
            // Next line should be the title
            if (j + 1 < lines.length) {
              topNotes.push({ title: lines[j + 1], likes: likesStr })
              j += 2
            } else {
              j++
            }
          } else {
            // Could be a title followed by likes, or just skip
            j++
          }
        }

        topics.push({ name, participants, views, topNotes })
        i = j
      } else {
        i++
      }
    }

    return topics
  }

  private parseMetric(value: string | number | undefined): number {
    if (value === undefined) return 0
    if (typeof value === 'number') return value
    // Handle Chinese units like "1.2万"
    const str = value.replace(/,/g, '')
    if (str.includes('万')) {
      return Math.round(parseFloat(str.replace('万', '')) * 10000)
    }
    return parseInt(str, 10) || 0
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0
    return arr.reduce((sum, v) => sum + v, 0) / arr.length
  }

  private generateRecommendations(
    engagementRate: number,
    totalImpressions: number,
    fansGrowth: number,
    noteCount: number
  ): string[] {
    const recs: string[] = []

    if (noteCount === 0) {
      recs.push('本周期内没有发布笔记，建议保持稳定的发布频率。')
      return recs
    }

    if (engagementRate < 3) {
      recs.push('互动率偏低（< 3%），建议优化封面和标题以提高点击率，在正文中增加互动引导。')
    } else if (engagementRate > 8) {
      recs.push('互动率表现优秀（> 8%），继续保持当前内容风格。')
    }

    if (totalImpressions < 1000 * noteCount) {
      recs.push('平均曝光量偏低，建议优化标签策略，使用热门话题标签增加曝光。')
    }

    if (fansGrowth <= 0) {
      recs.push('粉丝增长停滞或流失，建议增加互动频率，回复评论，发布更多用户感兴趣的内容。')
    } else if (fansGrowth > 100) {
      recs.push('粉丝增长势头良好，建议趁热打铁增加发布频率。')
    }

    if (noteCount < 3) {
      recs.push('发布频率偏低，建议每周至少发布 3-5 篇笔记以维持账号活跃度。')
    }

    if (recs.length === 0) {
      recs.push('各项数据表现均衡，建议持续当前策略并关注热门话题。')
    }

    return recs
  }
}
