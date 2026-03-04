import { Browser, Page } from 'playwright';
import { Account, accountManager } from '../auth/accountManager';
import { broadcast, WsMessage, activeScans } from './server';
import { BrowserManager } from '../browser/browserManager';
import logger from '../utils/logger';

const SCAN_TIMEOUT_MS = 120_000;
const QR_WAIT_MS = 15_000;

interface ScanContext {
  scanId: string;
  accountId: string;
  browserManager: BrowserManager | null;
  pageLease: any | null; // PageLease type
  page: Page | null;
  aborted: boolean;
  qrImageBase64: string | null;
  loginConfirmed: boolean;
}

/**
 * Start a scan session for an account
 */
export async function startScan(accountId: string): Promise<void> {
  // Check if account exists
  const account = accountManager.getAccount(accountId);
  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // Check if there's already an active scan for this account
  if (activeScans.has(accountId)) {
    throw new Error(`Scan already in progress for account: ${accountId}`);
  }

  const abortController = new AbortController();
  activeScans.set(accountId, abortController);

  const ctx: ScanContext = {
    scanId: accountId,
    accountId,
    browserManager: null,
    pageLease: null,
    page: null,
    aborted: false,
    qrImageBase64: null,
    loginConfirmed: false,
  };

  try {
    broadcast({ type: 'status', scanId: accountId, status: 'scanning' });

    // Use BrowserManager to launch/get browser for this account
    logger.info(`[scanner] Acquiring page from BrowserManager for account: ${accountId}`);
    ctx.browserManager = BrowserManager.getInstance(accountId);
    ctx.pageLease = await ctx.browserManager.acquirePage(accountId, { skipValidation: true });
    ctx.page = ctx.pageLease.page;

    // Navigate to explore page
    logger.info('[scanner] Navigating to xiaohongshu.com/explore ...');
    await ctx.page.goto('https://www.xiaohongshu.com/explore', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    // Check if already logged in
    const isLoggedIn = await checkLoginStatus(ctx.page);
    if (isLoggedIn) {
      logger.info(`[scanner] Already logged in for account: ${accountId}`);
      await saveCookies(ctx);
      broadcast({ type: 'success', scanId: accountId, status: 'already_logged_in', account });
      return;
    }

    // Wait for login dialog
    await waitForLoginDialog(ctx);

    // Wait for QR code and capture it
    await captureAndBroadcastQrCode(ctx);

    // Wait for login completion
    const loggedIn = await waitForLogin(ctx);

    if (ctx.aborted) {
      broadcast({ type: 'status', scanId: accountId, status: 'aborted' });
      return;
    }

    if (!loggedIn) {
      broadcast({ type: 'error', scanId: accountId, error: 'Scan timeout' });
      return;
    }

    // Save cookies
    await saveCookies(ctx);

    // Broadcast success
    const updatedAccount = accountManager.getAccount(accountId);
    broadcast({
      type: 'success',
      scanId: accountId,
      status: 'success',
      account: updatedAccount || account,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[scanner] Scan error for ${accountId}:`, message);
    broadcast({ type: 'error', scanId: accountId, error: message });
  } finally {
    await cleanup(ctx);
    activeScans.delete(accountId);
  }
}

/**
 * Abort a scan session
 */
export function abortScan(accountId: string): void {
  const abortController = activeScans.get(accountId);
  if (abortController) {
    abortController.abort();
    logger.info(`[scanner] Aborted scan for account: ${accountId}`);
  }
}

/**
 * Check if user is logged in
 */
async function checkLoginStatus(page: Page): Promise<boolean> {
  try {
    const userSidebar = await page.$('.user.side-bar-component .channel');
    if (userSidebar) {
      const isLoggedIn = await page.evaluate(() => {
        const sidebarUser = document.querySelector('.user.side-bar-component .channel');
        return sidebarUser?.textContent?.trim() === '我';
      });
      return isLoggedIn;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Wait for login dialog to appear
 */
async function waitForLoginDialog(ctx: ScanContext): Promise<void> {
  if (!ctx.page) return;

  logger.info('[scanner] Waiting for login dialog...');
  try {
    await ctx.page.waitForSelector('.login-container', { timeout: 10_000 });
    logger.info('[scanner] Login dialog appeared');
  } catch {
    // Try clicking login button
    const loginTriggers = ['.login-btn', '[class*="login"]', 'text=登录'];
    for (const selector of loginTriggers) {
      try {
        const el = await ctx.page.$(selector);
        if (el) {
          await el.click();
          await sleep(2000);
          const container = await ctx.page.$('.login-container');
          if (container) {
            logger.info('[scanner] Login dialog appeared after clicking');
            return;
          }
        }
      } catch {
        // Try next selector
      }
    }
    logger.warn('[scanner] Login dialog not found');
  }
}

/**
 * Capture QR code and broadcast it
 */
async function captureAndBroadcastQrCode(ctx: ScanContext): Promise<void> {
  if (!ctx.page) return;

  logger.info('[scanner] Waiting for QR code...');
  try {
    const qrEl = await ctx.page.waitForSelector('.qrcode-img', { timeout: QR_WAIT_MS });
    if (qrEl) {
      await sleep(1000);
      const screenshotBuf = await qrEl.screenshot({ type: 'png' });
      const qrBase64 = screenshotBuf.toString('base64');

      if (qrBase64 && qrBase64.length > 100) {
        ctx.qrImageBase64 = qrBase64;
        broadcast({ type: 'qrcode', scanId: ctx.accountId, data: qrBase64 });
        logger.info(`[scanner] QR code captured (${qrBase64.length} bytes)`);
        return;
      }
    }
  } catch (err) {
    logger.warn('[scanner] QR code not found in DOM');
  }

  // Fallback: try to get from img src
  try {
    const dataUri = await ctx.page.evaluate(() => {
      const img = document.querySelector('.qrcode-img img') as HTMLImageElement | null;
      if (img && img.src && img.src.startsWith('data:image/')) {
        return img.src;
      }
      return null;
    });

    if (dataUri) {
      const base64Match = dataUri.match(/^data:image\/\w+;base64,(.+)$/);
      if (base64Match) {
        ctx.qrImageBase64 = base64Match[1];
        broadcast({ type: 'qrcode', scanId: ctx.accountId, data: base64Match[1] });
        logger.info('[scanner] QR code captured from img src');
        return;
      }
    }
  } catch {
    // Ignore
  }

  logger.warn('[scanner] No QR code captured');
}

/**
 * Wait for login to complete
 */
async function waitForLogin(ctx: ScanContext): Promise<boolean> {
  if (!ctx.page) return false;

  logger.info(`[scanner] Waiting for login (timeout: ${SCAN_TIMEOUT_MS / 1000}s)...`);

  const startTime = Date.now();

  while (!ctx.aborted && Date.now() - startTime < SCAN_TIMEOUT_MS) {
    // Method 1: Check sidebar
    try {
      const isLoggedIn = await checkLoginStatus(ctx.page);
      if (isLoggedIn) {
        logger.info('[scanner] Login detected via sidebar');
        return true;
      }
    } catch {
      // Page might be navigating
    }

    // Method 2: Check cookie via page.context()
    try {
      const context = ctx.page.context();
      const cookies = await context.cookies();
      const webSession = cookies.find(c => c.name === 'web_session');
      if (webSession && webSession.value.length > 80) {
        logger.info('[scanner] Login detected via cookie');
        return true;
      }
    } catch {
      // Context might be closing
    }

    await sleep(1000);
  }

  return false;
}

/**
 * Save cookies to account
 */
async function saveCookies(ctx: ScanContext): Promise<void> {
  if (!ctx.page) return;

  try {
    const context = ctx.page.context();
    const cookies = await context.cookies();
    await accountManager.saveCookies(ctx.accountId, cookies);
    logger.info(`[scanner] Saved ${cookies.length} cookies for account: ${ctx.accountId}`);
  } catch (err) {
    logger.error('[scanner] Failed to save cookies:', err);
  }
}

/**
 * Cleanup browser resources - only release page lease, don't close browser
 */
async function cleanup(ctx: ScanContext): Promise<void> {
  try {
    if (ctx.pageLease && typeof ctx.pageLease.release === 'function') {
      await ctx.pageLease.release();
      logger.info('[scanner] Page lease released');
    } else if (ctx.page && !ctx.page.isClosed()) {
      await ctx.page.close();
    }
  } catch { }
  ctx.page = null;
  ctx.pageLease = null;
  ctx.browserManager = null;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
