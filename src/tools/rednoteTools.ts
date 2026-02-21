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
      await this.page.goto('https://www.xiaohongshu.com')
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
  }): Promise<{ success: boolean; message: string }> {
    logger.info(`Publishing note with title: ${options.title}`)
    try {
      await this.initialize()
      if (!this.page) throw new Error('Page not initialized')

      // Navigate to publish page
      logger.info('Navigating to creator publish page')
      await this.page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'networkidle' })
      await this.randomDelay(1, 2)

      // Upload images if provided
      if (options.images && options.images.length > 0) {
        logger.info(`Uploading ${options.images.length} images`)
        const fileInput = await this.page.$('input[type="file"]')
        if (fileInput) {
          await fileInput.setInputFiles(options.images)
          logger.info('Images set on file input, waiting for upload')
          // Wait for uploads to complete
          await this.randomDelay(2, 4)
          // Wait for upload progress to finish - look for uploaded image indicators
          try {
            await this.page.waitForFunction(
              (count) => {
                const uploadedItems = document.querySelectorAll('.publish-uploader .image-item, .upload-item, .coverImg')
                return uploadedItems.length >= count
              },
              options.images.length,
              { timeout: 60000 }
            )
            logger.info('All images uploaded successfully')
          } catch {
            logger.warn('Image upload wait timed out, proceeding anyway')
          }
          await this.randomDelay(1, 2)
        } else {
          logger.warn('File input not found, skipping image upload')
        }
      }

      // Fill in title
      logger.info('Filling in title')
      const titleInput = await this.page.$('#publisherTitleInput, [placeholder*="标题"], .title-input input, .c-input_inner')
      if (titleInput) {
        await titleInput.click()
        await this.randomDelay(0.3, 0.6)
        await titleInput.type(options.title, { delay: 50 })
      } else {
        logger.warn('Title input not found, trying alternative selectors')
        await this.page.locator('[class*="title"] input, [class*="title"] textarea').first().type(options.title, { delay: 50 })
      }
      await this.randomDelay(0.5, 1)

      // Fill in content
      logger.info('Filling in content')
      const contentEditor = await this.page.$('#post-textarea, .ql-editor, [contenteditable="true"], [placeholder*="正文"]')
      if (contentEditor) {
        await contentEditor.click()
        await this.randomDelay(0.3, 0.6)
        await contentEditor.type(options.content, { delay: 30 })
      } else {
        logger.warn('Content editor not found, trying alternative selectors')
        await this.page.locator('[class*="editor"] [contenteditable], [class*="content"] [contenteditable]').first().type(options.content, { delay: 30 })
      }
      await this.randomDelay(0.5, 1)

      // Add tags
      if (options.tags && options.tags.length > 0) {
        logger.info(`Adding ${options.tags.length} tags`)
        for (const tag of options.tags) {
          // Type # followed by tag name in the content area to trigger tag input
          const editor = await this.page.$('#post-textarea, .ql-editor, [contenteditable="true"]')
          if (editor) {
            await editor.click()
            await this.randomDelay(0.3, 0.5)
            await editor.type(` #${tag}`, { delay: 50 })
            await this.randomDelay(0.5, 1)
            // Press space to confirm the tag
            await this.page.keyboard.press('Space')
            await this.randomDelay(0.3, 0.6)
          }
        }
      }
      await this.randomDelay(1, 2)

      // Click publish button
      logger.info('Clicking publish button')
      const publishButton = await this.page.$('button.publishBtn, button.css-k01wbh, [class*="publish"] button, button:has-text("发布")')
      if (publishButton) {
        await publishButton.click()
      } else {
        // Fallback: try to find button by text
        await this.page.locator('button').filter({ hasText: '发布' }).first().click()
      }

      // Wait for publish confirmation
      logger.info('Waiting for publish confirmation')
      try {
        await this.page.waitForURL('**/publish/success**', { timeout: 30000 })
        logger.info('Note published successfully')
        return { success: true, message: '笔记发布成功' }
      } catch {
        // Check if there's a success message on the page
        const successText = await this.page.evaluate(() => {
          const el = document.querySelector('.success, [class*="success"], .toast')
          return el?.textContent?.trim() || ''
        })
        if (successText) {
          logger.info(`Publish result: ${successText}`)
          return { success: true, message: successText }
        }
        logger.warn('Could not confirm publish success, but no error detected')
        return { success: true, message: '笔记已提交发布，请在小红书创作者中心确认状态' }
      }
    } catch (error) {
      logger.error('Error publishing note:', error)
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
