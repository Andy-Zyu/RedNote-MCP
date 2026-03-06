import { z, ZodRawShape } from 'zod'
import logger from './logger'

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
            accountId: z.string().describe('账号 ID（多账号模式必填）')
        }
    }
    return baseSchema
}

/**
 * Wrap tool handler with logging and error handling
 */
export function wrapToolHandler(toolName: string, handler: (args: any) => Promise<any>) {
    return async (args: any) => {
        const startTime = Date.now()
        logger.info(`Tool called: ${toolName}`, {
            args: JSON.stringify(args),
            timestamp: new Date().toISOString()
        })

        try {
            const result = await handler(args)
            const duration = Date.now() - startTime
            logger.info(`Tool completed: ${toolName}`, {
                durationMs: duration,
                success: true
            })
            return result
        } catch (error) {
            const duration = Date.now() - startTime
            logger.error(`Tool failed: ${toolName}`, {
                durationMs: duration,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                args: JSON.stringify(args)
            })
            throw error
        }
    }
}
