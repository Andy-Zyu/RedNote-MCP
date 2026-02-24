/**
 * Test script v3: Verify MyNotesInterceptor works end-to-end.
 * Run with: npx tsx scripts/test-my-notes.ts
 */
import { chromium, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MyNotesInterceptor } from '../src/interceptors/myNotesInterceptor'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function loadCookies(context: any) {
  const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
  console.log(`Loaded ${cookies.length} cookies`)
  await context.addCookies(cookies)
}

async function ssoToCreator(page: Page): Promise<Page> {
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  console.log('Main site loaded')

  const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
  const [creatorPage] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 60000 }),
    publishLink.first().click()
  ])
  await creatorPage.waitForLoadState('domcontentloaded', { timeout: 60000 })
  console.log(`SSO complete: ${creatorPage.url()}`)
  return creatorPage
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  await loadCookies(context)

  const page = await context.newPage()
  const creatorPage = await ssoToCreator(page)

  // Navigate to content analytics
  await creatorPage.goto('https://creator.xiaohongshu.com/statistics/data-analysis', {
    waitUntil: 'domcontentloaded',
    timeout: 15000
  })
  await new Promise(r => setTimeout(r, 3000))

  // Use the actual interceptor
  console.log('\n--- Running MyNotesInterceptor ---')
  const interceptor = new MyNotesInterceptor(creatorPage)
  const result = await interceptor.intercept(async () => {
    await creatorPage.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
  })

  console.log(`\nSource: ${result.source}`)
  console.log(`Success: ${result.success}`)
  if (result.data) {
    console.log(`Total: ${result.data.totalCount}`)
    console.log('\nNotes:')
    for (const note of result.data.notes) {
      console.log(`  [${note.noteId}] ${note.title || '(无标题)'}`)
      console.log(`    URL: ${note.url}`)
      console.log(`    Published: ${note.publishTime}`)
      console.log(`    Likes: ${note.likes} | Collects: ${note.collects} | Comments: ${note.comments}`)
      console.log(`    Cover: ${note.coverUrl.slice(0, 80)}...`)
      console.log()
    }
  }

  await browser.close()
  console.log('Done')
}

main().catch(console.error)
