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

  await page.goto('https://www.xiaohongshu.com/explore/68a1d4e9000000001d03b874?xsec_token=ABqycUuMqTb1_E1717ChRGBb9BRoPbTqpVyD9yy4nct48%3D&xsec_source=pc_search', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 4000))

  // Dump the engage bar HTML
  const engageHtml = await page.evaluate(`
    (() => {
      var bar = document.querySelector('.interact-container');
      if (!bar) return 'interact-container NOT FOUND';
      return bar.outerHTML.substring(0, 3000);
    })()
  `)
  console.log('=== ENGAGE BAR ===')
  console.log(engageHtml)

  // Check collect wrapper specifically
  const collectInfo = await page.evaluate(`
    (() => {
      var cw = document.querySelector('.interact-container .collect-wrapper');
      if (!cw) return 'collect-wrapper NOT FOUND';
      return {
        className: cw.className,
        classList: Array.from(cw.classList),
        innerHTML: cw.innerHTML.substring(0, 500),
        hasCollectActive: cw.classList.contains('collect-active')
      };
    })()
  `)
  console.log('=== COLLECT WRAPPER ===')
  console.log(JSON.stringify(collectInfo, null, 2))

  // Try clicking collect and check state change
  const collectBtn = page.locator('.interact-container .collect-wrapper').first()
  await collectBtn.click()
  await new Promise(r => setTimeout(r, 2000))

  const afterClick = await page.evaluate(`
    (() => {
      var cw = document.querySelector('.interact-container .collect-wrapper');
      if (!cw) return 'NOT FOUND after click';
      return {
        className: cw.className,
        classList: Array.from(cw.classList),
        hasCollectActive: cw.classList.contains('collect-active')
      };
    })()
  `)
  console.log('=== AFTER CLICK ===')
  console.log(JSON.stringify(afterClick, null, 2))

  await browser.close()
}
main().catch(console.error)
