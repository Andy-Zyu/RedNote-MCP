import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { getGuard } from '../../guard/apiKeyGuard'

export function registerShareTools(server: McpServer) {
    server.tool(
        'get_share_link',
        '获取笔记的分享链接（支持笔记URL或笔记ID）',
        {
            noteId: z.string().describe('笔记 ID 或笔记 URL'),
        },
        async (args: any) => {
            const { noteId } = args
            await getGuard().verify('get_share_link')
            // Extract noteId from URL if a full URL was provided
            const idMatch = noteId.match(/explore\/([a-f0-9]+)/) || noteId.match(/^([a-f0-9]{24})$/)
            const extractedId = idMatch ? idMatch[1] : noteId

            const result = {
                noteId: extractedId,
                webUrl: `https://www.xiaohongshu.com/explore/${extractedId}`,
                appUrl: `xhsdiscover://item/${extractedId}`,
            }
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            }
        }
    )
}
