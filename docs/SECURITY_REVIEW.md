# 安全审查报告

**项目:** RedNote-MCP 多账号功能
**审查日期:** 2026-03-02
**审查人员:** security-reviewer agent

## 执行摘要

- **关键问题 (CRITICAL):** 3
- **高危问题 (HIGH):** 5
- **中危问题 (MEDIUM):** 4
- **低危问题 (LOW):** 2
- **总体风险等级:** 🔴 HIGH

## 关键问题 (立即修复)

### 1. Cookie 明文存储

**严重程度:** CRITICAL
**类别:** 敏感数据暴露
**位置:**
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/cookieManager.ts:49`
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:258`

**问题描述:**
Cookie 以明文 JSON 格式存储在文件系统中，包含敏感的会话令牌（如 `web_session`）。任何能访问文件系统的进程或用户都可以读取这些 Cookie。

**影响:**
- 攻击者可以窃取 Cookie 并劫持用户会话
- 本地恶意软件可以轻易获取所有账号的登录凭证
- 多用户系统中其他用户可能访问这些文件

**当前代码:**
```typescript
// cookieManager.ts:49
await fs.promises.writeFile(cookiePath, JSON.stringify(cookies, null, 2));
```

**修复建议:**
```typescript
import crypto from 'crypto';

class CookieEncryption {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor() {
    // 从环境变量或系统密钥链获取加密密钥
    const keyString = process.env.COOKIE_ENCRYPTION_KEY || this.generateKey();
    this.key = Buffer.from(keyString, 'hex');
  }

  private generateKey(): string {
    // 生成并安全存储密钥（使用系统密钥链）
    const key = crypto.randomBytes(32).toString('hex');
    // TODO: 存储到系统密钥链（macOS Keychain, Windows Credential Manager）
    return key;
  }

  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('hex'),
      data: encrypted,
      tag: authTag.toString('hex')
    });
  }

  decrypt(encryptedData: string): string {
    const { iv, data, tag } = JSON.parse(encryptedData);

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

// 在 CookieManager 中使用
async saveCookies(cookies: Cookie[]): Promise<void> {
  const cookiePath = this.getCookiePath();
  const dir = path.dirname(cookiePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); // 仅所有者可访问
  }

  const encryption = new CookieEncryption();
  const encrypted = encryption.encrypt(JSON.stringify(cookies));

  await fs.promises.writeFile(cookiePath, encrypted, { mode: 0o600 }); // 仅所有者可读写
  logger.info(`Saved ${cookies.length} encrypted cookies to ${cookiePath}`);
}
```

**参考:**
- OWASP: https://owasp.org/www-community/vulnerabilities/Insecure_Storage
- CWE-312: Cleartext Storage of Sensitive Information

---

### 2. 文件权限未设置

**严重程度:** CRITICAL
**类别:** 访问控制
**位置:**
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:52-58`
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/cookieManager.ts:46`

**问题描述:**
创建目录和文件时未设置适当的权限，默认权限可能允许其他用户读取敏感数据。

**影响:**
- 多用户系统中其他用户可以读取 Cookie 和账号信息
- 违反最小权限原则

**当前代码:**
```typescript
// accountManager.ts:52
fs.mkdirSync(this.baseDir, { recursive: true });

// cookieManager.ts:46
fs.mkdirSync(dir, { recursive: true });
```

**修复建议:**
```typescript
// 创建目录时设置权限为 700 (仅所有者可访问)
fs.mkdirSync(this.baseDir, { recursive: true, mode: 0o700 });

// 写入文件时设置权限为 600 (仅所有者可读写)
await fs.promises.writeFile(cookiePath, data, { mode: 0o600 });

// 对于已存在的文件，修改权限
await fs.promises.chmod(cookiePath, 0o600);
```

**参考:**
- CWE-732: Incorrect Permission Assignment for Critical Resource

---

### 3. 依赖包存在高危漏洞

