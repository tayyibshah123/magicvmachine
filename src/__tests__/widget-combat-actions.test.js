import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Minion } from '../entities/minion.js';
import { STATE } from '../constants.js';
import { ClassAbility } from '../ui/class-ability.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { renderFor } from './helpers/combat-renderer.js';

beforeEach(() => {
    setupCombatFixture({ maxHp: 100, profiles: ['cosmetics', 'ui', 'renderer', 'terminal-services'] });
    ClassAbility.init(Game);
});
afterEach(() => { ClassAbility.endCombat(); teardownCombatFixture(); });

function prepare(classId) {
    Game.player.classId = classId;
    ClassAbility.startCombat();
}

describe('settled widget attacks', () => {
    it.each([100, 5])('settles fire damage first and finishes its real lightning with enemy HP %i', async hp => {
        prepare('arcanist');
        Game.enemy.currentHp = hp;
        const damage = vi.spyOn(Game.enemy, 'takeDamage');
        const cleanup = vi.spyOn(ClassAbility, 'endCombat');
        const attack = ClassAbility._activate('arc-tap');
        expect(Game.enemy.currentHp).toBe(Math.max(0, hp - 12));
        expect(Game.inputLocked).toBe(true);
        expect(Game.currentState).toBe(STATE.COMBAT);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.effects.some(effect => effect.type === 'lightning')).toBe(true);
        await renderFor(1200);
        expect(cleanup).not.toHaveBeenCalled();
        expect(Game.inputLocked).toBe(true);
        await renderFor(1100);
        await attack;
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game.effects.some(effect => effect.type === 'lightning')).toBe(false);
        expect(Game.currentState).toBe(hp === 5 ? STATE.COMBAT_WIN : STATE.COMBAT);
        expect(cleanup).toHaveBeenCalledTimes(hp === 5 ? 1 : 0);
        if (hp !== 5) expect(Game.inputLocked).toBe(false);
    });

    it('keeps both Grand Tribute effects after its lethal hit and does not apply damage again', async () => {
        prepare('bloodstalker');
        Game.player.takeDamage(10, Game.enemy);
        Game.enemy.currentHp = 20;
        const damage = vi.spyOn(Game.enemy, 'takeDamage');
        const cleanup = vi.spyOn(ClassAbility, 'endCombat');
        const visual = vi.spyOn(Game, 'triggerVFX');
        const attack = ClassAbility._activate('tribute-grand');
        expect(Game.player.currentHp).toBe(60);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.COMBAT);
        await renderFor(1500);
        expect(visual.mock.calls.filter(([type, , , callback]) =>
            ['slash_heavy', 'lightning'].includes(type) && callback === null)).toHaveLength(2);
        expect(cleanup).not.toHaveBeenCalled();
        await renderFor(1000);
        await attack;
        expect(damage).toHaveBeenCalledTimes(1);
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
    });

    it('settles red-vent AoE and self-damage before deciding a simultaneous defeat', async () => {
        prepare('annihilator');
        ClassAbility.onEvent('heat_add', { amount: 80 });
        Game.player.currentHp = 3;
        Game.enemy.currentHp = 5;
        const escort = new Minion(300, 600, 1, false);
        escort.currentHp = 5;
        Game.enemy.minions = [escort];
        const cleanup = vi.spyOn(ClassAbility, 'endCombat');
        expect(ClassAbility._activate('heat-vent')).toBeUndefined();
        expect(Game.player.currentHp).toBe(3);
        const attack = ClassAbility._activate('heat-vent');
        expect(Game.player.currentHp).toBe(0);
        expect(Game.enemy.currentHp).toBe(0);
        expect(escort.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.COMBAT);
        await renderFor(1190);
        expect(cleanup).not.toHaveBeenCalled();
        await renderFor(110);
        await attack;
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.GAMEOVER);
    });

    it('keeps utility instant and refuses activation during another action or pause', () => {
        prepare('tactician');
        ClassAbility.onEvent('dice_used', { type: 'TAC_ATTACK' });
        ClassAbility.onEvent('dice_used', { type: 'TAC_ATTACK' });
        Game.inputLocked = true;
        ClassAbility._activate('tact-shield');
        expect(Game.player.shield).toBe(0);
        Game.inputLocked = false;
        Game.paused = true;
        ClassAbility._activate('tact-shield');
        expect(Game.player.shield).toBe(0);
        Game.paused = false;
        expect(ClassAbility._activate('tact-shield')).toBeUndefined();
        expect(Game.player.shield).toBe(8);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game.inputLocked).toBe(false);
    });

    it('cancels queued widget effects on a real quit without unlocking a replacement action', async () => {
        prepare('bloodstalker');
        Game.player.takeDamage(10, Game.enemy);
        const oldEnemy = Game.enemy;
        const damage = vi.spyOn(oldEnemy, 'takeDamage');
        const attack = ClassAbility._activate('tribute-grand');
        await vi.advanceTimersByTimeAsync(0);
        expect(oldEnemy.currentHp).toBe(60);
        Game.quitRun();
        Game.enemy = new Enemy({ name: 'New encounter', hp: 100, dmg: 3 }, 0);
        Game.currentState = STATE.COMBAT;
        Game._combatActionDepth = 1;
        Game.inputLocked = true;
        await renderFor(2500);
        await attack;
        expect(Game.enemy.currentHp).toBe(100);
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game._combatActionDepth).toBe(1);
        expect(Game.inputLocked).toBe(true);
        expect(Game.effects.some(effect => effect.type === 'lightning')).toBe(false);
    });
});
