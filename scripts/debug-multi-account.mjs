/**
 * Debug script to simulate MCP tool calling pattern
 * Multiple BrowserManager instances in the SAME process
 */

import path from 'path'
import os from 'os'
import fs from 'fs'
import { BrowserManager } from '../src/browser/browserManager.js'

const PROFILE_BASE = path.join(os.homedir(), '.mcp', 'rednote', 'profiles')

// Create test cookie files
function createTestCookies(accountId, cookieValue) {
  const cookiePath = path.join(PROFILE_BASE, accountId, 'cookies.json')
  const dir = path.dirname(cookiePath)
  fs.mkdirSync(dir, { recursive: true })

  const cookies = [
    { name: 'web_session', value: cookieValue, domain: '.xiaohongshu.com', path: '/' },
    { name: 'test_account', value: accountId, domain: '.xiaohongshu.com', path: '/' }
  ]
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2))
  console.log(`Created test cookies for ${accountId}`)
}

async function testMultiAccountInSameProcess() {
  console.log('=== Multi-Account Same Process Test ===\n')

  // Create test accounts
  const acc1 = 'acc_test_a1'
  const acc2 = 'acc_test_a2'
  const acc3 = 'acc_test_a3'

  createTestCookies(acc1, 'session_account_1')
  createTestCookies(acc2, 'session_account_2')
  createTestCookies(acc3, 'session_account_3')

  console.log('\n--- Getting BrowserManager instances ---')
  const bm1 = BrowserManager.getInstance(acc1)
  const bm2 = BrowserManager.getInstance(acc2)
  const bm3 = BrowserManager.getInstance(acc3)

  console.log(`bm1.accountId: ${bm1.accountId}`)
  console.log(`bm2.accountId: ${bm2.accountId}`)
  console.log(`bm3.accountId: ${bm3.accountId}`)
  console.log(`bm1 === bm2: ${bm1 === bm2}`)
  console.log(`bm2 === bm3: ${bm2 === bm3}`)

  console.log('\n--- Acquiring pages (this will launch/connect browsers) ---')

  try {
    const lease1 = await bm1.acquirePage()
    console.log('Lease 1 acquired')

    const lease2 = await bm2.acquirePage()
    console.log('Lease 2 acquired')

    const lease3 = await bm3.acquirePage()
    console.log('Lease 3 acquired')

    // Check context references
    const ctx1 = bm1.context
    const ctx2 = bm2.context
    const ctx3 = bm3.context

    console.log('\n=== Context Identity Check ===')
    console.log(`ctx1 === ctx2: ${ctx1 === ctx2}`)
    console.log(`ctx2 === ctx3: ${ctx2 === ctx3}`)
    console.log(`ctx1 === ctx3: ${ctx1 === ctx3}`)

    // Check cookies in each context
    console.log('\n=== Cookie Check ===')
    const cookies1 = await ctx1.cookies()
    const cookies2 = await ctx2.cookies()
    const cookies3 = await ctx3.cookies()

    console.log(`Context 1 test_account: ${cookies1.find(c => c.name === 'test_account')?.value}`)
    console.log(`Context 2 test_account: ${cookies2.find(c => c.name === 'test_account')?.value}`)
    console.log(`Context 3 test_account: ${cookies3.find(c => c.name === 'test_account')?.value}`)

    await lease1.release()
    await lease2.release()
    await lease3.release()

    console.log('\n=== CONCLUSION ===')
    if (ctx1 === ctx2 && ctx2 === ctx3) {
      console.log('All contexts are THE SAME - this is the bug!')
    } else {
      console.log('Contexts are separate - but may still share underlying browser context')
    }
  } catch (error) {
    console.error('Error:', error)
  }

  // Cleanup
  await BrowserManager.getInstance(acc1).shutdown()
  await BrowserManager.getInstance(acc2).shutdown()
  await BrowserManager.getInstance(acc3).shutdown()
}

testMultiAccountInSameProcess().catch(console.error)
