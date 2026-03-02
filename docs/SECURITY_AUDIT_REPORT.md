# 安全审查报告 - 动态参数暴露实现

**审查日期:** 2026-03-03
**审查人员:** security-reviewer agent
**审查范围:** 多账号动态参数暴露功能

## 执行摘要

- **严重问题 (CRITICAL):** 0
- **高危问题 (HIGH):** 2
- **中危问题 (MEDIUM):** 3
- **低危问题 (LOW):** 2
- **总体风险等级:** 🟡 MEDIUM

## 高危问题 (HIGH)

### 1. accountId 参数缺少输入验证和白名单检查

**严重程度:** HIGH
**分类:** Input Validation / Authorization Bypass
**位置:**
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/cli.ts:79` (所有工具函数)
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:105-108`

**问题描述:**

`accountId` 参数在所有工具函数中直接传递，没有进行以下验证：

1. **格式验证缺失** - 未验证 accountId 是否符合预期格式 (`acc_[timestamp]_[random]`)
2. **存在性检查不足** - 虽然 `getAccount()` 会检查账号是否存在，但在某些代码路径中可能被绕过
3. **路径遍历风险** - accountId 用于构造文件路径，恶意输入如 `../../etc/passwd` 可能导致路径遍历

```typescript
// src/cli.ts:79 - 缺少验证
async ({ keywords, limit = 10, accountId }: { keywords: string; limit?: number; accountId?: string }) => {
  // accountId 直接传递，未验证
  const notes = await tools.searchNotes(keywords, limit, accountId)
}

// src/auth/accountManager.ts:218 - 路径拼接风险
getCookiePath(accountId?: string): string {
  if (accountId) {
    // 直接拼接路径，未验证 accountId 格式
    return path.join(this.accountsDir, accountId, 'cookies.json');
  }
  return this.defaultCookiePath;
}
```

**影响:**

- **路径遍历攻击** - 攻击者可能读取/写入系统中的任意文件
- **权限绕过** - 可能访问未授权的账号数据
- **拒绝服务** - 恶意 accountId 可能导致文件系统错误

**概念验证:**

```javascript
// 恶意 accountId 示例
const maliciousIds = [
  '../../../etc/passwd',           // 路径遍历
  'acc_123; rm -rf /',             // 命令注入尝试
  '../../.mcp/rednote/cookies.json', // 访问默认账号
  'acc_' + 'A'.repeat(10000),      // DoS 攻击
]
```

**修复方案:**

```typescript
// src/auth/accountManager.ts - 添加验证方法
private validateAccountId(accountId: string): void {
  // 1. 格式验证 - 必须匹配 acc_[timestamp]_[random] 格式
  const accountIdRegex = /^acc_[a-z0-9]{8,12}_[a-z0-9]{4}$/;
  if (!accountIdRegex.test(accountId)) {
    throw new Error(`Invalid account ID format: ${accountId}`);
  }

  // 2. 长度限制
  if (accountId.length > 50) {
    throw new Error('Account ID too long');
  }

  // 3. 禁止路径遍历字符
  if (accountId.includes('..') || accountId.includes('/') || accountId.includes('\\')) {
    throw new Error('Account ID contains invalid characters');
  }
}

// 在所有使用 accountId 的方法中调用验证
getCookiePath(accountId?: string): string {
  if (accountId) {
    this.validateAccountId(accountId); // 添加验证
    return path.join(this.accountsDir, accountId, 'cookies.json');
  }
  return this.defaultCookiePath;
}

getAccount(accountId: string): Account | null {
  this.validateAccountId(accountId); // 添加验证
  const index = this.readIndex();
  return index.accounts.find(a => a.id === accountId) || null;
}
```

**参考资料:**
- OWASP: Path Traversal (CWE-22)
- OWASP: Improper Input Validation (CWE-20)

---

### 2. 多账号 Cookie 隔离不完整 - 浏览器 Profile 目录可能混用