**严重程度:** CRITICAL
**类别:** 使用已知漏洞的组件
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/package.json:30`

**问题描述:**
`@modelcontextprotocol/sdk` 版本 1.9.0 存在两个高危漏洞：
1. ReDoS (正则表达式拒绝服务) - GHSA-8r9q-7v3j-jr4g
2. DNS 重绑定攻击 - GHSA-w48q-cv73-mx4w

**影响:**
- ReDoS 可导致服务拒绝
- DNS 重绑定可能导致 SSRF 攻击

**修复建议:**
```bash
npm install @modelcontextprotocol/sdk@^1.25.2
```

更新 package.json:
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.2"
  }
}
```

**参考:**
- https://github.com/advisories/GHSA-8r9q-7v3j-jr4g
- https://github.com/advisories/GHSA-w48q-cv73-mx4w

---

## 高危问题 (生产前修复)

### 4. Matrix Server 缺少身份验证

**严重程度:** HIGH
**类别:** 身份验证缺失
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/server.ts:35-206`

**问题描述:**
Matrix Server 的所有 API 端点都没有身份验证，任何能访问 localhost:3001 的进程都可以：
- 创建/删除账号
- 启动扫码会话
- 获取账号列表

**影响:**
- 本地恶意软件可以操控所有账号
- 浏览器扩展可以访问 API
- 如果服务器绑定到 0.0.0.0，远程攻击者可以完全控制

**修复建议:**
```typescript
import crypto from 'crypto';

// 生成 API 密钥
const API_KEY = process.env.MATRIX_API_KEY || crypto.randomBytes(32).toString('hex');

// 身份验证中间件
function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.substring(7);

  if (token !== API_KEY) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  next();
}

// 应用到所有 API 路由
app.use('/api', authenticate);

// WebSocket 身份验证
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (token !== API_KEY) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  clients.add(ws);
  // ...
});
```

**参考:**
- OWASP A07:2021 - Identification and Authentication Failures

---

### 5. CORS 配置过于宽松

**严重程度:** HIGH
**类别:** 跨域资源共享配置错误
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/server.ts:39`

**问题描述:**
使用 `cors()` 无参数调用，允许所有来源访问 API。

**影响:**
- 任何网站都可以通过用户浏览器调用 API
- CSRF 攻击风险
- 恶意网站可以窃取账号信息

**当前代码:**
```typescript
app.use(cors());
```

**修复建议:**
```typescript
import cors from 'cors';

app.use(cors({
  origin: 'http://localhost:3001', // 仅允许同源
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

**参考:**
- OWASP: https://owasp.org/www-community/attacks/csrf

---

### 6. 路径遍历漏洞风险

**严重程度:** HIGH
**类别:** 路径遍历
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/auth/accountManager.ts:218-220`

**问题描述:**
`getCookiePath` 方法直接使用 `accountId` 构建文件路径，未验证输入。如果 `accountId` 包含 `../`，可能导致路径遍历。

**影响:**
- 攻击者可以读取/写入任意文件
- 可能覆盖系统文件

**当前代码:**
```typescript
getCookiePath(accountId?: string): string {
  if (accountId) {
    return path.join(this.accountsDir, accountId, 'cookies.json');
  }
  return this.defaultCookiePath;
}
```

**修复建议:**
```typescript
private sanitizeAccountId(accountId: string): string {
  // 仅允许字母数字和下划线
  if (!/^[a-zA-Z0-9_-]+$/.test(accountId)) {
    throw new Error('Invalid account ID format');
  }

  // 防止路径遍历
  const normalized = path.normalize(accountId);
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Invalid account ID: path traversal detected');
  }

  return accountId;
}

getCookiePath(accountId?: string): string {
  if (accountId) {
    const safeId = this.sanitizeAccountId(accountId);
    return path.join(this.accountsDir, safeId, 'cookies.json');
  }
  return this.defaultCookiePath;
}
```

