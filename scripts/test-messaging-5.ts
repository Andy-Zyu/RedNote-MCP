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
    if (url.includes('/api/im/') || url.includes('/im/') && url.includes('edith')) {
      var body = ''
      try { body = (await response.text()).substring(0, 3000) } catch(e) {}
      imApiCalls.push({
        url: url,
        method: response.request().method(),
        status: response.status(),
        headers: Object.fromEntries(Object.entries(response.request().headers()).filter(function(e) { return e[0].startsWith('x-') || e[0] === 'cookie' || e[0] === 'authorization' })),
        body: body
      })
    }
  })

  // Step 1: Go to explore, click on a note to open the overlay, find the author
  console.log('=== Step 1: Finding another user via explore page ===')
  await page.goto('https://www.xiaohongshu.com/explore', {
    waitUntil: 'networkidle',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 3000) })

  // Click on the first note card to open the note detail overlay
  const noteClicked = await page.evaluate(`
    (function() {
      var sections = document.querySelectorAll('section.note-item');
      if (sections.length > 0) {
        sections[0].querySelector('a').click();
        return true;
      }
      var covers = document.querySelectorAll('a.cover');
      if (covers.length > 0) {
        covers[0].click();
        return true;
      }
      return false;
    })()
  `)
  console.log('Note clicked:', noteClicked)
  await new Promise(function (r) { setTimeout(r, 4000) })

  // Now find the author link in the note detail overlay
  const noteDetailInfo = await page.evaluate(`
    (function() {
      var results = {};
      // Look for note detail overlay/modal
      var overlay = document.querySelector('[class*="note-detail"], [class*="note-container"], [class*="detail-container"]');
      if (overlay) {
        results.overlayFound = true;
        results.overlayClass = overlay.className.toString().substring(0, 300);
      }

      // Find author links that are NOT our own profile
      var authorLinks = document.querySelectorAll('a[href*="/user/profile/"]');
      results.authorLinks = [];
      authorLinks.forEach(function(el) {
        var href = el.getAttribute('href');
        if (!href.includes('69364ef00000000037033973')) {
          results.authorLinks.push({
            href: href,
            text: el.textContent.trim().substring(0, 100),
            className: el.className.toString().substring(0, 200)
          });
        }
      });

      // Also look for author name element
      var authorName = document.querySelector('.author-wrapper .username, .note-detail .author .name, [class*="author"] .name');
      if (authorName) {
        results.authorName = authorName.textContent.trim();
      }

      return results;
    })()
  `)
  console.log('Note detail:', JSON.stringify(noteDetailInfo, null, 2))

  // Navigate to the first non-self author profile
  var targetProfile = null
  if (noteDetailInfo.authorLinks && noteDetailInfo.authorLinks.length > 0) {
    targetProfile = noteDetailInfo.authorLinks[0].href
  }

  if (!targetProfile) {
    // Fallback: search for a user
    console.log('No author found in overlay, trying search...')
    await page.goto('https://www.xiaohongshu.com/search_result?keyword=美食博主&source=web_search_result_note&search_type=user', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    await new Promise(function (r) { setTimeout(r, 4000) })

    const searchResults = await page.evaluate(`
      (function() {
        var results = {};
        var userLinks = document.querySelectorAll('a[href*="/user/profile/"]');
        results.userLinks = [];
        userLinks.forEach(function(el) {
          var href = el.getAttribute('href');
          if (!href.includes('69364ef00000000037033973')) {
            results.userLinks.push({
              href: href,
              text: el.textContent.trim().substring(0, 100)
            });
          }
        });
        // Also get page HTML snippet
        results.mainHtml = document.querySelector('.main-content, .search-result-container, #app')?.innerHTML?.substring(0, 3000) || 'NOT FOUND';
        return results;
      })()
    `)
    console.log('Search results:', JSON.stringify(searchResults, null, 2))

    if (searchResults.userLinks && searchResults.userLinks.length > 0) {
      targetProfile = searchResults.userLinks[0].href
    }
  }

  if (targetProfile) {
    var profileUrl = targetProfile.startsWith('http') ? targetProfile : 'https://www.xiaohongshu.com' + targetProfile
    console.log('\n=== Step 2: Visiting profile:', profileUrl, '===')
    await page.goto(profileUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    })
    await new Promise(function (r) { setTimeout(r, 5000) })

    await page.screenshot({ path: '/tmp/target-profile.png', fullPage: false })

    const profileInfo = await page.evaluate(`
      (function() {
        var results = {};
        results.url = window.location.href;
        results.title = document.title;

        // Get ALL text content of buttons
        results.allButtons = [];
        document.querySelectorAll('button, [role="button"]').forEach(function(el) {
          var text = el.textContent.trim();
          if (text.length > 0 && text.length < 100) {
            results.allButtons.push({
              text: text,
              className: el.className.toString().substring(0, 300),
              outerHtml: el.outerHTML.substring(0, 800)
            });
          }
        });

        // Search for 私信 in ANY element
        results.dmSearch = [];
        document.querySelectorAll('*').forEach(function(el) {
          if (el.children.length === 0) {
            var text = (el.textContent || '').trim();
            if (text === '私信' || text === '发消息' || text === '发私信' || text === '聊天') {
              results.dmSearch.push({
                tag: el.tagName,
                text: text,
                className: el.className.toString().substring(0, 200),
                parentTag: el.parentElement?.tagName,
                parentClass: el.parentElement?.className?.toString()?.substring(0, 200),
                outerHtml: el.outerHTML.substring(0, 500),
                parentOuterHtml: el.parentElement?.outerHTML?.substring(0, 800)
              });
            }
          }
        });

        // Get the right area of user info (where follow/message buttons typically are)
        var rightArea = document.querySelector('.info-right-area');
        results.rightAreaHtml = rightArea ? rightArea.outerHTML.substring(0, 3000) : 'NOT FOUND';

        // Get the interactions area
        var interactions = document.querySelector('.user-interactions, [class*="interactions"]');
        results.interactionsHtml = interactions ? interactions.outerHTML.substring(0, 2000) : 'NOT FOUND';

        return results;
      })()
    `)
    console.log('=== PROFILE INFO ===')
    console.log(JSON.stringify(profileInfo, null, 2))

    // Step 3: If 私信 found, click it
    if (profileInfo.dmSearch && profileInfo.dmSearch.length > 0) {
      console.log('\n=== Step 3: Found DM element! Clicking... ===')
      try {
        await page.click('text=私信', { timeout: 5000 })
      } catch(e) {
        try {
          await page.click('text=发消息', { timeout: 5000 })
        } catch(e2) {
          console.log('Could not click DM button')
        }
      }
      await new Promise(function (r) { setTimeout(r, 5000) })

      await page.screenshot({ path: '/tmp/after-dm-click-3.png', fullPage: false })

      // Analyze what happened
      const afterDm = await page.evaluate(`
        (function() {
          var results = {};
          results.url = window.location.href;

          // Look for chat/IM elements
          results.newElements = [];
          document.querySelectorAll('[class*="chat"], [class*="im-"], [class*="message"], [class*="conversation"], [class*="whisper"], [class*="dialog"], [class*="modal"], [class*="popup"], [class*="drawer"]').forEach(function(el) {
            results.newElements.push({
              tag: el.tagName,
              className: el.className.toString().substring(0, 300),
              text: el.textContent.trim().substring(0, 300),
              childCount: el.children.length,
              outerHtml: el.outerHTML.substring(0, 2000)
            });
          });

          // Look for text inputs
          results.inputs = [];
          document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [class*="editor"]').forEach(function(el) {
            results.inputs.push({
              tag: el.tagName,
              placeholder: el.getAttribute('placeholder'),
              className: el.className.toString().substring(0, 200)
            });
          });

          return results;
        })()
      `)
      console.log('=== AFTER DM CLICK ===')
      console.log(JSON.stringify(afterDm, null, 2))
    }
  } else {
    console.log('Could not find any other user profile to visit')
  }

  // Step 4: Try IM API with page context (using page.evaluate for same-origin)
  console.log('\n=== Step 4: Testing IM APIs from page context ===')

  // First get cookies and headers the page uses
  const cookies = await context.cookies()
  const xhsCookies = cookies.filter(function(c) { return c.domain.includes('xiaohongshu') })
  console.log('XHS cookie names:', xhsCookies.map(function(c) { return c.name }))

  // Navigate to xiaohongshu.com first for same-origin
  await page.goto('https://edith.xiaohongshu.com/api/im/redmoji/version', {
    waitUntil: 'networkidle',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 2000) })
  const versionResponse = await page.evaluate(`document.body.innerText`)
  console.log('Version API direct:', versionResponse)

  // Try conversation list
  await page.goto('https://www.xiaohongshu.com/explore', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 3000) })

  // Use XMLHttpRequest instead of fetch to avoid CORS
  const apiTests = await page.evaluate(`
    (function() {
      var results = [];
      var endpoints = [
        '/api/im/redmoji/version',
        '/api/im/v1/conversation/list',
        '/api/im/v2/conversation/list',
      ];

      var promises = endpoints.map(function(ep) {
        return new Promise(function(resolve) {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', 'https://edith.xiaohongshu.com' + ep, true);
          xhr.withCredentials = true;
          xhr.onload = function() {
            resolve({ endpoint: ep, status: xhr.status, body: xhr.responseText.substring(0, 1000) });
          };
          xhr.onerror = function() {
            resolve({ endpoint: ep, error: 'XHR error' });
          };
          xhr.send();
        });
      });

      return Promise.all(promises);
    })()
  `)
  console.log('API test results:', JSON.stringify(apiTests, null, 2))

  // Step 5: Print all captured IM API calls
  console.log('\n=== Step 5: All captured IM API calls ===')
  console.log(JSON.stringify(imApiCalls, null, 2))

  console.log('\n=== Exploration Complete ===')
  await browser.close()
}

main().catch(console.error)