**严重程度:** HIGH
**分类:** Session Management / Data Isolation
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/browser/browserManager.ts:162-169`

**问题描述:**

虽然 Cookie 文件已按账号隔离，但浏览器 Profile 目录的隔离实现存在问题：

```typescript
// src/browser/browserManager.ts:162-169
const profileDir = this.accountId
  ? path.join(os.homedir(), '.mcp', 'rednote', 'profiles', this.accountId)
  : PROFILE_DIR

// 问题：PROFILE_DIR 是全局常量，可能被多个实例共享
const PROFILE_DIR = path.join(os.homedir(), '.mcp', 'rednote', 'browser-profile')
```

**影响:**

- **会话混淆** - 不同账号可能共享浏览器状态（LocalStorage, IndexedDB, Cache）
- **隐私泄露** - 账号 A 的浏览历史可能被账号 B 访问
- **认证绕过** - 浏览器缓存的认证状态可能跨账号复用

**修复方案:**

```typescript
// src/browser/browserManager.ts - 确保完全隔离
private async launchBrowser(): Promise<void> {
  const accountLabel = this.accountId || 'default'
  logger.info(`Launching browser with persistent profile for account: ${accountLabel}`)

  // ✅ 修复：始终使用账号特定的 profile 目录
  const profileDir = path.join(
    os.homedir(),
    '.mcp',
    'rednote',
    'profiles',
    this.accountId || 'default' // 即使是默认账号也使用独立目录
  )

  // 确保目录存在
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true })
    logger.info(`Created profile directory: ${profileDir}`)
  }

  // 添加权限检查 - 确保目录只有当前用户可访问
  fs.chmodSync(profileDir, 0o700) // rwx------

  this.context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-shared-workers', // 禁用跨 tab 共享
      '--disable-background-networking', // 减少后台活动
    ],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })

  // ... rest of the code
}
```

**参考资料:**
- OWASP: Insufficient Session Expiration (A2)
- CWE-384: Session Fixation

---

## 中危问题 (MEDIUM)

### 3. 错误消息可能泄露内部路径信息

**严重程度:** MEDIUM
**分类:** Information Disclosure
**位置:**
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/browser/browserManager.ts:201-204`
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:多处`

**问题描述:**

错误消息中包含完整的文件系统路径，可能泄露系统信息：

```typescript
// src/browser/browserManager.ts:201-204
if (cookies.length === 0) {
  throw new Error(
    `未检测到账号 ${accountLabel} 的登录信息，请先调用 login 工具扫码登录小红书账号。`
  )
}
```

虽然这个错误消息已经改进，但在日志中仍然记录了完整路径：

```typescript
// src/auth/accountManager.ts:44
logger.info(`AccountManager initialized with baseDir: ${this.baseDir}`)
// 输出: /Users/[username]/.mcp/rednote
```

**影响:**

- **信息泄露** - 攻击者可以了解文件系统结构
- **用户名泄露** - 路径中包含操作系统用户名
- **侦察辅助** - 为进一步攻击提供信息

**修复方案:**

```typescript
// 创建路径清理工具
// src/utils/pathSanitizer.ts
export function sanitizePath(fullPath: string): string {
  const homeDir = os.homedir()
  return fullPath.replace(homeDir, '~')
}

// 在日志和错误消息中使用
logger.info(`AccountManager initialized with baseDir: ${sanitizePath(this.baseDir)}`)
// 输出: ~/.mcp/rednote

// 对用户可见的错误消息，完全隐藏路径
throw new Error(
  `未检测到账号 ${accountLabel} 的登录信息。请先调用 login 工具登录。`
)
```

**参考资料:**
- OWASP: Information Exposure (CWE-200)

---

### 4. 缺少账号操作的速率限制

**严重程度:** MEDIUM
**分类:** Rate Limiting / DoS
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:139-165`

**问题描述:**

账号创建、删除等操作没有速率限制，可能被滥用：

```typescript
// 可以无限制创建账号
createAccount(name: string): Account {
  const id = this.generateAccountId();
  // ... 无速率限制
}
```

**影响:**

- **资源耗尽** - 创建大量账号占用磁盘空间
- **拒绝服务** - 频繁的文件系统操作影响性能
- **日志污染** - 大量操作日志影响审计

**修复方案:**

