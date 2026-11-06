import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Minion } from '../entities/minion.js';
import { BOSS_DATA, STATE } from '../constants.js';
import { ClassAbility } from '../ui/class-ability.js';

let visuals;
let storedCallbacks;

function makeEnemy() {
    return new Enemy({ name: 'Action Test', hp: 100, dmg: 20 }, 0);
}

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function tripleAttack() {
    const enemy = new Enemy(BOSS_DATA[1], 0);
    enemy.phase = 3;
    enemy.nextIntents = [{ type: 'multi_attack', hits: 3, val: 20, effectiveVal: 20, target: Game.player }];
    Game.enemy = enemy;
    return enemy;
}

beforeEach(() => {
    setupCombatFixture({
        enemyTemplate: { name: 'Action Test', hp: 100, dmg: 20 },
        profiles: ['cosmetics', 'ui', 'terminal-services', 'class-events', 'qte']
    });
    Game.player.mana = 10;
    vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
    visuals = [];
    storedCallbacks = [];
    vi.spyOn(Game, 'triggerVFX').mockImplementation((type, source, target, callback) => {
        visuals.push({ type, source, target, playerHp: Game.player.currentHp, enemyHp: Game.enemy?.currentHp });
        if (typeof callback === 'function') storedCallbacks.push(callback);
    });
});

afterEach(teardownCombatFixture);


describe('settled action helpers', () => {
    it('resolves callback-backed damage synchronously and queues a pure visual', async () => {
        // Exercise the real VFX entry: it separates its logical callback
        // from the later visual descriptor while an action is settling.
        Game.triggerVFX.mockRestore();
        const enemy = Game.enemy;
        const damageCallback = vi.fn(() => enemy.takeDamage(5, Game.player));
        const action = Game._runCombatAction(() => {
            enemy.takeDamage(10, Game.player);
            Game.triggerVFX('orbital_strike', Game.player, enemy, damageCallback);
        });

        expect(enemy.currentHp).toBe(85);
        expect(damageCallback).toHaveBeenCalledTimes(1);
        expect(Game.effects).toHaveLength(0);
        expect(Game._combatActionDepth).toBe(1);
        expect(Game.inputLocked).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.effects).toHaveLength(1);
        expect(Game.effects[0].type).toBe('orbital_strike');
        const visualEffect = Game.effects[0];
        // Replaying an impact cannot apply the original damage a second time.
        visualEffect.onHit();
        expect(enemy.currentHp).toBe(85);
        await vi.runAllTimersAsync();
        await action;

        visualEffect.onHit();
        expect(damageCallback).toHaveBeenCalledTimes(1);
        expect(enemy.currentHp).toBe(85);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game.inputLocked).toBe(false);
    });

    it('presents all committed hits before a lethal action awards victory', async () => {
        const enemy = Game.enemy;
        enemy.currentHp = 5;
        const action = Game._runCombatAction(() => enemy.takeDamage(10, Game.player),
            current => Game._presentCombatHits('test_strike', Game.player, enemy, 3, current));
        await vi.advanceTimersByTimeAsync(0);

        expect(enemy.currentHp).toBe(0);
        expect(visuals).toHaveLength(1);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(400);
        expect(visuals).toHaveLength(3);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        await action;

        expect(Game.showCombatWin).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
        expect(storedCallbacks).toHaveLength(0);
    });

    it('cancels remaining visuals on quit without unlocking a replacement action', async () => {
        const source = Game.player;
        const target = Game.enemy;
        const action = Game._runCombatAction(() => target.takeDamage(5, source),
            current => Game._presentCombatHits('test_strike', source, target, 3, current));
        await vi.advanceTimersByTimeAsync(0);
        expect(visuals).toHaveLength(1);
        Game.quitRun();
        Game._combatGen++;
        Game.currentState = STATE.COMBAT;
        Game.enemy = makeEnemy();
        Game._combatActionDepth = 1;
        Game.inputLocked = true;

        await vi.runAllTimersAsync();
        await action;

        expect(visuals).toHaveLength(1);
        expect(Game._combatActionDepth).toBe(1);
        expect(Game.inputLocked).toBe(true);
        expect(Game.enemy.currentHp).toBe(100);
    });

    it('waits until the presentation finishes before honoring an expired turn', async () => {
        const gate = deferred();
        const end = vi.spyOn(Game, 'endTurn').mockResolvedValue();
        Game._archivistTurnExpired = true;
        Game._archivistClockEnemy = Game.enemy;
        Game._archivistClockGen = Game._combatGen;
        const action = Game._runCombatAction(() => Game.enemy.takeDamage(5, Game.player), () => gate.promise);

        expect(Game._tryResolveExpiredTurn()).toBe(false);
        expect(end).not.toHaveBeenCalled();
        gate.resolve();
        await action;

        expect(end).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(false);
    });
});

