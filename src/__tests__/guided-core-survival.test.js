import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
import { STATE, PLAYER_CLASSES } from '../constants.js';
import { Breakout } from '../services/breakout.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { ClassAbility } from '../ui/class-ability.js';
import { setupCombatFixture, teardownCombatFixture, createCombatPlayer } from './helpers/combat-fixture.js';

const markup = readFileSync('index.html', 'utf8');
const cases = PLAYER_CLASSES.flatMap(cls => ['good', 'perfect'].flatMap(quality => [0, 1].map(roomIndex => [cls.id, quality, roomIndex])));

beforeEach(() => {
    setupCombatFixture({ profiles: ['cosmetics', 'ui', 'renderer'] });
    document.documentElement.innerHTML = markup;
    document.getElementById('intro-overlay')?.remove();
    Game.canvas = document.getElementById('gameCanvas');
    Game.currentState = STATE.MENU;
    Game._modernPacing = true;
    Game._practiceSession = false;
    Game._guidedRun = null;
    Game._menuPulseRaf = null;
    window.Game = Game;
    ClassAbility.endCombat();
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
    it.each(cases)('%s %s opening in room %s preserves a real enemy phase before core completion', async (classId, quality, roomIndex) => {
        createCombatPlayer(classId);
        const complete = Game._onGuidedCoreComplete = vi.fn();
        Breakout.start(Game, { guided: true, progress: { roomIndex, actions: [] } });
        const enemy = Game.enemy;
        const cd = PLAYER_CLASSES.find(cls => cls.id === classId).classDice;
        if (classId === 'summoner') await use(cd.minion, Game.player, quality);
        await use(cd.defend, Game.player, quality);
        await use(cd.attack, enemy, quality);
        expect(Game.enemy, 'the attack must not reset the teaching room').toBe(enemy);
        expect(enemy.currentHp, 'the opening attack must leave a real enemy action').toBeGreaterThan(0);
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
