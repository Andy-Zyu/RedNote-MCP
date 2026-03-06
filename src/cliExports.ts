/**
 * CLI exports for testing
 *
 * This file re-exports functions from cli.ts (or related modules) without executing the CLI logic
 */

import { z, ZodRawShape } from 'zod'
export { withAccountId } from './utils/toolUtils'

// Note: registerTools is not exported here because it requires full CLI setup
// Tests should use the exported withAccountId function and test it independently
