/**
 * 完整验证（修复版）：直接访问模式下所有 dashboard 页面的数据能否正常读取
 */
import { chromium } from 'playwright';
import path from 'path';
import os from 'os';
import fs from 'fs';

const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', 'acc_mm9oyefb_pvqe');
const COOKIE_PATH = path.join(os.homedir(), '.mcp', 'rednote', 'accounts', 'acc_mm9oyefb_pvqe', 'cookies.json');

async function directNavigate(context, url) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (page.url().includes('login') || page.url().includes('cas') || page.url().includes('sso')) {
        await page.close();
        throw new Error(`Redirected to login: ${page.url()}`);
    }
    return page;
}

async function testDashboardOverview(context) {
    console.log('\n=== 1. get_dashboard_overview ===');
    const t = Date.now();
    const url = 'https://creator.xiaohongshu.com/statistics/account/v2';
    const page = await directNavigate(context, url);

    try {
        await page.getByText('账号诊断').waitFor({ timeout: 20000 });
        console.log(`✅ "账号诊断" 加载成功 (${Date.now() - t}ms)`);
        await page.waitForTimeout(2000);

        const diagLabels = ['观看数：', '涨粉数：', '主页访客数：', '发布数：', '互动数：'];
        const diagnosis = await page.evaluate((labels) => {
            const gt = el => el ? (el.textContent || '').trim() : '';
            const allDivs = Array.from(document.querySelectorAll('div'));
            return labels.map(label => {
                const labelEl = allDivs.find(el => el.childElementCount === 0 && gt(el) === label);
                if (labelEl && labelEl.parentElement) {
                    const siblings = Array.from(labelEl.parentElement.children);
                    const suggestionEl = siblings.find(s => s !== labelEl);
                    return { label, found: true, value: suggestionEl ? gt(suggestionEl).substring(0, 40) : '(empty)' };
                }
                return { label, found: false, value: null };
            });
        }, diagLabels);

        console.log('   账号诊断数据:');
        for (const d of diagnosis) {
            console.log(`   ${d.found ? '✅' : '❌'} ${d.label} ${d.value || '(未找到)'}`);
        }

        const knownLabels = ['曝光数', '观看数', '封面点击率', '平均观看时长', '点赞数', '净涨粉'];
        const metrics = await page.evaluate((labels) => {
            const gt = el => el ? (el.textContent || '').trim() : '';
            const allDivs = Array.from(document.querySelectorAll('div'));
            const found = {};
            for (const label of labels) {
                const labelEl = allDivs.find(el => el.childElementCount === 0 && gt(el) === label);
                if (labelEl && labelEl.parentElement) {
                    const children = Array.from(labelEl.parentElement.children);
                    const idx = children.indexOf(labelEl);
                    found[label] = {
                        value: children[idx + 1] ? gt(children[idx + 1]) : '?',
                        change: children[idx + 2] ? gt(children[idx + 2]) : '?',
                    };
                }
            }
            return found;
        }, knownLabels);

        console.log('   指标数据:');
        for (const [label, data] of Object.entries(metrics)) {
            console.log(`   ✅ ${label}: ${data.value} (${data.change})`);
        }

        // Tab 切换
        const interactionTab = page.locator('h6').filter({ hasText: '互动数据' }).first();
        if (await interactionTab.count() > 0) {
            await interactionTab.click(); await page.waitForTimeout(1500);
            console.log('   ✅ 互动数据 tab');
        }
        const followerTab = page.locator('h6').filter({ hasText: '涨粉数据' }).first();
        if (await followerTab.count() > 0) {
            await followerTab.click(); await page.waitForTimeout(1500);
            console.log('   ✅ 涨粉数据 tab');
        }
        const btn30 = page.getByText('近30日').first();
        if (await btn30.count() > 0) {
            await btn30.click(); await page.waitForTimeout(1500);
            console.log('   ✅ 近30日切换');
        }

        console.log(`   ⏱️  总耗时: ${Date.now() - t}ms`);
    } catch (err) {
        console.log(`   ❌ 失败: ${err.message}`);
        const text = await page.evaluate(() => document.body.innerText.substring(0, 400));
        console.log(`   页面内容: ${text}`);
    } finally {
        await page.close();
    }
}

