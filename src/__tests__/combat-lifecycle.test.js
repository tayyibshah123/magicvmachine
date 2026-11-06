import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { STATE } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ClassAbility } from '../ui/class-ability.js';
import { Intel } from '../services/intel.js';
import { CombatRecap } from '../services/combat-recap.js';
import { ClassBriefing } from '../services/class-briefing.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { trackBrowserListeners } from './helpers/browser-events.js';

function makeEnemy(boss = false) {
    return new Enemy({ name: 'Lifecycle Test', hp: 100, dmg: 5,
        ...(boss ? { actionsPerTurn: 2 } : {}) }, 0);
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

beforeEach(() => {
    setupCombatFixture({ enemyTemplate: { name: 'Lifecycle Test', hp: 100, dmg: 5 },
        profiles: ['cosmetics', 'ui'] });
    for (const method of ['rollDice', '_resetRunCurrency', '_showVictoryTally', 'showCombatWin', 'saveGame', 'grantSparks']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(ClassAbility, 'endCombat').mockImplementation(() => {});
    vi.spyOn(ClassAbility, 'onTurnStart').mockImplementation(() => {});
    vi.spyOn(Intel, 'recordKill').mockImplementation(() => {});
});

afterEach(teardownCombatFixture);

describe('combat lifecycle cancellation', () => {
    it.each([0, 100])('keeps the previous map screen hidden after entering combat at %s ms', async delay => {
        const mapScreen = document.createElement('section');
        mapScreen.id = 'screen-map';
        mapScreen.className = 'screen hidden';
        mapScreen.innerHTML = '<button>Combat node</button>';
        document.getElementById('game-container').appendChild(mapScreen);
        vi.spyOn(Game, 'renderMap').mockImplementation(() => {});
        Game.currentState = STATE.MENU;

        Game.changeState(STATE.MAP);
        await vi.advanceTimersByTimeAsync(delay);
        Game.changeState(STATE.COMBAT);
        await vi.advanceTimersByTimeAsync(700);

        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(document.getElementById('hud').classList.contains('hidden')).toBe(false);
        expect(mapScreen.classList.contains('active')).toBe(false);
        expect(mapScreen.classList.contains('hidden')).toBe(true);
    });

    it('invalidates sleeping actions and resets presentation state on a real quit', () => {
        Game._combatActionDepth = 1;
        Game._endTurnRunning = true;
        Game._winCombatRunning = true;
        const callback = vi.fn();
        Game.setTimer(callback, 500);

        Game.quitRun();
        vi.advanceTimersByTime(500);

        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game._combatGen).toBe(11);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game._endTurnRunning).toBe(false);
        expect(Game._winCombatRunning).toBe(false);
        expect(callback).not.toHaveBeenCalled();
    });

    it('does not resume a player turn after quitting during its banner', async () => {
        const banner = deferred();
        Game.showPhaseBanner.mockReturnValueOnce(banner.promise);
        const turn = Game.startTurn();

        Game.quitRun();
        banner.resolve();
        await turn;

        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game.turnCount).toBe(3);
        expect(Game.rollDice).not.toHaveBeenCalled();
        expect(Game._recoverFromCombatError).not.toHaveBeenCalled();
    });

    it('does not mutate a replacement combat when an older turn banner resolves', async () => {
        const banner = deferred();
        Game.showPhaseBanner.mockReturnValueOnce(banner.promise);
        const turn = Game.startTurn();
        Game._combatGen++;
        Game.enemy = makeEnemy();
        Game.turnCount = 0;
        Game.inputLocked = true;
        Game._endTurnRunning = true;

        banner.resolve();
        await turn;

        expect(Game.turnCount).toBe(0);
        expect(Game.inputLocked).toBe(true);
        expect(Game._endTurnRunning).toBe(true);
        expect(Game.rollDice).not.toHaveBeenCalled();
    });

    it('leaves a pending attack presentation intact even after its damage is lethal', async () => {
        Game._combatActionDepth = 1;
        Game.enemy.currentHp = 0;
        const win = vi.spyOn(Game, 'winCombat');

        await Game.startTurn();

        expect(Game._combatActionDepth).toBe(1);
        expect(win).not.toHaveBeenCalled();
        expect(Game.showPhaseBanner).not.toHaveBeenCalled();
        expect(Game.rollDice).not.toHaveBeenCalled();
    });

    it('rejects End Turn before combat has prepared its opening hand', async () => {
        Game.turnCount = 0;
        Game.dicePool = [];
        Game._combatStartedAt = 0;
        Game.inputLocked = false;
        const banner = deferred();
        Game.showPhaseBanner.mockReturnValueOnce(banner.promise);
        const end = Game.endTurn();
        try {
            expect(Game.showPhaseBanner).not.toHaveBeenCalled();
            expect(Game._endTurnRunning).toBe(false);
        } finally {
            Game._combatGen++;
            banner.resolve();
            await end;
        }
    });

    it('locks real combat entry throughout briefing and prepares only its opening turn', async () => {
        const briefing = deferred();
        vi.spyOn(ClassBriefing, 'show').mockReturnValueOnce(briefing.promise);
        for (const method of ['startSectorAmbient', 'setSectorMusic']) {
            vi.spyOn(AudioMgr, method).mockImplementation(() => {});
        }
        const entry = Game.startCombat('combat');
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game.turnCount).toBe(0);
        expect(Game.inputLocked).toBe(true);
        await Game.endTurn();
        expect(Game.showPhaseBanner).not.toHaveBeenCalled();
        briefing.resolve();
        await vi.advanceTimersByTimeAsync(700);
        await entry;
        expect(Game.turnCount).toBe(1);
        expect(Game.inputLocked).toBe(false);
        expect(Game.rollDice).toHaveBeenCalledTimes(1);
    });

    it.each(['quit', 'replacement'])('settles an old manual QTE on %s without damaging or unlocking the next fight', async route => {
        for (const method of ['drawQTE', '_qteWindupAudio']) {
            vi.spyOn(Game, method).mockImplementation(() => {});
        }
        for (const method of ['startSectorAmbient', 'setSectorMusic']) {
            vi.spyOn(AudioMgr, method).mockImplementation(() => {});
        }
        const briefing = deferred();
        vi.spyOn(ClassBriefing, 'show').mockReturnValueOnce(briefing.promise);
        const oldEnemy = Game.enemy;
        const damage = vi.fn(() => oldEnemy.takeDamage(25, Game.player));
        const settled = vi.fn();
        const oldTiming = Game.startQTE('ATTACK', oldEnemy.x, oldEnemy.y, damage);
        oldTiming.then(settled);
        if (route === 'quit') {
            Game.quitRun();
            expect(Game.qte.active).toBe(false);
        }
        const entry = Game.startCombat('combat');
        expect(Game.qte.active).toBe(false);
        await vi.advanceTimersByTimeAsync(0);
        expect(settled).toHaveBeenCalledTimes(1);
        expect(damage).not.toHaveBeenCalled();
        expect(Game.inputLocked).toBe(true);
        briefing.resolve();
        await vi.advanceTimersByTimeAsync(1000);
        await entry;
        await oldTiming;
        expect(Game.turnCount).toBe(1);
        expect(Game.rollDice).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(false);
        expect(oldEnemy.currentHp).toBe(100);
        expect(damage).not.toHaveBeenCalled();
    });

    it('does not let a cancelled automatic QTE timer dismiss a newer prompt or entry lock', async () => {
        for (const method of ['drawQTE', '_qteWindupAudio']) {
            vi.spyOn(Game, method).mockImplementation(() => {});
        }
        for (const method of ['startSectorAmbient', 'setSectorMusic']) {
            vi.spyOn(AudioMgr, method).mockImplementation(() => {});
        }
        const briefing = deferred();
        vi.spyOn(ClassBriefing, 'show').mockReturnValueOnce(briefing.promise);
        Game.autoQTE = true;
        const oldDamage = vi.fn();
        const oldTiming = Game.startQTE('ATTACK', Game.enemy.x, Game.enemy.y, oldDamage);
        const entry = Game.startCombat('combat');
        Game.autoQTE = false;
        const newDamage = vi.fn();
        const replacement = Game.startQTE('DEFEND', Game.player.x, Game.player.y, newDamage);
        const replacementId = Game.qte.id;

        await vi.advanceTimersByTimeAsync(350);
        expect(Game.qte.id).toBe(replacementId);
        expect(Game.qte.active).toBe(true);
        expect(Game.inputLocked).toBe(true);
        expect(oldDamage).not.toHaveBeenCalled();
        expect(newDamage).not.toHaveBeenCalled();
        Game.quitRun();
        briefing.resolve();
        await entry;
        await oldTiming;
        await replacement;
        expect(newDamage).not.toHaveBeenCalled();
    });

    it('does not prepare a second hand while the same turn banner is pending', async () => {
        const banner = deferred();
        Game.showPhaseBanner.mockReturnValueOnce(banner.promise);
        const first = Game.startTurn();
        await Game.startTurn();
        expect(Game.showPhaseBanner).toHaveBeenCalledTimes(1);
        banner.resolve();
        await first;
        expect(Game.rollDice).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(false);
    });

    it('does not restore a stale startup lock after an older attack QTE finishes', async () => {
        Game.player.mana = 10;
        const die = { id: 1, type: 'EARTHQUAKE', used: false, selected: false };
        Game.dicePool = [die];
        for (const method of ['triggerVFX', 'drawQTE', '_qteWindupAudio']) {
            vi.spyOn(Game, method).mockImplementation(() => {});
        }
        Game.rollDice.mockRestore();
        const banner = deferred();
        Game.showPhaseBanner.mockReturnValueOnce(banner.promise);

        Game.useDie(die, document.createElement('div'), Game.enemy);
        expect(Game.qte.active).toBe(true);
        const turn = Game.startTurn();
        const resolution = Game.resolveQTE('good');
        expect(Game._combatActionDepth).toBe(1);
        banner.resolve();
        await turn;
        await vi.advanceTimersByTimeAsync(2000);
        await resolution;

        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game.player.currentHp).toBeGreaterThan(0);
        expect(Game.enemy.currentHp).toBeGreaterThan(0);
        expect(Game.qte.active).toBe(false);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game._endTurnRunning).toBe(false);
        expect(Game.inputLocked).toBe(false);
    });
});

