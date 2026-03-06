import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

import { execSync } from 'child_process';

async function main() {
    console.log('Cleaning up existing Chromium processes...');
    try { execSync('pkill -f Chromium || true'); } catch (e) { }

    console.log('Opening persistent context to refresh login...');
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'default');

    const singletonLock = path.join(profileDir, 'SingletonLock');
    if (fs.existsSync(singletonLock)) {
        try { fs.unlinkSync(singletonLock); } catch (e) { }
    }

    const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
    });

    const page = await context.newPage();
    await page.goto('https://creator.xiaohongshu.com/creator/home');
    console.log('Please scan the QR code in the browser...');

    // Wait indefinitely until the avatar or sidebar user appears
    await page.waitForFunction(() => {
        return !!document.querySelector('.avatar, .user-avatar, .user-info, .side-bar-component .user');
    }, { timeout: 0 });

    console.log('Login successful! Navigating to explore page to sync cookies...');
    await page.goto('https://www.xiaohongshu.com/explore');
    await page.waitForTimeout(3000);

    const cookies = await context.cookies();
    const cookiesPath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies.json');

    fs.mkdirSync(path.dirname(cookiesPath), { recursive: true });
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));

    console.log(`Saved ${cookies.length} cookies to ${cookiesPath}. Closing browser...`);
    await context.close();
}

main().catch(console.error);
