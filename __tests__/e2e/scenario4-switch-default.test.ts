import { test, expect } from './setup';
import fs from 'fs';
import path from 'path';
import { TEST_ACCOUNTS_DIR } from './setup';

test.describe('场景4：切换默认账号', () => {
  test('应该能够设置默认账号', async ({ page, server }) => {
    await page.goto('/');

    // 创建两个账号
    const response1 = await page.request.post('/api/accounts', {
      data: { name: '账号A' },
    });
    const account1 = await response1.json();

    const response2 = await page.request.post('/api/accounts', {
      data: { name: '账号B' },
    });
    const account2 = await response2.json();

    // 等待界面更新
    await page.waitForTimeout(1000);

    // 验证第一个账号默认是默认账号
    const defaultResponse = await page.request.get('/api/accounts');
    const accounts = await defaultResponse.json();
    const defaultAccount = accounts.find((acc: any) => acc.isDefault);
    expect(defaultAccount.id).toBe(account1.id);

    // 设置第二个账号为默认
    const setDefaultResponse = await page.request.post(`/api/accounts/${account2.id}/default`);
    expect(setDefaultResponse.status()).toBe(200);

    // 验证默认账号已切换
    const updatedResponse = await page.request.get('/api/accounts');
    const updatedAccounts = await updatedResponse.json();
    const newDefaultAccount = updatedAccounts.find((acc: any) => acc.isDefault);
    expect(newDefaultAccount.id).toBe(account2.id);
  });

  test('应该在 Web 界面显示默认账号标记', async ({ page, server }) => {
    await page.goto('/');

    // 创建账号
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
    await nameInput.fill('默认账号测试');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
    await submitButton.click();

    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    // 等待界面更新
    await page.waitForTimeout(1000);

    // 查找默认账号标记（可能是徽章、图标或文字）
    const defaultBadge = page.locator('text=默认, text=Default, .badge-default, [data-default="true"]').first();
    await expect(defaultBadge).toBeVisible({ timeout: 5000 });
  });

  test('应该能够通过点击切换默认账号', async ({ page, server }) => {
    await page.goto('/');

    // 创建两个账号
    for (let i = 1; i <= 2; i++) {
      const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
      await addButton.click();

      const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
      await nameInput.fill(`切换测试账号${i}`);

      const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
      await submitButton.click();

      await page.waitForResponse(response =>
        response.url().includes('/api/accounts') && response.status() === 201,
        { timeout: 5000 }
      );

      await page.waitForTimeout(500);
    }

    // 找到第二个账号的"设为默认"按钮
    const account2Card = page.locator('text=切换测试账号2').locator('..').locator('..');
    const setDefaultButton = account2Card.locator('button:has-text("设为默认"), button:has-text("Set Default")').first();

    if (await setDefaultButton.isVisible()) {
      await setDefaultButton.click();

      // 等待 API 响应
      await page.waitForResponse(response =>
        response.url().includes('/default') && response.status() === 200,
        { timeout: 5000 }
      );

      // 验证默认标记移动到第二个账号
      await page.waitForTimeout(1000);
      const defaultBadge = page.locator('text=切换测试账号2').locator('..').locator('..').locator('text=默认, text=Default').first();
      await expect(defaultBadge).toBeVisible({ timeout: 5000 });
    }
  });

  test('应该在配置文件中保存默认账号设置', async ({ page, server }) => {
    // 创建账号
    const response1 = await page.request.post('/api/accounts', {
      data: { name: '配置测试账号1' },
    });
    const account1 = await response1.json();

    const response2 = await page.request.post('/api/accounts', {
      data: { name: '配置测试账号2' },
    });
    const account2 = await response2.json();

    // 设置第二个账号为默认
    await page.request.post(`/api/accounts/${account2.id}/default`);

    // 验证配置文件存在
    const configPath = path.join(TEST_ACCOUNTS_DIR, 'accounts.json');
    expect(fs.existsSync(configPath)).toBe(true);

    // 读取配置文件
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    // 验证默认账号 ID
    expect(config.defaultAccountId).toBe(account2.id);

    // 验证账号列表
    expect(config.accounts).toHaveLength(2);
    const savedAccount2 = config.accounts.find((acc: any) => acc.id === account2.id);
    expect(savedAccount2.isDefault).toBe(true);
  });
});
