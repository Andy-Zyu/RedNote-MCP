import fs from 'fs';
import path from 'path';
import os from 'os';
import { Cookie } from 'playwright';
import logger from '../utils/logger';

/**
 * 账号信息接口
 */
export interface Account {
  id: string;
  name: string;
  createdAt: string;
  lastLoginAt?: string;
  lastCheckTime?: string;
  lastActiveTime?: string;
  isActive?: boolean;
}

/**
 * 账号索引文件结构
 */
interface AccountsIndex {
  accounts: Account[];
  defaultAccountId?: string;
}

/**
 * 账号管理器
 * 管理多账号的创建、删除、查询和 Cookie 存储
 */
export class AccountManager {
  private readonly baseDir: string;
  private readonly accountsDir: string;
  private readonly indexPath: string;
  private readonly defaultCookiePath: string;

  constructor() {
    const homeDir = os.homedir();
    this.baseDir = path.join(homeDir, '.mcp', 'rednote');
    this.accountsDir = path.join(this.baseDir, 'accounts');
    this.indexPath = path.join(this.baseDir, 'accounts.json');
    this.defaultCookiePath = path.join(this.baseDir, 'cookies.json');

    // 确保目录存在
    this.ensureDirectories();
    logger.info(`AccountManager initialized with baseDir: ${this.baseDir}`);
  }

