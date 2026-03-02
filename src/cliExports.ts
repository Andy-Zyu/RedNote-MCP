/**
 * CLI exports for testing
 *
 * This file re-exports functions from cli.ts without executing the CLI logic
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, ZodRawShape } from 'zod'

/**
 * Helper function to conditionally add accountId parameter
 * @param baseSchema - Base Zod schema object
 * @param hasMultiple - Whether multiple accounts exist
 * @returns Schema with or without accountId parameter
 */
export function withAccountId(baseSchema: ZodRawShape, hasMultiple: boolean): ZodRawShape {
  if (hasMultiple) {
    return {
      ...baseSchema,
      accountId: z.string().optional().describe('账号 ID（可选，不传则使用默认账号）')
    }
  }
  return baseSchema
}

// Note: registerTools is not exported here because it requires full CLI setup
// Tests should use the exported withAccountId function and test it independently
