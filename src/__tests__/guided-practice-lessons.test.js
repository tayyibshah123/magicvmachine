import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
import { STATE, DICE_TYPES, PLAYER_CLASSES } from '../constants.js';
import { Breakout } from '../services/breakout.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { renderFor } from './helpers/combat-renderer.js';

const markup = readFileSync('index.html', 'utf8');

beforeEach(() => {
    setupCombatFixture({ profiles: ['cosmetics', 'ui', 'class-events', 'qte', 'renderer'] });
    document.documentElement.innerHTML = markup;
    document.getElementById('intro-overlay')?.remove();
    Game.canvas = document.getElementById('gameCanvas');
    Game.currentState = STATE.MENU;
    Game._modernPacing = true;
    Game._practiceSession = false;
    Game._menuPulseRaf = null;
    window.Game = Game;
    Object.assign(Breakout, { _active: false, _practice: false, _guided: false, _restorePractice: null, _advancing: false });
    vi.spyOn(Game, '_startMenuPulse').mockImplementation(() => {});
    vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    Game.startQTE.mockImplementation(async (type, x, y, callback) => {
        if (callback) await callback(1);
        return 1;
    });
    vi.spyOn(Breakout, '_setSpotlight').mockImplementation(() => {});
    vi.spyOn(Breakout, '_showStoryboard').mockImplementation((slate, done) => done());
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
});

afterEach(() => {
    Breakout.cancel({ returnToMenu: false });
    Hints.suspend();
    Unlocks.suspendAnnouncements();
    if (Hints._visibilityHandler) document.removeEventListener('visibilitychange', Hints._visibilityHandler);
    Hints._visibilityHandler = null;
    delete window.Game;
    delete window.__MVM_PROFILE_SCOPE__;
    vi.unstubAllGlobals();
    teardownCombatFixture();
});

async function use(type, target = Game.player) {
    const die = Game.dicePool.find(candidate => candidate.type === type && !candidate.used);
    expect(die, `unused ${type} in the forced hand`).toBeTruthy();
    Game.useDie(die, document.createElement('div'), target);
    await vi.advanceTimersByTimeAsync(1450);
    return die;
}

