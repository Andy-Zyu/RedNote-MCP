import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

async function main() {
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'default');
    const context = await chromium.launchPersistentContext(profileDir, { headless: true });

    const page = await context.newPage();
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: path.join(os.homedir(), '.mcp', 'rednote', 'screenshot-explore.png') });

    const sidebarExists = await page.evaluate(() => {
        return !!document.querySelector('.side-bar');
    });

    const userText = await page.evaluate(() => {
        const el = document.querySelector('.side-bar .user-avatar, .user');
        return el?.textContent?.trim() || 'NOT_FOUND';
    });

    console.log('Sidebar exists:', sidebarExists);
    console.log('User text:', userText);

    await context.close();
}

main().catch(console.error);
