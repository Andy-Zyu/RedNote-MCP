/**
 * 动态工具注册单元测试
 *
 * 测试 withAccountId() 辅助函数的行为
 */

import { z } from 'zod'
import { withAccountId } from '../../src/cliExports'

describe('withAccountId() 单元测试', () => {
  describe('单账号模式', () => {
    test('不应添加 accountId 参数', () => {
      const baseSchema = {
        title: z.string().describe('标题'),
        content: z.string().describe('内容')
      }

      const result = withAccountId(baseSchema, false)

      expect(Object.keys(result)).toEqual(['title', 'content'])
      expect(result).not.toHaveProperty('accountId')
    })

    test('应保留原始 schema 的所有字段', () => {
      const baseSchema = {
        url: z.string().describe('URL'),
        limit: z.number().optional().describe('限制')
      }

      const result = withAccountId(baseSchema, false)

      expect(result.url).toBe(baseSchema.url)
      expect(result.limit).toBe(baseSchema.limit)
    })

    test('空 schema 应返回空对象', () => {
      const baseSchema = {}
      const result = withAccountId(baseSchema, false)

      expect(Object.keys(result)).toEqual([])
    })
  })

  describe('多账号模式', () => {
    test('应添加 accountId 参数', () => {
      const baseSchema = {
        title: z.string().describe('标题'),
        content: z.string().describe('内容')
      }

      const result = withAccountId(baseSchema, true)

      expect(Object.keys(result)).toEqual(['title', 'content', 'accountId'])
      expect(result.accountId).toBeDefined()
    })

    test('accountId 应为必填参数', () => {
      const baseSchema = {
        title: z.string()
      }

      const result = withAccountId(baseSchema, true)
      const accountIdSchema = result.accountId as any

      // 验证不是 optional 包装
      expect(accountIdSchema._def.typeName).not.toBe('ZodOptional')
    })

    test('accountId 应有正确的描述', () => {
      const baseSchema = {
        title: z.string()
      }

      const result = withAccountId(baseSchema, true)
      const accountIdSchema = result.accountId as any

      expect(accountIdSchema.description).toBe('账号 ID（多账号模式必填）')
    })

    test('应保留原始 schema 的所有字段', () => {
      const baseSchema = {
        keywords: z.string().describe('关键词'),
        limit: z.number().optional().describe('限制')
      }

      const result = withAccountId(baseSchema, true)

      expect(result.keywords).toBe(baseSchema.keywords)
      expect(result.limit).toBe(baseSchema.limit)
      expect(Object.keys(result)).toEqual(['keywords', 'limit', 'accountId'])
    })

    test('空 schema 应只包含 accountId', () => {
      const baseSchema = {}
      const result = withAccountId(baseSchema, true)

      expect(Object.keys(result)).toEqual(['accountId'])
    })
  })

  describe('边界情况', () => {
    test('复杂 schema 应正确处理', () => {
      const baseSchema = {
        title: z.string().describe('标题'),
        content: z.string().describe('内容'),
        images: z.array(z.string()).min(1).describe('图片数组'),
        tags: z.array(z.string()).optional().describe('标签'),
        keepAlive: z.boolean().optional().describe('保持连接')
      }

      const singleResult = withAccountId(baseSchema, false)
      const multiResult = withAccountId(baseSchema, true)

      expect(Object.keys(singleResult)).toEqual(['title', 'content', 'images', 'tags', 'keepAlive'])
      expect(Object.keys(multiResult)).toEqual(['title', 'content', 'images', 'tags', 'keepAlive', 'accountId'])
    })

    test('不应修改原始 schema 对象', () => {
      const baseSchema = {
        title: z.string()
      }

      const originalKeys = Object.keys(baseSchema)
      withAccountId(baseSchema, true)

      expect(Object.keys(baseSchema)).toEqual(originalKeys)
      expect(baseSchema).not.toHaveProperty('accountId')
    })

    test('多次调用应返回一致结果', () => {
      const baseSchema = {
        title: z.string()
      }

      const result1 = withAccountId(baseSchema, true)
      const result2 = withAccountId(baseSchema, true)

      expect(Object.keys(result1)).toEqual(Object.keys(result2))
    })
  })

  describe('Zod schema 验证', () => {
    test('单账号模式 schema 应正确验证输入', () => {
      const baseSchema = {
        title: z.string(),
        content: z.string()
      }

      const schema = z.object(withAccountId(baseSchema, false))

      // 有效输入
      expect(() => schema.parse({ title: 'test', content: 'content' })).not.toThrow()

      // 无效输入 - 缺少必填字段
      expect(() => schema.parse({ title: 'test' })).toThrow()

      // accountId 不应被接受
      const result = schema.parse({ title: 'test', content: 'content', accountId: 'acc_123' })
      expect(result).not.toHaveProperty('accountId')
    })

    test('多账号模式 schema 应正确验证输入', () => {
      const baseSchema = {
        title: z.string(),
        content: z.string()
      }

      const schema = z.object(withAccountId(baseSchema, true))

      // 无效输入 - 缺少 accountId
      expect(() => schema.parse({ title: 'test', content: 'content' })).toThrow()

      // 有效输入 - 带 accountId
      const result = schema.parse({ title: 'test', content: 'content', accountId: 'acc_123' })
      expect(result.accountId).toBe('acc_123')

      // 无效输入 - accountId 类型错误
      expect(() => schema.parse({ title: 'test', content: 'content', accountId: 123 })).toThrow()
    })
  })
})
