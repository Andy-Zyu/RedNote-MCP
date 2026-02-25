/**
 * Debug: headed mode to visually inspect article editor
 * Also intercept ALL requests including save/publish APIs
 */
import { chromium } from 'playwright'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,  // HEADED mode for visual inspection
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
    const newBtn = cp.locator('button:has-text("新的创作")')
    if (await newBtn.count() > 0) {
      await newBtn.first().click()
      await new Promise(r => setTimeout(r, 5000))
    }

    // Intercept ALL API requests
    cp.on('request', req => {
      const url = req.url()
      if (url.includes('xiaohongshu') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('apm-fe')) {
        console.log(`>> ${req.method()} ${url}`)
        if (req.postData()) console.log(`   POST: ${req.postData()?.substring(0, 300)}`)
      }
    })
    cp.on('response', res => {
      const url = res.url()
      if (url.includes('xiaohongshu') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('apm-fe')) {
        console.log(`<< ${res.status()} ${url}`)
      }
    })

    console.log('\n=== Browser is open. Interact with the article editor manually. ===')
    console.log('=== All API requests will be logged here. ===')
    console.log('=== Press Ctrl+C to exit. ===\n')

    // Keep alive for 5 minutes
    await new Promise(r => setTimeout(r, 300000))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
