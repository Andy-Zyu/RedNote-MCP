/**
 * Debug: full article publish flow — 一键排版 → 选模板 → 下一步 → ???
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

    // Intercept API
    cp.on('response', async res => {
      const url = res.url()
      if (url.includes('xiaohongshu') && !url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('.woff') && !url.includes('apm-fe') && !url.includes('.svg') && !url.includes('.wasm')) {
        const method = res.request().method()
        const postData = res.request().postData()?.substring(0, 300)
        let body = ''
        try { body = (await res.text()).substring(0, 500) } catch {}
        console.log(`API: ${method} ${res.status()} ${url}`)
        if (postData) console.log(`  POST: ${postData}`)
        if (body && body.length < 500) console.log(`  RESP: ${body}`)
      }
    })

    // Go to article editor
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    await cp.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Fill content
    await cp.locator('textarea[placeholder*="标题"]').first().fill('测试完整发布流程')
    await new Promise(r => setTimeout(r, 1000))
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    await cp.keyboard.type('这是一篇测试长文内容，用于验证完整的发布流程。从编辑到排版到发布的每一步都需要记录。内容需要足够长以确保功能正常。', { delay: 10 })
    await new Promise(r => setTimeout(r, 3000))

    // Step 1: 一键排版
    console.log('\n=== Step 1: 一键排版 ===')
    await cp.locator('button:has-text("一键排版")').first().click()
    await new Promise(r => setTimeout(r, 8000))
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '24-step1-format.png'), fullPage: true })

    // Step 2: 下一步
    console.log('\n=== Step 2: 下一步 ===')
    await cp.locator('button:has-text("下一步")').first().click()
    await new Promise(r => setTimeout(r, 5000))
    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '25-step2-next.png'), fullPage: true })

    // Dump page state
    const step2Info = await cp.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
        return b.offsetParent !== null && b.innerText?.trim().length > 0 && b.innerText.trim().length < 30
      }).map(b => ({ text: b.innerText.trim(), cls: b.className.toString().substring(0, 120), disabled: b.disabled }))

      const inputs = Array.from(document.querySelectorAll('input, textarea, [contenteditable]')).filter(el => {
        return (el as HTMLElement).offsetParent !== null
      }).map(el => ({
        tag: el.tagName, type: el.getAttribute('type'), placeholder: el.getAttribute('placeholder'),
        value: (el as HTMLInputElement).value?.substring(0, 100) || '',
        cls: el.className.toString().substring(0, 100),
      }))

      return { buttons, inputs, bodyText: document.body.innerText.substring(0, 3000) }
    })

    console.log('\nButtons:')
    step2Info.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" disabled=${b.disabled} cls=${b.cls}`))
    console.log('\nInputs:')
    step2Info.inputs.forEach((inp, i) => console.log(`[${i}] ${inp.tag} type=${inp.type} placeholder="${inp.placeholder}" value="${inp.value}" cls=${inp.cls}`))
    console.log('\nBody text:')
    console.log(step2Info.bodyText)

    // If there's a "发布" button, click it
    const publishBtn = cp.locator('button:has-text("发布")').first()
    if (await publishBtn.count() > 0) {
      const btnText = await publishBtn.innerText()
      console.log(`\n=== Found publish button: "${btnText}" ===`)
      // Don't actually click it yet, just report
    }

    // If there's another "下一步", click it
    const nextBtn2 = cp.locator('button:has-text("下一步")')
    if (await nextBtn2.count() > 0) {
      console.log('\n=== Step 3: Another 下一步 ===')
      await nextBtn2.first().click()
      await new Promise(r => setTimeout(r, 5000))
      await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '26-step3.png'), fullPage: true })

      const step3Info = await cp.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button')).filter(b => {
          return b.offsetParent !== null && b.innerText?.trim().length > 0 && b.innerText.trim().length < 30
        }).map(b => ({ text: b.innerText.trim(), disabled: b.disabled }))
        return { buttons, bodyText: document.body.innerText.substring(0, 3000) }
      })
      console.log('\nStep 3 buttons:')
      step3Info.buttons.forEach((b, i) => console.log(`[${i}] "${b.text}" disabled=${b.disabled}`))
      console.log('\nStep 3 body:')
      console.log(step3Info.bodyText)
    }

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
