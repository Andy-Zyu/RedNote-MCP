import fs from 'fs';
import path from 'path';
import { Cookie } from 'patchright';
import { AccountManager, accountManager } from './accountManager';
import logger from '../utils/logger';

/**
 * Cookie 管理器
 * 支持多账号模式，通过 accountId 参数指定操作哪个账号的 Cookie
 */
export class CookieManager {
  private readonly accountManager: AccountManager;
  private readonly accountId?: string;

  /**
   * @param cookiePath 已弃用，保留向后兼容
   * @param accountId 可选的账号 ID，如果指定则操作该账号的 Cookie
   */
  constructor(cookiePath?: string, accountId?: string) {
    this.accountManager = accountManager;
    this.accountId = accountId;

    if (cookiePath) {
      logger.warn('cookiePath parameter is deprecated, use accountId instead');
    }

    logger.info(`CookieManager initialized${accountId ? ` for account: ${accountId}` : ' (default)'}`);
  }

  /**
   * 获取 Cookie 文件路径
   */
  private getCookiePath(): string {
    return this.accountManager.getCookiePath(this.accountId);
  }

  /**
   * 保存 Cookie
   */
  async saveCookies(cookies: Cookie[]): Promise<void> {
    const cookiePath = this.getCookiePath();
    const dir = path.dirname(cookiePath);

    if (!fs.existsSync(dir)) {
      logger.info(`Creating directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(cookiePath, JSON.stringify(cookies, null, 2));
    logger.info(`Saved ${cookies.length} cookies to ${cookiePath}`);

    // 更新账号的最后登录时间
    if (this.accountId) {
      this.accountManager.updateAccount(this.accountId, {
        lastLoginAt: new Date().toISOString()
      });
    }
  }

  /**
   * 加载 Cookie
   */
  async loadCookies(): Promise<Cookie[]> {
    const cookiePath = this.getCookiePath();

    if (!fs.existsSync(cookiePath)) {
      logger.info(`No cookies file found at ${cookiePath}, returning empty array`);
      return [];
    }

    logger.info(`Loading cookies from ${cookiePath}`);
    const data = await fs.promises.readFile(cookiePath, 'utf-8');
    const cookies = JSON.parse(data);
    logger.info(`Loaded ${cookies.length} cookies`);
    return cookies;
  }

  /**
   * 清除 Cookie
   */
  async clearCookies(): Promise<void> {
    const cookiePath = this.getCookiePath();

    if (fs.existsSync(cookiePath)) {
      logger.info(`Clearing cookies at ${cookiePath}`);
      await fs.promises.unlink(cookiePath);
      logger.info('Cookies cleared successfully');
    } else {
      logger.info('No cookies file found to clear');
    }
  }

  /**
   * 检查是否有 Cookie
   */
  hasCookies(): boolean {
    const cookiePath = this.getCookiePath();
    return fs.existsSync(cookiePath);
  }
}