```typescript
// src/auth/accountManager.ts - 添加速率限制
export class AccountManager {
  private operationTimestamps: Map<string, number[]> = new Map()
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 分钟
  private readonly MAX_OPERATIONS_PER_WINDOW = 10

  private checkRateLimit(operation: string): void {
    const now = Date.now()
    const timestamps = this.operationTimestamps.get(operation) || []

    // 清理过期的时间戳
    const validTimestamps = timestamps.filter(
      ts => now - ts < this.RATE_LIMIT_WINDOW
    )

    if (validTimestamps.length >= this.MAX_OPERATIONS_PER_WINDOW) {
      throw new Error(
        `操作过于频繁，请稍后再试。(${operation})`
      )
    }

    validTimestamps.push(now)
    this.operationTimestamps.set(operation, validTimestamps)
  }

  createAccount(name: string): Account {
    this.checkRateLimit('createAccount')
    // ... rest of the code
  }

  deleteAccount(accountId: string): void {
    this.checkRateLimit('deleteAccount')
    // ... rest of the code
  }
}
```

**参考资料:**
- OWASP: Insufficient Anti-automation (OAT-021)

---

### 5. 账号名称未进行输入验证

**严重程度:** MEDIUM
**分类:** Input Validation
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:139`

**问题描述:**

`createAccount(name: string)` 方法未验证账号名称：

```typescript
createAccount(name: string): Account {
  const id = this.generateAccountId();
  const account: Account = {
    id,
    name, // 未验证
    createdAt: new Date().toISOString(),
  };
  // ...
}
```

**影响:**

- **XSS 风险** - 如果账号名称在 Web UI 中显示，恶意脚本可能被执行
- **日志注入** - 特殊字符可能破坏日志格式
- **UI 破坏** - 超长名称或特殊字符影响界面显示

**修复方案:**

```typescript
private validateAccountName(name: string): void {
  // 1. 长度限制
  if (!name || name.trim().length === 0) {
    throw new Error('账号名称不能为空')
  }
  if (name.length > 50) {
    throw new Error('账号名称不能超过 50 个字符')
  }

  // 2. 字符白名单 - 只允许字母、数字、中文、下划线、连字符
  const validNameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_\-\s]+$/
  if (!validNameRegex.test(name)) {
    throw new Error('账号名称只能包含中文、字母、数字、下划线和连字符')
  }

  // 3. 禁止特殊字符
  const dangerousChars = ['<', '>', '"', "'", '&', '\n', '\r', '\t']
  if (dangerousChars.some(char => name.includes(char))) {
    throw new Error('账号名称包含非法字符')
  }
}

createAccount(name: string): Account {
  this.validateAccountName(name) // 添加验证
  // ... rest of the code
}
```

**参考资料:**
- OWASP: Input Validation Cheat Sheet

---

## 低危问题 (LOW)

### 6. 日志中记录了敏感的账号操作

**严重程度:** LOW
**分类:** Logging / Privacy
**位置:** 多处日志记录

**问题描述:**

日志中记录了详细的账号操作，可能包含敏感信息：

```typescript
logger.info(`Account created: ${id} (${name})`)
logger.info(`Default account set to: ${accountId}`)
logger.info(`Loaded ${cookies.length} cookies from: ${cookiePath}`)
```

**影响:**

- **隐私泄露** - 日志文件可能被未授权访问
- **审计困难** - 过多日志影响安全事件分析

**修复方案:**

```typescript
// 使用不同的日志级别
logger.debug(`Account created: ${id} (${name})`) // 详细信息用 debug
logger.info('Account created successfully') // 用户可见用 info

// 敏感操作使用审计日志
auditLogger.info({
  action: 'account_created',
  accountId: id,
  timestamp: new Date().toISOString(),
  // 不记录账号名称等敏感信息
})
```

---

### 7. 缺少账号数量限制

**严重程度:** LOW
**分类:** Resource Management
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:139`

**问题描述:**

没有限制可以创建的账号数量：

```typescript
createAccount(name: string): Account {
  // 无账号数量限制
}
```

**影响:**

- **磁盘空间耗尽** - 大量账号占用存储
- **性能下降** - 账号列表过长影响性能