describe('lesson-specific reward-free drills', () => {
    it.each(PLAYER_CLASSES.map(cls => cls.id))('makes %s generate and actually spend two Mana on Earthquake', async classId => {
        const originalPlayer = Game.player;
        const completed = vi.fn(() => {
            expect(Game.player).toBe(originalPlayer);
            expect(Game._practiceSession).toBe(false);
            expect(Game.currentState).toBe(STATE.MENU);
        });
        localStorage.setItem('mvm_save_v1__A', '{"original":true}');
        Breakout.start(Game, { practiceLesson: 'resources', classId, onComplete: completed });
        const mana = PLAYER_CLASSES.find(cls => cls.id === classId).classDice.mana;
        expect(Game.player.mana).toBe(0);
        expect(Game.dicePool.filter(die => die.type === mana)).toHaveLength(2);
        expect(DICE_TYPES.EARTHQUAKE.cost).toBe(2);
        const skill = Game.dicePool.find(die => die.type === 'EARTHQUAKE');
        Game.useDie(skill, document.createElement('div'), Game.enemy);
        expect(skill.used).toBe(false);
        expect(Breakout._practiceActions.has('paid_skill')).toBe(false);
        await use(mana);
        if (Game.player.mana < 2) await use(mana);
        const before = Game.player.mana;
        const hp = Game.enemy.currentHp;
        await use('EARTHQUAKE', Game.enemy);
        expect(Game.player.mana).toBe(before - 2);
        expect(Game._manaSpentThisCombat).toBe(2);
        expect(Game.enemy.currentHp).toBeLessThan(hp);
        expect(Breakout._practiceActions.has('paid_skill')).toBe(true);
        expect(document.getElementById('tutorial-narration-action').textContent).toContain('Defeat the practice enemy');
        Game.enemy.currentHp = 0;
        const win = Game.winCombat();
        await vi.advanceTimersByTimeAsync(1800);
        await win;
        expect(completed).toHaveBeenCalledOnce();
        expect(localStorage.getItem('mvm_save_v1__A')).toBe('{"original":true}');
        expect(localStorage.getItem('mvm_breakout_done')).toBeNull();
    });

    it('does not count a free basic attack as resource practice or grant completion on an early kill', async () => {
        const complete = vi.fn();
        Breakout.start(Game, { practiceLesson: 'resources', onComplete: complete });
        await use('TAC_ATTACK', Game.enemy);
        Breakout.onCombatWin();
        expect(complete).not.toHaveBeenCalled();
        expect(Breakout.isActive()).toBe(true);
        expect(Game._practiceSession).toBe(true);
        expect(Game.player.mana).toBe(0);
        expect(Game.dicePool.some(die => die.type === 'EARTHQUAKE' && !die.used)).toBe(true);
    });

    it('uses a real hostile target and advances its instruction only after damage settles', async () => {
        Breakout.start(Game, { practiceLesson: 'hostile', classId: 'bloodstalker' });
        const hostile = Game.enemy.minions[0];
        expect(hostile.isPlayerSide).toBe(false);
        expect(hostile.currentHp).toBe(6);
        const mainHp = Game.enemy.currentHp;
        await use('BLD_ATTACK', hostile);
        expect(hostile.currentHp).toBe(0);
        expect(Game.enemy.currentHp).toBe(mainHp);
        expect(Breakout._practiceActions.has('hostile_removed')).toBe(true);
        expect(document.getElementById('tutorial-narration-action').textContent).toContain('Finish the main enemy');
    });

    it('repeats hostile-priority practice if the main enemy died while its minion survived', async () => {
        const complete = vi.fn();
        Breakout.start(Game, { practiceLesson: 'hostile', onComplete: complete });
        await use('TAC_ATTACK', Game.enemy);
        Breakout.onCombatWin();
        expect(complete).not.toHaveBeenCalled();
        expect(Game.enemy.minions[0].currentHp).toBe(6);
        expect(Breakout.isActive()).toBe(true);
    });

    it('lets the real enemy wave apply WEAK and records the status only once it is present', async () => {
        Breakout.start(Game, { practiceLesson: 'status' });
        expect(Game.player.effects.some(effect => effect.id === 'weak')).toBe(false);
        expect(Breakout._practiceActions.has('status')).toBe(false);
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(9500);
        await turn;
        expect(Game.player.effects.some(effect => effect.id === 'weak' && effect.duration > 0)).toBe(true);
        expect(Breakout._practiceActions.has('status')).toBe(true);
        expect(document.getElementById('tutorial-narration-action').textContent).toContain('Try ATTACK while WEAK');
        expect(Game.inputLocked).toBe(false);
    });

    it('requires an ally summon and a completed enemy phase, using the actual class minion', async () => {
        Breakout.start(Game, { practiceLesson: 'allies', classId: 'summoner' });
        await use('SUM_MINION');
        expect(Game.player.minions.some(minion => minion.isPlayerSide)).toBe(true);
        expect(Breakout._practiceActions.has('minion')).toBe(true);
        expect(Breakout._practiceActions.has('enemy_turn')).toBe(false);
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(12000);
        await turn;
        expect(Breakout._practiceActions.has('enemy_turn')).toBe(true);
        expect(Game.startQTE).toHaveBeenCalledWith('ATTACK', expect.any(Number), expect.any(Number), null,
            expect.objectContaining({ minionBoost: true, waves: 1,
                volleyBoost: expect.objectContaining({ base: expect.any(Number), good: expect.any(Number), perfect: expect.any(Number) }) }));
    });

    it('deals the full scripted three-hit barrage through real endTurn and rejects a one-action skip', async () => {
        const complete = vi.fn();
        Breakout.start(Game, { practiceLesson: 'multiwave', onComplete: complete });
        expect(Game.enemy.nextIntents[0]).toMatchObject({ type: 'multi_attack', hits: 3, val: 2 });
        Breakout.onCombatWin();
        expect(complete).not.toHaveBeenCalled();
        const turn = Game.endTurn();
        await renderFor(13000);
        await turn;
        const defensive = Game.startQTE.mock.calls.filter(args => args[0] === 'DEFEND');
        expect(defensive).toHaveLength(1);
        expect(defensive[0][4]).toMatchObject({ pattern: 'multi', waves: 3, incomingDamage: 6 });
        expect(Breakout._practiceActions.has('enemy_turn')).toBe(true);
        expect(Game._guidedRhythmPractice).toBe(true);
    });

    it('shows two real queued boss intents and keeps boss practice isolated on exit', () => {
        const originalPlayer = Game.player;
        const complete = vi.fn();
        Breakout.start(Game, { practiceLesson: 'boss', classId: 'sentinel', onComplete: complete });
        expect(Game.enemy.isBoss).toBe(true);
        expect(Game.enemy.nextIntents.map(intent => intent.type)).toEqual(['attack', 'shield']);
        expect(Game.dicePool.some(die => die.type === 'SEN_DEFEND')).toBe(true);
        Breakout.cancel();
        expect(Game.player).toBe(originalPlayer);
        expect(Game._guidedRhythmPractice).toBeFalsy();
        expect(complete).not.toHaveBeenCalled();
    });

    it('validates lesson names before replacing the current run', () => {
        const originalPlayer = Game.player;
        expect(() => Breakout.start(Game, { practiceLesson: 'unknown' })).toThrow('Unknown practice lesson');
        expect(Game.player).toBe(originalPlayer);
        expect(Game._practiceSession).toBe(false);
    });
});
