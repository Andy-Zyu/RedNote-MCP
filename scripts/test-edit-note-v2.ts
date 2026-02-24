/**
 * Test script: Explore edit/delete via content analytics page and API.
 * Run with: npx tsx scripts/test-edit-note-v2.ts
 */
import { chromium, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const TEST_NOTE_ID = '699c13180000000015021785'

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

  // === Test 1: Content analytics page — look for edit/delete entry points ===
  console.log('\n\n========== TEST 1: Content analytics page ==========')
  await creatorPage.goto('https://creator.xiaohongshu.com/statistics/data-analysis', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 5000))

  // Look for any clickable elements per note row
  const rowInfo = await creatorPage.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr')
    return Array.from(rows).slice(0, 3).map((row, i) => {
      const cells = row.querySelectorAll('td')
      const links = row.querySelectorAll('a')
      const buttons = row.querySelectorAll('button, [role="button"], .btn, [class*="btn"]')
      const clickables = row.querySelectorAll('[onclick], [class*="click"], [class*="action"], [class*="operate"], [class*="more"]')
      const spans = row.querySelectorAll('span')

      return {
        index: i,
        cellCount: cells.length,
        text: row.textContent?.slice(0, 200),
        links: Array.from(links).map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent?.trim(),
          class: a.className
        })),
        buttons: Array.from(buttons).map(b => ({
          text: b.textContent?.trim(),
          class: b.className,
          tag: b.tagName
        })),
        clickables: Array.from(clickables).map(c => ({
          text: c.textContent?.trim(),
          class: c.className,
          tag: c.tagName
        })),
        spans: Array.from(spans).map(s => ({
          text: s.textContent?.trim(),
          class: s.className
        })).filter(s => s.text && s.text.length < 20),
      }
    })
  })
  console.log('Row info:')
  console.log(JSON.stringify(rowInfo, null, 2))

  // === Test 2: Check for "详情数据" or any action buttons ===
  console.log('\n\n========== TEST 2: Look for detail/action links ==========')
  const detailSpans = await creatorPage.locator('span:has-text("详情数据")').count()
  console.log(`Found ${detailSpans} "详情数据" spans`)

  const editSpans = await creatorPage.locator('span:has-text("编辑")').count()
  console.log(`Found ${editSpans} "编辑" spans`)

  const deleteSpans = await creatorPage.locator('span:has-text("删除")').count()
  console.log(`Found ${deleteSpans} "删除" spans`)

  const moreButtons = await creatorPage.locator('[class*="more"], [class*="More"], [class*="action"], [class*="Action"], [class*="operate"]').count()
  console.log(`Found ${moreButtons} more/action/operate elements`)

  // === Test 3: Click on "详情数据" for first note and see what happens ===
  if (detailSpans > 0) {
    console.log('\n\n========== TEST 3: Click 详情数据 ==========')
    const detailLink = creatorPage.locator('span:has-text("详情数据")').first()

    // Listen for new pages
    const newPagePromise = creatorPage.context().waitForEvent('page', { timeout: 10000 }).catch(() => null)

    await detailLink.click()
    await new Promise(r => setTimeout(r, 3000))

    const newPage = await newPagePromise
    if (newPage) {
      console.log(`New page opened: ${newPage.url()}`)
      await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 })

      // Check for edit/delete on the detail page
      const detailPageInfo = await newPage.evaluate(() => {
        const buttons = document.querySelectorAll('button')
        const links = document.querySelectorAll('a')
        const spans = document.querySelectorAll('span')
        return {
          url: window.location.href,
          buttons: Array.from(buttons).map(b => b.textContent?.trim()).filter(Boolean),
          links: Array.from(links).map(a => ({
            href: a.getAttribute('href'),
            text: a.textContent?.trim()
          })).filter(l => l.text),
          actionSpans: Array.from(spans).map(s => s.textContent?.trim())
            .filter(t => t && (t.includes('编辑') || t.includes('删除') || t.includes('修改') || t.includes('管理')))
        }
      })
      console.log('Detail page info:', JSON.stringify(detailPageInfo, null, 2))
      await newPage.close()
    } else {
      console.log('No new page opened. Checking current page URL...')
      console.log(`Current URL: ${creatorPage.url()}`)

      // Maybe it navigated in the same page or opened a modal
      const modalInfo = await creatorPage.evaluate(() => {
        const modals = document.querySelectorAll('[role="dialog"], .modal, .drawer, [class*="modal"], [class*="drawer"], [class*="popup"]')
        return Array.from(modals).map(m => ({
          class: m.className,
          text: m.textContent?.slice(0, 300),
          visible: (m as HTMLElement).offsetParent !== null
        }))
      })
      console.log('Modals:', JSON.stringify(modalInfo, null, 2))
    }
  }

  // === Test 4: Intercept API calls to find edit/delete endpoints ===
  console.log('\n\n========== TEST 4: Monitor API calls ==========')
  const apiCalls: string[] = []
  creatorPage.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/') && !url.includes('.js') && !url.includes('.css')) {
      apiCalls.push(`${req.method()} ${url}`)
    }
  })

  // Navigate around to trigger API calls
  await creatorPage.goto('https://creator.xiaohongshu.com/publish/publish?source=official', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 3000))

  console.log('API calls observed:')
  for (const call of apiCalls) {
    console.log(`  ${call}`)
  }

  // === Test 5: Try the note detail page on main site to find edit option ===
  console.log('\n\n========== TEST 5: Note detail on main site ==========')
  // Go back to main site page
  await page.goto(`https://www.xiaohongshu.com/explore/${TEST_NOTE_ID}`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 5000))

  const notePageInfo = await page.evaluate(() => {
    // Look for edit/delete/more options on own note
    const moreButtons = document.querySelectorAll('[class*="more"], .more-icon, [class*="option"], [class*="menu"]')
    const editElements = document.querySelectorAll('[class*="edit"], [class*="delete"]')
    return {
      url: window.location.href,
      moreButtons: Array.from(moreButtons).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent?.slice(0, 50)
      })),
      editElements: Array.from(editElements).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent?.slice(0, 50)
      }))
    }
  })
  console.log('Note page info:', JSON.stringify(notePageInfo, null, 2))

  // === Test 6: Try the sidebar "内容管理" link in creator center ===
  console.log('\n\n========== TEST 6: Sidebar navigation in creator center ==========')
  await creatorPage.goto('https://creator.xiaohongshu.com/publish/publish?source=official', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 3000))

  const sidebarInfo = await creatorPage.evaluate(() => {
    const sidebarLinks = document.querySelectorAll('a[href], .menu-item, [class*="sidebar"] a, [class*="menu"] a, nav a')
    return Array.from(sidebarLinks).map(a => ({
      href: a.getAttribute('href'),
      text: a.textContent?.trim(),
      class: a.className
    })).filter(l => l.text && l.text.length < 30)
  })
  console.log('Sidebar links:')
  console.log(JSON.stringify(sidebarInfo, null, 2))

  console.log('\n\nDone. Keeping browser open for 30s...')
  await new Promise(r => setTimeout(r, 30000))
  await browser.close()
}

main().catch(console.error)
