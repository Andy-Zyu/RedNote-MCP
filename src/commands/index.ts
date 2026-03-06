import { Command } from 'commander'
import { registerInitCommand } from './init'
import { registerLogsCommands } from './logs'
import { registerMatrixCommand } from './matrix'

export function setupCLI(program: Command) {
    registerInitCommand(program)
    registerLogsCommands(program)
    registerMatrixCommand(program)
}
