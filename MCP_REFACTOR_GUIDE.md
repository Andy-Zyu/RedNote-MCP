# RedNote MCP 工具改造文档

## 📋 改造目标

根据用户订阅状态（个人版 / 矩阵版），动态暴露不同的 MCP 工具列表，实现：
1. **无 API Key** → 拒绝所有工具调用
2. **个人版** → 只暴露单账号工具
3. **矩阵版** → 暴露全部工具（单账号 + 多账号管理）

---

## 🔧 后端 API 已完成

### 1. 数据库迁移

已添加 `users.rednote_tier` 字段：
- `'personal'` - 个人版（免费，单账号）
- `'matrix'` - 矩阵版（付费，多账号管理）

迁移文件：`/Volumes/SSD-990-PRO-2TB/PigBun-AI/auth-gateway/migrations/001_add_rednote_tier.sql`

### 2. `/api/mcp/verify` 响应格式

```typescript
{
  "valid": true,
  "tier": "free",  // 用户套餐: free | basic | pro | admin
  "rednote": {
    "mode": "personal",  // personal | matrix
    "maxAccounts": 1     // 个人版=1, 矩阵版=10
  },
  "usage": {
    "today": 42,
    "remaining": 958
  },
  "timestamp": 1709438400000,  // 防重放攻击
  "signature": "abc123..."      // HMAC-SHA256 签名
}
```

**签名验证**：使用 `JWT_SECRET` 环境变量作为密钥，防止客户端篡改响应。

---

## 🛠️ MCP 工具层改造任务

### 任务 1: 更新 `apiKeyGuard.ts` 类型定义

**文件**: `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/types/apiKey.ts`

```typescript
export interface ApiKeyVerifyResponse {
  valid: boolean
  tier: 'free' | 'basic' | 'pro' | 'admin'
  rednote: {
    mode: 'personal' | 'matrix'
    maxAccounts: number
  }
  usage: {
    today: number
    remaining: number
  }
  timestamp: number
  signature: string
}

export interface ApiKeyConfig {
  tier: string
  rednote: {
    mode: 'personal' | 'matrix'
    maxAccounts: number
  }
  usage: {
    today: number
    remaining: number
  }
}
```

### 任务 2: 增强 `ApiKeyGuard` 类

**文件**: `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/guard/apiKeyGuard.ts`

#### 2.1 添加签名验证方法

```typescript
import crypto from 'crypto';

export class ApiKeyGuard {
  // ... 现有代码 ...

  /**
   * 验证响应签名，防止中间人篡改
   */
  private verifySignature(response: ApiKeyVerifyResponse): boolean {
    const { signature, ...data } = response;
    const payload = JSON.stringify(data);
    const expectedSignature = crypto
      .createHmac('sha256', process.env.PIGBUN_SIGNATURE_SECRET || process.env.JWT_SECRET || 'fallback-secret')
      .update(payload)
      .digest('hex');
    
    return signature === expectedSignature;
  }

  /**
   * 检查时间戳，防止重放攻击（5分钟有效期）
   */
  private isTimestampValid(timestamp: number): boolean {
    const now = Date.now();
    const diff = Math.abs(now - timestamp);
    return diff < 5 * 60 * 1000; // 5分钟
  }
}
```

#### 2.2 修改 `verifyAndGetConfig` 方法

```typescript
async verifyAndGetConfig(toolName: string): Promise<ApiKeyConfig> {
  // 1. 检查内存缓存
  if (this.memoryCache && Date.now() - this.memoryCache.timestamp < MEMORY_CACHE_TTL) {
    const { timestamp, ...config } = this.memoryCache;
    return config;
  }

  // 2. 尝试网络请求
  if (this.apiKey) {
    try {
      const res = await fetch(`${AUTH_GATEWAY_URL}${VERIFY_ENDPOINT}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-Original-URI': `/rednote/${toolName}`,
        },
      });

      if (res.ok) {
        const response = await res.json() as ApiKeyVerifyResponse;
        
        // 验证签名
        if (!this.verifySignature(response)) {
          throw new Error('Response signature verification failed');
        }
        
        // 验证时间戳
        if (!this.isTimestampValid(response.timestamp)) {
          throw new Error('Response timestamp expired');
        }

        const config: ApiKeyConfig = {
          tier: response.tier,
          rednote: response.rednote,
          usage: response.usage,
        };

        // 更新内存缓存
        this.memoryCache = {
          ...config,
          timestamp: Date.now(),
        };

        // 异步更新磁盘缓存
        this.saveDiskCache(this.memoryCache).catch(err => {
          console.error('[PigBun AI] Failed to save disk cache:', err);
        });

        return config;
      }
    } catch (err) {
      console.error('[PigBun AI] Verification failed:', err);
    }
  }

  // 3. 检查磁盘缓存
  const diskCache = await this.loadDiskCache();
  if (diskCache && Date.now() - diskCache.timestamp < DISK_CACHE_TTL) {
    this.memoryCache = diskCache;
    const { timestamp, ...config } = diskCache;
    return config;
  }

  // 4. 降级到个人版
  console.warn('[PigBun AI] Using default personal mode');
  return {
    tier: 'free',
    rednote: { mode: 'personal', maxAccounts: 1 },
    usage: { today: 0, remaining: 50 },
  };
}
```

#### 2.3 添加便捷检查方法

```typescript
/**
 * 检查是否有矩阵版权限
 */
async hasMatrixAccess(toolName: string): Promise<boolean> {
  const config = await this.verifyAndGetConfig(toolName);
  return config.rednote.mode === 'matrix';
}

/**
 * 获取用户订阅模式
 */
