/**
 * Debug script to verify BrowserManager context isolation
 */

import { chromium } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

const PROFILE_BASE = path.join(os.homedir(), '.mcp', 'rednote', 'profiles')

// Simulate 3 account managers connecting to the same browser
async function testContextIsolation() {
  console.log('=== Browser Context Isolation Test ===\n')

  // Create 3 profile directories
  const profile1 = path.join(PROFILE_BASE, 'acc_test1')
  const profile2 = path.join(PROFILE_BASE, 'acc_test2')
  const profile3 = path.join(PROFILE_BASE, 'acc_test3')

  for (const p of [profile1, profile2, profile3]) {
    fs.mkdirSync(p, { recursive: true })
  }

  // Launch browser with profile 1
  console.log('Launching browser with profile 1...')
  const context1 = await chromium.launchPersistentContext(profile1, {
    headless: true,
    args: ['--remote-debugging-port=0', '--remote-allow-origins=*'],
  })

  const portFile = path.join(profile1, 'DevToolsActivePort')
  let portStr = ''
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 100))
    if (fs.existsSync(portFile)) {
      const content = fs.readFileSync(portFile, 'utf-8').split('\n')
      if (content.length >= 2) {
        portStr = content[0].trim()
        break
      }
    }
  }

  if (!portStr) {
    console.error('Failed to get DevTools port')
    await context1.close()
    return
  }

  const wsEndpoint = `http://127.0.0.1:${portStr}`
  console.log(`Browser running at ${wsEndpoint}`)

  // Connect over CDP (simulating account 1 manager)
  console.log('\n--- Account 1 connecting ---')
  const browser1 = await chromium.connectOverCDP({ endpointURL: wsEndpoint, timeout: 10000 })
  const ctx1 = browser1.contexts()[0]
  console.log(`Account 1 context: ${ctx1}`)
  console.log(`Account 1 contexts count: ${browser1.contexts().length}`)
  console.log(`Account 1 contexts[0] === context1: ${browser1.contexts()[0] === context1}`)

  // Connect over CDP (simulating account 2 manager)
  console.log('\n--- Account 2 connecting ---')
  const browser2 = await chromium.connectOverCDP({ endpointURL: wsEndpoint, timeout: 10000 })
  const ctx2 = browser2.contexts()[0]
  console.log(`Account 2 context: ${ctx2}`)
  console.log(`Account 2 contexts count: ${browser2.contexts().length}`)
  console.log(`Account 2 contexts[0] === context1: ${browser2.contexts()[0] === context1}`)

  // Connect over CDP (simulating account 3 manager)
  console.log('\n--- Account 3 connecting ---')
  const browser3 = await chromium.connectOverCDP({ endpointURL: wsEndpoint, timeout: 10000 })
  const ctx3 = browser3.contexts()[0]
  console.log(`Account 3 context: ${ctx3}`)
  console.log(`Account 3 contexts count: ${browser3.contexts().length}`)
  console.log(`Account 3 contexts[0] === context1: ${browser3.contexts()[0] === context1}`)

  // Check if all contexts are the SAME object
  console.log('\n=== Context Identity Check ===')
  console.log(`ctx1 === ctx2: ${ctx1 === ctx2}`)
  console.log(`ctx2 === ctx3: ${ctx2 === ctx3}`)
  console.log(`ctx1 === ctx3: ${ctx1 === ctx3}`)
  console.log(`All contexts are the SAME: ${ctx1 === ctx2 && ctx2 === ctx3}`)

  // Test cookie injection
  console.log('\n=== Cookie Injection Test ===')
  const cookie1 = [{ name: 'account', value: 'account1', domain: '.xiaohongshu.com', path: '/' }]
  const cookie2 = [{ name: 'account', value: 'account2', domain: '.xiaohongshu.com', path: '/' }]
  const cookie3 = [{ name: 'account', value: 'account3', domain: '.xiaohongshu.com', path: '/' }]

  console.log('Injecting cookie for account 1...')
  await ctx1.addCookies(cookie1)
  let cookies = await ctx1.cookies()
  console.log(`After account 1: ${cookies.find(c => c.name === 'account')?.value}`)

  console.log('Injecting cookie for account 2...')
  await ctx2.addCookies(cookie2)
  cookies = await ctx1.cookies()
  console.log(`After account 2 (reading from ctx1): ${cookies.find(c => c.name === 'account')?.value}`)

  console.log('Injecting cookie for account 3...')
  await ctx3.addCookies(cookie3)
  cookies = await ctx1.cookies()
  console.log(`After account 3 (reading from ctx1): ${cookies.find(c => c.name === 'account')?.value}`)
  cookies = await ctx2.cookies()
  console.log(`After account 3 (reading from ctx2): ${cookies.find(c => c.name === 'account')?.value}`)
  cookies = await ctx3.cookies()
  console.log(`After account 3 (reading from ctx3): ${cookies.find(c => c.name === 'account')?.value}`)

  console.log('\n=== CONCLUSION ===')
  console.log('All BrowserManager instances share the SAME BrowserContext.')
  console.log('When multiple accounts inject cookies, they overwrite each other.')
  console.log('Only the LAST account to inject cookies will have valid session.')

  // Cleanup
  await browser1.close()
  await browser2.close()
  await browser3.close()
  await context1.close()
}

testContextIsolation().catch(console.error)
