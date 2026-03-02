import { test, expect } from './setup';
import { Page } from '@playwright/test';

test.describe('场景2：启动 Matrix 添加第二个账号', () => {
  test('应该能够访问 Matrix Web 界面', async ({ page, server }) => {
    await page.goto('/');

    // 验证页面标题
    await expect(page).toHaveTitle(/Matrix/i);

    // 验证主要元素存在
    await expect(page.locator('h1')).toContainText(/账号管理|Account/i);
  });

  test('应该能够点击添加账号按钮', async ({ page, server }) => {
    await page.goto('/');

    // 查找并点击添加账号按钮
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")');
    await expect(addButton).toBeVisible();
    await addButton.click();

    // 验证弹出对话框或表单
    const dialog = page.locator('[role="dialog"], .modal, .dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test('应该能够输入账号名称并创建账号', async ({ page, server }) => {
    await page.goto('/');

    // 点击添加账号
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    // 输入账号名称
    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"], input[placeholder*="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await nameInput.fill('测试账号1');

    // 提交表单
    const submitButton = page.locator('button[type="submit"], button:has-text("确认"), button:has-text("Confirm")').first();
    await submitButton.click();

    // 等待 API 响应
    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    // 验证账号出现在列表中
    await expect(page.locator('text=测试账号1')).toBeVisible({ timeout: 5000 });
  });

  test('应该显示二维码扫描界面', async ({ page, server }) => {
    await page.goto('/');

    // 添加账号
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"], input[placeholder*="name"]').first();
    await nameInput.fill('扫码测试账号');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认"), button:has-text("Confirm")').first();
    await submitButton.click();

    // 等待账号创建
    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    // 点击扫码按钮
    const scanButton = page.locator('button:has-text("扫码"), button:has-text("Scan")').first();
    await expect(scanButton).toBeVisible({ timeout: 5000 });
    await scanButton.click();

    // 验证二维码容器出现
    const qrcodeContainer = page.locator('[data-testid="qrcode"], .qrcode, canvas, img[alt*="QR"]');
    await expect(qrcodeContainer.first()).toBeVisible({ timeout: 10000 });
  });

  test('应该能够通过 WebSocket 接收实时更新', async ({ page, server }) => {
    await page.goto('/');

    // 监听 WebSocket 消息
    const wsMessages: any[] = [];
    page.on('websocket', ws => {
      ws.on('framereceived', event => {
        try {
          const message = JSON.parse(event.payload as string);
          wsMessages.push(message);
        } catch (e) {
          // Ignore non-JSON messages
        }
      });
    });

    // 等待初始账号列表消息
    await page.waitForTimeout(2000);

    // 验证收到了 accounts 类型的消息
    const accountsMessage = wsMessages.find(msg => msg.type === 'accounts');
    expect(accountsMessage).toBeDefined();
  });

  test('应该能够取消扫码操作', async ({ page, server }) => {
    await page.goto('/');

    // 添加账号并开始扫码
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
    await nameInput.fill('取消扫码测试');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
    await submitButton.click();

    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    const scanButton = page.locator('button:has-text("扫码"), button:has-text("Scan")').first();
    await scanButton.click();

    // 等待二维码出现
    await page.waitForTimeout(2000);

    // 点击取消按钮
    const cancelButton = page.locator('button:has-text("取消"), button:has-text("Cancel"), button:has-text("Abort")').first();
    await expect(cancelButton).toBeVisible({ timeout: 5000 });
    await cancelButton.click();

    // 验证二维码消失
    const qrcodeContainer = page.locator('[data-testid="qrcode"], .qrcode');
    await expect(qrcodeContainer.first()).not.toBeVisible({ timeout: 5000 });
  });
});
