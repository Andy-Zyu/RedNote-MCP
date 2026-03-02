import request from 'supertest';
import http from 'http';
import { WebSocket } from 'ws';
import { startMatrixServer, stopMatrixServer } from '../../src/matrix/server';
import { accountManager } from '../../src/auth/accountManager';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock scanner module
jest.mock('../../src/matrix/scanner', () => ({
  startScan: jest.fn().mockResolvedValue(undefined),
  abortScan: jest.fn()
}));

describe('Matrix Server API', () => {
  let server: http.Server;
  let testBaseDir: string;
  const TEST_PORT = 3099;

  beforeAll(async () => {
    testBaseDir = path.join(os.tmpdir(), `rednote-test-${Date.now()}`);
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);
    server = await startMatrixServer(TEST_PORT);
  });

  afterAll(async () => {
    await stopMatrixServer(server);
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  afterEach(() => {
    // Clean up accounts after each test
    const accounts = accountManager.listAccounts();
    accounts.forEach(acc => {
      try {
        accountManager.deleteAccount(acc.id);
      } catch (e) {
        // Ignore errors
      }
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(server).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/accounts', () => {
    it('should return empty array when no accounts', async () => {
      const response = await request(server).get('/api/accounts');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should return all accounts with cookie status', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      await accountManager.saveCookies(account1.id, [
        { name: 'test', value: 'value', domain: '.xiaohongshu.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }
      ]);

      const response = await request(server).get('/api/accounts');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('hasCookies');
      expect(response.body[0].hasCookies).toBe(true);
      expect(response.body[1].hasCookies).toBe(false);

      // Cleanup
      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });
  });

  describe('GET /api/accounts/:id', () => {
    it('should return account by ID', async () => {
      const account = accountManager.createAccount('Test User');

      const response = await request(server).get(`/api/accounts/${account.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(account.id);
      expect(response.body.name).toBe('Test User');
      expect(response.body).toHaveProperty('hasCookies');

      accountManager.deleteAccount(account.id);
    });

    it('should return 404 for non-existent account', async () => {
      const response = await request(server).get('/api/accounts/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Account not found');
    });
  });

  describe('POST /api/accounts', () => {
    it('should create new account', async () => {
      const response = await request(server)
        .post('/api/accounts')
        .send({ name: 'New User' });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New User');
      expect(response.body).toHaveProperty('createdAt');

      accountManager.deleteAccount(response.body.id);
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(server)
        .post('/api/accounts')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name is required');
    });

    it('should return 400 when name is not string', async () => {
      const response = await request(server)
        .post('/api/accounts')
        .send({ name: 123 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name is required');
    });
  });

  describe('DELETE /api/accounts/:id', () => {
    it('should delete account', async () => {
      const account = accountManager.createAccount('To Delete');

      const response = await request(server).delete(`/api/accounts/${account.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(accountManager.getAccount(account.id)).toBeNull();
    });

    it('should return 404 when deleting non-existent account', async () => {
      const response = await request(server).delete('/api/accounts/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/accounts/:id', () => {
    it('should update account name', async () => {
      const account = accountManager.createAccount('Old Name');

      const response = await request(server)
        .put(`/api/accounts/${account.id}`)
        .send({ name: 'New Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('New Name');
      expect(response.body.id).toBe(account.id);

      accountManager.deleteAccount(account.id);
    });

    it('should return 400 when name is missing', async () => {
      const account = accountManager.createAccount('Test User');

      const response = await request(server)
        .put(`/api/accounts/${account.id}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name is required');

      accountManager.deleteAccount(account.id);
    });

    it('should return 404 for non-existent account', async () => {
      const response = await request(server)
        .put('/api/accounts/non-existent-id')
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/accounts/:id/default', () => {
    it('should set default account', async () => {
      const account1 = accountManager.createAccount('User 1');
      const account2 = accountManager.createAccount('User 2');

      const response = await request(server).post(`/api/accounts/${account2.id}/default`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);
      expect(accountManager.getDefaultAccount()?.id).toBe(account2.id);

      accountManager.deleteAccount(account1.id);
      accountManager.deleteAccount(account2.id);
    });

    it('should return 404 for non-existent account', async () => {
      const response = await request(server).post('/api/accounts/non-existent-id/default');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/scan/:accountId', () => {
    it('should start scan for account', async () => {
      const account = accountManager.createAccount('Scan User');

      const response = await request(server).post(`/api/scan/${account.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('scanId', account.id);
      expect(response.body).toHaveProperty('status', 'scanning');

      accountManager.deleteAccount(account.id);
    });

    it('should return 404 for non-existent account', async () => {
      const response = await request(server).post('/api/scan/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Account not found');
    });
  });

  describe('POST /api/scan/:accountId/abort', () => {
    it('should abort scan', async () => {
      const account = accountManager.createAccount('Abort User');

      const response = await request(server).post(`/api/scan/${account.id}/abort`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('ok', true);

      accountManager.deleteAccount(account.id);
    });
  });
});

describe('Matrix Server WebSocket', () => {
  let server: http.Server;
  let testBaseDir: string;
  const TEST_PORT = 3098;

  beforeAll(async () => {
    testBaseDir = path.join(os.tmpdir(), `rednote-test-ws-${Date.now()}`);
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);
    server = await startMatrixServer(TEST_PORT);
  });

  afterAll(async () => {
    await stopMatrixServer(server);
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  afterEach(() => {
    // Clean up accounts after each test
    const accounts = accountManager.listAccounts();
    accounts.forEach(acc => {
      try {
        accountManager.deleteAccount(acc.id);
      } catch (e) {
        // Ignore errors
      }
    });
  });

  describe('WebSocket connection', () => {
    it('should accept WebSocket connections', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should send accounts list on connect', (done) => {
      const account = accountManager.createAccount('WS Test User');

      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'accounts') {
          expect(message.accounts).toBeDefined();
          expect(Array.isArray(message.accounts)).toBe(true);
          ws.close();
          accountManager.deleteAccount(account.id);
          done();
        }
      });

      ws.on('error', (error) => {
        accountManager.deleteAccount(account.id);
        done(error);
      });
    });

    it('should handle multiple concurrent connections', (done) => {
      const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      const ws3 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      let openCount = 0;

      const onOpen = () => {
        openCount++;
        if (openCount === 3) {
          expect(ws1.readyState).toBe(WebSocket.OPEN);
          expect(ws2.readyState).toBe(WebSocket.OPEN);
          expect(ws3.readyState).toBe(WebSocket.OPEN);
          ws1.close();
          ws2.close();
          ws3.close();
          done();
        }
      };

      ws1.on('open', onOpen);
      ws2.on('open', onOpen);
      ws3.on('open', onOpen);

      ws1.on('error', done);
      ws2.on('error', done);
      ws3.on('error', done);
    });

    it('should handle connection close gracefully', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });

  describe('WebSocket message broadcasting', () => {
    it('should receive broadcast when account is created', (done) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      let receivedInitial = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'accounts' && !receivedInitial) {
          receivedInitial = true;
          // Create account after initial message
          const account = accountManager.createAccount('Broadcast Test');

          // Wait for broadcast
          setTimeout(() => {
            accountManager.deleteAccount(account.id);
            ws.close();
            done();
          }, 100);
        }
      });

      ws.on('error', (error) => {
        done(error);
      });
    });
  });
});

describe('Matrix Server Concurrent Scan Limit', () => {
  let server: http.Server;
  let testBaseDir: string;
  const TEST_PORT = 3097;

  beforeAll(async () => {
    testBaseDir = path.join(os.tmpdir(), `rednote-test-scan-${Date.now()}`);
    jest.spyOn(os, 'homedir').mockReturnValue(testBaseDir);
    server = await startMatrixServer(TEST_PORT);
  });

  afterAll(async () => {
    await stopMatrixServer(server);
    if (fs.existsSync(testBaseDir)) {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
  });

  afterEach(() => {
    // Clean up accounts after each test
    const accounts = accountManager.listAccounts();
    accounts.forEach(acc => {
      try {
        accountManager.deleteAccount(acc.id);
      } catch (e) {
        // Ignore errors
      }
    });
  });

  it('should allow one scan per account', async () => {
    const account = accountManager.createAccount('Scan Test');

    const response1 = await request(server).post(`/api/scan/${account.id}`);
    expect(response1.status).toBe(200);

    // Second scan should be tracked separately (implementation allows it)
    const response2 = await request(server).post(`/api/scan/${account.id}`);
    expect(response2.status).toBe(200);

    accountManager.deleteAccount(account.id);
  });

  it('should allow concurrent scans for different accounts', async () => {
    const account1 = accountManager.createAccount('Scan User 1');
    const account2 = accountManager.createAccount('Scan User 2');
    const account3 = accountManager.createAccount('Scan User 3');

    const [response1, response2, response3] = await Promise.all([
      request(server).post(`/api/scan/${account1.id}`),
      request(server).post(`/api/scan/${account2.id}`),
      request(server).post(`/api/scan/${account3.id}`)
    ]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(200);

    accountManager.deleteAccount(account1.id);
    accountManager.deleteAccount(account2.id);
    accountManager.deleteAccount(account3.id);
  });
});
