import { Command } from 'commander'
import logger, { LOGS_DIR, packLogs } from '../utils/logger'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export function registerLogsCommands(program: Command) {
    program
        .command('pack-logs')
        .description('Pack all log files into a zip file')
        .action(async () => {
            try {
                const zipPath = await packLogs()
                logger.info(`日志已打包到: ${zipPath}`)
                process.exit(0)
            } catch (error) {
                logger.error('打包日志失败:', error)
                process.exit(1)
            }
        })

    program
        .command('open-logs')
        .description('Open the logs directory in file explorer')
        .action(async () => {
            try {
                let command
                switch (process.platform) {
                    case 'darwin': // macOS
                        command = `open "${LOGS_DIR}"`
                        break
                    case 'win32': // Windows
                        command = `explorer "${LOGS_DIR}"`
                        break
                    case 'linux': // Linux
                        command = `xdg-open "${LOGS_DIR}"`
                        break
                    default:
                        throw new Error(`Unsupported platform: ${process.platform}`)
                }

                await execAsync(command)
                logger.info(`日志目录已打开: ${LOGS_DIR}`)
                process.exit(0)
            } catch (error) {
                logger.error('打开日志目录失败:', error)
                process.exit(1)
            }
        })
}
