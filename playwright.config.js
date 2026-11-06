import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const output = resolve(process.env.MVM_BROWSER_OUTPUT_DIR || 'test-results/browser');
const port = Number(process.env.MVM_TEST_PORT || 4173);
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.js',
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 45000,
  globalTimeout: 40 * 60 * 1000,
  expect: { timeout: 8000 },
  outputDir: resolve(output, 'artifacts'),
  reporter: [['line'], ['json', { outputFile: resolve(output, 'results.json') }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    launchOptions: { args: ['--enable-gpu'] },
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
    actionTimeout: 5000,
    navigationTimeout: 20000,
    trace: process.env.MVM_QA_TRACE === '1' ? 'retain-on-failure' : 'off',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'node scripts/qa-server.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 10000
  }
});
