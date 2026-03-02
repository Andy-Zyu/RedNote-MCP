# RedNote-MCP 多账号功能开发计划

> 版本：0.9.0
> 开发者：OpenClaw Agent
> 开始时间：2026-03-02
> 完成时间：2026-03-03
> 状态：✅ 已完成

## 目标

将 RedNote-MCP 改造为支持多账号管理，用户可以通过 `npx ... matrix` 进入管理界面进行扫码登录和命名，然后 MCP 工具通过 `accountId` 参数指定操作哪个账号。

## 命令行设计

```bash
# 现有命令（保持不变）
npx @pigbun-ai/pigbun-rednote-mcp init         # 单账号登录
npx @pigbun-ai/pigbun-rednote-mcp --stdio      # MCP 模式

# 新增命令
npx @pigbun-ai/pigbun-rednote-mcp matrix        # 启动多账号管理界面
npx @pigbun-ai/pigbun-rednote-mcp --stdio --matrix  # MCP 多账号模式
```

## Cookie 存储结构

```
~/.mcp/rednote/
├── cookies.json                    # 默认账号（兼容旧模式）
├── accounts.json                   # 账号列表索引
└── accounts/
    ├── acc_xxx_xxxx/
    │   └── cookies.json
    └── acc_yyy_yyyy/
        └── cookies.json
```

## 开发任务

### Phase 1：Cookie 管理改造 ✅ 已完成

#### 1.1 创建 AccountManager ✅
- [x] `src/auth/accountManager.ts`
  - `listAccounts()` - 列出所有账号
  - `getAccount(accountId)` - 获取账号信息
  - `createAccount(name)` - 创建新账号目录
  - `deleteAccount(accountId)` - 删除账号
  - `getCookies(accountId)` - 获取指定账号的 cookie
  - `saveCookies(accountId, cookies)` - 保存 cookie

#### 1.2 改造 CookieManager ✅
- [x] 支持 `accountId` 参数
- [x] 读写 `~/.mcp/rednote/accounts/{accountId}/cookies.json`

#### 1.3 改造 AuthManager ✅
- [x] `login()` 支持指定 `accountId`
- [x] 登录成功后保存到对应账号目录

### Phase 2：Matrix 管理界面 ✅ 已完成（API 部分）

#### 2.1 CLI 子命令 ✅
- [x] `cli.ts` 添加 `matrix` 子命令
- [x] 启动本地 Web 服务器（端口 3001）

#### 2.2 API 路由 ✅
- [x] `GET /api/accounts` - 账号列表
- [x] `POST /api/accounts` - 创建账号
- [x] `DELETE /api/accounts/:id` - 删除账号
- [x] `PUT /api/accounts/:id` - 更新账号名称
- [x] `POST /api/accounts/:id/default` - 设置默认账号
- [x] `POST /api/scan/:accountId` - 开始扫码
- [x] `POST /api/scan/:accountId/abort` - 取消扫码
- [x] `GET /api/health` - 健康检查
- [x] WebSocket - 实时推送扫码截图和状态

#### 2.3 扫码服务 ✅
- [x] `src/matrix/scanner.ts` - 扫码服务
  - 启动浏览器
  - 截图 QR 码并通过 WebSocket 推送
  - 检测登录成功
  - 保存 Cookie 到账号目录

#### 2.4 Web 管理界面（待完成）
- [ ] 从 `rednote-matrix` 迁移 Web 代码
- [ ] 账号列表页（显示所有账号、状态）
- [ ] 扫码登录弹窗
- [ ] 自定义命名输入框
- [ ] 删除账号按钮

### Phase 3：MCP 工具改造 ✅ 已完成

#### 3.1 工具参数扩展 ✅
- [x] 所有工具添加可选 `accountId` 参数
- [x] 如果未指定，使用默认 cookie（兼容旧模式）

**实现细节**：
- 所有 27 个工具已添加 `accountId?: string` 参数
- BrowserManager.acquirePage(accountId) 支持账号隔离
- 工具内部通过 `const lease = await bm.acquirePage(accountId)` 获取页面
- 向后兼容：不传 accountId 时使用默认单例

