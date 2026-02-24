/**
 * Test script v6: Deep dive into note-manager DOM to find note cards and actions.
 * Run with: npx tsx scripts/test-edit-note-v6.ts
 */
import { chromium, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

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

  // Navigate to note manager
  await creatorPage.goto('https://creator.xiaohongshu.com/new/note-manager', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 8000)) // Wait longer for SPA to render
  console.log(`URL: ${creatorPage.url()}`)

  // Dump the #page or main content area innerHTML
  console.log('\n========== Main content area ==========')
  const mainContent = await creatorPage.evaluate(() => {
    const pageEl = document.querySelector('#page')
    if (!pageEl) return 'No #page found'
    // Get the main content area (skip header/sidebar)
    const containers = pageEl.querySelectorAll('div')
    // Find the deepest container that has multiple children with note-like content
    let bestContainer: Element | null = null
    let bestScore = 0
    for (let i = 0; i < containers.length; i++) {
      const c = containers[i]
      const text = c.textContent || ''
      // Look for containers that mention note titles we know exist
      if (text.includes('无标题笔记') || text.includes('设计师的噩梦')) {
        const score = c.children.length
        if (score > bestScore || !bestContainer) {
          bestContainer = c
          bestScore = score
        }
      }
    }
    if (bestContainer) {
      return {
        tag: bestContainer.tagName,
        cls: typeof bestContainer.className === 'string' ? bestContainer.className : '',
        childCount: bestContainer.children.length,
        innerHTML: bestContainer.innerHTML.slice(0, 8000)
      }
    }
    return 'No container with note content found'
  })
  console.log(JSON.stringify(mainContent, null, 2))

  // Try to find note cards by looking for elements containing known note titles
  console.log('\n========== Find note title elements ==========')
  const titleElements = await creatorPage.evaluate(() => {
    const allElements = document.querySelectorAll('*')
    const results: Array<{
      tag: string
      cls: string
      text: string
      parentTag: string
      parentCls: string
      grandparentTag: string
      grandparentCls: string
      siblings: string[]
    }> = []

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i]
      const text = el.textContent?.trim() || ''
      // Find leaf elements that contain exactly a note title
      if (el.children.length === 0 && (text === '无标题笔记' || text === 'EvoMap进化沙盒架构-毒辣评价')) {
        const parent = el.parentElement
        const grandparent = parent?.parentElement
        results.push({
          tag: el.tagName,
          cls: typeof el.className === 'string' ? el.className : '',
          text,
          parentTag: parent?.tagName || '',
          parentCls: typeof parent?.className === 'string' ? parent.className : '',
          grandparentTag: grandparent?.tagName || '',
          grandparentCls: typeof grandparent?.className === 'string' ? grandparent.className : '',
          siblings: Array.from(parent?.children || []).map(c =>
            `${c.tagName}.${typeof c.className === 'string' ? c.className.slice(0, 60) : ''} "${c.textContent?.trim().slice(0, 40)}"`
          )
        })
      }
    }
    return results
  })
  console.log(JSON.stringify(titleElements, null, 2))

  // Walk up from title element to find the note card container
  console.log('\n========== Walk up from title to find card ==========')
  const cardInfo = await creatorPage.evaluate(() => {
    // Find the title element
    const allElements = document.querySelectorAll('*')
    let titleEl: Element | null = null
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i]
      if (el.children.length === 0 && el.textContent?.trim() === 'EvoMap进化沙盒架构-毒辣评价') {
        titleEl = el
        break
      }
    }
    if (!titleEl) return 'Title element not found'

    // Walk up 8 levels
    const ancestors: Array<{
      level: number
      tag: string
      cls: string
      childCount: number
      childTags: string[]
      dataAttrs: string[]
      text: string
    }> = []

    let current: Element | null = titleEl
    for (let level = 0; level < 8 && current; level++) {
      const attrs: string[] = []
      for (let a = 0; a < current.attributes.length; a++) {
        const attr = current.attributes[a]
        if (attr.name.startsWith('data-')) {
          attrs.push(`${attr.name}="${attr.value}"`)
        }
      }
      ancestors.push({
        level,
        tag: current.tagName,
        cls: typeof current.className === 'string' ? current.className.slice(0, 120) : '',
        childCount: current.children.length,
        childTags: Array.from(current.children).map(c => {
          const ccls = typeof c.className === 'string' ? c.className.slice(0, 60) : ''
          return `${c.tagName}.${ccls}`
        }),
        dataAttrs: attrs,
        text: current.textContent?.trim().slice(0, 80) || ''
      })
      current = current.parentElement
    }
    return ancestors
  })
  console.log(JSON.stringify(cardInfo, null, 2))

  // Now look for the note card container and find action buttons within it
  console.log('\n========== Find action buttons in note card ==========')
  const cardActions = await creatorPage.evaluate(() => {
    // Find title, walk up to find the card, then look for action buttons
    const allElements = document.querySelectorAll('*')
    let titleEl: Element | null = null
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i]
      if (el.children.length === 0 && el.textContent?.trim() === 'EvoMap进化沙盒架构-毒辣评价') {
        titleEl = el
        break
      }
    }
    if (!titleEl) return 'Title not found'

    // Walk up to find a container with multiple note-like siblings
    let card: Element | null = titleEl
    for (let i = 0; i < 10 && card; i++) {
      const parent = card.parentElement
      if (!parent) break
      // A card container likely has siblings that are also cards
      if (parent.children.length >= 3) {
        // Check if siblings also contain note-like content
        const siblingTexts = Array.from(parent.children).map(c => c.textContent?.slice(0, 50))
        const hasMultipleNotes = siblingTexts.filter(t =>
          t && (t.includes('发布于') || t.includes('2026'))
        ).length >= 2
        if (hasMultipleNotes) {
          // parent is the list container, card is the note card
          break
        }
      }
      card = parent
    }

    if (!card) return 'Card not found'

    // Now dump the card's full structure
    const cardHtml = card.innerHTML
    const cardChildren = Array.from(card.querySelectorAll('*')).map(el => ({
      tag: el.tagName,
      cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
      text: el.children.length === 0 ? el.textContent?.trim().slice(0, 50) : undefined
    }))

    return {
      cardTag: card.tagName,
      cardCls: typeof card.className === 'string' ? card.className : '',
      cardHtml: cardHtml.slice(0, 3000),
      elements: cardChildren.filter(e => e.text || e.cls)
    }
  })
  console.log(JSON.stringify(cardActions, null, 2))

  // Try hovering over the card to reveal hidden action buttons
  console.log('\n========== Hover test ==========')
  const titleLocator = creatorPage.locator('text=EvoMap进化沙盒架构-毒辣评价').first()
  if (await titleLocator.count() > 0) {
    // Hover over the title's parent area
    await titleLocator.hover()
    await new Promise(r => setTimeout(r, 2000))

    // Check for newly visible elements
    const afterHover = await creatorPage.evaluate(() => {
      const allElements = document.querySelectorAll('*')
      const visible: Array<{tag: string, cls: string, text: string}> = []
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement
        const text = el.textContent?.trim() || ''
        if (el.children.length === 0 && text.length > 0 && text.length < 20) {
          const rect = el.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            const keywords = ['编辑', '删除', '修改', '更多', '置顶', '取消', '管理']
            if (keywords.some(k => text.includes(k))) {
              visible.push({
                tag: el.tagName,
                cls: typeof el.className === 'string' ? el.className : '',
                text
              })
            }
          }
        }
      }
      return visible
    })
    console.log('Visible action elements after hover:', JSON.stringify(afterHover, null, 2))
  }

  console.log('\n\nDone. Keeping browser open for 30s...')
  await new Promise(r => setTimeout(r, 30000))
  await browser.close()
}

main().catch(console.error)
