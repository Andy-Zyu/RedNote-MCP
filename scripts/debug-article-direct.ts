/**
 * Debug: navigate directly to article editor URL and explore
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

    // Navigate directly to article editor URL
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 5000))

    console.log('URL:', cp.url())

    // Check if we're on the article editor or need to click 新的创作
    const hasTitle = await cp.locator('textarea[placeholder*="标题"]').count()
    const hasNewCreate = await cp.locator('button:has-text("新的创作")').count()
    console.log('Has title textarea:', hasTitle)
    console.log('Has 新的创作 button:', hasNewCreate)

    if (hasNewCreate > 0) {
      await cp.locator('button:has-text("新的创作")').first().click()
      await new Promise(r => setTimeout(r, 5000))
    }

    // Fill content
    const titleArea = cp.locator('textarea[placeholder*="标题"]').first()
    await titleArea.click()
    await titleArea.fill('调试长文发布')
    await new Promise(r => setTimeout(r, 1000))

    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await cp.keyboard.type('调试内容。', { delay: 20 })
    await new Promise(r => setTimeout(r, 2000))

    // Dump ALL clickable elements
    const info = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))
      const clickables = all.filter(el => {
        const style = window.getComputedStyle(el)
        const isClickable = el.tagName === 'BUTTON' || el.tagName === 'A' ||
          el.getAttribute('role') === 'button' || style.cursor === 'pointer'
        const visible = (el as HTMLElement).offsetParent !== null
        const text = (el as HTMLElement).innerText?.trim()
        return isClickable && visible && text && text.length > 0 && text.length < 30
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
      }))

      // Get the footer area
      const footer = document.querySelector('.footer')
      const footerText = footer ? (footer as HTMLElement).innerText : 'no footer'
      const footerHTML = footer ? footer.outerHTML.substring(0, 1500) : 'no footer'

      // Get all divs with cursor:pointer
      const pointerDivs = all.filter(el => {
        const style = window.getComputedStyle(el)
        return style.cursor === 'pointer' && (el as HTMLElement).offsetParent !== null && el.tagName === 'DIV'
      }).map(el => ({
        text: (el as HTMLElement).innerText?.trim().substring(0, 50) || '',
        cls: el.className.toString().substring(0, 120),
        html: el.outerHTML.substring(0, 300),
      }))

      return { clickables, footerText, footerHTML, pointerDivs }
    })

    console.log('\n=== All clickable elements ===')
    info.clickables.forEach((c, i) => console.log(`[${i}] ${c.tag} "${c.text}" cls=${c.cls}`))

    console.log('\n=== Footer ===')
    console.log('Text:', info.footerText)
    console.log('HTML:', info.footerHTML)

    console.log('\n=== Pointer divs ===')
    info.pointerDivs.forEach((d, i) => console.log(`[${i}] "${d.text}" cls=${d.cls}`))

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '10-article-direct.png'), fullPage: true })
    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
