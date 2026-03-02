import fs from 'fs';
import path from 'path';
import os from 'os';
import { CookieManager } from '../../src/auth/cookieManager';
import { accountManager } from '../../src/auth/accountManager';
import { Cookie } from 'playwright';

describe('Cookie Isolation', () => {
  let testBaseDir: string;

  beforeEach(() => {
    testBaseDir = path.join(os.tmpdir(), `rednote-test-${Date.now()}`);
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);
  });

  afterEach(() => {
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('Cookie storage isolation', () => {
    it('should store cookies in separate directories for different accounts', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const cookieManager1 = new CookieManager(undefined, account1.id);
      const cookieManager2 = new CookieManager(undefined, account2.id);

      const cookies1: Cookie[] = [
        { name: 'session1', value: 'value1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ];
      const cookies2: Cookie[] = [
        { name: 'session2', value: 'value2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ];

      await cookieManager1.saveCookies(cookies1);
      await cookieManager2.saveCookies(cookies2);

      const loaded1 = await cookieManager1.loadCookies();
      const loaded2 = await cookieManager2.loadCookies();

      expect(loaded1).toHaveLength(1);
      expect(loaded1[0].name).toBe('session1');
      expect(loaded2).toHaveLength(1);
      expect(loaded2[0].name).toBe('session2');

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });

    it('should use different file paths for different accounts', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const path1 = accountManager.getCookiePath(account1.id);
      const path2 = accountManager.getCookiePath(account2.id);

      expect(path1).not.toBe(path2);
      expect(path1).toContain(account1.id);
      expect(path2).toContain(account2.id);

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });

    it('should not interfere with other account cookies', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const cookieManager1 = new CookieManager(undefined, account1.id);
      const cookieManager2 = new CookieManager(undefined, account2.id);

      const cookies1: Cookie[] = [
        { name: 'web_session', value: 'account1_session', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ];

      await cookieManager1.saveCookies(cookies1);

      // Account 2 should have no cookies
      const loaded2 = await cookieManager2.loadCookies();
      expect(loaded2).toEqual([]);

      // Account 1 should still have its cookies
      const loaded1 = await cookieManager1.loadCookies();
      expect(loaded1).toHaveLength(1);
      expect(loaded1[0].value).toBe('account1_session');

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });
  });

  describe('Cookie read/write operations', () => {
    it('should read correct cookie file for specified account', async () => {
      const account = accountManager.createAccount('Test User');
      const cookieManager = new CookieManager(undefined, account.id);

      const cookies: Cookie[] = [
        { name: 'test', value: 'correct_value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager.saveCookies(cookies);

      // Verify file exists at correct location
      const cookiePath = accountManager.getCookiePath(account.id);
      expect(fs.existsSync(cookiePath)).toBe(true);

      // Verify content
      const fileContent = await fs.promises.readFile(cookiePath, 'utf-8');
      const parsed = JSON.parse(fileContent);
      expect(parsed[0].value).toBe('correct_value');

      accountManager.deleteAccount(account.id);
    });

    it('should write to correct cookie file for specified account', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const cookieManager1 = new CookieManager(undefined, account1.id);

      const cookies: Cookie[] = [
        { name: 'test', value: 'user1_value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager1.saveCookies(cookies);

      // Verify only account1's file was written
      const path1 = accountManager.getCookiePath(account1.id);
      const path2 = accountManager.getCookiePath(account2.id);

      expect(fs.existsSync(path1)).toBe(true);
      expect(fs.existsSync(path2)).toBe(false);

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });

    it('should handle concurrent cookie operations', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');
      const account3 = accountManager.createAccount('User 3');

      const cookieManager1 = new CookieManager(undefined, account1.id);
      const cookieManager2 = new CookieManager(undefined, account2.id);
      const cookieManager3 = new CookieManager(undefined, account3.id);

      const cookies1: Cookie[] = [{ name: 'c1', value: 'v1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }];
      const cookies2: Cookie[] = [{ name: 'c2', value: 'v2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }];
      const cookies3: Cookie[] = [{ name: 'c3', value: 'v3', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }];

      // Save concurrently
      await Promise.all([
        cookieManager1.saveCookies(cookies1),
        cookieManager2.saveCookies(cookies2),
        cookieManager3.saveCookies(cookies3)
      ]);

      // Load and verify
      const [loaded1, loaded2, loaded3] = await Promise.all([
        cookieManager1.loadCookies(),
        cookieManager2.loadCookies(),
        cookieManager3.loadCookies()
      ]);

      expect(loaded1[0].name).toBe('c1');
      expect(loaded2[0].name).toBe('c2');
      expect(loaded3[0].name).toBe('c3');

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
      accountManager.deleteAccount(account3.id);
    });
  });

  describe('Cookie cleanup on account deletion', () => {
    it('should delete cookies when account is deleted', async () => {
      const account = accountManager.createAccount('Test User');
      const cookieManager = new CookieManager(undefined, account.id);

      const cookies: Cookie[] = [
        { name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager.saveCookies(cookies);

      const cookiePath = accountManager.getCookiePath(account.id);
      expect(fs.existsSync(cookiePath)).toBe(true);

      accountManager.deleteAccount(account.id);

      expect(fs.existsSync(cookiePath)).toBe(false);
    });

    it('should not affect other account cookies when deleting one account', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const cookieManager1 = new CookieManager(undefined, account1.id);
      const cookieManager2 = new CookieManager(undefined, account2.id);

      const cookies: Cookie[] = [
        { name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager1.saveCookies(cookies);
      await cookieManager2.saveCookies(cookies);

      accountManager.deleteAccount(account1.id);

      // Account 2 cookies should still exist
      const loaded2 = await cookieManager2.loadCookies();
      expect(loaded2).toHaveLength(1);

      accountManager.deleteAccount(account2.id);
    });
  });

  describe('Default account cookie handling', () => {
    it('should use default cookie path when no accountId specified', async () => {
      const cookieManager = new CookieManager();

      const cookies: Cookie[] = [
        { name: 'default', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager.saveCookies(cookies);

      const defaultPath = accountManager.getCookiePath();
      expect(fs.existsSync(defaultPath)).toBe(true);
    });

    it('should not mix default and account-specific cookies', async () => {
      const account = accountManager.createAccount('Test User');

      const defaultManager = new CookieManager();
      const accountManager1 = new CookieManager(undefined, account.id);

      const defaultCookies: Cookie[] = [
        { name: 'default', value: 'default_value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];
      const accountCookies: Cookie[] = [
        { name: 'account', value: 'account_value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await defaultManager.saveCookies(defaultCookies);
      await accountManager1.saveCookies(accountCookies);

      const loadedDefault = await defaultManager.loadCookies();
      const loadedAccount = await accountManager1.loadCookies();

      expect(loadedDefault[0].name).toBe('default');
      expect(loadedAccount[0].name).toBe('account');

      accountManager.deleteAccount(account.id);
    });
  });

  describe('Cookie file permissions and structure', () => {
    it('should create parent directories if not exist', async () => {
      const account = accountManager.createAccount('Test User');

      const accountDir = path.join(testBaseDir, '.mcp', 'rednote', 'accounts', account.id);

      // Delete directory to test recreation
      if (fs.existsSync(accountDir)) {
        fs.rmSync(accountDir, { recursive: true });
      }

      // Verify directory doesn't exist
      expect(fs.existsSync(accountDir)).toBe(false);

      const cookieManager = new CookieManager(undefined, account.id);
      const cookies: Cookie[] = [
        { name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager.saveCookies(cookies);

      // Verify directory was created
      const cookiePath = accountManager.getCookiePath(account.id);
      expect(fs.existsSync(cookiePath)).toBe(true);

      accountManager.deleteAccount(account.id);
    });

    it('should save cookies in valid JSON format', async () => {
      const account = accountManager.createAccount('Test User');
      const cookieManager = new CookieManager(undefined, account.id);

      const cookies: Cookie[] = [
        { name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ];

      await cookieManager.saveCookies(cookies);

      const cookiePath = accountManager.getCookiePath(account.id);
      const content = await fs.promises.readFile(cookiePath, 'utf-8');

      expect(() => JSON.parse(content)).not.toThrow();
      const parsed = JSON.parse(content);
      expect(Array.isArray(parsed)).toBe(true);

      accountManager.deleteAccount(account.id);
    });
  });
});
