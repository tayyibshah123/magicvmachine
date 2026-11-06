import { test, expect } from './fixtures.js';
import { openGame, configureEncounter, tap, dragDie, tapQTE } from './game-driver.js';
import { STATE } from '../../src/constants.js';

test.setTimeout(45000);

async function observePresentation(page) {
    await page.evaluate(combat => {
        const tracked = new Map();
        const result = window.__qaPresentation = { meteors: 0, flights: [],
            firstDeathMeteors: null, terminal: null, touches: [] };
        window.addEventListener('pointerdown', () => {
            const qte = window.Game.qte;
            result.touches.push({ at: performance.now(), active: qte?.active, phase: qte?.phase,
                radius: qte?.radius, cooldown: Game.inputCooldown, wave: qte?.waveIdx });
        }, { capture: true, passive: true });
        const frame = () => {
            const game = window.Game;
            const live = new Set(game.effects || []);
            for (const effect of game.effects || []) {
                if (effect.type === 'orbital_strike' && !tracked.has(effect)) {
                    const flight = { firstY: effect.y, lastY: effect.y, targetY: effect.targetY,
                        retired: false, reachedTarget: false };
                    tracked.set(effect, flight);
                    result.flights.push(flight);
                    result.meteors++;
                }
            }
            // Keep the original descriptor after removal. The real renderer
            // moves its y to targetY before retiring it, so clearing the array
            // early cannot masquerade as a completed impact.
            for (const [effect, flight] of tracked) {
                flight.lastY = effect.y;
                flight.retired = !live.has(effect);
                flight.reachedTarget = effect.y >= effect.targetY;
            }
            if (game.enemy?.currentHp <= 0 && result.firstDeathMeteors === null) {
                result.firstDeathMeteors = result.meteors;
            }
            if (game.currentState !== combat) {
                result.terminal = { state: game.currentState,
                    effects: game.effects.map(effect => effect.type),
                    groups: game._combatPresentations?.size || 0 };
                return;
            }
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }, STATE.COMBAT);
}

async function combatState(page) {
    return page.evaluate(() => ({ state: Game.currentState, hp: Game.player?.currentHp,
        enemyHp: Game.enemy?.currentHp, turn: Game.turnCount, rerolls: Game.rerolls,
        locked: Game.inputLocked, depth: Game._combatActionDepth, paused: Game.paused,
        qte: { active: Game.qte?.active, id: Game.qte?.id, wave: Game.qte?.waveIdx,
            total: Game.qte?.waveTotal, pattern: Game.qte?.pattern, boost: Game.qte?.minionBoost,
            attackerX: Game.qte?.attackerX, attackerY: Game.qte?.attackerY },
        effects: Game.effects.map(effect => effect.type) }));
}

test('native touch completes all three early-lethal Starfall waves and meteor presentations', async ({ page }, testInfo) => {
    await openGame(page, { returning: true });
    await configureEncounter(page, { classId: 'arcanist', enemyHp: 1, hp: 100,
        dice: ['METEOR'], upgrades: ['METEOR'], autoQTE: false, performance: 'high' });
    await observePresentation(page);
    const die = await page.evaluate(() => Game.dicePool.find(die => die.type === 'METEOR').id);
    await dragDie(page, die, 'enemy');
    const points = [];
    try {
        for (let wave = 0; wave < 3; wave++) points.push(await tapQTE(page));
    } finally {
        await testInfo.attach('chain-touch-observations', { body: JSON.stringify({ points,
            actual: await page.evaluate(() => window.__qaPresentation.touches) }), contentType: 'application/json' });
    }
    await expect.poll(() => page.evaluate(() => window.__qaPresentation.terminal)).not.toBeNull();
    const result = await page.evaluate(() => window.__qaPresentation);
    expect(result.meteors).toBe(3);
    expect(result.flights).toHaveLength(3);
    for (const flight of result.flights) {
        expect(flight.firstY).toBeLessThan(flight.targetY);
        expect(flight.lastY).toBeGreaterThanOrEqual(flight.targetY);
        expect(flight.retired).toBe(true);
        expect(flight.reachedTarget).toBe(true);
    }
    expect(result.firstDeathMeteors).toBeLessThan(3);
    expect(result.terminal.state).toBe(STATE.COMBAT_WIN);
    expect(result.terminal.effects).not.toContain('orbital_strike');
    expect(result.terminal.groups).toBe(0);
});

test('low-tier wider minion prompt targets its source and blocks extra turn controls', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openGame(page, { returning: true });
    await configureEncounter(page, { classId: 'summoner', enemyHp: 100, hp: 100,
        dice: ['SUM_DEFEND'], autoQTE: false, performance: 'low', widerWindow: true,
        minions: [{ playerSide: true, hp: 10, dmg: 20 }] });
    const controls = await page.evaluate(() => {
        window.__qaControlInputs = [];
        window.__qaMinionPrompt = null;
        const capturePrompt = () => {
            if (Game.qte?.active && Game.qte.minionBoost) {
                window.__qaMinionPrompt = { hp: Game.enemy.currentHp, total: Game.qte.waveTotal,
                    pattern: Game.qte.pattern, attackerX: Game.qte.attackerX, attackerY: Game.qte.attackerY,
                    sourceX: Game.player.minions[0].x, sourceY: Game.player.minions[0].y };
            } else requestAnimationFrame(capturePrompt);
        };
        requestAnimationFrame(capturePrompt);
        window.addEventListener('pointerdown', event => {
            const button = event.target.closest?.('#btn-reroll, #btn-end-turn');
            if (button) window.__qaControlInputs.push({ id: button.id, qte: !!Game.qte.active,
                locked: Game.inputLocked, dart: Game.effects.some(effect => effect.type === 'nature_dart') });
        }, { capture: true, passive: true });
        return ['btn-reroll', 'btn-end-turn'].map(id => {
            const rect = document.getElementById(id).getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        });
    });
    await tap(page, '#btn-end-turn');
    await page.waitForFunction(() => window.__qaMinionPrompt !== null);
    await tapQTE(page);
    await expect.poll(async () => (await combatState(page)).enemyHp).toBe(74);
    await expect.poll(async () => (await combatState(page)).effects.includes('nature_dart')).toBe(true);
    const presenting = await combatState(page);
    expect(presenting.qte.active).toBe(false);
    expect(presenting.locked).toBe(true);
    await expect(page.locator('#btn-end-turn')).toBeDisabled();
    for (const point of controls) await page.touchscreen.tap(point.x, point.y);
    const blocked = await combatState(page);
    expect(blocked.rerolls).toBe(presenting.rerolls);
    expect(blocked.turn).toBe(presenting.turn);
    expect(blocked.enemyHp).toBe(74);
    expect(await page.evaluate(() => window.__qaControlInputs.filter(input => input.id === 'btn-reroll').at(-1)))
        .toEqual({ id: 'btn-reroll', qte: false, locked: true, dart: true });
    const prompt = await page.evaluate(() => window.__qaMinionPrompt);
    expect(prompt.hp).toBe(100);
    expect(prompt.total).toBe(1);
    expect(prompt.pattern).toBe('steady');
    expect(prompt.attackerX).toBe(prompt.sourceX);
    expect(prompt.attackerY).toBe(prompt.sourceY);
});

