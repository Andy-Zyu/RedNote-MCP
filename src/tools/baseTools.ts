import { Page, Locator } from 'playwright'
import logger from '../utils/logger'
import { BrowserManager, PageLease } from '../browser/browserManager'
import { SELECTORS } from '../selectors'

export abstract class BaseTools {
  protected page: Page | null = null
  protected lease: PageLease | null = null

  extractRedBookUrl(shareText: string): string {
    const xhslinkRegex = /(https?:\/\/xhslink\.com\/[a-zA-Z0-9\/]+)/i
    const xhslinkMatch = shareText.match(xhslinkRegex)
    if (xhslinkMatch && xhslinkMatch[1]) {
      return xhslinkMatch[1]
    }

    const xiaohongshuRegex = /(https?:\/\/(?:www\.)?xiaohongshu\.com\/[^，\s]+)/i
    const xiaohongshuMatch = shareText.match(xiaohongshuRegex)
    if (xiaohongshuMatch && xiaohongshuMatch[1]) {
      return xiaohongshuMatch[1]
    }

    return shareText
  }

  protected async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min
    logger.debug(`Adding random delay of ${delay.toFixed(2)} seconds`)
    await new Promise((resolve) => setTimeout(resolve, delay * 1000))
  }

  protected async dismissTippyPopups(): Promise<void> {
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

  protected async safeClick(locator: Locator, description: string): Promise<void> {
    await this.dismissTippyPopups()
    try {
      await locator.click({ timeout: 15000 })
      logger.info(`Clicked ${description} successfully`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes('intercepts pointer events') || errorMsg.includes('Timeout')) {
        logger.warn(`Click on ${description} intercepted, dismissing popups and force-clicking`)
        await this.dismissTippyPopups()
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
   * Type a hashtag in the editor and select from the suggestion dropdown.
   * The XHS TipTap editor shows a tippy popup with topic suggestions when
   * you type `#`. We type the tag name, wait for the dropdown, and click
   * the first suggestion to activate it as a real topic tag.
   * Falls back to plain text + Space if no dropdown appears.
   */
  protected async typeAndSelectTag(page: Page, tag: string): Promise<void> {
    logger.info(`Typing tag: #${tag}`)

    // Type # to trigger the suggestion dropdown
    await page.keyboard.type('#', { delay: 80 })
    await new Promise(r => setTimeout(r, 500))

    // Type the tag name to filter suggestions
    await page.keyboard.type(tag, { delay: 80 })
    await new Promise(r => setTimeout(r, 1500))

    // Wait for suggestion dropdown and click first item
    try {
      const suggestionItem = page.locator(SELECTORS.publish.tagSuggestionItem).first()
      await suggestionItem.waitFor({ state: 'visible', timeout: 3000 })
      await suggestionItem.click({ timeout: 3000 })
      logger.info(`Selected tag suggestion for: ${tag}`)
      await new Promise(r => setTimeout(r, 300))
    } catch {
      // Fallback: no dropdown appeared, press Space to finalize as plain text
      logger.warn(`No tag suggestion dropdown for "${tag}", falling back to plain text`)
      await page.keyboard.press('Space')
    }

    await this.randomDelay(0.3, 0.5)
  }

  /**
   * Check if the current page has been redirected to a captcha/anti-bot page.
   * If so, throw an error telling the Agent to re-login.
   */
  protected checkCaptchaRedirect(page: Page): void {
    const url = page.url()
    if (url.includes('/website-login/captcha') || url.includes('verifyType=')) {
      throw new Error(
        '当前会话已被小红书风控拦截，请先调用 login 工具重新登录后再试。'
      )
    }
  }

  /**
   * Navigate to a creator center page via SSO.
   * Creator subdomain requires SSO — we must first visit the main site,
   * click the publish link (which triggers SSO in a new tab), then navigate
   * to the target URL within that authenticated tab.
   */
  protected async navigateToCreator(lease: PageLease, targetUrl: string): Promise<Page> {
    const page = lease.page

    await page.goto('https://www.xiaohongshu.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })
    logger.info('Main site loaded for SSO trigger')
    this.checkCaptchaRedirect(page)

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

    const creatorUrl = creatorPage.url()
    if (creatorUrl.includes('login') || creatorUrl.includes('cas')) {
      await creatorPage.close()
      throw new Error('未登录或 Cookie 已失效，请先运行 login 工具登录')
    }

    if (!creatorUrl.includes(new URL(targetUrl).pathname)) {
      await creatorPage.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })
      logger.info(`Navigated to target: ${creatorPage.url()}`)
    }

    await new Promise(r => setTimeout(r, 2000))
    return creatorPage
  }

  /**
   * Acquire a page lease, navigate to creator center via SSO, run callback,
   * then clean up (close creator tab + release lease).
   */
  protected async withCreatorPage<T>(
    targetUrl: string,
    callback: (creatorPage: Page) => Promise<T>
  ): Promise<T> {
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    let creatorPage: Page | null = null
    try {
      creatorPage = await this.navigateToCreator(lease, targetUrl)
      this.page = creatorPage
      this.lease = lease
      return await callback(creatorPage)
    } finally {
      if (creatorPage && creatorPage !== lease.page && !creatorPage.isClosed()) {
        await creatorPage.close()
      }
      this.page = null
      this.lease = null
      await lease.release()
    }
  }
}
