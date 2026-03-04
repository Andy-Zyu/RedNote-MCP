import { Page } from 'playwright'
import logger from '../utils/logger'
import { BrowserManager, PageLease } from '../browser/browserManager'
import { BaseTools } from './baseTools'
import { SearchInterceptor } from '../interceptors/searchInterceptor'
import { NoteDetailInterceptor } from '../interceptors/noteDetailInterceptor'
import { NoteCommentsInterceptor } from '../interceptors/noteCommentsInterceptor'
import { DashboardInterceptor } from '../interceptors/dashboardInterceptor'
import { ContentAnalyticsInterceptor } from '../interceptors/contentAnalyticsInterceptor'
import { FansAnalyticsInterceptor } from '../interceptors/fansAnalyticsInterceptor'
import {
  Note,
  NoteDetail,
  Comment,
  DiagnosisItem,
  MetricItem,
  DashboardOverview,
  NoteAnalytics,
  ContentAnalytics,
  FansOverview,
  FansAnalytics,
} from './types'

export {
  Note,
  NoteDetail,
  Comment,
  DiagnosisItem,
  MetricItem,
  DashboardOverview,
  NoteAnalytics,
  ContentAnalytics,
  FansOverview,
  FansAnalytics,
} from './types'

export class RedNoteTools extends BaseTools {
  constructor() {
    super()
    logger.info('Initializing RedNoteTools')
  }

  async searchNotes(keywords: string, limit: number = 10, accountId?: string): Promise<Note[]> {
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    try {
      const interceptor = new SearchInterceptor(lease.page, keywords, limit)
      const result = await interceptor.intercept(async () => {
        await lease.page.goto(
          `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keywords)}`,
          { waitUntil: 'domcontentloaded', timeout: 30000 }
        )
        this.checkCaptchaRedirect(lease.page)
      })

      if (result.success && result.data) {
        logger.info(`Search returned ${result.data.length} notes via ${result.source}`)
        return result.data
      }

      logger.warn('Search returned no results')
      return []
    } catch (error) {
      logger.error('Error searching notes:', error)
      throw error
    } finally {
      await lease.release()
    }
  }

  async getNoteContent(url: string, accountId?: string): Promise<NoteDetail> {
    logger.info(`Getting note content for URL: ${url}`)
    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    try {
      const actualURL = this.extractRedBookUrl(url)
      const interceptor = new NoteDetailInterceptor(lease.page, actualURL)
      const result = await interceptor.intercept(async () => {
        await lease.page.goto(actualURL, { waitUntil: 'domcontentloaded', timeout: 30000 })
        this.checkCaptchaRedirect(lease.page)
      })

      if (result.success && result.data) {
        logger.info(`Note detail returned via ${result.source}: ${result.data.title}`)
        return result.data
      }

      throw new Error('Failed to get note content')
    } catch (error) {
      logger.error('Error getting note content:', error)
      throw error
    } finally {
      await lease.release()
    }
  }

  async getNoteComments(url: string, accountId?: string): Promise<Comment[]> {
    logger.info(`Getting comments for URL: ${url}`)
    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    try {
      const interceptor = new NoteCommentsInterceptor(lease.page)
      const result = await interceptor.intercept(async () => {
        await lease.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
        this.checkCaptchaRedirect(lease.page)
      })

      if (result.success && result.data) {
        logger.info(`Comments returned ${result.data.length} via ${result.source}`)
        return result.data
      }

      logger.warn('Comments returned no results')
      return []
    } catch (error) {
      logger.error('Error getting note comments:', error)
      throw error
    } finally {
      await lease.release()
    }
  }

