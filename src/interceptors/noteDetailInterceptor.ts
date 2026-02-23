import { Page } from 'playwright'
import { BaseInterceptor } from './baseInterceptor'
import { NoteDetail } from '../tools/types'
import { GetNoteDetail } from '../tools/noteDetail'
import logger from '../utils/logger'

export class NoteDetailInterceptor extends BaseInterceptor<NoteDetail> {
  private readonly noteUrl: string

  constructor(page: Page, noteUrl: string, timeoutMs: number = 15000) {
    super(page, timeoutMs)
    this.noteUrl = noteUrl
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/sns/web/v1/feed')
  }

  parseResponse(json: unknown): NoteDetail {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined
    const items = (data?.items ?? []) as Array<Record<string, unknown>>

    if (items.length === 0) {
      return { title: '', content: '', tags: [], url: this.noteUrl, author: '' }
    }

    const item = items[0]
    const noteCard = (item.note_card ?? {}) as Record<string, unknown>
    const user = (noteCard.user ?? {}) as Record<string, unknown>
    const interactInfo = (noteCard.interact_info ?? {}) as Record<string, unknown>
    const tagList = (noteCard.tag_list ?? []) as Array<Record<string, unknown>>
    const imageList = (noteCard.image_list ?? []) as Array<Record<string, unknown>>
    const video = noteCard.video as Record<string, unknown> | undefined

    const imgs = imageList.map((img) => {
      const urlPre = (img.url_pre as string) || (img.url as string) || ''
      return urlPre
    }).filter(Boolean)

    const videos: string[] = []
    if (video) {
      const url = (video.url as string) || ''
      if (url) videos.push(url)
    }

    const detail: NoteDetail = {
      title: (noteCard.display_title as string) || (noteCard.title as string) || '',
      content: (noteCard.desc as string) || '',
      tags: tagList.map((t) => (t.name as string) || '').filter(Boolean),
      imgs: imgs.length > 0 ? imgs : undefined,
      videos: videos.length > 0 ? videos : undefined,
      url: this.noteUrl,
      author: (user.nickname as string) || '',
      likes: parseInt((interactInfo.liked_count as string) || '0', 10),
      collects: parseInt((interactInfo.collected_count as string) || '0', 10),
      comments: parseInt((interactInfo.comment_count as string) || '0', 10),
    }

    logger.info(`Parsed note detail: ${detail.title}`)
    return detail
  }

  async fallbackDom(): Promise<NoteDetail> {
    logger.info('Using DOM fallback for note detail')
    const detail = await GetNoteDetail(this.page)
    detail.url = this.noteUrl
    return detail
  }
}
