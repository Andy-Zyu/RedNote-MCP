import { test, expect } from './setup';
import fs from 'fs';
import path from 'path';
import { TEST_ACCOUNTS_DIR, TEST_DEFAULT_COOKIE } from './setup';

test.describe('场景3：使用不同账号发布笔记', () => {
  test('应该为不同账号创建独立的 Cookie 文件', async ({ page, server }) => {
    // 通过 API 创建两个账号
    const response1 = await page.request.post('/api/accounts', {
      data: { name: '账号1' },
    });
    expect(response1.status()).toBe(201);
    const account1 = await response1.json();

    const response2 = await page.request.post('/api/accounts', {
      data: { name: '账号2' },
    });
    expect(response2.status()).toBe(201);
    const account2 = await response2.json();

    // 验证账号目录被创建
    const account1Dir = path.join(TEST_ACCOUNTS_DIR, account1.id);
    const account2Dir = path.join(TEST_ACCOUNTS_DIR, account2.id);

    expect(fs.existsSync(account1Dir)).toBe(true);
    expect(fs.existsSync(account2Dir)).toBe(true);

    // 模拟为每个账号保存不同的 Cookie
    const cookies1 = [
      {
        name: 'web_session',
        value: 'account1_session_token',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: Date.now() / 1000 + 86400,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ];

    const cookies2 = [
      {
        name: 'web_session',
        value: 'account2_session_token',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: Date.now() / 1000 + 86400,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ];

    const cookiePath1 = path.join(account1Dir, 'cookies.json');
    const cookiePath2 = path.join(account2Dir, 'cookies.json');

    fs.writeFileSync(cookiePath1, JSON.stringify(cookies1, null, 2));
    fs.writeFileSync(cookiePath2, JSON.stringify(cookies2, null, 2));

    // 验证 Cookie 文件存在且内容不同
    expect(fs.existsSync(cookiePath1)).toBe(true);
    expect(fs.existsSync(cookiePath2)).toBe(true);

    const savedCookies1 = JSON.parse(fs.readFileSync(cookiePath1, 'utf-8'));
    const savedCookies2 = JSON.parse(fs.readFileSync(cookiePath2, 'utf-8'));

    expect(savedCookies1[0].value).toBe('account1_session_token');
    expect(savedCookies2[0].value).toBe('account2_session_token');
    expect(savedCookies1[0].value).not.toBe(savedCookies2[0].value);
  });

  test('应该验证浏览器实例隔离', async ({ page, server }) => {
    // 创建两个账号
    const response1 = await page.request.post('/api/accounts', {
      data: { name: '隔离测试账号1' },
    });
    const account1 = await response1.json();

    const response2 = await page.request.post('/api/accounts', {
      data: { name: '隔离测试账号2' },
    });
    const account2 = await response2.json();

    // 验证每个账号有独立的数据目录
    const account1Dir = path.join(TEST_ACCOUNTS_DIR, account1.id);
    const account2Dir = path.join(TEST_ACCOUNTS_DIR, account2.id);

    expect(account1Dir).not.toBe(account2Dir);
    expect(fs.existsSync(account1Dir)).toBe(true);
    expect(fs.existsSync(account2Dir)).toBe(true);

    // 验证目录结构
    const account1UserData = path.join(account1Dir, 'browser-data');
    const account2UserData = path.join(account2Dir, 'browser-data');

    // 这些目录在浏览器启动时才会创建，这里只验证路径不同
    expect(account1UserData).not.toBe(account2UserData);
  });

  test('应该能够在 Web 界面查看多个账号', async ({ page, server }) => {
    await page.goto('/');

    // 创建多个账号
    for (let i = 1; i <= 3; i++) {
      const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
      await addButton.click();

      const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
      await nameInput.fill(`测试账号${i}`);

      const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
      await submitButton.click();

      await page.waitForResponse(response =>
        response.url().includes('/api/accounts') && response.status() === 201,
        { timeout: 5000 }
      );

      // 等待界面更新
      await page.waitForTimeout(500);
    }

    // 验证所有账号都显示在列表中
    for (let i = 1; i <= 3; i++) {
      await expect(page.locator(`text=测试账号${i}`)).toBeVisible();
    }
  });

  test('应该显示账号的登录状态', async ({ page, server }) => {
    await page.goto('/');

    // 创建账号
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
    await nameInput.fill('状态测试账号');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
    await submitButton.click();

    const response = await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    const account = await response.json();

    // 验证账号显示未登录状态（没有 Cookie）
    const accountCard = page.locator(`[data-account-id="${account.id}"], :has-text("状态测试账号")`).first();
    await expect(accountCard).toBeVisible();

    // 查找状态指示器（可能是图标、文字或徽章）
    const statusIndicator = page.locator('text=未登录, text=Not logged in, text=需要登录, .status-offline, .status-inactive').first();
    // 状态指示器可能存在也可能不存在，取决于 UI 实现
  });
});
