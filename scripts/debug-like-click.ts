/**
 * Debug script: click like and observe DOM changes
 */
import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: npx ts-node scripts/debug-like-click.ts <note_url>')
    process.exit(1)
  }

  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    // Before click
    const before = await page.evaluate(() => {
      const wrapper = document.querySelector('.interact-container .like-wrapper')
      if (!wrapper) return null
      const use = wrapper.querySelector('svg use')
      return {
        classList: Array.from(wrapper.classList),
        svgHref: use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : null,
        outerHTML: wrapper.outerHTML.substring(0, 800),
      }
    })
    console.log('\n=== BEFORE CLICK ===')
    console.log(JSON.stringify(before, null, 2))

    // Click the like button
    const likeWrapper = page.locator('.interact-container .like-wrapper').first()
    await likeWrapper.click()
    await page.waitForTimeout(2000)

    // After click
    const after = await page.evaluate(() => {
      const wrapper = document.querySelector('.interact-container .like-wrapper')
      if (!wrapper) return null
      const use = wrapper.querySelector('svg use')
      return {
        classList: Array.from(wrapper.classList),
        svgHref: use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : null,
        outerHTML: wrapper.outerHTML.substring(0, 800),
      }
    })
    console.log('\n=== AFTER CLICK ===')
    console.log(JSON.stringify(after, null, 2))

    // Click again to undo (so we don't leave a stale like)
    await likeWrapper.click()
    await page.waitForTimeout(2000)

    const afterUndo = await page.evaluate(() => {
      const wrapper = document.querySelector('.interact-container .like-wrapper')
      if (!wrapper) return null
      const use = wrapper.querySelector('svg use')
      return {
        classList: Array.from(wrapper.classList),
        svgHref: use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : null,
        outerHTML: wrapper.outerHTML.substring(0, 800),
      }
    })
    console.log('\n=== AFTER UNDO (click again) ===')
    console.log(JSON.stringify(afterUndo, null, 2))

  } finally {
    await lease.release()
    await bm.shutdown()
  }
}

main().catch(console.error)
