import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  browserErrors: [async ({ page, context }, use, testInfo) => {
    const errors = [];
    const origin = new URL(testInfo.project.use.baseURL).origin;
    const required = request => {
      const url = new URL(request.url());
      return url.origin === origin && (['script', 'document', 'stylesheet'].includes(request.resourceType())
        || url.pathname.endsWith('/service-worker.js'));
    };
    page.on('pageerror', error => errors.push(error.message));
    context.on('response', response => {
      if (response.status() >= 400 && required(response.request())) {
        errors.push(response.status() + ' ' + response.url());
      }
    });
    context.on('requestfailed', request => {
      if (required(request)) errors.push((request.failure()?.errorText || 'Request failed') + ' ' + request.url());
    });
    await page.addInitScript(() => {
      window.__qaUnhandled = [];
      window.__qaTouches = [];
      window.__qaPointers = [];
      window.addEventListener('unhandledrejection', event => window.__qaUnhandled.push(String(event.reason?.stack || event.reason)));
      document.addEventListener('pointerdown', event => {
        window.__qaPointers.push({ time: performance.now(), x: event.clientX, y: event.clientY,
          tag: event.target.tagName, id: event.target.id, className: String(event.target.className?.baseVal || event.target.className || '') });
        if (window.__qaPointers.length > 40) window.__qaPointers.shift();
        const q = window.Game?.qte;
        if (q?.active) window.__qaTouches.push({ time: performance.now(), x: event.clientX, y: event.clientY,
          phase: q.phase, wave: q.waveIdx, radius: q.radius, cooldown: Game.inputCooldown, id: q.id });
      }, true);
    });
    await use(errors);
    if (!page.isClosed()) {
      try {
        const state = await page.evaluate(() => ({
          state: window.Game?.currentState, turn: window.Game?.turnCount,
          hp: window.Game?.player?.currentHp, enemyHp: window.Game?.enemy?.currentHp,
          inputLocked: window.Game?.inputLocked, actionDepth: window.Game?._combatActionDepth,
          activeScreens: [...document.querySelectorAll('.screen.active')].map(screen => screen.id),
          dice: window.Game?.dicePool?.map(d => ({ type: d.type, used: d.used })),
          touches: window.__qaTouches || [],
          pointers: window.__qaPointers || [],
          unhandled: window.__qaUnhandled || []
        }));
        const checkpoint = await page.evaluate(() => {
          try {
            const slot = localStorage.getItem('mvm_active_slot') || 'A';
            return localStorage.getItem('mvm_save_v1__' + slot);
          } catch { return null; }
        });
        errors.push(...state.unhandled);
        await testInfo.attach('final-state', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
        await testInfo.attach('checkpoint', { body: checkpoint || 'null', contentType: 'application/json' });
      } catch (error) {
        errors.push('Could not inspect the final browser state: ' + error.message);
      }
    }
    await testInfo.attach('browser-errors', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
    expect(errors, 'Uncaught errors and failed required application resources').toEqual([]);
  }, { auto: true }]
});
export { expect };
