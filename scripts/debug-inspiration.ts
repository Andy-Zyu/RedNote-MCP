/**
 * Debug script: explore creator center inspiration/activity/trending topics pages
 * Uses SSO flow: main site -> click publish -> creator center
 */
import { chromium, Page } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const SCREENSHOT_DIR = '/tmp/rednote-inspiration'

const API_KEYWORDS = [
  'topic', 'activity', 'inspiration', 'hot', 'trending',
  'recommend', 'challenge', 'campaign', 'official', 'task',
]

async function main() {
  const cookiePath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
  const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
  const cm = new CookieManager(cookiePath)

  if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true })
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  console.log('=== Debug: Creator Center Inspiration/Activity Pages ===')

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
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

  // API monitoring
  const capturedApis: Array<{ method: string; status: number; url: string; body?: any }> = []
  page.on('response', async (response) => {
    const url = response.url()
    const matchedKeyword = API_KEYWORDS.find(kw => url.toLowerCase().includes(kw))
    if (matchedKeyword) {
      const entry: any = { method: response.request().method(), status: response.status(), url: url.substring(0, 200) }
      try {
        const ct = response.headers()['content-type'] || ''
        if (ct.includes('json')) entry.body = await response.json()
      } catch {}
      capturedApis.push(entry)
      console.log(`[API:${matchedKeyword}] ${entry.method} ${entry.status} ${entry.url}`)
      if (entry.body?.data) {
        const dataKeys = typeof entry.body.data === 'object' ? Object.keys(entry.body.data) : typeof entry.body.data
        console.log(`  data keys: ${JSON.stringify(dataKeys)}`)
      }
    }
  })

  // ---- Step 1: SSO to creator center ----
  console.log('\n--- Step 1: SSO to creator center ---')
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))
  console.log(`Main site URL: ${page.url()}`)

  const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
  const linkCount = await publishLink.count()
  console.log(`Publish links found: ${linkCount}`)

  if (linkCount === 0) {
    console.error('ERROR: No publish link found. Not logged in?')
    await context.close()
    return
  }

  // Click publish link to trigger SSO, capture new tab
  const [creatorPage] = await Promise.all([
    context.waitForEvent('page', { timeout: 60000 }),
    publishLink.first().click()
  ])
  await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
  console.log(`Creator page URL: ${creatorPage.url()}`)

  if (creatorPage.url().includes('login')) {
    console.error('ERROR: Redirected to login. Cookie expired?')
    await context.close()
    return
  }

  // Also monitor API on creator page
  creatorPage.on('response', async (response) => {
    const url = response.url()
    const matchedKeyword = API_KEYWORDS.find(kw => url.toLowerCase().includes(kw))
    if (matchedKeyword) {
      const entry: any = { method: response.request().method(), status: response.status(), url: url.substring(0, 200) }
      try {
        const ct = response.headers()['content-type'] || ''
        if (ct.includes('json')) entry.body = await response.json()
      } catch {}
      capturedApis.push(entry)
      console.log(`[API:${matchedKeyword}] ${entry.method} ${entry.status} ${entry.url}`)
      if (entry.body?.data) {
        const dataKeys = typeof entry.body.data === 'object' ? Object.keys(entry.body.data) : typeof entry.body.data
        console.log(`  data keys: ${JSON.stringify(dataKeys)}`)
      }
    }
  })

  // ---- Step 2: Navigate to creator home and analyze ----
  console.log('\n--- Step 2: Creator center home page ---')
  await creatorPage.goto('https://creator.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 5000))
  await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01-creator-home.png'), fullPage: true })

  const pageStructure = await creatorPage.evaluate(() => {
    const results: Record<string, any> = {}

    const allLinks = Array.from(document.querySelectorAll('a[href]'))
    results.links = allLinks.map(a => ({
      text: a.textContent?.trim().substring(0, 50),
      href: a.getAttribute('href'),
    })).filter(l => l.text && l.text.length > 0)

    const bodyText = document.body.innerText
    const keywords = ['灵感', '活动', '热门话题', '官方话题', '话题', '挑战', '任务', '热点', '趋势', '推荐话题', '创作灵感', '官方活动', '笔记灵感', '创作活动']
    results.keywordMatches = keywords.filter(kw => bodyText.includes(kw))

    results.keywordElements = []
    for (const kw of keywords) {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent?.trim() || ''
        return text === kw || (text.includes(kw) && text.length < 30)
      })
      if (elements.length > 0) {
        results.keywordElements.push({
          keyword: kw,
          count: elements.length,
          elements: elements.slice(0, 3).map(el => ({
            tag: el.tagName, text: el.textContent?.trim().substring(0, 50),
            className: el.className?.toString().substring(0, 80),
            href: el.getAttribute('href'),
          })),
        })
      }
    }

    // Sidebar/nav
    const navItems = Array.from(document.querySelectorAll('nav a, .menu a, .sidebar a, [class*="nav"] a, [class*="menu"] a, [class*="sidebar"] a, [class*="side"] a'))
    results.navItems = navItems.map(a => ({
      text: a.textContent?.trim().substring(0, 50),
      href: a.getAttribute('href'),
      className: a.className?.substring(0, 80),
    })).filter(n => n.text && n.text.length > 0)

    return results
  })

  console.log('\n=== PAGE LINKS ===')
  console.log(JSON.stringify(pageStructure.links, null, 2))
  console.log('\n=== NAV ITEMS ===')
  console.log(JSON.stringify(pageStructure.navItems, null, 2))
  console.log('\n=== KEYWORD MATCHES ===')
  console.log(JSON.stringify(pageStructure.keywordMatches, null, 2))
  console.log('\n=== KEYWORD ELEMENTS ===')
  console.log(JSON.stringify(pageStructure.keywordElements, null, 2))

  // ---- Step 3: Try sub-pages ----
  console.log('\n--- Step 3: Trying creator center sub-pages ---')

  const subPages = [
    '/inspiration', '/activity', '/topic', '/hot-topic',
    '/trending', '/challenge', '/task',
    '/publish/topic', '/content/topic', '/creator/inspiration',
  ]

  for (const sp of subPages) {
    try {
      const url = `https://creator.xiaohongshu.com${sp}`
      await creatorPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await new Promise(r => setTimeout(r, 3000))
      const finalUrl = creatorPage.url()
      const isLogin = finalUrl.includes('login')
      const bodyText = await creatorPage.evaluate(() => document.body.innerText.substring(0, 500))

      console.log(`\n  ${sp}:`)
      console.log(`    URL: ${finalUrl.substring(0, 120)}`)
      console.log(`    Login redirect: ${isLogin}`)
      if (!isLogin) {
        console.log(`    Body preview: ${bodyText.substring(0, 200).replace(/\n/g, ' ')}`)
        await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, `03${sp.replace(/\//g, '-')}.png`), fullPage: true })
      }
    } catch (err: any) {
      console.log(`  ${sp}: ERROR - ${err.message?.substring(0, 100)}`)
    }
  }

  // ---- Summary ----
  console.log('\n\n========== SUMMARY ==========')
  console.log(`Total API calls captured: ${capturedApis.length}`)
  capturedApis.forEach(api => console.log(`  ${api.method} ${api.status} ${api.url}`))

  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'api-capture.json'), JSON.stringify(capturedApis, null, 2))
  console.log(`\nScreenshots: ${SCREENSHOT_DIR}`)

  await context.close()
  console.log('Done.')
}

main().catch(console.error)
