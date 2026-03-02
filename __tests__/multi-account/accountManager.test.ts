import fs from 'fs';
import path from 'path';
import os from 'os';
import { AccountManager, Account } from '../../src/auth/accountManager';

describe('AccountManager', () => {
  let accountManager: AccountManager;
  let testBaseDir: string;

  beforeEach(() => {
    // 使用临时目录进行测试
    testBaseDir = path.join(os.tmpdir(), `rednote-test-${Date.now()}`);

    // Mock os.homedir to use test directory
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);

    accountManager = new AccountManager();
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('createAccount', () => {
    it('should create account with unique ID', () => {
      const account = accountManager.createAccount('Test User');

      expect(account.id).toMatch(/^acc_[a-z0-9]+_[a-z0-9]+$/);
      expect(account.name).toBe('Test User');
      expect(account.createdAt).toBeDefined();
      expect(new Date(account.createdAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should create account directory', () => {
      const account = accountManager.createAccount('Test User');
      const accountDir = path.join(testBaseDir, '.mcp', 'rednote', 'accounts', account.id);

      expect(fs.existsSync(accountDir)).toBe(true);
    });

    it('should set first account as default', () => {
      const account = accountManager.createAccount('First User');
      const defaultAccount = accountManager.getDefaultAccount();

      expect(defaultAccount).not.toBeNull();
      expect(defaultAccount?.id).toBe(account.id);
    });

    it('should not set second account as default', () => {
      const firstAccount = accountManager.createAccount('First User');
      const secondAccount = accountManager.createAccount('Second User');
      const defaultAccount = accountManager.getDefaultAccount();

      expect(defaultAccount?.id).toBe(firstAccount.id);
      expect(defaultAccount?.id).not.toBe(secondAccount.id);
    });

    it('should generate unique IDs for multiple accounts', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');
      const account3 = accountManager.createAccount('User 3');

      expect(account1.id).not.toBe(account2.id);
      expect(account2.id).not.toBe(account3.id);
      expect(account1.id).not.toBe(account3.id);
    });
  });

  describe('listAccounts', () => {
    it('should return empty array when no accounts', () => {
      const accounts = accountManager.listAccounts();
      expect(accounts).toEqual([]);
    });

    it('should return all created accounts', () => {
      accountManager.createAccount('User 1');
      accountManager.createAccount('User 2');
      accountManager.createAccount('User 3');

      const accounts = accountManager.listAccounts();
      expect(accounts).toHaveLength(3);
      expect(accounts[0].name).toBe('User 1');
      expect(accounts[1].name).toBe('User 2');
      expect(accounts[2].name).toBe('User 3');
    });
  });

  describe('getAccount', () => {
    it('should return account by ID', () => {
      const created = accountManager.createAccount('Test User');
      const retrieved = accountManager.getAccount(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test User');
    });

    it('should return null for non-existent account', () => {
      const account = accountManager.getAccount('non-existent-id');
      expect(account).toBeNull();
    });
  });

  describe('deleteAccount', () => {
    it('should delete account and its directory', () => {
      const account = accountManager.createAccount('Test User');
      const accountDir = path.join(testBaseDir, '.mcp', 'rednote', 'accounts', account.id);

      expect(fs.existsSync(accountDir)).toBe(true);

      accountManager.deleteAccount(account.id);

      expect(fs.existsSync(accountDir)).toBe(false);
      expect(accountManager.getAccount(account.id)).toBeNull();
    });

    it('should throw error when deleting non-existent account', () => {
      expect(() => {
        accountManager.deleteAccount('non-existent-id');
      }).toThrow('Account not found: non-existent-id');
    });

    it('should reset default account when deleting default', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      expect(accountManager.getDefaultAccount()?.id).toBe(account1.id);

      accountManager.deleteAccount(account1.id);

      expect(accountManager.getDefaultAccount()?.id).toBe(account2.id);
    });

    it('should clear default when deleting last account', () => {
      const account = accountManager.createAccount('Only User');
      accountManager.deleteAccount(account.id);

      expect(accountManager.getDefaultAccount()).toBeNull();
    });

    it('should delete account with cookies', async () => {
      const account = accountManager.createAccount('Test User');
      const cookies = [
        { name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const }
      ];

      await accountManager.saveCookies(account.id, cookies);
      expect(accountManager.hasCookies(account.id)).toBe(true);

      accountManager.deleteAccount(account.id);

      expect(accountManager.hasCookies(account.id)).toBe(false);
    });
  });

  describe('setDefaultAccount', () => {
    it('should set default account', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      accountManager.setDefaultAccount(account2.id);

      expect(accountManager.getDefaultAccount()?.id).toBe(account2.id);
    });

    it('should throw error for non-existent account', () => {
      expect(() => {
        accountManager.setDefaultAccount('non-existent-id');
      }).toThrow('Account not found: non-existent-id');
    });
  });

  describe('updateAccount', () => {
    it('should update account name', () => {
      const account = accountManager.createAccount('Old Name');
      const updated = accountManager.updateAccount(account.id, { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect(updated.id).toBe(account.id);
      expect(updated.createdAt).toBe(account.createdAt);
    });

    it('should update lastLoginAt', () => {
      const account = accountManager.createAccount('Test User');
      const loginTime = new Date().toISOString();
      const updated = accountManager.updateAccount(account.id, { lastLoginAt: loginTime });

      expect(updated.lastLoginAt).toBe(loginTime);
    });

    it('should throw error for non-existent account', () => {
      expect(() => {
        accountManager.updateAccount('non-existent-id', { name: 'New Name' });
      }).toThrow('Account not found: non-existent-id');
    });
  });

  describe('getCookiePath', () => {
    it('should return account-specific cookie path', () => {
      const account = accountManager.createAccount('Test User');
      const cookiePath = accountManager.getCookiePath(account.id);

      expect(cookiePath).toContain('accounts');
      expect(cookiePath).toContain(account.id);
      expect(cookiePath).toContain('cookies.json');
    });

    it('should return default cookie path when no accountId', () => {
      const cookiePath = accountManager.getCookiePath();

      expect(cookiePath).not.toContain('accounts');
      expect(cookiePath).toContain('cookies.json');
    });
  });

  describe('Cookie operations', () => {
    it('should save and load cookies', async () => {
      const account = accountManager.createAccount('Test User');
      const cookies = [
        { name: 'web_session', value: 'test123', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' as const }
      ];

      await accountManager.saveCookies(account.id, cookies);
      const loaded = await accountManager.getCookies(account.id);

      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('web_session');
      expect(loaded[0].value).toBe('test123');
    });

    it('should update lastLoginAt when saving cookies', async () => {
      const account = accountManager.createAccount('Test User');
      const beforeSave = Date.now();

      await accountManager.saveCookies(account.id, []);

      const updated = accountManager.getAccount(account.id);
      expect(updated?.lastLoginAt).toBeDefined();
      expect(new Date(updated!.lastLoginAt!).getTime()).toBeGreaterThanOrEqual(beforeSave);
    });

    it('should return empty array for non-existent cookies', async () => {
      const account = accountManager.createAccount('Test User');
      const cookies = await accountManager.getCookies(account.id);

      expect(cookies).toEqual([]);
    });

    it('should clear cookies', async () => {
      const account = accountManager.createAccount('Test User');
      await accountManager.saveCookies(account.id, [{ name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const }]);

      expect(accountManager.hasCookies(account.id)).toBe(true);

      await accountManager.clearCookies(account.id);

      expect(accountManager.hasCookies(account.id)).toBe(false);
    });

    it('should check cookie existence', () => {
      const account = accountManager.createAccount('Test User');

      expect(accountManager.hasCookies(account.id)).toBe(false);
    });
  });

  describe('getAccountSummary', () => {
    it('should return account with cookie status', async () => {
      const account = accountManager.createAccount('Test User');
      await accountManager.saveCookies(account.id, [{ name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const }]);

      const summary = accountManager.getAccountSummary(account.id);

      expect(summary).not.toBeNull();
      expect(summary?.account.id).toBe(account.id);
      expect(summary?.hasCookies).toBe(true);
    });

    it('should return null for non-existent account', () => {
      const summary = accountManager.getAccountSummary('non-existent-id');
      expect(summary).toBeNull();
    });
  });
});
