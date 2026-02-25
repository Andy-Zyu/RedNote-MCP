/**
 * Debug: explore 活动中心 (Activity Center) page structure
 */
import { chromium } from 'playwright'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const SCREENSHOT_DIR = '/tmp/debug-activity'

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

    // Intercept API responses
    const apiResponses: { url: string; body: string }[] = []
    cp.on('response', async res => {
      const url = res.url()
      if (url.includes('activity') && !url.includes('.js') && !url.includes('.css') && !url.includes('apm-fe') && !url.includes('collect')) {
        try {
          const body = await res.text()
          apiResponses.push({ url, body: body.substring(0, 2000) })
        } catch {}
      }
    })

    // Navigate to activity center
    await cp.goto('https://creator.xiaohongshu.com/activity-center', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 5000))

    console.log('URL:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '01-activity-center.png'), fullPage: true })

    // Dump body text
    const bodyText = await cp.evaluate(() => document.body.innerText)
    console.log('Body text:\n', bodyText.substring(0, 5000))

    // Dump API responses
    console.log('\n=== API Responses ===')
    apiResponses.forEach((r, i) => {
      console.log(`[${i}] ${r.url}`)
      console.log(`    ${r.body.substring(0, 500)}`)
    })

    // Look for activity cards/items
    const items = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))
      const cards = all.filter(el => {
        const cls = el.className?.toString() || ''
        return (cls.includes('card') || cls.includes('item') || cls.includes('activity'))
          && (el as HTMLElement).offsetParent !== null
          && (el as HTMLElement).innerText?.trim().length > 10
          && (el as HTMLElement).innerText?.trim().length < 500
          && el.tagName === 'DIV'
      }).map(el => ({
        cls: el.className.toString().substring(0, 120),
        text: (el as HTMLElement).innerText.trim().substring(0, 200),
        childCount: el.children.length,
      }))
      return cards.slice(0, 30)
    })

    console.log('\n=== Activity cards/items ===')
    items.forEach((item, i) => console.log(`[${i}] cls=${item.cls} children=${item.childCount}\n    text="${item.text}"`))

    // Check for tabs/filters
    const tabs = await cp.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="tab"], [class*="filter"], [role="tab"]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText?.trim().substring(0, 50),
        cls: el.className.toString().substring(0, 100),
      }))
    })
    console.log('\n=== Tabs/filters ===')
    tabs.forEach((t, i) => console.log(`[${i}] ${t.tag} "${t.text}" cls=${t.cls}`))

    // Scroll down to load more
    await cp.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await new Promise(r => setTimeout(r, 3000))
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '02-activity-scrolled.png'), fullPage: true })

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
