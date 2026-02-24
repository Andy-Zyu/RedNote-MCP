/**
 * Test script: Explore edit note flow in creator center.
 * Run with: npx tsx scripts/test-edit-note.ts
 */
import { chromium, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')
const TEST_NOTE_ID = '699c13180000000015021785' // 无标题笔记

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

async function dumpPageInfo(page: Page, label: string) {
  console.log(`\n=== ${label} ===`)
  console.log(`URL: ${page.url()}`)
  console.log(`Title: ${await page.title()}`)

  // Dump key elements
  const info = await page.evaluate(() => {
    const result: Record<string, string> = {}

    // Title input
    const titleInputs = document.querySelectorAll('input[type="text"], input[placeholder]')
    result['title_inputs'] = Array.from(titleInputs).map(el => {
      const input = el as HTMLInputElement
      return `placeholder="${input.placeholder}" value="${input.value}" class="${input.className}"`
    }).join('\n  ')

    // Content editors
    const editors = document.querySelectorAll('.tiptap, .ProseMirror, .ql-editor, [contenteditable="true"]')
    result['editors'] = Array.from(editors).map(el => {
      return `tag=${el.tagName} class="${el.className}" text="${el.textContent?.slice(0, 100)}"`
    }).join('\n  ')

    // Buttons
    const buttons = document.querySelectorAll('button')
    result['buttons'] = Array.from(buttons).map(el => {
      return `text="${el.textContent?.trim()}" class="${el.className}" disabled=${el.disabled}`
    }).join('\n  ')

    // Any publish/save buttons specifically
    const publishBtns = document.querySelectorAll('button:not([disabled])')
    result['active_buttons'] = Array.from(publishBtns).map(el => {
      return `text="${el.textContent?.trim()}" class="${el.className}"`
    }).join('\n  ')

    // Check for image upload area
    const fileInputs = document.querySelectorAll('input[type="file"]')
    result['file_inputs'] = `count=${fileInputs.length}`

    // Check for any error/warning messages
    const alerts = document.querySelectorAll('.alert, .error, .warning, .toast, [role="alert"]')
    result['alerts'] = Array.from(alerts).map(el => el.textContent?.trim() || '').join(', ')

    return result
  })

  for (const [key, value] of Object.entries(info)) {
    console.log(`${key}:`)
    console.log(`  ${value}`)
  }
}

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  await loadCookies(context)

  const page = await context.newPage()
  const creatorPage = await ssoToCreator(page)

  // === Test 1: Try direct edit URL with noteId ===
  console.log('\n\n========== TEST 1: Direct edit URL ==========')
  const editUrl = `https://creator.xiaohongshu.com/publish/publish?source=official&noteId=${TEST_NOTE_ID}`
  console.log(`Navigating to: ${editUrl}`)
  await creatorPage.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 5000))
  await dumpPageInfo(creatorPage, 'Direct Edit URL')

  // === Test 2: Try /publish/publish?noteId= (without source) ===
  console.log('\n\n========== TEST 2: Edit URL without source param ==========')
  const editUrl2 = `https://creator.xiaohongshu.com/publish/publish?noteId=${TEST_NOTE_ID}`
  console.log(`Navigating to: ${editUrl2}`)
  await creatorPage.goto(editUrl2, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 5000))
  await dumpPageInfo(creatorPage, 'Edit URL without source')

  // === Test 3: Try note management page ===
  console.log('\n\n========== TEST 3: Note management page ==========')
  const manageUrl = 'https://creator.xiaohongshu.com/publish/content'
  console.log(`Navigating to: ${manageUrl}`)
  await creatorPage.goto(manageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 5000))
  await dumpPageInfo(creatorPage, 'Note Management Page')

  // Dump full HTML structure of the main content area
  const contentHtml = await creatorPage.evaluate(() => {
    const main = document.querySelector('.content-manage, .note-list, main, #app .container, #app > div > div:nth-child(2)')
    if (main) return main.innerHTML.slice(0, 5000)
    // Fallback: get the body's direct children structure
    return Array.from(document.body.children).map(el =>
      `<${el.tagName} class="${el.className}" id="${el.id}">${el.innerHTML.slice(0, 500)}`
    ).join('\n')
  })
  console.log('\nContent area HTML (first 5000 chars):')
  console.log(contentHtml)

  // === Test 4: Try /publish/note ===
  console.log('\n\n========== TEST 4: /publish/note page ==========')
  await creatorPage.goto('https://creator.xiaohongshu.com/publish/note', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 5000))
  await dumpPageInfo(creatorPage, '/publish/note page')

  // Dump the full page structure
  const notePageHtml = await creatorPage.evaluate(() => {
    const app = document.querySelector('#app')
    if (!app) return 'No #app found'
    // Get structure overview
    const walk = (el: Element, depth: number): string => {
      if (depth > 4) return ''
      const indent = '  '.repeat(depth)
      const tag = el.tagName.toLowerCase()
      const cls = el.className ? ` class="${String(el.className).slice(0, 80)}"` : ''
      const id = el.id ? ` id="${el.id}"` : ''
      const text = el.children.length === 0 ? ` text="${el.textContent?.slice(0, 60)}"` : ''
      let result = `${indent}<${tag}${id}${cls}${text}>\n`
      for (const child of el.children) {
        result += walk(child, depth + 1)
      }
      return result
    }
    return walk(app, 0)
  })
  console.log('\nPage structure:')
  console.log(notePageHtml.slice(0, 8000))

  console.log('\n\nDone. Browser stays open for manual inspection.')
  // Keep browser open for 60 seconds for manual inspection
  await new Promise(r => setTimeout(r, 60000))
  await browser.close()
}

main().catch(console.error)
