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

  // Step 1: Explore /notification page
  console.log('=== Step 1: Exploring /notification page ===')
  await page.goto('https://www.xiaohongshu.com/notification', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 5000) })
  console.log('Final URL:', page.url())

  const notifInfo = await page.evaluate(`
    (function() {
      var results = {};
      results.title = document.title;
      results.url = window.location.href;

      // Look for tabs/sections in notification page
      var tabs = document.querySelectorAll('[class*="tab"], [role="tab"], [class*="nav"]');
      results.tabs = [];
      tabs.forEach(function(el) {
        results.tabs.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 300),
          text: el.textContent.substring(0, 200),
          outerHtml: el.outerHTML.substring(0, 500)
        });
      });

      // Look for message/chat related elements
      var allElements = document.querySelectorAll('*');
      results.messageRelated = [];
      for (var i = 0; i < allElements.length; i++) {
        var el = allElements[i];
        var text = (el.textContent || '').trim();
        var cls = el.className.toString();
        if (el.children.length === 0 && text.length > 0 && text.length < 50 &&
            (text.includes('私信') || text.includes('消息') || text.includes('聊天') ||
             text.includes('收到') || text.includes('赞') || text.includes('评论') ||
             text.includes('关注') || text.includes('通知'))) {
          results.messageRelated.push({
            tag: el.tagName,
            className: cls.substring(0, 200),
            text: text,
            parentTag: el.parentElement ? el.parentElement.tagName : '',
            parentClass: el.parentElement ? el.parentElement.className.toString().substring(0, 200) : ''
          });
        }
      }

      // Get main content area
      var mainContent = document.querySelector('.main-content, .content, [class*="notification"], [class*="notice"]');
      if (mainContent) {
        results.mainContentHtml = mainContent.outerHTML.substring(0, 5000);
      }

      // Get full body structure (first level children)
      var body = document.body;
      results.bodyChildren = [];
      for (var j = 0; j < body.children.length; j++) {
        var child = body.children[j];
        results.bodyChildren.push({
          tag: child.tagName,
          id: child.id,
          className: child.className.toString().substring(0, 200),
          childCount: child.children.length
        });
      }

      // Get the app div structure
      var app = document.getElementById('app');
      if (app) {
        results.appHtml = app.innerHTML.substring(0, 8000);
      }

      return results;
    })()
  `)
  console.log('=== NOTIFICATION PAGE INFO ===')
  console.log(JSON.stringify(notifInfo, null, 2))

  // Step 2: Explore /im page more deeply
  console.log('\n=== Step 2: Exploring /im page deeply ===')
  await page.goto('https://www.xiaohongshu.com/im', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 8000) })
  console.log('Final URL:', page.url())

  const imInfo = await page.evaluate(`
    (function() {
      var results = {};
      results.title = document.title;
      results.url = window.location.href;
      results.bodyHtml = document.body.innerHTML.substring(0, 10000);

      // Check for iframes
      var iframes = document.querySelectorAll('iframe');
      results.iframes = [];
      iframes.forEach(function(el) {
        results.iframes.push({
          src: el.src,
          id: el.id,
          className: el.className.toString().substring(0, 200)
        });
      });

      // Check for shadow DOM
      var allEls = document.querySelectorAll('*');
      results.shadowRoots = 0;
      for (var i = 0; i < allEls.length; i++) {
        if (allEls[i].shadowRoot) results.shadowRoots++;
      }

      // Check for conversation list elements
      var convElements = document.querySelectorAll('[class*="conversation"], [class*="chat"], [class*="session"], [class*="contact"], [class*="list"]');
      results.conversationElements = [];
      convElements.forEach(function(el) {
        results.conversationElements.push({
          tag: el.tagName,
          className: el.className.toString().substring(0, 300),
          childCount: el.children.length,
          outerHtml: el.outerHTML.substring(0, 800)
        });
      });

      // Check for input/textarea elements (message input)
      var inputs = document.querySelectorAll('input, textarea, [contenteditable="true"]');
      results.inputs = [];
      inputs.forEach(function(el) {
        results.inputs.push({
          tag: el.tagName,
          type: el.getAttribute('type'),
          placeholder: el.getAttribute('placeholder'),
          className: el.className.toString().substring(0, 200),
          id: el.id
        });
      });

      return results;
    })()
  `)
  console.log('=== IM PAGE INFO ===')
  console.log(JSON.stringify(imInfo, null, 2))

  // Step 3: Click on notification link and look for messaging tab
  console.log('\n=== Step 3: Notification page - looking for messaging/DM section ===')
  await page.goto('https://www.xiaohongshu.com/notification', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  })
  await new Promise(function (r) { setTimeout(r, 5000) })

  // Take a screenshot for visual inspection
  await page.screenshot({ path: '/tmp/notification-page.png', fullPage: true })
  console.log('Screenshot saved to /tmp/notification-page.png')

  // Look for any links or clickable elements that lead to messaging
  const notifLinks = await page.evaluate(`
    (function() {
      var results = {};

      // Get all links on the page
      var links = document.querySelectorAll('a');
      results.allLinks = [];
      links.forEach(function(el) {
        var href = el.getAttribute('href') || '';
        var text = el.textContent.trim().substring(0, 100);
        if (text.length > 0 || href.length > 0) {
          results.allLinks.push({
            href: href,
            text: text,
            className: el.className.toString().substring(0, 200)
          });
        }
      });

      // Look for clickable divs/spans with messaging text
      var clickables = document.querySelectorAll('[class*="tab"], [class*="item"], [class*="link"], [role="button"]');
      results.clickables = [];
      clickables.forEach(function(el) {
        var text = el.textContent.trim().substring(0, 100);
        if (text.length > 0 && text.length < 50) {
          results.clickables.push({
            tag: el.tagName,
            text: text,
            className: el.className.toString().substring(0, 200),
            outerHtml: el.outerHTML.substring(0, 500)
          });
        }
      });

      return results;
    })()
  `)
  console.log('=== NOTIFICATION PAGE LINKS ===')
  console.log(JSON.stringify(notifLinks, null, 2))

  // Step 4: Try /im with different wait strategies
  console.log('\n=== Step 4: /im page with network idle ===')
  await page.goto('https://www.xiaohongshu.com/im', {
    waitUntil: 'networkidle',
    timeout: 60000,
  })
  await new Promise(function (r) { setTimeout(r, 5000) })

  await page.screenshot({ path: '/tmp/im-page.png', fullPage: true })
  console.log('Screenshot saved to /tmp/im-page.png')

  const imDeep = await page.evaluate(`
    (function() {
      var results = {};
      results.bodyHtml = document.body.innerHTML;
      results.bodyText = document.body.innerText.substring(0, 3000);
      results.scripts = [];
      var scripts = document.querySelectorAll('script[src]');
      scripts.forEach(function(el) {
        results.scripts.push(el.src);
      });
      return results;
    })()
  `)
  console.log('=== IM PAGE DEEP ===')
  console.log('Body text:', imDeep.bodyText)
  console.log('Body HTML length:', imDeep.bodyHtml.length)
  console.log('Scripts:', JSON.stringify(imDeep.scripts, null, 2))

  console.log('\n=== Exploration Complete ===')
  await browser.close()
}

main().catch(console.error)
