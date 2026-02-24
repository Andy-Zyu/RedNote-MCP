/**
 * Test script Phase 2: Click reply button and explore the reply input DOM.
 * Run with: npx tsx scripts/test-reply-comment.ts
 */
import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  console.log('=== Phase 2: Test Reply Flow ===\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
  console.log(`Loaded ${cookies.length} cookies`)
  await context.addCookies(cookies)

  const page = await context.newPage()

  // Step 1: Go to homepage and get a note URL
  console.log('Step 1: Navigate to homepage')
  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle', timeout: 60000 })
  await new Promise(r => setTimeout(r, 3000))

  const noteUrl = await page.evaluate(`
    (function() {
      var links = document.querySelectorAll('a.cover.mask.ld');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && href.indexOf('/explore/') >= 0) {
          return 'https://www.xiaohongshu.com' + href;
        }
      }
      return null;
    })()
  `)
  console.log(`Note URL: ${noteUrl}`)

  // Step 2: Navigate to note
  console.log('Step 2: Navigate to note page')
  await page.goto(noteUrl as string, { waitUntil: 'networkidle', timeout: 60000 })
  await new Promise(r => setTimeout(r, 5000))

  // Step 3: Read first comment info
  console.log('\n--- Step 3: Read first comment ---')
  const firstCommentInfo = await page.evaluate(`
    (function() {
      var item = document.querySelector('.comment-item');
      if (!item) return { found: false };
      var author = item.querySelector('.author a.name');
      var content = item.querySelector('.content .note-text');
      var replyBtn = item.querySelector('.reply.icon-container');
      return {
        found: true,
        id: item.id,
        author: author ? author.textContent.trim() : '',
        content: content ? content.textContent.trim() : '',
        hasReplyBtn: !!replyBtn
      };
    })()
  `)
  console.log(`First comment:`, JSON.stringify(firstCommentInfo, null, 2))

  // Step 4: Click the reply button on the first comment
  console.log('\n--- Step 4: Click reply button ---')
  const replyBtn = page.locator('.comment-item .reply.icon-container').first()
  const replyBtnCount = await replyBtn.count()
  console.log(`Reply button count: ${replyBtnCount}`)

  if (replyBtnCount > 0) {
    await replyBtn.click()
    await new Promise(r => setTimeout(r, 2000))

    // Step 5: Explore what appeared after clicking reply
    console.log('\n--- Step 5: After clicking reply - find input elements ---')

    // Check for input/textarea elements
    const inputSelectors = [
      'textarea', 'input[type="text"]', '[contenteditable="true"]',
      '.reply-input', '[class*="reply-input"]', '[class*="replyInput"]',
      '[class*="comment-input"]', '[class*="commentInput"]',
      '[placeholder*="回复"]', '[placeholder*="评论"]',
      '.content-input', '[class*="content-input"]',
      '.content-edit', '[class*="content-edit"]',
    ]
    for (const sel of inputSelectors) {
      try {
        const count = await page.locator(sel).count()
        if (count > 0) {
          const el = page.locator(sel).first()
          const visible = await el.isVisible()
          const placeholder = await el.getAttribute('placeholder').catch(() => '')
          console.log(`  *** ${sel} => ${count} elements, visible=${visible}, placeholder="${placeholder}"`)
        }
      } catch { /* skip */ }
    }

    // Dump new elements that appeared (input area)
    console.log('\n--- Step 5b: Input area elements ---')
    const inputArea = await page.evaluate(`
      (function() {
        var results = [];
        var all = document.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          var cn = (el.className && typeof el.className === 'string') ? el.className : '';
          if (cn.toLowerCase().indexOf('input') >= 0 || cn.toLowerCase().indexOf('edit') >= 0 ||
              cn.toLowerCase().indexOf('send') >= 0 || cn.toLowerCase().indexOf('submit') >= 0 ||
              el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ||
              el.getAttribute('contenteditable') === 'true') {
            var rect = el.getBoundingClientRect();
            results.push({
              tag: el.tagName.toLowerCase(),
              className: cn.slice(0, 200),
              id: el.id || '',
              visible: rect.width > 0 && rect.height > 0,
              size: Math.round(rect.width) + 'x' + Math.round(rect.height),
              placeholder: el.getAttribute('placeholder') || '',
              contentEditable: el.getAttribute('contenteditable') || '',
              text: (el.textContent || '').slice(0, 60).trim()
            });
          }
        }
        return results;
      })()
    `)
    console.log(`Found ${(inputArea as any[]).length} input/edit elements:`)
    for (const el of (inputArea as any[]).slice(0, 20)) {
      console.log(`  <${el.tag}> class="${el.className}" id="${el.id}" ${el.size} visible=${el.visible}`)
      if (el.placeholder) console.log(`    placeholder="${el.placeholder}"`)
      if (el.contentEditable) console.log(`    contentEditable="${el.contentEditable}"`)
      if (el.text) console.log(`    text="${el.text}"`)
    }

    // Look for send/submit button
    console.log('\n--- Step 5c: Send/submit buttons ---')
    const sendBtns = await page.evaluate(`
      (function() {
        var results = [];
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          var node = walker.currentNode;
          var text = (node.textContent || '').trim();
          if (text === '发送' || text === '提交' || text === '发布') {
            var el = node.parentElement;
            if (el) {
              var rect = el.getBoundingClientRect();
              results.push({
                tag: el.tagName.toLowerCase(),
                className: (typeof el.className === 'string' ? el.className : '').slice(0, 150),
                parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : '',
                parentClass: (el.parentElement && typeof el.parentElement.className === 'string') ? el.parentElement.className.slice(0, 150) : '',
                text: text,
                visible: rect.width > 0 && rect.height > 0,
                size: Math.round(rect.width) + 'x' + Math.round(rect.height)
              });
            }
          }
        }
        return results;
      })()
    `)
    console.log(`Found ${(sendBtns as any[]).length} send/submit elements:`)
    for (const el of (sendBtns as any[]).slice(0, 10)) {
      console.log(`  <${el.tag}> class="${el.className}" ${el.size} visible=${el.visible} text="${el.text}"`)
      console.log(`    parent: <${el.parentTag}> class="${el.parentClass}"`)
    }

    // Dump the bottom input bar area
    console.log('\n--- Step 5d: Bottom input bar ---')
    const bottomBar = await page.evaluate(`
      (function() {
        // The input bar is usually at the bottom of the interaction container
        var container = document.querySelector('.interaction-container');
        if (!container) return { found: false };
        // Get the last few children
        var children = container.children;
        var results = [];
        for (var i = 0; i < children.length; i++) {
          var el = children[i];
          var cn = (el.className && typeof el.className === 'string') ? el.className : '';
          var rect = el.getBoundingClientRect();
          results.push({
            tag: el.tagName.toLowerCase(),
            className: cn.slice(0, 200),
            childCount: el.children.length,
            size: Math.round(rect.width) + 'x' + Math.round(rect.height),
            top: Math.round(rect.top),
            html: el.outerHTML.slice(0, 1500)
          });
        }
        return { found: true, items: results };
      })()
    `)
    if ((bottomBar as any).found) {
      for (const item of (bottomBar as any).items) {
        console.log(`  <${item.tag}> class="${item.className}" ${item.size} top=${item.top} children=${item.childCount}`)
        console.log(`    HTML: ${item.html.slice(0, 500)}`)
      }
    }
  }

  // Screenshot
  const screenshotPath = path.join(os.tmpdir(), 'xhs-reply-flow.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`\nScreenshot: ${screenshotPath}`)

  console.log('\n=== Done. Browser closes in 30s. ===')
  await new Promise(r => setTimeout(r, 30000))
  await browser.close()
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
