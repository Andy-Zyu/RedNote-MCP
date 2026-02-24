/**
 * Test script v4: Explore note detail page for edit/delete options.
 * Run with: npx tsx scripts/test-edit-note-v4.ts
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

  // Navigate to note detail page directly
  console.log('\n========== Navigate to note detail page ==========')
  const detailUrl = `https://creator.xiaohongshu.com/statistics/note-detail?noteId=${TEST_NOTE_ID}`
  await creatorPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 5000))
  console.log(`URL: ${creatorPage.url()}`)

  // Find "笔记管理" elements
  console.log('\n========== Find 笔记管理 elements ==========')
  const noteManageInfo = await creatorPage.evaluate(() => {
    const allElements = document.querySelectorAll('*')
    const matches: Array<{tag: string, cls: string, text: string, href: string | null, parentTag: string, parentCls: string}> = []
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i]
      const text = el.textContent?.trim() || ''
      if (text === '笔记管理' || (text.includes('笔记管理') && text.length < 20)) {
        matches.push({
          tag: el.tagName,
          cls: typeof el.className === 'string' ? el.className : '',
          text: text.slice(0, 50),
          href: el.getAttribute('href'),
          parentTag: el.parentElement?.tagName || '',
          parentCls: typeof el.parentElement?.className === 'string' ? el.parentElement.className.slice(0, 80) : ''
        })
      }
    }
    return matches
  })
  console.log('笔记管理 elements:', JSON.stringify(noteManageInfo, null, 2))

  // Find all action-like elements
  console.log('\n========== Find action elements ==========')
  const actionInfo = await creatorPage.evaluate(() => {
    const keywords = ['编辑', '删除', '修改', '管理', '更多', '操作', '设置', '笔记管理']
    const allElements = document.querySelectorAll('a, button, span, div[class*="btn"], div[class*="action"], div[class*="manage"]')
    const matches: Array<{tag: string, cls: string, text: string, href: string | null}> = []
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i]
      const text = el.textContent?.trim() || ''
      if (text.length < 30 && keywords.some(k => text.includes(k))) {
        matches.push({
          tag: el.tagName,
          cls: typeof el.className === 'string' ? el.className : '',
          text,
          href: el.getAttribute('href')
        })
      }
    }
    return matches
  })
  console.log('Action elements:', JSON.stringify(actionInfo, null, 2))

  // Get all buttons and links on the page
  console.log('\n========== All buttons and links ==========')
  const allBtnsLinks = await creatorPage.evaluate(() => {
    const btns = document.querySelectorAll('button')
    const links = document.querySelectorAll('a[href]')
    return {
      buttons: Array.from(btns).map(b => ({
        text: b.textContent?.trim().slice(0, 50),
        cls: b.className.slice(0, 80),
        disabled: b.disabled
      })),
      links: Array.from(links).map(a => ({
        text: a.textContent?.trim().slice(0, 50),
        href: a.getAttribute('href'),
        cls: a.className.slice(0, 80)
      }))
    }
  })
  console.log('Buttons:', JSON.stringify(allBtnsLinks.buttons, null, 2))
  console.log('Links:', JSON.stringify(allBtnsLinks.links, null, 2))

  // === Try clicking "笔记管理" ===
  console.log('\n========== Click 笔记管理 ==========')

  // Monitor for navigation or new pages
  const apiCalls: string[] = []
  creatorPage.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/') && !url.includes('apm-fe') && !url.includes('collect') && !url.includes('.js') && !url.includes('sbtsource')) {
      apiCalls.push(`${req.method()} ${url}`)
    }
  })

  const newPagePromise = creatorPage.context().waitForEvent('page', { timeout: 10000 }).catch(() => null)

  // Try clicking
  const noteManageLink = creatorPage.locator('a:has-text("笔记管理")').first()
  const noteManageSpan = creatorPage.locator('span:has-text("笔记管理")').first()
  const noteManageDiv = creatorPage.locator('div:has-text("笔记管理"):not(:has(div:has-text("笔记管理")))').first()

  if (await noteManageLink.count() > 0) {
    const href = await noteManageLink.getAttribute('href')
    console.log(`Clicking link with href: ${href}`)
    await noteManageLink.click()
  } else if (await noteManageSpan.count() > 0) {
    console.log('Clicking span...')
    await noteManageSpan.click()
  } else if (await noteManageDiv.count() > 0) {
    console.log('Clicking div...')
    await noteManageDiv.click()
  } else {
    console.log('No 笔记管理 element found to click')
  }

  await new Promise(r => setTimeout(r, 5000))

  const newPage = await newPagePromise
  if (newPage) {
    console.log(`New page opened: ${newPage.url()}`)
    await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await new Promise(r => setTimeout(r, 5000))

    // Look for edit/delete on this page
    const newPageActions = await newPage.evaluate(() => {
      const keywords = ['编辑', '删除', '修改', '更多', '操作']
      const allElements = document.querySelectorAll('a, button, span, div, li')
      const matches: Array<{tag: string, cls: string, text: string, href: string | null}> = []
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i]
        const text = el.textContent?.trim() || ''
        if (text.length < 30 && keywords.some(k => text.includes(k))) {
          matches.push({
            tag: el.tagName,
            cls: typeof el.className === 'string' ? el.className : '',
            text,
            href: el.getAttribute('href')
          })
        }
      }
      return matches
    })
    console.log('New page actions:', JSON.stringify(newPageActions, null, 2))

    // Get all buttons and links
    const newPageBtns = await newPage.evaluate(() => {
      const btns = document.querySelectorAll('button')
      const links = document.querySelectorAll('a[href]')
      return {
        buttons: Array.from(btns).map(b => ({
          text: b.textContent?.trim().slice(0, 50),
          cls: b.className.slice(0, 80)
        })),
        links: Array.from(links).map(a => ({
          text: a.textContent?.trim().slice(0, 50),
          href: a.getAttribute('href')
        }))
      }
    })
    console.log('New page buttons:', JSON.stringify(newPageBtns.buttons, null, 2))
    console.log('New page links:', JSON.stringify(newPageBtns.links, null, 2))

    // Dump the page URL
    console.log(`Final new page URL: ${newPage.url()}`)
  } else {
    console.log('No new page. Current URL:', creatorPage.url())
  }

  console.log('\nAPI calls:', apiCalls)

  // === Test: Try the sidebar in creator center ===
  console.log('\n\n========== Sidebar links ==========')
  // Go back to publish page to see sidebar
  await creatorPage.goto('https://creator.xiaohongshu.com/publish/publish?source=official', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 3000))

  const sidebarLinks = await creatorPage.evaluate(() => {
    const links = document.querySelectorAll('a')
    return Array.from(links).map(a => ({
      text: a.textContent?.trim().slice(0, 50),
      href: a.getAttribute('href'),
      cls: a.className.slice(0, 80)
    })).filter(l => l.text && l.text.length > 0 && l.text.length < 30)
  })
  console.log('All links on publish page:', JSON.stringify(sidebarLinks, null, 2))

  // Look for "内容管理" or "笔记管理" in sidebar
  const manageLink = creatorPage.locator('a:has-text("内容管理")').first()
  if (await manageLink.count() > 0) {
    const href = await manageLink.getAttribute('href')
    console.log(`Found 内容管理 link: ${href}`)
  }

  console.log('\n\nDone. Keeping browser open for 20s...')
  await new Promise(r => setTimeout(r, 20000))
  await browser.close()
}

main().catch(console.error)
