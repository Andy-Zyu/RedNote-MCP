import { chromium } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as readline from 'readline'

function waitForEnter(msg: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(msg, () => { rl.close(); resolve() })
  })
}

async function main() {
  const cookiePath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
  const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
  const cm = new CookieManager(cookiePath)

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true })
  }

  console.log('=== Opening visible browser with persistent profile ===\n')

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const cookies = await cm.loadCookies()
  if (cookies.length > 0) {
    console.log(`Loading ${cookies.length} cookies`)
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  console.log('Navigating to search page...')
  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent('咖啡推荐')}`,
    { waitUntil: 'domcontentloaded', timeout: 60000 }
  )

  console.log(`Current URL: ${page.url()}\n`)

  await waitForEnter('>>> Please complete the captcha in the browser, then press ENTER here to continue...\n')

  console.log(`URL after verify: ${page.url()}`)

  // Wait for results
  await new Promise(r => setTimeout(r, 5000))

  const noteCount = await page.evaluate(() => {
    return document.querySelectorAll('.note-item, [class*="note-item"]').length
  })
  console.log(`Note items in DOM: ${noteCount}`)

  await page.screenshot({ path: '/tmp/search-after-verify.png' })
  console.log('Screenshot: /tmp/search-after-verify.png')

  // Save cookies & profile
  const newCookies = await context.cookies()
  await cm.saveCookies(newCookies)
  console.log(`Saved ${newCookies.length} cookies`)

  await context.close()
  console.log('\nDone! Profile saved. Now test headless mode.')
}

main().catch(console.error)