  /**
   * 确保必要的目录存在
   */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      logger.info(`Created base directory: ${this.baseDir}`);
    }
    if (!fs.existsSync(this.accountsDir)) {
      fs.mkdirSync(this.accountsDir, { recursive: true });
      logger.info(`Created accounts directory: ${this.accountsDir}`);
    }
  }

  /**
   * 读取账号索引
   */
  private readIndex(): AccountsIndex {
    if (!fs.existsSync(this.indexPath)) {
      return { accounts: [] };
    }
    try {
      const data = fs.readFileSync(this.indexPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to read accounts index:', error);
      return { accounts: [] };
    }
  }

  /**
   * 写入账号索引
   */
  private writeIndex(index: AccountsIndex): void {
    fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
    logger.info('Accounts index updated');
  }

  /**
   * 生成唯一账号 ID
   */
  private generateAccountId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `acc_${timestamp}_${random}`;
  }

  /**
   * 验证 accountId 格式和安全性
   * 防止路径遍历和注入攻击
   */
  private validateAccountId(accountId: string): void {
    // 1. 长度限制（先检查，避免处理超长字符串）
    if (accountId.length > 50) {
      throw new Error('Account ID too long');
    }

    // 2. 禁止路径遍历字符
    if (accountId.includes('..') || accountId.includes('/') || accountId.includes('\\')) {
      throw new Error('Account ID contains invalid characters');
    }

    // 3. 格式验证 - 必须匹配 acc_[timestamp]_[random] 格式
    const accountIdRegex = /^acc_[a-z0-9]{8,12}_[a-z0-9]{4}$/;
    if (!accountIdRegex.test(accountId)) {
      throw new Error(`Invalid account ID format: ${accountId}`);
    }
  }

  /**
   * 列出所有账号
   */
  listAccounts(): Account[] {
    const index = this.readIndex();
    return index.accounts;
  }

  /**
   * 获取账号信息
   */
  getAccount(accountId: string): Account | null {
    this.validateAccountId(accountId);
    const index = this.readIndex();
    return index.accounts.find(a => a.id === accountId) || null;
  }

  /**
   * 获取默认账号
   */
  getDefaultAccount(): Account | null {
    const index = this.readIndex();
    if (index.defaultAccountId) {
      return index.accounts.find(a => a.id === index.defaultAccountId) || null;
    }
    // 如果没有设置默认账号，返回第一个账号
    return index.accounts[0] || null;
  }

  /**
   * 设置默认账号
   */
  setDefaultAccount(accountId: string): void {
    this.validateAccountId(accountId);
    const index = this.readIndex();
    const account = index.accounts.find(a => a.id === accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    index.defaultAccountId = accountId;
    this.writeIndex(index);
    logger.info(`Default account set to: ${accountId}`);
  }

  /**
   * 创建新账号
   */
  createAccount(name: string): Account {
    const id = this.generateAccountId();
    const account: Account = {
      id,
      name,
      createdAt: new Date().toISOString(),
    };

    // 创建账号目录
    const accountDir = path.join(this.accountsDir, id);
    fs.mkdirSync(accountDir, { recursive: true });
    logger.info(`Created account directory: ${accountDir}`);

    // 更新索引
    const index = this.readIndex();
    index.accounts.push(account);

    // 如果是第一个账号，设为默认
    if (index.accounts.length === 1) {
      index.defaultAccountId = id;
    }

    this.writeIndex(index);
    logger.info(`Account created: ${id} (${name})`);

    return account;
  }

  /**
   * 删除账号
   */
  deleteAccount(accountId: string): void {
    this.validateAccountId(accountId);
    const index = this.readIndex();
    const accountIndex = index.accounts.findIndex(a => a.id === accountId);

    if (accountIndex === -1) {
      throw new Error(`Account not found: ${accountId}`);
    }

    // 删除账号目录
    const accountDir = path.join(this.accountsDir, accountId);
    if (fs.existsSync(accountDir)) {
      fs.rmSync(accountDir, { recursive: true });
      logger.info(`Deleted account directory: ${accountDir}`);
    }

    // 从索引中移除
    index.accounts.splice(accountIndex, 1);

    // 如果删除的是默认账号，重新设置默认
    if (index.defaultAccountId === accountId) {
      index.defaultAccountId = index.accounts[0]?.id;
    }

    this.writeIndex(index);
    logger.info(`Account deleted: ${accountId}`);
  }

  /**
   * 更新账号信息
   */
  updateAccount(accountId: string, updates: Partial<Omit<Account, 'id' | 'createdAt'>>): Account {
    this.validateAccountId(accountId);
    const index = this.readIndex();
    const account = index.accounts.find(a => a.id === accountId);

    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    Object.assign(account, updates);
    this.writeIndex(index);
    logger.info(`Account updated: ${accountId}`);

    return account;
  }

  /**
   * 获取账号 Cookie 文件路径
   */
  getCookiePath(accountId?: string): string {
    if (accountId) {
      this.validateAccountId(accountId);
      return path.join(this.accountsDir, accountId, 'cookies.json');
    }
    return this.defaultCookiePath;
  }

  /**
   * 获取指定账号的 Cookie
   */
  async getCookies(accountId?: string): Promise<Cookie[]> {
    const cookiePath = this.getCookiePath(accountId);

    if (!fs.existsSync(cookiePath)) {
      logger.info(`No cookies found at: ${cookiePath}`);
      return [];
    }

    try {
      const data = await fs.promises.readFile(cookiePath, 'utf-8');
      const cookies = JSON.parse(data);
      logger.info(`Loaded ${cookies.length} cookies from: ${cookiePath}`);
      return cookies;
    } catch (error) {
      logger.error(`Failed to load cookies from ${cookiePath}:`, error);
      return [];
    }
  }

  /**
   * 保存 Cookie 到指定账号
   */
  async saveCookies(accountId: string | undefined, cookies: Cookie[]): Promise<void> {
    const cookiePath = this.getCookiePath(accountId);
    const dir = path.dirname(cookiePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(cookiePath, JSON.stringify(cookies, null, 2));
    logger.info(`Saved ${cookies.length} cookies to: ${cookiePath}`);

    // 更新最后登录时间
    if (accountId) {
      this.updateAccount(accountId, { lastLoginAt: new Date().toISOString() });
    }
  }

  /**
   * 清除指定账号的 Cookie
   */
  async clearCookies(accountId?: string): Promise<void> {
    const cookiePath = this.getCookiePath(accountId);

    if (fs.existsSync(cookiePath)) {
      await fs.promises.unlink(cookiePath);
      logger.info(`Cleared cookies at: ${cookiePath}`);
    }
  }

  /**
   * 检查账号是否存在 Cookie
   */
  hasCookies(accountId?: string): boolean {
    const cookiePath = this.getCookiePath(accountId);
    return fs.existsSync(cookiePath);
  }

  /**
   * 获取账号状态摘要
   */
  getAccountSummary(accountId: string): { account: Account; hasCookies: boolean } | null {
    this.validateAccountId(accountId);
    const account = this.getAccount(accountId);
    if (!account) {
      return null;
    }
    return {
      account,
      hasCookies: this.hasCookies(accountId),
    };
  }
}

// 导出单例
export const accountManager = new AccountManager();