describe('real enemy multi-hit resolution', () => {
    it('commits all logical damage before the first of three callback-free visuals', async () => {
        const enemy = tripleAttack();
        const next = vi.spyOn(Game, 'startTurn').mockResolvedValue();
        const damage = vi.spyOn(Game.player, 'takeDamage');
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(400);

        expect(Game.player.currentHp).toBe(40);
        expect(damage).toHaveBeenCalledTimes(3);
        expect(visuals).toHaveLength(1);
        expect(visuals[0].playerHp).toBe(40);
        expect(visuals[0].source).toBe(enemy);
        await vi.runAllTimersAsync();
        await turn;

        expect(visuals).toHaveLength(3);
        expect(storedCallbacks).toHaveLength(0);
        expect(Game.player.currentHp).toBe(40);
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('keeps all three visuals after first-hit thorns kill the attacker and does not land ghost hits', async () => {
        const enemy = tripleAttack();
        enemy.currentHp = 5;
        Game.player.tempThorns = 10;
        const damage = vi.spyOn(Game.player, 'takeDamage');
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(400);

        expect(enemy.currentHp).toBe(0);
        expect(Game.player.currentHp).toBe(100);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        expect(visuals).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(400);
        expect(visuals).toHaveLength(3);
        expect(Game.currentState).toBe(STATE.COMBAT);
        await vi.runAllTimersAsync();
        await turn;

        expect(damage).not.toHaveBeenCalled();
        expect(Game.player.currentHp).toBe(100);
        expect(storedCallbacks).toHaveLength(0);
        expect(Game.showCombatWin).toHaveBeenCalledTimes(1);
    });

    it('keeps all three visuals after a lethal first hit and delays the death screen until they finish', async () => {
        tripleAttack();
        Game.player.currentHp = 1;
        const damage = vi.spyOn(Game.player, 'takeDamage');
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(400);

        expect(Game.player.currentHp).toBe(0);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        expect(visuals).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(400);
        expect(visuals).toHaveLength(3);
        expect(Game.currentState).toBe(STATE.COMBAT);
        await vi.runAllTimersAsync();
        await turn;

        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(storedCallbacks).toHaveLength(0);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game.showCombatWin).not.toHaveBeenCalled();
    });
});

describe('enemy area strikes', () => {
    function addMinion(hp = 30) {
        const minion = new Minion(100, 200, 1, true);
        minion.maxHp = 30;
        minion.currentHp = hp;
        Game.player.minions.push(minion);
        return minion;
    }

    it.each([
        ['aoe_sweep', 20], ['frost_aoe', 24], ['immolate', 22]
    ])('settles %s damage to all targets before its callback-free presentation', async (type, minionHp) => {
        const minion = addMinion();
        const enemy = Game.enemy;
        const action = Game._resolveEnemyAreaStrike({ type, val: 10, effectiveVal: 10 });
        await vi.advanceTimersByTimeAsync(type === 'immolate' ? 0 : 300);

        expect(Game.player.currentHp).toBe(90);
        expect(minion.currentHp).toBe(minionHp);
        expect(visuals).toHaveLength(2);
        expect(visuals.every(effect => effect.playerHp === 90)).toBe(true);
        expect(visuals.map(effect => effect.target)).toEqual([Game.player, minion]);
        expect(storedCallbacks).toHaveLength(0);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        if (type === 'frost_aoe') expect(Game.player.hasEffect('weak')?.duration).toBe(2);
        if (type === 'immolate') {
            expect(enemy.currentHp).toBe(0);
            expect(Game.startQTE).not.toHaveBeenCalled();
        } else {
            expect(Game.startQTE).toHaveBeenCalledWith('DEFEND', Game.player.x, Game.player.y, null,
                expect.objectContaining({ incomingDamage: 10, pattern: type === 'frost_aoe' ? 'pulse' : 'accelerate' }));
        }

        await vi.runAllTimersAsync();
        await action;

        expect(Game.player.currentHp).toBe(90);
        expect(minion.currentHp).toBe(minionHp);
        expect(storedCallbacks).toHaveLength(0);
        expect(Game.showCombatWin).toHaveBeenCalledTimes(type === 'immolate' ? 1 : 0);
    });

    it('consumes Compiler Bolster once and applies the QTE multiplier to the charged sweep', async () => {
        Game.enemy.name = 'THE COMPILER';
        Game.enemy._bolsterDamageMult = 2;
        const minion = addMinion();
        Game.startQTE.mockResolvedValue(0.5);
        const intent = { type: 'aoe_sweep', val: 10 };

        const first = Game._resolveEnemyAreaStrike(intent);
        await vi.runAllTimersAsync();
        await first;
        expect(Game.player.currentHp).toBe(90);
        expect(minion.currentHp).toBe(20);
        expect(Game.enemy._bolsterDamageMult).toBe(0);
        expect(Game.startQTE.mock.calls[0][4].incomingDamage).toBe(20);

        const second = Game._resolveEnemyAreaStrike(intent);
        await vi.runAllTimersAsync();
        await second;
        expect(Game.player.currentHp).toBe(85);
        expect(minion.currentHp).toBe(15);
        expect(Game.startQTE.mock.calls[1][4].incomingDamage).toBe(10);
    });

    it('keeps a fully parried sweep harmless for a newcomer', async () => {
        const minion = addMinion();
        Game._isNewcomer.mockReturnValue(true);
        Game.assistDisabled = false;
        Game.startQTE.mockResolvedValue(0);

        const action = Game._resolveEnemyAreaStrike({ type: 'aoe_sweep', val: 10 });
        await vi.runAllTimersAsync();
        await action;

        expect(Game.player.currentHp).toBe(100);
        expect(minion.currentHp).toBe(30);
        expect(visuals).toHaveLength(2);
    });

    it('finishes the complete immolation visual before settling simultaneous deaths', async () => {
        Game.player.currentHp = 1;
        const minion = addMinion(1);
        const enemy = Game.enemy;
        const action = Game._resolveEnemyAreaStrike({ type: 'immolate', val: 10 });
        await vi.advanceTimersByTimeAsync(0);

        expect(Game.player.currentHp).toBe(0);
        expect(minion.currentHp).toBe(0);
        expect(enemy.currentHp).toBe(0);
        expect(visuals).toHaveLength(2);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        await action;

        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.showCombatWin).not.toHaveBeenCalled();
        expect(storedCallbacks).toHaveLength(0);
    });

    it('settles every target in a committed sweep even when retaliation kills its source', async () => {
        const minion = addMinion();
        const enemy = Game.enemy;
        enemy.currentHp = 1;
        Game.player.relics.push({ id: 'spike_armor' });
        Game.invalidateStackCache();
        const action = Game._resolveEnemyAreaStrike({ type: 'aoe_sweep', val: 10 });
        await vi.advanceTimersByTimeAsync(300);

        expect(enemy.currentHp).toBe(0);
        expect(Game.player.currentHp).toBe(90);
        expect(minion.currentHp).toBe(20);
        expect(visuals).toHaveLength(2);
        expect(Game.currentState).toBe(STATE.COMBAT);
        await vi.runAllTimersAsync();
        await action;

        expect(Game.showCombatWin).toHaveBeenCalledTimes(1);
        expect(Game.player.currentHp).toBe(90);
        expect(minion.currentHp).toBe(20);
    });

    it('cancels an awaited area QTE without damaging or unlocking its replacement combat', async () => {
        const qte = deferred();
        Game.startQTE.mockReturnValue(qte.promise);
        const action = Game._resolveEnemyAreaStrike({ type: 'frost_aoe', val: 10 });
        await vi.advanceTimersByTimeAsync(300);
        Game.quitRun();
        Game._combatGen++;
        Game.currentState = STATE.COMBAT;
        Game.enemy = makeEnemy();
        Game._combatActionDepth = 1;
        Game.inputLocked = true;

        qte.resolve(1);
        await vi.runAllTimersAsync();
        await action;

        expect(Game.player.currentHp).toBe(100);
        expect(Game.player.hasEffect('weak')).toBeUndefined();
        expect(Game.enemy.currentHp).toBe(100);
        expect(visuals).toHaveLength(0);
        expect(Game.inputLocked).toBe(true);
        expect(Game._combatActionDepth).toBe(1);
    });

    it('routes the real enemy sweep through settlement before starting another turn', async () => {
        const intent = { type: 'aoe_sweep', val: 10, effectiveVal: 10 };
        Game.enemy.nextIntents = [intent];
        const next = vi.spyOn(Game, 'startTurn').mockResolvedValue();
        const area = vi.spyOn(Game, '_resolveEnemyAreaStrike');
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(300);

        expect(Game.player.currentHp).toBe(90);
        expect(visuals).toHaveLength(1);
        expect(next).not.toHaveBeenCalled();
        expect(storedCallbacks).toHaveLength(0);
        await vi.runAllTimersAsync();
        await turn;

        expect(area).toHaveBeenCalledWith(intent);
        expect(next).toHaveBeenCalledTimes(1);
        expect(Game.player.currentHp).toBe(90);
    });
});

