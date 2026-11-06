import { test, expect, edition, storagePrefix } from './fixtures.js';

test.setTimeout(90000);

const run = {
    v: 3, combatRecovery: null, sector: 2, fragments: 37, encrypted: 2,
    currentIdx: 'fight', bossDefeated: false, challengeMode: false, archiveMode: false,
    endlessActive: false, customRunModifiers: [], activePacts: [],
    map: { currentIdx: 'fight', nodes: [
        { id: 'start', type: 'start', status: 'completed', x: 50, y: 92, connections: ['fight'] },
        { id: 'fight', type: 'combat', status: 'available', x: 50, y: 70, connections: [] }
    ] },
    runStats: { turns: 4, totalDamage: 19, highestHit: 12, kills: 1 },
    player: { classId: 'tactician', hp: 17, maxHp: 30, mana: 3,
        relics: [], upgrades: [], signatureTier: 1 }
};
const profile = {
    mvm_onboarding_done: '1', mvm_first_run_done: '1',
    mvm_analytics_consent: 'denied', mvm_operator_name: 'PWA OPERATOR',
    mvm_active_slot: 'A', mvm_save_v1__A: JSON.stringify(run),
    mvm_sparks: '47', mvm_sparks_lifetime: '47', mvm_encrypted: '2',
    mvm_lore: '[1,2]', mvm_frag_to_spark_migrated: '1'
};

async function setRevision(page, revision) {
    const response = await page.request.post('/.__qa__/revision', { data: { revision } });
    expect(response.ok(), `test deployment revision ${revision || 'original'} accepted`).toBe(true);
}

async function seedOnce(context) {
    await context.addInitScript(({ values, prefix }) => {
        if (location.origin === 'null') return;
        // This marker survives reloads and new documents. Never reinsert a
        // checkpoint after the application has had a chance to alter it.
        if (!localStorage.getItem(prefix + 'mvm_qa_pwa_seeded')) {
            for (const [key, value] of Object.entries(values)) localStorage.setItem(prefix + key, value);
            localStorage.setItem(prefix + 'mvm_qa_pwa_seeded', '1');
            localStorage.setItem(prefix + 'mvm_qa_pwa_seed_count', String(Number(localStorage.getItem(prefix + 'mvm_qa_pwa_seed_count') || 0) + 1));
        }
        window.__mvmQaDocument = `${Date.now()}-${Math.random()}`;
    }, { values: profile, prefix: storagePrefix });
}

async function waitForGame(page) {
    await expect.poll(() => page.evaluate(() => Boolean(window.Game?.init)), {
        message: 'the actual game module graph boots in this document', timeout: 20000
    }).toBe(true);
}

async function waitForInstalledWorker(page) {
    await expect.poll(() => page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state === 'activated';
    }), { message: 'the actual service worker finishes installation and activation', timeout: 45000 }).toBe(true);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
        message: 'the installed worker claims the page without reloading it', timeout: 45000
    }).toBe(true);
}

async function cacheSnapshot(page) {
    return page.evaluate(async () => {
        const names = await caches.keys();
        return Promise.all(names.map(async name => ({
            name, urls: (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname).sort()
        })));
    });
}

async function readProfile(page) {
    return page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(profile));
}

async function openReturningMenu(page, path = '/') {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    await page.locator('#intro-overlay').click();
    await expect(page.locator('#intro-overlay')).toHaveCount(0);
    await expect(page.locator('#btn-load-save')).toBeVisible();
}

test('first installation preserves consent and onboarding without an automatic refresh', async ({ page }) => {
    await setRevision(page, '');
    const navigations = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    await waitForInstalledWorker(page);
    await page.locator('#intro-overlay').click();
    await expect(page.locator('#analytics-consent-banner')).toBeHidden();
    await expect(page.locator('#onboarding-overlay')).toBeVisible();
    await page.locator('#onb-name').fill('FIRST VISIT');
    // Observe beyond the refresh fallback window after the actual claim.
    await page.waitForTimeout(1000);
    expect(navigations).toHaveLength(1);
    await expect(page.locator('#onb-name')).toHaveValue('FIRST VISIT');
    expect(await page.evaluate(() => localStorage.getItem('mvm_analytics_consent'))).toBeNull();
    await expect(page.locator('#sw-update-banner')).toBeHidden();
    await page.locator('#onb-next-1').click();
    await expect(page.locator('#screen-char-select')).toBeVisible();
    if (edition === 'guided') {
        expect(await page.evaluate(async () => {
            const { Learning } = await import('/src/services/learning.js');
            return { mode: Learning.getMode(), coreComplete: Learning.coreComplete(),
                tutorialAutoRun: Game.tutorialAutoRun };
        })).toEqual({ mode: 'guided', coreComplete: false, tutorialAutoRun: false });
        await expect(page.locator('.char-card:visible')).toHaveCount(2);
        await page.locator('.char-card[data-class-id="tactician"]').click();
        await page.locator('#btn-char-detail-confirm').click();
        await expect.poll(() => page.evaluate(async () => {
            const { Breakout } = await import('/src/services/breakout.js');
            return { active: Breakout.isActive(), room: Breakout._roomIdx,
                checkpointRoom: Game._guidedRun?.core?.roomIndex, classId: Game.player?.classId };
        })).toEqual({ active: true, room: 0, checkpointRoom: 0, classId: 'tactician' });
    } else expect(await page.evaluate(() => window.Game.tutorialAutoRun)).toBe(true);
    expect(navigations).toHaveLength(1);
});

