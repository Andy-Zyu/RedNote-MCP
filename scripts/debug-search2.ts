import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  const keyword = '咖啡推荐'

  console.log('=== Navigating to search page ===')
  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )

  // Wait for page to settle
  await new Promise(r => setTimeout(r, 5000))

  // Check page URL (might have been redirected)
  console.log(`\nCurrent URL: ${page.url()}`)

  // Check page title
  const title = await page.title()
  console.log(`Page title: ${title}`)

  // Take a screenshot
  await page.screenshot({ path: '/tmp/search-debug.png', fullPage: true })
  console.log('\nScreenshot saved to /tmp/search-debug.png')

  // Check if there's a login wall or captcha
  const bodyText = await page.evaluate(() => {
    return document.body?.innerText?.substring(0, 2000) || ''
  })
  console.log(`\n=== Page body text (first 2000 chars) ===\n${bodyText}`)

  // Check for any feed containers
  const feedInfo = await page.evaluate(() => {
    const containers = [
      '.feeds-container',
      '.search-result-container',
      '#search-result',
      '[class*="feed"]',
      '[class*="search"]',
      '[class*="note"]',
      '.note-item',
      'section',
    ]
    const results: Record<string, number> = {}
    for (const sel of containers) {
      results[sel] = document.querySelectorAll(sel).length
    }
    return results
  })
  console.log('\n=== Selector counts ===')
  console.log(JSON.stringify(feedInfo, null, 2))

  await lease.release()
  await bm.shutdown()
}

main().catch(console.error)
