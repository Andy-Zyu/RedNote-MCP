/**
 * Debug script: inspect comment item internal structure
 */
import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: npx ts-node scripts/debug-comment-item.ts <note_url>')
    process.exit(1)
  }

  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(4000)

    // Get detailed structure of first 2 comment items
    const commentDetails = await page.evaluate(() => {
      const items = document.querySelectorAll('.comment-item')
      const results: any[] = []

      for (let i = 0; i < Math.min(2, items.length); i++) {
        const item = items[i]
        const inner = item.querySelector('.comment-inner-container')

        // Find author
        const authorEl = item.querySelector('.author-wrapper .name, .author-wrapper a, a.name')
        // Find content
        const contentEl = item.querySelector('.content, .note-text, [class*="content"]')
        // Find reply button
        const replyEl = item.querySelector('.reply-btn, [class*="reply"], .comment-menu span')

        results.push({
          id: item.id,
          innerHTML: item.innerHTML.substring(0, 1500),
          author: authorEl?.textContent?.trim() || null,
          authorSelector: authorEl?.className || null,
          content: contentEl?.textContent?.trim()?.substring(0, 100) || null,
          contentSelector: contentEl?.className || null,
          replyText: replyEl?.textContent?.trim() || null,
          replySelector: replyEl?.className || null,
          // List all child class names
          childClasses: Array.from(item.querySelectorAll('*')).map(el => el.className).filter(c => typeof c === 'string' && c.length > 0).slice(0, 30),
        })
      }

      return results
    })

    console.log('\n=== COMMENT ITEM DETAILS ===')
    for (const detail of commentDetails) {
      console.log('\n--- Comment:', detail.id, '---')
      console.log('Author:', detail.author, '| selector:', detail.authorSelector)
      console.log('Content:', detail.content, '| selector:', detail.contentSelector)
      console.log('Reply:', detail.replyText, '| selector:', detail.replySelector)
      console.log('Child classes:', detail.childClasses)
    }

    // Check the main comment input area (for posting new comments)
    const inputInfo = await page.evaluate(() => {
      // Look for the main comment input
      const editables = document.querySelectorAll('[contenteditable]')
      const inputs: any[] = []
      editables.forEach(el => {
        inputs.push({
          tag: el.tagName,
          className: el.className,
          id: el.id,
          placeholder: el.getAttribute('placeholder') || el.textContent?.trim()?.substring(0, 50),
          contenteditable: el.getAttribute('contenteditable'),
        })
      })

      // Look for submit buttons
      const buttons = document.querySelectorAll('button')
      const submitBtns: any[] = []
      buttons.forEach(btn => {
        const text = btn.textContent?.trim()
        if (text && (text.includes('发送') || text.includes('提交') || text.includes('评论'))) {
          submitBtns.push({
            text,
            className: btn.className,
            disabled: btn.disabled,
          })
        }
      })

      return { editables: inputs, submitButtons: submitBtns }
    })

    console.log('\n=== INPUT AREA ===')
    console.log(JSON.stringify(inputInfo, null, 2))

    // Check selectors from selectors/index.ts
    const selectorCheck = await page.evaluate(() => {
      return {
        commentItem: document.querySelectorAll('.comment-item').length,
        commentAuthor_name: document.querySelectorAll('.comment-item .name').length,
        commentAuthor_authorWrapper: document.querySelectorAll('.comment-item .author-wrapper').length,
        commentText_content: document.querySelectorAll('.comment-item .content').length,
        commentText_noteText: document.querySelectorAll('.comment-item .note-text').length,
        replyButton: document.querySelectorAll('.comment-item .reply-btn').length,
        replyInput: document.querySelectorAll('#content-textarea').length,
        submitReply: document.querySelectorAll('button.btn.submit').length,
      }
    })

    console.log('\n=== SELECTOR CHECK ===')
    console.log(JSON.stringify(selectorCheck, null, 2))

  } finally {
    await lease.release()
    await bm.shutdown()
  }
}

main().catch(console.error)
