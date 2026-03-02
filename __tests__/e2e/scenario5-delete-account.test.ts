import { test, expect } from './setup';
import fs from 'fs';
import path from 'path';
import { TEST_ACCOUNTS_DIR } from './setup';

test.describe('场景5：删除账号', () => {
  test('应该能够删除账号', async ({ page, server }) => {
    // 创建账号
    const response = await page.request.post('/api/accounts', {
      data: { name: '待删除账号' },
    });
    expect(response.status()).toBe(201);
    const account = await response.json();

    // 验证账号存在
    const getResponse = await page.request.get(`/api/accounts/${account.id}`);
    expect(getResponse.status()).toBe(200);

    // 删除账号
    const deleteResponse = await page.request.delete(`/api/accounts/${account.id}`);
    expect(deleteResponse.status()).toBe(200);

    // 验证账号已删除
    const getAfterDelete = await page.request.get(`/api/accounts/${account.id}`);
    expect(getAfterDelete.status()).toBe(404);
  });

  test('应该删除账号的 Cookie 文件', async ({ page, server }) => {
    // 创建账号
    const response = await page.request.post('/api/accounts', {
      data: { name: 'Cookie删除测试' },
    });
    const account = await response.json();

    // 创建 Cookie 文件
    const accountDir = path.join(TEST_ACCOUNTS_DIR, account.id);
    const cookiePath = path.join(accountDir, 'cookies.json');

    const mockCookies = [
      {
        name: 'web_session',
        value: 'test_token',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: Date.now() / 1000 + 86400,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ];

    fs.writeFileSync(cookiePath, JSON.stringify(mockCookies, null, 2));
    expect(fs.existsSync(cookiePath)).toBe(true);

    // 删除账号
    await page.request.delete(`/api/accounts/${account.id}`);

    // 验证 Cookie 文件被删除
    expect(fs.existsSync(cookiePath)).toBe(false);
  });

  test('应该删除账号目录', async ({ page, server }) => {
    // 创建账号
    const response = await page.request.post('/api/accounts', {
      data: { name: '目录删除测试' },
    });
    const account = await response.json();

    const accountDir = path.join(TEST_ACCOUNTS_DIR, account.id);
    expect(fs.existsSync(accountDir)).toBe(true);

    // 删除账号
    await page.request.delete(`/api/accounts/${account.id}`);

    // 验证目录被删除
    expect(fs.existsSync(accountDir)).toBe(false);
  });

  test('应该在删除默认账号后自动切换到其他账号', async ({ page, server }) => {
    // 创建两个账号
    const response1 = await page.request.post('/api/accounts', {
      data: { name: '账号1' },
    });
    const account1 = await response1.json();

    const response2 = await page.request.post('/api/accounts', {
      data: { name: '账号2' },
    });
    const account2 = await response2.json();

    // 验证第一个账号是默认账号
    let accountsResponse = await page.request.get('/api/accounts');
    let accounts = await accountsResponse.json();
    let defaultAccount = accounts.find((acc: any) => acc.isDefault);
    expect(defaultAccount.id).toBe(account1.id);

    // 删除默认账号
    await page.request.delete(`/api/accounts/${account1.id}`);

    // 验证第二个账号自动成为默认账号
    accountsResponse = await page.request.get('/api/accounts');
    accounts = await accountsResponse.json();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].id).toBe(account2.id);
    expect(accounts[0].isDefault).toBe(true);
  });

  test('应该在 Web 界面删除账号', async ({ page, server }) => {
    await page.goto('/');

    // 创建账号
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
    await nameInput.fill('UI删除测试');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
    await submitButton.click();

    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    // 等待账号出现
    await expect(page.locator('text=UI删除测试')).toBeVisible({ timeout: 5000 });

    // 找到删除按钮
    const accountCard = page.locator('text=UI删除测试').locator('..').locator('..');
    const deleteButton = accountCard.locator('button:has-text("删除"), button:has-text("Delete"), button[aria-label*="删除"], button[aria-label*="Delete"]').first();

    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    await deleteButton.click();

    // 可能有确认对话框
    const confirmButton = page.locator('button:has-text("确认删除"), button:has-text("Confirm"), button:has-text("是")').first();
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }

    // 等待删除 API 响应
    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.request().method() === 'DELETE',
      { timeout: 5000 }
    );

    // 验证账号从列表中消失
    await expect(page.locator('text=UI删除测试')).not.toBeVisible({ timeout: 5000 });
  });

  test('应该在删除最后一个账号后显示空状态', async ({ page, server }) => {
    await page.goto('/');

    // 创建一个账号
    const response = await page.request.post('/api/accounts', {
      data: { name: '最后的账号' },
    });
    const account = await response.json();

    await page.waitForTimeout(1000);

    // 删除账号
    await page.request.delete(`/api/accounts/${account.id}`);

    // 刷新页面
    await page.reload();

    // 验证显示空状态或欢迎信息
    const emptyState = page.locator('text=暂无账号, text=No accounts, text=添加第一个账号, text=Add your first account, .empty-state').first();
    await expect(emptyState).toBeVisible({ timeout: 5000 });
  });

  test('应该中止正在进行的扫码操作', async ({ page, server }) => {
    // 创建账号
    const response = await page.request.post('/api/accounts', {
      data: { name: '扫码中断测试' },
    });
    const account = await response.json();

    // 开始扫码
    const scanResponse = await page.request.post(`/api/scan/${account.id}`);
    expect(scanResponse.status()).toBe(200);

    // 删除账号（应该自动中止扫码）
    const deleteResponse = await page.request.delete(`/api/accounts/${account.id}`);
    expect(deleteResponse.status()).toBe(200);

    // 验证账号已删除
    const getResponse = await page.request.get(`/api/accounts/${account.id}`);
    expect(getResponse.status()).toBe(404);
  });
});
