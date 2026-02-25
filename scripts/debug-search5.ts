import { chromium } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'

async function main() {
  const cookiePath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
  const cm = new CookieManager(cookiePath)

  // Test with different launch configs
  const configs = [
    { name: 'headless:true + anti-detect', headless: true as const, args: ['--disable-blink-features=AutomationControlled'] },
    { name: 'headless:true + channel:chrome', headless: true as const, channel: 'chrome' as const, args: [] },
  ]

  for (const config of configs) {
    console.log(`\n=== Testing: ${config.name} ===`)
    const browser = await chromium.launch({
      headless: config.headless,
      ...(config.channel ? { channel: config.channel } : {}),
      args: config.args,
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

    await page.goto(
      `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent('咖啡推荐')}`,
      { waitUntil: 'domcontentloaded', timeout: 30000 }
    )
    await new Promise(r => setTimeout(r, 8000))

    const url = page.url()
    const hasCaptcha = url.includes('captcha')
    console.log(`  URL: ${url.substring(0, 120)}`)
    console.log(`  Captcha: ${hasCaptcha}`)

    if (!hasCaptcha) {
      const noteCount = await page.evaluate(() => {
        return document.querySelectorAll('.note-item, [class*="note-item"]').length
      })
      console.log(`  Note items in DOM: ${noteCount}`)
    }

    await browser.close()
  }
}

main().catch(console.error)
