import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Player } from '../entities/player.js';
import { PLAYER_CLASSES, STATE } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { ClassAbility } from '../ui/class-ability.js';
import { Intel } from '../services/intel.js';
import { CombatRecap } from '../services/combat-recap.js';

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
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    document.body.innerHTML = `
        <div id="game-container"><div id="screen-flash"></div></div>
        <div id="dice-container"></div><div id="reroll-badge"></div>
        <div id="hud"></div><div id="screen-combat-win" class="screen"></div>
        <div id="modal-settings" class="hidden"></div>
        <button id="btn-end-turn"></button>
    `;
    localStorage.clear();
    Object.assign(Game, {
        currentState: STATE.COMBAT, turnCount: 3, sector: 1,
        _combatGen: 10, _combatActionDepth: 0, _combatStartedAt: 0,
        _endTurnRunning: false, _winCombatRunning: false, _resolvingSelfDestruct: false,
        inputLocked: false, paused: false, godMode: false, assistDisabled: true,
        challengeMode: false, archiveMode: false,
        _ascEffects: {}, metaUpgrades: [], metaToggledOff: new Set(),
        _disabledMetaThisRun: new Set(), _customDmgInMult: 1,
        runStats: null, turnStats: null, effects: [], _activeSectorMech: null,
        deadMinionsThisTurn: 0, sealedDie: null, techFragments: 0,
        player: null, enemy: null
    });
    for (const method of ['createDamageText', 'createExplosion', 'createFloatingText',
        'createShockwave', 'createSparks', 'clear']) {
        vi.spyOn(ParticleSys, method).mockImplementation(() => {});
    }
    for (const method of ['playSound', 'playHit', 'playSting', 'duck',
        'stopSectorAmbient', 'clearSectorMusic', 'startMusic']) {
        vi.spyOn(AudioMgr, method).mockImplementation(() => {});
    }
    for (const method of ['shake', 'shakeFromDamage', 'hitStop', 'triggerScreenFlash',
        'haptic', '_checkHiddenLoreTriggers', 'rollDice', 'updateHUD', 'renderRelics',
        '_renderPactPills', '_resetRunCurrency', '_showVictoryTally', 'showCombatWin',
        'saveGame', 'grantSparks']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Game, 'showPhaseBanner').mockResolvedValue();
    vi.spyOn(Game, '_isNewcomer').mockReturnValue(false);
    vi.spyOn(Game, '_recoverFromCombatError').mockImplementation((where, error) => { throw error; });
    vi.spyOn(ClassAbility, 'endCombat').mockImplementation(() => {});
    vi.spyOn(ClassAbility, 'onTurnStart').mockImplementation(() => {});
    vi.spyOn(Intel, 'recordKill').mockImplementation(() => {});
    Game.player = new Player(PLAYER_CLASSES.find(c => c.id === 'tactician'));
    Game.player.classId = 'tactician';
    Game.player.maxHp = 100;
    Game.player.currentHp = 100;
    Game.enemy = makeEnemy();
    Game.invalidateStackCache();
});

afterEach(() => {
    Game.clearTrackedTimers();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});

describe('combat lifecycle cancellation', () => {
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

    it('does not award rewards after quitting during a kill cinematic', async () => {
        Game.enemy.currentHp = 0;
        const pause = deferred();
        vi.spyOn(Game, 'sleep').mockReturnValueOnce(pause.promise);
        const win = Game.winCombat();

        Game.quitRun();
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
