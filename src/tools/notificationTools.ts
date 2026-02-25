import { Page } from 'playwright'
import logger from '../utils/logger'
import { BrowserManager } from '../browser/browserManager'
import { BaseTools } from './baseTools'
import { SELECTORS } from '../selectors'
import { NotificationTab, NotificationItem, GetNotificationsResult } from './types'

const TAB_LABELS: Record<NotificationTab, string> = {
  comments: '评论和@',
  likes: '赞和收藏',
  follows: '新增关注',
}

export class NotificationTools extends BaseTools {
  async getNotifications(
    tab?: NotificationTab,
    limit: number = 20,
  ): Promise<GetNotificationsResult[]> {
    const bm = BrowserManager.getInstance()
    const lease = await bm.acquirePage()
    try {
      const page = lease.page
      this.page = page

      await page.goto('https://www.xiaohongshu.com/notification', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      this.checkCaptchaRedirect(page)
      await this.randomDelay(3, 5)

      // Wait for the notification page to load
      await page.waitForSelector(SELECTORS.notification.contentContainer, {
        timeout: 15000,
      })

      const tabs: NotificationTab[] = tab ? [tab] : ['comments', 'likes', 'follows']
      const results: GetNotificationsResult[] = []

      for (const currentTab of tabs) {
        const items = await this.extractTab(page, currentTab, limit)
        results.push(items)
        if (tabs.length > 1) {
          await this.randomDelay(1, 2)
        }
      }

      return results
    } catch (error) {
      logger.error('Error getting notifications:', error)
      throw error
    } finally {
      this.page = null
      await lease.release()
    }
  }

  private async extractTab(
    page: Page,
    tab: NotificationTab,
    limit: number,
  ): Promise<GetNotificationsResult> {
    const tabLabel = TAB_LABELS[tab]

    // Click the tab
    const tabLocator = page
      .locator(SELECTORS.notification.tabItem)
      .filter({ hasText: tabLabel })
    await this.safeClick(tabLocator, `通知标签: ${tabLabel}`)
    await this.randomDelay(2, 3)

    // Wait for content to load
    await page.waitForSelector(SELECTORS.notification.contentContainer, {
      timeout: 10000,
    })

    // Extract notification items via page.evaluate (string-based to avoid tsx __name issue)
    const notifications: NotificationItem[] = await page.evaluate(`
      (function() {
        var sel = ${JSON.stringify(SELECTORS.notification)};
        var containers = document.querySelectorAll(sel.itemContainer);
        var results = [];
        for (var i = 0; i < Math.min(containers.length, ${limit}); i++) {
          var el = containers[i];

          var nameEl = el.querySelector(sel.userName);
          var sender = nameEl ? nameEl.textContent.trim() : '';

          var tagEl = el.querySelector(sel.userTag);
          var senderTag = tagEl ? tagEl.textContent.trim() : undefined;

          var actionEl = el.querySelector(sel.interactionAction);
          var action = actionEl ? actionEl.textContent.trim() : '';

          var timeEl = el.querySelector(sel.interactionTime);
          var time = timeEl ? timeEl.textContent.trim() : '';

          var contentEl = el.querySelector(sel.interactionContent);
          var content = contentEl ? contentEl.textContent.trim() : undefined;

          var quoteEl = el.querySelector(sel.quoteInfo);
          var quote = quoteEl ? quoteEl.textContent.trim() : undefined;

          var noteId = el.getAttribute('note-id') || undefined;

          if (sender || action) {
            var item = { sender: sender, action: action, time: time };
            if (senderTag) item.senderTag = senderTag;
            if (content) item.content = content;
            if (quote) item.quote = quote;
            if (noteId) item.noteId = noteId;
            results.push(item);
          }
        }
        return results;
      })()
    `)

    logger.info(`Extracted ${notifications.length} notifications from tab: ${tabLabel}`)

    return {
      tab: tabLabel,
      notifications,
      totalCount: notifications.length,
    }
  }
}
