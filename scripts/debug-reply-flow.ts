/**
 * Debug: test reply_comment flow step by step in headless mode
 */
import { BrowserManager } from '../src/browser/browserManager'
import { SELECTORS } from '../src/selectors'

async function main() {
  const url = "https://www.xiaohongshu.com/explore/69708ec2000000002200932d?xsec_token=AB3UVCFOJ0BsJdUvVO_4zhxhH6rsBEl81YytDsR8sRodU%3D&xsec_source=pc_search"

  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  try {
    console.log('1. Navigating...')
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

    console.log('2. Waiting for comment items...')
    try {
      await page.waitForSelector(SELECTORS.replyComment.commentItem, { timeout: 15000 })
      console.log('   ✅ Comment items found')
    } catch (e) {
      console.log('   ❌ Timeout waiting for .comment-item')
      // Check what's on the page
      const pageState = await page.evaluate(() => {
        return {
          url: window.location.href,
          hasNoteScroller: !!document.querySelector('.note-scroller'),
          hasCommentsContainer: !!document.querySelector('.comments-container'),
          commentItemCount: document.querySelectorAll('.comment-item').length,
          bodyText: document.body.innerText.substring(0, 500),
        }
      })
      console.log('   Page state:', JSON.stringify(pageState, null, 2))

      // Try waiting longer
      console.log('3. Waiting 10 more seconds...')
      await page.waitForTimeout(10000)
      const afterWait = await page.evaluate(() => ({
        commentItemCount: document.querySelectorAll('.comment-item').length,
        hasCommentsContainer: !!document.querySelector('.comments-container'),
      }))
      console.log('   After extra wait:', JSON.stringify(afterWait))
      return
    }

    const count = await page.locator(SELECTORS.replyComment.commentItem).count()
    console.log(`   Found ${count} comment items`)

    // Try to find target comment
    console.log('3. Looking for "星星同学录" comment...')
    const commentItems = page.locator(SELECTORS.replyComment.commentItem)
    for (let i = 0; i < count; i++) {
      const item = commentItems.nth(i)
      const author = await item.locator(SELECTORS.replyComment.commentAuthor).first().textContent().catch(() => '')
      const content = await item.locator(SELECTORS.replyComment.commentText).first().textContent().catch(() => '')
      console.log(`   [${i}] author="${author?.trim()}" content="${content?.trim()?.substring(0, 50)}"`)
    }

    // Test clicking reply on first comment
    console.log('4. Clicking reply on first comment...')
    const firstReply = commentItems.first().locator(SELECTORS.replyComment.replyButton).first()
    await firstReply.click()
    await page.waitForTimeout(1000)

    // Check if input appeared
    const inputVisible = await page.locator(SELECTORS.replyComment.replyInput).isVisible().catch(() => false)
    console.log(`   Reply input visible: ${inputVisible}`)

    if (inputVisible) {
      const placeholder = await page.evaluate(() => {
        const el = document.querySelector('#content-textarea')
        return el?.getAttribute('placeholder') || el?.textContent?.trim() || 'no placeholder'
      })
      console.log(`   Input placeholder: "${placeholder}"`)
    }

  } finally {
    await lease.release()
    await bm.shutdown()
  }
}

main().catch(console.error)
