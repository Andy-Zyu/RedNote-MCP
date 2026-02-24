import { Page } from 'playwright'
import logger from '../utils/logger'
import { BrowserManager } from '../browser/browserManager'
import { BaseTools } from './baseTools'
import { MyNotesInterceptor } from '../interceptors/myNotesInterceptor'
import { SELECTORS } from '../selectors'
import {
  MyNotesResult,
  EditNoteOptions,
  EditNoteResult,
  DeleteNoteResult,
} from './types'

export class NoteManageTools extends BaseTools {
  async getMyNotes(): Promise<MyNotesResult> {
    logger.info('Getting my notes from creator center')
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    let creatorPage: Page | null = null
    try {
      // SSO into creator center — land on publish page first
      creatorPage = await this.navigateToCreator(lease, 'https://creator.xiaohongshu.com/publish/publish?source=official')
      this.page = creatorPage
      logger.info(`Creator page URL after SSO: ${creatorPage.url()}`)

      // Navigate directly to content analytics (the only page confirmed to have note data in a table)
      await creatorPage.goto('https://creator.xiaohongshu.com/statistics/data-analysis', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      })
      await new Promise(r => setTimeout(r, 3000))

      // Interceptor handles both API interception and DOM fallback
      const interceptor = new MyNotesInterceptor(creatorPage)
      const result = await interceptor.intercept(async () => {
        await creatorPage!.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
      })
      if (result.success && result.data && result.data.totalCount > 0) {
        logger.info(`My notes returned ${result.data.totalCount} notes via ${result.source}`)
        return result.data
      }

      logger.warn('My notes returned no results')
      return { notes: [], totalCount: 0 }
    } catch (error) {
      logger.error('Error getting my notes:', error)
      throw error
    } finally {
      if (creatorPage && creatorPage !== lease.page && !creatorPage.isClosed()) {
        await creatorPage.close()
      }
      this.page = null
      await lease.release()
    }
  }

  async editNote(options: EditNoteOptions): Promise<EditNoteResult> {
    logger.info(`Editing note: ${options.noteId}`)
    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/new/note-manager',
      async (creatorPage) => {
        // Wait for note cards to render (SPA needs extra time)
        await creatorPage.waitForSelector(SELECTORS.noteManage.noteCard, { timeout: 30000 })
        await this.randomDelay(1, 2)

        // Find the target note card by noteId or title
        const noteCard = await this.findNoteCard(creatorPage, options.noteId)
        if (!noteCard) {
          throw new Error(`未找到笔记: ${options.noteId}`)
        }

        // Click the edit button on the card
        const editBtn = noteCard.locator(SELECTORS.noteManage.editButton).first()
        if (await editBtn.count() === 0) {
          throw new Error('未找到编辑按钮')
        }
        await this.safeClick(editBtn, '编辑按钮')

        // Edit navigates to /publish/update?id=...&noteType=normal in the same tab
        await creatorPage.waitForURL(/\/publish\/update/, { timeout: 15000 })
        await creatorPage.waitForSelector(SELECTORS.noteManage.contentEditor, { timeout: 30000 })
        await this.randomDelay(1, 2)

        // Update title
        if (options.title) {
          logger.info('Updating title')
          const titleInput = creatorPage.locator(SELECTORS.noteManage.titleInput).first()
          await titleInput.click()
          await titleInput.fill('')
          await titleInput.fill(options.title.slice(0, 20))
          await this.randomDelay(0.5, 1)
        }

        // Update content
        if (options.content) {
          logger.info('Updating content')
          const editor = creatorPage.locator(SELECTORS.noteManage.contentEditor).first()
          if (await editor.count() > 0) {
            await editor.click()
            await creatorPage.keyboard.press('Meta+A')
            await this.randomDelay(0.2, 0.4)
            await creatorPage.keyboard.type(options.content, { delay: 30 })
          }
          await this.randomDelay(0.5, 1)
        }

        // Add tags (appended after content)
        if (options.tags && options.tags.length > 0) {
          logger.info(`Adding ${options.tags.length} tags`)
          const editor = creatorPage.locator(SELECTORS.noteManage.contentEditor).first()
          await editor.click()
          // Move to end of content
          await creatorPage.keyboard.press('End')
          await this.randomDelay(0.2, 0.4)
          for (const tag of options.tags) {
            await this.typeAndSelectTag(creatorPage, tag)
          }
          await this.dismissTippyPopups()
        }

        // Click publish/save
        await this.randomDelay(1, 2)
        await this.dismissTippyPopups()
        const saveBtn = creatorPage.locator(SELECTORS.noteManage.publishButton).first()
        await this.safeClick(saveBtn, '发布按钮')
        await this.randomDelay(2, 3)

        logger.info('Note edited successfully')
        return { success: true, message: '笔记编辑成功' }
      }
    )
  }

  async deleteNote(noteId: string): Promise<DeleteNoteResult> {
    logger.info(`Deleting note: ${noteId}`)
    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/new/note-manager',
      async (creatorPage) => {
        // Wait for note cards to render
        await creatorPage.waitForSelector(SELECTORS.noteManage.noteCard, { timeout: 30000 })
        await this.randomDelay(1, 2)

        // Find the target note card
        const noteCard = await this.findNoteCard(creatorPage, noteId)
        if (!noteCard) {
          throw new Error(`未找到笔记: ${noteId}`)
        }

        // Click delete button on the card
        const deleteBtn = noteCard.locator(SELECTORS.noteManage.deleteButton).first()
        if (await deleteBtn.count() === 0) {
          throw new Error('未找到删除按钮')
        }
        await this.safeClick(deleteBtn, '删除按钮')
        await this.randomDelay(1, 2)

        // Wait for and click the confirmation dialog
        const confirmBtn = creatorPage.locator(SELECTORS.noteManage.deleteConfirmButton).first()
        await confirmBtn.waitFor({ state: 'visible', timeout: 10000 })
        await this.safeClick(confirmBtn, '确认删除')
        await this.randomDelay(2, 3)

        logger.info(`Note ${noteId} deleted successfully`)
        return { success: true, message: `笔记 ${noteId} 已删除` }
      }
    )
  }

  /**
   * Find a note card on /new/note-manager by noteId (in data-impression) or title text.
   */
  private async findNoteCard(
    page: Page,
    noteIdOrTitle: string
  ): Promise<ReturnType<Page['locator']> | null> {
    // First try: match by noteId embedded in data-impression attribute
    const byId = page.locator(`div.note[data-impression*="${noteIdOrTitle}"]`).first()
    if (await byId.count() > 0) {
      logger.info(`Found note card by noteId: ${noteIdOrTitle}`)
      return byId
    }

    // Second try: match by title text
    const allCards = page.locator(SELECTORS.noteManage.noteCard)
    const count = await allCards.count()
    for (let i = 0; i < count; i++) {
      const card = allCards.nth(i)
      const titleEl = card.locator(SELECTORS.noteManage.noteTitle).first()
      if (await titleEl.count() > 0) {
        const titleText = await titleEl.textContent()
        if (titleText?.includes(noteIdOrTitle)) {
          logger.info(`Found note card by title match: "${titleText}"`)
          return card
        }
      }
    }

    logger.warn(`Note card not found for: ${noteIdOrTitle}`)
    return null
  }
}
