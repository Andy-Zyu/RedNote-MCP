/**
 * Debug: navigate directly to article editor URL, dismiss any modals
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
    // SSO — go to main site first
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    // Dismiss any modal overlay
    await page.evaluate(() => {
      document.querySelectorAll('.reds-mask, [class*="mask"], [class*="modal"]').forEach(el => {
        (el as HTMLElement).style.display = 'none'
      })
    })
    await new Promise(r => setTimeout(r, 500))

    // Try force-clicking the publish link
    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]').first()
    const [cp] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      publishLink.dispatchEvent('click')
    ])
    await cp.waitForLoadState('domcontentloaded', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    // Now navigate to article editor
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 5000))

    console.log('URL:', cp.url())

    // Check state
    const hasNewCreate = await cp.locator('button:has-text("新的创作")').count()
    console.log('Has 新的创作:', hasNewCreate)

    if (hasNewCreate > 0) {
      await cp.locator('button:has-text("新的创作")').first().click()
      await new Promise(r => setTimeout(r, 5000))
    }

    console.log('URL after 新的创作:', cp.url())

    // Fill content
    const titleArea = cp.locator('textarea[placeholder*="标题"]').first()
    if (await titleArea.count() > 0) {
      await titleArea.click()
      await titleArea.fill('调试长文发布')
      await new Promise(r => setTimeout(r, 1000))

      const editor = cp.locator('.tiptap.ProseMirror').first()
      await editor.click()
      await cp.keyboard.type('调试内容，用于找到发布按钮。', { delay: 20 })
      await new Promise(r => setTimeout(r, 2000))
    }

    // Dump ALL clickable elements and page structure
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

      const footer = document.querySelector('.footer')
      const footerHTML = footer ? footer.outerHTML.substring(0, 1500) : 'no footer'

      // Look for anything with "发布" or "下一步"
      const publishEls = all.filter(el => {
        const text = (el as HTMLElement).innerText || ''
        return (text.includes('发布') || text.includes('下一步') || text.includes('完成') || text.includes('提交'))
          && text.length < 20 && (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
        parent: el.parentElement?.tagName + '.' + (el.parentElement?.className?.toString().substring(0, 60) || ''),
      }))

      return { clickables, footerHTML, publishEls, bodyText: document.body.innerText.substring(0, 2000) }
    })

    console.log('\n=== All clickable elements ===')
    info.clickables.forEach((c, i) => console.log(`[${i}] ${c.tag} "${c.text}" cls=${c.cls}`))

    console.log('\n=== Footer HTML ===')
    console.log(info.footerHTML)

    console.log('\n=== Publish-related elements ===')
    info.publishEls.forEach((p, i) => console.log(`[${i}] ${p.tag} "${p.text}" cls=${p.cls} parent=${p.parent}`))

    console.log('\n=== Body text ===')
    console.log(info.bodyText)

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '11-article-direct2.png'), fullPage: true })
    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
