import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Player } from '../entities/player.js';
import { Minion } from '../entities/minion.js';
import { PLAYER_CLASSES, STATE } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { Hints } from '../services/hints.js';
import { Perf } from '../services/perf.js';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.body.innerHTML = '<div id="game-container"></div>';
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
        get: (target, key) => target[key] ?? (key === 'createLinearGradient' || key === 'createRadialGradient'
            ? () => gradient : () => {}),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    for (const method of ['createDamageText', 'createExplosion', 'createFloatingText', 'createShockwave', 'createSparks']) {
        vi.spyOn(ParticleSys, method).mockImplementation(() => {});
    }
    vi.spyOn(ParticleSys, '_acquire').mockImplementation(() => ({}));
    for (const method of ['playSound', 'playHit', 'playSting', 'duck']) {
        vi.spyOn(AudioMgr, method).mockImplementation(() => {});
    }
    for (const method of ['shake', 'shakeFromDamage', 'hitStop', 'triggerScreenFlash', 'haptic',
        'drawQTE', '_qteWindupAudio', '_checkHiddenLoreTriggers']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Game, '_isNewcomer').mockReturnValue(false);
    vi.spyOn(Hints, 'trigger').mockImplementation(() => {});
    vi.spyOn(Game, 'winCombat').mockImplementation(() => { Game.currentState = STATE.COMBAT_WIN; });
    vi.spyOn(Game, 'gameOver').mockImplementation(() => { Game.currentState = STATE.GAMEOVER; });
    Object.assign(Game, {
        ctx: context, effects: [], currentState: STATE.COMBAT, _combatGen: 1,
        _combatActionDepth: 0, _endTurnRunning: false, _winCombatRunning: false,
        inputLocked: false, paused: false, combatPaceMult: 1, godMode: false,
        autoQTE: false, qte: { active: false }, _archivistTurnExpired: false,
        metaUpgrades: [], metaToggledOff: new Set(), _disabledMetaThisRun: new Set(),
        _ascEffects: {}, _customDmgInMult: 1, assistDisabled: true,
        turnStats: null, runStats: null, _activeCombatPresentation: null,
        _settledCombatVfx: null, turnCount: 1, sector: 1
    });
    Game.player = new Player(PLAYER_CLASSES.find(c => c.id === 'summoner'));
    Game.player.classId = 'summoner';
    Game.player.maxHp = Game.player.currentHp = 100;
    Game.enemy = new Enemy({ name: 'Presentation target', hp: 100, dmg: 10 }, 0);
    Game.invalidateStackCache();
    Perf.tier = 'low';
});

afterEach(() => {
    for (const group of [...(Game._combatPresentations || [])]) group.finish(false);
    Game.clearTrackedTimers();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

async function renderFor(ms, fps = 30) {
    const start = Date.now();
    const frames = Math.floor(ms * fps / 1000);
    for (let frame = 1; frame <= frames; frame++) {
        await vi.advanceTimersByTimeAsync(start + Math.round(frame * 1000 / fps) - Date.now());
        if (!Game.paused && Game.currentState === STATE.COMBAT) Game.drawEffects();
    }
    if (Date.now() < start + ms) await vi.advanceTimersByTimeAsync(start + ms - Date.now());
}

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
        expect(Game.effects.find(effect => effect.type === 'nature_dart').progress).toBeCloseTo(0.612);
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

    it('releases an action after a bounded active-time fallback if its renderer is broken', async () => {
        const action = Game._runCombatAction(() => {},
            current => Game._presentCombatHits('nature_dart', Game.player, Game.enemy, 1, current));
        await vi.advanceTimersByTimeAsync(10100);
        await action;

        expect(Game.inputLocked).toBe(false);
        expect(Game._combatActionDepth).toBe(0);
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

    it('anchors the dart prompt at the actual firing minion', async () => {
        const minion = new Minion(260, 1080, 1, true);
        const action = Game._resolvePlayerMinionStrike(minion, Game.enemy);
        expect(Game.qte.attackerX).toBe(minion.x);
        expect(Game.qte.attackerY).toBe(minion.y);
        Game._combatGen++;
        await Game.resolveQTE('fail');
        await action;
    });
});
