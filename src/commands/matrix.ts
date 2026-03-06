import { Command } from 'commander'
import { startMatrixServer } from '../matrix'
import logger from '../utils/logger'

export function registerMatrixCommand(program: Command) {
    program
        .command('matrix')
        .description('Start the Matrix multi-account management server')
        .option('-p, --port <port>', 'Port to run the server on', '3001')
        .action(async (options: { port: string }) => {
            try {
                const port = parseInt(options.port, 10)

                logger.info(`Starting Matrix server on port ${port}...`)
                const server = await startMatrixServer(port)

                logger.info(`\n🚀 Matrix server is running!`)
                logger.info(`   API: http://localhost:${port}`)
                logger.info(`   WebSocket: ws://localhost:${port}/ws`)
                logger.info(`\nPress Ctrl+C to stop the server.\n`)

                // Handle graceful shutdown
                process.on('SIGINT', () => {
                    logger.info('\nShutting down Matrix server...')
                    server.close(() => {
                        logger.info('Matrix server stopped.')
                        process.exit(0)
                    })
                })
            } catch (error) {
                logger.error('Failed to start Matrix server:', error)
                logger.error('Failed to start Matrix server:', error)
                process.exit(1)
            }
        })
}
