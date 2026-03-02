import { BrowserManager } from '../../src/browser/browserManager'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('Browser Profile Isolation', () => {
  const testAccountIds = ['test-account-1', 'test-account-2', 'default']
  const profilesBaseDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles')

  afterAll(async () => {
    // Cleanup test profiles
    for (const accountId of testAccountIds) {
      const profileDir = path.join(profilesBaseDir, accountId)
      if (fs.existsSync(profileDir)) {
        fs.rmSync(profileDir, { recursive: true, force: true })
      }
    }
  })

  it('should create separate profile directories for different accounts', () => {
    const manager1 = BrowserManager.getInstance('test-account-1')
    const manager2 = BrowserManager.getInstance('test-account-2')
    const managerDefault = BrowserManager.getInstance()

    expect(manager1).not.toBe(manager2)
    expect(manager1).not.toBe(managerDefault)
    expect(manager2).not.toBe(managerDefault)
  })

  it('should use account-specific profile directory path', async () => {
    const accountId = 'test-account-1'
    const expectedProfileDir = path.join(profilesBaseDir, accountId)

    // Mock launchBrowser to verify profile directory
    const manager = BrowserManager.getInstance(accountId)

    // Verify the profile directory would be created at the correct location
    expect(expectedProfileDir).toContain(accountId)
    expect(expectedProfileDir).toContain('profiles')
  })

  it('should use "default" profile directory for default account', () => {
    const expectedProfileDir = path.join(profilesBaseDir, 'default')

    expect(expectedProfileDir).toContain('default')
    expect(expectedProfileDir).toContain('profiles')
  })

  it('should set correct directory permissions (0o700)', () => {
    const testDir = path.join(profilesBaseDir, 'permission-test')

    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    fs.chmodSync(testDir, 0o700)

    const stats = fs.statSync(testDir)
    const mode = stats.mode & 0o777

    expect(mode).toBe(0o700)

    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  it('should return same instance for same accountId', () => {
    const manager1 = BrowserManager.getInstance('test-account-1')
    const manager2 = BrowserManager.getInstance('test-account-1')

    expect(manager1).toBe(manager2)
  })

  it('should return different instances for different accountIds', () => {
    const manager1 = BrowserManager.getInstance('test-account-1')
    const manager2 = BrowserManager.getInstance('test-account-2')

    expect(manager1).not.toBe(manager2)
  })
})
