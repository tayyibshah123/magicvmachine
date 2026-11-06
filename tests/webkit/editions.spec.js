import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';

const frozenRun = JSON.parse(await readFile(new URL('../browser/returning-save.json', import.meta.url), 'utf8'));
const editions = [{ id: 'stable', path: '/' }, { id: 'guided', path: '/guided/' }];

async function seedReturning(context, edition, checkpoint = false) {
    await context.addInitScript(({ edition, frozenRun, checkpoint }) => {
        if (location.origin === 'null') return;
        const prefix = edition === 'guided' ? 'mvm-edition:guided:' : '';
        if (localStorage.getItem(prefix + 'mvm_qa_webkit_seeded')) return;
        const values = { mvm_onboarding_done: '1', mvm_first_run_done: '1', mvm_breakout_done: '1',
            mvm_analytics_consent: 'denied', mvm_operator_name: 'WEBKIT QA', mvm_active_slot: 'A',
            mvm_sparks: '47', mvm_sparks_lifetime: '47', mvm_frag_to_spark_migrated: '1',
            mvm_qa_webkit_seeded: '1', mvm_qa_webkit_seed_count: '1' };
        if (checkpoint) {
            const run = JSON.parse(JSON.stringify(frozenRun));
            run.player.hp = 17;
            run.fragments = 37;
            values.mvm_save_v1__A = JSON.stringify(run);
        }
        for (const [key, value] of Object.entries(values)) localStorage.setItem(prefix + key, value);
    }, { edition, frozenRun, checkpoint });
}

async function openGame(page, path) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.Game?.canvas && !!window.Game?.ctx);
    await page.locator('#intro-overlay').tap();
    await page.locator('#intro-overlay').waitFor({ state: 'detached' });
}

// Controlled encounter data, real entities and methods. No damage, QTE,
// timing, renderer, death or victory implementation is replaced.
async function encounter(page, { classId, minions = false }) {
    await page.evaluate(async ({ classId, minions }) => {
        const module = path => import(new URL(path, document.baseURI).href);
        const [{ Player }, { Enemy }, { Minion }, { PLAYER_CLASSES, STATE }, { ClassAbility }, { Perf }]
            = await Promise.all([module('./src/entities/player.js'), module('./src/entities/enemy.js'),
                module('./src/entities/minion.js'), module('./src/constants.js'),
                module('./src/ui/class-ability.js'), module('./src/services/perf.js')]);
        const game = window.Game;
        game.clearTrackedTimers();
        game._combatGen = (game._combatGen || 0) + 1;
        game.player = new Player(PLAYER_CLASSES.find(operator => operator.id === classId));
        game.player.classId = classId;
        game.player.maxHp = game.player.currentHp = 100;
        game.player.mana = 20;
        game.player.diceUpgrades = minions ? [] : ['METEOR'];
        game.enemy = new Enemy({ name: 'WebKit controlled encounter', hp: minions ? 1000 : 1, dmg: 1 }, 0);
        Object.assign(game, { _guidedRun: null, _practiceSession: false,
            currentState: STATE.COMBAT, _combatActionDepth: 0, _revivePending: null,
            _endTurnRunning: false, _winCombatRunning: false, _combatStartedAt: 0,
            inputLocked: false, paused: false, autoQTE: true, assistDisabled: true,
            combatPaceMult: 1, turnCount: 3, sector: 1, godMode: false, effects: [],
            _activeSectorMech: null, _ascEffects: {}, activePacts: new Set(), challengeMode: false,
            archiveMode: false, map: { currentIdx: 'fight', nodes: [
                { id: 'fight', type: 'combat', status: 'current', x: 50, y: 70, connections: [] }] } });
        ClassAbility.init(game);
        ClassAbility.startCombat();
        game.player.minions = [];
        game.enemy.minions = [];
        if (minions) for (let i = 0; i < 2; i++) {
            const ally = new Minion(260 + i * 180, 1080, i + 1, true);
            ally.currentHp = ally.maxHp = 10;
            ally.dmg = 20;
            game.player.minions.push(ally);
        }
        game.changeState(STATE.COMBAT);
        game.invalidateStackCache();
        game._syncSignatureDie();
        game.enemy.nextIntents = [{ type: 'defend', val: 0 }];
        game.dicePool = [{ id: 0, type: minions ? 'SUM_DEFEND' : 'METEOR', used: false, selected: false }];
        game.renderRelics();
        game.renderDiceUI();
        game.updateHUD();
        document.getElementById('btn-end-turn').disabled = false;
        Perf.setOverride('high');
    }, { classId, minions });
}

