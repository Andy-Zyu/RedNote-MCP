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
