import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()

  const cookieData = fs.readFileSync(COOKIE_PATH, 'utf-8')
  await context.addCookies(JSON.parse(cookieData))

  const page = await context.newPage()

  // Navigate to notification page
  await page.goto('https://www.xiaohongshu.com/notification', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(r => setTimeout(r, 5000))

  console.log('=== CURRENT URL ===')
  console.log(page.url())

  // ===== TAB 1: 评论和@ (Comments & Mentions) =====
  console.log('\n\n========== TAB 1: 评论和@ ==========')

  // Get the tabs-content-container inner HTML
  const tabContentHtml = await page.evaluate(`
    (function() {
      var container = document.querySelector('.tabs-content-container');
      if (!container) return 'NO .tabs-content-container found';
      return container.innerHTML.substring(0, 8000);
    })()
  `)
  console.log('=== TABS CONTENT CONTAINER HTML ===')
  console.log(tabContentHtml)

  // Look for individual notification entries in the comments tab
  const commentNotifs = await page.evaluate(`
    (function() {
      // Try various selectors for notification items
      var selectors = [
        '.notification-page .comment-item',
        '.notification-page .notify-item',
        '.notification-page .message-item',
        '.tabs-content-container > div',
        '.tabs-content-container li',
        '.tabs-content-container section',
        '[class*="notify"]',
        '[class*="noti-"]',
        '[class*="comment-noti"]',
        '[class*="mention"]',
      ];
      var results = {};
      selectors.forEach(function(sel) {
        var els = document.querySelectorAll(sel);
        if (els.length > 0) {
          results[sel] = {
            count: els.length,
            items: Array.from(els).slice(0, 3).map(function(el) {
              return {
                tag: el.tagName,
                className: el.className,
                text: el.textContent.substring(0, 300),
                outerHtml: el.outerHTML.substring(0, 800)
              };
            })
          };
        }
      });
      return results;
    })()
  `)
  console.log('=== COMMENT NOTIFICATION ITEMS ===')
  console.log(JSON.stringify(commentNotifs, null, 2))

  // Deep dive: get all direct children of tabs-content-container
  const directChildren = await page.evaluate(`
    (function() {
      var container = document.querySelector('.tabs-content-container');
      if (!container) return [];
      return Array.from(container.children).map(function(child) {
        return {
          tag: child.tagName,
          className: child.className,
          childCount: child.children.length,
          text: child.textContent.substring(0, 200),
          outerHtml: child.outerHTML.substring(0, 1000)
        };
      });
    })()
  `)
  console.log('=== DIRECT CHILDREN OF TABS-CONTENT-CONTAINER ===')
  console.log(JSON.stringify(directChildren, null, 2))

  // Recursively explore the notification content structure
  const deepStructure = await page.evaluate(`
    (function() {
      function explore(el, depth) {
        if (depth > 5) return null;
        var result = {
          tag: el.tagName,
          className: (el.className || '').toString().substring(0, 100),
          text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
            ? el.textContent.substring(0, 100) : '',
          children: []
        };
        for (var i = 0; i < Math.min(el.children.length, 5); i++) {
          var child = explore(el.children[i], depth + 1);
          if (child) result.children.push(child);
        }
        return result;
      }
      var container = document.querySelector('.tabs-content-container');
      if (!container) return null;
      return explore(container, 0);
    })()
  `)
  console.log('=== DEEP STRUCTURE ===')
  console.log(JSON.stringify(deepStructure, null, 2))

  // ===== TAB 2: 赞和收藏 (Likes & Collects) =====
  console.log('\n\n========== TAB 2: 赞和收藏 ==========')
  const likesTab = page.locator('.reds-tab-item.tab-item').filter({ hasText: '赞和收藏' })
  await likesTab.click()
  await new Promise(r => setTimeout(r, 3000))

  const likesContent = await page.evaluate(`
    (function() {
      var container = document.querySelector('.tabs-content-container');
      if (!container) return 'NO container';
      return container.innerHTML.substring(0, 5000);
    })()
  `)
  console.log('=== LIKES TAB CONTENT ===')
  console.log(likesContent)

  const likesStructure = await page.evaluate(`
    (function() {
      function explore(el, depth) {
        if (depth > 5) return null;
        var result = {
          tag: el.tagName,
          className: (el.className || '').toString().substring(0, 100),
          text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
            ? el.textContent.substring(0, 100) : '',
          children: []
        };
        for (var i = 0; i < Math.min(el.children.length, 5); i++) {
          var child = explore(el.children[i], depth + 1);
          if (child) result.children.push(child);
        }
        return result;
      }
      var container = document.querySelector('.tabs-content-container');
      if (!container) return null;
      return explore(container, 0);
    })()
  `)
  console.log('=== LIKES DEEP STRUCTURE ===')
  console.log(JSON.stringify(likesStructure, null, 2))

  // ===== TAB 3: 新增关注 (New Followers) =====
  console.log('\n\n========== TAB 3: 新增关注 ==========')
  const followsTab = page.locator('.reds-tab-item.tab-item').filter({ hasText: '新增关注' })
  await followsTab.click()
  await new Promise(r => setTimeout(r, 3000))

  const followsContent = await page.evaluate(`
    (function() {
      var container = document.querySelector('.tabs-content-container');
      if (!container) return 'NO container';
      return container.innerHTML.substring(0, 5000);
    })()
  `)
  console.log('=== FOLLOWS TAB CONTENT ===')
  console.log(followsContent)

  const followsStructure = await page.evaluate(`
    (function() {
      function explore(el, depth) {
        if (depth > 5) return null;
        var result = {
          tag: el.tagName,
          className: (el.className || '').toString().substring(0, 100),
          text: el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
            ? el.textContent.substring(0, 100) : '',
          children: []
        };
        for (var i = 0; i < Math.min(el.children.length, 5); i++) {
          var child = explore(el.children[i], depth + 1);
          if (child) result.children.push(child);
        }
        return result;
      }
      var container = document.querySelector('.tabs-content-container');
      if (!container) return null;
      return explore(container, 0);
    })()
  `)
  console.log('=== FOLLOWS DEEP STRUCTURE ===')
  console.log(JSON.stringify(followsStructure, null, 2))

  // Also check for API interception opportunities
  console.log('\n\n========== API INTERCEPTION CHECK ==========')

  // Go back to comments tab and intercept network
  const commentsTab = page.locator('.reds-tab-item.tab-item').filter({ hasText: '评论和@' })

  const apiRequests: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('api') || url.includes('notification') || url.includes('message') || url.includes('comment')) {
      apiRequests.push(`${req.method()} ${url}`)
    }
  })

  await commentsTab.click()
  await new Promise(r => setTimeout(r, 3000))

  console.log('=== API REQUESTS CAPTURED ===')
  apiRequests.forEach(r => console.log(r))

  await browser.close()
}

main().catch(console.error)
