import logger from '../utils/logger'
import { BrowserManager } from '../browser/browserManager'
import { BaseTools } from './baseTools'
import { SELECTORS } from '../selectors'
import { LikeNoteResult, CollectNoteResult, FollowAuthorResult } from './types'

export class EngagementTools extends BaseTools {
  async likeNote(noteUrl: string, accountId?: string): Promise<LikeNoteResult> {
    const url = this.extractRedBookUrl(noteUrl)
    logger.info(`Liking note: ${url}`)

    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    try {
      const page = lease.page
      this.page = page

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      this.checkCaptchaRedirect(page)
      await this.randomDelay(2, 3)

      // Wait for the engage bar to appear
      await page.waitForSelector(SELECTORS.engagement.engageBar, { timeout: 15000 })

      const likeWrapper = page.locator(SELECTORS.engagement.likeWrapper).first()
      await likeWrapper.waitFor({ state: 'visible', timeout: 10000 })

      // Check current like state via SVG icon href (#like = not liked, #liked = liked)
      const alreadyLiked = await likeWrapper.evaluate((el) => {
        const use = el.querySelector('svg use')
        const href = use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : ''
        return href === '#liked'
      })

      if (alreadyLiked) {
        logger.info('Note is already liked')
        return { success: true, message: '该笔记已经点赞过了', liked: true }
      }

      // Click the like button
      await this.safeClick(likeWrapper, '点赞按钮')
      await this.randomDelay(1, 2)

      // Verify the like took effect via SVG icon href
      const nowLiked = await likeWrapper.evaluate((el) => {
        const use = el.querySelector('svg use')
        const href = use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : ''
        return href === '#liked'
      })

      if (nowLiked) {
        logger.info('Note liked successfully')
        return { success: true, message: '点赞成功', liked: true }
      }

      return { success: false, message: '点赞未生效，请重试', liked: false }
    } catch (error) {
      logger.error('Error liking note:', error)
      throw error
    } finally {
      this.page = null
      await lease.release()
    }
  }

  async collectNote(noteUrl: string, accountId?: string): Promise<CollectNoteResult> {
    const url = this.extractRedBookUrl(noteUrl)
    logger.info(`Collecting note: ${url}`)

    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    try {
      const page = lease.page
      this.page = page

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      this.checkCaptchaRedirect(page)
      await this.randomDelay(2, 3)

      // Wait for the engage bar to appear
      await page.waitForSelector(SELECTORS.engagement.engageBar, { timeout: 15000 })

      const collectWrapper = page.locator(SELECTORS.engagement.collectWrapper).first()
      await collectWrapper.waitFor({ state: 'visible', timeout: 10000 })

      // Check current collect state via SVG icon href (#collect = not collected, #collected = collected)
      const alreadyCollected = await collectWrapper.evaluate((el) => {
        const use = el.querySelector('svg use')
        const href = use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : ''
        return href === '#collected'
      })

      if (alreadyCollected) {
        logger.info('Note is already collected')
        return { success: true, message: '该笔记已经收藏过了', collected: true }
      }

      // Click the collect button
      await this.safeClick(collectWrapper, '收藏按钮')
      await this.randomDelay(1, 2)

      // Dismiss the board-list popup if it appeared (click outside or press Escape)
      const boardPopup = page.locator('.board-list-container')
      if (await boardPopup.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape')
        await this.randomDelay(0.5, 1)
      }

      // Verify the collect took effect via SVG icon href
      const nowCollected = await collectWrapper.evaluate((el) => {
        const use = el.querySelector('svg use')
        const href = use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : ''
        return href === '#collected'
      })

      if (nowCollected) {
        logger.info('Note collected successfully')
        return { success: true, message: '收藏成功', collected: true }
      }

      return { success: false, message: '收藏未生效，请重试', collected: false }
    } catch (error) {
      logger.error('Error collecting note:', error)
      throw error
    } finally {
      this.page = null
      await lease.release()
    }
  }

  async followAuthor(noteUrl: string, accountId?: string): Promise<FollowAuthorResult> {
    const url = this.extractRedBookUrl(noteUrl)
    logger.info(`Following author from note: ${url}`)

    const bm = BrowserManager.getInstance(accountId)
    const lease = await bm.acquirePage()
    try {
      const page = lease.page
      this.page = page

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      this.checkCaptchaRedirect(page)
      await this.randomDelay(2, 3)

      // Wait for the follow button to appear (use last() since first container may be hidden)
      const followBtn = page.locator(SELECTORS.engagement.followButton).last()
      await followBtn.waitFor({ state: 'visible', timeout: 15000 })

      // Read current follow state from button text
      const buttonText = await page
        .locator(SELECTORS.engagement.followButtonText)
        .last()
        .textContent()
      const trimmedText = buttonText?.trim() ?? ''

      const alreadyFollowing = trimmedText === '已关注' || trimmedText === '互相关注'

      if (alreadyFollowing) {
        logger.info(`Already following author (state: ${trimmedText})`)
        return { success: true, message: `已经关注该作者（${trimmedText}）`, followed: true }
      }

      // Click the follow button
      await this.safeClick(followBtn, '关注按钮')
      await this.randomDelay(1, 2)

      // Verify the follow took effect
      const newText = await page
        .locator(SELECTORS.engagement.followButtonText)
        .last()
        .textContent()
      const newTrimmed = newText?.trim() ?? ''
      const nowFollowing = newTrimmed === '已关注' || newTrimmed === '互相关注'

      if (nowFollowing) {
        logger.info('Author followed successfully')
        return { success: true, message: '关注成功', followed: true }
      }

      return { success: false, message: '关注未生效，请重试', followed: false }
    } catch (error) {
      logger.error('Error following author:', error)
      throw error
    } finally {
      this.page = null
      await lease.release()
    }
  }
}
