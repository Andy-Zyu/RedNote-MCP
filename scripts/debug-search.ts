import { BrowserManager } from '../src/browser/browserManager'
import { Page, Response } from 'playwright'

async function main() {
  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  const keyword = '咖啡推荐'

  // Log ALL responses to see what APIs fire during search
  page.on('response', async (response: Response) => {
    const url = response.url()
    if (url.includes('/api/sns/web/v1/search') || url.includes('/api/sns/web/v1/note') || url.includes('homefeed')) {
      const method = response.request().method()
      const postData = response.request().postData()
      let bodyKeyword = ''
      if (postData) {
        try {
          const body = JSON.parse(postData)
          bodyKeyword = body.keyword || ''
        } catch {}
      }
      console.log(`\n[${method}] ${response.status()} ${url.substring(0, 120)}`)
      if (postData) console.log(`  POST body keyword: "${bodyKeyword}"`)
      if (!postData) console.log(`  (no POST body)`)

      // Try to read response
      try {
        const json = await response.json()
        const data = json?.data
        const items = data?.items || data?.notes || []
        if (items.length > 0) {
          console.log(`  Items count: ${items.length}`)
          const first = items[0]
          const nc = first.note_card || first
          console.log(`  First item title: "${nc.display_title || nc.title || '(none)'}"`)
        }
      } catch {}
    }
  })

  console.log(`\n=== Navigating to search page for: "${keyword}" ===\n`)
  await page.goto(
    `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(keyword)}`,
    { waitUntil: 'domcontentloaded', timeout: 30000 }
  )

  // Wait a bit for all API calls to complete
  console.log('\n=== Waiting 10s for API responses ===\n')
  await new Promise(r => setTimeout(r, 10000))

  // Also check what DOM shows
  const domTitles = await page.evaluate(() => {
    const items = document.querySelectorAll('.feeds-container .note-item')
    return Array.from(items).slice(0, 5).map(item => {
      const titleEl = item.querySelector('.title span, .note-item-title, .title')
      return titleEl?.textContent?.trim() || '(no title)'
    })
  })
  console.log('\n=== DOM titles ===')
  domTitles.forEach((t, i) => console.log(`  ${i + 1}. ${t}`))

  await lease.release()
  await bm.shutdown()
}

main().catch(console.error)
