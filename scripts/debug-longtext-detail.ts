/**
 * Debug: explore 写长文 -> 新的创作 editor, and 笔记灵感 detailed data
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

    // ========== Part 1: 写长文 ==========
    console.log('========== 写长文 ==========')

    // Switch to 上传图文 first, then 写长文
    await cp.locator('span.title:has-text("上传图文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))

    await cp.locator('span.title:has-text("写长文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))

    // Click 新的创作
    const newCreateBtn = cp.locator('button:has-text("新的创作")').first()
    if (await newCreateBtn.count() > 0) {
      console.log('--- Clicking 新的创作 ---')
      // This might open a new page
      const pagePromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null)
      await newCreateBtn.click()
      const newPage = await pagePromise
      await new Promise(r => setTimeout(r, 5000))

      const targetPage = newPage || cp
      if (newPage) {
        console.log('New page opened: ' + newPage.url())
        await newPage.waitForLoadState('domcontentloaded', { timeout: 30000 })
        await new Promise(r => setTimeout(r, 3000))
      }

      await targetPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03-longtext-editor.png'), fullPage: true })
      console.log('Screenshot: 03-longtext-editor.png')

      // Explore the editor
      const editorInfo = await targetPage.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable=true], [data-placeholder]')).map(el => ({
          tag: el.tagName, cls: el.className.toString().substring(0, 120),
          type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder'),
          dataPlaceholder: el.getAttribute('data-placeholder'),
          contentEditable: el.getAttribute('contenteditable'),
          visible: (el as HTMLElement).offsetParent !== null,
          text: (el as HTMLElement).innerText?.substring(0, 80) || '',
          html: el.outerHTML.substring(0, 400)
        }))
        const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
          const t = b.innerText?.trim()
          return t && t.length > 0 && t.length < 30
        }).map(b => ({
          text: b.innerText.trim(), disabled: b.disabled,
          visible: (b as HTMLElement).offsetParent !== null
        }))
        const url = window.location.href
        return { inputs, buttons, url }
      })
      console.log('URL:', editorInfo.url)
      console.log('\nForm elements:')
      editorInfo.inputs.forEach((el, i) => {
        console.log(`[${i}] ${el.tag} visible=${el.visible} placeholder="${el.placeholder}" data-placeholder="${el.dataPlaceholder}"`)
        console.log(`    cls: ${el.cls}`)
        console.log(`    text: "${el.text}"`)
        console.log()
      })
      console.log('Buttons:')
      editorInfo.buttons.forEach((b, i) => console.log(`  [${i}] "${b.text}" disabled=${b.disabled} visible=${b.visible}`))

      if (newPage && !newPage.isClosed()) await newPage.close()
    }

    // ========== Part 2: 笔记灵感 detailed data ==========
    console.log('\n\n========== 笔记灵感 详细数据 ==========')
    await cp.goto('https://creator.xiaohongshu.com/new/inspiration?source=official', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 5000))

    // Get all topic cards with their data
    const topicData = await cp.evaluate(() => {
      const bodyText = document.body.innerText
      // Parse the structured data from the page
      // Look for topic containers
      const containers = document.querySelectorAll('[class*="topic-card"], [class*="card-item"], [class*="topic-item"]')
      const containerData = Array.from(containers).map(c => ({
        cls: c.className.toString().substring(0, 100),
        text: (c.textContent || '').trim().substring(0, 200)
      }))

      // Get category tabs
      const tabs = Array.from(document.querySelectorAll('.d-tabs-header')).map(t => ({
        text: (t.textContent || '').trim(),
        active: t.className.includes('active')
      }))

      // Try to find the main content area and parse topics
      const mainContent = document.querySelector('.classic-topics-container, [class*="topics-container"]')
      const mainText = mainContent ? (mainContent as HTMLElement).innerText : ''

      return { containers: containerData, tabs, mainText: mainText.substring(0, 3000), bodyText: bodyText.substring(0, 5000) }
    })

    console.log('Category tabs:', JSON.stringify(topicData.tabs, null, 2))
    console.log('\nTopic containers found:', topicData.containers.length)
    topicData.containers.forEach((c, i) => console.log(`  [${i}] cls=${c.cls} text="${c.text.substring(0, 80)}"`))
    console.log('\nMain content text:\n', topicData.mainText)

    // Try intercepting API calls for inspiration data
    console.log('\n--- Checking network for API calls ---')
    // Navigate with network interception
    const apiCalls: string[] = []
    cp.on('response', async (response) => {
      const url = response.url()
      if (url.includes('api') || url.includes('inspiration') || url.includes('topic')) {
        apiCalls.push(`${response.status()} ${url.substring(0, 150)}`)
      }
    })

    // Click a different category to trigger API call
    const fashionTab = cp.locator('.d-tabs-header:has-text("时尚")').first()
    if (await fashionTab.count() > 0) {
      await fashionTab.click()
      await new Promise(r => setTimeout(r, 3000))
      console.log('\nAPI calls after clicking 时尚:')
      apiCalls.forEach(c => console.log(`  ${c}`))
    }

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '04-inspiration-fashion.png'), fullPage: true })
    console.log('\nScreenshot: 04-inspiration-fashion.png')

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
