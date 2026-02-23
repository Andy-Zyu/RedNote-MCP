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
