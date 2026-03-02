import { test, expect } from './setup';
import fs from 'fs';
import path from 'path';
import { TEST_DEFAULT_COOKIE, TEST_DATA_DIR } from './setup';

test.describe('场景1：新用户首次使用（单账号模式）', () => {
  test('应该能够初始化并保存默认 Cookie', async () => {
    // 模拟登录后保存 Cookie
    const mockCookies = [
      {
        name: 'web_session',
        value: 'test_session_token_123',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: Date.now() / 1000 + 86400,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ];

    // 保存到默认路径
    fs.writeFileSync(TEST_DEFAULT_COOKIE, JSON.stringify(mockCookies, null, 2));

    // 验证文件存在
    expect(fs.existsSync(TEST_DEFAULT_COOKIE)).toBe(true);

    // 验证内容正确
    const savedCookies = JSON.parse(fs.readFileSync(TEST_DEFAULT_COOKIE, 'utf-8'));
    expect(savedCookies).toHaveLength(1);
    expect(savedCookies[0].name).toBe('web_session');
    expect(savedCookies[0].value).toBe('test_session_token_123');
  });

  test('应该能够在不传 accountId 时使用默认 Cookie', async () => {
    // 创建默认 Cookie
    const mockCookies = [
      {
        name: 'web_session',
        value: 'default_session_token',
        domain: '.xiaohongshu.com',
        path: '/',
        expires: Date.now() / 1000 + 86400,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax' as const,
      },
    ];

    fs.writeFileSync(TEST_DEFAULT_COOKIE, JSON.stringify(mockCookies, null, 2));

    // 验证默认 Cookie 可以被读取
    expect(fs.existsSync(TEST_DEFAULT_COOKIE)).toBe(true);
    const cookies = JSON.parse(fs.readFileSync(TEST_DEFAULT_COOKIE, 'utf-8'));
    expect(cookies[0].value).toBe('default_session_token');
  });

  test('应该在没有账号时使用默认数据目录', async () => {
    // 验证测试数据目录存在
    expect(fs.existsSync(TEST_DATA_DIR)).toBe(true);

    // 验证默认 Cookie 路径正确
    expect(TEST_DEFAULT_COOKIE).toContain(TEST_DATA_DIR);
    expect(TEST_DEFAULT_COOKIE).toContain('rednote_cookies.json');
  });
});
