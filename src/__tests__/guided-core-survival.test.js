import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
import { STATE, PLAYER_CLASSES } from '../constants.js';
import { Breakout } from '../services/breakout.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { ClassAbility } from '../ui/class-ability.js';
import { Learning } from '../services/learning.js';
import { setupCombatFixture, teardownCombatFixture, createCombatPlayer } from './helpers/combat-fixture.js';

const markup = readFileSync('index.html', 'utf8');
const cases = PLAYER_CLASSES.flatMap(cls => ['good', 'perfect'].flatMap(quality =>
    [0, 1].flatMap(roomIndex => [false, true].map(baseCrit => [cls.id, quality, roomIndex, baseCrit]))));

beforeEach(() => {
    setupCombatFixture({ profiles: ['cosmetics', 'ui', 'renderer'] });
    document.documentElement.innerHTML = markup;
    document.getElementById('intro-overlay')?.remove();
    Game.canvas = document.getElementById('gameCanvas');
    Game.currentState = STATE.MENU;
    Game._modernPacing = true;
    Game._practiceSession = false;
    Game._guidedRun = null;
    Game.momentum = 0;
    Game._momentumApexArmed = false;
    Game._momentumTriggeredThisTurn = false;
    Game._menuPulseRaf = null;
    window.Game = Game;
    ClassAbility.endCombat();
    Learning.init();
    Object.assign(Breakout, { _active: false, _practice: false, _guided: false, _restorePractice: null, _advancing: false });
    vi.spyOn(Game, '_startMenuPulse').mockImplementation(() => {});
    vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    vi.spyOn(Breakout, '_setSpotlight').mockImplementation(() => {});
    vi.spyOn(Breakout, '_showStoryboard').mockImplementation((slate, done) => done());
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
});

afterEach(() => {
    Breakout.cancel({ returnToMenu: false });
    ClassAbility.endCombat();
    Hints.suspend();
    Unlocks.suspendAnnouncements();
    if (Hints._visibilityHandler) document.removeEventListener('visibilitychange', Hints._visibilityHandler);
    Hints._visibilityHandler = null;
    delete window.Game;
    delete Game._onGuidedCoreComplete;
    vi.unstubAllGlobals();
    teardownCombatFixture();
});

async function tick(ms, quality) {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        if (Game.qte.active) Game.resolveQTE(quality);
        await vi.advanceTimersByTimeAsync(Math.min(50, ms - elapsed));
        if (Game.currentState === STATE.BREAKOUT) Game.drawEffects();
    }
}

async function use(type, target, quality) {
    const die = Game.dicePool.find(candidate => candidate.type === type && !candidate.used);
    expect(die, `unused ${type}`).toBeTruthy();
    Game.useDie(die, document.createElement('div'), target);
    await tick(1600, quality);
}

describe('guided core opening and completion', () => {
    it.each(cases)('%s %s opening in room %s with base crit %s preserves a real enemy phase before core completion', async (classId, quality, roomIndex, baseCrit) => {
        createCombatPlayer(classId);
        // The ordinary 15% critical roll is independent of timing quality.
        // Cover both real damage branches without making suite order or RNG
        // decide whether a first-time player gets an enemy phase.
        vi.spyOn(Game, '_luckyChance').mockReturnValue(baseCrit);
        Game._guidedRun = Learning.createRun(classId);
        const attackTurns = new Map();
        const useDie = Game.useDie;
        vi.spyOn(Game, 'useDie').mockImplementation(function (die, el, target) {
            if (Game._dieSlot(die.type) === 'attack') {
                if (!attackTurns.has(target)) attackTurns.set(target, new Set());
                attackTurns.get(target).add(Game.turnCount);
            }
            return useDie.call(this, die, el, target);
        });
        const complete = Game._onGuidedCoreComplete = vi.fn();
        Breakout.start(Game, { guided: true, progress: { roomIndex, actions: [] } });
        const enemy = Game.enemy;
        const damage = vi.spyOn(enemy, 'takeDamage');
        const cd = PLAYER_CLASSES.find(cls => cls.id === classId).classDice;
        if (classId === 'summoner') await use(cd.minion, Game.player, quality);
        await use(cd.defend, Game.player, quality);
        await use(cd.attack, enemy, quality);
        expect(Game.enemy, 'the attack must not reset the teaching room').toBe(enemy);
        expect(enemy.currentHp, `the opening attack must leave a real enemy action (HP ${enemy.maxHp}; incoming ${damage.mock.calls.map(call => call[0]).join(', ')})`).toBeGreaterThan(0);
        expect(Breakout._coreActions.has('enemy_turn')).toBe(false);
        const turn = Game.endTurn();
        await tick(10000, quality);
        await turn;
        expect(Game.enemy, 'the first friendly volley must not reset the teaching room').toBe(enemy);
        expect(Breakout._coreActions.has('enemy_turn')).toBe(true);
        expect(complete).not.toHaveBeenCalled();
        for (let turns = 0; turns < 32 && !complete.mock.calls.length; turns++) {
            for (const die of [...Game.dicePool]) {
                if (complete.mock.calls.length || !Breakout.isActive()) break;
                if (die.used) continue;
                const slot = Game._dieSlot(die.type);
                Game.useDie(die, document.createElement('div'), slot === 'attack' ? Game.enemy : Game.player);
                await tick(1600, quality);
            }
            if (!complete.mock.calls.length && Breakout.isActive()) {
                const next = Game.endTurn();
                await tick(10000, quality);
                await next;
            }
        }
        expect(complete).toHaveBeenCalledTimes(1);
        expect(Breakout.isActive()).toBe(false);
        expect(Game._guidedRhythmPractice).toBe(false);
        if (quality === 'good') {
            for (const turns of attackTurns.values()) expect(turns.size, 'Good core pacing stays within four attack turns per room').toBeLessThanOrEqual(4);
        }
    }, 15000);

    it('introduces the core Spirit automatic strike without promising a locked timing boost', () => {
        createCombatPlayer('summoner');
        Breakout.start(Game, { guided: true });
        const instruction = Breakout._room.sequence.find(beat => beat.wait === 'die_used:minion');
        expect(instruction.story).toContain('attacks automatically');
        expect(instruction.action).toContain('later lesson');
        expect(instruction.action).not.toContain('short timing prompt');
    });
});
