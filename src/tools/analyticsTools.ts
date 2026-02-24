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
} from './types'

export class AnalyticsTools extends BaseTools {
  async discoverTrending(keywords: string[]): Promise<DiscoverTrendingResult> {
    logger.info(`Discovering trending topics for ${keywords.length} keywords`)
    const tools = new RedNoteTools()

    const topics: TrendingTopic[] = []

    for (const keyword of keywords) {
      try {
        const notes = await tools.searchNotes(keyword, 10)
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

  async analyzeBestPublishTime(): Promise<BestPublishTimeResult> {
    logger.info('Analyzing best publish time')
    const tools = new RedNoteTools()
    const analytics = await tools.getContentAnalytics()

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

  async generateContentReport(period: string = '7days'): Promise<ContentReport> {
    logger.info(`Generating content report for period: ${period}`)
    const tools = new RedNoteTools()

    // Fetch data sources sequentially — each call triggers SSO navigation
    // which opens a new creator tab. Concurrent SSO flows on the same
    // BrowserContext cause net::ERR_ABORTED because the main page gets
    // navigated away while another lease is still using it.
    const dashboard = await tools.getDashboardOverview(period)
    const contentAnalytics = await tools.getContentAnalytics()
    const fansAnalytics = await tools.getFansAnalytics(period)

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
