/**
 * Test script v5: Explore the actual note-manager page for edit/delete.
 * Run with: npx tsx scripts/test-edit-note-v5.ts
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

  // Monitor API calls
  const apiCalls: Array<{method: string, url: string, body?: string}> = []
  creatorPage.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/galaxy') || url.includes('/api/gaia')) {
      apiCalls.push({
        method: req.method(),
        url,
        body: req.postData() || undefined
      })
    }
  })

  // Intercept API responses
  const apiResponses: Array<{url: string, status: number, body: string}> = []
  creatorPage.on('response', async (resp) => {
    const url = resp.url()
    if (url.includes('/api/galaxy/v2/creator/note/user/posted')) {
      try {
        const body = await resp.text()
        apiResponses.push({ url, status: resp.status(), body: body.slice(0, 3000) })
      } catch {}
    }
  })

  // Navigate to note manager
  console.log('\n========== Navigate to note-manager ==========')
  await creatorPage.goto('https://creator.xiaohongshu.com/new/note-manager', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 5000))
  console.log(`URL: ${creatorPage.url()}`)

  // Dump API response for note list
  console.log('\n========== API responses ==========')
  for (const resp of apiResponses) {
    console.log(`${resp.status} ${resp.url}`)
    console.log(resp.body)
  }

  // Get page structure - all note cards/items
  console.log('\n========== Note items on page ==========')
  const noteItems = await creatorPage.evaluate(() => {
    // Look for note cards, list items, table rows
    const selectors = [
      '.note-item', '.note-card', '[class*="note-item"]', '[class*="note-card"]',
      '[class*="NoteItem"]', '[class*="NoteCard"]',
      'table tbody tr',
      '.list-item', '[class*="list-item"]',
      '[class*="content-item"]', '[class*="ContentItem"]'
    ]
    for (const sel of selectors) {
      const items = document.querySelectorAll(sel)
      if (items.length > 0) {
        return {
          selector: sel,
          count: items.length,
          items: Array.from(items).slice(0, 3).map((item, i) => ({
            index: i,
            tag: item.tagName,
            cls: typeof item.className === 'string' ? item.className.slice(0, 150) : '',
            text: item.textContent?.slice(0, 200),
            innerHTML: item.innerHTML.slice(0, 500),
            childTags: Array.from(item.children).map(c => `${c.tagName}.${typeof c.className === 'string' ? c.className.slice(0, 50) : ''}`)
          }))
        }
      }
    }

    // Fallback: dump all elements with meaningful content
    const body = document.querySelector('.main-content, .content, main, #app > div > div:nth-child(2), #app')
    if (body) {
      return {
        selector: 'fallback',
        count: 0,
        items: [{
          index: 0,
          tag: body.tagName,
          cls: typeof body.className === 'string' ? body.className : '',
          text: '',
          innerHTML: body.innerHTML.slice(0, 3000),
          childTags: Array.from(body.children).map(c => `${c.tagName}.${typeof c.className === 'string' ? c.className.slice(0, 50) : ''}`)
        }]
      }
    }
    return { selector: 'none', count: 0, items: [] }
  })
  console.log('Note items:', JSON.stringify(noteItems, null, 2))

  // Find all interactive elements
  console.log('\n========== All interactive elements ==========')
  const interactiveElements = await creatorPage.evaluate(() => {
    const btns = document.querySelectorAll('button')
    const links = document.querySelectorAll('a[href]')
    const dropdowns = document.querySelectorAll('[class*="dropdown"], [class*="Dropdown"], select, [class*="more"], [class*="More"]')
    const menus = document.querySelectorAll('[class*="menu"], [class*="Menu"]')

    return {
      buttons: Array.from(btns).map(b => ({
        text: b.textContent?.trim().slice(0, 50),
        cls: b.className.slice(0, 100)
      })),
      links: Array.from(links).map(a => ({
        text: a.textContent?.trim().slice(0, 50),
        href: a.getAttribute('href')?.slice(0, 100)
      })).filter(l => l.text),
      dropdowns: Array.from(dropdowns).map(d => ({
        tag: d.tagName,
        cls: typeof d.className === 'string' ? d.className.slice(0, 100) : '',
        text: d.textContent?.trim().slice(0, 50)
      })),
      menuItems: Array.from(menus).slice(0, 5).map(m => ({
        tag: m.tagName,
        cls: typeof m.className === 'string' ? m.className.slice(0, 100) : '',
        text: m.textContent?.trim().slice(0, 100)
      }))
    }
  })
  console.log('Buttons:', JSON.stringify(interactiveElements.buttons, null, 2))
  console.log('Links:', JSON.stringify(interactiveElements.links, null, 2))
  console.log('Dropdowns:', JSON.stringify(interactiveElements.dropdowns, null, 2))

  // Look for "more" or "..." icons on note items (often SVG or icon buttons)
  console.log('\n========== Look for more/action icons ==========')
  const iconButtons = await creatorPage.evaluate(() => {
    const svgs = document.querySelectorAll('svg')
    const icons = document.querySelectorAll('[class*="icon"], [class*="Icon"], i')
    return {
      svgCount: svgs.length,
      svgParents: Array.from(svgs).slice(0, 10).map(s => ({
        parentTag: s.parentElement?.tagName,
        parentCls: typeof s.parentElement?.className === 'string' ? s.parentElement.className.slice(0, 80) : '',
        parentText: s.parentElement?.textContent?.trim().slice(0, 30)
      })),
      icons: Array.from(icons).slice(0, 15).map(i => ({
        tag: i.tagName,
        cls: typeof i.className === 'string' ? i.className.slice(0, 80) : '',
        text: i.textContent?.trim().slice(0, 30)
      }))
    }
  })
  console.log('SVG parents:', JSON.stringify(iconButtons.svgParents, null, 2))
  console.log('Icons:', JSON.stringify(iconButtons.icons, null, 2))

  // Try hovering over the first note item to reveal action buttons
  console.log('\n========== Hover over first note ==========')
  const firstNoteSelector = noteItems.selector !== 'none' && noteItems.selector !== 'fallback'
    ? noteItems.selector
    : null

  if (firstNoteSelector) {
    const firstNote = creatorPage.locator(firstNoteSelector).first()
    await firstNote.hover()
    await new Promise(r => setTimeout(r, 2000))

    // Check for newly visible elements
    const hoverElements = await creatorPage.evaluate(() => {
      const keywords = ['编辑', '删除', '修改', '更多', '...', '置顶']
      const allElements = document.querySelectorAll('*')
      const matches: Array<{tag: string, cls: string, text: string, visible: boolean}> = []
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement
        const text = el.textContent?.trim() || ''
        if (text.length < 20 && keywords.some(k => text.includes(k))) {
          const rect = el.getBoundingClientRect()
          matches.push({
            tag: el.tagName,
            cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
            text,
            visible: rect.width > 0 && rect.height > 0
          })
        }
      }
      return matches
    })
    console.log('Elements after hover:', JSON.stringify(hoverElements, null, 2))
  }

  console.log('\nAll API calls:', JSON.stringify(apiCalls, null, 2))

  console.log('\n\nDone. Keeping browser open for 30s...')
  await new Promise(r => setTimeout(r, 30000))
  await browser.close()
}

main().catch(console.error)
