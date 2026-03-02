/**
 * MCP 动态 Schema 验证测试
 *
 * 目标：验证 MCP Server 是否支持动态生成工具 schema
 *
 * 测试场景：
 * 1. 工具注册时动态生成 schema
 * 2. 根据账号状态动态调整 schema
 * 3. ListTools 请求返回正确的 schema
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

describe('MCP Dynamic Schema Validation', () => {
  let server: McpServer

  beforeEach(() => {
    server = new McpServer(
      {
        name: 'test-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
  })

  test('Zod schema 支持动态 extend', () => {
    const baseSchema = z.object({
      title: z.string(),
      content: z.string()
    })

    const extendedSchema = baseSchema.extend({
      accountId: z.string().optional()
    })

    expect(Object.keys(baseSchema.shape)).toEqual(['title', 'content'])
    expect(Object.keys(extendedSchema.shape)).toEqual(['title', 'content', 'accountId'])
  })

  test('Zod schema 支持动态 omit', () => {
    const baseSchema = z.object({
      title: z.string(),
      content: z.string(),
      accountId: z.string().optional()
    })

    const omittedSchema = baseSchema.omit({ accountId: true })

    expect(Object.keys(baseSchema.shape)).toEqual(['title', 'content', 'accountId'])
    expect(Object.keys(omittedSchema.shape)).toEqual(['title', 'content'])
  })

  test('运行时动态生成 schema', () => {
    function createSchema(hasMultiAccount: boolean) {
      const baseSchema = z.object({
        title: z.string(),
        content: z.string()
      })

      if (hasMultiAccount) {
        return baseSchema.extend({
          accountId: z.string().optional().describe('账号 ID(可选,不传则使用默认账号)')
        })
      }

      return baseSchema
    }

    const singleAccountSchema = createSchema(false)
    const multiAccountSchema = createSchema(true)

    expect(Object.keys(singleAccountSchema.shape)).toEqual(['title', 'content'])
    expect(Object.keys(multiAccountSchema.shape)).toEqual(['title', 'content', 'accountId'])
  })

  test('MCP Server 工具注册时可以使用动态 schema', () => {
    const hasMultiAccount = true

    function createPublishSchema(hasMultiAccount: boolean) {
      const baseSchema = {
        title: z.string().describe('笔记标题(最多20字)'),
        content: z.string().describe('笔记正文')
      }

      if (hasMultiAccount) {
        return {
          ...baseSchema,
          accountId: z.string().optional().describe('账号 ID(可选,不传则使用默认账号)')
        }
      }

      return baseSchema
    }

    const schema = createPublishSchema(hasMultiAccount)

    // 注册工具
    server.tool(
      'publish_note_text',
      '发布小红书纯文字笔记',
      schema,
      async (args: any) => {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Published: ${args.title}`
            }
          ]
        }
      }
    )

    // 验证工具已注册
    const registeredTools = (server as any)._registeredTools
    expect(registeredTools['publish_note_text']).toBeDefined()
    expect(registeredTools['publish_note_text'].inputSchema).toBeDefined()

    const inputSchema = registeredTools['publish_note_text'].inputSchema
    expect(Object.keys(inputSchema.shape)).toEqual(['title', 'content', 'accountId'])
  })

  test('MCP Server ListTools 返回正确的 JSON Schema', async () => {
    const hasMultiAccount = true

    function createPublishSchema(hasMultiAccount: boolean) {
      const baseSchema = {
        title: z.string().describe('笔记标题'),
        content: z.string().describe('笔记正文')
      }

      if (hasMultiAccount) {
        return {
          ...baseSchema,
          accountId: z.string().optional().describe('账号 ID')
        }
      }

      return baseSchema
    }

    const schema = createPublishSchema(hasMultiAccount)

    server.tool(
      'publish_note_text',
      '发布小红书纯文字笔记',
      schema,
      async (args: any) => {
        return {
          content: [{ type: 'text' as const, text: `Published: ${args.title}` }]
        }
      }
    )

    // 模拟 ListTools 请求
    const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
    expect(listToolsHandler).toBeDefined()

    const result = await listToolsHandler({
      method: 'tools/list',
      params: {}
    }, { signal: new AbortController().signal })

    expect(result.tools).toHaveLength(1)
    expect(result.tools[0].name).toBe('publish_note_text')
    expect(result.tools[0].inputSchema).toBeDefined()

    const inputSchema = result.tools[0].inputSchema as any
    expect(inputSchema.type).toBe('object')
    expect(inputSchema.properties).toHaveProperty('title')
    expect(inputSchema.properties).toHaveProperty('content')
    expect(inputSchema.properties).toHaveProperty('accountId')
    expect(inputSchema.required).toEqual(['title', 'content'])
  })

  test('验证方案 A 的核心假设：工具注册时 schema 可以动态生成', () => {
    // 模拟账号管理器状态
    let hasMultipleAccounts = false

    function getToolSchema() {
      const baseSchema = {
        title: z.string(),
        content: z.string()
      }

      if (hasMultipleAccounts) {
        return {
          ...baseSchema,
          accountId: z.string().optional()
        }
      }

      return baseSchema
    }

    // 场景 1: 单账号模式
    hasMultipleAccounts = false
    const singleAccountSchema = getToolSchema()
    expect(Object.keys(singleAccountSchema)).toEqual(['title', 'content'])

    // 场景 2: 多账号模式
    hasMultipleAccounts = true
    const multiAccountSchema = getToolSchema()
    expect(Object.keys(multiAccountSchema)).toEqual(['title', 'content', 'accountId'])

    // 结论：schema 可以在工具注册时动态生成
    // 但是：工具注册后无法修改 schema
  })

  test('验证关键限制：工具注册后无法修改 schema', () => {
    // 注册工具
    server.tool(
      'test_tool',
      'Test tool',
      {
        param1: z.string()
      },
      async (args: any) => {
        return { content: [{ type: 'text' as const, text: 'ok' }] }
      }
    )

    // 尝试重新注册同名工具会抛出错误
    expect(() => {
      server.tool(
        'test_tool',
        'Test tool updated',
        {
          param1: z.string(),
          param2: z.string().optional()
        },
        async (args: any) => {
          return { content: [{ type: 'text' as const, text: 'ok' }] }
        }
      )
    }).toThrow('Tool test_tool is already registered')
  })
})