async function testContentAnalytics(context) {
    console.log('\n=== 2. get_content_analytics ===');
    const t = Date.now();
    const url = 'https://creator.xiaohongshu.com/statistics/data-analysis';
    const page = await directNavigate(context, url);

    try {
        // 等待任何内容出现
        await page.waitForTimeout(5000);
        console.log(`   页面 URL: ${page.url()} (${Date.now() - t}ms)`);

        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log(`   页面文字：\n${pageText}\n`);

        // 检查各种可能的元素
        const counts = await page.evaluate(() => {
            const sels = [
                '[class*="note"]', '[class*="content"]', '[class*="row"]',
                'table', 'tbody tr', '[class*="list"]',
                '[class*="stat"]', '[class*="data"]',
            ];
            const r = {};
            for (const s of sels) {
                r[s] = document.querySelectorAll(s).length;
            }
            return r;
        });
        console.log('   元素计数:', JSON.stringify(counts, null, 2));
        console.log(`   ⏱️  总耗时: ${Date.now() - t}ms`);
    } catch (err) {
        console.log(`   ❌ 失败: ${err.message}`);
    } finally {
        await page.close();
    }
}

async function testFansAnalytics(context) {
    console.log('\n=== 3. get_fans_analytics ===');
    const t = Date.now();
    const url = 'https://creator.xiaohongshu.com/statistics/fans-data';
    const page = await directNavigate(context, url);

    try {
        await page.waitForTimeout(5000);
        console.log(`   页面 URL: ${page.url()} (${Date.now() - t}ms)`);

        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
        console.log(`   页面文字：\n${pageText}\n`);

        const hasData = ['净涨粉', '新增关注', '粉丝数据'].some(kw => pageText.includes(kw));
        console.log(`   ${hasData ? '✅ 找到粉丝数据' : '⚠️  未找到预期的粉丝数据关键词'}`);
        console.log(`   ⏱️  总耗时: ${Date.now() - t}ms`);
    } catch (err) {
        console.log(`   ❌ 失败: ${err.message}`);
    } finally {
        await page.close();
    }
}

async function testPublishPage(context) {
    console.log('\n=== 4. 发布页 ===');
    const t = Date.now();
    const url = 'https://creator.xiaohongshu.com/publish/publish?source=official';
    const page = await directNavigate(context, url);

    try {
        await page.waitForTimeout(5000);
        console.log(`   页面 URL: ${page.url()} (${Date.now() - t}ms)`);

        const fileInput = await page.locator('input[type="file"]').count();
        const uploadArea = await page.locator('[class*="upload"]').count();
        console.log(`   input[type="file"]: ${fileInput}`);
        console.log(`   [class*="upload"]: ${uploadArea}`);

        const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
        const hasPublish = ['上传', '发布', '标题', '内容'].some(kw => pageText.includes(kw));
        console.log(`   ${hasPublish ? '✅ 发布页内容正常' : '⚠️ '} 找到发布相关内容: ${hasPublish}`);
        console.log(`   ⏱️  总耗时: ${Date.now() - t}ms`);
    } catch (err) {
        console.log(`   ❌ 失败: ${err.message}`);
    } finally {
        await page.close();
    }
}

async function main() {
    const cookieData = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        args: ['--disable-blink-features=AutomationControlled'],
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
    await context.addCookies(cookieData);

    console.log('🔍 验证直接访问模式下所有 Creator 页面功能\n');

    try {
        await testDashboardOverview(context);
        await testContentAnalytics(context);
        await testFansAnalytics(context);
        await testPublishPage(context);
    } finally {
        await context.close();
    }

    console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
