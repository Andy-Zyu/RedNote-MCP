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

  // Step 1: Go to main site and look for messaging icon in header
  console.log('=== Step 1: Loading main site ===')
  await page.goto('https://www.xiaohongshu.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 4000) })

  // Capture header area for message/notification icons
  const headerInfo = await page.evaluate(`
    (function() {
      var results = {};

      // Look for header elements
      var header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('[class*="header"]');
      if (header) {
        results.headerHtml = header.outerHTML.substring(0, 5000);
      }

      // Look for any element with "message" or "chat" or "notification" in class/id
      var msgElements = document.querySelectorAll('[class*="message"], [class*="chat"], [class*="notification"], [class*="msg"], [class*="inbox"]');
      results.messageElements = [];
      msgElements.forEach(function(el) {
        results.messageElements.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 200),
          id: el.id,
          text: el.textContent.substring(0, 100),
          outerHtml: el.outerHTML.substring(0, 500)
        });
      });

      // Look for SVG icons that might be message icons
      var svgs = document.querySelectorAll('svg');
      results.svgCount = svgs.length;

      // Look for links with message-related hrefs
      var links = document.querySelectorAll('a[href*="message"], a[href*="chat"], a[href*="notification"], a[href*="whisper"]');
      results.messageLinks = [];
      links.forEach(function(el) {
        results.messageLinks.push({
          href: el.getAttribute('href'),
          text: el.textContent.substring(0, 100),
          outerHtml: el.outerHTML.substring(0, 500)
        });
      });

      // Look for sidebar elements
      var sidebar = document.querySelector('.side-bar') || document.querySelector('[class*="sidebar"]') || document.querySelector('[class*="side-bar"]');
      if (sidebar) {
        results.sidebarHtml = sidebar.outerHTML.substring(0, 3000);
      }

      return results;
    })()
  `)
  console.log('=== HEADER INFO ===')
  console.log(JSON.stringify(headerInfo, null, 2))

  // Step 2: Try direct messaging URLs
  const messagingUrls = [
    'https://www.xiaohongshu.com/message',
    'https://www.xiaohongshu.com/notifications',
    'https://www.xiaohongshu.com/user/notifications',
    'https://www.xiaohongshu.com/im',
    'https://www.xiaohongshu.com/chat',
  ]

  for (const url of messagingUrls) {
    console.log(`\n=== Trying URL: ${url} ===`)
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      })
      await new Promise(function (r) { setTimeout(r, 3000) })
      const finalUrl = page.url()
      console.log(`Final URL: ${finalUrl}`)

      if (!finalUrl.includes('xiaohongshu.com/explore') && !finalUrl.includes('xiaohongshu.com/?')) {
        // This URL didn't redirect to home, might be valid
        const bodySnippet = await page.evaluate(`
          (function() {
            return {
              title: document.title,
              bodyHtml: document.body.innerHTML.substring(0, 8000),
              url: window.location.href
            };
          })()
        `)
        console.log(`Title: ${bodySnippet.title}`)
        console.log(`Body snippet: ${bodySnippet.bodyHtml.substring(0, 3000)}`)
      } else {
        console.log('Redirected to home page, URL not valid')
      }
    } catch (err) {
      console.log(`Error: ${err}`)
    }
  }

  // Step 3: Go back to main page and try clicking message-related elements
  console.log('\n=== Step 3: Looking for clickable message elements ===')
  await page.goto('https://www.xiaohongshu.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 4000) })

  // Look for the sidebar user section which might have message icon
  const sidebarInfo = await page.evaluate(`
    (function() {
      var results = {};

      // Check for side-bar-component items
      var sidebarItems = document.querySelectorAll('.side-bar-component .channel, .side-bar .channel');
      results.sidebarChannels = [];
      sidebarItems.forEach(function(el) {
        results.sidebarChannels.push({
          className: el.className.toString().substring(0, 200),
          text: el.textContent.substring(0, 100),
          outerHtml: el.outerHTML.substring(0, 500)
        });
      });

      // Check for any popup/modal/drawer that might be messaging
      var popups = document.querySelectorAll('[class*="popup"], [class*="modal"], [class*="drawer"], [class*="panel"]');
      results.popupCount = popups.length;

      // Look for whisper (private message in Chinese social media)
      var whisperElements = document.querySelectorAll('[class*="whisper"], [class*="private"], [class*="dm"]');
      results.whisperElements = [];
      whisperElements.forEach(function(el) {
        results.whisperElements.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 200),
          outerHtml: el.outerHTML.substring(0, 500)
        });
      });

      // Full body class list for context
      results.bodyClasses = document.body.className;

      // Check for any element with Chinese text related to messaging
      var allElements = document.querySelectorAll('*');
      results.messageTextElements = [];
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var text = el.textContent || '';
        if (el.children.length === 0 && (text.includes('私信') || text.includes('消息') || text.includes('聊天'))) {
          results.messageTextElements.push({
            tag: el.tagName,
            className: el.className.toString().substring(0, 200),
            text: text.substring(0, 100),
            parentClass: el.parentElement ? el.parentElement.className.toString().substring(0, 200) : '',
            outerHtml: el.outerHTML.substring(0, 300)
          });
        }
      }

      return results;
    })()
  `)
  console.log('=== SIDEBAR & MESSAGE ELEMENTS ===')
  console.log(JSON.stringify(sidebarInfo, null, 2))

  // Step 4: Try the creator center messaging
  console.log('\n=== Step 4: Trying creator center messaging ===')
  const creatorMsgUrls = [
    'https://creator.xiaohongshu.com/message',
    'https://creator.xiaohongshu.com/im',
  ]

  // First navigate to creator via SSO
  try {
    const publishLink = page.locator('a[href*="creator.xiaohongshu.com/publish"]')
    if (await publishLink.count() > 0) {
      const [creatorPage] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 30000 }),
        publishLink.first().click()
      ])
      await creatorPage.waitForLoadState('domcontentloaded', { timeout: 30000 })
      console.log(`Creator page URL: ${creatorPage.url()}`)

      // Now try messaging URLs in creator context
      for (const url of creatorMsgUrls) {
        console.log(`\nTrying creator URL: ${url}`)
        try {
          await creatorPage.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000,
          })
          await new Promise(function (r) { setTimeout(r, 3000) })
          console.log(`Final URL: ${creatorPage.url()}`)
          const bodySnippet = await creatorPage.evaluate(`
            (function() {
              return document.body.innerHTML.substring(0, 3000);
            })()
          `)
          console.log(`Body: ${bodySnippet.substring(0, 2000)}`)
        } catch (err) {
          console.log(`Error: ${err}`)
        }
      }

      await creatorPage.close()
    }
  } catch (err) {
    console.log(`Creator SSO error: ${err}`)
  }

  // Step 5: Check if there's a messaging popup triggered by clicking user avatar or bell icon
  console.log('\n=== Step 5: Looking for bell/notification icons ===')
  await page.goto('https://www.xiaohongshu.com', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 4000) })

  const iconInfo = await page.evaluate(`
    (function() {
      var results = {};

      // Look for bell icons, envelope icons, etc.
      var icons = document.querySelectorAll('[class*="bell"], [class*="envelope"], [class*="mail"], [class*="notice"]');
      results.noticeIcons = [];
      icons.forEach(function(el) {
        results.noticeIcons.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 200),
          outerHtml: el.outerHTML.substring(0, 500)
        });
      });

      // Look for badge/dot indicators (unread count)
      var badges = document.querySelectorAll('[class*="badge"], [class*="dot"], [class*="unread"]');
      results.badges = [];
      badges.forEach(function(el) {
        results.badges.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 200),
          text: el.textContent.substring(0, 50),
          parentOuterHtml: el.parentElement ? el.parentElement.outerHTML.substring(0, 500) : ''
        });
      });

      return results;
    })()
  `)
  console.log('=== ICON INFO ===')
  console.log(JSON.stringify(iconInfo, null, 2))

  console.log('\n=== DOM Exploration Complete ===')
  await browser.close()
}

main().catch(console.error)
