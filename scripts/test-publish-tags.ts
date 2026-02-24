/**
 * Test: publish a note with tags and verify they activate as topic links.
 * Usage: npx tsx scripts/test-publish-tags.ts
 */
import { chromium } from 'playwright'
import { CookieManager } from '../src/auth/cookieManager'
import { SELECTORS } from '../src/selectors'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  const cookieManager = new CookieManager(COOKIE_PATH)
  const cookies = await cookieManager.loadCookies()

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  })
  if (cookies.length > 0) {
    await context.addCookies(cookies)
  }

  const page = await context.newPage()

  console.log('1. Navigating to main site...')
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 2000))

  console.log('2. SSO to creator center...')
  const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
  const [creatorPage] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 60000 }),
    publishLink.first().click()
  ])
  await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
  await creatorPage.setViewportSize({ width: 1440, height: 900 })
  await new Promise(r => setTimeout(r, 3000))

  // Switch to 上传图文 tab
  console.log('3. Switching to 上传图文 tab...')
  await creatorPage.evaluate(() => {
    const spans = document.querySelectorAll('span.title')
    for (const span of spans) {
      if (span.textContent?.trim() === '上传图文') {
        const tab = span.closest('.creator-tab') || span.parentElement
        if (tab) (tab as HTMLElement).click()
        break
      }
    }
  })
  await new Promise(r => setTimeout(r, 2000))

  // Upload test image
  console.log('4. Uploading test image...')
  const fileInput = creatorPage.locator('input[type="file"]').first()
  await fileInput.setInputFiles('/Volumes/SSD-990-PRO-2TB/RedNote-MCP/scripts/test-image.png')
  try {
    await creatorPage.waitForSelector('input[placeholder*="标题"], input[placeholder*="赞"], [contenteditable="true"]', { timeout: 30000 })
  } catch {}
  await new Promise(r => setTimeout(r, 3000))

  // Type title
  console.log('5. Typing title...')
  const titleInput = creatorPage.locator('input[placeholder*="标题"], input[placeholder*="赞"]').first()
  if (await titleInput.count() > 0) {
    await titleInput.fill('Tag测试 - 请忽略')
  }
  await new Promise(r => setTimeout(r, 500))

  // Click content editor
  console.log('6. Clicking content editor...')
  const editors = creatorPage.locator('[contenteditable="true"]')
  const editorCount = await editors.count()
  const targetIdx = editorCount >= 2 ? 1 : 0
  await editors.nth(targetIdx).click()
  await new Promise(r => setTimeout(r, 500))

  // Type content
  await creatorPage.keyboard.type('这是一个标签测试笔记', { delay: 30 })
  await new Promise(r => setTimeout(r, 500))

  // Now test the tag selection flow
  const tags = ['咖啡', '日常']
  for (const tag of tags) {
    console.log(`7. Typing tag: #${tag}...`)
    await creatorPage.keyboard.type('#', { delay: 80 })
    await new Promise(r => setTimeout(r, 500))
    await creatorPage.keyboard.type(tag, { delay: 80 })
    await new Promise(r => setTimeout(r, 1500))

    // Check for suggestion dropdown
    const suggestionItem = creatorPage.locator(SELECTORS.publish.tagSuggestionItem).first()
    const visible = await suggestionItem.isVisible().catch(() => false)
    console.log(`   Suggestion dropdown visible: ${visible}`)

    if (visible) {
      const itemText = await suggestionItem.textContent()
      console.log(`   First suggestion: "${itemText}"`)
      await suggestionItem.click({ timeout: 3000 })
      console.log(`   ✅ Clicked suggestion for: ${tag}`)
    } else {
      console.log(`   ❌ No dropdown, falling back to Space`)
      await creatorPage.keyboard.press('Space')
    }
    await new Promise(r => setTimeout(r, 500))
  }

  // Take screenshot to verify
  await creatorPage.screenshot({ path: '/Volumes/SSD-990-PRO-2TB/RedNote-MCP/scripts/tag-test-result.png' })
  console.log('\nScreenshot saved to scripts/tag-test-result.png')

  // Check if tags are activated (look for topic nodes in the editor)
  const tagCheck = await creatorPage.evaluate(() => {
    const editor = document.querySelector('[contenteditable="true"]')
    if (!editor) return 'No editor found'
    // Activated tags typically become special nodes (not plain text)
    const topicNodes = editor.querySelectorAll('[data-type="topic"], .topic-tag, a[href*="topic"], [data-hashtag]')
    const allText = editor.innerHTML
    return {
      topicNodeCount: topicNodes.length,
      editorHTML: allText.substring(0, 1000),
    }
  })
  console.log('\n=== TAG ACTIVATION CHECK ===')
  console.log(JSON.stringify(tagCheck, null, 2))
  console.log('=== END ===')

  // DON'T publish — just keep open for inspection
  console.log('\nBrowser open for 2 min. Ctrl+C to close. (NOT publishing)')
  await new Promise(r => setTimeout(r, 120000))
  await browser.close()
}

main().catch(console.error)
