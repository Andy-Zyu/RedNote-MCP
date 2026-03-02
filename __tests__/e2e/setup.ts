import { test as base } from '@playwright/test';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { startMatrixServer, stopMatrixServer } from '../../src/matrix/server';

// Test data directory
export const TEST_DATA_DIR = path.join(__dirname, '.test-data');
export const TEST_ACCOUNTS_DIR = path.join(TEST_DATA_DIR, 'accounts');
export const TEST_DEFAULT_COOKIE = path.join(TEST_DATA_DIR, 'rednote_cookies.json');

// Setup test environment
export function setupTestEnv() {
  // Set environment variables for test
  process.env.REDNOTE_DATA_DIR = TEST_DATA_DIR;
  process.env.REDNOTE_ACCOUNTS_DIR = TEST_ACCOUNTS_DIR;
  process.env.REDNOTE_COOKIE_PATH = TEST_DEFAULT_COOKIE;
}

// Clean test data
export function cleanTestData() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

// Create test data directory
export function createTestDataDir() {
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_ACCOUNTS_DIR)) {
    fs.mkdirSync(TEST_ACCOUNTS_DIR, { recursive: true });
  }
}

// Extended test with server fixture
export const test = base.extend<{ server: http.Server }>({
  server: async ({}, use) => {
    setupTestEnv();
    cleanTestData();
    createTestDataDir();

    const server = await startMatrixServer(3001);
    await use(server);
    await stopMatrixServer(server);

    cleanTestData();
  },
});

export { expect } from '@playwright/test';
