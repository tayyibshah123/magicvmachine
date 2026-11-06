import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { STATE } from '../constants.js';
import { Hints } from '../services/hints.js';
import { Perf } from '../services/perf.js';
import { ClassAbility } from '../ui/class-ability.js';
import { setupCombatFixture, teardownCombatFixture, stubClassEvents, stubCombatUI,
    stubTerminalServices } from './helpers/combat-fixture.js';
import { renderFor, renderFrames } from './helpers/combat-renderer.js';
import { trackBrowserListeners } from './helpers/browser-events.js';

beforeEach(() => {
    setupCombatFixture({ classId: 'tactician',
        enemyTemplate: { name: 'Presentation target', hp: 100, dmg: 10 },
        game: { turnCount: 1 }, profiles: ['cosmetics', 'renderer', 'terminal-observers'] });
    for (const method of ['drawQTE', '_qteWindupAudio']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Hints, 'trigger').mockImplementation(() => {});
    Perf.tier = 'low';
});

afterEach(teardownCombatFixture);

describe('rendered combat presentation completion', () => {
    it.each([0.6, 1, 2])('finishes a lethal dart at 30 FPS with pace %s before victory', async pace => {
        Game.combatPaceMult = pace;
        const enemy = Game.enemy;
        const source = { x: 260, y: 1080 };
        const damage = vi.spyOn(enemy, 'takeDamage');
        const action = Game._runCombatAction(() => enemy.takeDamage(200, Game.player),
            current => Game._presentCombatHits('nature_dart', source, enemy, 1, current, { settledDamage: true }));
        await vi.advanceTimersByTimeAsync(0);
        await renderFor(1200);

        expect(enemy.currentHp).toBe(0);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game.effects.find(effect => effect.type === 'nature_dart').progress).toBeGreaterThan(0);
        expect(Game.effects.find(effect => effect.type === 'nature_dart').progress).toBeLessThan(1);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(Game.inputLocked).toBe(true);
        await renderFor(1000);
        await action;

        expect(Game.effects.some(effect => effect.type === 'nature_dart')).toBe(false);
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(damage).toHaveBeenCalledTimes(1);
    });

    it('holds a lethal enemy laser until it reaches the player at 30 FPS', async () => {
        const enemy = Game.enemy;
        const player = Game.player;
        player.currentHp = 10;
        const action = Game._runCombatAction(() => player.takeDamage(200, enemy),
            current => Game._presentCombatHits('micro_laser', { x: 260, y: 550 }, player, 1,
                current, { settledDamage: true }));
        await vi.advanceTimersByTimeAsync(0);
        await renderFor(1200);

        expect(Game.effects.some(effect => effect.type === 'micro_laser')).toBe(true);
        expect(Game.gameOver).not.toHaveBeenCalled();
        await renderFor(700);
        await action;

        expect(Game.effects.some(effect => effect.type === 'micro_laser')).toBe(false);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
    });

    it('renders all three Tesseract strikes and their delayed tails before a lethal outcome', async () => {
        const enemy = Game.enemy;
        const player = Game.player;
        player.currentHp = 10;
        const visual = vi.spyOn(Game, 'triggerVFX');
        const action = Game._runCombatAction(() => player.takeDamage(300, enemy),
            current => Game._presentCombatHits('reality_shift_strike', enemy, player, 3, current));
        await vi.advanceTimersByTimeAsync(0);
        expect(player.currentHp).toBe(0);
        await renderFor(1600);

        expect(visual).toHaveBeenCalledTimes(3);
        expect(visual.mock.calls.every(call => call[3] === null)).toBe(true);
        expect(Game.effects.some(effect => effect.type === 'slash')).toBe(true);
        expect(Game.gameOver).not.toHaveBeenCalled();
        await renderFor(1400);
        await action;

        expect(Game.effects).toHaveLength(0);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
    });

    it('does not spend a paused interval or discard a partly rendered dart on resume', async () => {
        const enemy = Game.enemy;
        const action = Game._runCombatAction(() => enemy.takeDamage(200, Game.player),
            current => Game._presentCombatHits('nature_dart', Game.player, enemy, 1, current));
        await vi.advanceTimersByTimeAsync(0);
        await renderFor(100, 60);
        const progress = Game.effects[0].progress;
        Game.paused = true;
        await vi.advanceTimersByTimeAsync(60000);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(Game.effects[0].progress).toBe(progress);
        Game.paused = false;
        await vi.advanceTimersByTimeAsync(200);
        expect(Game.winCombat).not.toHaveBeenCalled();
        await renderFor(1500, 60);
        await action;

        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(Game.effects.some(effect => effect.type === 'nature_dart')).toBe(false);
    });

    it('freezes delayed child spawns and wall-clock travel while paused', async () => {
        const current = () => Game.currentState === STATE.COMBAT;
        const presentation = Game._presentCombatHits('compiler_smash', Game.enemy, Game.player, 1, current);
        await renderFor(600);
        const smash = Game.effects.find(effect => effect.type === 'compiler_smash');
        expect(smash).toBeDefined();
        const travelBeforePause = performance.now() - smash.startMs;
        Game.paused = true;
        await vi.advanceTimersByTimeAsync(30000);
        Game.paused = false;
        await vi.advanceTimersByTimeAsync(20);

        expect(performance.now() - smash.startMs).toBe(travelBeforePause);
        expect(Game.effects.some(effect => effect.type === 'compiler_crack')).toBe(false);
        await renderFor(2200);
        await presentation;
        expect(Game.effects.some(effect => effect.type === 'compiler_crack')).toBe(false);
    });

    it('keeps a rendered lethal action paused across real visibility events without background timer delivery', async () => {
        let hidden = false;
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        vi.spyOn(Game, 'saveGame').mockImplementation(() => {});
        const presentationVisibilityWasBound = Game._presentationVisibilityBound;
        const cleanup = trackBrowserListeners();
        try {
            Game.bindTabVisibility();
            const enemy = Game.enemy;
            const action = Game._runCombatAction(() => enemy.takeDamage(200, Game.player),
                current => Game._presentCombatHits('compiler_smash', Game.player, enemy, 1, current));
            await renderFor(600);
            const smash = Game.effects.find(effect => effect.type === 'compiler_smash');
            const travel = performance.now() - smash.startMs;
            hidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
            vi.setSystemTime(Date.now() + 60000);
            hidden = false;
            document.dispatchEvent(new Event('visibilitychange'));
            expect(Game.paused).toBe(true);
            expect(Game.winCombat).not.toHaveBeenCalled();
            expect(performance.now() - smash.startMs).toBe(travel);
            document.getElementById('pause-overlay').dispatchEvent(new Event('touchstart', { bubbles: true }));
            expect(Game.paused).toBe(false);
            await renderFor(2500);
            await action;
            expect(Game.effects).toHaveLength(0);
            expect(Game.winCombat).toHaveBeenCalledTimes(1);
        } finally {
            cleanup();
            Game._audioResumeArmed = false;
            if (!presentationVisibilityWasBound) Game._presentationVisibilityBound = false;
        }
    });

    it('cancels old groups and pending child spawns when the combat generation changes', async () => {
        const gen = Game._combatGen;
        const visual = Game._presentCombatHits('reality_shift_strike', Game.enemy, Game.player, 3,
            () => Game._combatGen === gen);
        await vi.advanceTimersByTimeAsync(100);
        Game._combatGen++;
        Game.effects = [];
        await vi.advanceTimersByTimeAsync(2000);
        await visual;

        expect(Game.effects).toHaveLength(0);
        expect(Game._combatPresentations.size).toBe(0);
    });

    it('finishes every committed strike under dropped and uneven frames before victory', async () => {
        const enemy = Game.enemy;
        const visual = vi.spyOn(Game, 'triggerVFX');
        const action = Game._runCombatAction(() => enemy.takeDamage(200, Game.player),
            current => Game._presentCombatHits('reality_shift_strike', Game.player, enemy, 3, current));
        await vi.advanceTimersByTimeAsync(0);
        await renderFrames(Array.from({ length: 8 }, () => [33, 33, 100, 16]).flat());
        expect(visual).toHaveBeenCalledTimes(3);
        expect(Game.effects.length).toBeGreaterThan(0);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(Game.inputLocked).toBe(true);
        await renderFrames(Array.from({ length: 30 }, () => [16, 50, 33, 100]).flat());
        await action;
        expect(Game.effects).toHaveLength(0);
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
    });

    it('keeps nested presentation ownership through a pause and releases the outer action once', async () => {
        const enemy = Game.enemy;
        const action = Game._runCombatAction(() => Game._runCombatAction(
            () => enemy.takeDamage(200, Game.player),
            current => Game._presentCombatHits('compiler_smash', Game.player, enemy, 1, current)));
        await renderFor(600);
        const smash = Game.effects.find(effect => effect.type === 'compiler_smash');
        expect(smash).toBeDefined();
        expect(Game._combatActionDepth).toBe(2);
        const travel = performance.now() - smash.startMs;
        Game.paused = true;
        await vi.advanceTimersByTimeAsync(30000);
        Game.paused = false;
        await vi.advanceTimersByTimeAsync(20);
        expect(performance.now() - smash.startMs).toBe(travel);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(Game.inputLocked).toBe(true);
        await renderFor(2500);
        await action;
        expect(Game.effects).toHaveLength(0);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(false);
    });

    it('does not let an earlier surviving support visual release a later lethal action', async () => {
        stubCombatUI();
        const defence = { id: 1, type: 'TAC_DEFEND', used: false };
        Game.dicePool = [defence];
        Game.useDie(defence, document.createElement('div'), Game.player);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.inputLocked).toBe(false);
        expect(Game.effects.some(effect => effect.type === 'hex_barrier')).toBe(true);
        const enemy = Game.enemy;
        const damage = vi.spyOn(enemy, 'takeDamage');
        const attack = Game._runCombatAction(() => enemy.takeDamage(200, Game.player),
            current => Game._presentCombatHits('reality_shift_strike', Game.player, enemy, 3, current));
        await renderFor(1800);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(Game.effects.some(effect => effect.type === 'hex_barrier')).toBe(false);
        expect(Game.effects.length).toBeGreaterThan(0);
        expect(Game.inputLocked).toBe(true);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(damage).toHaveBeenCalledTimes(1);
        await renderFor(1000);
        await attack;
        expect(Game.effects).toHaveLength(0);
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(damage).toHaveBeenCalledTimes(1);
    });

    it('finishes an earlier real defence barrier before a following automatic lethal attack exits combat', async () => {
        stubCombatUI();
        stubTerminalServices();
        stubClassEvents();
        Game.winCombat.mockRestore();
        Game.autoQTE = true;
        Game.enemy.currentHp = 1;
        const defence = { id: 1, type: 'TAC_DEFEND', used: false };
        const attack = { id: 2, type: 'TAC_ATTACK', used: false };
        Game.dicePool = [defence, attack];
        Game.useDie(defence, document.createElement('div'), Game.player);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.inputLocked).toBe(false);
        Game.useDie(attack, document.createElement('div'), Game.enemy);
        await renderFor(1600);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.effects.some(effect => effect.type === 'hex_barrier')).toBe(true);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        await renderFor(600);
        expect(Game.effects).toHaveLength(0);
        expect(ClassAbility.endCombat).toHaveBeenCalledTimes(1);
    });

    it('releases an action after a bounded active-time fallback if its renderer is broken', async () => {
        const action = Game._runCombatAction(() => {},
            current => Game._presentCombatHits('nature_dart', Game.player, Game.enemy, 1, current));
        await vi.advanceTimersByTimeAsync(10100);
        await action;

        expect(Game.inputLocked).toBe(false);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game._combatPresentations.size).toBe(0);
    });

    it('cancels a terminal wait on an older support group without unlocking its replacement encounter', async () => {
        stubCombatUI();
        const defence = { id: 1, type: 'TAC_DEFEND', used: false };
        Game.dicePool = [defence];
        Game.useDie(defence, document.createElement('div'), Game.player);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.effects.some(effect => effect.type === 'hex_barrier')).toBe(true);
        const oldEnemy = Game.enemy;
        const action = Game._runCombatAction(() => oldEnemy.takeDamage(200, Game.player), () => {});
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.inputLocked).toBe(true);
        expect(Game.winCombat).not.toHaveBeenCalled();

        Game._combatGen++;
        Game.enemy = new Enemy({ name: 'Replacement', hp: 100, dmg: 5 }, 0);
        Game.effects = [];
        Game._combatActionDepth = 1;
        Game.inputLocked = true;
        await vi.advanceTimersByTimeAsync(40);
        await action;
        expect(Game.enemy.currentHp).toBe(100);
        expect(Game.inputLocked).toBe(true);
        expect(Game._combatActionDepth).toBe(1);
        expect(Game.winCombat).not.toHaveBeenCalled();
        expect(Game._combatPresentations.size).toBe(0);
    });
});

describe('short mobile timing prompts', () => {
    it('accepts the low-tier wider-window good tap at the first valid rendered frame', async () => {
        Game.qteWiderWindow = true;
        const qte = Game.startQTE('DEFEND', Game.player.x, Game.player.y, null,
            { shortTiming: true, pattern: 'steady' });
        for (let frame = 0; frame < 17; frame++) {
            Game.inputCooldown -= 1 / 30;
            Game.updateQTE(1 / 30);
        }
        expect(Game.qte.phase).toBe('active');
        expect(Math.abs(Game.qte.radius - 30)).toBeLessThanOrEqual(40.5);
        Game.checkQTE();

        expect(await qte).toBe(0.6);
    });
});
