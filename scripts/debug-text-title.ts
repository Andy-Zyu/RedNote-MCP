/**
 * Debug: explore text-only publish mode title input selector
 */
import { chromium } from 'playwright'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const SCREENSHOT_DIR = '/tmp/debug-text-publish'

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

    // Switch to 上传图文
    const tab = cp.locator('span.title:has-text("上传图文")').first()
    await tab.dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))

    // Click 文字配图
    const btn = cp.locator('button:has-text("文字配图")').first()
    await btn.dispatchEvent('click')
    await new Promise(r => setTimeout(r, 3000))

    // Explore ALL inputs, contenteditable, and placeholders
    const formElements = await cp.evaluate('(() => { var results = []; document.querySelectorAll("input, textarea, [contenteditable=true], [placeholder], [data-placeholder]").forEach(function(el) { results.push({ tag: el.tagName, type: el.getAttribute("type"), placeholder: el.getAttribute("placeholder"), dataPlaceholder: el.getAttribute("data-placeholder"), cls: el.className.toString().substring(0, 150), contentEditable: el.getAttribute("contenteditable"), id: el.id, visible: el.offsetParent !== null, text: el.innerText ? el.innerText.substring(0, 50) : "", html: el.outerHTML.substring(0, 400) }); }); return results; })()')
    console.log('=== All form elements ===')
    formElements.forEach(function(el: any, i: number) {
      console.log(`[${i}] ${el.tag} type=${el.type} id=${el.id} visible=${el.visible}`)
      console.log(`    placeholder="${el.placeholder}" data-placeholder="${el.dataPlaceholder}"`)
      console.log(`    cls: ${el.cls}`)
      console.log(`    text: "${el.text}"`)
      console.log(`    html: ${el.html.substring(0, 300)}`)
      console.log()
    })

    // Check for elements with "标题" in any attribute or nearby text
    const titleRelated = await cp.evaluate('(() => { var results = []; document.querySelectorAll("*").forEach(function(el) { var t = el.innerText || ""; var p = el.getAttribute("placeholder") || ""; var d = el.getAttribute("data-placeholder") || ""; if ((t.includes("标题") || p.includes("标题") || d.includes("标题")) && t.length < 100) { results.push({ tag: el.tagName, cls: el.className.toString().substring(0, 100), text: t.substring(0, 50), placeholder: p, dataPlaceholder: d, html: el.outerHTML.substring(0, 400) }); } }); return results.slice(0, 20); })()')
    console.log('=== Elements related to 标题 ===')
    titleRelated.forEach(function(el: any, i: number) {
      console.log(`[${i}] ${el.tag} placeholder="${el.placeholder}" data-placeholder="${el.dataPlaceholder}"`)
      console.log(`    text: "${el.text}"`)
      console.log(`    cls: ${el.cls}`)
      console.log(`    html: ${el.html.substring(0, 300)}`)
      console.log()
    })

    // Also dump the publish button state
    const publishBtns = await cp.evaluate('(() => { return Array.from(document.querySelectorAll("button")).filter(function(b) { return b.innerText && b.innerText.includes("发布"); }).map(function(b) { return { text: b.innerText.trim(), disabled: b.disabled, cls: b.className.substring(0, 100), html: b.outerHTML.substring(0, 300) }; }); })()')
    console.log('=== Publish buttons ===')
    console.log(JSON.stringify(publishBtns, null, 2))

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '06-text-mode-detail.png'), fullPage: true })
    console.log('\nScreenshot: 06-text-mode-detail.png')

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
