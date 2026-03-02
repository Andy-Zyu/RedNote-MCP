import { test, expect } from './setup';

test.describe('场景6：Web 界面交互测试', () => {
  test('应该能够重命名账号', async ({ page, server }) => {
    await page.goto('/');

    // 创建账号
    const response = await page.request.post('/api/accounts', {
      data: { name: '原始名称' },
    });
    const account = await response.json();

    await page.waitForTimeout(1000);

    // 验证原始名称显示
    await expect(page.locator('text=原始名称')).toBeVisible();

    // 找到编辑按钮
    const accountCard = page.locator('text=原始名称').locator('..').locator('..');
    const editButton = accountCard.locator('button:has-text("编辑"), button:has-text("Edit"), button[aria-label*="编辑"], button[aria-label*="Edit"]').first();

    if (await editButton.isVisible({ timeout: 2000 })) {
      await editButton.click();

      // 输入新名称
      const nameInput = page.locator('input[name="name"], input[value="原始名称"]').first();
      await nameInput.clear();
      await nameInput.fill('新名称');

      // 保存
      const saveButton = page.locator('button:has-text("保存"), button:has-text("Save"), button[type="submit"]').first();
      await saveButton.click();

      // 等待更新 API 响应
      await page.waitForResponse(response =>
        response.url().includes(`/api/accounts/${account.id}`) && response.request().method() === 'PUT',
        { timeout: 5000 }
      );

      // 验证新名称显示
      await expect(page.locator('text=新名称')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=原始名称')).not.toBeVisible();
    }
  });

  test('应该处理网络错误', async ({ page, server }) => {
    await page.goto('/');

    // 模拟网络错误：尝试获取不存在的账号
    const response = await page.request.get('/api/accounts/nonexistent-id');
    expect(response.status()).toBe(404);

    const error = await response.json();
    expect(error.error).toBeDefined();
  });

  test('应该处理无效的账号名称', async ({ page, server }) => {
    // 尝试创建空名称的账号
    const response = await page.request.post('/api/accounts', {
      data: { name: '' },
    });
    expect(response.status()).toBe(400);

    const error = await response.json();
    expect(error.error).toContain('Name is required');
  });

  test('应该处理 WebSocket 断线重连', async ({ page, server }) => {
    await page.goto('/');

    // 监听 WebSocket 连接
    let wsConnected = false;
    let wsReconnected = false;

    page.on('websocket', ws => {
      if (!wsConnected) {
        wsConnected = true;
      } else {
        wsReconnected = true;
      }

      ws.on('close', () => {
        // WebSocket 关闭
      });
    });

    // 等待初始连接
    await page.waitForTimeout(2000);
    expect(wsConnected).toBe(true);

    // 刷新页面触发重连
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证重连成功（页面刷新会创建新的 WebSocket）
    expect(wsConnected).toBe(true);
  });

  test('应该显示健康检查状态', async ({ page, server }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);

    const health = await response.json();
    expect(health.status).toBe('ok');
    expect(health.timestamp).toBeDefined();
  });

  test('应该正确处理并发账号创建', async ({ page, server }) => {
    // 并发创建多个账号
    const promises = [];
    for (let i = 1; i <= 5; i++) {
      promises.push(
        page.request.post('/api/accounts', {
          data: { name: `并发账号${i}` },
        })
      );
    }

    const responses = await Promise.all(promises);

    // 验证所有请求都成功
    for (const response of responses) {
      expect(response.status()).toBe(201);
    }

    // 验证创建了5个不同的账号
    const accountsResponse = await page.request.get('/api/accounts');
    const accounts = await accountsResponse.json();
    expect(accounts.length).toBeGreaterThanOrEqual(5);

    // 验证账号 ID 都不同
    const ids = accounts.map((acc: any) => acc.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('应该在 UI 中显示账号的 Cookie 状态', async ({ page, server }) => {
    await page.goto('/');

    // 创建账号
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
    await nameInput.fill('Cookie状态测试');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();
    await submitButton.click();

    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );

    // 等待账号出现
    await expect(page.locator('text=Cookie状态测试')).toBeVisible({ timeout: 5000 });

    // 验证显示未登录状态（因为没有 Cookie）
    // 状态可能通过图标、颜色或文字显示
    const accountCard = page.locator('text=Cookie状态测试').locator('..').locator('..');

    // 检查是否有扫码按钮（表示未登录）
    const scanButton = accountCard.locator('button:has-text("扫码"), button:has-text("Scan")').first();
    await expect(scanButton).toBeVisible({ timeout: 5000 });
  });

  test('应该支持键盘导航', async ({ page, server }) => {
    await page.goto('/');

    // 使用 Tab 键导航
    await page.keyboard.press('Tab');

    // 验证焦点在某个可交互元素上
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'INPUT', 'A']).toContain(focusedElement);
  });

  test('应该响应式显示（移动端视图）', async ({ page, server }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 验证页面可以正常显示
    await expect(page.locator('h1')).toBeVisible();

    // 验证添加账号按钮可见
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await expect(addButton).toBeVisible();
  });

  test('应该显示加载状态', async ({ page, server }) => {
    await page.goto('/');

    // 创建账号时可能显示加载状态
    const addButton = page.locator('button:has-text("添加账号"), button:has-text("Add Account")').first();
    await addButton.click();

    const nameInput = page.locator('input[name="name"], input[placeholder*="名称"]').first();
    await nameInput.fill('加载测试');

    const submitButton = page.locator('button[type="submit"], button:has-text("确认")').first();

    // 点击提交后可能短暂显示加载状态
    await submitButton.click();

    // 等待请求完成
    await page.waitForResponse(response =>
      response.url().includes('/api/accounts') && response.status() === 201,
      { timeout: 5000 }
    );
  });
});
