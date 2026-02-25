/**
 * Debug: explore article editor after filling content
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

    // Switch to 上传图文 then 写长文
    await cp.locator('span.title:has-text("上传图文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))
    await cp.locator('span.title:has-text("写长文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))

    // Click 新的创作
    await cp.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Check URL — might have navigated
    console.log('URL after 新的创作:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '05-article-editor.png'), fullPage: true })

    // Fill title
    const titleArea = cp.locator('textarea[placeholder*="标题"], textarea[placeholder*="输入"]').first()
    await titleArea.click()
    await titleArea.fill('测试长文标题')
    await new Promise(r => setTimeout(r, 1000))

    // Fill content
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await new Promise(r => setTimeout(r, 500))
    await cp.keyboard.type('这是长文测试内容，用于探索发布按钮。', { delay: 30 })
    await new Promise(r => setTimeout(r, 3000))

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '06-article-filled.png'), fullPage: true })
    console.log('Screenshot: 06-article-filled.png')

    // Dump all buttons and clickable elements
    const pageInfo = await cp.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], a')).filter(el => {
        const t = (el as HTMLElement).innerText?.trim()
        return t && t.length > 0 && t.length < 40
      }).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 100),
        visible: (el as HTMLElement).offsetParent !== null,
        disabled: (el as HTMLButtonElement).disabled || false,
        html: el.outerHTML.substring(0, 300)
      }))
      // Also check for any "发布" or "提交" or "保存" text
      const publishRelated = Array.from(document.querySelectorAll('*')).filter(el => {
        const t = (el as HTMLElement).innerText || ''
        return (t.includes('发布') || t.includes('提交') || t.includes('保存') || t.includes('下一步')) && t.length < 30
      }).map(el => ({
        tag: el.tagName,
        text: (el as HTMLElement).innerText.trim().substring(0, 30),
        cls: el.className.toString().substring(0, 100),
        visible: (el as HTMLElement).offsetParent !== null
      }))
      return { buttons, publishRelated }
    })

    console.log('\n=== All buttons ===')
    pageInfo.buttons.forEach((b, i) => {
      console.log(`[${i}] ${b.tag} "${b.text}" visible=${b.visible} disabled=${b.disabled}`)
      console.log(`    cls: ${b.cls}`)
    })
    console.log('\n=== Publish-related elements ===')
    pageInfo.publishRelated.forEach((p, i) => {
      console.log(`[${i}] ${p.tag} "${p.text}" visible=${p.visible} cls=${p.cls}`)
    })

    // Check page text for clues
    const bodyText = await cp.evaluate(() => document.body.innerText.substring(0, 3000))
    console.log('\n=== Page text ===')
    console.log(bodyText)

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
