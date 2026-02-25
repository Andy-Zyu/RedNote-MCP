/**
 * Debug: complete text-only publish flow - type -> generate -> next step -> check form
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
    await cp.locator('span.title:has-text("上传图文")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 2000))

    // Click 文字配图
    await cp.locator('button:has-text("文字配图")').first().dispatchEvent('click')
    await new Promise(r => setTimeout(r, 3000))

    // Type content
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await new Promise(r => setTimeout(r, 500))
    await cp.keyboard.type('这是一条MCP自动化测试笔记', { delay: 30 })
    await new Promise(r => setTimeout(r, 2000))

    // Click 生成图片
    const genBtn = cp.locator('div:has-text("生成图片"):not(:has(div)), button:has-text("生成图片"), span:has-text("生成图片")').first()
    await genBtn.click()
    await new Promise(r => setTimeout(r, 5000))

    // Click 下一步
    console.log('--- Clicking 下一步 ---')
    const nextBtn = cp.locator('button:has-text("下一步")').first()
    if (await nextBtn.count() > 0) {
      await nextBtn.click()
      await new Promise(r => setTimeout(r, 5000))
      await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '09-after-next.png'), fullPage: true })
      console.log('Screenshot: 09-after-next.png')

      // Explore the form
      const formInfo = await cp.evaluate('(() => { var results = { inputs: [], buttons: [], editables: [], titleRelated: [] }; document.querySelectorAll("input, textarea").forEach(function(el) { results.inputs.push({ tag: el.tagName, type: el.getAttribute("type"), placeholder: el.getAttribute("placeholder"), cls: el.className.substring(0, 100), visible: el.offsetParent !== null, value: el.value ? el.value.substring(0, 50) : "" }); }); document.querySelectorAll("button").forEach(function(el) { var t = el.innerText && el.innerText.trim(); if (t && t.length > 0 && t.length < 30) { results.buttons.push({ text: t, disabled: el.disabled, visible: el.offsetParent !== null, cls: el.className.substring(0, 80) }); } }); document.querySelectorAll("[contenteditable=true]").forEach(function(el) { results.editables.push({ tag: el.tagName, cls: el.className.substring(0, 100), text: el.innerText ? el.innerText.substring(0, 80) : "", placeholder: el.getAttribute("data-placeholder"), html: el.outerHTML.substring(0, 300) }); }); document.querySelectorAll("*").forEach(function(el) { var p = el.getAttribute("placeholder") || ""; var d = el.getAttribute("data-placeholder") || ""; var t = el.innerText || ""; if ((p.includes("标题") || d.includes("标题")) && t.length < 80) { results.titleRelated.push({ tag: el.tagName, cls: el.className.toString().substring(0, 80), placeholder: p, dataPlaceholder: d, text: t.substring(0, 50), html: el.outerHTML.substring(0, 300) }); } }); return results; })()')

      console.log('\n=== Form after 下一步 ===')
      console.log('\nInputs:')
      formInfo.inputs.forEach(function(i: any, idx: number) { console.log(`  [${idx}] ${i.tag} type=${i.type} visible=${i.visible} placeholder="${i.placeholder}" value="${i.value}"`) })
      console.log('\nButtons:')
      formInfo.buttons.forEach(function(b: any, idx: number) { console.log(`  [${idx}] "${b.text}" disabled=${b.disabled} visible=${b.visible}`) })
      console.log('\nEditables:')
      formInfo.editables.forEach(function(e: any, idx: number) { console.log(`  [${idx}] ${e.tag} cls=${e.cls} placeholder="${e.placeholder}" text="${e.text}"`) })
      console.log('\nTitle-related:')
      formInfo.titleRelated.forEach(function(t: any, idx: number) { console.log(`  [${idx}] ${t.tag} placeholder="${t.placeholder}" data-placeholder="${t.dataPlaceholder}" text="${t.text}"`) })

      // Also dump visible page text
      const bodyText = await cp.evaluate('document.body.innerText.substring(0, 2000)')
      console.log('\n=== Page text ===')
      console.log(bodyText)
    } else {
      console.log('下一步 button not found')
    }

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
