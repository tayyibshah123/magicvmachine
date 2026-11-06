import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const port = Number(process.env.MVM_TEST_PORT || 4173);
const output = resolve(process.env.MVM_BROWSER_OUTPUT_DIR || 'test-results/webkit');
export default defineConfig({
    testDir: './tests/webkit',
    forbidOnly: true, retries: 0, workers: 1,
    timeout: 60000, globalTimeout: 6 * 60 * 1000,
    expect: { timeout: 10000 },
    reporter: [['line'], ['json', { outputFile: resolve(output, 'results.json') }]],
    outputDir: resolve(output, 'artifacts'),
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        browserName: 'webkit',
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
        isMobile: true, hasTouch: true, serviceWorkers: 'allow',
        actionTimeout: 5000, navigationTimeout: 20000,
        screenshot: 'only-on-failure', trace: process.env.MVM_QA_TRACE === '1' ? 'retain-on-failure' : 'off'
    },
    webServer: {
        command: 'node scripts/qa-server.mjs',
        env: { MVM_TEST_WEB_ROOT: resolve(process.env.MVM_TEST_WEB_ROOT || 'release-site') },
        url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 10000
    }
});