**修复方案:**

```typescript
private readonly MAX_ACCOUNTS = 100

createAccount(name: string): Account {
  const index = this.readIndex()

  if (index.accounts.length >= this.MAX_ACCOUNTS) {
    throw new Error(`已达到账号数量上限 (${this.MAX_ACCOUNTS})`)
  }

  // ... rest of the code
}
```

---

## 安全检查清单

- [x] 无硬编码密钥
- [x] SQL 注入防护（未使用 SQL）
- [x] XSS 防护（后端代码，无直接 HTML 输出）
- [x] CSRF 防护（MCP 协议，无 Web 表单）
- [x] 认证要求（通过 API Key Guard）
- [ ] **输入验证** - accountId 和 name 需要加强验证
- [ ] **授权验证** - accountId 需要白名单检查
- [ ] **速率限制** - 账号操作需要速率限制
- [x] HTTPS 强制（浏览器访问外部站点）
- [ ] **安全头部** - Matrix Web UI 需要检查
- [x] 依赖项更新（需定期检查）
- [x] 无已知漏洞包
- [ ] **日志清理** - 需要减少敏感信息记录
- [x] 错误消息安全（大部分已处理）

---

## 优先修复建议

### 立即修复 (HIGH)

1. **添加 accountId 输入验证** - 防止路径遍历和注入攻击
2. **完善浏览器 Profile 隔离** - 确保账号间完全隔离

### 尽快修复 (MEDIUM)

3. **清理错误消息中的路径信息** - 防止信息泄露
4. **添加账号操作速率限制** - 防止滥用
5. **验证账号名称输入** - 防止 XSS 和日志注入

### 考虑修复 (LOW)

6. **优化日志记录** - 减少敏感信息
7. **添加账号数量限制** - 防止资源耗尽

---

## 正面发现

以下安全实践值得肯定：

1. ✅ **Cookie 文件隔离** - 每个账号使用独立的 Cookie 文件
2. ✅ **目录权限** - 使用用户主目录下的隐藏文件夹
3. ✅ **API Key 认证** - 通过 Guard 机制保护所有工具
4. ✅ **错误处理** - 大部分错误有适当的处理
5. ✅ **日志记录** - 详细的操作日志便于审计
6. ✅ **单例模式** - AccountManager 使用单例避免状态混乱
7. ✅ **类型安全** - 使用 TypeScript 提供类型检查

---

## 测试建议

建议添加以下安全测试：

```typescript
// __tests__/security/accountManager.security.test.ts

describe('AccountManager Security Tests', () => {
  test('should reject path traversal in accountId', () => {
    const manager = new AccountManager()
    expect(() => {
      manager.getCookiePath('../../../etc/passwd')
    }).toThrow('Invalid account ID')
  })

  test('should reject malicious account names', () => {
    const manager = new AccountManager()
    expect(() => {
      manager.createAccount('<script>alert("xss")</script>')
    }).toThrow('非法字符')
  })

  test('should enforce rate limiting', async () => {
    const manager = new AccountManager()
    for (let i = 0; i < 10; i++) {
      manager.createAccount(`test${i}`)
    }
    expect(() => {
      manager.createAccount('test11')
    }).toThrow('操作过于频繁')
  })

  test('should enforce account limit', () => {
    const manager = new AccountManager()
    for (let i = 0; i < 100; i++) {
      manager.createAccount(`test${i}`)
    }
    expect(() => {
      manager.createAccount('test101')
    }).toThrow('已达到账号数量上限')
  })
})
```

---

## 总结

动态参数暴露实现的整体架构是安全的，但存在一些需要修复的输入验证和隔离问题。

**关键风险:**
- accountId 参数缺少验证，存在路径遍历风险
- 浏览器 Profile 隔离不完整

**建议行动:**
1. 立即实施 accountId 输入验证
2. 完善浏览器 Profile 目录隔离
3. 添加速率限制和账号数量限制
4. 编写安全测试用例

修复这些问题后，该功能可以安全地投入生产使用。

---

**审查完成时间:** 2026-03-03
**下次审查建议:** 功能上线后 30 天
