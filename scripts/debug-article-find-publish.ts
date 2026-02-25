/**
 * Debug: find the actual publish mechanism for article editor
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

    // Switch to 写长文
    await cp.locator('span.title:has-text("上传图文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))
    await cp.locator('span.title:has-text("写长文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))
    await cp.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Fill title and content
    const titleArea = cp.locator('textarea[placeholder*="标题"]').first()
    await titleArea.click()
    await titleArea.fill('调试长文发布流程')
    await new Promise(r => setTimeout(r, 1000))

    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await cp.keyboard.type('这是调试内容。', { delay: 20 })
    await new Promise(r => setTimeout(r, 2000))

    // Dump ALL elements in the page — look for anything publish-related
    const allElements = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))

      // Find all clickable elements with text
      const clickables = all.filter(el => {
        const tag = el.tagName
        const role = el.getAttribute('role')
        const cursor = window.getComputedStyle(el).cursor
        const isClickable = tag === 'BUTTON' || tag === 'A' || role === 'button' || cursor === 'pointer'
        const text = (el as HTMLElement).innerText?.trim()
        const visible = (el as HTMLElement).offsetParent !== null
        return isClickable && text && text.length > 0 && text.length < 30 && visible
      }).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
        id: el.id,
        href: el.getAttribute('href') || '',
        cursor: window.getComputedStyle(el).cursor,
      }))

      // Find the footer area specifically
      const footer = document.querySelector('.footer')
      const footerHTML = footer ? footer.outerHTML.substring(0, 1000) : 'no .footer found'

      // Find the header/toolbar area
      const toolbar = document.querySelector('.toolbar, .editor-toolbar, [class*="toolbar"]')
      const toolbarHTML = toolbar ? toolbar.outerHTML.substring(0, 1000) : 'no toolbar found'

      // Check for any element with "发" character
      const publishElements = all.filter(el => {
        const text = (el as HTMLElement).innerText || ''
        return text.includes('发布') && text.length < 20 && (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
        parent: el.parentElement?.className?.toString().substring(0, 80) || '',
      }))

      // Check for "下一步" or "预览"
      const nextElements = all.filter(el => {
        const text = (el as HTMLElement).innerText || ''
        return (text.includes('下一步') || text.includes('预览') || text.includes('完成')) && text.length < 20 && (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
      }))

      return { clickables, footerHTML, toolbarHTML, publishElements, nextElements }
    })

    console.log('=== All clickable elements ===')
    allElements.clickables.forEach((c, i) => {
      console.log(`[${i}] ${c.tag} "${c.text}" cls=${c.cls} href=${c.href}`)
    })

    console.log('\n=== Footer HTML ===')
    console.log(allElements.footerHTML)

    console.log('\n=== Toolbar HTML ===')
    console.log(allElements.toolbarHTML)

    console.log('\n=== Elements with 发布 ===')
    allElements.publishElements.forEach((p, i) => console.log(`[${i}] ${p.tag} "${p.text}" cls=${p.cls} parent=${p.parent}`))

    console.log('\n=== Elements with 下一步/预览/完成 ===')
    allElements.nextElements.forEach((n, i) => console.log(`[${i}] ${n.tag} "${n.text}" cls=${n.cls}`))

    // Also check the full HTML of the content area
    const contentAreaHTML = await cp.evaluate(() => {
      const content = document.querySelector('.content, [class*="article-editor"], [class*="publish-content"]')
      return content ? content.outerHTML.substring(0, 2000) : 'no content area found'
    })
    console.log('\n=== Content area HTML ===')
    console.log(contentAreaHTML)

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '09-article-full-debug.png'), fullPage: true })
    console.log('\nScreenshot saved')

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