async function observe(page, type, until) {
    await page.evaluate(({ type, until }) => {
        const seen = new Map(), prompts = new Set();
        window.__webkitPresentation = { flights: [], prompts: [], firstDeathCount: null, terminal: null };
        const sample = () => {
            const result = window.__webkitPresentation;
            if (Game.qte?.active && !prompts.has(Game.qte.id)) {
                prompts.add(Game.qte.id);
                result.prompts.push({ id: Game.qte.id, phase: Game.qte.phase, quality: Game.qte.quality });
            }
            for (const effect of Game.effects) if (effect.type === type && !seen.has(effect)) {
                const flight = { firstY: effect.y, targetY: effect.targetY, progress: 0, retired: false };
                seen.set(effect, flight);
                result.flights.push(flight);
            }
            for (const [effect, flight] of seen) {
                flight.lastY = effect.y;
                flight.progress = effect.progress;
                flight.retired = !Game.effects.includes(effect);
            }
            if (Game.enemy.currentHp <= 0 && result.firstDeathCount === null) result.firstDeathCount = result.flights.length;
            const finished = until === 'victory' ? Game.currentState !== 3
                : Game.turnCount === 4 && !Game.inputLocked && !Game._endTurnRunning && !Game._combatActionDepth;
            if (finished) {
                result.terminal = { state: Game.currentState, hp: Game.enemy.currentHp,
                    depth: Game._combatActionDepth, groups: Game._combatPresentations?.size || 0,
                    locked: Game.inputLocked, turn: Game.turnCount };
                return;
            }
            requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
    }, { type, until });
}

for (const edition of editions) {
    test(`${edition.id}: fresh touch onboarding and operator detail panels`, async ({ page }, info) => {
        const navigations = [];
        page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
        await openGame(page, edition.path);
        await expect(page.locator('#onboarding-overlay')).toBeVisible();
        await expect(page.locator('#analytics-consent-banner')).toBeHidden();
        await page.locator('#onb-name').fill('WEBKIT FIRST');
        if (edition.id === 'guided') await expect(page.locator('[data-learning-mode="guided"]')).toHaveAttribute('aria-checked', 'true');
        await page.locator('#onb-next-1').tap();
        await expect(page.locator('#screen-char-select')).toBeVisible();
        if (edition.id === 'guided') {
            await expect(page.locator('.char-card:visible')).toHaveCount(2);
            await page.locator('#btn-more-operators').tap();
        }
        await expect(page.locator('.char-card:visible')).toHaveCount(6);
        for (const classId of ['tactician', 'summoner']) {
            await page.locator(`.char-card[data-class-id="${classId}"]`).tap();
            const panel = page.locator('#char-detail-overlay');
            await expect(panel).toBeVisible();
            expect(await panel.evaluate(node => node.parentElement === document.body)).toBe(true);
            await expect(page.locator('#btn-char-detail-confirm')).toBeVisible();
            await expect(panel.locator('canvas').first()).toBeVisible();
            await page.locator('#btn-char-detail-back').tap();
            await expect(panel).toBeHidden();
        }
        expect(navigations, 'first worker installation never refreshes the callsign/picker flow').toHaveLength(1);
        expect(await page.evaluate(() => localStorage.getItem('mvm_operator_name'))).toBe('WEBKIT FIRST');
        await info.attach('webkit-native-operator-panels', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test(`${edition.id}: real AutoQTE multi-hit presentation and touch-started ally phase settle fully`, async ({ page, context }, info) => {
        await seedReturning(context, edition.id);
        await openGame(page, edition.path);
        await encounter(page, { classId: 'arcanist' });
        await observe(page, 'orbital_strike', 'victory');
        // Production action entry, with the real accessible AutoQTE. There
        // is no CDP or synthetic ring completion on this engine.
        await page.evaluate(() => Game.useDie(Game.dicePool[0], document.querySelector('#dice-container .die'), Game.enemy));
        await page.waitForFunction(() => window.__webkitPresentation.terminal !== null);
        const chain = await page.evaluate(() => window.__webkitPresentation);
        expect(chain.flights).toHaveLength(3);
        expect(chain.firstDeathCount).toBeLessThan(3);
        expect(chain.prompts).toHaveLength(3);
        expect(chain.prompts.every(prompt => prompt.phase === 'auto' && prompt.quality === 'good')).toBe(true);
        for (const flight of chain.flights) {
            expect(flight.firstY).toBeLessThan(flight.targetY);
            expect(flight.lastY).toBeGreaterThanOrEqual(flight.targetY);
            expect(flight.retired).toBe(true);
        }
        expect(chain.terminal).toMatchObject({ state: 16, hp: 0, depth: 0, groups: 0 });
        await page.waitForFunction(() => Game.currentState === 4);
        await page.locator('.reward-card').first().tap();
        await page.waitForFunction(() => Game.currentState === 2);
        await encounter(page, { classId: 'summoner', minions: true });
        await observe(page, 'nature_dart', 'turn');
        await page.locator('#btn-end-turn').tap();
        await page.waitForFunction(() => window.__webkitPresentation.terminal !== null);
        const allies = await page.evaluate(() => window.__webkitPresentation);
        expect(allies.flights).toHaveLength(2);
        expect(allies.prompts).toHaveLength(edition.id === 'guided' ? 1 : 2);
        expect(allies.prompts.every(prompt => prompt.phase === 'auto' && prompt.quality === 'good')).toBe(true);
        for (const flight of allies.flights) {
            expect(flight.progress).toBeGreaterThanOrEqual(1);
            expect(flight.retired).toBe(true);
        }
        expect(allies.terminal).toMatchObject({ state: 3, hp: 956, turn: 4, depth: 0, groups: 0, locked: false });
        await expect(page.locator('#btn-end-turn')).toBeEnabled();
        expect(await page.locator('#dice-container .die:not(.used)').count()).toBeGreaterThan(0);
        await info.attach('webkit-real-settled-presentations', { body: JSON.stringify({ chain, allies }, null, 2), contentType: 'application/json' });
    });

    test(`${edition.id}: cold offline manifest launch restores its one-time seeded checkpoint`, async ({ page, context }, info) => {
        await seedReturning(context, edition.id, true);
        const offlineModules = [];
        let offline = false;
        page.on('response', response => {
            if (offline && response.url().endsWith('.js')) offlineModules.push({
                path: new URL(response.url()).pathname, status: response.status(), worker: response.fromServiceWorker()
            });
        });
        try {
            await openGame(page, edition.path);
            await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL), { timeout: 30000 })
                .toBe(new URL(edition.path + 'service-worker.js', page.url()).href);
            const launch = await page.evaluate(async () => {
                const manifest = await (await fetch('./manifest.json')).json();
                return new URL(manifest.start_url, document.baseURI).href;
            });
            // This server sends no-store, so the HTTP cache cannot mask a
            // missing worker dependency. New document, fresh module graph.
            const moduleResponse = await page.request.get(edition.path + 'src/game.js');
            expect(moduleResponse.headers()['cache-control']).toContain('no-store');
            await page.goto('about:blank');
            await context.setOffline(true);
            offline = true;
            await openGame(page, launch);
            await page.locator('#btn-load-save').tap();
            await expect(page.locator('#screen-map')).toBeVisible();
            expect(await page.evaluate(() => ({ hp: Game.player.currentHp, fragments: Game.techFragments,
                sector: Game.sector, sparks: localStorage.getItem('mvm_sparks'),
                seedCount: localStorage.getItem('mvm_qa_webkit_seed_count') })))
                .toEqual({ hp: 17, fragments: 37, sector: 1, sparks: '47', seedCount: '1' });
            expect(await page.evaluate(async () => (await import(new URL('./src/version.js', document.baseURI).href)).APP_EDITION)).toBe(edition.id);
            for (const file of ['main.js', 'src/game.js', 'src/services/onboarding.js']) {
                expect(offlineModules).toContainEqual({ path: edition.path + file, status: 200, worker: true });
            }
            await info.attach('webkit-cold-offline-module-evidence', { body: JSON.stringify({ launch, offlineModules }, null, 2), contentType: 'application/json' });
        } finally { await context.setOffline(false); }
    });
}
