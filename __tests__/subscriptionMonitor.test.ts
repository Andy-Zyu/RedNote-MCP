/**
 * SubscriptionMonitor 单元测试
 */

import { SubscriptionMonitor } from '../src/monitor/subscriptionMonitor'
import { getGuard } from '../src/guard/apiKeyGuard'

// Mock dependencies
jest.mock('../src/guard/apiKeyGuard')
jest.mock('../src/utils/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
  return {
    __esModule: true,
    default: mockLogger
  }
})

describe('SubscriptionMonitor', () => {
  let monitor: SubscriptionMonitor
  let mockGuard: any

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    monitor = new SubscriptionMonitor()

    mockGuard = {
      verifyAndGetConfig: jest.fn()
    }
    ;(getGuard as jest.Mock).mockReturnValue(mockGuard)
  })

  afterEach(() => {
    monitor.stop()
    jest.useRealTimers()
  })

  describe('start', () => {
    it('应该启动监测并立即执行一次检查', async () => {
      mockGuard.verifyAndGetConfig.mockResolvedValue({
        tier: 'pro',
        rednote: { mode: 'matrix', maxAccounts: 5 },
        usage: { today: 10, remaining: 90 }
      })

      monitor.start()

      // 等待立即执行的检查完成
      await Promise.resolve()

      expect(mockGuard.verifyAndGetConfig).toHaveBeenCalledWith('subscription-check', true)
    })

    it('应该定期执行检查', async () => {
      mockGuard.verifyAndGetConfig.mockResolvedValue({
        tier: 'pro',
        rednote: { mode: 'matrix', maxAccounts: 5 },
        usage: { today: 10, remaining: 90 }
      })

      monitor.start()
      await Promise.resolve()

      // 快进 5 分钟
      jest.advanceTimersByTime(5 * 60 * 1000)
      await Promise.resolve()

      expect(mockGuard.verifyAndGetConfig).toHaveBeenCalledTimes(2)
    })
  })

  describe('stop', () => {
    it('应该停止监测', async () => {
      mockGuard.verifyAndGetConfig.mockResolvedValue({
        tier: 'pro',
        rednote: { mode: 'matrix', maxAccounts: 5 },
        usage: { today: 10, remaining: 90 }
      })

      monitor.start()
      await Promise.resolve()

      monitor.stop()

      // 快进 5 分钟
      jest.advanceTimersByTime(5 * 60 * 1000)
      await Promise.resolve()

      // 应该只调用了一次（启动时的立即检查）
      expect(mockGuard.verifyAndGetConfig).toHaveBeenCalledTimes(1)
    })
  })

  describe('checkSubscription', () => {
    it('应该检测到模式变化并触发回调', async () => {
      const callback = jest.fn()
      monitor.setModeChangeCallback(callback)

      // 第一次检查：personal 模式（初始状态）
      mockGuard.verifyAndGetConfig.mockResolvedValueOnce({
        tier: 'free',
        rednote: { mode: 'personal', maxAccounts: 1 },
        usage: { today: 10, remaining: 40 }
      })

      await monitor.checkSubscription()

      expect(callback).not.toHaveBeenCalled()

      // 第二次检查：升级到 matrix 模式
      mockGuard.verifyAndGetConfig.mockResolvedValueOnce({
        tier: 'pro',
        rednote: { mode: 'matrix', maxAccounts: 5 },
        usage: { today: 10, remaining: 90 }
      })

      await monitor.checkSubscription()

      expect(callback).toHaveBeenCalledWith('personal', 'matrix')
    })

    it('应该在模式未变化时不触发回调', async () => {
      const callback = jest.fn()
      monitor.setModeChangeCallback(callback)

      mockGuard.verifyAndGetConfig.mockResolvedValue({
        tier: 'free',
        rednote: { mode: 'personal', maxAccounts: 1 },
        usage: { today: 10, remaining: 40 }
      })

      await monitor.checkSubscription()
      await monitor.checkSubscription()

      expect(callback).not.toHaveBeenCalled()
    })
  })

  describe('getCurrentMode', () => {
    it('应该返回当前模式', async () => {
      mockGuard.verifyAndGetConfig.mockResolvedValue({
        tier: 'pro',
        rednote: { mode: 'matrix', maxAccounts: 5 },
        usage: { today: 10, remaining: 90 }
      })

      expect(monitor.getCurrentMode()).toBe('personal')

      await monitor.checkSubscription()

      expect(monitor.getCurrentMode()).toBe('matrix')
    })
  })
})
