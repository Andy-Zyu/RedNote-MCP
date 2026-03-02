import { BrowserManager } from '../../src/browser/browserManager'

describe('BrowserManager 单例测试', () => {
  afterEach(async () => {
    // 清理浏览器实例
    const instance = BrowserManager.getInstance()
    if (instance) {
      await instance.shutdown()
    }
  })

  test('不传 accountId 时返回默认单例', () => {
    const instance1 = BrowserManager.getInstance()
    const instance2 = BrowserManager.getInstance()

    expect(instance1).toBe(instance2)
  })

  test('多次调用 getInstance() 返回同一实例', () => {
    const instances = []
    for (let i = 0; i < 5; i++) {
      instances.push(BrowserManager.getInstance())
    }

    // 所有实例应该相同
    for (let i = 1; i < instances.length; i++) {
      expect(instances[i]).toBe(instances[0])
    }
  })

  test('不传 accountId 和传 undefined 行为一致', () => {
    const instance1 = BrowserManager.getInstance()
    const instance2 = BrowserManager.getInstance(undefined)

    expect(instance1).toBe(instance2)
  })

  test('传入 accountId 返回不同实例', () => {
    const defaultInstance = BrowserManager.getInstance()
    const accountInstance = BrowserManager.getInstance('test_account')

    expect(defaultInstance).not.toBe(accountInstance)
  })

  test('相同 accountId 返回相同实例', () => {
    const instance1 = BrowserManager.getInstance('test_account')
    const instance2 = BrowserManager.getInstance('test_account')

    expect(instance1).toBe(instance2)
  })

  test('不同 accountId 返回不同实例', () => {
    const instance1 = BrowserManager.getInstance('account1')
    const instance2 = BrowserManager.getInstance('account2')

    expect(instance1).not.toBe(instance2)
  })
})
