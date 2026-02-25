/**
 * Debug script: explore text-only publish mode
 * Focus on: 上传图文 tab -> 文字配图 button -> page structure
 */
import { chromium } from 'playwright'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const SCREENSHOT_DIR = '/tmp/debug-text-publish'

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })

  console.log('=== Debug Text Publish ===')

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  await context.addInitScript('Object.defineProperty(navigator, "webdriver", { get: () => undefined })')

  const page = await context.newPage()

  try {
    // SSO flow
    console.log('SSO: visiting main site...')
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    if (await publishLink.count() === 0) {
      console.error('No publish link found. Not logged in?')
      await context.close()
      return
    }

    const [creatorPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      publishLink.first().click()
    ])
    await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
    console.log('Creator page: ' + creatorPage.url())

    if (creatorPage.url().includes('login')) {
      console.error('Redirected to login')
      await context.close()
      return
    }

    await new Promise(r => setTimeout(r, 3000))

    // Step 1: Screenshot default state (上传视频)
    await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '01-default-video-tab.png'), fullPage: true })
    console.log('Screenshot: 01-default-video-tab.png')

    // Step 2: Click 上传图文 tab
    console.log('\n--- Clicking 上传图文 tab ---')
    const imageTextTab = creatorPage.locator('span.title:has-text("上传图文")').first()
    if (await imageTextTab.count() > 0) {
      await imageTextTab.dispatchEvent('click')
      await new Promise(r => setTimeout(r, 3000))
      await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '02-image-text-tab.png'), fullPage: true })
      console.log('Screenshot: 02-image-text-tab.png')

      // Check what's on this tab
      const tabInfo = await creatorPage.evaluate('(() => { const btns = Array.from(document.querySelectorAll("button, div, span")).filter(el => { const t = el.innerText && el.innerText.trim(); return t && (t.includes("文字配图") || t.includes("生成图片") || t.includes("纯文字")); }); return btns.map(b => ({ text: b.innerText.trim().substring(0, 50), tag: b.tagName, cls: b.className.toString().substring(0, 100), html: b.outerHTML.substring(0, 300) })); })()')
      console.log('Text-related buttons:', JSON.stringify(tabInfo, null, 2))

      // Check for file inputs and upload areas
      const uploadInfo = await creatorPage.evaluate('(() => { const inputs = Array.from(document.querySelectorAll("input[type=file]")); const areas = Array.from(document.querySelectorAll("[class*=upload], [class*=drag]")).slice(0, 5); return { inputs: inputs.map(i => ({ accept: i.getAttribute("accept"), cls: i.className, visible: i.offsetParent !== null })), areas: areas.map(a => ({ tag: a.tagName, cls: a.className.substring(0, 100), text: a.innerText && a.innerText.substring(0, 80) })) }; })()')
      console.log('Upload info:', JSON.stringify(uploadInfo, null, 2))

      // Check for title/editor
      const formInfo = await creatorPage.evaluate('(() => { const title = document.querySelector("input[placeholder*=标题], input[placeholder*=赞]"); const editor = document.querySelector(".tiptap.ProseMirror, .ql-editor, [contenteditable=true]"); return { title: title ? { found: true, placeholder: title.getAttribute("placeholder"), visible: title.offsetParent !== null } : { found: false }, editor: editor ? { found: true, cls: editor.className, visible: editor.offsetParent !== null } : { found: false } }; })()')
      console.log('Form info:', JSON.stringify(formInfo, null, 2))
    } else {
      console.log('上传图文 tab not found')
    }

    // Step 3: Try clicking 文字配图 button
    console.log('\n--- Looking for 文字配图 button ---')
    const textImageBtn = creatorPage.locator('button:has-text("文字配图"), div:has-text("文字配图"):not(:has(div)), span:has-text("文字配图")')
    const textImageCount = await textImageBtn.count()
    console.log(`Found ${textImageCount} 文字配图 elements`)

    if (textImageCount > 0) {
      await textImageBtn.first().dispatchEvent('click')
      await new Promise(r => setTimeout(r, 3000))
      await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '03-text-image-mode.png'), fullPage: true })
      console.log('Screenshot: 03-text-image-mode.png')

      // Check form state after clicking 文字配图
      const afterTextImage = await creatorPage.evaluate('(() => { const title = document.querySelector("input[placeholder*=标题], input[placeholder*=赞]"); const editor = document.querySelector(".tiptap.ProseMirror, .ql-editor, [contenteditable=true]"); const publishBtn = document.querySelector("button"); const allBtns = Array.from(document.querySelectorAll("button")).map(b => b.innerText.trim()).filter(t => t.length > 0 && t.length < 20); return { title: title ? { found: true, placeholder: title.getAttribute("placeholder"), visible: title.offsetParent !== null } : { found: false }, editor: editor ? { found: true, cls: editor.className } : { found: false }, buttons: allBtns }; })()')
      console.log('After 文字配图:', JSON.stringify(afterTextImage, null, 2))
    }

    // Step 4: Try 写长文 tab
    console.log('\n--- Clicking 写长文 tab ---')
    const longTextTab = creatorPage.locator('span.title:has-text("写长文"), div:has-text("写长文"):not(:has(div))')
    if (await longTextTab.count() > 0) {
      await longTextTab.first().dispatchEvent('click')
      await new Promise(r => setTimeout(r, 3000))
      await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '04-long-text-tab.png'), fullPage: true })
      console.log('Screenshot: 04-long-text-tab.png')

      const longTextInfo = await creatorPage.evaluate('(() => { const title = document.querySelector("input[placeholder*=标题], input[placeholder*=赞]"); const editor = document.querySelector(".tiptap.ProseMirror, .ql-editor, [contenteditable=true]"); const allInputs = Array.from(document.querySelectorAll("input, textarea")).map(i => ({ tag: i.tagName, type: i.getAttribute("type"), placeholder: i.getAttribute("placeholder"), cls: i.className.substring(0, 80) })); return { title: title ? { found: true, placeholder: title.getAttribute("placeholder") } : { found: false }, editor: editor ? { found: true, cls: editor.className } : { found: false }, allInputs }; })()')
      console.log('Long text form:', JSON.stringify(longTextInfo, null, 2))
    } else {
      console.log('写长文 tab not found')
    }

    // Step 5: Check 笔记灵感 sidebar link
    console.log('\n--- Checking 笔记灵感 sidebar ---')
    const inspirationLink = creatorPage.locator('text=笔记灵感').first()
    if (await inspirationLink.count() > 0) {
      await inspirationLink.click()
      await new Promise(r => setTimeout(r, 5000))
      await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '05-inspiration.png'), fullPage: true })
      console.log('Screenshot: 05-inspiration.png')
      console.log('Inspiration URL: ' + creatorPage.url())

      const inspirationText = await creatorPage.evaluate('document.body.innerText.substring(0, 3000)')
      console.log('Inspiration page text:')
      console.log(inspirationText)
    } else {
      console.log('笔记灵感 not found in sidebar')
    }

    console.log('\nDone! Screenshots in: ' + SCREENSHOT_DIR)

  } catch (error) {
    console.error('Error:', error)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') }).catch(() => {})
  } finally {
    await context.close()
  }
}

main().catch(console.error)
