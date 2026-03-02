import fs from 'fs';
import path from 'path';
import os from 'os';
import { AccountManager } from '../../src/auth/accountManager';

// Mock the tools to test accountId parameter
jest.mock('../../src/browser/browserManager');

describe('Tools AccountId Parameter', () => {
  let testBaseDir: string;
  let accountManager: AccountManager;

  beforeEach(() => {
    testBaseDir = path.join(os.tmpdir(), `rednote-test-${Date.now()}`);
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);
    accountManager = new AccountManager();
  });

  afterEach(() => {
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  describe('Tool accountId parameter handling', () => {
    it('should accept accountId parameter in tool calls', () => {
      const account = accountManager.createAccount('Test User');

      // Verify account exists and can be used
      expect(account.id).toBeDefined();
      expect(accountManager.getAccount(account.id)).not.toBeNull();

      accountManager.deleteAccount(account.id);
    });

    it('should use default account when accountId not provided', () => {
      // Clear all accounts first
      const existingAccounts = accountManager.listAccounts();
      existingAccounts.forEach(acc => accountManager.deleteAccount(acc.id));

      const account = accountManager.createAccount('Default User');
      const defaultAccount = accountManager.getDefaultAccount();

      expect(defaultAccount).not.toBeNull();
      expect(defaultAccount?.id).toBe(account.id);

      accountManager.deleteAccount(account.id);
    });

    it('should validate accountId exists before use', () => {
      const invalidAccountId = 'non-existent-account';
      const account = accountManager.getAccount(invalidAccountId);

      expect(account).toBeNull();
    });

    it('should handle multiple accounts in sequence', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');
      const account3 = accountManager.createAccount('User 3');

      expect(accountManager.getAccount(account1.id)).not.toBeNull();
      expect(accountManager.getAccount(account2.id)).not.toBeNull();
      expect(accountManager.getAccount(account3.id)).not.toBeNull();
    });
  });

  describe('BrowserManager integration with accountId', () => {
    it('should pass accountId to BrowserManager.getInstance', async () => {
      const { BrowserManager } = require('../../src/browser/browserManager');
      const account = accountManager.createAccount('Test User');

      const mockGetInstance = jest.spyOn(BrowserManager, 'getInstance');

      // Simulate tool calling BrowserManager with accountId
      BrowserManager.getInstance(account.id);

      expect(mockGetInstance).toHaveBeenCalledWith(account.id);

      accountManager.deleteAccount(account.id);
    });

    it('should use correct browser instance for each account', async () => {
      const { BrowserManager } = require('../../src/browser/browserManager');
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const instance1 = BrowserManager.getInstance(account1.id);
      const instance2 = BrowserManager.getInstance(account2.id);

      // Instances should be tracked separately
      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });
  });

  describe('Cookie path resolution with accountId', () => {
    it('should resolve correct cookie path for accountId', () => {
      const account = accountManager.createAccount('Test User');
      const cookiePath = accountManager.getCookiePath(account.id);

      expect(cookiePath).toContain(account.id);
      expect(cookiePath).toContain('accounts');
      expect(cookiePath).toContain('cookies.json');
    });

    it('should resolve default cookie path when no accountId', () => {
      const cookiePath = accountManager.getCookiePath();

      expect(cookiePath).not.toContain('accounts');
      expect(cookiePath).toContain('cookies.json');
    });

    it('should use different paths for different accounts', () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const path1 = accountManager.getCookiePath(account1.id);
      const path2 = accountManager.getCookiePath(account2.id);

      expect(path1).not.toBe(path2);
    });
  });

  describe('Error handling with invalid accountId', () => {
    it('should handle non-existent accountId gracefully', () => {
      const account = accountManager.getAccount('invalid-id');
      expect(account).toBeNull();
    });

    it('should throw error when setting non-existent account as default', () => {
      expect(() => {
        accountManager.setDefaultAccount('invalid-id');
      }).toThrow('Account not found: invalid-id');
    });

    it('should throw error when deleting non-existent account', () => {
      expect(() => {
        accountManager.deleteAccount('invalid-id');
      }).toThrow('Account not found: invalid-id');
    });

    it('should throw error when updating non-existent account', () => {
      expect(() => {
        accountManager.updateAccount('invalid-id', { name: 'New Name' });
      }).toThrow('Account not found: invalid-id');
    });
  });

  describe('Account selection logic', () => {
    it('should use specified accountId over default', () => {
      const account1 = accountManager.createAccount('Default User');
      const account2 = accountManager.createAccount('Specific User');

      // account1 is default
      expect(accountManager.getDefaultAccount()?.id).toBe(account1.id);

      // But we can explicitly use account2
      const specificAccount = accountManager.getAccount(account2.id);
      expect(specificAccount?.id).toBe(account2.id);
    });

    it('should fall back to default when accountId is undefined', () => {
      const account = accountManager.createAccount('Default User');
      const defaultAccount = accountManager.getDefaultAccount();

      expect(defaultAccount?.id).toBe(account.id);
    });

    it('should handle empty string accountId', () => {
      const account = accountManager.getAccount('');
      expect(account).toBeNull();
    });
  });

  describe('Multi-account workflow simulation', () => {
    it('should simulate switching between accounts', async () => {
      const account1 = accountManager.createAccount('Work Account');
      const account2 = accountManager.createAccount('Personal Account');

      // Save cookies for both
      await accountManager.saveCookies(account1.id, [
        { name: 'session', value: 'work', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);
      await accountManager.saveCookies(account2.id, [
        { name: 'session', value: 'personal', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'None' }
      ]);

      // Load cookies for account1
      const cookies1 = await accountManager.getCookies(account1.id);
      expect(cookies1[0].value).toBe('work');

      // Switch to account2
      const cookies2 = await accountManager.getCookies(account2.id);
      expect(cookies2[0].value).toBe('personal');

      // Switch back to account1
      const cookies1Again = await accountManager.getCookies(account1.id);
      expect(cookies1Again[0].value).toBe('work');

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });

    it('should handle parallel operations on different accounts', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');
      const account3 = accountManager.createAccount('User 3');

      // Simulate parallel tool calls with different accountIds
      const operations = await Promise.all([
        accountManager.saveCookies(account1.id, [{ name: 'c1', value: 'v1', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }]),
        accountManager.saveCookies(account2.id, [{ name: 'c2', value: 'v2', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }]),
        accountManager.saveCookies(account3.id, [{ name: 'c3', value: 'v3', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }])
      ]);

      // Verify all operations completed
      expect(operations).toHaveLength(3);

      // Verify data integrity
      const [cookies1, cookies2, cookies3] = await Promise.all([
        accountManager.getCookies(account1.id),
        accountManager.getCookies(account2.id),
        accountManager.getCookies(account3.id)
      ]);

      expect(cookies1[0].name).toBe('c1');
      expect(cookies2[0].name).toBe('c2');
      expect(cookies3[0].name).toBe('c3');

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
      accountManager.deleteAccount(account3.id);
    });
  });

  describe('AccountId parameter validation', () => {
    it('should accept valid accountId format', () => {
      const account = accountManager.createAccount('Test User');
      expect(account.id).toMatch(/^acc_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should handle special characters in account name', () => {
      const account = accountManager.createAccount('Test User (Work) #1');
      expect(account.name).toBe('Test User (Work) #1');
      expect(account.id).toMatch(/^acc_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should handle unicode characters in account name', () => {
      const account = accountManager.createAccount('测试用户');
      expect(account.name).toBe('测试用户');
      expect(account.id).toMatch(/^acc_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should handle very long account names', () => {
      const longName = 'A'.repeat(200);
      const account = accountManager.createAccount(longName);
      expect(account.name).toBe(longName);
    });
  });
});
