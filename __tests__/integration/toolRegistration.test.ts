/**
 * 工具注册集成测试
 *
 * 测试完整的工具注册流程，包括：
 * 1. 单账号模式下工具注册
 * 2. 多账号模式下工具注册
 * 3. list_accounts 工具的条件注册
 * 4. 工具调用时 accountId 参数的传递
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { withAccountId } from '../../src/cliExports'

/**
 * 模拟工具注册函数（简化版，用于测试）
 */
function registerTestTools(server: McpServer, hasMultipleAccounts: boolean) {
  // 注册 search_notes 工具
  server.tool(
    'search_notes',
    '根据关键词搜索笔记',
    withAccountId({
      keywords: z.string().describe('搜索关键词'),
      limit: z.number().optional().describe('返回结果数量限制')
    }, hasMultipleAccounts),
    async (args: any) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Searched: ${args.keywords}, accountId: ${args.accountId || 'default'}`
          }
        ]
      }
    }
  )

  // 注册 publish_note 工具
  server.tool(
    'publish_note',
    '发布小红书笔记',
    withAccountId({
      title: z.string().describe('笔记标题'),
      content: z.string().describe('笔记正文'),
      images: z.array(z.string()).min(1).describe('图片路径数组')
    }, hasMultipleAccounts),
    async (args: any) => {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Published: ${args.title}, accountId: ${args.accountId || 'default'}`
          }
        ]
      }
    }
  )

  // list_accounts 工具 - 仅在多账号模式下注册
  if (hasMultipleAccounts) {
    server.tool(
      'list_accounts',
      '列出所有已登录的账号',
      {},
      async () => {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Account 1, Account 2'
            }
          ]
        }
      }
    )
  }
}

