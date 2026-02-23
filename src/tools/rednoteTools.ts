import { Page } from 'playwright'
import logger from '../utils/logger'
import { BrowserManager, PageLease } from '../browser/browserManager'
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

export class RedNoteTools {
  private lease: PageLease | null = null
  private page: Page | null = null

  constructor() {
    logger.info('Initializing RedNoteTools')
  }

  extractRedBookUrl(shareText: string): string {
    // 匹配 http://xhslink.com/ 开头的链接
    const xhslinkRegex = /(https?:\/\/xhslink\.com\/[a-zA-Z0-9\/]+)/i
    const xhslinkMatch = shareText.match(xhslinkRegex)

    if (xhslinkMatch && xhslinkMatch[1]) {
      return xhslinkMatch[1]
    }

    // 匹配 https://www.xiaohongshu.com/ 开头的链接
    const xiaohongshuRegex = /(https?:\/\/(?:www\.)?xiaohongshu\.com\/[^，\s]+)/i
    const xiaohongshuMatch = shareText.match(xiaohongshuRegex)

    if (xiaohongshuMatch && xiaohongshuMatch[1]) {
      return xiaohongshuMatch[1]
    }

    return shareText
  }

  async searchNotes(keywords: string, limit: number = 10): Promise<Note[]> {
    logger.info(`Searching notes with keywords: ${keywords}, limit: ${limit}`)
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    try {
      const interceptor = new SearchInterceptor(lease.page, keywords, limit)
      const result = await interceptor.intercept(async () => {
        await lease.page.goto(
          `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keywords)}`,
          { waitUntil: 'domcontentloaded', timeout: 30000 }
        )
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

  async getNoteContent(url: string): Promise<NoteDetail> {
    logger.info(`Getting note content for URL: ${url}`)
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    try {
      const actualURL = this.extractRedBookUrl(url)
      const interceptor = new NoteDetailInterceptor(lease.page, actualURL)
      const result = await interceptor.intercept(async () => {
        await lease.page.goto(actualURL, { waitUntil: 'domcontentloaded', timeout: 30000 })
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

  async getNoteComments(url: string): Promise<Comment[]> {
    logger.info(`Getting comments for URL: ${url}`)
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    try {
      const interceptor = new NoteCommentsInterceptor(lease.page)
      const result = await interceptor.intercept(async () => {
        await lease.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
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
  }): Promise<{ success: boolean; message: string; url?: string }> {
    logger.info(`Publishing note with title: ${options.title}`)
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    this.page = lease.page
    this.lease = lease
    try {
      // Navigate to creator publish page via SSO
      logger.info('Navigating to publish page via SSO')
      const creatorPage = await this.navigateToCreator(lease, 'https://creator.xiaohongshu.com/publish/publish?source=official')
      this.page = creatorPage
      await this.randomDelay(1, 2)

      // Check if redirected to login page
      const currentUrl = this.page.url()
      logger.info(`Current URL after navigation: ${currentUrl}`)
      if (currentUrl.includes('login') || currentUrl.includes('cas')) {
        throw new Error('未登录或 Cookie 已失效，请先运行 login 工具登录')
      }

      // The page defaults to "上传视频" tab. Switch to "上传图文" tab.
      logger.info('Switching to image-text publish tab')
      const tabSelectors = [
        'span.title:has-text("上传图文")',
        'div:has-text("上传图文"):not(:has(div))',
      ]
      for (const sel of tabSelectors) {
        const tab = this.page.locator(sel).first()
        if (await tab.count() > 0) {
          await tab.dispatchEvent('click')
          await this.randomDelay(1, 2)
          logger.info('Switched to image-text tab')
          break
        }
      }

      // Upload images — required for image-text notes
      if (!options.images || options.images.length === 0) {
        throw new Error('图文笔记至少需要一张图片，请通过 images 参数提供图片路径')
      }
      logger.info(`Uploading ${options.images.length} images`)
      const fileInput = this.page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(options.images)
      logger.info('Images set on file input, waiting for upload')
      // Wait for the title input to appear (indicates upload completed and form is ready)
      await this.page.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"]', { timeout: 60000 })
      await this.randomDelay(1, 2)

      // Fill in title (max 20 chars)
      logger.info('Filling in title')
      const titleInput = this.page.locator('input[placeholder*="标题"], input[placeholder*="赞"]').first()
      if (await titleInput.count() === 0) {
        throw new Error('标题输入框未找到，页面结构可能已变化')
      }
      await titleInput.click()
      await titleInput.fill(options.title.slice(0, 20))
      await this.randomDelay(0.5, 1)

      // Fill in content using the rich text editor (TipTap/ProseMirror)
      logger.info('Filling in content')
      const contentEditor = this.page.locator('.tiptap.ProseMirror, .ql-editor').first()
      if (await contentEditor.count() > 0) {
        await contentEditor.click()
        await this.randomDelay(0.3, 0.6)
        await this.page.keyboard.type(options.content, { delay: 30 })
      } else {
        // Fallback: use any contenteditable element
        const allEditable = this.page.locator('[contenteditable="true"]')
        const count = await allEditable.count()
        if (count >= 1) {
          const idx = count >= 2 ? 1 : 0
          await allEditable.nth(idx).click()
          await this.randomDelay(0.3, 0.6)
          await this.page.keyboard.type(options.content, { delay: 30 })
        } else {
          throw new Error('正文编辑器未找到，页面结构可能已变化')
        }
      }
      await this.randomDelay(0.5, 1)

      // Add tags by typing #tag in the content editor
      if (options.tags && options.tags.length > 0) {
        logger.info(`Adding ${options.tags.length} tags`)
        for (const tag of options.tags) {
          // Dismiss tippy popups before each tag to prevent interception
          await this.dismissTippyPopups()
          await this.page.keyboard.type(`#${tag}`, { delay: 50 })
          await this.page.keyboard.press('Space')
          await this.randomDelay(0.3, 0.6)
        }
        // Final cleanup after all tags
        await this.dismissTippyPopups()
        logger.info(`Added ${options.tags.length} tags`)
      }
      await this.randomDelay(1, 2)

      // Click publish button (with tippy-safe retry)
      logger.info('Clicking publish button')
      await this.safeClick(this.page.locator('button:has-text("发布")').first(), '发布按钮')

      // Wait for publish success — xiaohongshu redirects to /publish/success?...
      logger.info('Waiting for publish confirmation')
      const maxPublishWaitMs = 30000
      const publishStart = Date.now()
      while (Date.now() - publishStart < maxPublishWaitMs) {
        const url = this.page.url()
        if (url.includes('/publish/success')) {
          logger.info('Note published successfully')
          return { success: true, message: '笔记发布成功', url }
        }
        await this.randomDelay(0.5, 1)
      }

      // If we didn't redirect, check page state
      logger.warn('Did not detect /publish/success redirect within timeout')
      return {
        success: true,
        message: '笔记已提交发布，请在小红书创作者中心确认状态'
      }
    } catch (error) {
      logger.error('Error publishing note:', error)
      throw error
    } finally {
      if (!options.keepAlive) {
        // Close the creator tab if it's a different page from the lease
        if (this.page && this.page !== lease.page && !this.page.isClosed()) {
          await this.page.close()
        }
        this.page = null
        this.lease = null
        await lease.release()
      }
    }
  }

  /**
   * Navigate to a creator center page via SSO.
   * Creator subdomain requires SSO — we must first visit the main site,
   * click the publish link (which triggers SSO in a new tab), then navigate
   * to the target URL within that authenticated tab.
   */
  private async navigateToCreator(lease: PageLease, targetUrl: string): Promise<Page> {
    const page = lease.page

    // Step 1: Visit main site to activate cookies and find the publish link
    await page.goto('https://www.xiaohongshu.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })
    logger.info('Main site loaded for SSO trigger')

    // Step 2: Click the publish link to trigger SSO → opens new tab
    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    if (await publishLink.count() === 0) {
      throw new Error('未找到发布链接，可能未登录，请先运行 login 工具登录')
    }

    const [creatorPage] = await Promise.all([
      page.context().waitForEvent('page', { timeout: 60000 }),
      publishLink.first().click()
    ])
    await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
    logger.info(`SSO complete, creator tab on: ${creatorPage.url()}`)

    // Check if SSO failed
    const creatorUrl = creatorPage.url()
    if (creatorUrl.includes('login') || creatorUrl.includes('cas')) {
      await creatorPage.close()
      throw new Error('未登录或 Cookie 已失效，请先运行 login 工具登录')
    }

    // Step 3: Navigate to the target page within the authenticated creator tab
    if (!creatorUrl.includes(new URL(targetUrl).pathname)) {
      await creatorPage.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })
      logger.info(`Navigated to target: ${creatorPage.url()}`)
    }

    // Wait for content to render
    await new Promise(r => setTimeout(r, 2000))
    return creatorPage
  }

  async getDashboardOverview(period: string = '7days'): Promise<DashboardOverview> {
    logger.info(`Getting dashboard overview for period: ${period}`)
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    let activePage: Page | null = null
    try {
      const targetUrl = 'https://creator.xiaohongshu.com/statistics/account/v2'
      activePage = await this.navigateToCreator(lease, targetUrl)

      const interceptor = new DashboardInterceptor(activePage, period)
      // Page already loaded — if API wasn't intercepted during goto, use DOM fallback
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
  }): Promise<ContentAnalytics> {
    logger.info('Getting content analytics')
    const bm = BrowserManager.getInstance()
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

  async getFansAnalytics(period: string = '7days'): Promise<FansAnalytics> {
    logger.info(`Getting fans analytics for period: ${period}`)
    const bm = BrowserManager.getInstance()
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

  /**
   * Dismiss all tippy tooltip popups that may intercept click events.
   * Xiaohongshu's creator platform uses tippy.js for tag/topic suggestions
   * which can overlay buttons and block Playwright clicks.
   */
  private async dismissTippyPopups(): Promise<void> {
    if (!this.page) return
    try {
      const removed = await this.page.evaluate(() => {
        const tippyElements = document.querySelectorAll('[data-tippy-root]')
        const count = tippyElements.length
        tippyElements.forEach(el => el.remove())
        return count
      })
      if (removed > 0) {
        logger.info(`Dismissed ${removed} tippy popup(s)`)
      }
    } catch (error) {
      logger.debug('Error dismissing tippy popups (non-fatal):', error)
    }
  }

  /**
   * Click an element with tippy-safe retry logic.
   * 1. Dismiss tippy popups
   * 2. Try normal click
   * 3. If intercepted, dismiss again and force click
   */
  private async safeClick(locator: ReturnType<Page['locator']>, description: string): Promise<void> {
    await this.dismissTippyPopups()
    try {
      await locator.click({ timeout: 15000 })
      logger.info(`Clicked ${description} successfully`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('intercepts pointer events') || errorMsg.includes('Timeout')) {
        logger.warn(`Click on ${description} intercepted, dismissing popups and force-clicking`)
        await this.dismissTippyPopups()
        // Also click body to dismiss any remaining overlays
        await this.page?.evaluate(() => document.body.click())
        await this.randomDelay(0.3, 0.5)
        await this.dismissTippyPopups()
        await locator.click({ force: true, timeout: 15000 })
        logger.info(`Force-clicked ${description} successfully`)
      } else {
        throw error
      }
    }
  }

  /**
   * Wait for a random duration between min and max seconds
   * @param min Minimum seconds to wait
   * @param max Maximum seconds to wait
   */
  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min
    logger.debug(`Adding random delay of ${delay.toFixed(2)} seconds`)
    await new Promise((resolve) => setTimeout(resolve, delay * 1000))
  }
}
