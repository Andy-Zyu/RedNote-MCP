/**
 * Debug: save article as draft, then check 写长文 list for publish option
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
    const [cp] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      page.locator('a[href*="creator.xiaohongshu.com/publish"]').first().click()
    ])
    await cp.waitForLoadState('domcontentloaded', { timeout: 60000 })
    await new Promise(r => setTimeout(r, 3000))

    // Go to article editor
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    // Click 新的创作
    await cp.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Fill title and content
    await cp.locator('textarea[placeholder*="标题"]').first().fill('测试长文草稿发布')
    await new Promise(r => setTimeout(r, 1000))
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await cp.keyboard.type('这是测试内容，用于验证草稿发布流程。', { delay: 20 })
    await new Promise(r => setTimeout(r, 3000))

    // Wait for auto-save
    console.log('Waiting for auto-save...')
    await new Promise(r => setTimeout(r, 5000))

    // Click 暂存离开
    console.log('Clicking 暂存离开...')
    await cp.locator('button:has-text("暂存离开")').first().click()
    await new Promise(r => setTimeout(r, 3000))

    console.log('URL after 暂存离开:', cp.url())
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '16-after-save-draft.png'), fullPage: true })

    // Check what's on the page — should be back to 写长文 list
    const pageInfo = await cp.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(b => {
        return (b as HTMLElement).offsetParent !== null && (b as HTMLElement).innerText?.trim().length > 0
      }).map(b => ({
        text: (b as HTMLElement).innerText.trim().substring(0, 50),
        cls: b.className.toString().substring(0, 100),
      }))

      // Look for article cards/items
      const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="item"], [class*="article"], [class*="draft"]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null && (el as HTMLElement).innerText?.trim().length > 0
      }).map(el => ({
        cls: el.className.toString().substring(0, 120),
        text: (el as HTMLElement).innerText?.substring(0, 200) || '',
      }))

      // Look for any "发布" or "编辑" links/buttons
      const actionEls = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = (el as HTMLElement).innerText || ''
        return (text.includes('发布') || text.includes('编辑') || text.includes('删除'))
          && text.length < 20 && (el as HTMLElement).offsetParent !== null
          && el.tagName !== 'DIV' && el.tagName !== 'SECTION'
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 100),
      }))

      return { buttons, cards: cards.slice(0, 10), actionEls, bodyText: document.body.innerText.substring(0, 3000) }
    })

    console.log('\n=== Buttons ===')
    pageInfo.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" cls=${b.cls}`))
    console.log('\n=== Cards/items ===')
    pageInfo.cards.forEach((c, i) => console.log(`[${i}] cls=${c.cls}\n    text="${c.text.substring(0, 100)}"`))
    console.log('\n=== Action elements (发布/编辑/删除) ===')
    pageInfo.actionEls.forEach((a, i) => console.log(`[${i}] ${a.tag} "${a.text}" cls=${a.cls}`))
    console.log('\n=== Body text ===')
    console.log(pageInfo.bodyText)

    // Now try hovering over the draft item to see if action buttons appear
    const draftItem = cp.locator('[class*="article-item"], [class*="draft-item"], .header:has-text("测试长文")').first()
    if (await draftItem.count() > 0) {
      console.log('\n--- Hovering over draft item ---')
      await draftItem.hover()
      await new Promise(r => setTimeout(r, 2000))
      await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '17-draft-hover.png'), fullPage: true })

      const hoverInfo = await cp.evaluate(() => {
        return Array.from(document.querySelectorAll('*')).filter(el => {
          const text = (el as HTMLElement).innerText || ''
          return (text.includes('发布') || text.includes('编辑') || text.includes('删除'))
            && text.length < 15 && (el as HTMLElement).offsetParent !== null
        }).map(el => ({
          tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
          cls: el.className.toString().substring(0, 100),
        }))
      })
      console.log('Hover action elements:')
      hoverInfo.forEach((h, i) => console.log(`[${i}] ${h.tag} "${h.text}" cls=${h.cls}`))
    }

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
