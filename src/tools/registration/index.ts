import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import logger from '../../utils/logger'

import { registerRedNoteTools } from './rednote'
import { registerNoteManageTools } from './noteManage'
import { registerCommentTools } from './comment'
import { registerEngagementTools } from './engagement'
import { registerAnalyticsTools } from './analytics'
import { registerNotificationTools } from './notification'
import { registerShareTools } from './share'
import { registerAccountTools } from './account'

/**
 * Register all MCP tools with dynamic schema based on account count
 * @param server - MCP Server instance
 * @param hasMultipleAccounts - Whether multiple accounts exist
 */
export function registerAllTools(server: McpServer, hasMultipleAccounts: boolean) {
    logger.info(`Registering tools in ${hasMultipleAccounts ? 'multi-account' : 'single-account'} mode`)

    registerRedNoteTools(server, hasMultipleAccounts)
    registerNoteManageTools(server, hasMultipleAccounts)
    registerCommentTools(server, hasMultipleAccounts)
    registerEngagementTools(server, hasMultipleAccounts)
    registerAnalyticsTools(server, hasMultipleAccounts)
    registerNotificationTools(server, hasMultipleAccounts)
    registerShareTools(server)
    registerAccountTools(server, hasMultipleAccounts)
}
