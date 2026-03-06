import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { accountManager, Account } from '../auth/accountManager';
import { startScan, abortScan } from './scanner';
import logger from '../utils/logger';
import { authMiddleware, checkWebSocketAuth } from './middleware/auth';
import { AccountHealthMonitor } from '../monitor/accountHealthMonitor';
import { SessionHeartbeat } from '../monitor/sessionHeartbeat';
import { extractParam } from '../utils/paramExtractor';

export interface WsMessage {
  type: 'qrcode' | 'status' | 'error' | 'success' | 'accounts' | 'account_health' | 'session_expired' | 'subscription_downgrade';
  scanId?: string;
  data?: string;
  status?: string;
  account?: Account;
  accounts?: Account[];
  error?: string;
  accountId?: string;
  isActive?: boolean;
  oldMode?: string;
  newMode?: string;
  reason?: string;
  timestamp?: string;
}

// WebSocket clients
const clients = new Set<WebSocket>();

// Broadcast function
export function broadcast(msg: WsMessage): void {
  const data = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Active scan sessions
export const activeScans = new Map<string, AbortController>();

// Account health monitor instance
let healthMonitor: AccountHealthMonitor | null = null;

// Session heartbeat instance
let sessionHeartbeat: SessionHeartbeat | null = null;

// Track server instance
let serverInstance: http.Server | null = null;

/**
 * Check if Matrix server is running
 */
export function isMatrixServerRunning(): boolean {
  return serverInstance !== null && serverInstance.listening;
}

export async function startMatrixServer(port: number = 3001): Promise<http.Server> {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve static files
  const path = require('path');
  // __dirname in bundled code points to dist/, web files are in dist/web/
  const webDir = path.join(__dirname, 'web');
  logger.info('Serving static files from:', webDir);
  app.use(express.static(webDir));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Accounts API - Protected by auth middleware
  app.get('/api/accounts', authMiddleware, (_req, res) => {
    logger.info('[Matrix API] GET /api/accounts - authorized');
    const accounts = accountManager.listAccounts();
    const accountsWithStatus = accounts.map(account => ({
      ...account,
      hasCookies: accountManager.hasCookies(account.id),
    }));
    res.json(accountsWithStatus);
  });

  app.get('/api/accounts/:id', authMiddleware, (req, res) => {
    const id = extractParam(req.params.id);
    logger.info(`[Matrix API] GET /api/accounts/${id} - authorized`);
    const account = accountManager.getAccount(id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }
    res.json({
      ...account,
      hasCookies: accountManager.hasCookies(id),
    });
  });

  app.post('/api/accounts', authMiddleware, (req, res) => {
    const { name } = req.body;
    logger.info(`[Matrix API] POST /api/accounts - authorized, name: ${name}`);
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const account = accountManager.createAccount(name);
    res.status(201).json(account);

    // Broadcast updated accounts list
    broadcast({
      type: 'accounts',
      accounts: accountManager.listAccounts(),
    });
  });

  app.delete('/api/accounts/:id', authMiddleware, (req, res) => {
    const id = extractParam(req.params.id);
    logger.info(`[Matrix API] DELETE /api/accounts/${id} - authorized`);
    try {
      // Abort any active scan for this account
      const scan = activeScans.get(id);
      if (scan) {
        scan.abort();
        activeScans.delete(id);
      }

      accountManager.deleteAccount(id);
      res.json({ ok: true });

      // Broadcast updated accounts list
      broadcast({
        type: 'accounts',
        accounts: accountManager.listAccounts(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(404).json({ error: message });
    }
  });

  app.put('/api/accounts/:id', authMiddleware, (req, res) => {
    const id = extractParam(req.params.id);
    const { name } = req.body;
    logger.info(`[Matrix API] PUT /api/accounts/${id} - authorized, new name: ${name}`);
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    try {
      const account = accountManager.updateAccount(id, { name });
      res.json(account);

      // Broadcast updated accounts list
      broadcast({
        type: 'accounts',
        accounts: accountManager.listAccounts(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(404).json({ error: message });
    }
  });

  app.post('/api/accounts/:id/default', authMiddleware, (req, res) => {
    const id = extractParam(req.params.id);
    logger.info(`[Matrix API] POST /api/accounts/${id}/default - authorized`);
    try {
      accountManager.setDefaultAccount(id);
      res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(404).json({ error: message });
    }
  });

  // Relogin API - Clear cookies and trigger scan
  app.post('/api/accounts/:id/relogin', authMiddleware, async (req, res) => {
    const id = extractParam(req.params.id);
    logger.info(`[Matrix API] POST /api/accounts/${id}/relogin - authorized`);
    const account = accountManager.getAccount(id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    try {
      // Clear cookies for this account
      accountManager.clearCookies(id);
      logger.info(`[Matrix API] Cleared cookies for account ${id}`);

      // Start scan in background
      startScan(id).catch(err => {
        logger.error(`[Matrix API] Scan error for ${id}:`, err);
      });

      res.json({ ok: true, scanId: id, status: 'scanning' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[Matrix API] Relogin error:', error);
      res.status(500).json({ error: message });
    }
  });

  // Scan API - Protected by auth middleware
  app.post('/api/scan/:accountId', authMiddleware, async (req, res) => {
    const accountId = extractParam(req.params.accountId);
    logger.info(`[Matrix API] POST /api/scan/${accountId} - authorized`);
    const account = accountManager.getAccount(accountId);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Start scan in background
    startScan(accountId).catch(err => {
      logger.error(`[server] Scan error for ${accountId}:`, err);
    });

    res.json({ scanId: accountId, status: 'scanning' });
  });

  app.post('/api/scan/:accountId/abort', authMiddleware, (req, res) => {
    const accountId = extractParam(req.params.accountId);
    logger.info(`[Matrix API] POST /api/scan/${accountId}/abort - authorized`);
    abortScan(accountId);
    res.json({ ok: true });
  });

  // ========================================
  // CDP Discovery Endpoint (for Playwright connectOverCDP)
  // Playwright first queries /json/version before connecting via WebSocket
  // ========================================
  app.get('/cdp/:accountId/json/version', (req, res) => {
    const accountId = req.params.accountId;
    const host = req.headers.host || `localhost:${port}`;
    res.json({
      'Browser': 'Chrome/145.0.0.0',
      'Protocol-Version': '1.3',
      'webSocketDebuggerUrl': `ws://${host}/cdp/${accountId}`,
    });
  });

  app.get('/cdp/:accountId/json', async (req, res) => {
    const accountId = req.params.accountId;
    try {
      // Proxy the /json endpoint from the local Chromium
      const { BrowserManager } = await import('../browser/browserManager');
      const os = require('os');
      const pathMod = require('path');
      const fs = require('fs');
      const profileDir = pathMod.join(os.homedir(), '.mcp', 'rednote', 'profiles', accountId || 'default');
      const lockFile = pathMod.join(profileDir, 'browser.wsEndpoint');
      if (!fs.existsSync(lockFile)) {
        res.json([]);
        return;
      }
      const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim();
      const endpointUrl = new URL(wsEndpoint.replace('http://', 'ws://'));
      const targetPort = parseInt(endpointUrl.port);
      const upstream = await fetch(`http://127.0.0.1:${targetPort}/json`);
      const data = await upstream.json();
      res.json(data);
    } catch (err) {
      res.json([]);
    }
  });

  // ========================================
  // Browser Ensure API (for remote MCP Server CDP connection)
  // Returns the CDP WebSocket endpoint for a given account's browser.
  // If the browser isn't running yet, launches it first.
  // ========================================
  app.post('/api/browser/ensure', async (req, res) => {
    const { accountId } = req.body;
    const label = accountId || 'default';
    logger.info(`[Browser API] Ensuring browser for account: ${label}`);

    try {
      const { BrowserManager } = await import('../browser/browserManager');
      const bm = BrowserManager.getInstance(accountId);

      // acquirePage forces browser launch if not running, then release immediately
      const lease = await bm.acquirePage(undefined, { skipValidation: true });
      await lease.release();

      // Read the wsEndpoint from the lock file
      const os = require('os');
      const path = require('path');
      const fs = require('fs');
      const profileDir = path.join(os.homedir(), '.mcp', 'rednote', 'profiles', accountId || 'default');
      const lockFile = path.join(profileDir, 'browser.wsEndpoint');

      if (!fs.existsSync(lockFile)) {
        throw new Error('Browser launched but wsEndpoint lock file not found');
      }

      const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim();

      // The wsEndpoint from the lock file is localhost:PORT inside Docker.
      // The remote MCP Server needs to access it via the Docker host.
      // Replace localhost with the container-accessible address.
      const externalEndpoint = wsEndpoint.replace('127.0.0.1', '0.0.0.0').replace('localhost', '0.0.0.0');

      logger.info(`[Browser API] Browser ready for ${label}, endpoint: ${externalEndpoint}`);
      res.json({ wsEndpoint: externalEndpoint, accountId: accountId || 'default' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[Browser API] Failed to ensure browser for ${label}:`, msg);
      res.status(500).json({ error: msg });
    }
  });

  // ========================================
  // Browser Execute API (for remote MCP Server)
  // ========================================
  app.post('/api/browser/execute', async (req, res) => {
    const { accountId, action, params = {}, skipValidation } = req.body;
    const label = accountId || 'default';
    logger.info(`[Browser API] Execute action: ${action} for account: ${label}`);

    const { BrowserManager } = await import('../browser/browserManager');
    const bm = BrowserManager.getInstance(accountId);
    let lease = null;

    try {
      lease = await bm.acquirePage(undefined, { skipValidation });
      const page = lease.page;
      let result: any = {};

      switch (action) {
        case 'navigate_and_evaluate': {
          const { url, evaluateScript, waitUntil, timeout: navTimeout, waitForSelector } = params;
          if (url) {
            await page.goto(url, {
              waitUntil: waitUntil || 'domcontentloaded',
              timeout: navTimeout || 30000,
            });
          }
          if (waitForSelector) {
            await page.waitForSelector(waitForSelector, { timeout: navTimeout || 30000 });
          }
          if (evaluateScript) {
            result.data = await page.evaluate(evaluateScript);
          } else {
            result.data = await page.content();
          }
          result.url = page.url();
          break;
        }

        case 'screenshot': {
          const { url } = params;
          if (url) {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          const buffer = await page.screenshot({ fullPage: true });
          result.screenshot = buffer.toString('base64');
          break;
        }

        case 'refresh_session': {
          await page.goto('https://www.xiaohongshu.com/explore', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await page.waitForTimeout(3000);
          await bm.refreshCookies();
          result.data = { refreshed: true };
          break;
        }

        default: {
          res.status(400).json({ success: false, error: `Unknown action: ${action}` });
          return;
        }
      }

      res.json({ success: true, ...result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[Browser API] Action ${action} failed for ${label}:`, msg);
      res.status(500).json({ success: false, error: msg });
    } finally {
      if (lease) {
        await lease.release();
      }
    }
  });

  // HTTP server
  const server = http.createServer(app);

  // WebSocket server (noServer mode — upgrades handled manually below)
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    // Check authentication for WebSocket connection
    const authError = checkWebSocketAuth();
    if (authError) {
      logger.warn('[Matrix WebSocket] Connection denied - authentication failed');
      ws.send(JSON.stringify({
        type: 'error',
        error: authError.error,
        tier: authError.tier,
        upgradeUrl: authError.upgradeUrl,
      }));
      ws.close(1008, 'Authentication required');
      return;
    }

    clients.add(ws);
    logger.info('[Matrix WebSocket] Client connected and authenticated');

    // Send current accounts list on connect
    ws.send(JSON.stringify({
      type: 'accounts',
      accounts: accountManager.listAccounts().map(account => ({
        ...account,
        hasCookies: accountManager.hasCookies(account.id),
      })),
    }));

    ws.on('close', () => {
      clients.delete(ws);
      logger.info('[Matrix WebSocket] Client disconnected');
    });

    ws.on('error', (error) => {
      clients.delete(ws);
      logger.error('[Matrix WebSocket] Error:', error);
      // Don't throw - just log and clean up
    });
  });

  // ========================================
  // CDP WebSocket Proxy (for remote MCP Server)
  // Listens on /cdp/<accountId>, raw-proxies TCP to local Chromium CDP
  // Uses raw TCP pipe for minimum latency and maximum reliability
  // ========================================
  server.on('upgrade', async (req, socket, head) => {
    const url = req.url || '';

    // Handle existing /ws path via the main WSS
    if (url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
      return;
    }

    // Handle /cdp/<accountId> paths
    const cdpMatch = url.match(/^\/cdp\/(.+)/);
    if (!cdpMatch) {
      socket.destroy();
      return;
    }

    const accountId = cdpMatch[1];
    logger.info(`[CDP Proxy] Incoming CDP connection for account: ${accountId}`);

    try {
      // Read the wsEndpoint lock file to get the local CDP port
      const os = require('os');
      const pathMod = require('path');
      const fs = require('fs');
      const net = require('net');
      const profileDir = pathMod.join(os.homedir(), '.mcp', 'rednote', 'profiles', accountId || 'default');
      const lockFile = pathMod.join(profileDir, 'browser.wsEndpoint');

      if (!fs.existsSync(lockFile)) {
        logger.error(`[CDP Proxy] No wsEndpoint lock file for account: ${accountId}`);
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      const wsEndpoint = fs.readFileSync(lockFile, 'utf-8').trim();
      const endpointUrl = new URL(wsEndpoint.replace('http://', 'ws://'));
      const cdpPort = parseInt(endpointUrl.port);

      // Get the WebSocket debugger URL from Chrome
      const versionRes = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      const versionInfo = await versionRes.json() as { webSocketDebuggerUrl: string };
      const wsPath = new URL(versionInfo.webSocketDebuggerUrl).pathname;

      logger.info(`[CDP Proxy] Proxying to 127.0.0.1:${cdpPort}${wsPath}`);

      // Create raw TCP connection to Chromium's CDP port
      const upstream = net.createConnection({ host: '127.0.0.1', port: cdpPort }, () => {
        // Forward the original HTTP upgrade request to Chromium
        const headers = [
          `GET ${wsPath} HTTP/1.1`,
          `Host: 127.0.0.1:${cdpPort}`,
          'Upgrade: websocket',
          'Connection: Upgrade',
          `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
          `Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}`,
          '',
          '',
        ].join('\r\n');

        upstream.write(headers);
        if (head.length > 0) upstream.write(head);

        // Once Chromium responds, pipe everything through
        let headersSent = false;
        upstream.on('data', (data: Buffer) => {
          if (!headersSent) {
            // Forward the upgrade response back to the client
            socket.write(data);
            headersSent = true;
            // After headers, pipe directly
            upstream.pipe(socket);
            socket.pipe(upstream);
          }
        });
      });

      upstream.on('error', (err: Error) => {
        logger.error(`[CDP Proxy] Upstream error:`, err.message);
        socket.destroy();
      });

      socket.on('error', (err: Error) => {
        logger.error(`[CDP Proxy] Client socket error:`, err.message);
        upstream.destroy();
      });

      socket.on('close', () => {
        upstream.destroy();
      });

      upstream.on('close', () => {
        socket.destroy();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[CDP Proxy] Error setting up proxy for ${accountId}:`, msg);
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
    }
  });

  // Add error handler for WebSocket server
  wss.on('error', (error) => {
    logger.error('[Matrix WebSocket Server] Error:', error);
    // Don't throw - keep server running
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      logger.info(`Matrix server running on http://localhost:${port}`);
      logger.info(`WebSocket on ws://localhost:${port}/ws`);

      // Store server instance
      serverInstance = server;

      // 启动账号健康监测
      healthMonitor = new AccountHealthMonitor();

      // 设置状态变化回调，通过 WebSocket 推送
      healthMonitor.setHealthChangeCallback((accountId, isActive) => {
        logger.info(`Account health changed: ${accountId} -> ${isActive ? 'active' : 'inactive'}`);
        broadcast({
          type: 'account_health',
          accountId,
          isActive,
        });
      });

      healthMonitor.start();
      logger.info('Account health monitor started');

      // 启动 Session 心跳
      sessionHeartbeat = new SessionHeartbeat();
      sessionHeartbeat.setSessionExpiredCallback((accountId, accountName) => {
        logger.warn(`Session expired for account: ${accountName} (${accountId})`);
        broadcast({
          type: 'session_expired',
          accountId,
          data: accountName,
        });
        // 通知所有前端客户端更新界面状态 (显示未登录)
        broadcast({
          type: 'accounts',
          accounts: accountManager.listAccounts().map(account => ({
            ...account,
            hasCookies: accountManager.hasCookies(account.id),
          })),
        });
      });
      sessionHeartbeat.start();
      logger.info('Session heartbeat started');

      resolve(server);
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

export function stopMatrixServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    // 停止 Session 心跳
    if (sessionHeartbeat) {
      sessionHeartbeat.stop();
      sessionHeartbeat = null;
      logger.info('Session heartbeat stopped');
    }

    // 停止账号健康监测
    if (healthMonitor) {
      healthMonitor.stop();
      healthMonitor = null;
      logger.info('Account health monitor stopped');
    }

    // Close all WebSocket connections
    for (const client of clients) {
      client.close();
    }
    clients.clear();

    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        // Clear server instance
        serverInstance = null;
        logger.info('Matrix server stopped');
        resolve();
      }
    });
  });
}

/**
 * 停止账号健康监测（用于降级场景）
 */
export function stopHealthMonitor(): void {
  if (healthMonitor) {
    healthMonitor.stop();
    healthMonitor = null;
    logger.info('Account health monitor stopped due to subscription downgrade');
  }
}
