/**
 * Test script v3: Explore note detail page for edit/delete options.
 * Run with: npx tsx scripts/test-edit-note-v3.ts
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

  // Dump full page structure
  const pageStructure = await creatorPage.evaluate(() => {
    const walk = (el: Element, depth: number): string => {
      if (depth > 5) return ''
      const indent = '  '.repeat(depth)
      const tag = el.tagName.toLowerCase()
      const cls = el.className && typeof el.className === 'string' ? ` class="${el.className.slice(0, 100)}"` : ''
      const id = el.id ? ` id="${el.id}"` : ''
      const href = el.getAttribute?.('href') ? ` href="${el.getAttribute('href')}"` : ''
      const text = el.children.length === 0 && el.textContent ? ` "${el.textContent.trim().slice(0, 60)}"` : ''
      let result = `${indent}<${tag}${id}${cls}${href}${text}>\n`
      for (const child of Array.from(el.children).slice(0, 20)) {
        result += walk(child, depth + 1)
      }
      return result
    }
    const app = document.querySelector('#app') || document.body
    return walk(app, 0)
  })
  console.log('Page structure:')
  console.log(pageStructure.slice(0, 10000))

  // Find "笔记管理" elements
  console.log('\n========== Find 笔记管理 elements ==========')
  const noteManageInfo = await creatorPage.evaluate(() => {
    const allElements = document.querySelectorAll('*')
    const matches: Array<{tag: string, class: string, text: string, href: string | null, parent: string}> = []
    for (const el of allElements) {
      const text = el.textContent?.trim() || ''
      if (text === '笔记管理' || text.includes('笔记管理')) {
        if (el.children.length === 0 || text.length < 20) {
          matches.push({
            tag: el.tagName,
            class: typeof el.className === 'string' ? el.className : '',
            text: text.slice(0, 50),
            href: el.getAttribute('href'),
            parent: `${el.parentElement?.tagName} class="${typeof el.parentElement?.className === 'string' ? el.parentElement.className.slice(0, 80) : ''}"`
          })
        }
      }
    }
    return matches
  })
  console.log('笔记管理 elements:', JSON.stringify(noteManageInfo, null, 2))

  // Find all clickable action elements
  console.log('\n========== Find action elements ==========')
  const actionInfo = await creatorPage.evaluate(() => {
    const keywords = ['编辑', '删除', '修改', '管理', '更多', '操作', '设置']
    const allElements = document.querySelectorAll('a, button, span, div')
    const matches: Array<{tag: string, class: string, text: string, href: string | null}> = []
    for (const el of allElements) {
      const text = el.textContent?.trim() || ''
      if (text.length < 30 && keywords.some(k => text.includes(k))) {
        matches.push({
          tag: el.tagName,
          class: typeof el.className === 'string' ? el.className : '',
          text,
          href: el.getAttribute('href')
        })
      }
    }
    return matches
  })
  console.log('Action elements:', JSON.stringify(actionInfo, null, 2))

  // === Try clicking "笔记管理" ===
  console.log('\n========== Click 笔记管理 ==========')
  const noteManageSpan = creatorPage.locator('span:has-text("笔记管理")').first()
  const noteManageLink = creatorPage.locator('a:has-text("笔记管理")').first()

  // Monitor for navigation or new pages
  const apiCalls: string[] = []
  creatorPage.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/') && !url.includes('apm-fe') && !url.includes('collect') && !url.includes('.js')) {
      apiCalls.push(`${req.method()} ${url}`)
    }
  })

  const newPagePromise = creatorPage.context().waitForEvent('page', { timeout: 10000 }).catch(() => null)

  if (await noteManageLink.count() > 0) {
    console.log('Clicking link...')
    await noteManageLink.click()
  } else if (await noteManageSpan.count() > 0) {
    console.log('Clicking span...')
    await noteManageSpan.click()
  }
  await new Promise(r => setTimeout(r, 3000))

  const newPage = await newPagePromise
  if (newPage) {
    console.log(`New page opened: ${newPage.url()}`)
    await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 })
    await new Promise(r => setTimeout(r, 3000))

    // Dump the new page
    const newPageStructure = await newPage.evaluate(() => {
      const walk = (el: Element, depth: number): string => {
        if (depth > 5) return ''
        const indent = '  '.repeat(depth)
        const tag = el.tagName.toLowerCase()
        const cls = el.className && typeof el.className === 'string' ? ` class="${el.className.slice(0, 100)}"` : ''
        const id = el.id ? ` id="${el.id}"` : ''
        const href = el.getAttribute?.('href') ? ` href="${el.getAttribute('href')}"` : ''
        const text = el.children.length === 0 && el.textContent ? ` "${el.textContent.trim().slice(0, 60)}"` : ''
        let result = `${indent}<${tag}${id}${cls}${href}${text}>\n`
        for (const child of Array.from(el.children).slice(0, 20)) {
          result += walk(child, depth + 1)
        }
        return result
      }
      const app = document.querySelector('#app') || document.body
      return walk(app, 0)
    })
    console.log('New page structure:')
    console.log(newPageStructure.slice(0, 10000))

    // Look for edit/delete on this page
    const newPageActions = await newPage.evaluate(() => {
      const keywords = ['编辑', '删除', '修改', '更多', '操作']
      const allElements = document.querySelectorAll('a, button, span, div, li')
      const matches: Array<{tag: string, class: string, text: string, href: string | null}> = []
      for (const el of allElements) {
        const text = el.textContent?.trim() || ''
        if (text.length < 30 && keywords.some(k => text.includes(k))) {
          matches.push({
            tag: el.tagName,
            class: typeof el.className === 'string' ? el.className : '',
            text,
            href: el.getAttribute('href')
          })
        }
      }
      return matches
    })
    console.log('New page actions:', JSON.stringify(newPageActions, null, 2))
  } else {
    console.log('No new page. Current URL:', creatorPage.url())

    // Check for modals or navigation
    const modalInfo = await creatorPage.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], .modal, .drawer, [class*="modal"], [class*="drawer"], [class*="popup"], [class*="dropdown"]')
      return Array.from(modals).map(m => ({
        class: typeof m.className === 'string' ? m.className : '',
        text: m.textContent?.slice(0, 500),
        visible: (m as HTMLElement).offsetParent !== null || (m as HTMLElement).style.display !== 'none'
      }))
    })
    console.log('Modals/dropdowns:', JSON.stringify(modalInfo, null, 2))
  }

  console.log('\nAPI calls:', apiCalls)

  console.log('\n\nDone. Keeping browser open for 30s...')
  await new Promise(r => setTimeout(r, 30000))
  await browser.close()
}

main().catch(console.error)
