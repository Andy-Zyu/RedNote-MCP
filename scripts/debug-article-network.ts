/**
 * Debug: intercept network requests in article editor to find publish API
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

    // Go to article editor
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    // Click 新的创作
    await cp.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Start intercepting ALL network requests
    const requests: { method: string; url: string; postData?: string }[] = []
    cp.on('request', req => {
      const url = req.url()
      if (url.includes('xiaohongshu') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg')) {
        requests.push({
          method: req.method(),
          url: url,
          postData: req.postData()?.substring(0, 500),
        })
      }
    })

    // Fill title and content
    await cp.locator('textarea[placeholder*="标题"]').first().fill('测试网络请求拦截')
    await new Promise(r => setTimeout(r, 1000))
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await cp.keyboard.type('这是测试内容，用于拦截网络请求。', { delay: 20 })
    await new Promise(r => setTimeout(r, 5000))

    console.log('=== Requests during editing ===')
    requests.forEach((r, i) => {
      console.log(`[${i}] ${r.method} ${r.url}`)
      if (r.postData) console.log(`    POST: ${r.postData.substring(0, 200)}`)
    })

    // Clear and try clicking 暂存离开
    requests.length = 0
    console.log('\n--- Clicking 暂存离开 ---')
    await cp.locator('button:has-text("暂存离开")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    console.log('=== Requests during 暂存离开 ===')
    requests.forEach((r, i) => {
      console.log(`[${i}] ${r.method} ${r.url}`)
      if (r.postData) console.log(`    POST: ${r.postData.substring(0, 300)}`)
    })

    // Check if we're back on the list page
    console.log('\nURL after 暂存离开:', cp.url())

    // Now check if there's a draft and if it has a publish option
    await new Promise(r => setTimeout(r, 3000))
    const bodyText = await cp.evaluate(() => document.body.innerText)
    console.log('\nBody text:\n', bodyText.substring(0, 2000))

    // Look for draft items with hover actions
    const draftItems = cp.locator('[class*="draft"], [class*="article-item"]')
    const draftCount = await draftItems.count()
    console.log('\nDraft items found:', draftCount)

    // Try to find any element with "发布" text that appears on hover
    if (draftCount > 0) {
      for (let i = 0; i < Math.min(draftCount, 3); i++) {
        await draftItems.nth(i).hover()
        await new Promise(r => setTimeout(r, 2000))
        const hoverText = await cp.evaluate(() => {
          return Array.from(document.querySelectorAll('*')).filter(el => {
            const text = (el as HTMLElement).innerText || ''
            return text.includes('发布') && text.length < 15 && (el as HTMLElement).offsetParent !== null
          }).map(el => ({
            tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
            cls: el.className.toString().substring(0, 100),
          }))
        })
        console.log(`Draft [${i}] hover elements:`, hoverText)
      }
    }

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '20-after-save.png'), fullPage: true })
    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
