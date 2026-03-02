# 代码重构报告

生成时间: 2026-03-03

## 发现的问题

### 1. 硬编码的值需要提取为常量

#### src/guard/apiKeyGuard.ts
- `MEMORY_CACHE_TTL = 2 * 60 * 1000` (2分钟)
- `DISK_CACHE_TTL = 60 * 60 * 1000` (1小时)
- 时间戳验证: `5 * 60 * 1000` (5分钟)

#### src/monitor/accountHealthMonitor.ts
- `CHECK_INTERVAL = 10 * 60 * 1000` (10分钟)

#### src/monitor/subscriptionMonitor.ts
- `CHECK_INTERVAL = 5 * 60 * 1000` (5分钟)

#### src/cli.ts
- 心跳间隔: `60000` (60秒)
- 各种超时值: `30000`, `60000`, `120000`

**建议**: 创建 `src/constants/timeouts.ts` 统一管理所有时间常量。

---

### 2. 重复的错误处理模式

多个文件中存在相似的 try-catch 模式：

```typescript
try {
  // operation
} catch (error) {
  logger.error('Error:', error)
  throw error
}
```

**建议**: 创建统一的错误处理工具函数。

---

### 3. console.log 混用

发现以下文件混用 console.log 和 logger：
- src/matrix/server.ts (2处 console.log)
- src/cli.ts (多处 console.log/console.error)
- src/guard/apiKeyGuard.ts (多处 console.log/console.warn)

**建议**: 统一使用 logger，移除所有 console 语句。

---

### 4. 重复的参数提取逻辑

在 src/matrix/server.ts 中多次出现：
```typescript
const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
```

**建议**: 创建工具函数 `extractParam(param: string | string[]): string`

---

### 5. 文件大小问题

超过 800 行的文件：
- src/cli.ts: 1280 行 ❌

**建议**: 拆分 cli.ts 为多个模块：
- src/cli/index.ts (主入口)
- src/cli/commands.ts (命令定义)
- src/cli/toolRegistry.ts (工具注册)
- src/cli/server.ts (服务器启动)

---

### 6. 重复的账号状态检查逻辑

在多个地方重复检查账号状态：
- accountHealthMonitor.ts
- cli.ts (check_accounts_status tool)

**建议**: 统一账号状态检查逻辑到 accountManager。

---

### 7. 相似的监控器模式

AccountHealthMonitor 和 SubscriptionMonitor 有相似的结构：
- start() / stop()
- checkInterval
- 回调机制

**建议**: 创建基类 `BaseMonitor` 抽象公共逻辑。

---

### 8. 魔法数字

发现多处魔法数字：
- 延迟时间: 1, 2, 3, 5, 8 秒
- 超时时间: 10000, 15000, 30000, 60000 毫秒
- 重试次数和间隔

**建议**: 定义语义化常量。

---

## 优化建议优先级

### P0 (必须修复)
1. ✅ 拆分 cli.ts (1280行 → 多个 < 400行的文件)
2. ✅ 移除所有 console.log，统一使用 logger
3. ✅ 提取硬编码的时间常量

### P1 (高优先级)
4. ✅ 创建 BaseMonitor 基类
5. ✅ 提取重复的参数处理逻辑
6. ✅ 统一错误处理模式

### P2 (中优先级)
7. 优化账号状态检查逻辑
8. 提取魔法数字为常量

---

## 预计改进效果

- 代码行数减少: ~15%
- 可维护性提升: 显著
- 代码重复率降低: ~30%
- 文件数量增加: +5-8 个模块文件
