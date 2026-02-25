/**
 * Debug: click the btn-wrapper 发布笔记 and see what happens
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

  if (fs.existsSync(COOKIE_PATH)) {
    const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  try {
    // SSO
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))
    const [creatorPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      page.locator('a[href*="creator.xiaohongshu.com/publish"]').first().click()
    ])
    await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    // Go to article editor
    await creatorPage.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    // Click 新的创作
    await creatorPage.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Fill title and content
    await creatorPage.locator('textarea[placeholder*="标题"]').first().fill('调试发布按钮行为')
    await new Promise(r => setTimeout(r, 1000))
    const editor = creatorPage.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await creatorPage.keyboard.type('调试内容。', { delay: 20 })
    await new Promise(r => setTimeout(r, 2000))

    console.log('Before click URL:', creatorPage.url())

    // Monitor navigation
    creatorPage.on('framenavigated', frame => {
      if (frame === creatorPage.mainFrame()) {
        console.log('Navigation detected:', frame.url())
      }
    })

    // Click the btn-wrapper (发布笔记)
    const btnWrapper = creatorPage.locator('div.btn-wrapper').first()
    console.log('btn-wrapper count:', await btnWrapper.count())
    console.log('btn-wrapper visible:', await btnWrapper.isVisible())

    // Get the full HTML of btn-wrapper and its parent
    const wrapperInfo = await btnWrapper.evaluate(el => {
      const parent = el.parentElement
      return {
        html: el.outerHTML.substring(0, 500),
        parentHtml: parent?.outerHTML?.substring(0, 800) || '',
        parentTag: parent?.tagName,
        parentCls: parent?.className?.toString(),
        isLink: !!el.closest('a'),
        href: el.closest('a')?.href || 'none',
      }
    })
    console.log('Wrapper info:', JSON.stringify(wrapperInfo, null, 2))

    // Click it
    await btnWrapper.click()
    await new Promise(r => setTimeout(r, 5000))

    console.log('After click URL:', creatorPage.url())
    await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '15-after-btn-wrapper-click.png'), fullPage: true })

    // Check what's on the page now
    const afterInfo = await creatorPage.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
        return b.offsetParent !== null && b.innerText?.trim().length > 0 && b.innerText.trim().length < 30
      }).map(b => ({ text: b.innerText.trim(), cls: b.className.toString().substring(0, 100) }))

      const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable=true]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        id: el.id,
      }))

      // Check for modals/drawers
      const modals = Array.from(document.querySelectorAll('[class*="modal"], [class*="drawer"], [class*="dialog"], [class*="panel"]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        cls: el.className.toString().substring(0, 150),
        text: (el as HTMLElement).innerText?.substring(0, 300) || '',
      }))

      return { buttons, inputs, modals, bodyText: document.body.innerText.substring(0, 2000) }
    })

    console.log('\n=== Buttons after click ===')
    afterInfo.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" cls=${b.cls}`))
    console.log('\n=== Inputs after click ===')
    afterInfo.inputs.forEach((inp, i) => console.log(`[${i}] ${inp.tag} type=${inp.type} id="${inp.id}" placeholder="${inp.placeholder}"`))
    console.log('\n=== Modals/drawers after click ===')
    afterInfo.modals.forEach((m, i) => console.log(`[${i}] cls=${m.cls}\n    text="${m.text.substring(0, 200)}"`))
    console.log('\n=== Body text ===')
    console.log(afterInfo.bodyText)

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
