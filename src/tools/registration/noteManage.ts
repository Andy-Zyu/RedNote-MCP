import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { NoteManageTools } from '../noteManageTools'
import { getGuard } from '../../guard/apiKeyGuard'
import logger from '../../utils/logger'
import { withAccountId } from '../../utils/toolUtils'

export function registerNoteManageTools(server: McpServer, hasMultipleAccounts: boolean) {
    server.tool(
        'get_my_notes',
        '获取自己的笔记列表（创作者中心）',
        withAccountId({}, hasMultipleAccounts),
        async (args: any) => {
            const { accountId } = args
            await getGuard().verify('get_my_notes')
            logger.info('Getting my notes')
            try {
                const tools = new NoteManageTools()
                const data = await tools.getMyNotes(accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
                }
            } catch (error) {
                logger.error('Error getting my notes:', error)
                throw error
            }
        }
    )

    server.tool(
        'edit_note',
        '编辑已发布的笔记（标题、正文、标签）',
        withAccountId({
            noteId: z.string().describe('笔记 ID 或标题关键词'),
            title: z.string().optional().describe('新标题（最多20字）'),
            content: z.string().optional().describe('新正文内容'),
            tags: z.array(z.string()).optional().describe('新标签数组')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteId, title, content, tags, accountId } = args
            await getGuard().verify('edit_note')
            logger.info(`Editing note: ${noteId}`)
            try {
                const tools = new NoteManageTools()
                const result = await tools.editNote({ noteId, title, content, tags, accountId })
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error editing note:', error)
                throw error
            }
        }
    )

    server.tool(
        'delete_note',
        '删除已发布的笔记',
        withAccountId({
            noteId: z.string().describe('笔记 ID 或标题关键词')
        }, hasMultipleAccounts),
        async (args: any) => {
            const { noteId, accountId } = args
            await getGuard().verify('delete_note')
            logger.info(`Deleting note: ${noteId}`)
            try {
                const tools = new NoteManageTools()
                const result = await tools.deleteNote(noteId, accountId)
                return {
                    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
                }
            } catch (error) {
                logger.error('Error deleting note:', error)
                throw error
            }
        }
    )
}
