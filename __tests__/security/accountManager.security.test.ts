import { AccountManager } from '../../src/auth/accountManager';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AccountManager Security Tests', () => {
  let accountManager: AccountManager;
  let testBaseDir: string;

  beforeEach(() => {
    // 使用临时目录进行测试
    testBaseDir = path.join(os.tmpdir(), `rednote-test-${Date.now()}`);
    process.env.HOME = testBaseDir;
    accountManager = new AccountManager();
  });

  afterEach(() => {
    // 清理测试目录
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  describe('validateAccountId - Path Traversal Prevention', () => {
    test('should reject path traversal with ../', () => {
      expect(() => {
        accountManager.getAccount('../../../etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should reject path traversal with ..\\', () => {
      expect(() => {
        accountManager.getAccount('..\\..\\..\\windows\\system32');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should reject absolute paths', () => {
      expect(() => {
        accountManager.getAccount('/etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should reject paths with forward slashes', () => {
      expect(() => {
        accountManager.getAccount('acc_123/../../etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should reject paths with backslashes', () => {
      expect(() => {
        accountManager.getAccount('acc_123\\..\\..\\etc\\passwd');
      }).toThrow('Account ID contains invalid characters');
    });
  });

  describe('validateAccountId - Format Validation', () => {
    test('should reject invalid format - missing prefix', () => {
      expect(() => {
        accountManager.getAccount('invalid_12345678_abcd');
      }).toThrow('Invalid account ID format');
    });

    test('should reject invalid format - wrong separator', () => {
      expect(() => {
        accountManager.getAccount('acc-12345678-abcd');
      }).toThrow('Invalid account ID format');
    });

    test('should reject invalid format - uppercase letters', () => {
      expect(() => {
        accountManager.getAccount('acc_ABCDEFGH_abcd');
      }).toThrow('Invalid account ID format');
    });

    test('should reject invalid format - special characters', () => {
      expect(() => {
        accountManager.getAccount('acc_123@5678_abcd');
      }).toThrow('Invalid account ID format');
    });

    test('should reject invalid format - timestamp too short', () => {
      expect(() => {
        accountManager.getAccount('acc_1234567_abcd');
      }).toThrow('Invalid account ID format');
    });

    test('should reject invalid format - timestamp too long', () => {
      expect(() => {
        accountManager.getAccount('acc_1234567890123_abcd');
      }).toThrow('Invalid account ID format');
    });

    test('should reject invalid format - random part wrong length', () => {
      expect(() => {
        accountManager.getAccount('acc_12345678_abc');
      }).toThrow('Invalid account ID format');
    });

    test('should accept valid format', () => {
      // 创建一个有效账号
      const account = accountManager.createAccount('Test Account');

      // 验证可以获取该账号
      const retrieved = accountManager.getAccount(account.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(account.id);
    });
  });

  describe('validateAccountId - Length Validation', () => {
    test('should reject account ID longer than 50 characters', () => {
      const longId = 'acc_' + 'a'.repeat(50);
      expect(() => {
        accountManager.getAccount(longId);
      }).toThrow('Account ID too long');
    });

    test('should accept account ID within length limit', () => {
      const account = accountManager.createAccount('Test');
      expect(account.id.length).toBeLessThanOrEqual(50);
    });
  });

  describe('validateAccountId - Injection Prevention', () => {
    test('should reject command injection attempts', () => {
      expect(() => {
        accountManager.getAccount('acc_12345678_abcd; rm -rf /');
      }).toThrow(); // 可能被格式验证或字符验证拦截
    });

    test('should reject SQL injection attempts', () => {
      expect(() => {
        accountManager.getAccount("acc_12345678_abcd' OR '1'='1");
      }).toThrow('Invalid account ID format');
    });

    test('should reject null byte injection', () => {
      expect(() => {
        accountManager.getAccount('acc_12345678_abcd\0');
      }).toThrow('Invalid account ID format');
    });
  });

  describe('Security in getCookiePath', () => {
    test('should prevent path traversal in cookie path', () => {
      expect(() => {
        accountManager.getCookiePath('../../../etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should return safe path for valid accountId', () => {
      const account = accountManager.createAccount('Test');
      const cookiePath = accountManager.getCookiePath(account.id);

      // 验证路径不包含遍历字符
      expect(cookiePath).not.toContain('..');
      expect(cookiePath).toContain(account.id);
    });
  });

  describe('Security in setDefaultAccount', () => {
    test('should validate accountId before setting default', () => {
      expect(() => {
        accountManager.setDefaultAccount('../../../etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should set default for valid accountId', () => {
      const account = accountManager.createAccount('Test');
      accountManager.setDefaultAccount(account.id);

      const defaultAccount = accountManager.getDefaultAccount();
      expect(defaultAccount?.id).toBe(account.id);
    });
  });

  describe('Security in deleteAccount', () => {
    test('should validate accountId before deletion', () => {
      expect(() => {
        accountManager.deleteAccount('../../../etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should safely delete valid account', () => {
      const account = accountManager.createAccount('Test');
      accountManager.deleteAccount(account.id);

      const retrieved = accountManager.getAccount(account.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Security in updateAccount', () => {
    test('should validate accountId before update', () => {
      expect(() => {
        accountManager.updateAccount('../../../etc/passwd', { name: 'Hacked' });
      }).toThrow('Account ID contains invalid characters');
    });

    test('should update valid account', () => {
      const account = accountManager.createAccount('Test');
      const updated = accountManager.updateAccount(account.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
    });
  });

  describe('Security in getAccountSummary', () => {
    test('should validate accountId before getting summary', () => {
      expect(() => {
        accountManager.getAccountSummary('../../../etc/passwd');
      }).toThrow('Account ID contains invalid characters');
    });

    test('should return summary for valid account', () => {
      const account = accountManager.createAccount('Test');
      const summary = accountManager.getAccountSummary(account.id);

      expect(summary).not.toBeNull();
      expect(summary?.account.id).toBe(account.id);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string', () => {
      expect(() => {
        accountManager.getAccount('');
      }).toThrow('Invalid account ID format');
    });

    test('should handle whitespace', () => {
      expect(() => {
        accountManager.getAccount('   ');
      }).toThrow('Invalid account ID format');
    });

    test('should handle unicode characters', () => {
      expect(() => {
        accountManager.getAccount('acc_12345678_你好');
      }).toThrow('Invalid account ID format');
    });
  });
});
