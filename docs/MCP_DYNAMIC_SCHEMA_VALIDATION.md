# MCP 动态 Schema 验证报告

## 验证目标

确认方案 A 的技术可行性：MCP Server 是否支持在工具注册时动态生成 schema。

## 验证方法

1. 阅读 `@modelcontextprotocol/sdk` v1.9.0 源码
2. 分析 `McpServer.tool()` 方法实现
3. 测试 Zod 动态 schema 能力
4. 编写集成测试验证完整流程

## 验证结果

### ✅ 方案 A 技术可行

**核心发现：**

1. **MCP Server 支持动态 schema**
   - `McpServer.tool()` 在注册时接受 `ZodRawShape` 参数
   - 内部使用 `z.object(paramsSchema)` 动态构建 schema
   - `ListTools` 请求时通过 `zodToJsonSchema()` 转换为 JSON Schema

2. **Zod 完全支持动态操作**
   - `schema.extend()` - 添加字段 ✅
   - `schema.omit()` - 移除字段 ✅
   - 运行时条件生成 ✅

3. **关键限制**
   - 工具注册后无法修改 schema（会抛出错误）
   - 必须在 `server.connect()` 之前完成所有工具注册

## 实现细节

### MCP SDK 源码分析

```javascript
// node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js

tool(name, ...rest) {
    if (this._registeredTools[name]) {
        throw new Error(`Tool ${name} is already registered`);
    }

    let description;
    if (typeof rest[0] === "string") {
        description = rest.shift();
    }

    let paramsSchema;
    if (rest.length > 1) {
        paramsSchema = rest.shift();
    }

    const cb = rest[0];

    // 关键：动态构建 Zod schema
    this._registeredTools[name] = {
        description,
        inputSchema: paramsSchema === undefined ? undefined : z.object(paramsSchema),
        callback: cb,
    };

    this.setToolRequestHandlers();
}
```

### ListTools 处理逻辑

```javascript
this.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(this._registeredTools).map(([name, tool]) => {
        return {
            name,
            description: tool.description,
            // 关键：运行时转换为 JSON Schema
            inputSchema: tool.inputSchema
                ? zodToJsonSchema(tool.inputSchema, { strictUnions: true })
                : EMPTY_OBJECT_JSON_SCHEMA,
        };
    }),
}));
```

## 测试验证

### 测试文件

`__tests__/mcp-dynamic-schema-validation.test.ts`

### 测试结果

```
PASS __tests__/mcp-dynamic-schema-validation.test.ts
  MCP Dynamic Schema Validation
    ✓ Zod schema 支持动态 extend
    ✓ Zod schema 支持动态 omit
    ✓ 运行时动态生成 schema
    ✓ MCP Server 工具注册时可以使用动态 schema
    ✓ MCP Server ListTools 返回正确的 JSON Schema
    ✓ 验证方案 A 的核心假设：工具注册时 schema 可以动态生成
    ✓ 验证关键限制：工具注册后无法修改 schema

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

## 方案 A 实现建议

### 1. 工具注册时机

```typescript
// src/cli.ts

async function main() {
  const accountManager = new AccountManager()
  await accountManager.initialize()

  const hasMultipleAccounts = accountManager.hasMultipleAccounts()

  // 在 connect 之前注册所有工具
  const rednoteTools = new RednoteTools(accountManager)
  rednoteTools.registerTools(server, hasMultipleAccounts)

  await server.connect(transport)
}
```

### 2. 动态 Schema 生成

```typescript
// src/tools/rednoteTools.ts

export class RednoteTools {
  registerTools(server: McpServer, hasMultipleAccounts: boolean) {
    // 发布文字笔记
    const publishTextSchema = this.createPublishSchema(hasMultipleAccounts)
    server.tool('publish_note_text', '发布小红书纯文字笔记', publishTextSchema,
      async (args) => { /* ... */ })

    // 发布图文笔记
    const publishImageSchema = this.createPublishImageSchema(hasMultipleAccounts)
    server.tool('publish_note', '发布小红书图文笔记', publishImageSchema,
      async (args) => { /* ... */ })

    // ... 其他工具
  }

  private createPublishSchema(hasMultipleAccounts: boolean) {
    const baseSchema = {
      title: z.string().describe('笔记标题(最多20字)'),
      content: z.string().describe('笔记正文'),
      tags: z.array(z.string()).optional().describe('标签/话题数组')
    }

    if (hasMultipleAccounts) {
      return {
        ...baseSchema,
        accountId: z.string().optional().describe('账号 ID(可选,不传则使用默认账号)')
      }
    }

    return baseSchema
  }
}
```

### 3. 工具实现中处理 accountId

```typescript
async function publishNoteText(args: PublishNoteTextArgs) {
  const accountId = args.accountId || accountManager.getDefaultAccountId()
  const account = accountManager.getAccount(accountId)

  if (!account) {
    throw new Error(`Account ${accountId} not found`)
  }

  // 使用指定账号发布
  await publishWithAccount(account, args)
}
```

## 结论

**方案 A 完全可行**

- ✅ MCP SDK 支持动态 schema
- ✅ Zod 提供完整的动态能力
- ✅ 实现简单，代码清晰
- ✅ 性能无影响（schema 在启动时生成一次）

**建议：采用方案 A**

理由：
1. 技术验证通过
2. 实现简单直接
3. 用户体验最佳（单账号模式下无需传 accountId）
4. 代码维护性好

## 下一步

1. 实现 `AccountManager.hasMultipleAccounts()` 方法
2. 重构工具注册逻辑，支持动态 schema
3. 更新所有工具的 schema 定义
4. 编写集成测试验证完整流程
