# E2E 测试文档

## 概述

本目录包含 RedNote-MCP 项目的端到端（E2E）测试，使用 Playwright 测试框架。测试覆盖完整的用户场景，包括单账号模式、多账号管理和 Matrix Web 界面交互。

## 测试场景

### 场景1：新用户首次使用（单账号模式）
**文件**: `scenario1-single-account.test.ts`

测试内容：
- 初始化并保存默认 Cookie
- 不传 accountId 时使用默认 Cookie
- 验证默认数据目录结构

### 场景2：启动 Matrix 添加第二个账号
**文件**: `scenario2-add-account.test.ts`

测试内容：
- 访问 Matrix Web 界面
- 点击添加账号按钮
- 输入账号名称并创建账号
- 显示二维码扫描界面
- WebSocket 实时更新
- 取消扫码操作

### 场景3：使用不同账号发布笔记
**文件**: `scenario3-multi-publish.test.ts`

测试内容：
- 为不同账号创建独立的 Cookie 文件
- 验证浏览器实例隔离
- 在 Web 界面查看多个账号
- 显示账号的登录状态

### 场景4：切换默认账号
**文件**: `scenario4-switch-default.test.ts`

测试内容：
- 设置默认账号
- 在 Web 界面显示默认账号标记
- 通过点击切换默认账号
- 在配置文件中保存默认账号设置

### 场景5：删除账号
**文件**: `scenario5-delete-account.test.ts`

测试内容：
- 删除账号
- 删除账号的 Cookie 文件
- 删除账号目录
- 删除默认账号后自动切换
- 在 Web 界面删除账号
- 删除最后一个账号后显示空状态
- 中止正在进行的扫码操作

### 场景6：Web 界面交互测试
**文件**: `scenario6-web-ui.test.ts`

测试内容：
- 重命名账号
- 处理网络错误
- 处理无效的账号名称
- WebSocket 断线重连
- 健康检查状态
- 并发账号创建
- 显示账号的 Cookie 状态
- 键盘导航
- 响应式显示（移动端视图）
- 显示加载状态

## 运行测试

### 安装依赖

```bash
npm install
npx playwright install
```

### 运行所有 E2E 测试

```bash
npm run test:e2e
```

### 运行特定测试文件

```bash
npx playwright test scenario1-single-account.test.ts
```

### 以可视化模式运行（查看浏览器）

```bash
npm run test:e2e:headed
```

### 调试模式

```bash
npm run test:e2e:debug
```

### 查看测试报告

```bash
npm run test:e2e:report
```

## 测试环境

### 测试数据目录

测试使用独立的数据目录，避免污染真实数据：

- 测试数据根目录: `__tests__/e2e/.test-data/`
- 测试账号目录: `__tests__/e2e/.test-data/accounts/`
- 测试默认 Cookie: `__tests__/e2e/.test-data/rednote_cookies.json`

### 环境变量

测试期间会设置以下环境变量：

```bash
REDNOTE_DATA_DIR=__tests__/e2e/.test-data
REDNOTE_ACCOUNTS_DIR=__tests__/e2e/.test-data/accounts
REDNOTE_COOKIE_PATH=__tests__/e2e/.test-data/rednote_cookies.json
```

### 自动清理

每个测试套件运行前后会自动清理测试数据，确保测试隔离。

## 测试架构

### Fixture 系统

`setup.ts` 提供了测试 fixture：

```typescript
import { test, expect } from './setup';

test('测试名称', async ({ page, server }) => {
  // server: Matrix HTTP 服务器实例
  // page: Playwright 页面对象
});
```

### 辅助函数

- `setupTestEnv()`: 设置测试环境变量
- `cleanTestData()`: 清理测试数据
- `createTestDataDir()`: 创建测试数据目录

## CI/CD 集成

### GitHub Actions

测试可以在 CI 环境中运行：

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## 测试覆盖率

目标覆盖率：80%+

当前覆盖的功能：
- ✅ 单账号模式（向后兼容）
- ✅ 多账号管理（创建、删除、重命名）
- ✅ 默认账号切换
- ✅ Cookie 隔离
- ✅ Web 界面交互
- ✅ WebSocket 实时更新
- ✅ 错误处理
- ✅ 响应式设计

## 故障排查

### 测试失败

1. 检查 Matrix 服务器是否正常启动
2. 查看 `playwright-report/` 目录中的截图和视频
3. 使用 `--debug` 模式逐步调试

### 端口冲突

如果端口 3001 被占用，修改 `setup.ts` 中的端口号：

```typescript
const server = await startMatrixServer(3002); // 使用其他端口
```

### 超时问题

增加超时时间：

```typescript
test.setTimeout(120000); // 120秒
```

## 最佳实践

1. **测试隔离**: 每个测试独立运行，不依赖其他测试
2. **清理数据**: 测试前后清理测试数据
3. **等待异步**: 使用 `waitForResponse` 等待 API 响应
4. **语义选择器**: 优先使用 `text=` 和 `data-testid` 选择器
5. **错误处理**: 测试正常流程和错误情况

## 贡献指南

添加新测试时：

1. 在相应的场景文件中添加测试用例
2. 使用描述性的测试名称
3. 添加必要的注释
4. 确保测试可以独立运行
5. 更新本文档

## 参考资料

- [Playwright 文档](https://playwright.dev/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Best Practices](https://playwright.dev/docs/best-practices)
