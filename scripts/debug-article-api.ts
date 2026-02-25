/**
 * Debug: check article editor JS for publish/save logic
 * Also check if there's a minimum content requirement
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

    // Intercept ALL API requests (not just xiaohongshu)
    const apiRequests: { method: string; url: string; status?: number; postData?: string; responseBody?: string }[] = []
    cp.on('response', async res => {
      const url = res.url()
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png') && !url.includes('.jpg') && !url.includes('.woff') && !url.includes('apm-fe') && !url.includes('.svg')) {
        const entry: any = { method: res.request().method(), url, status: res.status() }
        if (res.request().postData()) entry.postData = res.request().postData()?.substring(0, 500)
        try {
          const body = await res.text()
          if (body.length < 2000) entry.responseBody = body
          else entry.responseBody = body.substring(0, 500) + '...'
        } catch {}
        apiRequests.push(entry)
      }
    })

    // Go to article editor
    await cp.goto('https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch&target=article', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    // Click 新的创作
    await cp.locator('button:has-text("新的创作")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    // Clear requests
    apiRequests.length = 0

    // Fill title with enough content
    await cp.locator('textarea[placeholder*="标题"]').first().fill('测试长文发布流程探索')
    await new Promise(r => setTimeout(r, 1000))

    // Fill editor with substantial content
    const editor = cp.locator('.tiptap.ProseMirror').first()
    await editor.click()
    const longContent = '这是一篇测试长文，用于探索发布流程。小红书的长文编辑器是一个基于TipTap的富文本编辑器，支持多种格式化选项。我们需要找到正确的发布方式，因为编辑器中没有明显的发布按钮。这段内容需要足够长，以确保自动保存功能能够正常触发。让我们继续写更多内容来测试这个功能。'
    await cp.keyboard.type(longContent, { delay: 10 })
    await new Promise(r => setTimeout(r, 10000))  // Wait for auto-save

    console.log('=== API requests during editing (waiting 10s for auto-save) ===')
    apiRequests.forEach((r, i) => {
      console.log(`[${i}] ${r.method} ${r.status} ${r.url}`)
      if (r.postData) console.log(`    POST: ${r.postData.substring(0, 300)}`)
      if (r.responseBody) console.log(`    RESP: ${r.responseBody.substring(0, 300)}`)
    })

    // Check save status
    const saveStatus = await cp.evaluate(() => {
      const statusEl = document.querySelector('[class*="save"], [class*="status"]')
      const allText = document.body.innerText
      const saveMatch = allText.match(/(自动保存|保存失败|已保存|保存中)[^\n]*/g)
      return { statusText: statusEl?.textContent, saveMatches: saveMatch }
    })
    console.log('\nSave status:', saveStatus)

    // Now try clicking 一键排版 to see if it triggers save
    apiRequests.length = 0
    console.log('\n--- Clicking 一键排版 ---')
    await cp.locator('button:has-text("一键排版")').first().click()
    await new Promise(r => setTimeout(r, 5000))

    console.log('=== API requests after 一键排版 ===')
    apiRequests.forEach((r, i) => {
      console.log(`[${i}] ${r.method} ${r.status} ${r.url}`)
      if (r.postData) console.log(`    POST: ${r.postData.substring(0, 300)}`)
      if (r.responseBody) console.log(`    RESP: ${r.responseBody.substring(0, 300)}`)
    })

    await cp.screenshot({ path: path.join(SCREENSHOT_DIR, '21-after-format.png'), fullPage: true })

    // Check the full page HTML for any hidden publish elements
    const hiddenPublish = await cp.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'))
      // Find ALL elements with publish-related text, even hidden ones
      return all.filter(el => {
        const text = (el as HTMLElement).innerText || el.textContent || ''
        return (text === '发布' || text === '提交' || text === '完成发布' || text === '发布文章')
      }).map(el => ({
        tag: el.tagName, text: (el as HTMLElement).innerText?.trim() || el.textContent?.trim() || '',
        cls: el.className.toString().substring(0, 100),
        visible: (el as HTMLElement).offsetParent !== null,
        display: window.getComputedStyle(el).display,
        html: el.outerHTML.substring(0, 300),
      }))
    })
    console.log('\n=== Hidden publish elements ===')
    hiddenPublish.forEach((h, i) => console.log(`[${i}] ${h.tag} "${h.text}" visible=${h.visible} display=${h.display}\n    cls=${h.cls}\n    html=${h.html}`))

    console.log('\nDone!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await context.close()
  }
}

main().catch(console.error)
