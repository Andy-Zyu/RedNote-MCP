import { AuthManager } from '../auth/authManager'
import { Browser, Page } from 'playwright'
import logger from '../utils/logger'
import { GetNoteDetail, NoteDetail } from './noteDetail'

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

export class RedNoteTools {
  private authManager: AuthManager
  private browser: Browser | null = null
  private page: Page | null = null

  constructor() {
    logger.info('Initializing RedNoteTools')
    this.authManager = new AuthManager()
  }

  async initialize(): Promise<void> {
    logger.info('Initializing browser and page')
    this.browser = await this.authManager.getBrowser()
    if (!this.browser) {
      throw new Error('Failed to initialize browser')
    }
    
    try {
      this.page = await this.browser.newPage()
      
      // Load cookies if available
      const cookies = await this.authManager.getCookies()
      if (cookies.length > 0) {
        logger.info(`Loading ${cookies.length} cookies`)
        await this.page.context().addCookies(cookies)
      }

      // Check login status
      logger.info('Checking login status')
      await this.page.goto('https://www.xiaohongshu.com', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })
      // Wait for sidebar to appear (indicates page is fully loaded)
      try {
        await this.page.waitForSelector('.user.side-bar-component .channel', { timeout: 10000 })
      } catch {
        // Sidebar not found, likely not logged in
      }
      const isLoggedIn = await this.page.evaluate(() => {
        const sidebarUser = document.querySelector('.user.side-bar-component .channel')
        return sidebarUser?.textContent?.trim() === '我'
      })

      // If not logged in, perform login
      if (!isLoggedIn) {
        logger.error('Not logged in, please login first')
        throw new Error('Not logged in')
      }
      logger.info('Login status verified')
    } catch (error) {
      // 初始化过程中出错，确保清理资源
      await this.cleanup()
      throw error
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up browser resources')
    try {
      if (this.page) {
        await this.page.close().catch(err => logger.error('Error closing page:', err))
        this.page = null
      }
      
      if (this.browser) {
        await this.browser.close().catch(err => logger.error('Error closing browser:', err))
        this.browser = null
      }
    } catch (error) {
      logger.error('Error during cleanup:', error)
    } finally {
      this.page = null
      this.browser = null
    }
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
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      // Navigate to search page
      logger.info('Navigating to search page')
      await this.page.goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keywords)}`)

      // Wait for search results to load
      logger.info('Waiting for search results')
      await this.page.waitForSelector('.feeds-container', {
        timeout: 30000
      })

      // Get all note items
      let noteItems = await this.page.$$('.feeds-container .note-item')
      logger.info(`Found ${noteItems.length} note items`)
      const notes: Note[] = []

      // Process each note
      for (let i = 0; i < Math.min(noteItems.length, limit); i++) {
        logger.info(`Processing note ${i + 1}/${Math.min(noteItems.length, limit)}`)
        try {
          // Click on the note cover to open detail
          await noteItems[i].$eval('a.cover.mask.ld', (el: HTMLElement) => el.click())

          // Wait for the note page to load
          logger.info('Waiting for note page to load')
          await this.page.waitForSelector('#noteContainer', {
            timeout: 30000
          })

          await this.randomDelay(0.5, 1.5)

          // Extract note content
          const note = await this.page.evaluate(() => {
            const article = document.querySelector('#noteContainer')
            if (!article) return null

            // Get title
            const titleElement = article.querySelector('#detail-title')
            const title = titleElement?.textContent?.trim() || ''

            // Get content
            const contentElement = article.querySelector('#detail-desc .note-text')
            const content = contentElement?.textContent?.trim() || ''

            // Get author info
            const authorElement = article.querySelector('.author-wrapper .username')
            const author = authorElement?.textContent?.trim() || ''

            // Get interaction counts from engage-bar
            const engageBar = document.querySelector('.engage-bar-style')
            const likesElement = engageBar?.querySelector('.like-wrapper .count')
            const likes = parseInt(likesElement?.textContent?.replace(/[^\d]/g, '') || '0')

            const collectElement = engageBar?.querySelector('.collect-wrapper .count')
            const collects = parseInt(collectElement?.textContent?.replace(/[^\d]/g, '') || '0')

            const commentsElement = engageBar?.querySelector('.chat-wrapper .count')
            const comments = parseInt(commentsElement?.textContent?.replace(/[^\d]/g, '') || '0')

            return {
              title,
              content,
              url: window.location.href,
              author,
              likes,
              collects,
              comments
            }
          })

          if (note) {
            logger.info(`Extracted note: ${note.title}`)
            notes.push(note as Note)
          }

          // Add random delay before closing
          await this.randomDelay(0.5, 1)

          // Close note by clicking the close button
          const closeButton = await this.page.$('.close-circle')
          if (closeButton) {
            logger.info('Closing note dialog')
            await closeButton.click()

            // Wait for note dialog to disappear
            await this.page.waitForSelector('#noteContainer', {
              state: 'detached',
              timeout: 30000
            })
          }
        } catch (error) {
          logger.error(`Error processing note ${i + 1}:`, error)
          const closeButton = await this.page.$('.close-circle')
          if (closeButton) {
            logger.info('Attempting to close note dialog after error')
            await closeButton.click()

            // Wait for note dialog to disappear
            await this.page.waitForSelector('#noteContainer', {
              state: 'detached',
              timeout: 30000
            })
          }
        } finally {
          // Add random delay before next note
          await this.randomDelay(0.5, 1.5)
        }
      }

      logger.info(`Successfully processed ${notes.length} notes`)
      return notes
    } catch (error) {
      logger.error('Error searching notes:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getNoteContent(url: string): Promise<NoteDetail> {
    logger.info(`Getting note content for URL: ${url}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      const actualURL = this.extractRedBookUrl(url)
      await this.page.goto(actualURL)
      let note = await GetNoteDetail(this.page)
      note.url = url
      logger.info(`Successfully extracted note: ${note.title}`)
      return note
    } catch (error) {
      logger.error('Error getting note content:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getNoteComments(url: string): Promise<Comment[]> {
    logger.info(`Getting comments for URL: ${url}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      await this.page.goto(url)

      // Wait for comments to load
      logger.info('Waiting for comments to load')
      await this.page.waitForSelector('[role="dialog"] [role="list"]')

      // Extract comments
      const comments = await this.page.evaluate(() => {
        const items = document.querySelectorAll('[role="dialog"] [role="list"] [role="listitem"]')
        const results: Comment[] = []

        items.forEach((item) => {
          const author = item.querySelector('[data-testid="user-name"]')?.textContent?.trim() || ''
          const content = item.querySelector('[data-testid="comment-content"]')?.textContent?.trim() || ''
          const likes = parseInt(item.querySelector('[data-testid="likes-count"]')?.textContent || '0')
          const time = item.querySelector('time')?.textContent?.trim() || ''

          results.push({ author, content, likes, time })
        })

        return results
      })

      logger.info(`Successfully extracted ${comments.length} comments`)
      return comments
    } catch (error) {
      logger.error('Error getting note comments:', error)
      throw error
    } finally {
      await this.cleanup()
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
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      // Navigate to creator publish page via the main site
      // The "发布" link opens in a new tab (target="_blank"), so we need to
      // handle the popup. We use the same browser context so cookies are shared.
      logger.info('Navigating to publish page via main site link')
      const publishLink = this.page.locator('a[href*="creator.xiaohongshu.com/publish"]')
      if (await publishLink.count() > 0) {
        // Listen for new tab (popup) before clicking
        const [newPage] = await Promise.all([
          this.page.context().waitForEvent('page', { timeout: 60000 }),
          publishLink.first().click()
        ])
        // Switch to the new tab and wait for SSO redirects to settle
        await newPage.waitForLoadState('networkidle', { timeout: 60000 })
        this.page = newPage
      } else {
        // Fallback: navigate directly in current page
        logger.info('Publish link not found, navigating directly')
        await this.page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        })
      }
      await this.randomDelay(2, 3)

      // Check if SSO redirect landed on login page
      const currentUrl = this.page.url()
      logger.info(`Current URL after navigation: ${currentUrl}`)
      if (currentUrl.includes('login') || currentUrl.includes('cas')) {
        throw new Error('未登录或 Cookie 已失效，请先运行 rednote-mcp init 登录')
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
      // If no images provided, generate a placeholder via "文字配图"
      if (options.images && options.images.length > 0) {
        logger.info(`Uploading ${options.images.length} images`)
        const fileInput = this.page.locator('input[type="file"]').first()
        await fileInput.setInputFiles(options.images)
        logger.info('Images set on file input, waiting for upload')
        // Wait for the title input to appear (indicates upload completed and form is ready)
        await this.page.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"]', { timeout: 60000 })
        await this.randomDelay(1, 2)
      } else {
        // No images: use "文字配图" to generate a text-based image
        logger.info('No images provided, using text-to-image feature')
        const textImageBtn = this.page.locator('button:has-text("文字配图")')
        if (await textImageBtn.count() > 0) {
          await textImageBtn.click()
          await this.randomDelay(1, 2)
          // Type content in the text-to-image editor
          const textEditor = this.page.locator('textbox').first()
          if (await textEditor.count() > 0) {
            await textEditor.fill(options.content.slice(0, 200))
          }
          // Click "生成图片"
          const generateBtn = this.page.locator('div:has-text("生成图片"):not(:has(div))')
          if (await generateBtn.count() > 0) {
            await generateBtn.click()
            await this.randomDelay(2, 3)
          }
          // Wait for the title input to appear
          await this.page.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"]', { timeout: 60000 })
          await this.randomDelay(1, 2)
        } else {
          throw new Error('未找到"文字配图"按钮，且未提供图片。图文笔记至少需要一张图片。')
        }
      }

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
          await this.page.keyboard.type(`#${tag}`, { delay: 50 })
          await this.page.keyboard.press('Space')
          await this.randomDelay(0.3, 0.6)
        }
        logger.info(`Added ${options.tags.length} tags`)
      }
      await this.randomDelay(1, 2)

      // Click publish button
      logger.info('Clicking publish button')
      await this.page.locator('button:has-text("发布")').first().click()

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
        await this.cleanup()
      }
    }
  }

  /**
   * Navigate to creator center via SSO from the main site.
   * After initialize(), cookies are loaded for www.xiaohongshu.com.
   * creator.xiaohongshu.com requires SSO, so we click the "发布" link
   * (which opens a new tab with SSO redirect), then navigate to the target path.
   */
  private async navigateToCreatorCenter(targetPath: string): Promise<void> {
    if (!this.page) throw new Error('Page not initialized')

    // Use the "发布" link to trigger SSO (same approach as publishNote)
    const publishLink = this.page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    if (await publishLink.count() > 0) {
      const [newPage] = await Promise.all([
        this.page.context().waitForEvent('page', { timeout: 60000 }),
        publishLink.first().click()
      ])
      await newPage.waitForLoadState('networkidle', { timeout: 60000 })
      this.page = newPage
    }

    // Navigate to the target path
    const sidebarLink = this.page.locator(`a[href*="${targetPath}"]`).first()
    if (await sidebarLink.count() > 0) {
      await sidebarLink.click()
      await this.page.waitForLoadState('networkidle', { timeout: 60000 })
    } else {
      await this.page.evaluate((path: string) => {
        window.location.href = `https://creator.xiaohongshu.com${path}`
      }, targetPath)
      await this.page.waitForLoadState('networkidle', { timeout: 60000 })
    }
    await this.randomDelay(1, 2)

    // Check if we got redirected to login
    const currentUrl = this.page.url()
    if (currentUrl.includes('login') || currentUrl.includes('cas')) {
      throw new Error('未登录或 Cookie 已失效，请先运行 login 工具登录')
    }
  }

  async getDashboardOverview(period: string = '7days'): Promise<DashboardOverview> {
    logger.info(`Getting dashboard overview for period: ${period}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      await this.navigateToCreatorCenter('/statistics/account/v2')
      // Wait for the dashboard content to render
      await this.page.waitForSelector('text=账号诊断', { timeout: 30000 })
      await this.randomDelay(2, 3)

      // Switch to 30 days if requested
      if (period === '30days') {
        const btn30 = this.page.locator('text=近30日').first()
        if (await btn30.count() > 0) {
          await btn30.click()
          await this.randomDelay(2, 3)
        }
      }

      // Helper to extract visible metrics from the current tab
      const extractVisibleMetrics = async (): Promise<Record<string, { value: string; change: string }>> => {
        return await this.page!.evaluate(() => {
          const getText = (el: Element | null): string => el?.textContent?.trim() || ''
          const allDivs = Array.from(document.querySelectorAll('div'))
          const metrics: Record<string, { value: string; change: string }> = {}
          const knownLabels = [
            '曝光数', '观看数', '封面点击率', '平均观看时长', '观看总时长', '视频完播率',
            '点赞数', '评论数', '收藏数', '分享数',
            '净涨粉', '新增关注', '取消关注', '主页访客'
          ]
          for (const label of knownLabels) {
            const labelEl = allDivs.find(el => el.childElementCount === 0 && getText(el) === label)
            if (labelEl && labelEl.parentElement) {
              const children = Array.from(labelEl.parentElement.children)
              const idx = children.indexOf(labelEl)
              metrics[label] = {
                value: children[idx + 1] ? getText(children[idx + 1]) : '0',
                change: children[idx + 2] ? getText(children[idx + 2]) : '-'
              }
            }
          }
          return metrics
        })
      }

      // Extract diagnosis and date range (always visible)
      const baseData = await this.page.evaluate(() => {
        const getText = (el: Element | null): string => el?.textContent?.trim() || ''
        const allDivs = Array.from(document.querySelectorAll('div'))

        // Diagnosis
        const diagnosisItems: { value: string; suggestion: string }[] = []
        const diagLabels = ['观看数：', '涨粉数：', '主页访客数：', '发布数：', '互动数：']
        for (const label of diagLabels) {
          const labelEl = allDivs.find(el => el.childElementCount === 0 && getText(el) === label)
          if (labelEl && labelEl.parentElement) {
            const siblings = Array.from(labelEl.parentElement.children)
            const suggestionEl = siblings.find(s => s !== labelEl)
            const suggestion = suggestionEl ? getText(suggestionEl) : ''
            const match = suggestion.match(/为\s*(\d+)/)
            diagnosisItems.push({ value: match ? match[1] : '0', suggestion })
          } else {
            diagnosisItems.push({ value: '0', suggestion: '' })
          }
        }

        // Date range
        let dateRange = ''
        const dateEl = allDivs.find(el => el.childElementCount === 0 && getText(el).startsWith('统计周期'))
        if (dateEl) {
          dateRange = getText(dateEl).replace('统计周期 ', '')
        }

        return { diagnosisItems, dateRange }
      })

      // Tab 1: 观看数据 (default, already visible)
      const viewMetrics = await extractVisibleMetrics()

      // Tab 2: 互动数据
      const interactionTab = this.page.locator('h6:has-text("互动数据")').first()
      if (await interactionTab.count() > 0) {
        await interactionTab.click()
        await this.randomDelay(1, 2)
      }
      const interactionMetrics = await extractVisibleMetrics()

      // Tab 3: 涨粉数据
      const followerTab = this.page.locator('h6:has-text("涨粉数据")').first()
      if (await followerTab.count() > 0) {
        await followerTab.click()
        await this.randomDelay(1, 2)
      }
      const followerMetrics = await extractVisibleMetrics()

      // Merge all metrics
      const metrics = { ...viewMetrics, ...interactionMetrics, ...followerMetrics }

      return {
        period,
        dateRange: baseData.dateRange,
        diagnosis: {
          views: { value: baseData.diagnosisItems[0]?.value || '0', suggestion: baseData.diagnosisItems[0]?.suggestion || '' },
          newFollowers: { value: baseData.diagnosisItems[1]?.value || '0', suggestion: baseData.diagnosisItems[1]?.suggestion || '' },
          profileVisitors: { value: baseData.diagnosisItems[2]?.value || '0', suggestion: baseData.diagnosisItems[2]?.suggestion || '' },
          publishCount: { value: baseData.diagnosisItems[3]?.value || '0', suggestion: baseData.diagnosisItems[3]?.suggestion || '' },
          interactions: { value: baseData.diagnosisItems[4]?.value || '0', suggestion: baseData.diagnosisItems[4]?.suggestion || '' }
        },
        overview: {
          impressions: metrics['曝光数'] || { value: '0', change: '-' },
          views: metrics['观看数'] || { value: '0', change: '-' },
          coverClickRate: metrics['封面点击率'] || { value: '0', change: '-' },
          avgViewDuration: metrics['平均观看时长'] || { value: '0', change: '-' },
          totalViewDuration: metrics['观看总时长'] || { value: '0', change: '-' },
          videoCompletionRate: metrics['视频完播率'] || { value: '0', change: '-' }
        },
        interactions: {
          likes: metrics['点赞数'] || { value: '0', change: '-' },
          comments: metrics['评论数'] || { value: '0', change: '-' },
          collects: metrics['收藏数'] || { value: '0', change: '-' },
          shares: metrics['分享数'] || { value: '0', change: '-' }
        },
        followers: {
          netGain: metrics['净涨粉'] || { value: '0', change: '-' },
          newFollows: metrics['新增关注'] || { value: '0', change: '-' },
          unfollows: metrics['取消关注'] || { value: '0', change: '-' },
          profileVisitors: metrics['主页访客'] || { value: '0', change: '-' }
        }
      } as DashboardOverview
    } catch (error) {
      logger.error('Error getting dashboard overview:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getContentAnalytics(options?: {
    startDate?: string
    endDate?: string
  }): Promise<ContentAnalytics> {
    logger.info('Getting content analytics')
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      await this.navigateToCreatorCenter('/statistics/data-analysis')
      await this.randomDelay(1, 2)

      // Fill date filters if provided
      if (options?.startDate) {
        const startInput = this.page.locator('input[placeholder*="开始时间"]').first()
        if (await startInput.count() > 0) {
          await startInput.click()
          await startInput.fill(options.startDate)
          await this.randomDelay(0.5, 1)
        }
      }
      if (options?.endDate) {
        const endInput = this.page.locator('input[placeholder*="结束时间"]').first()
        if (await endInput.count() > 0) {
          await endInput.click()
          await endInput.fill(options.endDate)
          await this.randomDelay(0.5, 1)
          await this.page.keyboard.press('Enter')
          await this.randomDelay(1, 2)
          await this.page.waitForLoadState('networkidle', { timeout: 30000 })
        }
      }

      // Extract table data
      const data = await this.page.evaluate(() => {
        const getText = (el: Element | null): string => el?.textContent?.trim() || ''
        const notes: {
          title: string; publishTime: string; impressions: string; views: string
          coverClickRate: string; likes: string; comments: string; collects: string
          newFollowers: string; shares: string; avgViewDuration: string; danmaku: string
        }[] = []

        const rows = document.querySelectorAll('table tbody tr')
        for (const row of rows) {
          const cells = row.querySelectorAll('td')
          if (cells.length >= 11) {
            // First cell contains title and publish time
            const infoCell = cells[0]
            const titleEl = infoCell.querySelectorAll('div')
            let title = ''
            let publishTime = ''
            for (const div of titleEl) {
              const text = getText(div)
              if (text.startsWith('发布于')) {
                publishTime = text.replace('发布于', '')
              } else if (text && !text.startsWith('发布于') && div.children.length === 0) {
                title = text
              }
            }

            notes.push({
              title,
              publishTime,
              impressions: getText(cells[1]),
              views: getText(cells[2]),
              coverClickRate: getText(cells[3]),
              likes: getText(cells[4]),
              comments: getText(cells[5]),
              collects: getText(cells[6]),
              newFollowers: getText(cells[7]),
              shares: getText(cells[8]),
              avgViewDuration: getText(cells[9]),
              danmaku: getText(cells[10])
            })
          }
        }

        return { notes, totalCount: notes.length }
      })

      logger.info(`Extracted ${data.totalCount} notes from content analytics`)
      return data as ContentAnalytics
    } catch (error) {
      logger.error('Error getting content analytics:', error)
      throw error
    } finally {
      await this.cleanup()
    }
  }

  async getFansAnalytics(period: string = '7days'): Promise<FansAnalytics> {
    logger.info(`Getting fans analytics for period: ${period}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      await this.navigateToCreatorCenter('/statistics/fans-data')
      await this.randomDelay(1, 2)

      // Switch to 30 days if requested
      if (period === '30days') {
        const btn30 = this.page.locator('text=近30天').first()
        if (await btn30.count() > 0) {
          await btn30.click()
          await this.randomDelay(1, 2)
          await this.page.waitForLoadState('networkidle', { timeout: 30000 })
        }
      }

      const data = await this.page.evaluate(() => {
        const getText = (el: Element | null): string => el?.textContent?.trim() || ''

        // Extract fans overview - find labels and their adjacent values
        const fansLabels = ['总粉丝数', '新增粉丝数', '流失粉丝数']
        const fansValues: Record<string, string> = {}

        const allDivs = document.querySelectorAll('div')
        for (const div of allDivs) {
          const text = getText(div)
          if (fansLabels.includes(text) && div.children.length === 0) {
            const parent = div.parentElement
            if (parent) {
              const children = Array.from(parent.children)
              const valueEl = children.find(c => c !== div && getText(c) !== text)
              if (valueEl) {
                fansValues[text] = getText(valueEl)
              }
            }
          }
        }

        // Check if portrait is available
        let portrait: string | null = null
        const portraitSection = document.querySelector('div')
        const noDataTexts = ['粉丝数过少', '先去涨粉']
        let hasPortrait = true
        for (const div of allDivs) {
          const text = getText(div)
          if (noDataTexts.some(t => text.includes(t))) {
            hasPortrait = false
            portrait = text
            break
          }
        }
        if (hasPortrait) {
          portrait = 'available'
        }

        // Extract active fans
        const activeFans: string[] = []
        // Active fans section shows "最近还没有粉丝和你互动" when empty
        let hasActiveFans = true
        for (const div of allDivs) {
          const text = getText(div)
          if (text.includes('最近还没有粉丝和你互动')) {
            hasActiveFans = false
            break
          }
        }

        return {
          overview: {
            totalFans: fansValues['总粉丝数'] || '0',
            newFans: fansValues['新增粉丝数'] || '0',
            lostFans: fansValues['流失粉丝数'] || '0'
          },
          portrait: hasPortrait ? portrait : null,
          activeFans
        }
      })

      return {
        period,
        ...data
      } as FansAnalytics
    } catch (error) {
      logger.error('Error getting fans analytics:', error)
      throw error
    } finally {
      await this.cleanup()
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
