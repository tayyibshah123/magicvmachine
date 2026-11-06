import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasContext, setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { renderFor } from './helpers/combat-renderer.js';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Minion } from '../entities/minion.js';
import { STATE } from '../constants.js';

function makeEnemy(hp = 40) {
    return new Enemy({ name: 'Secondary Effect Test', hp, dmg: 5, sector: 1 }, 0);
}

beforeEach(() => {
    setupCombatFixture({
        maxHp: 30,
        enemyTemplate: { name: 'Secondary Effect Test', hp: 40, dmg: 5, sector: 1 },
        game: { _combatGen: 40, turnCount: 2 },
        profiles: ['cosmetics', 'ui', 'class-events']
    });
    vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
    vi.spyOn(Game, 'winCombat').mockImplementation(() => {});
    vi.spyOn(Game, 'gameOver').mockImplementation(() => {});
});

afterEach(teardownCombatFixture);


describe('Bomb Bot settled damage', () => {
    async function renderMissile() {
        installCanvasContext();
        await renderFor(1200, 30);
    }

    it('damages the enemy and its minions immediately, then presents a missile without a damage callback', async () => {
        const minion = new Minion(0, 0, 1, false, 1);
        minion.currentHp = minion.maxHp = 30;
        Game.enemy.minions = [minion];
        const enemyDamage = vi.spyOn(Game.enemy, 'takeDamage');
        const minionDamage = vi.spyOn(minion, 'takeDamage');
        const action = Game._detonateBombBot({ x: 20, y: 50 }, 25, 55);

        expect(Game.enemy.currentHp).toBe(30);
        expect(minion.currentHp).toBe(20);
        expect(enemyDamage).toHaveBeenCalledWith(10);
        expect(minionDamage).toHaveBeenCalledWith(10);
        expect(Game.inputLocked).toBe(true);
        await vi.advanceTimersByTimeAsync(0);
        const missile = Game.effects.find(effect => effect.type === 'bomb_missile');
        expect(missile).toMatchObject({ sx: 25, sy: 55, onHit: null });
        await renderMissile();
        await action;
        expect(enemyDamage).toHaveBeenCalledTimes(1);
        expect(minionDamage).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(false);
    });

    it('settles the entire blast before a lethal enemy hit opens the win flow', async () => {
        Game.enemy.currentHp = 5;
        const minion = new Minion(0, 0, 1, false, 1);
        minion.currentHp = 5;
        Game.enemy.minions = [minion];
        const action = Game._detonateBombBot({ x: 0, y: 0 });
        expect(Game.enemy.currentHp).toBe(0);
        expect(minion.currentHp).toBe(0);
        expect(Game.enemy.minions).toEqual([]);
        expect(Game.winCombat).not.toHaveBeenCalled();
        await renderMissile();
        await action;
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
    });

    it('cannot damage a replacement enemy when the player quits during missile presentation', async () => {
        const oldEnemy = Game.enemy;
        const damage = vi.spyOn(oldEnemy, 'takeDamage');
        const action = Game._detonateBombBot({ x: 0, y: 0 });
        await vi.advanceTimersByTimeAsync(0);
        Game.quitRun();
        const replacement = makeEnemy();
        Game.enemy = replacement;
        await vi.advanceTimersByTimeAsync(2000);
        await action;
        expect(Game.currentState).toBe(STATE.MENU);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(replacement.currentHp).toBe(40);
        expect(Game.winCombat).not.toHaveBeenCalled();
    });
});

describe('Voodoo expiry', () => {
    it('waits for a nonlethal curse before unlocking the next player hand', async () => {
        Game.enemy.effects = [{ id: 'voodoo', duration: 1, val: 12 }];
        const turn = Game.startTurn();
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.enemy.currentHp).toBe(28);
        expect(Game.inputLocked).toBe(true);
        expect(Game.rollDice).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(299);
        expect(Game.rollDice).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await turn;
        expect(Game.rollDice).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(false);
        expect(Game._combatActionDepth).toBe(0);
    });

    it('never rolls a new hand when the start-turn curse is lethal', async () => {
        Game.enemy.currentHp = 8;
        Game.enemy.effects = [{ id: 'voodoo', duration: 1, val: 12 }];
        Game.winCombat.mockImplementation(() => { Game.currentState = STATE.COMBAT_WIN; });
        const turn = Game.startTurn();
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.rollDice).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300);
        await turn;
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(Game.rollDice).not.toHaveBeenCalled();
    });

    it('commits lethal curse damage immediately and settles victory after its presentation', async () => {
        Game.enemy.currentHp = 8;
        Game.enemy.effects = [{ id: 'voodoo', duration: 1, val: 12 }];
        const damage = vi.spyOn(Game.enemy, 'takeDamage');
        Game.enemy.updateEffects();
        expect(damage).toHaveBeenCalledWith(12);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.enemy.hasEffect('voodoo')).toBeUndefined();
        expect(Game.winCombat).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(300);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
    });

    it('has no delayed damage left to fire after the player quits', async () => {
        const oldEnemy = Game.enemy;
        oldEnemy.effects = [{ id: 'voodoo', duration: 1, val: 12 }];
        const damage = vi.spyOn(oldEnemy, 'takeDamage');
        oldEnemy.updateEffects();
        expect(oldEnemy.currentHp).toBe(28);
        await vi.advanceTimersByTimeAsync(0);
        Game.quitRun();
        const replacement = makeEnemy();
        Game.enemy = replacement;
        await vi.advanceTimersByTimeAsync(2000);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(replacement.currentHp).toBe(40);
        expect(Game.winCombat).not.toHaveBeenCalled();
    });

    it.each([[0.25, 500], [0.75, 150]])('preserves the random curse base for roll %s', async (roll, base) => {
        Game.enemy = makeEnemy(1000);
        Game.enemy.effects = [{ id: 'voodoo', duration: 1, val: 0 }];
        vi.spyOn(Math, 'random').mockReturnValue(roll);
        const calculate = vi.spyOn(Game, 'calculateCardDamage').mockImplementation(value => value + 7);
        const damage = vi.spyOn(Game.enemy, 'takeDamage');
        Game.enemy.updateEffects();
        expect(calculate).toHaveBeenCalledWith(base);
        expect(damage).toHaveBeenCalledWith(base + 7);
        expect(Game.enemy.currentHp).toBe(1000 - base - 7);
        await vi.advanceTimersByTimeAsync(300);
    });
});
