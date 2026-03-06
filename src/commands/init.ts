import { Command } from 'commander'
import { AuthManager } from '../auth/authManager'
import { LOGIN_TIMEOUT } from '../constants/timeouts'
import logger from '../utils/logger'

export function registerInitCommand(program: Command) {
    program
        .command('init [timeout]')
        .description('Initialize and login to RedNote')
        .argument('[timeout]', 'Login timeout in seconds', (value: string) => parseInt(value, 10), LOGIN_TIMEOUT.DEFAULT)
        .usage('[options] [timeout]')
        .addHelpText('after', `
Examples:
  $ rednote-mcp init           # Login with default ${LOGIN_TIMEOUT.DEFAULT} seconds timeout
  $ rednote-mcp init 30        # Login with 30 seconds timeout
  $ rednote-mcp init --help    # Display help information

Notes:
  This command will launch a browser and open the RedNote login page.
  Please complete the login in the opened browser window.
  After successful login, the cookies will be automatically saved for future operations.
  The [timeout] parameter specifies the maximum waiting time (in seconds) for login, default is ${LOGIN_TIMEOUT.DEFAULT} seconds.
  The command will fail if the login is not completed within the specified timeout period.`)
        .action(async (timeout: number) => {
            logger.info(`Starting initialization process with timeout: ${timeout}s`)

            try {
                const authManager = new AuthManager()
                await authManager.login({ timeout })
                await authManager.cleanup()
                logger.info('Initialization successful')
                logger.info('Login successful! Cookie has been saved.')
                process.exit(0)
            } catch (error) {
                logger.error('Error during initialization:', error)
                logger.error('Error during initialization:', error)
                process.exit(1)
            }
        })
}