describe('工具注册集成测试', () => {
  describe('单账号模式', () => {
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

      registerTestTools(server, false)
    })

    test('应注册所有工具（不包含 list_accounts）', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      expect(result.tools).toHaveLength(2)
      expect(result.tools.map((t: any) => t.name)).toEqual(['search_notes', 'publish_note'])
    })

    test('search_notes 工具不应包含 accountId 参数', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const searchTool = result.tools.find((t: any) => t.name === 'search_notes')
      expect(searchTool).toBeDefined()

      const properties = searchTool.inputSchema.properties
      expect(properties).toHaveProperty('keywords')
      expect(properties).toHaveProperty('limit')
      expect(properties).not.toHaveProperty('accountId')
    })

    test('publish_note 工具不应包含 accountId 参数', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const publishTool = result.tools.find((t: any) => t.name === 'publish_note')
      expect(publishTool).toBeDefined()

      const properties = publishTool.inputSchema.properties
      expect(properties).toHaveProperty('title')
      expect(properties).toHaveProperty('content')
      expect(properties).toHaveProperty('images')
      expect(properties).not.toHaveProperty('accountId')
    })

    test('工具调用应正常工作（不传 accountId）', async () => {
      const callToolHandler = (server.server as any)._requestHandlers.get('tools/call')
      const result = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'search_notes',
            arguments: {
              keywords: 'test',
              limit: 10
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result.content[0].text).toContain('Searched: test')
      expect(result.content[0].text).toContain('accountId: default')
    })
  })

  describe('多账号模式', () => {
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

      registerTestTools(server, true)
    })

    test('应注册所有工具（包含 list_accounts）', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      expect(result.tools).toHaveLength(3)
      expect(result.tools.map((t: any) => t.name)).toEqual([
        'search_notes',
        'publish_note',
        'list_accounts'
      ])
    })

    test('search_notes 工具应包含 accountId 参数', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const searchTool = result.tools.find((t: any) => t.name === 'search_notes')
      expect(searchTool).toBeDefined()

      const properties = searchTool.inputSchema.properties
      expect(properties).toHaveProperty('keywords')
      expect(properties).toHaveProperty('limit')
      expect(properties).toHaveProperty('accountId')

      // accountId 应为可选参数
      const required = searchTool.inputSchema.required || []
      expect(required).not.toContain('accountId')
    })

    test('publish_note 工具应包含 accountId 参数', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const publishTool = result.tools.find((t: any) => t.name === 'publish_note')
      expect(publishTool).toBeDefined()

      const properties = publishTool.inputSchema.properties
      expect(properties).toHaveProperty('title')
      expect(properties).toHaveProperty('content')
      expect(properties).toHaveProperty('images')
      expect(properties).toHaveProperty('accountId')

      // accountId 应为可选参数
      const required = publishTool.inputSchema.required || []
      expect(required).not.toContain('accountId')
    })

    test('list_accounts 工具应被注册', async () => {
      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const listAccountsTool = result.tools.find((t: any) => t.name === 'list_accounts')
      expect(listAccountsTool).toBeDefined()
      expect(listAccountsTool.description).toBe('列出所有已登录的账号')
    })

    test('工具调用应正常工作（不传 accountId）', async () => {
      const callToolHandler = (server.server as any)._requestHandlers.get('tools/call')
      const result = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'search_notes',
            arguments: {
              keywords: 'test',
              limit: 10
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result.content[0].text).toContain('Searched: test')
      expect(result.content[0].text).toContain('accountId: default')
    })

    test('工具调用应正常工作（传入 accountId）', async () => {
      const callToolHandler = (server.server as any)._requestHandlers.get('tools/call')
      const result = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'search_notes',
            arguments: {
              keywords: 'test',
              limit: 10,
              accountId: 'acc_123'
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result.content[0].text).toContain('Searched: test')
      expect(result.content[0].text).toContain('accountId: acc_123')
    })

    test('list_accounts 工具调用应正常工作', async () => {
      const callToolHandler = (server.server as any)._requestHandlers.get('tools/call')
      const result = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'list_accounts',
            arguments: {}
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result.content[0].text).toContain('Account 1')
      expect(result.content[0].text).toContain('Account 2')
    })
  })

  describe('账号切换场景', () => {
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

      registerTestTools(server, true)
    })

    test('应能使用不同 accountId 调用同一工具', async () => {
      const callToolHandler = (server.server as any)._requestHandlers.get('tools/call')

      // 第一次调用 - 账号 1
      const result1 = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'publish_note',
            arguments: {
              title: 'Test 1',
              content: 'Content 1',
              images: ['/path/to/image1.jpg'],
              accountId: 'acc_001'
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result1.content[0].text).toContain('Published: Test 1')
      expect(result1.content[0].text).toContain('accountId: acc_001')

      // 第二次调用 - 账号 2
      const result2 = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'publish_note',
            arguments: {
              title: 'Test 2',
              content: 'Content 2',
              images: ['/path/to/image2.jpg'],
              accountId: 'acc_002'
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result2.content[0].text).toContain('Published: Test 2')
      expect(result2.content[0].text).toContain('accountId: acc_002')
    })

    test('应能在有 accountId 和无 accountId 之间切换', async () => {
      const callToolHandler = (server.server as any)._requestHandlers.get('tools/call')

      // 使用默认账号
      const result1 = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'search_notes',
            arguments: {
              keywords: 'test1'
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result1.content[0].text).toContain('accountId: default')

      // 使用指定账号
      const result2 = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'search_notes',
            arguments: {
              keywords: 'test2',
              accountId: 'acc_123'
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result2.content[0].text).toContain('accountId: acc_123')

      // 再次使用默认账号
      const result3 = await callToolHandler(
        {
          method: 'tools/call',
          params: {
            name: 'search_notes',
            arguments: {
              keywords: 'test3'
            }
          }
        },
        { signal: new AbortController().signal }
      )

      expect(result3.content[0].text).toContain('accountId: default')
    })
  })

  describe('边界情况', () => {
    test('空 schema 工具在单账号模式下应正常工作', async () => {
      const server = new McpServer(
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

      server.tool(
        'get_my_notes',
        '获取自己的笔记列表',
        withAccountId({}, false),
        async () => {
          return {
            content: [{ type: 'text' as const, text: 'My notes' }]
          }
        }
      )

      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const tool = result.tools.find((t: any) => t.name === 'get_my_notes')
      expect(tool).toBeDefined()
      expect(Object.keys(tool.inputSchema.properties || {})).toEqual([])
    })

    test('空 schema 工具在多账号模式下应包含 accountId', async () => {
      const server = new McpServer(
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

      server.tool(
        'get_my_notes',
        '获取自己的笔记列表',
        withAccountId({}, true),
        async (args: any) => {
          return {
            content: [
              {
                type: 'text' as const,
                text: `My notes for ${args.accountId || 'default'}`
              }
            ]
          }
        }
      )

      const listToolsHandler = (server.server as any)._requestHandlers.get('tools/list')
      const result = await listToolsHandler(
        { method: 'tools/list', params: {} },
        { signal: new AbortController().signal }
      )

      const tool = result.tools.find((t: any) => t.name === 'get_my_notes')
      expect(tool).toBeDefined()
      expect(tool.inputSchema.properties).toHaveProperty('accountId')
    })
  })
})