test('installed game cold-opens offline with HTTP cache cleared and resumes its saved run', async ({ page, context }, testInfo) => {
    await setRevision(page, '');
    await seedOnce(context);
    let offline = false;
    const moduleResponses = [];
    const onlineStartupPaths = new Set();
    const origin = new URL(testInfo.project.use.baseURL).origin;
    page.on('response', response => {
        const url = new URL(response.url());
        const path = url.pathname;
        if (url.origin !== origin || !/\.(?:js|css)$/.test(path)) return;
        if (offline) moduleResponses.push({ path, status: response.status(), worker: response.fromServiceWorker() });
        else onlineStartupPaths.add(path);
    });
    try {
        await openReturningMenu(page);
        await waitForInstalledWorker(page);
        const manifestStart = await page.evaluate(async () => {
            const manifest = await (await fetch('./manifest.json')).json();
            return new URL(manifest.start_url, document.baseURI).href;
        });
        const before = await cacheSnapshot(page);
        expect(before.some(cache => cache.urls.includes('/index.html'))).toBe(true);
        await testInfo.attach('pwa-cache-before-offline', { body: JSON.stringify(before, null, 2), contentType: 'application/json' });
        const documentId = await page.evaluate(() => window.__mvmQaDocument);
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.clearBrowserCache');
        await cdp.detach();
        const afterClear = await cacheSnapshot(page);
        for (const baseline of before) {
            const preserved = afterClear.find(cache => cache.name === baseline.name);
            expect(preserved, `HTTP-cache clearing preserves worker cache ${baseline.name}`).toBeDefined();
            // Background music may add entries between snapshots. Every
            // previously cached entry must still survive the HTTP clear.
            expect(preserved.urls).toEqual(expect.arrayContaining(baseline.urls));
        }
        // Leave the application document so its module graph cannot survive
        // this launch. The browser profile and installed worker remain intact.
        await page.goto('about:blank');
        await context.setOffline(true);
        offline = true;
        await openReturningMenu(page, manifestStart);
        // Version metadata is consumed by the update check rather than the
        // startup module graph. Load it explicitly while still offline.
        await page.evaluate(async () => { await import('/src/version.js'); });
        expect([...onlineStartupPaths].some(path => path.endsWith('.css')), 'the baseline includes real startup stylesheets').toBe(true);
        for (const path of new Set([...onlineStartupPaths, '/main.js', '/src/game.js', '/src/version.js', '/src/services/onboarding.js'])) {
            expect(moduleResponses, `offline startup resource ${path} is supplied by the installed worker`).toContainEqual({ path, status: 200, worker: true });
        }
        expect(await page.evaluate(() => window.__mvmQaDocument)).not.toBe(documentId);
        expect(await page.evaluate(() => localStorage.getItem('mvm_qa_pwa_seed_count'))).toBe('1');
        expect(await readProfile(page)).toEqual(profile);
        await page.locator('#btn-load-save').click();
        await expect(page.locator('#screen-map')).toBeVisible();
        expect(await page.evaluate(() => ({ hp: window.Game.player.currentHp, sector: window.Game.sector,
            fragments: window.Game.techFragments }))).toEqual({ hp: 17, sector: 2, fragments: 37 });
    } finally {
        await testInfo.attach('offline-module-responses', { body: JSON.stringify(moduleResponses, null, 2), contentType: 'application/json' });
        await context.setOffline(false);
    }
});

test('a real worker update refreshes once and preserves a representative saved run and profile', async ({ page, context }, testInfo) => {
    await setRevision(page, '');
    await seedOnce(context);
    const navigations = [];
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
    try {
        await openReturningMenu(page);
        await waitForInstalledWorker(page);
        const before = await readProfile(page);
        expect(before).toEqual(profile);
        await setRevision(page, 'qa-update');
        await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
        await expect(page.locator('#sw-update-banner')).toBeVisible({ timeout: 45000 });
        await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration()).waiting))).toBe(true);
        expect(navigations).toHaveLength(1);
        const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await page.locator('#btn-sw-refresh').click();
        await navigation;
        await waitForGame(page);
        await expect.poll(() => page.evaluate(async () => (await import('/src/version.js')).APP_VERSION)).toMatch(/-qa-update$/);
        await expect.poll(async () => (await cacheSnapshot(page)).some(cache => cache.name.endsWith('-qa-update'))).toBe(true);
        await page.waitForTimeout(1200);
        expect(navigations, 'worker takeover and the fallback must share one refresh').toHaveLength(2);
        expect(await page.evaluate(() => localStorage.getItem('mvm_qa_pwa_seed_count'))).toBe('1');
        expect(await readProfile(page)).toEqual(before);
        await testInfo.attach('pwa-cache-after-update', { body: JSON.stringify(await cacheSnapshot(page), null, 2), contentType: 'application/json' });
        await page.locator('#intro-overlay').click();
        await expect(page.locator('#intro-overlay')).toHaveCount(0);
        await page.locator('#btn-load-save').click();
        await expect(page.locator('#screen-map')).toBeVisible();
        expect(await page.evaluate(() => window.Game.player.currentHp)).toBe(17);
    } finally {
        await setRevision(page, '');
    }
});
