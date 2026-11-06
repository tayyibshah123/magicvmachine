import { test as base, expect } from '@playwright/test';
import { captureBrowserErrors } from '../helpers/browser-errors.js';

export const test = base.extend({
    browserErrors: [async ({ page, context, browser }, use, info) => {
        const capture = await captureBrowserErrors(context, new URL(info.project.use.baseURL).origin);
        await use(capture.errors);
        if (!page.isClosed()) {
            await info.attach('webkit-final-state', { body: JSON.stringify(await page.evaluate(() => ({
                url: location.href, userAgent: navigator.userAgent,
                state: window.Game?.currentState, hp: window.Game?.player?.currentHp,
                enemyHp: window.Game?.enemy?.currentHp, turn: window.Game?.turnCount,
                inputLocked: window.Game?.inputLocked, depth: window.Game?._combatActionDepth,
                qte: window.Game?.qte ? { active: Game.qte.active, phase: Game.qte.phase } : null,
                activeScreens: [...document.querySelectorAll('.screen.active')].map(node => node.id)
            })), null, 2), contentType: 'application/json' });
        }
        await capture.collectUnhandled();
        await info.attach('webkit-engine-and-errors', { body: JSON.stringify({
            engine: 'Playwright desktop WebKit with a touch viewport', version: browser.version(),
            physicalSafari: false, errors: capture.errors
        }, null, 2), contentType: 'application/json' });
        expect(capture.errors, 'required resources, page errors and unhandled rejections').toEqual([]);
    }, { auto: true }]
});
export { expect };
