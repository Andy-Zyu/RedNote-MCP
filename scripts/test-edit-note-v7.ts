/**
 * Test script v7: Click edit and delete buttons on note-manager page.
 * Run with: npx tsx scripts/test-edit-note-v7.ts
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

  // Navigate to note manager
  await creatorPage.goto('https://creator.xiaohongshu.com/new/note-manager', {
    waitUntil: 'domcontentloaded', timeout: 30000
  })
  await new Promise(r => setTimeout(r, 8000))
  console.log(`URL: ${creatorPage.url()}`)

  // Find the target note card by noteId in data-impression attribute
  console.log('\n========== Find target note card ==========')
  const noteCard = creatorPage.locator(`div.note[data-impression*="${TEST_NOTE_ID}"]`).first()
  const cardCount = await noteCard.count()
  console.log(`Found ${cardCount} matching note cards for ${TEST_NOTE_ID}`)

  if (cardCount === 0) {
    console.log('No card found, trying alternative selector...')
    // Try finding by title text
    const allNotes = creatorPage.locator('div.note')
    const totalNotes = await allNotes.count()
    console.log(`Total note cards: ${totalNotes}`)
    for (let i = 0; i < totalNotes; i++) {
      const title = await allNotes.nth(i).locator('.title').textContent()
      console.log(`  Note ${i}: ${title}`)
    }
  }

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

  // === TEST EDIT: Click the edit button on the target note ===
  console.log('\n========== Click EDIT button ==========')
  const editBtn = noteCard.locator('span.control.data-edit').first()
  const editBtnCount = await editBtn.count()
  console.log(`Edit button found: ${editBtnCount}`)

  if (editBtnCount > 0) {
    // Listen for new pages
    const newPagePromise = creatorPage.context().waitForEvent('page', { timeout: 15000 }).catch(() => null)

    const beforeUrl = creatorPage.url()
    await editBtn.click()
    await new Promise(r => setTimeout(r, 5000))

    const afterUrl = creatorPage.url()
    console.log(`Before URL: ${beforeUrl}`)
    console.log(`After URL: ${afterUrl}`)

    const newPage = await newPagePromise
    if (newPage) {
      console.log(`New page opened: ${newPage.url()}`)
      await newPage.waitForLoadState('domcontentloaded', { timeout: 15000 })
      await new Promise(r => setTimeout(r, 5000))
      console.log(`New page final URL: ${newPage.url()}`)

      // Check what's on the edit page
      const editPageInfo = await newPage.evaluate(() => {
        const titleInputs = document.querySelectorAll('input[type="text"], input[placeholder]')
        const editors = document.querySelectorAll('.tiptap, .ProseMirror, .ql-editor, [contenteditable="true"]')
        const buttons = document.querySelectorAll('button')
        const fileInputs = document.querySelectorAll('input[type="file"]')

        return {
          url: window.location.href,
          titleInputs: Array.from(titleInputs).map(el => {
            const input = el as HTMLInputElement
            return {
              placeholder: input.placeholder,
              value: input.value,
              cls: input.className.slice(0, 80)
            }
          }),
          editors: Array.from(editors).map(el => ({
            tag: el.tagName,
            cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
            text: el.textContent?.slice(0, 200)
          })),
          buttons: Array.from(buttons).map(b => ({
            text: b.textContent?.trim().slice(0, 50),
            cls: b.className.slice(0, 80),
            disabled: b.disabled
          })),
          fileInputCount: fileInputs.length
        }
      })
      console.log('Edit page info:', JSON.stringify(editPageInfo, null, 2))

      // Close the edit page without saving
      await newPage.close()
    } else if (afterUrl !== beforeUrl) {
      console.log('Page navigated (same tab)')

      // Check the edit page
      const editPageInfo = await creatorPage.evaluate(() => {
        const titleInputs = document.querySelectorAll('input[type="text"], input[placeholder]')
        const editors = document.querySelectorAll('.tiptap, .ProseMirror, .ql-editor, [contenteditable="true"]')
        const buttons = document.querySelectorAll('button')

        return {
          url: window.location.href,
          titleInputs: Array.from(titleInputs).map(el => {
            const input = el as HTMLInputElement
            return {
              placeholder: input.placeholder,
              value: input.value,
              cls: input.className.slice(0, 80)
            }
          }),
          editors: Array.from(editors).map(el => ({
            tag: el.tagName,
            cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
            text: el.textContent?.slice(0, 200)
          })),
          buttons: Array.from(buttons).map(b => ({
            text: b.textContent?.trim().slice(0, 50),
            cls: b.className.slice(0, 80),
            disabled: b.disabled
          }))
        }
      })
      console.log('Edit page info:', JSON.stringify(editPageInfo, null, 2))

      // Go back to note manager for delete test
      await creatorPage.goto('https://creator.xiaohongshu.com/new/note-manager', {
        waitUntil: 'domcontentloaded', timeout: 30000
      })
      await new Promise(r => setTimeout(r, 8000))
    } else {
      console.log('No navigation detected. Checking for modals...')
      const modals = await creatorPage.evaluate(() => {
        const els = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="dialog"], [class*="popup"]')
        return Array.from(els).map(m => ({
          cls: typeof m.className === 'string' ? m.className : '',
          text: m.textContent?.slice(0, 300),
          visible: (m as HTMLElement).offsetParent !== null
        }))
      })
      console.log('Modals:', JSON.stringify(modals, null, 2))
    }
  }

  // === TEST DELETE: Click the delete button (but DON'T confirm) ===
  console.log('\n========== Click DELETE button ==========')
  // Re-find the note card (page may have reloaded)
  const noteCard2 = creatorPage.locator(`div.note[data-impression*="${TEST_NOTE_ID}"]`).first()
  const delBtn = noteCard2.locator('span.control.data-del').first()
  const delBtnCount = await delBtn.count()
  console.log(`Delete button found: ${delBtnCount}`)

  if (delBtnCount > 0) {
    await delBtn.click()
    await new Promise(r => setTimeout(r, 3000))

    // Check for confirmation dialog
    const dialogInfo = await creatorPage.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"], [class*="dialog"], [class*="Dialog"], [class*="confirm"]')
      return Array.from(dialogs).map(d => ({
        tag: d.tagName,
        cls: typeof d.className === 'string' ? d.className : '',
        text: d.textContent?.slice(0, 500),
        visible: (d as HTMLElement).offsetParent !== null,
        buttons: Array.from(d.querySelectorAll('button')).map(b => ({
          text: b.textContent?.trim(),
          cls: b.className.slice(0, 80)
        }))
      }))
    })
    console.log('Dialogs after delete click:', JSON.stringify(dialogInfo, null, 2))

    // Look for any overlay/popup
    const overlays = await creatorPage.evaluate(() => {
      // Check for elements that appeared recently (high z-index, position fixed/absolute)
      const allElements = document.querySelectorAll('*')
      const results: Array<{tag: string, cls: string, text: string, zIndex: string}> = []
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i] as HTMLElement
        const style = window.getComputedStyle(el)
        const zIndex = style.zIndex
        if (zIndex && parseInt(zIndex) > 1000) {
          results.push({
            tag: el.tagName,
            cls: typeof el.className === 'string' ? el.className.slice(0, 100) : '',
            text: el.textContent?.trim().slice(0, 200) || '',
            zIndex
          })
        }
      }
      return results
    })
    console.log('High z-index elements:', JSON.stringify(overlays, null, 2))

    // Press Escape to dismiss any dialog
    await creatorPage.keyboard.press('Escape')
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('\nAll API calls:', JSON.stringify(apiCalls, null, 2))

  console.log('\n\nDone. Keeping browser open for 20s...')
  await new Promise(r => setTimeout(r, 20000))
  await browser.close()
}

main().catch(console.error)
