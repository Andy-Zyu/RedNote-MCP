import logger from '../utils/logger';
import { accountManager } from '../auth/accountManager';
import { RedNoteTools } from '../tools/rednoteTools';
import { BaseMonitor } from './baseMonitor';
import { MONITOR_INTERVAL } from '../constants/timeouts';

/**
 * 状态变化回调函数类型
 */
export type HealthChangeCallback = (accountId: string, isActive: boolean) => void;

/**
 * 账号健康状态监测器
 * 定期检查所有账号的活跃状态
 */
export class AccountHealthMonitor extends BaseMonitor {
  protected readonly CHECK_INTERVAL = MONITOR_INTERVAL.ACCOUNT_HEALTH;
  protected readonly monitorName = 'AccountHealthMonitor';

  private redNoteTools: RedNoteTools;
  private onHealthChange: HealthChangeCallback | null = null;

  constructor() {
    super();
    this.redNoteTools = new RedNoteTools();
    logger.info('AccountHealthMonitor initialized');
  }

  /**
   * 设置状态变化回调
   */
  setHealthChangeCallback(callback: HealthChangeCallback): void {
    this.onHealthChange = callback;
  }

  /**
   * 实现基类的检查逻辑
   */
  protected async doCheck(): Promise<void> {
    await this.checkAllAccounts();
  }

  /**
   * 检查单个账号状态
   * @param accountId 账号ID
   * @returns true=active, false=inactive
   */
  async checkAccount(accountId: string): Promise<boolean> {
    logger.info(`Checking account health: ${accountId}`);

    try {
      // 检查账号是否有 cookies
      if (!accountManager.hasCookies(accountId)) {
        logger.warn(`Account ${accountId} has no cookies`);
        return false;
      }

      // 使用轻量级接口检查账号状态
      // 尝试获取"我的笔记"，如果成功则说明账号活跃
      const notes = await this.redNoteTools.searchNotes('', 1, accountId);

      // 如果能成功调用接口（即使返回0条），也认为账号是活跃的
      logger.info(`Account ${accountId} is active`);
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Account ${accountId} check failed:`, errorMsg);

      // 如果出现认证错误或其他异常，认为账号不活跃
      return false;
    }
  }

  /**
   * 检查所有账号
   */
  private async checkAllAccounts(): Promise<void> {
    const checkTime = new Date().toISOString();
    const accounts = accountManager.listAccounts();
    logger.info(`Checking ${accounts.length} accounts`);

    for (const account of accounts) {
      try {
        const previousStatus = account.isActive;
        const isActive = await this.checkAccount(account.id);

        // 更新账号状态
        accountManager.updateAccount(account.id, {
          lastCheckTime: checkTime,
          lastActiveTime: isActive ? checkTime : account.lastActiveTime,
          isActive,
        });

        logger.info(`Account ${account.id} (${account.name}): ${isActive ? 'active' : 'inactive'}`);

        // 如果状态发生变化，触发回调
        if (previousStatus !== isActive && this.onHealthChange) {
          this.onHealthChange(account.id, isActive);
        }
      } catch (error) {
        logger.error(`Failed to check account ${account.id}:`, error);

        // 检查失败时，标记为不活跃
        const previousStatus = account.isActive;
        accountManager.updateAccount(account.id, {
          lastCheckTime: checkTime,
          isActive: false,
        });

        // 如果状态发生变化，触发回调
        if (previousStatus !== false && this.onHealthChange) {
          this.onHealthChange(account.id, false);
        }
      }
    }

    logger.info('Account health check completed');
  }
}
