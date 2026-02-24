import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  await context.addCookies(JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8')))
  const page = await context.newPage()

  // Step 1: Go to main explore page first (more natural)
  console.log('Step 1: Navigate to explore page...')
  await page.goto('https://www.xiaohongshu.com/explore', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise((r) => setTimeout(r, 3000))

  // Dismiss any alert dialogs
  const dismissBtn = page.locator('button:has-text("我知道了")').first()
  if (await dismissBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await dismissBtn.click()
    console.log('Dismissed alert dialog')
    await new Promise((r) => setTimeout(r, 1000))
  }

  // Step 2: Click on the first note to open it
  console.log('Step 2: Click on a note...')
  const noteItem = page.locator('.note-item a.cover').first()
  try {
    await noteItem.waitFor({ state: 'visible', timeout: 10000 })
    await noteItem.click()
    await new Promise((r) => setTimeout(r, 3000))
  } catch {
    console.log('Could not find note items on explore page, trying direct URL...')
    await page.goto('https://www.xiaohongshu.com/explore/699c13180000000015021785', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await new Promise((r) => setTimeout(r, 5000))
  }

  // Step 3: Now look for the note detail and follow button
  console.log('Step 3: Analyzing page DOM...')

  const result = await page.evaluate(() => {
    const findings: Record<string, unknown> = {}

    // Check current URL
    findings.currentUrl = window.location.href

    // Check if captcha is present
    const captcha = document.querySelector('[id^="captcha"]')
    findings.hasCaptcha = !!captcha

    // Look for note container
    const noteContainer = document.querySelector('#noteContainer')
    findings.hasNoteContainer = !!noteContainer

    if (noteContainer) {
      // Get the author/info area specifically
      const infoArea = noteContainer.querySelector('.author-container, .info, .note-top, [class*="author"]')
      if (infoArea) {
        findings.infoArea = (infoArea as HTMLElement).outerHTML.substring(0, 2000)
      }

      // Dump the entire right panel (note-scroller area)
      const noteScroller = noteContainer.querySelector('.note-scroller')
      if (noteScroller) {
        // Get just the top portion (author + follow area)
        findings.noteScrollerTop = (noteScroller as HTMLElement).innerHTML.substring(0, 4000)
      }
    }

    // Search ALL elements for follow text
    const allEls = document.querySelectorAll('*')
    const followMatches: string[] = []
    allEls.forEach((el) => {
      const text = (el as HTMLElement).textContent?.trim() || ''
      const className = el.className?.toString() || ''
      if (
        (text.includes('关注') && text.length < 20) ||
        className.includes('follow')
      ) {
        const tag = el.tagName
        if (tag !== 'HTML' && tag !== 'BODY' && tag !== 'HEAD') {
          followMatches.push(
            `<${tag} class="${className.substring(0, 200)}" text="${text.substring(0, 50)}">`
          )
        }
      }
    })
    findings.followMatches = [...new Set(followMatches)].slice(0, 20)

    // Dump #app first-level structure
    const app = document.querySelector('#app')
    if (app) {
      findings.appChildren = Array.from(app.children).map(
        (c) =>
          `<${c.tagName} class="${c.className?.toString().substring(0, 100)}" id="${c.id}">`
      )
    }

    return findings
  })

  console.log(JSON.stringify(result, null, 2))

  await browser.close()
}
main().catch(console.error)
