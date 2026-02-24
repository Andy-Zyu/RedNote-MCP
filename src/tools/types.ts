export interface Note {
  title: string
  content: string
  tags: string[]
  url: string
  author: string
  likes?: number
  collects?: number
  comments?: number
}

export interface Comment {
  author: string
  content: string
  likes: number
  time: string
}

export interface DiagnosisItem {
  value: number | string
  suggestion: string
}

export interface MetricItem {
  value: number | string
  change: string
}

export interface DashboardOverview {
  period: string
  dateRange: string
  diagnosis: {
    views: DiagnosisItem
    newFollowers: DiagnosisItem
    profileVisitors: DiagnosisItem
    publishCount: DiagnosisItem
    interactions: DiagnosisItem
  }
  overview: {
    impressions: MetricItem
    views: MetricItem
    coverClickRate: MetricItem
    avgViewDuration: MetricItem
    totalViewDuration: MetricItem
    videoCompletionRate: MetricItem
  }
  interactions: {
    likes: MetricItem
    comments: MetricItem
    collects: MetricItem
    shares: MetricItem
  }
  followers: {
    netGain: MetricItem
    newFollows: MetricItem
    unfollows: MetricItem
    profileVisitors: MetricItem
  }
}

export interface NoteAnalytics {
  title: string
  publishTime: string
  impressions: string
  views: string
  coverClickRate: string
  likes: string
  comments: string
  collects: string
  newFollowers: string
  shares: string
  avgViewDuration: string
  danmaku: string
}

export interface ContentAnalytics {
  notes: NoteAnalytics[]
  totalCount: number
}

export interface FansOverview {
  totalFans: number | string
  newFans: number | string
  lostFans: number | string
}

export interface FansAnalytics {
  period: string
  overview: FansOverview
  portrait: string | null
  activeFans: string[]
}

export interface NoteDetail {
  title: string
  content: string
  tags: string[]
  imgs?: string[]
  videos?: string[]
  url: string
  author: string
  likes?: number
  collects?: number
  comments?: number
}

// === Engagement ===

export interface LikeNoteResult {
  success: boolean
  message: string
  liked: boolean
}

export interface CollectNoteResult {
  success: boolean
  message: string
  collected: boolean
}

export interface FollowAuthorResult {
  success: boolean
  message: string
  followed: boolean
}

// === Notifications ===

export type NotificationTab = 'comments' | 'likes' | 'follows'

export interface NotificationItem {
  sender: string
  senderTag?: string
  action: string
  content?: string
  quote?: string
  noteId?: string
  time: string
}

export interface GetNotificationsResult {
  tab: string
  notifications: NotificationItem[]
  totalCount: number
}

// === Share ===

export interface ShareLinkResult {
  noteId: string
  webUrl: string
  appUrl: string
}

// === P0: Note Management ===

export interface MyNote {
  noteId: string
  title: string
  coverUrl: string
  type: 'image' | 'video'
  status: string
  publishTime: string
  likes: number
  collects: number
  comments: number
  url: string
}

export interface MyNotesResult {
  notes: MyNote[]
  totalCount: number
}

export interface EditNoteOptions {
  noteId: string
  title?: string
  content?: string
  tags?: string[]
}

export interface EditNoteResult {
  success: boolean
  message: string
}

export interface DeleteNoteResult {
  success: boolean
  message: string
}

// === P0: Comments ===

export interface CommentResult {
  success: boolean
  message: string
}

export type ReplyCommentResult = CommentResult

export type SentimentCategory = 'positive' | 'negative' | 'question' | 'suggestion' | 'neutral'

export interface CategorizedComment extends Comment {
  category: SentimentCategory
  matchedKeywords: string[]
}

export interface FilterCommentsResult {
  total: number
  categories: Record<SentimentCategory, CategorizedComment[]>
  summary: Record<SentimentCategory, number>
}

// === P0: Analytics ===

export interface TrendingTopic {
  keyword: string
  totalNotes: number
  avgLikes: number
  avgCollects: number
  avgComments: number
  hotScore: number
  topNotes: Note[]
}

export interface DiscoverTrendingResult {
  topics: TrendingTopic[]
  analyzedAt: string
}

export interface TimeSlotPerformance {
  timeSlot: string
  noteCount: number
  avgImpressions: number
  avgLikes: number
  avgComments: number
  performanceScore: number
}

export interface BestPublishTimeResult {
  bestTimeSlots: TimeSlotPerformance[]
  worstTimeSlots: TimeSlotPerformance[]
  recommendation: string
  analyzedNoteCount: number
}

export interface ContentReport {
  period: string
  generatedAt: string
  overview: {
    totalImpressions: number
    totalViews: number
    totalLikes: number
    totalComments: number
    totalCollects: number
    totalShares: number
    avgEngagementRate: number
    fansGrowth: number
  }
  topPerformingNotes: NoteAnalytics[]
  underPerformingNotes: NoteAnalytics[]
  fansInsight: {
    totalFans: string
    newFans: string
    lostFans: string
    netGrowth: string
  }
  recommendations: string[]
}
