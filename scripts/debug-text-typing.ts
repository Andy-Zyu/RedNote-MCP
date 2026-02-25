/**
 * Debug: type content in text-only mode and check what appears
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

    // Type content in the editor
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await new Promise(r => setTimeout(r, 500))
    await cp.keyboard.type('这是一条测试文字笔记，用于探索文字配图模式的页面结构。', { delay: 30 })
    await new Promise(r => setTimeout(r, 3000))

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '07-after-typing.png'), fullPage: true })
    console.log('Screenshot: 07-after-typing.png')

    // Check what appeared after typing
    const afterTyping = await cp.evaluate('(() => { var title = document.querySelector("input[placeholder*=标题], input[placeholder*=赞]"); var allInputs = Array.from(document.querySelectorAll("input, textarea")).map(function(i) { return { tag: i.tagName, type: i.getAttribute("type"), placeholder: i.getAttribute("placeholder"), cls: i.className.substring(0, 100), visible: i.offsetParent !== null }; }); var allBtns = Array.from(document.querySelectorAll("button")).filter(function(b) { return b.innerText && b.innerText.trim().length > 0 && b.innerText.trim().length < 30; }).map(function(b) { return { text: b.innerText.trim(), disabled: b.disabled, cls: b.className.substring(0, 100), visible: b.offsetParent !== null }; }); var editables = Array.from(document.querySelectorAll("[contenteditable=true]")).map(function(e) { return { tag: e.tagName, cls: e.className.substring(0, 100), text: e.innerText.substring(0, 100), placeholder: e.getAttribute("data-placeholder") }; }); return { title: title ? { found: true, placeholder: title.getAttribute("placeholder") } : { found: false }, inputs: allInputs, buttons: allBtns, editables: editables }; })()')

    console.log('\n=== After typing content ===')
    console.log('Title input:', JSON.stringify(afterTyping.title))
    console.log('\nAll inputs:')
    afterTyping.inputs.forEach(function(i: any, idx: number) { console.log(`  [${idx}] ${i.tag} type=${i.type} visible=${i.visible} placeholder="${i.placeholder}"`) })
    console.log('\nAll buttons:')
    afterTyping.buttons.forEach(function(b: any, idx: number) { console.log(`  [${idx}] "${b.text}" disabled=${b.disabled} visible=${b.visible} cls=${b.cls.substring(0, 60)}`) })
    console.log('\nAll contenteditable:')
    afterTyping.editables.forEach(function(e: any, idx: number) { console.log(`  [${idx}] ${e.tag} cls=${e.cls} placeholder="${e.placeholder}" text="${e.text.substring(0, 50)}"`) })

    // Now try clicking "生成图片" if it exists
    console.log('\n--- Looking for 生成图片 button ---')
    const genBtn = cp.locator('div:has-text("生成图片"):not(:has(div)), button:has-text("生成图片"), span:has-text("生成图片")')
    const genCount = await genBtn.count()
    console.log(`Found ${genCount} 生成图片 elements`)

    if (genCount > 0) {
      await genBtn.first().click()
      await new Promise(r => setTimeout(r, 5000))
      await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '08-after-generate.png'), fullPage: true })
      console.log('Screenshot: 08-after-generate.png')

      // Check again for title and publish button
      const afterGen = await cp.evaluate('(() => { var title = document.querySelector("input[placeholder*=标题], input[placeholder*=赞]"); var allBtns = Array.from(document.querySelectorAll("button")).filter(function(b) { return b.innerText && b.innerText.trim().length > 0 && b.innerText.trim().length < 30; }).map(function(b) { return { text: b.innerText.trim(), disabled: b.disabled, visible: b.offsetParent !== null }; }); var editables = Array.from(document.querySelectorAll("[contenteditable=true]")).map(function(e) { return { tag: e.tagName, cls: e.className.substring(0, 100), text: e.innerText.substring(0, 100), placeholder: e.getAttribute("data-placeholder") }; }); return { title: title ? { found: true, placeholder: title.getAttribute("placeholder") } : { found: false }, buttons: allBtns, editables: editables }; })()')
      console.log('\n=== After generating image ===')
      console.log('Title input:', JSON.stringify(afterGen.title))
      console.log('\nButtons:')
      afterGen.buttons.forEach(function(b: any, idx: number) { console.log(`  [${idx}] "${b.text}" disabled=${b.disabled} visible=${b.visible}`) })
      console.log('\nEditables:')
      afterGen.editables.forEach(function(e: any, idx: number) { console.log(`  [${idx}] ${e.tag} cls=${e.cls} placeholder="${e.placeholder}" text="${e.text.substring(0, 50)}"`) })
    }

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