  async publishNote(options: {
    title: string
    content: string
    images?: string[]
    tags?: string[]
    keepAlive?: boolean
    accountId?: string
  }): Promise<{ success: boolean; message: string; url?: string }> {
    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/publish/publish?source=official',
      async (creatorPage) => {
        logger.info(`Publishing image-text note: ${options.title}`)
        await this.randomDelay(1, 2)

        // Switch to "上传图文" tab (default is video)
        await this.clickPublishTab(creatorPage, '上传图文')

        // Upload images — required for image-text notes
        if (!options.images || options.images.length === 0) {
          throw new Error('图文笔记至少需要一张图片，请通过 images 参数提供图片路径')
        }
        logger.info(`Uploading ${options.images.length} images`)
        const fileInput = creatorPage.locator('input[type="file"]').first()
        await fileInput.setInputFiles(options.images)
        logger.info('Images set on file input, waiting for upload')
        await creatorPage.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"]', { timeout: 60000 })
        await this.randomDelay(1, 2)

        // Fill title, content, tags and publish
        await this.fillPublishForm(creatorPage, options)
        return await this.submitPublish(creatorPage)
      },
      options.accountId
    )
  }

  async publishVideoNote(options: {
    title: string
    content: string
    video: string
    tags?: string[]
    keepAlive?: boolean
    accountId?: string
  }): Promise<{ success: boolean; message: string; url?: string }> {
    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/publish/publish?source=official',
      async (creatorPage) => {
        logger.info(`Publishing video note: ${options.title}`)
        await this.randomDelay(1, 2)

        // Default tab is already "上传视频", but click it to be safe
        await this.clickPublishTab(creatorPage, '上传视频')

        // Upload video file
        logger.info(`Uploading video: ${options.video}`)
        const fileInput = creatorPage.locator('input[type="file"]').first()
        await fileInput.setInputFiles(options.video)
        logger.info('Video set on file input, waiting for upload')

        // Video upload takes longer — wait for title input to appear
        await creatorPage.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"]', { timeout: 120000 })
        await this.randomDelay(2, 4)

        // Fill title, content, tags and publish
        await this.fillPublishForm(creatorPage, options)
        return await this.submitPublish(creatorPage)
      },
      options.accountId
    )
  }

  async publishTextNote(options: {
    title: string
    content: string
    tags?: string[]
    keepAlive?: boolean
    accountId?: string
  }): Promise<{ success: boolean; message: string; url?: string }> {
    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/publish/publish?source=official',
      async (creatorPage) => {
        logger.info(`Publishing text-only note: ${options.title}`)
        await this.randomDelay(1, 2)

        // Step 1: Switch to "上传图文" tab (text-only is a sub-mode)
        await this.clickPublishTab(creatorPage, '上传图文')
        await this.randomDelay(1, 2)

        // Step 2: Click "文字配图" button to enter text-only mode
        // Wait for the upload area to render after tab switch
        await creatorPage.waitForSelector('.upload-content, .drag-over, button:has-text("文字配图")', { timeout: 15000 })
        await this.randomDelay(0.5, 1)
        const textImageBtn = creatorPage.locator('button:has-text("文字配图")').first()
        if (await textImageBtn.count() > 0) {
          await textImageBtn.click()
          logger.info('Clicked 文字配图 button')
          await this.randomDelay(1, 2)
        } else {
          throw new Error('文字配图按钮未找到，页面结构可能已变化')
        }

        // Step 3: Type content in the editor (must type before generating image)
        await creatorPage.waitForSelector('.tiptap.ProseMirror', { timeout: 30000 })
        const editor = creatorPage.locator('.tiptap.ProseMirror').first()
        await editor.click()
        await this.randomDelay(0.3, 0.6)
        await creatorPage.keyboard.type(options.content, { delay: 30 })
        logger.info('Content typed in editor')
        await this.randomDelay(1, 2)

        // Step 4: Click "生成图片" to auto-generate cover image from text
        const generateBtn = creatorPage.locator('div:has-text("生成图片"):not(:has(div)), button:has-text("生成图片"), span:has-text("生成图片")').first()
        if (await generateBtn.count() > 0) {
          await generateBtn.click()
          logger.info('Clicked 生成图片 to auto-generate cover')
          await this.randomDelay(3, 5)
        } else {
          logger.warn('生成图片 button not found, trying to proceed')
        }

        // Step 5: Click "下一步" to proceed to the publish form
        const nextBtn = creatorPage.locator('button:has-text("下一步")').first()
        if (await nextBtn.count() > 0) {
          await nextBtn.click()
          logger.info('Clicked 下一步')
          await this.randomDelay(2, 4)
        } else {
          logger.warn('下一步 button not found, trying to proceed')
        }

        // Step 6: Now the standard publish form appears — fill title and tags
        await creatorPage.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"]', { timeout: 30000 })
        logger.info('Filling in title')
        const titleInput = creatorPage.locator('input[placeholder*="标题"], input[placeholder*="赞"]').first()
        await titleInput.click()
        await titleInput.fill(options.title.slice(0, 20))
        await this.randomDelay(0.5, 1)

        // Add tags
        if (options.tags && options.tags.length > 0) {
          logger.info(`Adding ${options.tags.length} tags`)
          for (const tag of options.tags) {
            await this.typeAndSelectTag(creatorPage, tag)
          }
          await this.dismissTippyPopups()
        }
        await this.randomDelay(1, 2)

        // Step 7: Publish
        return await this.submitPublish(creatorPage)
      },
      options.accountId
    )
  }

  async publishArticle(options: {
    title: string
    content: string
    tags?: string[]
    keepAlive?: boolean
    accountId?: string
  }): Promise<{ success: boolean; message: string; url?: string }> {
    return this.withCreatorPage(
      'https://creator.xiaohongshu.com/publish/publish?source=official',
      async (creatorPage) => {
        logger.info(`Publishing article (长文): ${options.title}`)
        await this.randomDelay(1, 2)

        // Step 1: Navigate to article editor via tab switching
        await this.clickPublishTab(creatorPage, '上传图文')
        await this.randomDelay(0.5, 1)
        await this.clickPublishTab(creatorPage, '写长文')
        await this.randomDelay(1, 2)

        // Step 2: Click 新的创作 button
        const newCreateBtn = creatorPage.locator('button:has-text("新的创作")').first()
        if (await newCreateBtn.count() > 0) {
          await newCreateBtn.click()
          logger.info('Clicked 新的创作')
          await this.randomDelay(2, 4)
        } else {
          throw new Error('新的创作按钮未找到，页面结构可能已变化')
        }

        // Step 3: Wait for the article editor to load
        await creatorPage.waitForSelector('textarea[placeholder*="标题"], textarea[placeholder*="输入"]', { timeout: 30000 })
        await this.randomDelay(0.5, 1)

        // Step 4: Fill title
        logger.info('Filling article title')
        const titleArea = creatorPage.locator('textarea[placeholder*="标题"], textarea[placeholder*="输入"]').first()
        await titleArea.click()
        await titleArea.fill(options.title)
        await this.randomDelay(0.5, 1)

        // Step 5: Fill content in tiptap editor
        logger.info('Filling article content')
        const editor = creatorPage.locator('.tiptap.ProseMirror').first()
        await editor.click()
        await this.randomDelay(0.3, 0.6)
        await creatorPage.keyboard.type(options.content, { delay: 10 })
        await this.randomDelay(1, 2)

        // Step 6: Click 一键排版 to enter formatting flow
        logger.info('Clicking 一键排版 to start formatting')
        const formatBtn = creatorPage.locator('button:has-text("一键排版")').first()
        await this.safeClick(formatBtn, '一键排版')
        // Wait for template generation (API call to summary/generate + template/rec)
        await this.randomDelay(5, 8)

        // Step 7: Click first 下一步 (generates article images)
        logger.info('Clicking 下一步 (generate images)')
        const nextBtn1 = creatorPage.locator('button:has-text("下一步")').first()
        await this.safeClick(nextBtn1, '下一步 (step 1)')
        // Wait for image generation
        await this.randomDelay(3, 5)

        // Wait for "笔记图片生成中" to finish if present
        try {
          await creatorPage.waitForFunction(
            () => !document.body.innerText.includes('笔记图片生成中'),
            { timeout: 30000 }
          )
        } catch {
          logger.warn('Image generation may still be in progress')
        }
        await this.randomDelay(1, 2)

        // Step 8: Click second 下一步 (enter publish settings)
        logger.info('Clicking 下一步 (publish settings)')
        const nextBtn2 = creatorPage.locator('button:has-text("下一步")').first()
        await this.safeClick(nextBtn2, '下一步 (step 2)')
        await this.randomDelay(3, 5)

        // Step 9: Add tags if provided
        if (options.tags && options.tags.length > 0) {
          logger.info(`Adding ${options.tags.length} tags`)
          // Click the description/tag input area
          const descInput = creatorPage.locator('#post-textarea, [placeholder*="添加正文"]').first()
          if (await descInput.count() > 0) {
            await descInput.click()
            await this.randomDelay(0.3, 0.5)
          }
          for (const tag of options.tags) {
            await this.typeAndSelectTag(creatorPage, tag)
          }
          await this.dismissTippyPopups()
          await this.randomDelay(1, 2)
        }

        // Step 10: Click 发布 button
        logger.info('Clicking 发布 button')
        const publishBtn = creatorPage.locator('button:has-text("发布")').first()
        await publishBtn.waitFor({ state: 'visible', timeout: 10000 })
        await this.safeClick(publishBtn, '发布')

        // Step 11: Wait for success
        logger.info('Waiting for publish confirmation')
        const maxWaitMs = 30000
        const start = Date.now()
        while (Date.now() - start < maxWaitMs) {
          const url = creatorPage.url()
          if (url.includes('/publish/success')) {
            logger.info('Article published successfully')
            return { success: true, message: '长文笔记发布成功', url }
          }
          await this.randomDelay(0.5, 1)
        }

        return {
          success: true,
          message: '长文笔记已提交发布，请在小红书创作者中心确认状态'
        }
      },
      options.accountId
    )
  }

  /** Click a publish mode tab by its text label */
  private async clickPublishTab(page: Page, tabText: string): Promise<void> {
    // The publish page has tabs inside .header-tabs with class .creator-tab
    // Try clicking the visible tab first via the container
    const tabInHeader = page.locator(`.header-tabs .creator-tab:has(span.title:has-text("${tabText}"))`)
    const tabCount = await tabInHeader.count()
    if (tabCount > 0) {
      // Click the last match — first may be hidden (position: absolute; left: -9999px)
      for (let i = tabCount - 1; i >= 0; i--) {
        const tab = tabInHeader.nth(i)
        await tab.dispatchEvent('click')
        await this.randomDelay(1, 2)
        logger.info(`Switched to "${tabText}" tab (index ${i})`)
        return
      }
    }

    // Fallback: try span.title directly
    const selectors = [
      `span.title:has-text("${tabText}")`,
      `div:has-text("${tabText}"):not(:has(div))`,
    ]
    for (const sel of selectors) {
      const tab = page.locator(sel).first()
      if (await tab.count() > 0) {
        await tab.dispatchEvent('click')
        await this.randomDelay(1, 2)
        logger.info(`Switched to "${tabText}" tab via fallback`)
        return
      }
    }
    logger.warn(`Tab "${tabText}" not found, continuing with current tab`)
  }

  /** Fill in title, content, and tags on the publish form */
  private async fillPublishForm(page: Page, options: {
    title: string
    content: string
    tags?: string[]
  }): Promise<void> {
    // Fill title
    logger.info('Filling in title')
    const titleInput = page.locator('input[placeholder*="标题"], input[placeholder*="赞"]').first()
    if (await titleInput.count() === 0) {
      throw new Error('标题输入框未找到，页面结构可能已变化')
    }
    await titleInput.click()
    await titleInput.fill(options.title.slice(0, 20))
    await this.randomDelay(0.5, 1)

    // Fill content
    logger.info('Filling in content')
    const contentEditor = page.locator('.tiptap.ProseMirror, .ql-editor').first()
    if (await contentEditor.count() > 0) {
      await contentEditor.click()
      await this.randomDelay(0.3, 0.6)
      await page.keyboard.type(options.content, { delay: 30 })
    } else {
      const allEditable = page.locator('[contenteditable="true"]')
      const count = await allEditable.count()
      if (count >= 1) {
        const idx = count >= 2 ? 1 : 0
        await allEditable.nth(idx).click()
        await this.randomDelay(0.3, 0.6)
        await page.keyboard.type(options.content, { delay: 30 })
      } else {
        throw new Error('正文编辑器未找到，页面结构可能已变化')
      }
    }
    await this.randomDelay(0.5, 1)

    // Add tags
    if (options.tags && options.tags.length > 0) {
      logger.info(`Adding ${options.tags.length} tags`)
      for (const tag of options.tags) {
        await this.typeAndSelectTag(page, tag)
      }
      await this.dismissTippyPopups()
      logger.info(`Added ${options.tags.length} tags`)
    }
    await this.randomDelay(1, 2)
  }

  /** Click publish button and wait for success */
  private async submitPublish(page: Page): Promise<{ success: boolean; message: string; url?: string }> {
    logger.info('Clicking publish button')
    await this.safeClick(page.locator('button:has-text("发布")').first(), '发布按钮')

    logger.info('Waiting for publish confirmation')
    const maxPublishWaitMs = 30000
    const publishStart = Date.now()
    while (Date.now() - publishStart < maxPublishWaitMs) {
      const url = page.url()
      if (url.includes('/publish/success')) {
        logger.info('Note published successfully')
        return { success: true, message: '笔记发布成功', url }
      }
      await this.randomDelay(0.5, 1)
    }

    logger.warn('Did not detect /publish/success redirect within timeout')
    return {
      success: true,
      message: '笔记已提交发布，请在小红书创作者中心确认状态'
    }
  }

  async getDashboardOverview(period: string = '7days', accountId?: string): Promise<DashboardOverview> {
    logger.info(`Getting dashboard overview for period: ${period}`)
    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    let activePage: Page | null = null
    try {
      const targetUrl = 'https://creator.xiaohongshu.com/statistics/account/v2'
      activePage = await this.navigateToCreator(lease, targetUrl)

      const interceptor = new DashboardInterceptor(activePage, period)
      const result = await interceptor.fallbackDom()
      logger.info('Dashboard overview returned via dom')
      return result
    } catch (error) {
      logger.error('Error getting dashboard overview:', error)
      throw error
    } finally {
      if (activePage && activePage !== lease.page && !activePage.isClosed()) {
        await activePage.close()
      }
      await lease.release()
    }
  }

  async getContentAnalytics(options?: {
    startDate?: string
    endDate?: string
    accountId?: string
  }): Promise<ContentAnalytics> {
    logger.info('Getting content analytics')
    const bm = BrowserManager.getInstance(options?.accountId)
    const lease = await bm.acquirePage()
    let activePage: Page | null = null
    try {
      const targetUrl = 'https://creator.xiaohongshu.com/statistics/data-analysis'
      activePage = await this.navigateToCreator(lease, targetUrl)

      const interceptor = new ContentAnalyticsInterceptor(activePage)
      const result = await interceptor.fallbackDom()
      logger.info(`Content analytics returned ${result.totalCount} notes via dom`)
      return result
    } catch (error) {
      logger.error('Error getting content analytics:', error)
      throw error
    } finally {
      if (activePage && activePage !== lease.page && !activePage.isClosed()) {
        await activePage.close()
      }
      await lease.release()
    }
  }

  async getFansAnalytics(period: string = '7days', accountId?: string): Promise<FansAnalytics> {
    logger.info(`Getting fans analytics for period: ${period}`)
    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    let activePage: Page | null = null
    try {
      const targetUrl = 'https://creator.xiaohongshu.com/statistics/fans-data'
      activePage = await this.navigateToCreator(lease, targetUrl)

      const interceptor = new FansAnalyticsInterceptor(activePage, period)
      const result = await interceptor.fallbackDom()
      logger.info('Fans analytics returned via dom')
      return result
    } catch (error) {
      logger.error('Error getting fans analytics:', error)
      throw error
    } finally {
      if (activePage && activePage !== lease.page && !activePage.isClosed()) {
        await activePage.close()
      }
      await lease.release()
    }
  }
}
