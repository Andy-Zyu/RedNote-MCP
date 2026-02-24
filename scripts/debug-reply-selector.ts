/**
 * Debug: specifically check reply button selector
 */
import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const url = process.argv[2] || "https://www.xiaohongshu.com/explore/69708ec2000000002200932d?xsec_token=AB3UVCFOJ0BsJdUvVO_4zhxhH6rsBEl81YytDsR8sRodU%3D&xsec_source=pc_search"

  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(4000)

    const info = await page.evaluate(() => {
      // Test various reply selectors
      const selectors: Record<string, number> = {
        '.reply.icon-container': document.querySelectorAll('.reply.icon-container').length,
        '.reply': document.querySelectorAll('.reply').length,
        '.icon-container': document.querySelectorAll('.icon-container').length,
        '.comment-item .reply': document.querySelectorAll('.comment-item .reply').length,
        '.interactions .reply': document.querySelectorAll('.interactions .reply').length,
      }

      // Get the actual reply element HTML
      const replyEls = document.querySelectorAll('.comment-item .interactions')
      const replyDetails: string[] = []
      replyEls.forEach((el, i) => {
        if (i < 3) replyDetails.push(el.outerHTML.substring(0, 500))
      })

      // Check author selector
      const authorSelectors: Record<string, number> = {
        '.author a.name': document.querySelectorAll('.author a.name').length,
        '.author-wrapper .name': document.querySelectorAll('.author-wrapper .name').length,
        '.comment-item .name': document.querySelectorAll('.comment-item .name').length,
        'a.name': document.querySelectorAll('a.name').length,
      }

      // Check the main comment input for posting new comments
      const mainInput = document.querySelector('#content-textarea')
      const mainInputParent = mainInput?.parentElement

      return { selectors, replyDetails, authorSelectors, mainInputParentHTML: mainInputParent?.outerHTML?.substring(0, 300) }
    })

    console.log('\n=== REPLY SELECTORS ===')
    console.log(JSON.stringify(info.selectors, null, 2))

    console.log('\n=== AUTHOR SELECTORS ===')
    console.log(JSON.stringify(info.authorSelectors, null, 2))

    console.log('\n=== REPLY ELEMENT HTML (first 3) ===')
    info.replyDetails.forEach((html, i) => console.log(`\n[${i}]`, html))

    console.log('\n=== MAIN INPUT PARENT ===')
    console.log(info.mainInputParentHTML)

  } finally {
    await lease.release()
    await bm.shutdown()
  }
}

main().catch(console.error)
