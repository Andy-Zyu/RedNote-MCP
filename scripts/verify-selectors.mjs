/**
 * Selector verification script v2
 * Explicitly loads cookies into browser context to ensure authentication
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'acc_mm9oyefb_pvqe');
const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'accounts', 'acc_mm9oyefb_pvqe', 'cookies.json');

// Selectors grouped by page
const SELECTOR_GROUPS = {
    search: {
        feedsContainer: '.feeds-container',
        noteItem: '.feeds-container .note-item',
        coverLink: 'a.cover.mask.ld',
    },
    noteDetail: {
        noteContainer: '.note-container',
        mediaContainer: '.media-container',
        detailTitle: '#detail-title',
        noteScroller: '.note-scroller',
        noteText: '.note-content .note-text span',
        noteTags: '.note-content .note-text a',
        authorContainer: '.author-container .info',
        authorAvatar: '.avatar-item',
        authorUsername: '.username',
        interactContainer: '.interact-container',
        commentCount: '.chat-wrapper .count',
        likeCount: '.like-wrapper .count',
        mediaImages: '.media-container img',
    },
    engagement: {
        engageBar: '.interact-container .buttons.engage-bar-style',
        likeWrapper: '.interact-container .like-wrapper',
        collectWrapper: '.interact-container .collect-wrapper',
        likeCount: '.interact-container .like-wrapper .count',
        collectCount: '.interact-container .collect-wrapper .count',
        followBtnContainer: '.note-detail-follow-btn',
        followButton: '.note-detail-follow-btn button.follow-button',
    },
    auth: {
        sidebarUser: '.user.side-bar-component .channel',
    },
    publish_link: {
        publishLink: 'a[href*="creator.xiaohongshu.com/publish"]',
    },
};

async function checkSelectors(page, selectorGroup, groupName) {
    const results = [];
    for (const [name, selector] of Object.entries(selectorGroup)) {
        try {
            const count = await page.locator(selector).count();
            results.push({ group: groupName, name, selector, found: count > 0, count });
        } catch (err) {
            results.push({ group: groupName, name, selector, found: false, count: 0, error: err.message });
        }
    }
    return results;
}

async function dumpDomStructure(page, description) {
    console.log(`\n📋 DOM Structure for: ${description}`);
    const structure = await page.evaluate(() => {
        function collect(el, depth = 0) {
            if (depth > 4) return '';
            const tag = el.tagName?.toLowerCase() || '';
            const id = el.id ? `#${el.id}` : '';
            const classes = el.className && typeof el.className === 'string'
                ? `.${el.className.split(' ').filter(c => c).join('.')}`
                : '';
            const indent = '  '.repeat(depth);
            let result = `${indent}<${tag}${id}${classes}>\n`;

            // Only recurse into interesting elements
            const children = el.children;
            const maxChildren = 8;
            for (let i = 0; i < Math.min(children.length, maxChildren); i++) {
                result += collect(children[i], depth + 1);
            }
            if (children.length > maxChildren) {
                result += `${indent}  ... (${children.length - maxChildren} more children)\n`;
            }
            return result;
        }

        const app = document.querySelector('#app') || document.body;
        return collect(app);
    });
    console.log(structure.substring(0, 5000));
}

async function main() {
    console.log('=== Selector Verification Script v2 ===');
    console.log(`Profile: ${PROFILE_DIR}`);
    console.log(`Cookies: ${COOKIE_PATH}\n`);

    let context;
    try {
        // Load cookies
        const cookieData = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
        console.log(`Loaded ${cookieData.length} cookies from file`);

        context = await chromium.launchPersistentContext(PROFILE_DIR, {
            headless: true,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-shared-workers',
                '--disable-background-networking',
            ],
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });

        // Hide webdriver
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // Explicitly load cookies
        await context.addCookies(cookieData);
        console.log('Cookies loaded into context\n');

        const allResults = [];

        // === Step 1: Check main page (auth + publish link) ===
        console.log('--- Step 1: Main Page ---');
        const mainPage = await context.newPage();
        try {
            await mainPage.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await mainPage.waitForTimeout(5000);

            const url = mainPage.url();
            console.log(`Current URL: ${url}`);

            if (url.includes('captcha') || url.includes('verifyType=')) {
                console.log('⚠️  CAPTCHA detected!');
            }

            // Check if logged in
            const isLoggedIn = await mainPage.evaluate(() => {
                const sidebar = document.querySelector('.user.side-bar-component .channel');
                return sidebar?.textContent?.trim() === '我';
            });
            console.log(`Logged in: ${isLoggedIn}`);

            const authResults = await checkSelectors(mainPage, SELECTOR_GROUPS.auth, 'auth');
            allResults.push(...authResults);
            const publishResults = await checkSelectors(mainPage, SELECTOR_GROUPS.publish_link, 'publish_link');
            allResults.push(...publishResults);

            if (!isLoggedIn) {
                console.log('\n⚠️  Not logged in! Dumping DOM structure...');
                await dumpDomStructure(mainPage, 'Main Page (not logged in)');
            }
        } finally {
            await mainPage.close();
        }

        // === Step 2: Search page ===
        console.log('\n--- Step 2: Search Page ---');
        const searchPage = await context.newPage();
        let noteUrl = null;
        try {
            await searchPage.goto('https://www.xiaohongshu.com/search_result?keyword=咖啡', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await searchPage.waitForTimeout(6000);

            const currentUrl = searchPage.url();
            console.log(`Current URL: ${currentUrl}`);

            // Check for login modal
            const hasLoginModal = await searchPage.locator('.login-container').count();
            console.log(`Login modal visible: ${hasLoginModal > 0}`);

            const searchResults = await checkSelectors(searchPage, SELECTOR_GROUPS.search, 'search');
            allResults.push(...searchResults);

            // Try to find note URLs with various approaches
            noteUrl = await searchPage.evaluate(() => {
                // Strategy 1: Original selectors
                let link = document.querySelector('.feeds-container .note-item a[href*="/explore/"]');
                if (link) return 'https://www.xiaohongshu.com' + link.getAttribute('href');

                // Strategy 2: Any explore link
                link = document.querySelector('a[href*="/explore/"]');
                if (link) {
                    const href = link.getAttribute('href');
                    return href.startsWith('http') ? href : 'https://www.xiaohongshu.com' + href;
                }

                // Strategy 3: Data attributes
                const noteEl = document.querySelector('[data-note-id]');
                if (noteEl) {
                    const noteId = noteEl.getAttribute('data-note-id');
                    return `https://www.xiaohongshu.com/explore/${noteId}`;
                }

                return null;
            });

            console.log(`Found note URL: ${noteUrl || 'NONE'}`);

            if (!noteUrl) {
                // Dump search page DOM
                await dumpDomStructure(searchPage, 'Search Page');

                // Also try to find ALL links
                const allLinks = await searchPage.evaluate(() => {
                    const links = document.querySelectorAll('a[href]');
                    return Array.from(links).slice(0, 30).map(l => ({
                        href: l.getAttribute('href'),
                        text: l.textContent?.trim()?.substring(0, 50),
                        classes: l.className
                    }));
                });
                console.log('\nAll links on search page:');
                for (const l of allLinks) {
                    console.log(`  [${l.classes}] ${l.href} - "${l.text}"`);
                }
            }
        } finally {
            await searchPage.close();
        }

        // === Step 3: Note detail page ===
        if (noteUrl) {
            console.log(`\n--- Step 3: Note Detail Page ---`);
            console.log(`URL: ${noteUrl}`);
            const detailPage = await context.newPage();
            try {
                await detailPage.goto(noteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await detailPage.waitForTimeout(5000);

                const detailResults = await checkSelectors(detailPage, SELECTOR_GROUPS.noteDetail, 'noteDetail');
                allResults.push(...detailResults);
                const engagementResults = await checkSelectors(detailPage, SELECTOR_GROUPS.engagement, 'engagement');
                allResults.push(...engagementResults);
            } finally {
                await detailPage.close();
            }
        } else {
            // Try a known public note URL instead
            console.log('\n--- Step 3: Trying explore page for a note ---');
            const explorePage = await context.newPage();
            try {
                await explorePage.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
                await explorePage.waitForTimeout(5000);

                // Try to find any note link on explore
                noteUrl = await explorePage.evaluate(() => {
                    const links = document.querySelectorAll('a[href*="/explore/"]');
                    for (const link of links) {
                        const href = link.getAttribute('href');
                        if (href && href.match(/\/explore\/[a-f0-9]{24}/)) {
                            return href.startsWith('http') ? href : 'https://www.xiaohongshu.com' + href;
                        }
                    }
                    return null;
                });

                if (noteUrl) {
                    console.log(`Found note URL from explore: ${noteUrl}`);
                    await explorePage.goto(noteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    await explorePage.waitForTimeout(5000);

                    const detailResults = await checkSelectors(explorePage, SELECTOR_GROUPS.noteDetail, 'noteDetail');
                    allResults.push(...detailResults);
                    const engagementResults = await checkSelectors(explorePage, SELECTOR_GROUPS.engagement, 'engagement');
                    allResults.push(...engagementResults);

                    // Dump DOM for analysis
                    await dumpDomStructure(explorePage, 'Note Detail Page');
                } else {
                    console.log('Could not find any note URLs');
                    await dumpDomStructure(explorePage, 'Explore Page');
                }
            } finally {
                await explorePage.close();
            }
        }

        // === Print Results Summary ===
        console.log('\n\n========== RESULTS SUMMARY ==========\n');

        const passed = allResults.filter(r => r.found);
        const failed = allResults.filter(r => !r.found);

        console.log(`Total: ${allResults.length} | ✅ Passed: ${passed.length} | ❌ Failed: ${failed.length}\n`);

        if (failed.length > 0) {
            console.log('❌ FAILED SELECTORS:');
            for (const r of failed) {
                console.log(`  [${r.group}] ${r.name}: "${r.selector}"`);
            }
        }

        if (passed.length > 0) {
            console.log('\n✅ PASSED SELECTORS:');
            for (const r of passed) {
                console.log(`  [${r.group}] ${r.name}: "${r.selector}" (${r.count} matches)`);
            }
        }

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        if (context) {
            await context.close();
        }
    }
}

main();
