import { Page } from 'playwright'
import { BaseInterceptor } from './baseInterceptor'
import { MyNotesResult, MyNote } from '../tools/types'
import logger from '../utils/logger'

export class MyNotesInterceptor extends BaseInterceptor<MyNotesResult> {
  constructor(page: Page, timeoutMs: number = 15000) {
    super(page, timeoutMs)
  }

  matchUrl(url: string): boolean {
    return url.includes('/api/galaxy/creator/datacenter/note/analyze/list') ||
      url.includes('/api/galaxy/creator/note/list') ||
      url.includes('/api/gaia/creator/note/list')
  }

  parseResponse(json: unknown): MyNotesResult {
    const root = json as Record<string, unknown>
    const data = root.data as Record<string, unknown> | undefined
    if (!data) return { notes: [], totalCount: 0 }

    const noteList = (data.note_infos ?? data.note_list ?? data.notes ?? []) as Array<Record<string, unknown>>
    const notes: MyNote[] = noteList.map(item => {
      const noteId = String(item.id ?? item.note_id ?? '')
      const postTime = item.post_time ? new Date(Number(item.post_time)).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }) : String(item.publish_time ?? item.create_time ?? '')

      return {
        noteId,
        title: String(item.title ?? item.display_title ?? ''),
        coverUrl: String(item.cover_url ?? item.cover ?? ''),
        type: (Number(item.type) === 2 || String(item.type) === 'video' ? 'video' : 'image') as 'image' | 'video',
        status: Number(item.audit_status) === 1 ? '已发布' : String(item.status_desc ?? '审核中'),
        publishTime: postTime,
        likes: parseInt(String(item.like_count ?? 0), 10),
        collects: parseInt(String(item.fav_count ?? item.collected_count ?? 0), 10),
        comments: parseInt(String(item.comment_count ?? 0), 10),
        url: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '',
      }
    })

    return {
      notes,
      totalCount: parseInt(String(data.total ?? notes.length), 10)
    }
  }

  async fallbackDom(): Promise<MyNotesResult> {
    logger.info('Using DOM fallback for my notes list')
    await this.page.waitForSelector('table tbody tr', { timeout: 30000 })

    const notes = await this.page.evaluate(`
      (() => {
        var gt = (el) => el ? (el.textContent || '').trim() : '';
        var gn = (el) => parseInt((gt(el)).replace(/,/g, '') || '0', 10) || 0;
        var rows = document.querySelectorAll('table tbody tr');
        var results = [];
        for (var row of rows) {
          var cells = row.querySelectorAll('td');
          if (cells.length < 2) continue;
          var infoCell = cells[0];
          var titleEl = infoCell.querySelector('.note-title');
          var title = gt(titleEl);
          var timeEl = infoCell.querySelector('.time');
          var publishTime = gt(timeEl).replace('发布于', '').trim();
          var imgEl = infoCell.querySelector('.note-cover img');
          var coverUrl = imgEl ? imgEl.src : '';
          var videoEl = infoCell.querySelector('video');
          var type = videoEl ? 'video' : 'image';
          var noteId = row.getAttribute('data-note-id') || row.getAttribute('data-id') || '';
          results.push({
            noteId: noteId, title: title, coverUrl: coverUrl, type: type,
            status: '已发布', publishTime: publishTime,
            likes: cells.length > 4 ? gn(cells[4]) : 0,
            comments: cells.length > 5 ? gn(cells[5]) : 0,
            collects: cells.length > 6 ? gn(cells[6]) : 0,
            url: noteId ? 'https://www.xiaohongshu.com/explore/' + noteId : '',
          });
        }
        return results;
      })()
    `) as MyNote[]

    return { notes, totalCount: notes.length }
  }
}
