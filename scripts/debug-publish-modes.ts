/**
 * Debug script: explore publish page modes (image-text / video / text-only)
 * Uses SSO flow: main site -> click publish -> creator center
 */
import { chromium, Page } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
const PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish'
const SCREENSHOT_DIR = '/tmp/debug-publish-modes'

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true })

  const cm = new CookieManager(COOKIE_PATH)

  console.log('=== Debug Publish Modes ===')

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  const cookies = await cm.loadCookies()
  if (cookies.length > 0) {
    console.log(`Loaded ${cookies.length} cookies`)
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  // API monitoring
  const apiRequests: Array<{ method: string; url: string; status: number }> = []
  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('/api/') || url.includes('/web/')) {
      apiRequests.push({ method: response.request().method(), url: url.substring(0, 200), status: response.status() })
    }
  })

  try {
    // ---- SSO flow ----
    console.log('\n--- SSO to creator center ---')
    await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await new Promise(r => setTimeout(r, 3000))

    // Dismiss any modal overlay (login popup, cookie consent, etc.)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '00-main-site.png'), fullPage: true })
    console.log('Screenshot: 00-main-site.png')
    try {
      // Press Escape to dismiss any modal
      await page.keyboard.press('Escape')
      await new Promise(r => setTimeout(r, 1000))
      // Also try clicking any visible close buttons
      const closeBtns = page.locator('[class*="close-button"], [class*="closeBtn"], [class*="close-btn"]')
      if (await closeBtns.count() > 0) {
        await closeBtns.first().click({ timeout: 3000 }).catch(() => {})
        await new Promise(r => setTimeout(r, 1000))
      }
    } catch {}

    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    if (await publishLink.count() === 0) {
      console.error('ERROR: No publish link found. Not logged in?')
      await context.close()
      return
    }

    const [creatorPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 60000 }),
      publishLink.first().evaluate((el: HTMLElement) => el.click())
    ])
    await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
    console.log(`Creator page URL: ${creatorPage.url()}`)

    if (creatorPage.url().includes('login')) {
      console.error('ERROR: Redirected to login.')
      await context.close()
      return
    }

    // Monitor API on creator page too
    creatorPage.on('response', async (response) => {
      const url = response.url()
      if (url.includes('/api/') || url.includes('/web/')) {
        apiRequests.push({ method: response.request().method(), url: url.substring(0, 200), status: response.status() })
      }
    })

    // SSO already landed on publish page, just wait for it to fully load
    console.log(`\nOn publish page: ${creatorPage.url()}`)
    await new Promise(r => setTimeout(r, 5000))

    await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, '00-initial.png'), fullPage: true })
    console.log('Screenshot: 00-initial.png')

    // ---- Step 1: Analyze tabs ----
    console.log('\n=== Step 1: Analyze publish mode tabs ===')

    const tabsInfo = await creatorPage.evaluate(() => {
      const results: Array<{ text: string; tagName: string; className: string; isActive: boolean; outerHTML: string }> = []

      // Strategy: find ALL elements with short text that might be tabs
      const allEls = document.querySelectorAll('span, div, a, button, li, label')
      allEls.forEach((el) => {
        const text = (el as HTMLElement).innerText?.trim()
        if (text && text.length < 20 && text.length > 1 && (
          text.includes('上传') || text.includes('视频') || text.includes('图文') ||
          text.includes('文字') || text.includes('纯文') || text.includes('发布') ||
          text.includes('笔记') || text.includes('图片')
        )) {
          // Avoid duplicates
          if (!results.some(r => r.text === text && r.tagName === el.tagName)) {
            results.push({
              text, tagName: el.tagName, className: (el.className || '').toString().substring(0, 100),
              isActive: el.classList?.contains('active') || el.parentElement?.classList?.contains('active') || false,
              outerHTML: el.outerHTML.substring(0, 500),
            })
          }
        }
      })

      return results
    })

    console.log(`Found ${tabsInfo.length} publish-related elements:`)
    tabsInfo.forEach((tab, i) => {
      console.log(`  [${i}] "${tab.text}" (${tab.tagName}.${tab.className}) active=${tab.isActive}`)
      console.log(`       HTML: ${tab.outerHTML.substring(0, 200)}`)
    })

    // Also dump all visible text on the page
    const bodyText = await creatorPage.evaluate(() => document.body.innerText.substring(0, 2000))
    console.log('\n=== Page body text ===')
    console.log(bodyText)

    // ---- Step 2: Page DOM structure ----
    console.log('\n=== Step 2: Page DOM structure (4 levels) ===')
    const pageStructure = await creatorPage.evaluate(() => {
      const getStructure = (el: Element, depth: number, maxDepth: number): string => {
        if (depth > maxDepth) return ''
        const indent = '  '.repeat(depth)
        const cls = el.className && typeof el.className === 'string'
          ? `.${el.className.split(' ').filter(Boolean).slice(0, 3).join('.')}` : ''
        const id = el.id ? `#${el.id}` : ''
        let line = `${indent}${el.tagName.toLowerCase()}${id}${cls}`
        const children = Array.from(el.children)
        if (children.length > 0 && depth < maxDepth) {
          line += '\n' + children.map(c => getStructure(c, depth + 1, maxDepth)).filter(Boolean).join('\n')
        }
        return line
      }
      const main = document.querySelector('#app') || document.body
      return getStructure(main, 0, 4)
    })
    console.log(pageStructure.substring(0, 3000))

    // ---- Step 3: Upload area ----
    console.log('\n=== Step 3: Upload area DOM ===')
    const uploadAreaInfo = await creatorPage.evaluate(() => {
      const fileInputs = document.querySelectorAll('input[type="file"]')
      const dropZones = document.querySelectorAll('[class*="upload"], [class*="drag"], [class*="drop"]')
      return {
        fileInputs: Array.from(fileInputs).map(input => ({
          accept: input.getAttribute('accept'),
          multiple: input.hasAttribute('multiple'),
          className: input.className,
          parentHTML: input.parentElement?.outerHTML.substring(0, 300) || '',
        })),
        dropZones: Array.from(dropZones).slice(0, 5).map(zone => ({
          tagName: zone.tagName, className: zone.className,
          text: (zone as HTMLElement).innerText?.substring(0, 100) || '',
        })),
      }
    })
    console.log('File inputs:', JSON.stringify(uploadAreaInfo.fileInputs, null, 2))
    console.log('Drop zones:', JSON.stringify(uploadAreaInfo.dropZones, null, 2))

    // ---- Step 4: Click each mode tab ----
    console.log('\n=== Step 4: Click each mode tab ===')
    const modeTexts = ['上传视频', '上传图文', '纯文字', '文字笔记']

    for (const modeText of modeTexts) {
      console.log(`\n--- Trying: "${modeText}" ---`)

      const clicked = await creatorPage.evaluate((text) => {
        const allElements = Array.from(document.querySelectorAll('span, div, a, button'))
        for (const el of allElements) {
          if ((el as HTMLElement).innerText?.trim() === text) {
            (el as HTMLElement).click()
            return { clicked: true, tagName: el.tagName, className: el.className }
          }
        }
        return { clicked: false }
      }, modeText)

      if (!clicked.clicked) {
        const locator = creatorPage.locator(`span:has-text("${modeText}")`).first()
        if (await locator.count() > 0) {
          await locator.dispatchEvent('click')
          console.log(`  Clicked via locator`)
        } else {
          console.log(`  "${modeText}" not found, skipping`)
          continue
        }
      } else {
        console.log(`  Clicked: ${clicked.tagName}.${clicked.className}`)
      }

      await new Promise(r => setTimeout(r, 3000))

      const screenshotName = `mode-${modeText}.png`
      await creatorPage.screenshot({ path: path.join(SCREENSHOT_DIR, screenshotName), fullPage: true })
      console.log(`  Screenshot: ${screenshotName}`)

      const modeInfo = await creatorPage.evaluate(() => {
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(input => ({
          accept: input.getAttribute('accept'),
          multiple: input.hasAttribute('multiple'),
          visible: (input as HTMLInputElement).offsetParent !== null,
          parentClass: input.parentElement?.className || '',
        }))
        const titleInput = document.querySelector('input[placeholder*="标题"], input[placeholder*="赞"]')
        const editor = document.querySelector('.tiptap.ProseMirror, .ql-editor, [contenteditable="true"]')
        const buttons = Array.from(document.querySelectorAll('button')).filter(btn =>
          (btn as HTMLElement).innerText?.includes('发布')
        )
        return {
          fileInputs,
          titleInput: titleInput ? { found: true, placeholder: titleInput.getAttribute('placeholder') } : { found: false },
          contentEditor: editor ? { found: true, className: editor.className } : { found: false },
          publishButtons: buttons.map(btn => ({ text: (btn as HTMLElement).innerText?.trim(), disabled: btn.hasAttribute('disabled') })),
        }
      })

      console.log(`  File inputs: ${JSON.stringify(modeInfo.fileInputs)}`)
      console.log(`  Title: ${JSON.stringify(modeInfo.titleInput)}`)
      console.log(`  Editor: ${JSON.stringify(modeInfo.contentEditor)}`)
      console.log(`  Publish: ${JSON.stringify(modeInfo.publishButtons)}`)
    }

    // ---- API summary ----
    console.log('\n=== Captured API requests ===')
    apiRequests.forEach(req => console.log(`  ${req.method} ${req.status} ${req.url}`))
    console.log(`\nTotal: ${apiRequests.length}`)
    console.log(`Screenshots: ${SCREENSHOT_DIR}`)

  } catch (error) {
    console.error('Error:', error)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error.png') }).catch(() => {})
  } finally {
    await context.close()
  }
}

main().catch(console.error)
