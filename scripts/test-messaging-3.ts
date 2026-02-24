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

  // Step 1: Visit a user profile page and look for "send message" / "私信" button
  console.log('=== Step 1: Checking user profile for messaging button ===')
  // Use the logged-in user's own profile first
  await page.goto('https://www.xiaohongshu.com/user/profile/69364ef00000000037033973', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 5000) })

  const profileInfo = await page.evaluate(`
    (function() {
      var results = {};
      results.url = window.location.href;
      results.title = document.title;

      // Look for messaging/DM buttons
      var allButtons = document.querySelectorAll('button, [role="button"]');
      results.buttons = [];
      allButtons.forEach(function(el) {
        var text = el.textContent.trim();
        if (text.length > 0 && text.length < 50) {
          results.buttons.push({
            tag: el.tagName,
            text: text,
            className: el.className.toString().substring(0, 200),
            outerHtml: el.outerHTML.substring(0, 500)
          });
        }
      });

      // Look for any element with "私信" text
      var allEls = document.querySelectorAll('*');
      results.dmElements = [];
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var text = (el.textContent || '').trim();
        if (el.children.length === 0 && text.includes('私信')) {
          results.dmElements.push({
            tag: el.tagName,
            className: el.className.toString().substring(0, 200),
            text: text.substring(0, 100),
            parentClass: el.parentElement ? el.parentElement.className.toString().substring(0, 200) : '',
            outerHtml: el.outerHTML.substring(0, 300)
          });
        }
      }

      // Look for user interaction area
      var interactArea = document.querySelector('[class*="interact"], [class*="action"], [class*="user-info"]');
      if (interactArea) {
        results.interactHtml = interactArea.outerHTML.substring(0, 3000);
      }

      return results;
    })()
  `)
  console.log('=== OWN PROFILE ===')
  console.log(JSON.stringify(profileInfo, null, 2))

  // Step 2: Visit another user's profile to see if there's a "私信" button
  console.log('\n=== Step 2: Checking another user profile ===')
  // Search for a popular user first
  await page.goto('https://www.xiaohongshu.com/search_result?keyword=美食&source=web_explore_feed', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 4000) })

  // Get first note author's profile link
  const authorLink = await page.evaluate(`
    (function() {
      var noteItems = document.querySelectorAll('.note-item a.cover');
      if (noteItems.length > 0) {
        return noteItems[0].getAttribute('href');
      }
      return null;
    })()
  `)
  console.log('First note link:', authorLink)

  if (authorLink) {
    // Navigate to the note to find the author
    var noteUrl = 'https://www.xiaohongshu.com' + authorLink
    await page.goto(noteUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await new Promise(function (r) { setTimeout(r, 4000) })

    // Find author profile link
    const authorProfileLink = await page.evaluate(`
      (function() {
        var authorLink = document.querySelector('.author-wrapper a, .author-container a, a[href*="/user/profile/"]');
        if (authorLink) return authorLink.getAttribute('href');
        return null;
      })()
    `)
    console.log('Author profile link:', authorProfileLink)

    if (authorProfileLink) {
      var profileUrl = authorProfileLink.startsWith('http') ? authorProfileLink : 'https://www.xiaohongshu.com' + authorProfileLink
      await page.goto(profileUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      await new Promise(function (r) { setTimeout(r, 5000) })

      const otherProfileInfo = await page.evaluate(`
        (function() {
          var results = {};
          results.url = window.location.href;
          results.title = document.title;

          // Look for all buttons
          var allButtons = document.querySelectorAll('button, [role="button"]');
          results.buttons = [];
          allButtons.forEach(function(el) {
            var text = el.textContent.trim();
            if (text.length > 0 && text.length < 50) {
              results.buttons.push({
                tag: el.tagName,
                text: text,
                className: el.className.toString().substring(0, 300),
                outerHtml: el.outerHTML.substring(0, 800)
              });
            }
          });

          // Look for "私信" elements
          var allEls = document.querySelectorAll('*');
          results.dmElements = [];
          for (var i = 0; i < allEls.length; i++) {
            var el = allEls[i];
            var text = (el.textContent || '').trim();
            if (el.children.length === 0 && (text.includes('私信') || text.includes('发消息'))) {
              results.dmElements.push({
                tag: el.tagName,
                className: el.className.toString().substring(0, 200),
                text: text.substring(0, 100),
                parentClass: el.parentElement ? el.parentElement.className.toString().substring(0, 200) : '',
                grandParentClass: el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement.className.toString().substring(0, 200) : '',
                outerHtml: el.outerHTML.substring(0, 500)
              });
            }
          }

          // Get the user info/interaction section
          var userInfo = document.querySelector('.user-info, [class*="user-info"], [class*="profile"]');
          if (userInfo) {
            results.userInfoHtml = userInfo.outerHTML.substring(0, 5000);
          }

          // Get interactions section
          var interactions = document.querySelector('[class*="interactions"], [class*="info-part"]');
          if (interactions) {
            results.interactionsHtml = interactions.outerHTML.substring(0, 3000);
          }

          return results;
        })()
      `)
      console.log('=== OTHER USER PROFILE ===')
      console.log(JSON.stringify(otherProfileInfo, null, 2))

      // Take screenshot
      await page.screenshot({ path: '/tmp/other-user-profile.png', fullPage: false })
      console.log('Screenshot saved to /tmp/other-user-profile.png')
    }
  }

  // Step 3: Check if clicking "私信" opens a chat popup/modal
  console.log('\n=== Step 3: Looking for DM popup after clicking 私信 ===')
  const dmButton = page.locator('button:has-text("私信"), [class*="message"]:has-text("私信")')
  const dmCount = await dmButton.count()
  console.log('DM button count:', dmCount)

  if (dmCount > 0) {
    console.log('Found DM button, clicking...')
    await dmButton.first().click()
    await new Promise(function (r) { setTimeout(r, 5000) })

    // Check for popup/modal
    const popupInfo = await page.evaluate(`
      (function() {
        var results = {};
        results.url = window.location.href;

        // Check for modals/popups
        var modals = document.querySelectorAll('[class*="modal"], [class*="dialog"], [class*="popup"], [class*="drawer"], [class*="chat"], [class*="im-"]');
        results.modals = [];
        modals.forEach(function(el) {
          results.modals.push({
            tag: el.tagName,
            className: el.className.toString().substring(0, 300),
            childCount: el.children.length,
            outerHtml: el.outerHTML.substring(0, 2000)
          });
        });

        // Check for new iframes
        var iframes = document.querySelectorAll('iframe');
        results.iframes = [];
        iframes.forEach(function(el) {
          results.iframes.push({
            src: el.src,
            className: el.className.toString().substring(0, 200)
          });
        });

        // Check for input/textarea (message input)
        var inputs = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
        results.inputs = [];
        inputs.forEach(function(el) {
          results.inputs.push({
            tag: el.tagName,
            placeholder: el.getAttribute('placeholder'),
            className: el.className.toString().substring(0, 200),
            id: el.id
          });
        });

        // Check for new elements that appeared
        var chatElements = document.querySelectorAll('[class*="chat"], [class*="im-"], [class*="message"], [class*="conversation"]');
        results.chatElements = [];
        chatElements.forEach(function(el) {
          results.chatElements.push({
            tag: el.tagName,
            className: el.className.toString().substring(0, 300),
            outerHtml: el.outerHTML.substring(0, 1000)
          });
        });

        return results;
      })()
    `)
    console.log('=== AFTER DM CLICK ===')
    console.log(JSON.stringify(popupInfo, null, 2))

    await page.screenshot({ path: '/tmp/after-dm-click.png', fullPage: false })
    console.log('Screenshot saved to /tmp/after-dm-click.png')
  }

  // Step 4: Check network requests for messaging API endpoints
  console.log('\n=== Step 4: Monitoring network for messaging APIs ===')
  var apiRequests: string[] = []
  page.on('request', function(request) {
    var url = request.url()
    if (url.includes('im') || url.includes('message') || url.includes('chat') || url.includes('whisper') || url.includes('msg')) {
      apiRequests.push(url)
    }
  })

  // Navigate back to main page and look for messaging
  await page.goto('https://www.xiaohongshu.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 5000) })

  console.log('Messaging-related API requests:', JSON.stringify(apiRequests, null, 2))

  console.log('\n=== Exploration Complete ===')
  await browser.close()
}

main().catch(console.error)
