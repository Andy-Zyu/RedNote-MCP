/**
 * Debug: find activity center by clicking sidebar menu
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

    // Find and click 活动中心 in sidebar
    const activityLink = cp.locator('text=活动中心').first()
    console.log('活动中心 link count:', await activityLink.count())

    // Get the href
    const linkInfo = await cp.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, [class*="menu-item"]'))
      return links.filter(el => (el as HTMLElement).innerText?.includes('活动中心')).map(el => ({
        tag: el.tagName,
        href: el.getAttribute('href') || '',
        text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 100),
      }))
    })
    console.log('Activity links:', JSON.stringify(linkInfo, null, 2))

    // Click it
    await activityLink.click()
    await new Promise(r => setTimeout(r, 5000))

    console.log('URL after click:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '03-activity-via-menu.png'), fullPage: true })

    // Intercept API
    const apiResponses: { url: string; body: string }[] = []
    cp.on('response', async res => {
      const url = res.url()
      if (url.includes('activity') && !url.includes('.js') && !url.includes('.css') && !url.includes('apm-fe') && !url.includes('collect') && !url.includes('.png')) {
        try {
          const body = await res.text()
          apiResponses.push({ url, body: body.substring(0, 3000) })
        } catch {}
      }
    })

    // Reload to capture API
    await cp.reload({ waitUntil: 'domcontentloaded' })
    await new Promise(r => setTimeout(r, 5000))

    console.log('\n=== API Responses ===')
    apiResponses.forEach((r, i) => {
      console.log(`\n[${i}] ${r.url}`)
      console.log(r.body.substring(0, 1000))
    })

    // Dump body text
    const bodyText = await cp.evaluate(() => document.body.innerText)
    console.log('\n=== Body text ===')
    console.log(bodyText.substring(0, 5000))

    // Look for activity items
    const items = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('[class*="card"], [class*="item"], [class*="activity"]'))
      return all.filter(el => {
        return (el as HTMLElement).offsetParent !== null
          && (el as HTMLElement).innerText?.trim().length > 10
          && (el as HTMLElement).innerText?.trim().length < 500
      }).map(el => ({
        cls: el.className.toString().substring(0, 120),
        text: (el as HTMLElement).innerText.trim().substring(0, 200),
      })).slice(0, 20)
    })
    console.log('\n=== Activity items ===')
    items.forEach((item, i) => console.log(`[${i}] cls=${item.cls}\n    text="${item.text}"`))

    // Check tabs
    const tabs = await cp.evaluate(() => {
      return Array.from(document.querySelectorAll('[class*="tab"], [role="tab"], [class*="filter"]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null && (el as HTMLElement).innerText?.trim().length > 0
      }).map(el => ({
        text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 100),
      }))
    })
    console.log('\n=== Tabs ===')
    tabs.forEach((t, i) => console.log(`[${i}] "${t.text}" cls=${t.cls}`))

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '04-activity-reloaded.png'), fullPage: true })
    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
