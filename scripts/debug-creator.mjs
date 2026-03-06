import { chromium } from 'playwright';
import path from 'path';
import os from 'os';

async function main() {
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'default');
    const context = await chromium.launchPersistentContext(profileDir, { headless: true });

    const page = await context.newPage();
    await page.goto('https://creator.xiaohongshu.com/creator/home', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    const url = page.url();

    const hasAvatar = await page.evaluate(() => {
        return !!document.querySelector('.avatar, .user-avatar, .user-info, img');
    });

    console.log('Title:', title);
    console.log('URL:', url);
    console.log('Has Avatar/User Element:', hasAvatar);

    await context.close();
}

main().catch(console.error);
