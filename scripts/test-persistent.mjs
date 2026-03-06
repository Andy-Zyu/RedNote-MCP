import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

async function main() {
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'default');

    if (fs.existsSync(path.join(profileDir, 'DevToolsActivePort'))) fs.unlinkSync(path.join(profileDir, 'DevToolsActivePort'));
    if (fs.existsSync(path.join(profileDir, 'SingletonLock'))) fs.unlinkSync(path.join(profileDir, 'SingletonLock'));

    console.log('Launching Persistent Context...');
    const context = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        args: [
            '--remote-debugging-port=0',
            '--remote-allow-origins=*',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });

    const devToolsFile = path.join(profileDir, 'DevToolsActivePort');
    console.log('DevTools file exists?', fs.existsSync(devToolsFile));

    if (fs.existsSync(devToolsFile)) {
        const parts = fs.readFileSync(devToolsFile, 'utf8').split('\n');
        console.log('CDP Port:', parts[0]);
        console.log('wsEndpoint:', `ws://127.0.0.1:${parts[0]}${parts[1]}`);

        console.log('Testing connectOverCDP...');
        try {
            const browser2 = await chromium.connectOverCDP(`http://127.0.0.1:${parts[0]}`);
            console.log('Successfully connected second client! Contexts:', browser2.contexts().length);

            const page = await browser2.contexts()[0].newPage();
            await page.goto('https://creator.xiaohongshu.com/creator/home');
            console.log('Page URL before wait:', page.url());
            await page.waitForTimeout(5000);
            console.log('Page URL after wait:', page.url());
            await browser2.close();
        } catch (e) {
            console.error(e);
        }
    }

    await context.close();
}

main().catch(console.error);
