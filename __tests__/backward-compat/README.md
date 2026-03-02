# 单账号模式兼容性测试报告

## 测试概述

本测试套件确保多账号功能的引入不会破坏现有的单账号使用方式，保证向后兼容性。

## 测试结果

✅ **所有测试通过**: 42/42 测试用例通过

### 测试覆盖率

| 模块 | 语句覆盖率 | 分支覆盖率 | 函数覆盖率 | 行覆盖率 |
|------|-----------|-----------|-----------|---------|
| auth/accountManager.ts | 49.13% | 9.09% | 43.47% | 50.45% |
| auth/authManager.ts | 61.90% | 48.00% | 30.00% | 62.24% |
| auth/cookieManager.ts | 83.78% | 50.00% | 100.00% | 83.78% |
| browser/browserManager.ts | 33.62% | 28.57% | 26.31% | 34.54% |

## 测试套件详情

### 1. 默认 Cookie 路径测试 (defaultCookie.test.ts)

**测试数量**: 6 个测试

**测试内容**:
- ✅ CookieManager 不传 accountId 时使用默认路径
- ✅ CookieManager 保存 Cookie 到默认路径
- ✅ CookieManager 从默认路径加载 Cookie
- ✅ CookieManager.hasCookies() 检查默认路径
- ✅ AuthManager 不传参数时使用默认路径
- ✅ AuthManager 不传 cookiePath 时自动创建默认目录

**验证点**:
- 默认路径为 `~/.mcp/rednote/cookies.json`
- 不传参数时自动使用默认路径
- 目录不存在时自动创建

### 2. BrowserManager 单例测试 (singletonBrowser.test.ts)

**测试数量**: 6 个测试

**测试内容**:
- ✅ 不传 accountId 时返回默认单例
- ✅ 多次调用 getInstance() 返回同一实例
- ✅ 不传 accountId 和传 undefined 行为一致
- ✅ 传入 accountId 返回不同实例
- ✅ 相同 accountId 返回相同实例
- ✅ 不同 accountId 返回不同实例

**验证点**:
- 单例模式正常工作
- 默认实例与账号实例隔离
- 账号实例之间隔离

### 3. 登录流程默认行为测试 (loginDefault.test.ts)

**测试数量**: 6 个测试

**测试内容**:
- ✅ AuthManager.login() 不传参数使用默认路径
- ✅ AuthManager.login() 不传 options 使用默认配置
- ✅ AuthManager 构造函数不传参数使用默认路径
- ✅ AuthManager 保存的 Cookie 可以被 CookieManager 读取
- ✅ 旧代码模式：直接 new AuthManager() 然后 login()
- ✅ 旧代码模式：传入自定义 cookiePath（已弃用但不报错）

**验证点**:
- 登录流程向后兼容
- Cookie 保存到正确位置
- 旧代码示例仍然有效

### 4. 工具默认行为测试 (toolsDefault.test.ts)

**测试数量**: 6 个测试

**测试内容**:
- ✅ searchNotes 不传 accountId 时使用默认实例
- ✅ getNoteContent 不传 accountId 时使用默认实例
- ✅ 工具方法正确释放页面资源
- ✅ 工具方法出错时仍然释放资源
- ✅ accountManager.getCookiePath() 不传参数返回默认路径
- ✅ accountManager.getCookiePath(undefined) 返回默认路径

**验证点**:
- 所有工具方法支持可选 accountId 参数
- 不传 accountId 时使用默认行为
- 资源管理正确（即使出错也释放）

### 5. 向后兼容性回归测试 (regression.test.ts)

**测试数量**: 18 个测试

**测试场景**:

#### 场景1: 旧用户从未使用过多账号功能
- ✅ 直接使用 CookieManager 不传参数
- ✅ 直接使用 BrowserManager.getInstance()
- ✅ 直接使用 RedNoteTools 不传 accountId

#### 场景2: 旧代码示例仍然有效
- ✅ 示例代码: 基本登录流程
- ✅ 示例代码: Cookie 管理
- ✅ 示例代码: 浏览器管理

#### 场景3: API 签名保持不变
- ✅ CookieManager 构造函数接受可选参数
- ✅ AuthManager 构造函数接受可选参数
- ✅ BrowserManager.getInstance 接受可选参数
- ✅ RedNoteTools 方法接受可选 accountId

#### 场景4: 默认行为未改变
- ✅ 不传 accountId 时使用 ~/.mcp/rednote/cookies.json
- ✅ CookieManager 默认操作默认路径
- ✅ BrowserManager 默认使用单例模式

#### 场景5: 错误处理保持一致
- ✅ 加载不存在的 Cookie 返回空数组
- ✅ hasCookies 正确检测文件不存在
- ✅ clearCookies 不会因文件不存在而报错

#### 场景6: 多账号功能不影响默认行为
- ✅ 创建账号后，默认路径仍然可用
- ✅ 使用账号功能后，不传 accountId 仍使用默认

## 兼容性保证

### 1. API 兼容性

所有现有 API 保持不变，新增的 `accountId` 参数都是可选的：

```typescript
// 旧代码仍然有效
const cookieManager = new CookieManager()
const authManager = new AuthManager()
const browserManager = BrowserManager.getInstance()
const tools = new RedNoteTools()

// 新功能是可选的
const cookieManager = new CookieManager(undefined, 'account_id')
const browserManager = BrowserManager.getInstance('account_id')
await tools.searchNotes('keyword', 10, 'account_id')
```

### 2. 默认路径兼容性

不传 `accountId` 时，所有组件使用默认路径：
- Cookie: `~/.mcp/rednote/cookies.json`
- 浏览器配置: `~/.mcp/rednote/browser-profile`

### 3. 单例模式兼容性

`BrowserManager.getInstance()` 不传参数时返回默认单例，保持原有行为。

### 4. 错误处理兼容性

所有错误处理逻辑保持不变：
- 文件不存在返回空数组
- 操作失败抛出相同类型的异常

## 运行测试

```bash
# 运行所有向后兼容性测试
npm test -- __tests__/backward-compat/

# 运行特定测试文件
npm test -- __tests__/backward-compat/defaultCookie.test.ts
npm test -- __tests__/backward-compat/singletonBrowser.test.ts
npm test -- __tests__/backward-compat/loginDefault.test.ts
npm test -- __tests__/backward-compat/toolsDefault.test.ts
npm test -- __tests__/backward-compat/regression.test.ts

# 生成覆盖率报告
npm test -- __tests__/backward-compat/ --coverage
```

## 结论

✅ **向后兼容性验证通过**

所有 42 个测试用例全部通过，确保：
1. 旧用户无需修改代码即可继续使用
2. 所有现有 API 保持不变
3. 默认行为未改变
4. 新功能完全可选
5. 错误处理保持一致

多账号功能的引入不会影响现有用户的使用体验。
