import { BrowserManager } from '../src/browser/browserManager'

async function main() {
  const bm = BrowserManager.getInstance()
  const lease = await bm.acquirePage()
  const page = lease.page

  // Check cookies loaded
  const cookies = await page.context().cookies()
  console.log(`Total cookies loaded: ${cookies.length}`)

  const xhsCookies = cookies.filter(c => c.domain.includes('xiaohongshu'))
  console.log(`XHS cookies: ${xhsCookies.length}`)

  // Check for key auth cookies
  const keyNames = ['web_session', 'a1', 'webId', 'gid', 'customerClientId', 'access-token']
  for (const name of keyNames) {
    const found = cookies.find(c => c.name === name)
    console.log(`  ${name}: ${found ? `✓ (domain: ${found.domain}, expires: ${new Date(found.expires * 1000).toISOString()})` : '✗ NOT FOUND'}`)
  }

  // Navigate to main page first to check login state
  console.log('\n=== Checking login state on main page ===')
  await page.goto('https://www.xiaohongshu.com', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await new Promise(r => setTimeout(r, 3000))

  const isLoggedIn = await page.evaluate(() => {
    const loginBtn = document.querySelector('.login-btn, [class*="login"]')
    const userAvatar = document.querySelector('.user-avatar, [class*="avatar"]')
    return {
      hasLoginBtn: !!loginBtn,
      hasAvatar: !!userAvatar,
      bodySnippet: document.body?.innerText?.substring(0, 500) || ''
    }
  })
  console.log(`Has login button: ${isLoggedIn.hasLoginBtn}`)
  console.log(`Has avatar: ${isLoggedIn.hasAvatar}`)
  console.log(`Body: ${isLoggedIn.bodySnippet.substring(0, 200)}`)

  await lease.release()
  await bm.shutdown()
}

main().catch(console.error)