describe('start-turn deaths', () => {
    it.each(['c_blood_pact', 'c_overclock', 'bleed'])('resolves lethal %s before rolling a hand', async id => {
        Game.player.currentHp = 1;
        if (id === 'bleed') Game.player.effects.push({ id, duration: 1, val: 2 });
        else Game.player.relics.push({ id });
        Game.invalidateStackCache();
        const death = vi.spyOn(Game, 'gameOver').mockImplementation(() => {
            Game.changeState(STATE.GAMEOVER);
        });

        await Game.startTurn();

        expect(Game.player.currentHp).toBe(0);
        expect(death).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.rollDice).not.toHaveBeenCalled();
    });

    it('settles a dead enemy instead of starting a locked turn after a revive', async () => {
        Game.enemy.currentHp = 0;
        const win = vi.spyOn(Game, 'winCombat').mockResolvedValue();

        await Game.startTurn();

        expect(win).toHaveBeenCalledTimes(1);
        expect(Game.showPhaseBanner).not.toHaveBeenCalled();
        expect(Game.rollDice).not.toHaveBeenCalled();
    });
});

describe('victory continuation ownership', () => {
    it('does not open an old recap when another combat has already reached its victory screen', () => {
        Game.showCombatWin.mockRestore();
        const recap = vi.spyOn(CombatRecap, 'show').mockResolvedValue();
        Game.showCombatWin({ frags: 15, droppedFile: false, wasBoss: false, wasElite: false, killName: 'Old enemy' });
        Game._combatGen++;
        const replacementPayload = { killName: 'New enemy' };
        Game._recapPayload = replacementPayload;

        vi.advanceTimersByTime(1100);

        expect(recap).not.toHaveBeenCalled();
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
        expect(Game._recapPayload).toBe(replacementPayload);
    });

    it('does not clear another combat recap or route it to rewards when an old recap closes', async () => {
        Game.showCombatWin.mockRestore();
        const closing = deferred();
        const recap = vi.spyOn(CombatRecap, 'show').mockReturnValue(closing.promise);
        Game.showCombatWin({ frags: 15, droppedFile: false, wasBoss: false, wasElite: false, killName: 'Old enemy' });
        vi.advanceTimersByTime(1100);
        expect(recap).toHaveBeenCalledTimes(1);
        Game._combatGen++;
        const replacementPayload = { killName: 'New enemy' };
        Game._recapPayload = replacementPayload;

        closing.resolve();
        await Promise.resolve();

        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
        expect(Game._recapPayload).toBe(replacementPayload);
    });

    it('does not award rewards after confirmed abandonment during a kill cinematic', async () => {
        Game.enemy.currentHp = 0;
        const pause = deferred();
        vi.spyOn(Game, 'sleep').mockReturnValueOnce(pause.promise);
        const win = Game.winCombat();

        vi.spyOn(window, 'confirm').mockReturnValue(true);
        Game.abandonRun();
        pause.resolve();
        await win;

        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game.techFragments).toBe(0);
        expect(Game.saveGame).not.toHaveBeenCalled();
        expect(Game.showCombatWin).not.toHaveBeenCalled();
    });

    it('does not clear a newer victory gate or award its boss rewards from an old dissolve', async () => {
        Game.enemy = makeEnemy(true);
        Game.enemy.currentHp = 0;
        const dissolve = deferred();
        vi.spyOn(Game, '_runBossDeathDissolve').mockReturnValueOnce(dissolve.promise);
        const win = Game.winCombat();
        Game._combatGen++;
        Game.enemy = makeEnemy(true);
        Game._winCombatRunning = true;

        dissolve.resolve();
        await win;

        expect(Game._winCombatRunning).toBe(true);
        expect(Game.grantSparks).not.toHaveBeenCalled();
        expect(Game.saveGame).not.toHaveBeenCalled();
        expect(Game.showCombatWin).not.toHaveBeenCalled();
    });
});

