import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { accountManager, Account } from '../auth/accountManager';
import { startScan, abortScan } from './scanner';
import logger from '../utils/logger';
import { authMiddleware, checkWebSocketAuth } from './middleware/auth';
import { AccountHealthMonitor } from '../monitor/accountHealthMonitor';
import { extractParam } from '../utils/paramExtractor';

export interface WsMessage {
  type: 'qrcode' | 'status' | 'error' | 'success' | 'accounts' | 'account_health' | 'subscription_downgrade';
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

  // HTTP server
  const server = http.createServer(app);

  // WebSocket server
  const wss = new WebSocketServer({ server, path: '/ws' });

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

      resolve(server);
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}

export function stopMatrixServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
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
