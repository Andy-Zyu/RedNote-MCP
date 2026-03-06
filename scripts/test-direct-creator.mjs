/**
 * 测试方案2：直接带 cookies 访问 creator.xiaohongshu.com，跳过 SSO
 * 对比两种方式的耗时
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'acc_mm9oyefb_pvqe');
const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'accounts', 'acc_mm9oyefb_pvqe', 'cookies.json');

async function main() {
    const cookieData = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));

    console.log('=== 方案2测试：直接访问 creator.xiaohongshu.com ===\n');

    // 打印 creator 相关 cookies
    const creatorCookies = cookieData.filter((c) =>
        ['customer-sso-sid', 'access-token-creator.xiaohongshu.com',
            'galaxy_creator_session_id', 'x-user-id-creator.xiaohongshu.com',
            'customerClientId', 'web_session', 'a1'].includes(c.name)
    );
    console.log('Creator 相关 cookies:');
    for (const c of creatorCookies) {
        const expiry = c.expires > 0 ? new Date(c.expires * 1000).toISOString() : 'session';
        console.log(`  ${c.name}: ${c.value.substring(0, 30)}... (expires: ${expiry})`);
    }

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    await context.addCookies(cookieData);

    // ==================
    // 方案A（现有方案）：SSO流程
    // ==================
    console.log('\n--- 方案A：SSO 流程（现有方式）---');
    const mainPage = await context.newPage();
    const t1 = Date.now();
    try {
        await mainPage.goto('https://www.xiaohongshu.com', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        console.log(`  1. 主页加载: ${Date.now() - t1}ms`);

        const publishLink = mainPage.locator('a[href*="creator.xiaohongshu.com/publish"]');
        const linkCount = await publishLink.count();
        console.log(`  2. 发布链接: ${linkCount > 0 ? '✅ 找到' : '❌ 未找到'}`);

        if (linkCount > 0) {
            const t2 = Date.now();
            const [creatorPage] = await Promise.all([
                context.waitForEvent('page', { timeout: 30000 }),
                publishLink.first().click(),
            ]);
            await creatorPage.waitForLoadState('domcontentloaded', { timeout: 30000 });
            console.log(`  3. SSO跳转创作者中心: ${Date.now() - t2}ms`);
            console.log(`     URL: ${creatorPage.url()}`);

            const t3 = Date.now();
            await creatorPage.goto('https://creator.xiaohongshu.com/statistics/account/v2', {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            });
            console.log(`  4. 导航到统计页: ${Date.now() - t3}ms`);
            console.log(`     URL: ${creatorPage.url()}`);

            // 检查是否成功加载
            const t4 = Date.now();
            try {
                await creatorPage.waitForSelector('text=账号诊断', { timeout: 15000 });
                console.log(`  5. 等待内容加载: ${Date.now() - t4}ms ✅`);
            } catch {
                console.log(`  5. 等待内容超时: ${Date.now() - t4}ms ❌`);
                // Dump page text
                const text = await creatorPage.evaluate(() => document.body.innerText.substring(0, 500));
                console.log(`     页面内容: ${text}`);
            }

            console.log(`\n  ⏱️  方案A 总耗时: ${Date.now() - t1}ms`);
            await creatorPage.close();
        }
    } catch (err) {
        console.log(`  ❌ 错误: ${err instanceof Error ? err.message : String(err)}`);
    }
    await mainPage.close();

    // ==================
    // 方案B（新方案）：直接访问
    // ==================
    console.log('\n--- 方案B：直接访问 creator.xiaohongshu.com ---');
    const directPage = await context.newPage();
    const t5 = Date.now();
    try {
        // 直接访问统计页
        await directPage.goto('https://creator.xiaohongshu.com/statistics/account/v2', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        });
        console.log(`  1. 直接导航: ${Date.now() - t5}ms`);
        console.log(`     URL: ${directPage.url()}`);

        if (directPage.url().includes('login') || directPage.url().includes('cas')) {
            console.log('  ❌ 被重定向到登录页 — 方案B 不可行');
        } else {
            const t6 = Date.now();
            try {
                await directPage.waitForSelector('text=账号诊断', { timeout: 20000 });
                console.log(`  2. 等待内容加载: ${Date.now() - t6}ms ✅`);
                console.log(`\n  ⏱️  方案B 总耗时: ${Date.now() - t5}ms`);
                console.log('\n  ✅ 方案B 可行！可以直接跳过 SSO 流程！');
            } catch {
                console.log(`  2. 等待内容超时: ${Date.now() - t6}ms`);
                // 看看页面到底有什么
                const text = await directPage.evaluate(() => document.body.innerText.substring(0, 800));
                console.log(`     页面内容: ${text}`);

                // 尝试再等一会儿
                await directPage.waitForTimeout(3000);
                const hasContent = await directPage.locator('[class*="overview"], [class*="stat"], [class*="data"]').count();
                console.log(`     数据元素数: ${hasContent}`);
                console.log(`\n  ⏱️  方案B 总耗时: ${Date.now() - t5}ms`);
            }
        }
    } catch (err) {
        console.log(`  ❌ 错误: ${err instanceof Error ? err.message : String(err)}`);
        console.log(`  URL: ${directPage.url()}`);
    } finally {
        // Dump cookies set by creator page (might be useful)
        const newCookies = await context.cookies(['https://creator.xiaohongshu.com']);
        console.log(`\n  Creator cookies (${newCookies.length} total):`);
        for (const c of newCookies) {
            console.log(`    ${c.name}: ${c.value.substring(0, 40)}`);
        }
        await directPage.close();
    }

    await context.close();
}

main().catch(console.error);