**参考:**
- OWASP: https://owasp.org/www-community/attacks/Path_Traversal
- CWE-22: Improper Limitation of a Pathname to a Restricted Directory

---

### 7. 输入验证不足

**严重程度:** HIGH
**类别:** 输入验证
**位置:**
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/server.ts:73-79`
- `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/server.ts:113-119`

**问题描述:**
账号名称验证不足，仅检查是否为字符串，未限制长度和字符集。

**影响:**
- 可能导致 XSS（如果名称在前端未转义）
- 可能导致文件系统问题（特殊字符）
- DoS 攻击（超长名称）

**当前代码:**
```typescript
const { name } = req.body;
if (!name || typeof name !== 'string') {
  res.status(400).json({ error: 'Name is required' });
  return;
}
```

**修复建议:**
```typescript
import { z } from 'zod';

const accountNameSchema = z.string()
  .min(1, 'Name cannot be empty')
  .max(50, 'Name too long')
  .regex(/^[a-zA-Z0-9\u4e00-\u9fa5_\s-]+$/, 'Name contains invalid characters');

app.post('/api/accounts', (req, res) => {
  try {
    const { name } = req.body;
    const validatedName = accountNameSchema.parse(name);
    const account = accountManager.createAccount(validatedName);
    res.status(201).json(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

**参考:**
- OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

---

### 8. 缺少速率限制

**严重程度:** HIGH
**类别:** 拒绝服务
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/server.ts:147-161`

**问题描述:**
扫码 API 没有速率限制，攻击者可以：
- 启动大量浏览器实例导致资源耗尽
- 频繁创建/删除账号

**影响:**
- DoS 攻击
- 资源耗尽（内存、CPU、浏览器实例）

**修复建议:**
```typescript
import rateLimit from 'express-rate-limit';

// 扫码速率限制：每个 IP 每分钟最多 3 次
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { error: 'Too many scan requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 账号操作速率限制：每个 IP 每分钟最多 10 次
const accountLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many requests, please try again later' },
});

app.post('/api/scan/:accountId', scanLimiter, async (req, res) => {
  // ...
});

app.use('/api/accounts', accountLimiter);
```

**参考:**
- OWASP: https://owasp.org/www-community/controls/Blocking_Brute_Force_Attacks

---

## 中危问题 (建议修复)

### 9. XSS 风险 - 二维码 Base64

**严重程度:** MEDIUM
**类别:** 跨站脚本 (XSS)
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/web/app.js:118`

**问题描述:**
二维码 Base64 数据直接设置为 img src，未验证数据格式。

**影响:**
- 如果攻击者能控制 WebSocket 消息，可能注入恶意内容

**当前代码:**
```javascript
<img src={qrcode} alt="二维码" className="mx-auto mb-4 w-64 h-64" />
```

**修复建议:**
```javascript
// 验证 Base64 格式
function isValidBase64Image(data) {
  return /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(data);
}

// 在使用前验证
{qrcode && isValidBase64Image(qrcode) ? (
  <img src={qrcode} alt="二维码" className="mx-auto mb-4 w-64 h-64" />
) : (
  <div className="text-red-500">Invalid QR code data</div>
)}
```

---

### 10. 错误消息泄漏信息

**严重程度:** MEDIUM
**类别:** 信息泄漏
**位置:** 多处

**问题描述:**
错误消息直接返回给客户端，可能泄漏内部路径、堆栈跟踪等敏感信息。

**当前代码:**
```typescript
const message = error instanceof Error ? error.message : 'Unknown error';
res.status(404).json({ error: message });
```

**修复建议:**
```typescript
function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    // 仅返回安全的错误消息
    const safeMessages = [
      'Account not found',
      'Name is required',
      'Invalid account ID'
    ];

    if (safeMessages.includes(error.message)) {
      return error.message;
    }

    // 记录完整错误，但返回通用消息
    logger.error('Error details:', error);
    return 'An error occurred';
  }
  return 'Unknown error';
}

res.status(404).json({ error: sanitizeError(error) });
```

---

### 11. 浏览器实例泄漏风险

**严重程度:** MEDIUM
**类别:** 资源管理
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/scanner.ts:313-326`

**问题描述:**
cleanup 函数使用空 catch 块，可能导致浏览器实例未正确关闭。

**当前代码:**
```typescript
async function cleanup(ctx: ScanContext): Promise<void> {
  try {
    if (ctx.page && !ctx.page.isClosed()) await ctx.page.close();
  } catch { }
  try {
    if (ctx.context) await ctx.context.close();
  } catch { }
  try {
    if (ctx.browser) await ctx.browser.close();
  } catch { }
}
```

**修复建议:**
```typescript
async function cleanup(ctx: ScanContext): Promise<void> {
  const errors: Error[] = [];

  try {
    if (ctx.page && !ctx.page.isClosed()) {
      await ctx.page.close();
    }
  } catch (err) {
    logger.error('Failed to close page:', err);
    errors.push(err as Error);
  }

  try {
    if (ctx.context) {
      await ctx.context.close();
    }
  } catch (err) {
    logger.error('Failed to close context:', err);
    errors.push(err as Error);
  }

  try {
    if (ctx.browser) {
      await ctx.browser.close();
    }
  } catch (err) {
    logger.error('Failed to close browser:', err);
    errors.push(err as Error);
  }

  ctx.page = null;
  ctx.context = null;
  ctx.browser = null;

  if (errors.length > 0) {
    logger.warn(`Cleanup completed with ${errors.length} errors`);
  }
}
```

---

### 12. 并发扫码未限制

**严重程度:** MEDIUM
**类别:** 资源管理
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/matrix/scanner.ts:23-36`

**问题描述:**
没有限制同时进行的扫码会话数量，可能导致资源耗尽。

**修复建议:**
```typescript
const MAX_CONCURRENT_SCANS = 3;

export async function startScan(accountId: string): Promise<void> {
  // 检查并发数量
  if (activeScans.size >= MAX_CONCURRENT_SCANS) {
    throw new Error(`Maximum concurrent scans (${MAX_CONCURRENT_SCANS}) reached`);
  }

  // 检查账号是否存在
  const account = accountManager.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // 检查是否已有活动扫码
  if (activeScans.has(accountId)) {
    throw new Error(`Scan already in progress for account: ${accountId}`);
  }

  // ...
}
```

---

## 低危问题 (可选修复)

### 13. 日志可能包含敏感信息

**严重程度:** LOW
**类别:** 信息泄漏
**位置:** 多处

**问题描述:**
日志中可能包含 Cookie 数量、账号 ID 等信息。

**修复建议:**
- 审查所有日志语句
- 避免记录敏感数据
- 使用日志级别控制

---

### 14. WebSocket 重连逻辑可能导致资源泄漏

**严重程度:** LOW
**类别:** 资源管理
**位置:** `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/web/app.js:42-44`

**问题描述:**
WebSocket 断开后自动重连，但没有最大重试次数限制。

**修复建议:**
```javascript
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectAttempts = 0;

ws.current.onclose = () => {
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    console.log(`WebSocket 断开，3秒后重连 (${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
    reconnectAttempts++;
    reconnectTimer.current = setTimeout(connect, 3000);
  } else {
    console.error('WebSocket 重连次数已达上限');
  }
};

ws.current.onopen = () => {
  reconnectAttempts = 0; // 重置计数器
  console.log('WebSocket 已连接');
};
```

---

## 安全检查清单

### AccountManager 安全性
- [ ] ❌ Cookie 加密存储
- [ ] ❌ 文件权限设置 (700/600)
- [ ] ❌ 账号 ID 输入验证（防止路径遍历）
- [ ] ⚠️ 账号 ID 生成安全性（可预测性）
- [ ] ✅ 并发访问安全（使用同步文件操作）

### Cookie 存储安全
- [ ] ❌ Cookie 明文存储（需加密）
- [ ] ❌ 文件权限未设置
- [ ] ✅ Cookie 过期处理（依赖浏览器）
- [ ] ❌ 敏感信息泄漏到日志

### Matrix Server API 安全
- [ ] ❌ CORS 配置过于宽松
- [ ] ❌ 缺少身份验证
- [ ] ⚠️ 输入验证不足
- [ ] ✅ 无明显 SQL/命令注入风险（使用文件系统）
- [ ] ❌ 路径遍历风险（accountId 未验证）
- [ ] ❌ 缺少速率限制

### WebSocket 安全
- [ ] ❌ 连接无身份验证
- [ ] ⚠️ 消息验证不足
- [ ] ⚠️ XSS 风险（二维码 base64）
- [ ] ❌ DoS 攻击防护不足

### Web 前端安全
- [ ] ⚠️ XSS 防护（React 默认转义，但 img src 需验证）
- [ ] ❌ CSRF 防护（无 token）
- [ ] ⚠️ 输入验证（客户端验证不足）
- [ ] ✅ 安全的 API 调用（使用 fetch）

### 资源管理
- [ ] ⚠️ 浏览器实例泄漏检查（cleanup 有空 catch）
- [ ] ✅ 页面泄漏检查（使用 PageLease 模式）
- [ ] ✅ 内存泄漏检查（正确清理引用）
- [ ] ❌ 并发扫码未限制

### 错误处理
- [ ] ⚠️ 敏感信息可能泄漏到错误消息
- [ ] ⚠️ 错误日志可能包含敏感信息
- [ ] ✅ 异常处理基本完整

### 依赖安全
- [ ] ❌ @modelcontextprotocol/sdk 存在高危漏洞
- [ ] ⚠️ brace-expansion 存在低危漏洞

---

## 优先级修复建议

### 立即修复 (本周内)
1. **更新依赖包** - 修复 @modelcontextprotocol/sdk 漏洞
2. **Cookie 加密** - 实现 Cookie 加密存储
3. **文件权限** - 设置正确的文件和目录权限

### 生产前修复 (下周内)
4. **API 身份验证** - 为 Matrix Server 添加身份验证
5. **CORS 配置** - 限制 CORS 来源
6. **路径遍历防护** - 验证和清理 accountId 输入
7. **输入验证** - 加强所有用户输入验证
8. **速率限制** - 添加 API 速率限制

### 建议修复 (两周内)
9. **XSS 防护** - 验证二维码 Base64 数据
10. **错误处理** - 清理错误消息，避免信息泄漏
11. **资源管理** - 改进 cleanup 错误处理
12. **并发限制** - 限制同时扫码会话数量

---

## 安全工具建议

### 静态分析
```bash
# 安装安全 linting
npm install --save-dev eslint-plugin-security

# 添加到 .eslintrc.js
{
  "plugins": ["security"],
  "extends": ["plugin:security/recommended"]
}
```

### 依赖审计
```bash
# 定期运行
npm audit

# 自动修复
npm audit fix

# CI/CD 集成
npm install --save-dev audit-ci
```

### 添加到 package.json
```json
{
  "scripts": {
    "security:audit": "npm audit",
    "security:lint": "eslint . --plugin security",
    "security:check": "npm run security:audit && npm run security:lint",
    "precommit": "npm run security:check"
  }
}
```

---

## 总结

多账号功能的实现基本完整，但存在多个关键安全问题需要立即修复：

1. **Cookie 明文存储**是最严重的问题，必须立即实现加密
2. **缺少身份验证**使 Matrix Server 完全暴露
3. **依赖包漏洞**需要立即更新

建议在合并到主分支前至少修复所有 CRITICAL 和 HIGH 级别的问题。

---

**审查完成时间:** 2026-03-02
**下次审查建议:** 修复完成后进行复审
