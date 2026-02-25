/**
 * Debug: check 写长文 list page for draft publish options
 */
import { chromium } from 'playwright'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const SCREENSHOT_DIR = '/tmp/debug-longtext'

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  })
  await context.addInitScript('Object.defineProperty(navigator, "webdriver", { get: () => undefined })')

  if (fs.existsSync(COOKIE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  try {
    // SSO
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))
    const [cp] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      page.locator('a[href*="creator.xiaohongshu.com/publish"]').first().click()
    ])
    await cp.waitForLoadState('domcontentloaded', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    // Go to article list (写长文 tab, but don't click 新的创作)
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 5000))

    console.log('URL:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '18-article-list.png'), fullPage: true })

    // Dump the full page
    const bodyText = await cp.evaluate(() => document.body.innerText)
    console.log('Body text:\n', bodyText.substring(0, 3000))

    // Look for article items/drafts
    const items = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))
      // Find elements that look like article list items
      const listItems = all.filter(el => {
        const cls = el.className?.toString() || ''
        return (cls.includes('item') || cls.includes('card') || cls.includes('article') || cls.includes('draft') || cls.includes('list'))
          && (el as HTMLElement).offsetParent !== null
          && (el as HTMLElement).innerText?.trim().length > 5
          && (el as HTMLElement).innerText?.trim().length < 200
      }).map(el => ({
        tag: el.tagName,
        cls: el.className.toString().substring(0, 120),
        text: (el as HTMLElement).innerText.trim().substring(0, 150),
      }))

      // Find the main content area
      const content = document.querySelector('.content, [class*="content"], main')
      const contentHTML = content ? content.outerHTML.substring(0, 3000) : 'no content'

      return { listItems: listItems.slice(0, 20), contentHTML }
    })

    console.log('\n=== List items ===')
    items.listItems.forEach((item, i) => console.log(`[${i}] ${item.tag} cls=${item.cls}\n    text="${item.text}"`))

    console.log('\n=== Content HTML ===')
    console.log(items.contentHTML.substring(0, 2000))

    // Try hovering over items to see action buttons
    const articleHeaders = cp.locator('.header:has-text("测试"), .header:has-text("调试"), [class*="title"]:has-text("测试")')
    const headerCount = await articleHeaders.count()
    console.log('\nArticle headers found:', headerCount)

    if (headerCount > 0) {
      for (let i = 0; i < Math.min(headerCount, 3); i++) {
        const header = articleHeaders.nth(i)
        const text = await header.innerText()
        console.log(`Hovering over: "${text.substring(0, 50)}"`)
        await header.hover()
        await new Promise(r => setTimeout(r, 2000))
        await cp.screenshot({ path: path.join(SCREENSHOT_DIR, `19-hover-${i}.png`), fullPage: true })
      }
    }

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
