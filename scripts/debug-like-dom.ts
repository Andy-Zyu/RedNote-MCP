/**
 * Debug script: inspect the like-wrapper DOM in logged-in browser
 * Run: npx ts-node scripts/debug-like-dom.ts <note_url>
 */
import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const url = process.argv[2]
  if (!url) {
    console.error('Usage: npx ts-node scripts/debug-like-dom.ts <note_url>')
    process.exit(1)
  }

  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)

    // Check like-wrapper DOM
    const likeInfo = await page.evaluate(() => {
      const wrapper = document.querySelector('.interact-container .like-wrapper')
      if (!wrapper) return { found: false }

      const use = wrapper.querySelector('svg use')
      const lottie = wrapper.querySelector('.like-lottie')

      return {
        found: true,
        classList: Array.from(wrapper.classList),
        svgHref: use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : null,
        hasLottie: !!lottie,
        lottieStyle: lottie?.getAttribute('style') || null,
        outerHTML: wrapper.outerHTML.substring(0, 1000),
      }
    })

    console.log('\n=== LIKE WRAPPER DOM INFO ===')
    console.log(JSON.stringify(likeInfo, null, 2))

    // Also check collect-wrapper for comparison
    const collectInfo = await page.evaluate(() => {
      const wrapper = document.querySelector('.interact-container .collect-wrapper')
      if (!wrapper) return { found: false }

      const use = wrapper.querySelector('svg use')
      return {
        found: true,
        classList: Array.from(wrapper.classList),
        svgHref: use ? (use.getAttribute('xlink:href') || use.getAttribute('href')) : null,
      }
    })

    console.log('\n=== COLLECT WRAPPER DOM INFO ===')
    console.log(JSON.stringify(collectInfo, null, 2))

  } finally {
    await lease.release()
    await bm.shutdown()
  }
}

main().catch(console.error)
