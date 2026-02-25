/**
 * Debug: explore 写长文 tab and 笔记灵感 page structure
 */
import { chromium } from 'playwright'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const SCREENSHOT_DIR = '/tmp/debug-longtext'

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  await context.addInitScript('Object.defineProperty(navigator, "webdriver", { get: () => undefined })')
  const page = await context.newPage()

  try {
    // SSO
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))
    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    const [cp] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      publishLink.first().click()
    ])
    await cp.waitForLoadState('domcontentloaded', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    // Switch to 上传图文
    await cp.locator('span.title:has-text("上传图文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))

    // Look for 写长文 tab/button
    console.log('=== Looking for 写长文 ===')
    const longTextElements = await cp.evaluate(() => {
      return Array.from(document.querySelectorAll('*')).filter(el => {
        const t = el.textContent || ''
        return t.includes('写长文') && t.length < 50
      }).map(el => ({
        tag: el.tagName,
        cls: el.className.toString().substring(0, 120),
        text: (el.textContent || '').trim().substring(0, 50),
        visible: (el as HTMLElement).offsetParent !== null,
        html: el.outerHTML.substring(0, 400)
      }))
    })
    longTextElements.forEach((el, i) => {
      console.log(`[${i}] ${el.tag} visible=${el.visible} text="${el.text}"`)
      console.log(`    cls: ${el.cls}`)
      console.log(`    html: ${el.html.substring(0, 300)}`)
      console.log()
    })

    // Try clicking 写长文
    const longTextBtn = cp.locator('span.title:has-text("写长文")').first()
    if (await longTextBtn.count() > 0) {
      console.log('--- Clicking 写长文 via span.title ---')
      await longTextBtn.dispatchEvent('click')
    } else {
      // Try other selectors
      const alt = cp.locator('div:has-text("写长文"):not(:has(div)), button:has-text("写长文"), a:has-text("写长文")').first()
      if (await alt.count() > 0) {
        console.log('--- Clicking 写长文 via alt selector ---')
        await alt.click()
      } else {
        console.log('写长文 element not found via any selector')
        // Dump all tabs
        const allTabs = await cp.evaluate(() => {
          return Array.from(document.querySelectorAll('.creator-tab, .header-tabs span, [class*="tab"]')).map(el => ({
            tag: el.tagName,
            cls: el.className.toString().substring(0, 100),
            text: (el.textContent || '').trim().substring(0, 50),
            visible: (el as HTMLElement).offsetParent !== null
          }))
        })
        console.log('\n=== All tab-like elements ===')
        allTabs.forEach((t, i) => console.log(`[${i}] ${t.tag} visible=${t.visible} text="${t.text}" cls=${t.cls}`))
      }
    }
    await new Promise(r => setTimeout(r, 3000))
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '01-longtext.png'), fullPage: true })
    console.log('\nScreenshot: 01-longtext.png')

    // Check what appeared
    const afterClick = await cp.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea')).map(el => ({
        tag: el.tagName, type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder'),
        visible: (el as HTMLElement).offsetParent !== null
      }))
      const editables = Array.from(document.querySelectorAll('[contenteditable=true]')).map(el => ({
        tag: el.tagName, cls: el.className.toString().substring(0, 100),
        text: (el as HTMLElement).innerText?.substring(0, 80),
        placeholder: el.getAttribute('data-placeholder')
      }))
      const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
        const t = b.innerText?.trim()
        return t && t.length > 0 && t.length < 30
      }).map(b => ({
        text: b.innerText.trim(), disabled: b.disabled,
        visible: (b as HTMLElement).offsetParent !== null
      }))
      return { inputs, editables, buttons }
    })
    console.log('\n=== After clicking 写长文 ===')
    console.log('Inputs:', JSON.stringify(afterClick.inputs, null, 2))
    console.log('Editables:', JSON.stringify(afterClick.editables, null, 2))
    console.log('Buttons:', JSON.stringify(afterClick.buttons, null, 2))

    // Now explore 笔记灵感 page
    console.log('\n\n========== 笔记灵感 ==========')
    await cp.goto('https://creator.xiaohongshu.com/new/inspiration?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '02-inspiration.png'), fullPage: true })

    // Get the structure
    const inspirationData = await cp.evaluate(() => {
      // Get categories
      const categories = Array.from(document.querySelectorAll('.category-item, [class*="category"], [class*="tab"]')).map(el => ({
        tag: el.tagName, cls: el.className.toString().substring(0, 100),
        text: (el.textContent || '').trim().substring(0, 50),
        visible: (el as HTMLElement).offsetParent !== null
      }))
      // Get topic cards
      const topics = Array.from(document.querySelectorAll('[class*="topic"], [class*="card"]')).map(el => ({
        tag: el.tagName, cls: el.className.toString().substring(0, 100),
        text: (el.textContent || '').trim().substring(0, 100),
        visible: (el as HTMLElement).offsetParent !== null
      }))
      // Get all links
      const links = Array.from(document.querySelectorAll('a[href]')).map(a => ({
        text: (a.textContent || '').trim().substring(0, 50),
        href: a.getAttribute('href')?.substring(0, 100)
      })).filter(l => l.text.length > 0)
      return { categories, topics, links }
    })
    console.log('Categories:', JSON.stringify(inspirationData.categories.slice(0, 20), null, 2))
    console.log('\nTopics:', JSON.stringify(inspirationData.topics.slice(0, 20), null, 2))
    console.log('\nLinks:', JSON.stringify(inspirationData.links.slice(0, 30), null, 2))

    console.log('\nScreenshot: 02-inspiration.png')
    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
