/**
 * Debug: after clicking 一键排版, explore the formatting panel for publish button
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
    await cp.locator('textarea[placeholder*="标题"]').first().fill('测试一键排版后的发布流程')
    await new Promise(r => setTimeout(r, 1000))
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    const content = '这是一篇测试长文，用于探索一键排版后的发布流程。小红书的长文编辑器需要先点击一键排版，然后选择模板，最后才能发布。我们需要找到完整的发布路径。这段内容需要足够长以确保排版功能正常工作。让我们继续添加更多内容来测试。'
    await cp.keyboard.type(content, { delay: 10 })
    await new Promise(r => setTimeout(r, 3000))

    // Click 一键排版
    console.log('Clicking 一键排版...')
    await cp.locator('button:has-text("一键排版")').first().click()
    await new Promise(r => setTimeout(r, 8000))  // Wait for templates to load

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '22-format-panel.png'), fullPage: true })

    // Dump the formatting panel
    const panelInfo = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))

      // Find all buttons
      const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
        return b.offsetParent !== null && b.innerText?.trim().length > 0 && b.innerText.trim().length < 30
      }).map(b => ({
        text: b.innerText.trim(),
        cls: b.className.toString().substring(0, 120),
        disabled: b.disabled,
      }))

      // Find all clickable elements with relevant text
      const actionEls = all.filter(el => {
        const text = (el as HTMLElement).innerText || ''
        const style = window.getComputedStyle(el)
        return (text.includes('发布') || text.includes('下一步') || text.includes('预览') ||
                text.includes('完成') || text.includes('确认') || text.includes('使用') ||
                text.includes('选择') || text.includes('应用'))
          && text.length < 20 && (el as HTMLElement).offsetParent !== null
          && (el.tagName === 'BUTTON' || el.tagName === 'SPAN' || el.tagName === 'DIV' && style.cursor === 'pointer')
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText.trim(),
        cls: el.className.toString().substring(0, 120),
      }))

      // Get the right panel content
      const rightPanel = document.querySelector('[class*="panel"], [class*="preview"], [class*="template"], [class*="format"]')
      const rightPanelText = rightPanel ? (rightPanel as HTMLElement).innerText?.substring(0, 500) : 'no panel'
      const rightPanelHTML = rightPanel ? rightPanel.outerHTML.substring(0, 2000) : 'no panel'

      return { buttons, actionEls, rightPanelText, rightPanelHTML, bodyText: document.body.innerText.substring(0, 3000) }
    })

    console.log('\n=== All buttons ===')
    panelInfo.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" disabled=${b.disabled} cls=${b.cls}`))

    console.log('\n=== Action elements ===')
    panelInfo.actionEls.forEach((a, i) => console.log(`[${i}] ${a.tag} "${a.text}" cls=${a.cls}`))

    console.log('\n=== Right panel text ===')
    console.log(panelInfo.rightPanelText)

    console.log('\n=== Body text ===')
    console.log(panelInfo.bodyText)

    // Try selecting a template (click first template option)
    const templateItems = cp.locator('[class*="template-item"], [class*="card"], [class*="option"]').filter({ hasText: /模板|样式/ })
    const templateCount = await templateItems.count()
    console.log('\nTemplate items:', templateCount)

    // Try clicking any template thumbnail/card
    const templateCards = cp.locator('[class*="template"] img, [class*="cover"] img, [class*="preview-item"]')
    const cardCount = await templateCards.count()
    console.log('Template cards/images:', cardCount)

    if (cardCount > 0) {
      await templateCards.first().click()
      await new Promise(r => setTimeout(r, 3000))
      await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '23-template-selected.png'), fullPage: true })

      // Check for new buttons after selecting template
      const afterSelect = await cp.evaluate(() => {
        return Array.from(document.querySelectorAll('button')).filter(b => {
          return b.offsetParent !== null && b.innerText?.trim().length > 0 && b.innerText.trim().length < 30
        }).map(b => ({ text: b.innerText.trim(), cls: b.className.toString().substring(0, 100) }))
      })
      console.log('\nButtons after template select:')
      afterSelect.forEach((b, i) => console.log(`[${i}] "${b.text}" cls=${b.cls}`))
    }

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
