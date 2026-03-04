/**
 * Note detail DOM dumper v2 — uses explore page waterfall to find valid notes
 * and clicks into them to get the actual note detail DOM
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'acc_mm9oyefb_pvqe');
const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'accounts', 'acc_mm9oyefb_pvqe', 'cookies.json');

async function main() {
    const cookieData = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await context.addCookies(cookieData);

    try {
        // Step 1: Go to explore page and find multiple note URLs
        console.log('Going to explore page...');
        const page = await context.newPage();
        await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(5000);

        const noteUrls = await page.evaluate(() => {
            const links = document.querySelectorAll('a[href*="/explore/"]');
            const urls = [];
            for (const link of links) {
                const href = link.getAttribute('href');
                if (href && href.match(/\/explore\/[a-f0-9]{24}/)) {
                    const full = href.startsWith('http') ? href : 'https://www.xiaohongshu.com' + href;
                    if (!urls.includes(full)) urls.push(full);
                }
            }
            return urls.slice(0, 10);
        });

        console.log(`Found ${noteUrls.length} note URLs on explore page`);
        for (const u of noteUrls) console.log(`  ${u}`);

        await page.close();

        // Step 2: Try each URL until we get a real note detail page
        for (const url of noteUrls) {
            console.log(`\n--- Trying: ${url} ---`);
            const notePage = await context.newPage();

            try {
                await notePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await notePage.waitForTimeout(6000);

                const current = notePage.url();

                // Skip if redirected to 404 or access-limit
                if (current.includes('404') || current.includes('error')) {
                    console.log('Redirected to error page, skipping...');
                    continue;
                }

                // Check if access-limit
                const hasAccessLimit = await notePage.locator('.access-limit-container').count();
                if (hasAccessLimit > 0) {
                    console.log('Access limited, skipping...');
                    continue;
                }

                // Check if we have actual note content
                const hasContent = await notePage.evaluate(() => {
                    // Look for any signs of note content
                    const body = document.body.innerText;
                    return body.length > 500 && !body.includes('暂时无法浏览');
                });

                if (!hasContent) {
                    console.log('No content found, skipping...');
                    continue;
                }

                console.log('✅ Found valid note! Dumping DOM...\n');

                // Dump full structure
                const dom = await notePage.evaluate(() => {
                    function collect(el, depth = 0, maxDepth = 8) {
                        if (depth > maxDepth) return '';
                        const tag = el.tagName?.toLowerCase() || '';
                        if (['script', 'style', 'noscript', 'svg', 'path', 'use'].includes(tag)) return '';

                        const id = el.id ? `#${el.id}` : '';
                        const classes = el.className && typeof el.className === 'string'
                            ? `.${el.className.split(' ').filter(c => c).join('.')}`
                            : '';
                        const role = el.getAttribute?.('role') ? ` [role="${el.getAttribute('role')}"]` : '';

                        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && el.textContent.trim()
                            ? ` "${el.textContent.trim().substring(0, 60)}"` : '';

                        const indent = '  '.repeat(depth);
                        let result = `${indent}<${tag}${id}${classes}${role}${text}>\n`;

                        for (const child of el.children) {
                            result += collect(child, depth + 1, maxDepth);
                        }
                        return result;
                    }

                    // Focus on the main content area
                    const mainContent = document.querySelector('.with-side-bar.main-content')
                        || document.querySelector('.main-content')
                        || document.querySelector('#app');
                    return collect(mainContent, 0, 8);
                });
                console.log('=== MAIN CONTENT DOM ===\n');
                console.log(dom);

                // Detailed element search
                const elements = await notePage.evaluate(() => {
                    const results = {};
                    const patterns = [
                        { name: 'title', sels: ['h1', '[id*="title"]', '[class*="title"]:not([class*="reds-alert"])', '.title'] },
                        { name: 'content', sels: ['[class*="desc"]', '[class*="note-text"]', '.note-content', '[id*="desc"]'] },
                        { name: 'author', sels: ['[class*="author"]', '[class*="nick"]', '[class*="user-name"]'] },
                        { name: 'interact', sels: ['[class*="like"]', '[class*="collect"]', '[class*="comment"]', '[class*="engage"]', '[class*="interact"]'] },
                        { name: 'media', sels: ['img[src*="xhscdn"]', 'img[src*="sns"]', 'video', '[class*="media"]', '[class*="swiper"]', '[class*="carousel"]', '[class*="slider"]'] },
                        { name: 'follow', sels: ['[class*="follow"]', 'button[class*="follow"]'] },
                        { name: 'note', sels: ['[class*="note"]', '[class*="detail"]'] },
                        { name: 'scroll', sels: ['[class*="scroll"]', '[class*="scroller"]'] },
                        { name: 'tag', sels: ['[class*="tag"]', '[class*="topic"]', '[class*="hashtag"]'] },
                        { name: 'avatar', sels: ['[class*="avatar"]', 'img[class*="avatar"]'] },
                    ];

                    for (const p of patterns) {
                        const matches = [];
                        for (const sel of p.sels) {
                            try {
                                const els = document.querySelectorAll(sel);
                                for (const el of Array.from(els).slice(0, 3)) {
                                    matches.push({
                                        selector: sel,
                                        tag: el.tagName.toLowerCase(),
                                        id: el.id || '',
                                        class: (typeof el.className === 'string' ? el.className : '').substring(0, 120),
                                        text: el.textContent?.trim()?.substring(0, 100) || '',
                                        children: el.children.length,
                                    });
                                }
                            } catch { }
                        }
                        if (matches.length > 0) results[p.name] = matches;
                    }
                    return results;
                });

                console.log('\n=== ELEMENT SEARCH ===\n');
                for (const [cat, matches] of Object.entries(elements)) {
                    console.log(`\n${cat.toUpperCase()} (${matches.length} matches):`);
                    for (const m of matches) {
                        const cls = m.class ? `.${m.class.split(' ').join('.')}` : '';
                        console.log(`  [${m.selector}] <${m.tag}${m.id ? '#' + m.id : ''}${cls}> children:${m.children} text:"${m.text}"`);
                    }
                }

                // Success - we found a working note page
                break;

            } catch (err) {
                console.log(`Error: ${err.message}`);
            } finally {
                await notePage.close();
            }
        }

    } finally {
        await context.close();
    }
}

main();
