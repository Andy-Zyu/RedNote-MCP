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

  // Capture ALL network requests related to IM
  var imApiRequests: Array<{url: string, method: string, postData?: string, responseStatus?: number, responseBody?: string}> = []

  page.on('response', async function(response) {
    var url = response.url()
    if (url.includes('/api/im/') || url.includes('/api/sns/web/v1/im') || url.includes('whisper') || url.includes('chat/list')) {
      var body = ''
      try {
        body = await response.text()
        if (body.length > 2000) body = body.substring(0, 2000) + '...'
      } catch(e) {}
      imApiRequests.push({
        url: url,
        method: response.request().method(),
        postData: response.request().postData() || undefined,
        responseStatus: response.status(),
        responseBody: body
      })
    }
  })

  // Step 1: Visit another user's profile (a known popular user)
  console.log('=== Step 1: Visit another user profile ===')
  // Let's find a user from the explore page
  await page.goto('https://www.xiaohongshu.com/explore', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 5000) })

  // Click on the first note to get to a note detail page
  const firstNoteLink = await page.evaluate(`
    (function() {
      // Try different selectors for note items
      var links = document.querySelectorAll('a[href*="/explore/"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        if (href && href.match(/\\/explore\\/[a-f0-9]+/)) {
          return href;
        }
      }
      // Try section.note-item
      var sections = document.querySelectorAll('section.note-item a');
      for (var i = 0; i < sections.length; i++) {
        var href = sections[i].getAttribute('href');
        if (href) return href;
      }
      return null;
    })()
  `)
  console.log('First note link:', firstNoteLink)

  if (firstNoteLink) {
    var noteUrl = firstNoteLink.startsWith('http') ? firstNoteLink : 'https://www.xiaohongshu.com' + firstNoteLink
    await page.goto(noteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await new Promise(function (r) { setTimeout(r, 4000) })

    // Find the author's profile link
    const authorInfo = await page.evaluate(`
      (function() {
        var results = {};
        // Look for author links
        var authorLinks = document.querySelectorAll('a[href*="/user/profile/"]');
        results.authorLinks = [];
        authorLinks.forEach(function(el) {
          results.authorLinks.push({
            href: el.getAttribute('href'),
            text: el.textContent.trim().substring(0, 100),
            className: el.className.toString().substring(0, 200)
          });
        });
        return results;
      })()
    `)
    console.log('Author info:', JSON.stringify(authorInfo, null, 2))

    // Navigate to the first author's profile (not our own)
    var authorLink = null
    for (var link of authorInfo.authorLinks) {
      if (!link.href.includes('69364ef00000000037033973')) {
        authorLink = link.href
        break
      }
    }

    if (authorLink) {
      var profileUrl = authorLink.startsWith('http') ? authorLink : 'https://www.xiaohongshu.com' + authorLink
      console.log('\n=== Step 2: Visiting other user profile:', profileUrl, '===')
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      await new Promise(function (r) { setTimeout(r, 5000) })

      await page.screenshot({ path: '/tmp/other-profile.png', fullPage: false })

      const profileButtons = await page.evaluate(`
        (function() {
          var results = {};
          results.url = window.location.href;

          // Get ALL buttons and clickable elements in the user info area
          var userInfo = document.querySelector('.user-info, [class*="info-part"]');
          if (userInfo) {
            results.userInfoButtons = [];
            var buttons = userInfo.querySelectorAll('button, [role="button"], a, [class*="btn"], [class*="follow"], [class*="message"]');
            buttons.forEach(function(el) {
              results.userInfoButtons.push({
                tag: el.tagName,
                text: el.textContent.trim().substring(0, 100),
                className: el.className.toString().substring(0, 300),
                outerHtml: el.outerHTML.substring(0, 800)
              });
            });
          }

          // Search for 私信 anywhere on page
          var allEls = document.querySelectorAll('*');
          results.dmElements = [];
          for (var i = 0; i < allEls.length; i++) {
            var el = allEls[i];
            var text = (el.textContent || '').trim();
            if (text === '私信' || text === '发消息' || text === '发私信') {
              results.dmElements.push({
                tag: el.tagName,
                className: el.className.toString().substring(0, 300),
                text: text,
                parentTag: el.parentElement ? el.parentElement.tagName : '',
                parentClass: el.parentElement ? el.parentElement.className.toString().substring(0, 300) : '',
                outerHtml: el.outerHTML.substring(0, 500)
              });
            }
          }

          // Get the info-right-area which typically has follow/message buttons
          var rightArea = document.querySelector('.info-right-area, [class*="right-area"]');
          if (rightArea) {
            results.rightAreaHtml = rightArea.outerHTML.substring(0, 3000);
          }

          // Get all buttons on page
          results.allButtons = [];
          var allBtns = document.querySelectorAll('button');
          allBtns.forEach(function(el) {
            var text = el.textContent.trim();
            if (text.length > 0 && text.length < 50) {
              results.allButtons.push({
                text: text,
                className: el.className.toString().substring(0, 200)
              });
            }
          });

          return results;
        })()
      `)
      console.log('=== OTHER USER PROFILE BUTTONS ===')
      console.log(JSON.stringify(profileButtons, null, 2))

      // Step 3: If we found a 私信 button, click it
      if (profileButtons.dmElements && profileButtons.dmElements.length > 0) {
        console.log('\n=== Step 3: Found 私信 button! Clicking... ===')
        // Click the 私信 element
        await page.click('text=私信')
        await new Promise(function (r) { setTimeout(r, 5000) })

        await page.screenshot({ path: '/tmp/after-dm-click-2.png', fullPage: false })

        const afterClick = await page.evaluate(`
          (function() {
            var results = {};
            results.url = window.location.href;
            results.title = document.title;

            // Check for chat/IM elements
            var chatEls = document.querySelectorAll('[class*="chat"], [class*="im-"], [class*="message-"], [class*="conversation"], [class*="whisper"], [class*="dialog"], [class*="modal"], [class*="popup"]');
            results.chatElements = [];
            chatEls.forEach(function(el) {
              results.chatElements.push({
                tag: el.tagName,
                className: el.className.toString().substring(0, 300),
                childCount: el.children.length,
                text: el.textContent.trim().substring(0, 200),
                outerHtml: el.outerHTML.substring(0, 1500)
              });
            });

            // Check for input fields (message input)
            var inputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"], [class*="editor"]');
            results.inputs = [];
            inputs.forEach(function(el) {
              results.inputs.push({
                tag: el.tagName,
                placeholder: el.getAttribute('placeholder'),
                className: el.className.toString().substring(0, 200),
                contentEditable: el.getAttribute('contenteditable')
              });
            });

            // Check for iframes
            var iframes = document.querySelectorAll('iframe');
            results.iframes = [];
            iframes.forEach(function(el) {
              results.iframes.push({ src: el.src });
            });

            // Full body structure
            results.bodyChildCount = document.body.children.length;
            var bodyChildren = [];
            for (var i = 0; i < document.body.children.length; i++) {
              var child = document.body.children[i];
              bodyChildren.push({
                tag: child.tagName,
                id: child.id,
                className: child.className.toString().substring(0, 200),
                childCount: child.children.length
              });
            }
            results.bodyChildren = bodyChildren;

            return results;
          })()
        `)
        console.log('=== AFTER DM CLICK ===')
        console.log(JSON.stringify(afterClick, null, 2))
      } else {
        console.log('\nNo 私信 button found. Checking if there is a follow button...')
        // Maybe we need to look at the button area more carefully
        const buttonArea = await page.evaluate(`
          (function() {
            var area = document.querySelector('.info-right-area');
            if (area) return area.outerHTML;
            // Try broader search
            var infoPart = document.querySelector('.info-part');
            if (infoPart) return infoPart.outerHTML.substring(0, 5000);
            return 'NOT FOUND';
          })()
        `)
        console.log('Button area HTML:', buttonArea)
      }
    }
  }

  // Step 4: Check captured IM API requests
  console.log('\n=== Step 4: Captured IM API requests ===')
  console.log(JSON.stringify(imApiRequests, null, 2))

  // Step 5: Try calling IM API directly
  console.log('\n=== Step 5: Trying IM API endpoints ===')

  // Try conversation list API
  var apiEndpoints = [
    'https://edith.xiaohongshu.com/api/im/redmoji/version',
    'https://edith.xiaohongshu.com/api/im/v1/conversation/list',
    'https://edith.xiaohongshu.com/api/im/v2/conversation/list',
    'https://edith.xiaohongshu.com/api/sns/web/v1/im/conversations',
  ]

  for (var endpoint of apiEndpoints) {
    try {
      var response = await page.evaluate(`
        (function() {
          return fetch('${endpoint}', {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            }
          }).then(function(r) {
            return r.text().then(function(body) {
              return { status: r.status, body: body.substring(0, 1000) };
            });
          }).catch(function(e) {
            return { error: e.message };
          });
        })()
      `)
      console.log('API:', endpoint)
      console.log('Response:', JSON.stringify(response, null, 2))
    } catch(e) {
      console.log('Error calling', endpoint, ':', e)
    }
  }

  console.log('\n=== Exploration Complete ===')
  await browser.close()
}

main().catch(console.error)
