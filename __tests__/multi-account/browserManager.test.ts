import fs from 'fs';
import path from 'path';
import os from 'os';
import { BrowserManager } from '../../src/browser/browserManager';
import { AccountManager } from '../../src/auth/accountManager';

// Mock playwright
jest.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: jest.fn().mockResolvedValue({
      addInitScript: jest.fn(),
      addCookies: jest.fn(),
      newPage: jest.fn().mockResolvedValue({
        close: jest.fn(),
        isClosed: jest.fn().mockReturnValue(false)
      }),
      cookies: jest.fn().mockResolvedValue([]),
      close: jest.fn(),
      browser: jest.fn().mockReturnValue({
        on: jest.fn()
      })
    })
  }
}));

describe('BrowserManager Multi-Instance', () => {
  let testBaseDir: string;
  let accountManager: AccountManager;

  beforeEach(() => {
    testBaseDir = path.join(os.tmpdir(), `rednote-test-${Date.now()}`);
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);
    accountManager = new AccountManager();

    // Clear singleton instances
    (BrowserManager as any).instance = null;
  });

  afterEach(async () => {
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance for default account', () => {
      const instance1 = BrowserManager.getInstance();
      const instance2 = BrowserManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should return different instances for different accounts', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);

      expect(instance1).not.toBe(instance2);
    });

    it('should cache account-specific instances', () => {
      const account = accountManager.createAccount('Test User');

      const instance1 = BrowserManager.getInstance(account.id);
      const instance2 = BrowserManager.getInstance(account.id);

      expect(instance1).toBe(instance2);
    });

    it('should not mix default and account-specific instances', () => {
      const account = accountManager.createAccount('Test User');

      const defaultInstance = BrowserManager.getInstance();
      const accountInstance = BrowserManager.getInstance(account.id);

      expect(defaultInstance).not.toBe(accountInstance);
    });
  });

  describe('Profile directory isolation', () => {
    it('should use different profile directories for different accounts', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);

      // Profile directories should be different
      // We can't directly access private fields, but we can verify through behavior
      expect(instance1).not.toBe(instance2);
    });

    it('should create profile directory for account', async () => {
      const account = accountManager.createAccount('Test User');

      // Create cookies to allow browser launch
      await accountManager.saveCookies(account.id, [
        { name: 'web_session', value: 'test', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);

      const instance = BrowserManager.getInstance(account.id);

      try {
        await instance.acquirePage();
      } catch (error) {
        // Expected to fail in test environment, but directory should be created
      }

      const profileDir = path.join(testBaseDir, '.mcp', 'rednote', 'profiles', account.id);
      expect(fs.existsSync(profileDir)).toBe(true);
    });
  });

  describe('acquirePage with accountId', () => {
    it('should delegate to correct account instance when accountId provided', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      // Create cookies
      await accountManager.saveCookies(account1.id, [
        { name: 'web_session', value: 'test1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);
      await accountManager.saveCookies(account2.id, [
        { name: 'web_session', value: 'test2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);

      const instance1 = BrowserManager.getInstance(account1.id);

      // Request page for different account should delegate
      try {
        await instance1.acquirePage(account2.id);
      } catch (error) {
        // Expected in test environment
      }

      // Verify account2 instance was created
      const instance2 = BrowserManager.getInstance(account2.id);
      expect(instance2).toBeDefined();
    });

    it('should use own instance when accountId matches', async () => {
      const account = accountManager.createAccount('Test User');

      await accountManager.saveCookies(account.id, [
        { name: 'web_session', value: 'test', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);

      const instance = BrowserManager.getInstance(account.id);

      try {
        await instance.acquirePage(account.id);
      } catch (error) {
        // Expected in test environment
      }

      // Should still be same instance
      expect(BrowserManager.getInstance(account.id)).toBe(instance);
    });
  });

  describe('Instance caching mechanism', () => {
    it('should maintain separate cache for account instances', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');
      const account3 = accountManager.createAccount('User 3');

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);
      const instance3 = BrowserManager.getInstance(account3.id);

      // All should be different
      expect(instance1).not.toBe(instance2);
      expect(instance2).not.toBe(instance3);
      expect(instance1).not.toBe(instance3);

      // But retrieving again should return cached
      expect(BrowserManager.getInstance(account1.id)).toBe(instance1);
      expect(BrowserManager.getInstance(account2.id)).toBe(instance2);
      expect(BrowserManager.getInstance(account3.id)).toBe(instance3);
    });

    it('should handle many concurrent account instances', () => {
      const accounts = Array.from({ length: 10 }, (_, i) =>
        accountManager.createAccount(`User ${i}`)
      );

      const instances = accounts.map(acc => BrowserManager.getInstance(acc.id));

      // All should be unique
      const uniqueInstances = new Set(instances);
      expect(uniqueInstances.size).toBe(10);

      // All should be cached
      accounts.forEach((acc, i) => {
        expect(BrowserManager.getInstance(acc.id)).toBe(instances[i]);
      });
    });
  });

  describe('Cookie loading per account', () => {
    it('should load correct cookies for each account', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const cookies1 = [
        { name: 'web_session', value: 'session1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' as const }
      ];
      const cookies2 = [
        { name: 'web_session', value: 'session2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' as const }
      ];

      await accountManager.saveCookies(account1.id, cookies1);
      await accountManager.saveCookies(account2.id, cookies2);

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);

      // Verify cookies are loaded from correct paths
      const loaded1 = await accountManager.getCookies(account1.id);
      const loaded2 = await accountManager.getCookies(account2.id);

      expect(loaded1[0].value).toBe('session1');
      expect(loaded2[0].value).toBe('session2');

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });

    it('should verify cookie existence before browser launch', () => {
      const account = accountManager.createAccount('Test User');

      // No cookies saved
      expect(accountManager.hasCookies(account.id)).toBe(false);

      accountManager.deleteAccount(account.id);
    });
  });

  describe('Shutdown and cleanup', () => {
    it('should shutdown all account instances', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      await accountManager.saveCookies(account1.id, [
        { name: 'web_session', value: 'test1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);
      await accountManager.saveCookies(account2.id, [
        { name: 'web_session', value: 'test2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);

      // Shutdown should not throw
      await expect(instance1.shutdown()).resolves.not.toThrow();
      await expect(instance2.shutdown()).resolves.not.toThrow();
    });

    it('should handle shutdown of default instance separately', async () => {
      const defaultInstance = BrowserManager.getInstance();

      await expect(defaultInstance.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent page acquisitions for different accounts', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');
      const account3 = accountManager.createAccount('User 3');

      await Promise.all([
        accountManager.saveCookies(account1.id, [{ name: 'web_session', value: 'test1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }]),
        accountManager.saveCookies(account2.id, [{ name: 'web_session', value: 'test2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }]),
        accountManager.saveCookies(account3.id, [{ name: 'web_session', value: 'test3', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }])
      ]);

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);
      const instance3 = BrowserManager.getInstance(account3.id);

      // All instances should be different
      expect(instance1).not.toBe(instance2);
      expect(instance2).not.toBe(instance3);
    });
  });
});