async getMode(toolName: string): Promise<'personal' | 'matrix'> {
  const config = await this.verifyAndGetConfig(toolName);
  return config.rednote.mode;
}
```

### 任务 3: 修改 `index.ts` - 动态工具列表

**文件**: `/Volumes/SSD-990-PRO-2TB/RedNote-MCP/src/index.ts`

#### 3.1 定义工具分类

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getGuard } from './guard/apiKeyGuard.js';

// 个人版工具列表（所有用户可用）
const PERSONAL_TOOLS = [
  'login',
  'search_notes',
  'get_note_detail',
  'get_note_comments',
  'publish_note',
  'reply_comment',
  'like_note',
  'collect_note',
  // ... 其他单账号工具
];

// 矩阵版额外工具（仅订阅用户可用）
const MATRIX_TOOLS = [
  'list_accounts',
  'create_account',
  'delete_account',
  'get_account_info',
  'switch_account',
  'batch_publish',
  'batch_reply',
  'batch_like',
  // ... 其他多账号管理工具
];

// 所有工具定义（用于过滤）
const ALL_TOOLS = [
  // ... 完整的工具定义数组
];
```

#### 3.2 动态获取可用工具

```typescript
/**
 * 根据用户订阅状态返回可用工具列表
 */
async function getAvailableTools(): Promise<string[]> {
  const guard = getGuard();
  
  // 没有 API Key，不暴露任何工具
  if (!guard.hasKey()) {
    return [];
  }

  try {
    const config = await guard.verifyAndGetConfig('mcp-startup');
    
    if (config.rednote.mode === 'matrix') {
      // 矩阵版：暴露全部工具
      return [...PERSONAL_TOOLS, ...MATRIX_TOOLS];
    }
  } catch (error) {
    console.warn('[RedNote MCP] Failed to verify, falling back to personal mode');
  }

  // 默认个人版：只暴露基础工具
  return PERSONAL_TOOLS;
}
```

#### 3.3 注册 ListTools 处理器

```typescript
const server = new Server({
  name: 'rednote-mcp',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// 动态注册工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const availableTools = await getAvailableTools();
  
  return {
    tools: ALL_TOOLS.filter(tool => availableTools.includes(tool.name)),
  };
});
```

#### 3.4 工具调用时二次验证

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const guard = getGuard();
  
  // 1. 验证 API Key（必须）
  await guard.verify(request.params.name);
  
  // 2. 检查工具权限
  const config = await guard.verifyAndGetConfig(request.params.name);
  
  if (MATRIX_TOOLS.includes(request.params.name) && config.rednote.mode !== 'matrix') {
    throw new Error(
      `[PigBun AI] 此功能需要开通矩阵版\n\n` +
      `当前模式：个人版\n` +
      `申请开通：请前往小红书搜索「PigBun AI」私信申请\n` +
      `或访问：https://pigbunai.com/contact`
    );
  }

  // 3. 执行工具逻辑
  // ... 现有工具执行代码 ...
});
```

### 任务 4: 修改现有工具 - 移除 `accountId` 参数检查

**影响文件**: 所有工具文件（`src/tools/*.ts`）

**原有逻辑**（需要删除）：
```typescript
// ❌ 删除这种检查
if (args.accountId) {
  const hasAccess = await guard.hasMultiAccountAccess('tool-name');
  if (!hasAccess) {
    throw new Error('需要订阅矩阵版');
  }
}
```

**新逻辑**：
- 工具调用时已经在 `CallToolRequestSchema` 处理器中统一验证
- 工具内部只需要正常处理 `accountId` 参数即可
- 如果传了 `accountId` 但工具不在 `MATRIX_TOOLS` 列表，调用会被拦截

---

## 🧪 测试矩阵

### 测试场景 1: 无 API Key
- **ListTools** → 返回空数组 `[]`
- **CallTool** → 抛出错误提示配置 API Key

### 测试场景 2: 个人版用户
- **ListTools** → 只返回 `PERSONAL_TOOLS`
- **CallTool (个人版工具)** → 正常执行
- **CallTool (矩阵版工具)** → 抛出错误提示申请开通

### 测试场景 3: 矩阵版用户
- **ListTools** → 返回 `PERSONAL_TOOLS + MATRIX_TOOLS`
- **CallTool (任何工具)** → 正常执行

### 测试场景 4: 签名篡改
- 抓包修改 `rednote.mode` 为 `matrix`
- **预期结果** → 签名验证失败，降级到个人版

### 测试场景 5: 时间戳过期
- 重放 5 分钟前的响应
- **预期结果** → 时间戳验证失败，重新请求

---

## 📝 环境变量

MCP 工具需要的环境变量：

```bash
# 必需
PIGBUN_API_KEY=pb_live_xxx

# 可选（用于签名验证，默认使用 JWT_SECRET）
PIGBUN_SIGNATURE_SECRET=your-secret-key

# 可选（矩阵版需要）
REDNOTE_MATRIX_URL=http://localhost:19222
```

---

## 🚀 实施优先级

1. **P0（立刻做）**: 任务 1 + 任务 2（类型定义 + Guard 增强）
2. **P1（今天）**: 任务 3（动态工具列表 + 二次验证）
3. **P2（明天）**: 任务 4（清理旧代码）+ 测试

---

## 📞 联系方式

如有疑问，请联系 Masha（主调度器）或查看：
- 官网后端代码：`/Volumes/SSD-990-PRO-2TB/PigBun-AI/auth-gateway/src/routes/verify.ts`
- 前端 Dashboard：`/Volumes/SSD-990-PRO-2TB/PigBun-AI/src/pages/DashboardPage.tsx`
