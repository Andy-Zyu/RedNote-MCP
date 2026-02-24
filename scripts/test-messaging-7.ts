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

  // Capture ALL IM-related network traffic
  var imTraffic: any[] = []
  page.on('response', async function(response) {
    var url = response.url()
    if (url.includes('/api/im/') || url.includes('/api/sns/web') && (url.includes('chat') || url.includes('message') || url.includes('whisper'))) {
      var body = ''
      try { body = (await response.text()).substring(0, 5000) } catch(e) {}
      imTraffic.push({ url, method: response.request().method(), status: response.status(), body })
    }
  })

  // Step 1: Use the search page to find users
  console.log('=== Step 1: Search for users ===')
  await page.goto('https://www.xiaohongshu.com/explore', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 3000) })

  // Type in search box and search
  await page.fill('#search-input', '美食')
  await page.keyboard.press('Enter')
  await new Promise(function (r) { setTimeout(r, 5000) })

  await page.screenshot({ path: '/tmp/search-results.png', fullPage: false })

  // Get the current URL and page content
  const searchPageInfo = await page.evaluate(`
    (function() {
      var results = {};
      results.url = window.location.href;

      // Find all user profile links
      var profileLinks = document.querySelectorAll('a[href*="/user/profile/"]');
      results.profileLinks = [];
      profileLinks.forEach(function(el) {
        var href = el.getAttribute('href');
        if (!href.includes('69364ef00000000037033973')) {
          results.profileLinks.push({
            href: href,
            text: el.textContent.trim().substring(0, 100)
          });
        }
      });

      // Find note author elements - they might use different selectors
      var authorEls = document.querySelectorAll('[class*="author"], [class*="user-name"], .name');
      results.authorElements = [];
      authorEls.forEach(function(el) {
        var link = el.closest('a') || el.querySelector('a');
        results.authorElements.push({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 100),
          className: el.className.toString().substring(0, 200),
          linkHref: link ? link.getAttribute('href') : null
        });
      });

      // Get note items and their author info
      var noteItems = document.querySelectorAll('section.note-item, [class*="note-item"]');
      results.noteItems = [];
      for (var i = 0; i < Math.min(noteItems.length, 5); i++) {
        var item = noteItems[i];
        var authorLink = item.querySelector('a[href*="/user/profile/"]');
        var authorName = item.querySelector('[class*="author"], .name, [class*="nickname"]');
        results.noteItems.push({
          authorHref: authorLink ? authorLink.getAttribute('href') : null,
          authorText: authorName ? authorName.textContent.trim() : null,
          innerHTML: item.innerHTML.substring(0, 1000)
        });
      }

      return results;
    })()
  `)
  console.log('Search page info:', JSON.stringify(searchPageInfo, null, 2))

  // Find a profile to visit
  var targetProfile = null
  if (searchPageInfo.profileLinks.length > 0) {
    targetProfile = searchPageInfo.profileLinks[0].href
  } else if (searchPageInfo.noteItems.length > 0) {
    for (var item of searchPageInfo.noteItems) {
      if (item.authorHref && !item.authorHref.includes('69364ef00000000037033973')) {
        targetProfile = item.authorHref
        break
      }
    }
  }

  if (!targetProfile) {
    // Try extracting from innerHTML
    for (var item of searchPageInfo.noteItems) {
      var match = item.innerHTML.match(/\/user\/profile\/([a-f0-9]+)/)
      if (match && !match[0].includes('69364ef00000000037033973')) {
        targetProfile = match[0]
        break
      }
    }
  }

  console.log('Target profile:', targetProfile)

  if (targetProfile) {
    var fullUrl = targetProfile.startsWith('http') ? targetProfile : 'https://www.xiaohongshu.com' + targetProfile
    console.log('\n=== Step 2: Visiting profile:', fullUrl, '===')
    await page.goto(fullUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await new Promise(function (r) { setTimeout(r, 5000) })

    await page.screenshot({ path: '/tmp/target-user-profile.png', fullPage: false })

    // Get complete profile page analysis
    const profileAnalysis = await page.evaluate(`
      (function() {
        var results = {};
        results.url = window.location.href;
        results.title = document.title;

        // Get ALL buttons with their full context
        results.buttons = [];
        document.querySelectorAll('button').forEach(function(el) {
          var text = el.textContent.trim();
          if (text.length > 0 && text.length < 100) {
            results.buttons.push({
              text: text,
              className: el.className.toString().substring(0, 300),
              outerHtml: el.outerHTML.substring(0, 1000),
              visible: window.getComputedStyle(el).display !== 'none'
            });
          }
        });

        // Search for ANY messaging-related text
        results.messagingText = [];
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          var text = walker.currentNode.textContent.trim();
          if (['私信', '发消息', '发私信', '聊天', 'message', 'chat'].includes(text.toLowerCase())) {
            var parent = walker.currentNode.parentElement;
            results.messagingText.push({
              text: text,
              parentTag: parent.tagName,
              parentClass: parent.className.toString().substring(0, 300),
              parentOuterHtml: parent.outerHTML.substring(0, 1000),
              grandParentOuterHtml: parent.parentElement ? parent.parentElement.outerHTML.substring(0, 1000) : ''
            });
          }
        }

        // Get the info-right-area (where action buttons are)
        var rightArea = document.querySelector('.info-right-area');
        results.rightAreaHtml = rightArea ? rightArea.outerHTML : 'NOT FOUND';

        // Get the full user-info section
        var userInfo = document.querySelector('.user-info');
        results.userInfoHtml = userInfo ? userInfo.outerHTML.substring(0, 8000) : 'NOT FOUND';

        return results;
      })()
    `)
    console.log('=== PROFILE ANALYSIS ===')
    console.log(JSON.stringify(profileAnalysis, null, 2))

    // If 私信 found, click it and analyze
    if (profileAnalysis.messagingText.length > 0) {
      console.log('\n=== Step 3: Found messaging element! Clicking... ===')
      try {
        await page.getByText('私信', { exact: true }).first().click({ timeout: 5000 })
        await new Promise(function (r) { setTimeout(r, 6000) })
        await page.screenshot({ path: '/tmp/dm-opened.png', fullPage: false })

        const dmState = await page.evaluate(`
          (function() {
            var results = {};
            results.url = window.location.href;

            // Full page analysis after DM click
            results.newElements = [];
            document.querySelectorAll('*').forEach(function(el) {
              var cls = el.className.toString();
              if (cls.match(/chat|im-|message|conversation|whisper|dialog|modal|popup|drawer|panel|editor/i)) {
                var style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0) {
                  results.newElements.push({
                    tag: el.tagName,
                    className: cls.substring(0, 300),
                    text: el.textContent.trim().substring(0, 500),
                    rect: { w: el.offsetWidth, h: el.offsetHeight },
                    outerHtml: el.outerHTML.substring(0, 3000)
                  });
                }
              }
            });

            // Inputs
            results.inputs = [];
            document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]').forEach(function(el) {
              results.inputs.push({
                tag: el.tagName,
                placeholder: el.getAttribute('placeholder'),
                className: el.className.toString().substring(0, 200)
              });
            });

            return results;
          })()
        `)
        console.log('=== DM STATE ===')
        console.log(JSON.stringify(dmState, null, 2))
      } catch(e) {
        console.log('Error clicking 私信:', e)
      }
    }
  }

  // Print IM traffic
  console.log('\n=== IM Network Traffic ===')
  console.log(JSON.stringify(imTraffic, null, 2))

  console.log('\n=== Done ===')
  await browser.close()
}

main().catch(console.error)