describe('Starfall committed action', () => {
    it('collects QTE waves before damage, then completes three meteors after a lethal first logical hit', async () => {
        Game.player.diceUpgrades.push('METEOR');
        Game.enemy.currentHp = 20;
        const enemy = Game.enemy;
        const die = { id: 0, type: 'METEOR', used: false, selected: false };
        Game.dicePool = [die];
        let finishQte;
        let qteOptions;
        Game.startQTE.mockImplementation((type, x, y, callback, options) => {
            finishQte = callback;
            qteOptions = options;
            return Promise.resolve();
        });

        Game.useDie(die, document.createElement('div'), enemy);
        expect(die.used).toBe(true);
        for (let wave = 0; wave < 3; wave++) qteOptions.onWave('perfect', wave, 1.3);
        expect(enemy.currentHp).toBe(20);
        expect(visuals).toHaveLength(0);
        const resolution = finishQte(1.3);
        await vi.advanceTimersByTimeAsync(0);

        expect(enemy.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        await resolution;

        expect(visuals.filter(v => v.type === 'orbital_strike')).toHaveLength(3);
        expect(storedCallbacks).toHaveLength(0);
        expect(Game.showCombatWin).toHaveBeenCalledTimes(1);
        expect(enemy.currentHp).toBe(0);
    });
});

describe('signature presentation lifetime', () => {
    it('keeps a lethal real signature action open until its direct animation has finished', async () => {
        Game.player.signatureTier = 1;
        Game._syncSignatureDie();
        const enemy = Game.enemy;
        enemy.currentHp = 1;
        const die = { id: 0, type: 'SIGNATURE', used: false, selected: false };
        Game.dicePool = [die];
        let finishQte;
        Game.startQTE.mockImplementation((type, x, y, callback) => {
            finishQte = callback;
            return Promise.resolve();
        });

        Game.useDie(die, document.createElement('div'), enemy);
        const action = finishQte(1);
        await vi.advanceTimersByTimeAsync(0);

        expect(die.used).toBe(true);
        expect(enemy.currentHp).toBe(0);
        expect(Game._combatActionDepth).toBe(1);
        expect(Game.inputLocked).toBe(true);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game.effects.some(effect => effect.type === 'sig_volley_dart')).toBe(true);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1199);

        expect(Game.effects.filter(effect => effect.type === 'sig_volley_dart')).toHaveLength(5);
        expect(Game._combatActionDepth).toBe(1);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        expect(Game.showCombatWin).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(Game.inputLocked).toBe(true);
        expect(ClassAbility.endCombat).not.toHaveBeenCalled();
        // This fixture has no renderer. Retire its five completed darts
        // explicitly; timer expiry alone must not finish the presentation.
        Game.effects = [];
        await vi.advanceTimersByTimeAsync(20);
        await action;

        expect(Game._combatActionDepth).toBe(0);
        expect(ClassAbility.endCombat).toHaveBeenCalledTimes(1);
        await vi.runAllTimersAsync();
        expect(Game.showCombatWin).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
        expect(enemy.currentHp).toBe(0);
    });
});
