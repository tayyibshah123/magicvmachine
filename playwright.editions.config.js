import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const port = Number(process.env.MVM_TEST_PORT || 4173);
const output = resolve(process.env.MVM_BROWSER_OUTPUT_DIR || 'test-results/editions');
export default defineConfig({
  testDir: './tests/editions',
  forbidOnly: true, retries: 0, workers: 1,
  timeout: 90000, expect: { timeout: 12000 },
  reporter: [['line'], ['json', { outputFile: resolve(output, 'results.json') }]],
  outputDir: resolve(output, 'artifacts'),
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium', launchOptions: { args: ['--enable-gpu'] },
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'allow', screenshot: 'only-on-failure', actionTimeout: 5000
  },
  webServer: {
    command: 'node scripts/qa-server.mjs',
    env: { MVM_TEST_WEB_ROOT: resolve('release-site') },
    url: `http://127.0.0.1:${port}`, reuseExistingServer: false
  }
});
