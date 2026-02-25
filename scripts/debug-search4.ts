import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  // Capture console messages
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`[${msg.type()}] ${msg.text().substring(0, 200)}`)
    }
  })

  // Capture page errors
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message.substring(0, 200)}`)
  })

  const keyword = '咖啡推荐'

  // Try navigating to main page first, then search
  console.log('=== Step 1: Navigate to main page ===')
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'networkidle', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  // Check if logged in
  const mainPageText = await page.evaluate(() => document.body?.innerText?.substring(0, 300) || '')
  console.log(`Main page: ${mainPageText.substring(0, 200)}`)

  console.log('\n=== Step 2: Navigate to search ===')
  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`,
    { waitUntil: 'networkidle', timeout: 30000 }
  )
  await new Promise(r => setTimeout(r, 5000))

  // Check URL
  console.log(`URL: ${page.url()}`)

  // Check for any content
  const searchContent = await page.evaluate(() => {
    return {
      bodyLength: document.body?.innerText?.length || 0,
      allDivCount: document.querySelectorAll('div').length,
      allACount: document.querySelectorAll('a').length,
      allImgCount: document.querySelectorAll('img').length,
      // Check for common anti-bot indicators
      hasVerify: !!document.querySelector('[class*="verify"], [class*="captcha"], [id*="captcha"]'),
      // Get all unique class names containing interesting keywords
      interestingClasses: Array.from(new Set(
        Array.from(document.querySelectorAll('*'))
          .map(el => el.className?.toString() || '')
          .filter(c => c && (c.includes('note') || c.includes('feed') || c.includes('result') || c.includes('card') || c.includes('container')))
      )).slice(0, 20)
    }
  })
  console.log('\n=== Page analysis ===')
  console.log(JSON.stringify(searchContent, null, 2))

  await page.screenshot({ path: '/tmp/search-debug4.png', fullPage: true })
  console.log('\nScreenshot: /tmp/search-debug4.png')

  await lease.release()
  await bm.shutdown()
}

main().catch(console.error)
