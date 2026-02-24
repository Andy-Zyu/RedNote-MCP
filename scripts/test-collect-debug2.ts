import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  await context.addCookies(JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8')))
  const page = await context.newPage()

  // Use our own note to test (safe to collect/uncollect)
  await page.goto('https://www.xiaohongshu.com/explore/699c13180000000015021785', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 4000))

  // Check SVG icon state before click
  const beforeState = await page.evaluate(`
    (() => {
      var cw = document.querySelector('.interact-container .collect-wrapper');
      if (!cw) return 'NOT FOUND';
      var svg = cw.querySelector('svg use');
      var svgHref = svg ? (svg.getAttribute('xlink:href') || svg.getAttribute('href')) : null;
      return {
        className: cw.className,
        svgHref: svgHref,
        fullHtml: cw.outerHTML.substring(0, 1000)
      };
    })()
  `)
  console.log('=== BEFORE CLICK ===')
  console.log(JSON.stringify(beforeState, null, 2))

  // Click collect
  const collectBtn = page.locator('.interact-container .collect-wrapper').first()
  await collectBtn.click()
  await new Promise(r => setTimeout(r, 3000))

  // Check if a collect board/folder popup appeared
  const popupCheck = await page.evaluate(`
    (() => {
      var popup = document.querySelector('[class*="board"], [class*="folder"], [class*="collect-popup"], [class*="modal"], [class*="dialog"]');
      if (popup) return { found: true, class: popup.className, html: popup.outerHTML.substring(0, 1000) };
      return { found: false };
    })()
  `)
  console.log('=== POPUP CHECK ===')
  console.log(JSON.stringify(popupCheck, null, 2))

  // Check SVG icon state after click
  const afterState = await page.evaluate(`
    (() => {
      var cw = document.querySelector('.interact-container .collect-wrapper');
      if (!cw) return 'NOT FOUND';
      var svg = cw.querySelector('svg use');
      var svgHref = svg ? (svg.getAttribute('xlink:href') || svg.getAttribute('href')) : null;
      return {
        className: cw.className,
        svgHref: svgHref,
        fullHtml: cw.outerHTML.substring(0, 1000)
      };
    })()
  `)
  console.log('=== AFTER CLICK ===')
  console.log(JSON.stringify(afterState, null, 2))

  // Take screenshot to see what happened
  await page.screenshot({ path: 'scripts/collect-debug.png' })
  console.log('Screenshot saved to scripts/collect-debug.png')

  await new Promise(r => setTimeout(r, 5000))
  await browser.close()
}
main().catch(console.error)
