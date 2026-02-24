/**
 * Test script: Find a live note, then explore engagement bar DOM.
 * Run with: npx tsx scripts/test-like-note.ts
 */
import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  console.log('=== Engagement Bar DOM Explorer v4 ===\n')

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })

  const cookies = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'))
  console.log(`Loaded ${cookies.length} cookies`)
  await context.addCookies(cookies)

  const page = await context.newPage()

  // Step 1: Go to homepage and find a real note URL
  console.log('Step 1: Go to homepage')
  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'networkidle', timeout: 60000 })
  await new Promise(r => setTimeout(r, 5000))

  const noteUrl = await page.evaluate(`
    (() => {
      var links = document.querySelectorAll('a.cover.mask.ld');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && href.indexOf('/explore/') >= 0) {
          return 'https://www.xiaohongshu.com' + href;
        }
      }
      // fallback: any section link
      var sections = document.querySelectorAll('section a[href*="/explore/"]');
      for (var i = 0; i < sections.length; i++) {
        var href = sections[i].getAttribute('href');
        if (href) return 'https://www.xiaohongshu.com' + href;
      }
      return null;
    })()
  `)
  console.log(`Found note URL: ${noteUrl}`)

  if (!noteUrl) {
    console.log('ERROR: Could not find any note URL on homepage')
    await browser.close()
    return
  }

  // Step 2: Navigate to the note
  console.log(`\nStep 2: Navigate to note`)
  await page.goto(noteUrl as string, { waitUntil: 'networkidle', timeout: 60000 })
  await new Promise(r => setTimeout(r, 5000))
  console.log(`Current URL: ${page.url()}`)
  console.log(`Title: ${await page.title()}`)

  // Step 3: Check if we're on a valid note page
  const pageCheck = await page.evaluate(`
    (() => {
      return {
        url: window.location.href,
        is404: document.title.indexOf('不见了') >= 0 || window.location.pathname.indexOf('/404') >= 0,
        elementCount: document.querySelectorAll('*').length,
      };
    })()
  `)
  console.log(`Page check: ${JSON.stringify(pageCheck)}`)

  if ((pageCheck as any).is404) {
    console.log('ERROR: Note page is 404, trying another note...')
    await browser.close()
    return
  }

  // === ENGAGEMENT BAR SCAN ===
  console.log('\n========================================')
  console.log('=== ENGAGEMENT BAR SCAN ===')
  console.log('========================================')

  const engageScan = await page.evaluate(`
    (() => {
      var results = [];
      var keywords = ['like', 'collect', 'follow', 'interact', 'engage', 'author', 'note-container', 'detail', 'chat', 'comment', 'share'];
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var cn = (typeof el.className === 'string') ? el.className : '';
        var lower = cn.toLowerCase();
        for (var k = 0; k < keywords.length; k++) {
          if (lower.indexOf(keywords[k]) >= 0) {
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              results.push({
                keyword: keywords[k],
                tag: el.tagName.toLowerCase(),
                className: cn.substring(0, 300),
                size: Math.round(rect.width) + 'x' + Math.round(rect.height),
                top: Math.round(rect.top),
                left: Math.round(rect.left),
              });
            }
            break;
          }
        }
      }
      return results;
    })()
  `)
  console.log(JSON.stringify(engageScan, null, 2))

  // === INTERACT CONTAINER ===
  console.log('\n=== INTERACT CONTAINER ===')
  const interactHTML = await page.evaluate(`
    (() => {
      var el = document.querySelector('.interact-container') || document.querySelector('.engage-bar') || document.querySelector('.engage-bar-style');
      if (!el) return 'NOT FOUND';
      return el.outerHTML.substring(0, 5000);
    })()
  `)
  console.log(interactHTML)

  // === LIKE WRAPPER ===
  console.log('\n=== LIKE WRAPPER ===')
  const likeHTML = await page.evaluate(`
    (() => {
      var el = document.querySelector('.like-wrapper');
      if (!el) return 'NOT FOUND';
      return {
        outerHTML: el.outerHTML.substring(0, 2000),
        classes: Array.from(el.classList),
        parentClasses: el.parentElement ? Array.from(el.parentElement.classList) : [],
      };
    })()
  `)
  console.log(JSON.stringify(likeHTML, null, 2))

  // === COLLECT WRAPPER ===
  console.log('\n=== COLLECT WRAPPER ===')
  const collectHTML = await page.evaluate(`
    (() => {
      var el = document.querySelector('.collect-wrapper');
      if (!el) return 'NOT FOUND';
      return {
        outerHTML: el.outerHTML.substring(0, 2000),
        classes: Array.from(el.classList),
        parentClasses: el.parentElement ? Array.from(el.parentElement.classList) : [],
      };
    })()
  `)
  console.log(JSON.stringify(collectHTML, null, 2))

  // === AUTHOR / FOLLOW ===
  console.log('\n=== AUTHOR / FOLLOW ===')
  const authorHTML = await page.evaluate(`
    (() => {
      var el = document.querySelector('.author-container') || document.querySelector('.author-wrapper');
      if (!el) return 'NOT FOUND';
      return el.outerHTML.substring(0, 3000);
    })()
  `)
  console.log(authorHTML)

  // === FOLLOW BUTTON SEARCH ===
  console.log('\n=== FOLLOW BUTTON SEARCH ===')
  const followSearch = await page.evaluate(`
    (() => {
      var results = [];
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        var text = (el.textContent || '').trim();
        var cn = (typeof el.className === 'string') ? el.className : '';
        // Only leaf-ish elements with follow text
        if ((text === '关注' || text === '+关注' || text === '+ 关注' || text === '已关注') && el.children.length <= 2) {
          var rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            results.push({
              text: text,
              tag: el.tagName.toLowerCase(),
              className: cn.substring(0, 200),
              parentClass: (el.parentElement && typeof el.parentElement.className === 'string') ? el.parentElement.className.substring(0, 200) : '',
              size: Math.round(rect.width) + 'x' + Math.round(rect.height),
              top: Math.round(rect.top),
              outerHTML: el.outerHTML.substring(0, 500),
            });
          }
        }
      }
      return results;
    })()
  `)
  console.log(JSON.stringify(followSearch, null, 2))

  // === TEXT SEARCH for counts ===
  console.log('\n=== TEXT SEARCH (counts) ===')
  const textSearch = await page.evaluate(`
    (() => {
      var results = [];
      var wrappers = document.querySelectorAll('.like-wrapper .count, .collect-wrapper .count, .chat-wrapper .count, .share-wrapper .count');
      for (var i = 0; i < wrappers.length; i++) {
        var el = wrappers[i];
        results.push({
          text: (el.textContent || '').trim(),
          className: (typeof el.className === 'string' ? el.className : '').substring(0, 200),
          parentClass: (el.parentElement && typeof el.parentElement.className === 'string') ? el.parentElement.className.substring(0, 200) : '',
        });
      }
      return results;
    })()
  `)
  console.log(JSON.stringify(textSearch, null, 2))

  // Screenshot
  const screenshotPath = path.join(os.tmpdir(), 'xhs-engagement-bar.png')
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`\nScreenshot saved: ${screenshotPath}`)

  console.log('\n=== Done. Browser closes in 15s. ===')
  await new Promise(r => setTimeout(r, 15000))
  await browser.close()
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
