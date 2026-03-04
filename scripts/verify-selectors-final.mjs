/**
 * Final targeted selector verification
 * Tests the EXACT selectors from selectors/index.ts on a valid note detail page
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'acc_mm9oyefb_pvqe');
const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'accounts', 'acc_mm9oyefb_pvqe', 'cookies.json');

// Exact selectors from src/selectors/index.ts
const ALL_SELECTORS = {
    // === noteDetail group ===
    'noteDetail.noteContainer': '.note-container',
    'noteDetail.mediaContainer': '.media-container',
    'noteDetail.detailTitle': '#detail-title',
    'noteDetail.titleFallback': '.title',
    'noteDetail.noteScroller': '.note-scroller',
    'noteDetail.noteText': '.note-content .note-text span',
    'noteDetail.noteTags': '.note-content .note-text a',
    'noteDetail.authorContainer': '.author-container .info',
    'noteDetail.authorAvatar': '.avatar-item',
    'noteDetail.authorUsername': '.username',
    'noteDetail.interactContainer': '.interact-container',
    'noteDetail.commentCount': '.chat-wrapper .count',
    'noteDetail.likeCount': '.like-wrapper .count',
    'noteDetail.mediaImages': '.media-container img',
    'noteDetail.mediaVideos': '.media-container video',

    // === engagement group ===
    'engagement.engageBar': '.interact-container .buttons.engage-bar-style',
    'engagement.likeWrapper': '.interact-container .like-wrapper',
    'engagement.likeActiveClass_check': '.like-active',
    'engagement.collectWrapper': '.interact-container .collect-wrapper',
    'engagement.collectActiveClass_check': '.collect-active',
    'engagement.likeCount': '.interact-container .like-wrapper .count',
    'engagement.collectCount': '.interact-container .collect-wrapper .count',
    'engagement.followBtnContainer': '.note-detail-follow-btn',
    'engagement.followButton': '.note-detail-follow-btn button.follow-button',
    'engagement.followButtonText': '.note-detail-follow-btn button.follow-button .reds-button-new-text',

    // === comments group ===
    'comments.commentList': '[role="dialog"] [role="list"]',
    'comments.commentItem': '[role="dialog"] [role="list"] [role="listitem"]',
    'comments.userName': '[data-testid="user-name"]',
    'comments.commentContent': '[data-testid="comment-content"]',
    'comments.likesCount': '[data-testid="likes-count"]',
    'comments.time': 'time',

    // === replyComment group ===
    'replyComment.commentItem': '.comment-item',
    'replyComment.commentAuthor': '.author a.name',
    'replyComment.commentText': '.content .note-text',
    'replyComment.replyButton': '.reply.icon-container',
    'replyComment.replyInput': '#content-textarea',
    'replyComment.submitReply': 'button.btn.submit',
    'replyComment.commentScroller': '.note-scroller',
};

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
        // Find a valid note via explore
        const explorePage = await context.newPage();
        await explorePage.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await explorePage.waitForTimeout(5000);

        // Get note URLs with xsec_token (required for valid access)
        const noteUrls = await explorePage.evaluate(() => {
            const links = document.querySelectorAll('a[href*="/explore/"][href*="xsec_token"]');
            return Array.from(links).slice(0, 5).map(l => {
                const href = l.getAttribute('href');
                return href.startsWith('http') ? href : 'https://www.xiaohongshu.com' + href;
            });
        });
        await explorePage.close();

        if (noteUrls.length === 0) {
            console.log('No note URLs found!');
            return;
        }

        // Try notes until we find one that loads
        for (const url of noteUrls) {
            console.log(`Trying: ${url.substring(0, 80)}...`);
            const page = await context.newPage();

            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(6000);

                if (page.url().includes('404') || page.url().includes('error')) {
                    console.log('Error page, skipping');
                    continue;
                }

                const hasAccessLimit = await page.locator('.access-limit-container').count();
                if (hasAccessLimit > 0) {
                    console.log('Access limited, skipping');
                    continue;
                }

                const hasNote = await page.locator('#noteContainer, .note-container').count();
                if (hasNote === 0) {
                    console.log('No note container, skipping');
                    continue;
                }

                console.log('\n✅ Valid note loaded!\n');
                console.log('=== SELECTOR TEST RESULTS ===\n');

                const passed = [];
                const failed = [];

                for (const [name, selector] of Object.entries(ALL_SELECTORS)) {
                    try {
                        const count = await page.locator(selector).count();
                        if (count > 0) {
                            const text = await page.locator(selector).first().textContent({ timeout: 1000 }).catch(() => '');
                            passed.push({ name, selector, count, text: text?.trim()?.substring(0, 50) || '' });
                        } else {
                            failed.push({ name, selector });
                        }
                    } catch (err) {
                        failed.push({ name, selector, error: err.message });
                    }
                }

                console.log(`✅ PASSED (${passed.length}):`);
                for (const p of passed) {
                    console.log(`  ${p.name}: "${p.selector}" (${p.count}) text="${p.text}"`);
                }

                console.log(`\n❌ FAILED (${failed.length}):`);
                for (const f of failed) {
                    console.log(`  ${f.name}: "${f.selector}"${f.error ? ` (${f.error})` : ''}`);
                }

                // For failed selectors, try to find the closest alternative
                console.log('\n=== ALTERNATIVE SELECTORS FOR FAILED ONES ===\n');

                for (const f of failed) {
                    const keywords = f.name.split('.').pop().toLowerCase();
                    const alternatives = await page.evaluate((kw) => {
                        const all = document.querySelectorAll('*');
                        const matches = [];
                        for (const el of all) {
                            const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
                            const id = (el.id || '').toLowerCase();
                            if (cls.includes(kw) || id.includes(kw)) {
                                matches.push({
                                    tag: el.tagName.toLowerCase(),
                                    id: el.id || '',
                                    class: typeof el.className === 'string' ? el.className.substring(0, 100) : '',
                                    text: el.textContent?.trim()?.substring(0, 60) || '',
                                });
                            }
                        }
                        return matches.slice(0, 3);
                    }, keywords);

                    if (alternatives.length > 0) {
                        console.log(`${f.name} (was: "${f.selector}"):`);
                        for (const alt of alternatives) {
                            console.log(`  -> <${alt.tag}${alt.id ? '#' + alt.id : ''}${alt.class ? '.' + alt.class.split(' ').join('.') : ''}> text="${alt.text}"`);
                        }
                    }
                }

                break;
            } finally {
                await page.close();
            }
        }
    } finally {
        await context.close();
    }
}

main();