test('a simulated lifecycle pause holds a lethal dart until a native resume touch', async ({ page }) => {
    await openGame(page, { returning: true });
    await configureEncounter(page, { classId: 'summoner', enemyHp: 1, hp: 100,
        dice: ['SUM_DEFEND'], autoQTE: true, performance: 'low',
        minions: [{ playerSide: true, hp: 10, dmg: 20 }] });
    await tap(page, '#btn-end-turn');
    await expect.poll(async () => (await combatState(page)).effects.includes('nature_dart')).toBe(true);
    const progress = await page.evaluate(() => {
        Game._showPauseOverlay();
        return Game.effects.find(effect => effect.type === 'nature_dart').progress;
    });
    await page.waitForTimeout(1500);
    const paused = await page.evaluate(() => ({ paused: Game.paused, state: Game.currentState,
        progress: Game.effects.find(effect => effect.type === 'nature_dart')?.progress }));
    expect(paused).toEqual({ paused: true, state: STATE.COMBAT, progress });
    await tap(page, '#pause-overlay');
    await expect.poll(async () => (await combatState(page)).state).toBe(STATE.COMBAT_WIN);
    expect((await combatState(page)).effects).not.toContain('nature_dart');
});

test('native touch cancellation abandons a dragged die instead of playing it', async ({ page, context }) => {
    await openGame(page, { returning: true });
    await configureEncounter(page, { classId: 'tactician', enemyHp: 100, hp: 100,
        dice: ['TAC_DEFEND'], autoQTE: false, performance: 'high' });
    const dieId = await page.evaluate(() => Game.dicePool[0].id);
    const tile = await page.locator(`.die[data-die-id="${dieId}"]`).boundingBox();
    expect(tile).not.toBeNull();
    const target = await page.evaluate(() => {
        const rect = Game.canvas.getBoundingClientRect();
        return { x: rect.left + Game.player.x * rect.width / 1080,
            y: rect.top + Game.player.y * rect.height / 1920 };
    });
    const from = { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
    const cdp = await context.newCDPSession(page);
    try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 12; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
            x: from.x + (target.x - from.x) * step / 12,
            y: from.y + (target.y - from.y) * step / 12 }] });
        await page.waitForTimeout(16);
    }
    expect(await page.evaluate(() => Game.dragState.active)).toBe(true);
    await expect.poll(() => page.evaluate(() => Game.dragState.hoverTarget === Game.player
        && Game.getDropTarget() === Game.player)).toBe(true);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(() => page.evaluate(() => Game.dragState.active)).toBe(false);
    expect(await page.evaluate(id => Game.dicePool.find(die => die.id === id)?.used, dieId)).toBe(false);
    expect(await page.evaluate(() => Game.player.shield)).toBe(0);
    } finally {
        await cdp.detach();
    }
});
