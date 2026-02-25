import { BrowserManager } from '../src/browser/browserManager'
import { Response } from 'playwright'

async function main() {
  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  const keyword = '咖啡推荐'

  // Log ALL API responses
  page.on('response', async (response: Response) => {
    const url = response.url()
    if (url.includes('/api/')) {
      const method = response.request().method()
      const status = response.status()
      const shortUrl = url.substring(0, 150)

      let postKeyword = ''
      const postData = response.request().postData()
      if (postData) {
        try {
          const body = JSON.parse(postData)
          postKeyword = body.keyword || ''
        } catch {}
      }

      if (url.includes('search') || url.includes('homefeed') || url.includes('feed')) {
        console.log(`[${method}] ${status} ${shortUrl}`)
        if (postKeyword) console.log(`  keyword in body: "${postKeyword}"`)

        try {
          const json = await response.json()
          const items = json?.data?.items || json?.data?.notes || []
          console.log(`  items: ${items.length}`)
          if (items.length > 0) {
            const nc = items[0].note_card || items[0]
            console.log(`  first: "${nc.display_title || nc.title || '(none)'}"`)
          }
        } catch {}
      }
    }
  })

  console.log(`Navigating to search: "${keyword}"`)
  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )

  // Wait longer
  await new Promise(r => setTimeout(r, 8000))

  // Screenshot
  await page.screenshot({ path: '/tmp/search-debug-loggedin.png', fullPage: true })
  console.log('\nScreenshot: /tmp/search-debug-loggedin.png')

  // Check what's actually in the DOM
  const html = await page.evaluate(() => {
    // Get all elements with class containing 'note' or 'feed' or 'search'
    const all = document.querySelectorAll('[class*="note"], [class*="feed"], [class*="search-result"]')
    return Array.from(all).slice(0, 20).map(el => ({
      tag: el.tagName,
      class: el.className.toString().substring(0, 100),
      childCount: el.children.length,
      text: (el.textContent || '').substring(0, 80)
    }))
  })
  console.log('\n=== DOM elements with note/feed/search-result classes ===')
  html.forEach((el, i) => console.log(`${i}: <${el.tag} class="${el.class}"> children=${el.childCount} text="${el.text}"`))

  await lease.release()
  await bm.shutdown()
}

main().catch(console.error)
