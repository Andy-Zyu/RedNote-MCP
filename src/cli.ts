import { startServer } from './server'
import logger from './utils/logger'
import { setupCLI } from './commands'

const name = 'rednote'
const description =
  'A friendly tool to help you access and interact with Xiaohongshu (RedNote) content through Model Context Protocol.\n\n' +
  'DISCLAIMER: This tool is provided for learning and testing purposes only. ' +
  'Users assume all risks associated with its use. ' +
  'The authors are not responsible for any consequences arising from the use of this tool.\n\n' +
  'Requires a PigBun AI API Key. Get yours at https://pigbunai.com'
const version = '0.5.0'

// 检查是否在 stdio 模式下运行
if (process.argv.includes('--stdio')) {
  startServer().catch((error) => {
    logger.error('Fatal error in startServer():', error)
    process.exit(1)
  })
} else {
  const { Command } = require('commander')
  const program = new Command()

  program.name(name).description(description).version(version)

  setupCLI(program)

  program.parse(process.argv)
}
