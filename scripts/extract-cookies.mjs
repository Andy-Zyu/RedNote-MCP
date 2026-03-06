import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

async function main() {
    console.log('Extracting fresh cookies from persistent profile...');
    const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'default');

    // Use a different userDataDir to just connect to the profile if possible, or just open it directly
    const context = await chromium.launchPersistentContext(profileDir, {
        headless: true,
    });

    const cookies = await context.cookies();
    const cookiesPath = path.join(os.homedir(), '.mcp', 'rednote', 'cookies', 'default.json');

    fs.mkdirSync(path.dirname(cookiesPath), { recursive: true });
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));

    console.log(`Saved ${cookies.length} cookies to ${cookiesPath}`);
    await context.close();
}

main().catch(console.error);
