import { chromium } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

async function main() {
  const cookiePath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
  const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
  const cm = new CookieManager(cookiePath)

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true })
  }

  console.log('=== Testing: launchPersistentContext ===')
  console.log(`Profile dir: ${profileDir}`)

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  // Load cookies
  const cookies = await cm.loadCookies()
  if (cookies.length > 0) {
    console.log(`Loading ${cookies.length} cookies`)
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  page.on('response', async (response) => {
    if (response.url().includes('/api/sns/web/v1/search/notes')) {
      console.log(`[API] ${response.request().method()} ${response.status()} ${response.url().substring(0, 100)}`)
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

  console.log('\nNavigating to search...')
  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent('咖啡推荐')}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )
  await new Promise(r => setTimeout(r, 8000))

  const url = page.url()
  const hasCaptcha = url.includes('captcha')
  console.log(`\nURL: ${url.substring(0, 150)}`)
  console.log(`Captcha: ${hasCaptcha}`)

  if (!hasCaptcha) {
    const noteCount = await page.evaluate(() => {
      return document.querySelectorAll('.note-item, [class*="note-item"]').length
    })
    console.log(`Note items in DOM: ${noteCount}`)
  }

  await page.screenshot({ path: '/tmp/search-persistent.png' })
  console.log('Screenshot: /tmp/search-persistent.png')

  await context.close()
}

main().catch(console.error)
