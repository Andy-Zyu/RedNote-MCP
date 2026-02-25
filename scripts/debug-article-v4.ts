/**
 * Debug: use the same SSO flow as the actual tool, then explore article publish
 * This script mimics withCreatorPage behavior exactly
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

  // Load cookies if available
  if (fs.existsSync(COOKIE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    await context.addCookies(cookies)
    console.log(`Loaded ${cookies.length} cookies`)
  }

  const page = await context.newPage()

  try {
    // Step 1: Go to main site (same as navigateToCreator)
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    console.log('Main site loaded')
    await new Promise(r => setTimeout(r, 3000))

    // Step 2: Click publish link to trigger SSO
    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    console.log('Publish link count:', await publishLink.count())

    const [creatorPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      publishLink.first().click()
    ])
    await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
    console.log('Creator page URL:', creatorPage.url())
    await new Promise(r => setTimeout(r, 3000))

    // Step 3: Navigate to article editor
    const articleUrl = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article'
    await creatorPage.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))
    console.log('Article editor URL:', creatorPage.url())

    // Step 4: Click 新的创作
    const newCreateBtn = creatorPage.locator('button:has-text("新的创作")').first()
    if (await newCreateBtn.count() > 0) {
      await newCreateBtn.click()
      console.log('Clicked 新的创作')
      await new Promise(r => setTimeout(r, 5000))
    }

    // Step 5: Fill title and content
    const titleArea = creatorPage.locator('textarea[placeholder*="标题"]').first()
    await titleArea.click()
    await titleArea.fill('调试长文发布按钮')
    await new Promise(r => setTimeout(r, 1000))

    const editor = creatorPage.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await creatorPage.keyboard.type('这是调试内容，用于找到发布按钮的位置和行为。', { delay: 20 })
    await new Promise(r => setTimeout(r, 2000))

    await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '14-before-publish.png'), fullPage: true })

    // Step 6: Click "发布笔记" in sidebar
    console.log('\n--- Clicking 发布笔记 ---')
    const publishBtn = creatorPage.locator('span.btn-text:has-text("发布笔记")').first()
    const publishBtnCount = await publishBtn.count()
    console.log('发布笔记 span count:', publishBtnCount)

    if (publishBtnCount > 0) {
      // Get the parent element info
      const btnInfo = await publishBtn.evaluate(el => {
        const parent = el.closest('a, div[class*="btn"], [class*="menu"]')
        return {
          text: el.textContent,
          parentTag: parent?.tagName,
          parentCls: parent?.className?.toString().substring(0, 100),
          parentHref: parent?.getAttribute('href'),
          html: parent?.outerHTML?.substring(0, 500) || el.outerHTML.substring(0, 500),
        }
      })
      console.log('Button info:', JSON.stringify(btnInfo, null, 2))
    }

    // Instead of clicking the sidebar nav, look for other publish mechanisms
    // Check if there's a keyboard shortcut or hidden button
    const allInfo = await creatorPage.evaluate(() => {
      // Get the entire right side / top bar
      const all = Array.from(document.querySelectorAll('*'))

      // Find ALL buttons (real <button> elements)
      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText?.trim(),
        cls: b.className.toString().substring(0, 100),
        visible: b.offsetParent !== null,
        disabled: b.disabled,
      })).filter(b => b.text && b.text.length < 30)

      // Find elements with "发布" that are NOT in the sidebar nav
      const sidebarNav = document.querySelector('.publish-video, [class*="sidebar"], [class*="menu"]')
      const publishEls = all.filter(el => {
        const text = (el as HTMLElement).innerText || ''
        const inSidebar = sidebarNav?.contains(el)
        return text.includes('发布') && text.length < 20 && !inSidebar && (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
      }))

      // Check the toolbar area
      const toolbarEls = Array.from(document.querySelectorAll('[class*="toolbar"], [class*="header"], [class*="action"]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        cls: el.className.toString().substring(0, 120),
        text: (el as HTMLElement).innerText?.substring(0, 100) || '',
      }))

      return { buttons, publishEls, toolbarEls }
    })

    console.log('\n=== All <button> elements ===')
    allInfo.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" visible=${b.visible} disabled=${b.disabled} cls=${b.cls}`))

    console.log('\n=== Publish elements (not in sidebar) ===')
    allInfo.publishEls.forEach((p, i) => console.log(`[${i}] ${p.tag} "${p.text}" cls=${p.cls}`))

    console.log('\n=== Toolbar/header/action elements ===')
    allInfo.toolbarEls.forEach((t, i) => console.log(`[${i}] cls=${t.cls} text="${t.text}"`))

    // Also try: what if we need to click "暂存离开" first, then publish from drafts?
    // Or what if the article needs to be saved first, then published from the 写长文 list?

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
