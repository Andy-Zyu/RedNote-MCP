import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json')

async function main() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()

  const cookieData = fs.readFileSync(COOKIE_PATH, 'utf-8')
  await context.addCookies(JSON.parse(cookieData))

  const page = await context.newPage()

  // Capture IM-related API calls
  var imApiCalls: any[] = []
  page.on('response', async function(response) {
    var url = response.url()
    if (url.includes('/api/im/') || (url.includes('/im/') && url.includes('edith'))) {
      var body = ''
      try { body = (await response.text()).substring(0, 3000) } catch(e) {}
      imApiCalls.push({
        url: url,
        method: response.request().method(),
        status: response.status(),
        body: body
      })
    }
  })

  // Step 1: Go to explore page, wait for notes to load, then extract an author profile link
  console.log('=== Step 1: Getting author from explore page ===')
  await page.goto('https://www.xiaohongshu.com/explore', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 6000) })

  // Take screenshot to see what's on the page
  await page.screenshot({ path: '/tmp/explore-page.png', fullPage: false })

  // Click on a note card
  const clickResult = await page.evaluate(`
    (function() {
      // Try clicking on a note cover image/link
      var noteItems = document.querySelectorAll('section.note-item');
      if (noteItems.length > 0) {
        var link = noteItems[2].querySelector('a');
        if (link) {
          link.click();
          return 'clicked note item #2, href=' + link.getAttribute('href');
        }
      }
      return 'no note items found, total sections: ' + document.querySelectorAll('section').length;
    })()
  `)
  console.log('Click result:', clickResult)
  await new Promise(function (r) { setTimeout(r, 4000) })

  await page.screenshot({ path: '/tmp/note-detail-overlay.png', fullPage: false })

  // Now look for author profile link in the note detail
  const authorSearch = await page.evaluate(`
    (function() {
      var results = {};

      // Get all links on the page
      var allLinks = document.querySelectorAll('a[href*="/user/profile/"]');
      results.profileLinks = [];
      allLinks.forEach(function(el) {
        var href = el.getAttribute('href');
        // Skip our own profile
        if (!href.includes('69364ef00000000037033973')) {
          results.profileLinks.push({
            href: href,
            text: el.textContent.trim().substring(0, 100),
            className: el.className.toString().substring(0, 200),
            parentClass: el.parentElement ? el.parentElement.className.toString().substring(0, 200) : ''
          });
        }
      });

      // Also check the note detail overlay for author info
      var noteDetail = document.querySelector('.note-detail-mask, [class*="note-detail"]');
      if (noteDetail) {
        results.noteDetailFound = true;
        var authorEl = noteDetail.querySelector('a[href*="/user/profile/"]');
        if (authorEl) {
          results.authorInDetail = {
            href: authorEl.getAttribute('href'),
            text: authorEl.textContent.trim()
          };
        }
      }

      return results;
    })()
  `)
  console.log('Author search:', JSON.stringify(authorSearch, null, 2))

  var targetProfileUrl = null
  if (authorSearch.authorInDetail) {
    targetProfileUrl = authorSearch.authorInDetail.href
  } else if (authorSearch.profileLinks && authorSearch.profileLinks.length > 0) {
    targetProfileUrl = authorSearch.profileLinks[0].href
  }

  // Close the overlay by pressing Escape
  await page.keyboard.press('Escape')
  await new Promise(function (r) { setTimeout(r, 1000) })

  if (targetProfileUrl) {
    var fullUrl = targetProfileUrl.startsWith('http') ? targetProfileUrl : 'https://www.xiaohongshu.com' + targetProfileUrl
    console.log('\n=== Step 2: Visiting other user profile:', fullUrl, '===')
    await page.goto(fullUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await new Promise(function (r) { setTimeout(r, 5000) })

    await page.screenshot({ path: '/tmp/other-user-profile-2.png', fullPage: false })

    const profileData = await page.evaluate(`
      (function() {
        var results = {};
        results.url = window.location.href;
        results.title = document.title;

        // Get ALL buttons
        results.buttons = [];
        document.querySelectorAll('button').forEach(function(el) {
          var text = el.textContent.trim();
          if (text.length > 0 && text.length < 100) {
            results.buttons.push({
              text: text,
              className: el.className.toString().substring(0, 300),
              outerHtml: el.outerHTML.substring(0, 1000)
            });
          }
        });

        // Search for 私信 anywhere
        results.dmElements = [];
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          var text = walker.currentNode.textContent.trim();
          if (text === '私信' || text === '发消息' || text === '发私信') {
            var parent = walker.currentNode.parentElement;
            results.dmElements.push({
              text: text,
              parentTag: parent.tagName,
              parentClass: parent.className.toString().substring(0, 300),
              parentOuterHtml: parent.outerHTML.substring(0, 800),
              grandParentTag: parent.parentElement ? parent.parentElement.tagName : '',
              grandParentClass: parent.parentElement ? parent.parentElement.className.toString().substring(0, 300) : ''
            });
          }
        }

        // Get the right area
        var rightArea = document.querySelector('.info-right-area');
        if (rightArea) {
          results.rightAreaHtml = rightArea.outerHTML.substring(0, 5000);
        }

        return results;
      })()
    `)
    console.log('=== PROFILE DATA ===')
    console.log(JSON.stringify(profileData, null, 2))

    // If we found 私信, click it
    if (profileData.dmElements && profileData.dmElements.length > 0) {
      console.log('\n=== Step 3: Clicking 私信 button ===')

      // Use a more specific selector based on what we found
      var dmEl = profileData.dmElements[0]
      try {
        // Try clicking by text
        await page.getByText('私信', { exact: true }).first().click({ timeout: 5000 })
      } catch(e) {
        console.log('Could not click by text, trying parent selector...')
        try {
          await page.click('button:has-text("私信")', { timeout: 5000 })
        } catch(e2) {
          console.log('Could not click button either')
        }
      }

      await new Promise(function (r) { setTimeout(r, 6000) })
      await page.screenshot({ path: '/tmp/after-dm-click-final.png', fullPage: false })

      // Check what happened
      const afterDm = await page.evaluate(`
        (function() {
          var results = {};
          results.url = window.location.href;
          results.title = document.title;

          // Check for new overlays/modals/chat windows
          results.overlays = [];
          document.querySelectorAll('[class*="chat"], [class*="im"], [class*="message"], [class*="conversation"], [class*="whisper"], [class*="dialog"], [class*="modal"], [class*="popup"], [class*="drawer"], [class*="panel"]').forEach(function(el) {
            var style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              results.overlays.push({
                tag: el.tagName,
                className: el.className.toString().substring(0, 300),
                text: el.textContent.trim().substring(0, 500),
                outerHtml: el.outerHTML.substring(0, 3000)
              });
            }
          });

          // Check for text inputs
          results.inputs = [];
          document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [class*="editor"]').forEach(function(el) {
            results.inputs.push({
              tag: el.tagName,
              placeholder: el.getAttribute('placeholder'),
              className: el.className.toString().substring(0, 200),
              contentEditable: el.getAttribute('contenteditable')
            });
          });

          // Check for iframes
          results.iframes = [];
          document.querySelectorAll('iframe').forEach(function(el) {
            results.iframes.push({ src: el.src, className: el.className.toString() });
          });

          return results;
        })()
      `)
      console.log('=== AFTER DM CLICK ===')
      console.log(JSON.stringify(afterDm, null, 2))
    } else {
      console.log('No 私信 button found on this profile')
      // Let's check if the user has a "关注" (follow) button - maybe 私信 only shows for followed users
      console.log('Checking for follow button...')
    }
  } else {
    console.log('Could not find any other user profile link')
  }

  // Step 4: Print captured IM API calls
  console.log('\n=== Captured IM API calls ===')
  console.log(JSON.stringify(imApiCalls, null, 2))

  console.log('\n=== Done ===')
  await browser.close()
}

main().catch(console.error)
