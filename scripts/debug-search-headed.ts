import { chromium } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'

async function main() {
  const cookiePath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
  const cm = new CookieManager(cookiePath)

  console.log('=== Testing: headless:false (visible browser) ===')
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
  })

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const cookies = await cm.loadCookies()
  await context.addCookies(cookies)

  const page = await context.newPage()

  // Listen for search API
  page.on('response', async (response) => {
    if (response.url().includes('/api/sns/web/v1/search/notes')) {
      console.log(`  [API] ${response.request().method()} ${response.status()} ${response.url().substring(0, 100)}`)
      try {
        const json = await response.json()
        const items = json?.data?.items || []
        console.log(`  Items: ${items.length}`)
        if (items.length > 0) {
          const nc = items[0].note_card || items[0]
          console.log(`  First: "${nc.display_title || nc.title || '(none)'}"`)
        }
      } catch {}
    }
  })

  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent('咖啡推荐')}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )
  await new Promise(r => setTimeout(r, 10000))

  const url = page.url()
  const hasCaptcha = url.includes('captcha')
  console.log(`URL: ${url.substring(0, 150)}`)
  console.log(`Captcha: ${hasCaptcha}`)

  if (!hasCaptcha) {
    const noteCount = await page.evaluate(() => {
      return document.querySelectorAll('.note-item, [class*="note-item"]').length
    })
    console.log(`Note items in DOM: ${noteCount}`)
  }

  await page.screenshot({ path: '/tmp/search-headed.png' })
  console.log('Screenshot: /tmp/search-headed.png')

  await browser.close()
}

main().catch(console.error)
