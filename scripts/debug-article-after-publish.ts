/**
 * Debug: what happens after clicking 发布笔记 in article editor
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
    await cp.keyboard.type('这是调试内容，用于观察发布笔记按钮点击后的行为。', { delay: 20 })
    await new Promise(r => setTimeout(r, 2000))

    console.log('URL before clicking 发布笔记:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '07-before-publish.png'), fullPage: true })

    // Click 发布笔记
    const publishBtn = cp.locator('span:has-text("发布笔记")').first()
    console.log('发布笔记 button found:', await publishBtn.count())
    await publishBtn.click()
    await new Promise(r => setTimeout(r, 5000))

    console.log('URL after clicking 发布笔记:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '08-after-publish-click.png'), fullPage: true })

    // Dump page state
    const pageInfo = await cp.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(el => {
        const t = (el as HTMLElement).innerText?.trim()
        return t && t.length > 0 && t.length < 40 && (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 100),
        disabled: (el as HTMLButtonElement).disabled || false,
      }))
      const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable=true]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        cls: el.className.toString().substring(0, 100),
        value: (el as HTMLInputElement).value?.substring(0, 50) || '',
        id: el.id,
      }))
      // Check for modals/dialogs
      const modals = Array.from(document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="drawer"], [class*="popup"], [class*="overlay"]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        cls: el.className.toString().substring(0, 150),
        text: (el as HTMLElement).innerText?.substring(0, 500) || '',
      }))
      return { buttons, inputs, modals, bodyText: document.body.innerText.substring(0, 3000) }
    })

    console.log('\n=== Visible buttons ===')
    pageInfo.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" disabled=${b.disabled} cls=${b.cls}`))
    console.log('\n=== Visible inputs ===')
    pageInfo.inputs.forEach((inp, i) => console.log(`[${i}] ${inp.tag} type=${inp.type} id="${inp.id}" placeholder="${inp.placeholder}" value="${inp.value}"`))
    console.log('\n=== Visible modals/dialogs ===')
    pageInfo.modals.forEach((m, i) => console.log(`[${i}] cls=${m.cls}\n    text: "${m.text.substring(0, 200)}"`))
    console.log('\n=== Body text ===')
    console.log(pageInfo.bodyText)

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
