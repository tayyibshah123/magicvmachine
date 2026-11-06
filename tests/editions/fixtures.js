import { test as base, expect } from '@playwright/test';
import { captureBrowserErrors } from '../helpers/browser-errors.js';

export const test = base.extend({
  browserErrors: [async ({ page, context }, use, info) => {
    const capture = await captureBrowserErrors(context, new URL(info.project.use.baseURL).origin);
    await use(capture.errors);
    await capture.collectUnhandled();
    await info.attach('all-edition-browser-errors', { body: JSON.stringify(capture.errors, null, 2), contentType: 'application/json' });
    expect(capture.errors).toEqual([]);
  }, { auto: true }]
});
export { expect };
