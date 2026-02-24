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

  // Dump all follow-related elements
  const followInfo = await page.evaluate(`
    (() => {
      var containers = document.querySelectorAll('.note-detail-follow-btn');
      var results = [];
      containers.forEach(function(c, i) {
        var btn = c.querySelector('button');
        var text = c.querySelector('.reds-button-new-text');
        results.push({
          index: i,
          containerClass: c.className,
          containerVisible: c.offsetParent !== null,
          containerDisplay: window.getComputedStyle(c).display,
          containerVisibility: window.getComputedStyle(c).visibility,
          containerOpacity: window.getComputedStyle(c).opacity,
          containerWidth: c.offsetWidth,
          containerHeight: c.offsetHeight,
          btnClass: btn ? btn.className : null,
          btnVisible: btn ? btn.offsetParent !== null : null,
          btnDisplay: btn ? window.getComputedStyle(btn).display : null,
          text: text ? text.textContent : null,
          html: c.outerHTML.substring(0, 500)
        });
      });
      return results;
    })()
  `)
  console.log('=== FOLLOW CONTAINERS ===')
  console.log(JSON.stringify(followInfo, null, 2))

  // Also check the author area
  const authorInfo = await page.evaluate(`
    (() => {
      var author = document.querySelector('.author-container') || document.querySelector('.author-wrapper');
      if (!author) return 'NOT FOUND';
      return author.outerHTML.substring(0, 2000);
    })()
  `)
  console.log('=== AUTHOR AREA ===')
  console.log(authorInfo)

  await browser.close()
}
main().catch(console.error)
