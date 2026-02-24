/**
 * Debug script: Identify the tag suggestion dropdown DOM structure.
 * Usage: npx tsx scripts/test-tag-dropdown.ts
 */
import { chromium } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  const cookieManager = new CookieManager(COOKIE_PATH)
  const cookies = await cookieManager.loadCookies()

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  })
  if (cookies.length > 0) {
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  // Navigate to main site first for SSO
  console.log('1. Navigating to main site...')
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 2000))

  // Click publish link to trigger SSO
  console.log('2. Clicking publish link for SSO...')
  const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
  const [creatorPage] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 60000 }),
    publishLink.first().click()
  ])
  await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
  // Set viewport on the new page too
  await creatorPage.setViewportSize({ width: 1440, height: 900 })
  console.log(`3. Creator page loaded: ${creatorPage.url()}`)
  await new Promise(r => setTimeout(r, 3000))

  // Switch to "上传图文" tab via JS click (bypasses viewport check)
  console.log('4. Switching to 上传图文 tab via JS...')
  await creatorPage.evaluate(() => {
    const spans = document.querySelectorAll('span.title')
    for (const span of spans) {
      if (span.textContent?.trim() === '上传图文') {
        const tab = span.closest('.creator-tab') || span.parentElement
        if (tab) (tab as HTMLElement).click()
        break
      }
    }
  })
  await new Promise(r => setTimeout(r, 2000))

  // Upload test image
  console.log('5. Uploading test image...')
  const fileInput = creatorPage.locator('input[type="file"]').first()
  await fileInput.setInputFiles('/Volumes/SSD-990-PRO-2TB/RedNote-MCP/scripts/test-image.png')
  console.log('   Waiting for editor to appear...')

  // Wait for title input or editor
  try {
    await creatorPage.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"], [contenteditable="true"]', { timeout: 30000 })
  } catch {
    console.log('   Title input not found, checking page state...')
  }
  await new Promise(r => setTimeout(r, 3000))

  // Check for editor
  const editorCheck = await creatorPage.evaluate(() => {
    const results: string[] = []
    const editables = document.querySelectorAll('[contenteditable="true"]')
    results.push(`contenteditable=true: ${editables.length}`)
    editables.forEach((el, i) => {
      results.push(`  [${i}] <${el.tagName}> class="${el.className}" placeholder="${el.getAttribute('data-placeholder') || 'none'}"`)
    })
    return results.join('\n')
  })
  console.log('\n=== EDITOR CHECK ===')
  console.log(editorCheck)
  console.log('=== END ===\n')

  // Find content editor
  const editors = creatorPage.locator('[contenteditable="true"]')
  const editorCount = await editors.count()
  if (editorCount === 0) {
    console.log('No editor found! Taking screenshot...')
    await creatorPage.screenshot({ path: '/Volumes/SSD-990-PRO-2TB/RedNote-MCP/scripts/tag-debug-no-editor.png' })
    console.log('Keeping browser open for inspection...')
    await new Promise(r => setTimeout(r, 120000))
    await browser.close()
    return
  }

  // Click content editor (skip title if present)
  const targetIdx = editorCount >= 2 ? 1 : 0
  console.log(`6. Clicking editor[${targetIdx}]...`)
  await editors.nth(targetIdx).click()
  await new Promise(r => setTimeout(r, 500))

  // Type # to trigger suggestion dropdown
  console.log('7. Typing #...')
  await creatorPage.keyboard.type('#', { delay: 100 })
  await new Promise(r => setTimeout(r, 2000))

  // Snapshot after #
  console.log('=== AFTER # ===')
  const afterHash = await captureDropdownState(creatorPage, '#')
  console.log(afterHash)
  console.log('=== END ===')

  // Type tag text
  console.log('8. Typing 咖啡...')
  await creatorPage.keyboard.type('咖啡', { delay: 200 })
  await new Promise(r => setTimeout(r, 3000))

  // Full snapshot
  console.log('\n=== DROPDOWN SNAPSHOT ===')
  const snapshot = await captureDropdownState(creatorPage, '咖啡')
  console.log(snapshot)
  console.log('=== END SNAPSHOT ===\n')

  // Screenshot
  await creatorPage.screenshot({ path: '/Volumes/SSD-990-PRO-2TB/RedNote-MCP/scripts/tag-dropdown-screenshot.png' })
  console.log('Screenshot saved.')

  // Keep open
  console.log('9. Browser open for 2 min. Ctrl+C to close.')
  await new Promise(r => setTimeout(r, 120000))
  await browser.close()
}

async function captureDropdownState(page: any, searchText: string): Promise<string> {
  return page.evaluate((text: string) => {
    const results: string[] = []

    // Tippy popups
    const tippyElements = document.querySelectorAll('[data-tippy-root]')
    results.push(`[data-tippy-root] count: ${tippyElements.length}`)
    tippyElements.forEach((el: Element, i: number) => {
      results.push(`  tippy[${i}] outerHTML (1500): ${el.outerHTML.substring(0, 1500)}`)
    })

    // Any element with the search text outside editor
    const allElements = document.querySelectorAll('*')
    let matchCount = 0
    for (const el of allElements) {
      if (matchCount > 10) break
      const elText = el.textContent?.trim() || ''
      if (elText.includes(text) && !el.closest('[contenteditable]')) {
        const rect = (el as HTMLElement).getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && rect.width < 800) {
          results.push(`\nMATCH[${matchCount}]: <${el.tagName}> class="${el.className}"`)
          results.push(`  rect: ${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
          results.push(`  text: "${elText.substring(0, 200)}"`)
          results.push(`  parent: <${el.parentElement?.tagName}> class="${el.parentElement?.className}"`)
          results.push(`  inTippy: ${!!el.closest('[data-tippy-root]')}`)
          const items = el.querySelectorAll('li, [class*="item"], [class*="option"], a, span')
          if (items.length > 0 && items.length < 20) {
            results.push(`  clickable children: ${items.length}`)
            Array.from(items).slice(0, 5).forEach((item, j) => {
              results.push(`    [${j}] <${item.tagName}> class="${item.className}" text="${item.textContent?.substring(0, 80)}"`)
            })
          }
          matchCount++
        }
      }
    }

    if (matchCount === 0) {
      results.push(`\nNo elements containing "${text}" found outside editor!`)
    }

    return results.join('\n')
  }, searchText)
}

main().catch(console.error)
