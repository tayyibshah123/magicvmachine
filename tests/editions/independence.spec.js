import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';

const frozenRun = JSON.parse(await readFile(new URL('../browser/returning-save.json', import.meta.url), 'utf8'));
const expected = {
    stable: { hp: 17, sector: 2, fragments: 37, sparks: '47' },
    guided: { hp: 23, sector: 1, fragments: 11, sparks: '9' }
};

test.beforeEach(async ({ page, context }) => {
    for (const edition of ['stable', 'guided']) {
        expect((await page.request.post('/.__qa__/revision', { data: { revision: '', edition } })).ok()).toBe(true);
    }
    await context.addInitScript(({ frozenRun, expected }) => {
        if (location.origin === 'null') return;
        const edition = location.pathname.startsWith('/guided/') ? 'guided' : 'stable';
        const prefix = edition === 'guided' ? 'mvm-edition:guided:' : '';
        // Intentionally outside the game views so a tested reset cannot
        // cause the setup script to reinsert the profile after a reload.
        const marker = 'qa-edition-profile-once:' + edition;
        if (localStorage.getItem(marker)) return;
        const values = expected[edition];
        const run = JSON.parse(JSON.stringify(frozenRun));
        Object.assign(run, { sector: values.sector, fragments: values.fragments });
        run.player.hp = values.hp;
        const profile = {
            mvm_onboarding_done: '1', mvm_first_run_done: '1', mvm_breakout_done: '1',
            mvm_analytics_consent: 'denied', mvm_operator_name: edition.toUpperCase(),
            mvm_save_v1__A: JSON.stringify(run), mvm_active_slot: 'A',
            mvm_sparks: values.sparks, mvm_sparks_lifetime: values.sparks,
            mvm_frag_to_spark_migrated: '1'
        };
        for (const [key, value] of Object.entries(profile)) localStorage.setItem(prefix + key, value);
        localStorage.setItem(marker, '1');
    }, { frozenRun, expected });
});

async function open(page, edition, path) {
    await page.goto(path || (edition === 'stable' ? '/' : '/guided/'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.Game?.ctx);
    await page.locator('#intro-overlay').tap();
    await page.locator('#intro-overlay').waitFor({ state: 'detached' });
    await expect.poll(() => page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const controller = navigator.serviceWorker.controller;
        return registration?.active?.state === 'activated'
            && controller?.scriptURL === new URL('./service-worker.js', document.baseURI).href;
    }), { timeout: 45000 }).toBe(true);
}
async function resume(page) {
    await page.locator('#btn-load-save').tap();
    await page.waitForFunction(() => Game.currentState === 2);
    return page.evaluate(() => ({ hp: Game.player.currentHp, sector: Game.sector,
        fragments: Game.techFragments, sparks: localStorage.getItem('mvm_sparks') }));
}
async function profile(page) {
    return page.evaluate(() => Object.fromEntries(['mvm_save_v1__A', 'mvm_sparks', 'mvm_operator_name',
        'mvm_analytics_consent'].map(key => [key, localStorage.getItem(key)])));
}

for (const resetEdition of ['stable', 'guided']) test(`${resetEdition} reset cannot erase the other independently installed game`, async ({ page: stable, context }) => {
    const guided = await context.newPage();
    const navigations = [];
    guided.on('framenavigated', frame => { if (frame === guided.mainFrame()) navigations.push(frame.url()); });
    await open(stable, 'stable');
    await open(guided, 'guided');
    expect(navigations, 'first child-worker installation must not refresh the nested edition').toHaveLength(1);
    expect(await resume(stable)).toEqual(expected.stable);
    expect(await resume(guided)).toEqual(expected.guided);
    const [reset, other] = resetEdition === 'stable' ? [stable, guided] : [guided, stable];
    const before = await profile(other);
    await reset.evaluate(() => localStorage.clear());
    expect(await profile(other)).toEqual(before);
    expect(await reset.evaluate(() => localStorage.getItem('mvm_sparks'))).toBeNull();
    await open(reset, resetEdition);
    await expect(reset.locator('#btn-load-save')).toBeHidden();
    expect(await profile(other)).toEqual(before);
});

for (const updateEdition of ['stable', 'guided']) test(`updating ${updateEdition} preserves the other game's controller, cache and profile`, async ({ page: stable, context }) => {
    const guided = await context.newPage();
    await open(stable, 'stable');
    await open(guided, 'guided');
    const [update, other] = updateEdition === 'stable' ? [stable, guided] : [guided, stable];
    const otherEdition = updateEdition === 'stable' ? 'guided' : 'stable';
    const before = await profile(other);
    const controller = await other.evaluate(() => navigator.serviceWorker.controller.scriptURL);
    let otherReloads = 0;
    other.on('framenavigated', frame => { if (frame === other.mainFrame()) otherReloads++; });
    expect((await update.request.post('/.__qa__/revision', { data: { revision: 'isolation', edition: updateEdition } })).ok()).toBe(true);
    await update.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
    await expect(update.locator('#sw-update-banner')).toBeVisible({ timeout: 45000 });
    await expect.poll(() => update.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(true);
    await Promise.all([update.waitForNavigation({ waitUntil: 'domcontentloaded' }), update.locator('#btn-sw-refresh').tap()]);
    await update.waitForFunction(() => !!window.Game?.ctx);
    await expect.poll(() => update.evaluate(async () => (await caches.keys()).some(key => key.endsWith('-isolation')))).toBe(true);
    expect(await profile(other)).toEqual(before);
    expect(await other.evaluate(() => navigator.serviceWorker.controller.scriptURL)).toBe(controller);
    expect(otherReloads).toBe(0);
    const cachesNow = await other.evaluate(() => caches.keys());
    expect(cachesNow.some(key => key.includes(`|mvm-${otherEdition}-shell-v`) && !key.endsWith('-isolation'))).toBe(true);
    expect(cachesNow.some(key => key.includes(`|mvm-${updateEdition}-shell-v`) && key.endsWith('-isolation'))).toBe(true);
});

test('both editions cold-open offline from their own caches after the HTTP cache is cleared', async ({ page: stable, context }) => {
    const guided = await context.newPage();
    await open(stable, 'stable');
    await open(guided, 'guided');
    const launchURL = page => page.evaluate(async () => {
        const manifest = await (await fetch('./manifest.json')).json();
        return new URL(manifest.start_url, document.baseURI).href;
    });
    const starts = { stable: await launchURL(stable), guided: await launchURL(guided) };
    const cdp = await context.newCDPSession(stable);
    await cdp.send('Network.clearBrowserCache');
    await cdp.detach();
    await stable.goto('about:blank');
    await guided.goto('about:blank');
    await context.setOffline(true);
    try {
        await open(stable, 'stable', starts.stable);
        await open(guided, 'guided', starts.guided);
        expect(await resume(stable)).toEqual(expected.stable);
        expect(await resume(guided)).toEqual(expected.guided);
        expect(await stable.evaluate(async () => (await import('./src/version.js')).APP_EDITION)).toBe('stable');
        expect(await guided.evaluate(async () => (await import('./src/version.js')).APP_EDITION)).toBe('guided');
    } finally { await context.setOffline(false); }
});
