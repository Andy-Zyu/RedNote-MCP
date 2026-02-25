/**
 * Debug: find article publish button — handle modal properly
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
    await new Promise(r => setTimeout(r, 5000))

    // Screenshot to see what modal is blocking
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12-main-page.png'), fullPage: false })

    // Check for modals
    const modalInfo = await page.evaluate(() => {
      const masks = Array.from(document.querySelectorAll('.reds-mask, [aria-label*="遮罩"], [class*="mask"]'))
      return masks.map(m => ({
        tag: m.tagName, cls: m.className.toString().substring(0, 100),
        visible: (m as HTMLElement).offsetParent !== null,
        parent: m.parentElement?.className?.toString().substring(0, 100) || '',
        parentText: m.parentElement?.innerText?.substring(0, 200) || '',
      }))
    })
    console.log('Modals found:', modalInfo.length)
    modalInfo.forEach((m, i) => {
      console.log(`[${i}] ${m.tag} cls=${m.cls} visible=${m.visible}`)
      console.log(`    parent cls=${m.parent}`)
      console.log(`    parent text="${m.parentText}"`)
    })

    // Try clicking the mask to dismiss it, or press Escape
    await page.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))

    // Try clicking close button if any
    const closeBtn = page.locator('[class*="close"], [aria-label*="关闭"]').first()
    if (await closeBtn.count() > 0) {
      try { await closeBtn.click({ timeout: 3000 }) } catch {}
      await new Promise(r => setTimeout(r, 1000))
    }

    // Now try the SSO click
    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]').first()
    const [cp] = await Promise.all([
      context.waitForEvent('page', { timeout: 30000 }),
      publishLink.click({ force: true })
    ])
    await cp.waitForLoadState('domcontentloaded', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    console.log('Creator page URL:', cp.url())

    // Navigate to article editor
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 5000))
    console.log('Article page URL:', cp.url())

    // Click 新的创作 if needed
    const hasNewCreate = await cp.locator('button:has-text("新的创作")').count()
    if (hasNewCreate > 0) {
      await cp.locator('button:has-text("新的创作")').first().click()
      await new Promise(r => setTimeout(r, 5000))
    }

    // Fill content
    const titleArea = cp.locator('textarea[placeholder*="标题"]').first()
    if (await titleArea.count() > 0) {
      await titleArea.click()
      await titleArea.fill('调试长文发布')
      await new Promise(r => setTimeout(r, 1000))

      const editor = cp.locator('.tiptap.ProseMirror').first()
      await editor.click()
      await cp.keyboard.type('调试内容。', { delay: 20 })
      await new Promise(r => setTimeout(r, 2000))
    }

    // Dump all clickable elements
    const info = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))
      const clickables = all.filter(el => {
        const style = window.getComputedStyle(el)
        const isClickable = el.tagName === 'BUTTON' || el.tagName === 'A' ||
          el.getAttribute('role') === 'button' || style.cursor === 'pointer'
        const visible = (el as HTMLElement).offsetParent !== null
        const text = (el as HTMLElement).innerText?.trim()
        // Deduplicate by only taking leaf-level clickables
        const childClickable = el.querySelector('button, a, [role="button"]')
        return isClickable && visible && text && text.length > 0 && text.length < 30 && !childClickable
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
      }))

      const footer = document.querySelector('.footer')
      const footerHTML = footer ? footer.outerHTML.substring(0, 1500) : 'no footer'

      return { clickables, footerHTML }
    })

    console.log('\n=== Leaf clickable elements ===')
    info.clickables.forEach((c, i) => console.log(`[${i}] ${c.tag} "${c.text}" cls=${c.cls}`))

    console.log('\n=== Footer HTML ===')
    console.log(info.footerHTML)

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '13-article-filled.png'), fullPage: true })
    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