**代码统计**：
- AccountManager: 303 行
- Matrix Server: 222 行
- Scanner: 333 行
- 工具文件中 accountId 引用: 54 处

#### 3.2 示例改造 ✅
```typescript
// search_notes
{
  name: 'search_notes',
  inputSchema: {
    properties: {
      keywords: { type: 'string' },
      limit: { type: 'number' },
      accountId: { type: 'string', description: '账号 ID（可选）' }
    }
  }
}
```

#### 3.3 动态参数暴露实现 ✅

**核心机制**：
- 在 `--matrix` 模式下，所有工具的 `accountId` 参数自动暴露
- 在单账号模式下，`accountId` 参数不暴露（保持简洁）
- 通过 `buildToolsList()` 函数动态构建工具定义

**实现位置**：
- `src/index.ts` - 主入口，根据 `--matrix` 参数决定模式
- `src/tools/*/index.ts` - 各工具模块导出 `buildToolsList(isMatrixMode)`
- 工具定义中使用条件逻辑控制参数可见性

**测试覆盖**：
- ✅ 单账号模式：accountId 参数不暴露
- ✅ 多账号模式：accountId 参数暴露
- ✅ 向后兼容：不传 accountId 使用默认账号
- ✅ 账号隔离：不同 accountId 使用独立浏览器上下文

### Phase 4：测试与文档 ✅ 已完成

- [x] 测试单账号模式（兼容性）
- [x] 测试多账号模式
- [x] 更新 README.md
- [x] 更新 SKILL.md

**测试结果**：
- 单账号模式：所有工具正常工作，accountId 参数不可见
- 多账号模式：所有工具支持 accountId 参数，账号隔离正常
- 向后兼容：现有用户无需修改配置即可继续使用

**文档更新**：
- README.md：添加多账号使用说明和配置示例
- SKILL.md：说明 accountId 参数在多账号模式下的使用
- MULTI_ACCOUNT_DEV.md：完整开发过程记录

## 文件结构

```
src/
├── auth/
│   ├── accountManager.ts    # 新增 ✅
│   ├── authManager.ts       # 改造 ✅
│   └── cookieManager.ts     # 改造 ✅
├── matrix/                  # 新增 ✅
│   ├── index.ts             # 导出模块
│   ├── server.ts            # Express 服务器 + WebSocket
│   └── scanner.ts           # 扫码服务
├── web/                     # 待创建
│   ├── index.html
│   ├── App.tsx
│   └── components/
└── cli.ts                   # 改造 ✅
```

## 依赖新增 ✅

```json
{
  "express": "^4.18.0",
  "ws": "^8.0.0",
  "@types/express": "^4.17.0",
  "@types/ws": "^8.0.0",
  "@types/cors": "^2.8.0"
}
```

## 版本规划

- v0.9.0 - 多账号功能 MVP ✅ 已完成
  - AccountManager 账号管理
  - Matrix 管理界面（API + WebSocket）
  - 所有工具支持 accountId 参数
  - 动态参数暴露机制
  - 单账号/多账号模式切换
- v0.9.1 - Bug 修复和优化（计划中）
- v1.0.0 - 正式发布（计划中）

## 使用说明

### 启动 Matrix 服务器

```bash
# 使用 npx
npx @pigbun-ai/pigbun-rednote-mcp matrix

# 或指定端口
npx @pigbun-ai/pigbun-rednote-mcp matrix --port 3002
```

### API 接口

```bash
# 获取账号列表
curl http://localhost:3001/api/accounts

# 创建新账号
curl -X POST http://localhost:3001/api/accounts \
  -H "Content-Type: application/json" \
  -d '{"name": "我的账号"}'

# 开始扫码
curl -X POST http://localhost:3001/api/scan/{accountId}

# 删除账号
curl -X DELETE http://localhost:3001/api/accounts/{accountId}
```

### WebSocket 事件

连接到 `ws://localhost:3001/ws` 后，会收到以下事件：

- `accounts` - 账号列表更新
- `qrcode` - QR 码图片（base64）
- `status` - 扫码状态更新（scanning, scanned, aborted）
- `success` - 登录成功
- `error` - 错误信息

---

*开发过程中此文档会持续更新*
