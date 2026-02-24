/**
 * Debug script: inspect comment area DOM structure
 */
import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: npx ts-node scripts/debug-comment-dom.ts <note_url>')
    process.exit(1)
  }

  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(4000)

    // Check what selectors exist for comments
    const domInfo = await page.evaluate(() => {
      const results: Record<string, any> = {}

      // Check old selectors
      results.commentItem = document.querySelectorAll('.comment-item').length
      results.commentItemRole = document.querySelectorAll('[role="listitem"]').length

      // Look for comment containers
      results.commentSection = document.querySelector('.comments-container')?.outerHTML?.substring(0, 200) || null
      results.noteScroller = !!document.querySelector('.note-scroller')

      // Find all elements with "comment" in class name
      const allElements = document.querySelectorAll('[class*="comment"]')
      results.commentClasses = Array.from(new Set(
        Array.from(allElements).map(el => el.className).filter(c => typeof c === 'string')
      )).slice(0, 20)

      // Check for the comment input area
      results.contentTextarea = !!document.querySelector('#content-textarea')
      results.commentInput = !!document.querySelector('[contenteditable="true"]')
      results.submitBtn = !!document.querySelector('button.btn.submit')

      // Get first comment's HTML structure
      const firstComment = document.querySelector('[class*="comment"]')
      if (firstComment) {
        results.firstCommentHTML = firstComment.outerHTML.substring(0, 500)
      }

      // Look for parent containers of comments
      const commentContainers = document.querySelectorAll('.parent-comment, .comment-inner, .comment-item-inner')
      results.parentComment = commentContainers.length

      // Try to find the actual comment list
      const lists = document.querySelectorAll('.list-container, .comment-list, [class*="list"]')
      results.listClasses = Array.from(new Set(
        Array.from(lists).map(el => el.className).filter(c => typeof c === 'string')
      )).slice(0, 10)

      return results
    })

    console.log('\n=== COMMENT DOM INFO ===')
    console.log(JSON.stringify(domInfo, null, 2))

    // Get a broader view - find the comment section structure
    const commentStructure = await page.evaluate(() => {
      // Find the comments section by looking for author names
      const authorLinks = document.querySelectorAll('a.name, a[class*="author"], .author-wrapper a')
      const authors: string[] = []
      authorLinks.forEach(a => {
        const text = a.textContent?.trim()
        if (text) authors.push(text)
      })

      // Find reply buttons
      const replyBtns = document.querySelectorAll('[class*="reply"], button:has-text("回复")')

      return {
        authorCount: authors.length,
        authors: authors.slice(0, 5),
        replyBtnCount: replyBtns.length,
        replyBtnClasses: Array.from(replyBtns).map(b => b.className).slice(0, 5),
      }
    })

    console.log('\n=== COMMENT STRUCTURE ===')
    console.log(JSON.stringify(commentStructure, null, 2))

  } finally {
    await lease.release()
    await bm.shutdown()
  }
}

main().catch(console.error)