describe('browser visibility and audio integration', () => {
    let hidden;
    let cleanupListeners;
    let audio;

    beforeEach(() => {
        hidden = false;
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        audio = { ctx: AudioMgr.ctx, bgm: AudioMgr.bgm, musicEnabled: AudioMgr.musicEnabled,
            wasPlaying: AudioMgr._wasPlaying };
        AudioMgr.ctx = { state: 'suspended', resume: vi.fn().mockResolvedValue() };
        AudioMgr.bgm = { paused: false };
        AudioMgr.musicEnabled = true;
        AudioMgr._wasPlaying = false;
        Game._audioResumeArmed = false;
        vi.spyOn(AudioMgr, 'fadeMusicOut').mockImplementation(() => {});
        vi.spyOn(AudioMgr, 'fadeMusicIn').mockImplementation(() => {});
        cleanupListeners = trackBrowserListeners();
        Game.bindTabVisibility();
    });

    afterEach(() => {
        cleanupListeners();
        Object.assign(AudioMgr, { ctx: audio.ctx, bgm: audio.bgm,
            musicEnabled: audio.musicEnabled, _wasPlaying: audio.wasPlaying });
        Game._audioResumeArmed = false;
    });

    function visibility(value) {
        hidden = value;
        document.dispatchEvent(new Event('visibilitychange'));
    }

    it('saves and pauses a hidden combat, then waits for an explicit resume touch', async () => {
        visibility(true);
        expect(Game.paused).toBe(true);
        expect(Game.saveGame).toHaveBeenCalledTimes(1);
        expect(AudioMgr.fadeMusicOut).toHaveBeenCalledWith(250);
        visibility(false);
        const overlay = document.getElementById('pause-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.classList.contains('hidden')).toBe(false);
        expect(Game.paused).toBe(true);
        expect(AudioMgr.ctx.resume).toHaveBeenCalledTimes(1);
        expect(AudioMgr.fadeMusicIn).not.toHaveBeenCalled();
        window.dispatchEvent(new Event('pointerdown'));
        window.dispatchEvent(new Event('keydown'));
        expect(AudioMgr.ctx.resume).toHaveBeenCalledTimes(2);
        const leakedTouch = vi.fn();
        document.addEventListener('touchstart', leakedTouch);
        overlay.dispatchEvent(new Event('touchstart', { bubbles: true }));
        expect(leakedTouch).not.toHaveBeenCalled();
        expect(Game.paused).toBe(false);
        expect(AudioMgr.fadeMusicIn).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(300);
        expect(overlay.classList.contains('hidden')).toBe(true);
    });

    it('resumes the map without a combat gate and flushes pagehide only during an active run', () => {
        Game.currentState = STATE.MAP;
        visibility(true);
        visibility(false);
        expect(Game.paused).toBe(false);
        expect(document.getElementById('pause-overlay')).toBeNull();
        expect(AudioMgr.fadeMusicIn).toHaveBeenCalledTimes(1);
        expect(Game.saveGame).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new Event('pagehide'));
        expect(Game.saveGame).toHaveBeenCalledTimes(2);
        Game.currentState = STATE.MENU;
        window.dispatchEvent(new Event('pagehide'));
        expect(Game.saveGame).toHaveBeenCalledTimes(2);
    });

    it('rearms interrupted audio on pageshow without duplicating the next-gesture listener', () => {
        window.dispatchEvent(new Event('pageshow'));
        window.dispatchEvent(new Event('pageshow'));
        expect(AudioMgr.ctx.resume).toHaveBeenCalledTimes(2);
        window.dispatchEvent(new Event('touchstart'));
        window.dispatchEvent(new Event('click'));
        expect(AudioMgr.ctx.resume).toHaveBeenCalledTimes(3);
        expect(Game._audioResumeArmed).toBe(false);
    });
});
