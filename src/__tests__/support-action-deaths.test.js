import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { Game } from '../game.js';
import { Minion } from '../entities/minion.js';
import { STATE } from '../constants.js';
import { ClassAbility } from '../ui/class-ability.js';

function shift() {
    Game.player.effects.push({ id: 'reality_shift', duration: 1, val: 1 });
}

function minion(hp) {
    const ally = new Minion(280, 1300, 1, true);
    ally.maxHp = Math.max(ally.maxHp, hp);
    ally.currentHp = hp;
    Game.player.minions.push(ally);
    return ally;
}

function play(type, target = Game.player) {
    const die = { type, id: Math.random(), used: false, selected: false };
    Game.dicePool.push(die);
    Game.useDie(die, document.createElement('div'), target);
    return die;
}

async function settleActions() {
    await vi.advanceTimersByTimeAsync(0);
    const actions = Game._runCombatAction.mock.results.map(result => result.value);
    await Promise.all(actions);
}

beforeEach(() => {
    setupCombatFixture({
        classId: 'bloodstalker', hp: 50,
        enemyTemplate: { name: 'Support Test', hp: 100, dmg: 5 },
        profiles: ['cosmetics', 'ui', 'terminal-services', 'class-events']
    });
    Game.player.x = 540;
    Game.player.y = 1300;
    Game.player.mana = 0;
    vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
    // Keep logical actions and death real; render timing is covered separately.
    vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
    vi.spyOn(Game, '_runCombatAction');
    vi.spyOn(Game, 'gameOver');
});

afterEach(teardownCombatFixture);


describe('Reality Shift support actions', () => {
    it('settles lethal Sanguine Pact exactly once and rejects Blood Price on a surviving ally', async () => {
        shift();
        Game.player.currentHp = 3;
        const ally = minion(7);
        const defend = play('BLD_DEFEND');
        expect(defend.used).toBe(true);
        expect(Game.player.currentHp).toBe(0);
        expect(ally.currentHp).toBe(4);
        await settleActions();

        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        const mana = play('BLD_MANA', ally);
        expect(mana.used).toBe(false);
        expect(Game.player.currentHp).toBe(0);
        expect(Game.player.mana).toBe(0);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
    });

    it('removes killed thralls while preserving surviving allies and normal loss counters', async () => {
        shift();
        Game.enemy.isBoss = true;
        Game.runStats = { bossFightMinionLosses: 0 };
        const killed = minion(2);
        const survivor = minion(7);

        play('BLD_DEFEND');
        expect(Game.player.currentHp).toBe(47);
        expect(killed.currentHp).toBe(0);
        expect(survivor.currentHp).toBe(4);
        expect(Game.player.minions).toEqual([survivor]);
        expect(Game.deadMinionsThisTurn).toBe(1);
        expect(Game.runStats.bossFightMinionLosses).toBe(1);
        await settleActions();

        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game.inputLocked).toBe(false);
        expect(Game.gameOver).not.toHaveBeenCalled();
    });

    it('allows the Summoner survival trait to handle an inverted minion death', async () => {
        shift();
        Game.player.classId = 'summoner';
        const ally = minion(1);
        vi.spyOn(Math, 'random').mockReturnValue(0);

        play('SUM_MANA');
        await settleActions();

        expect(Game.player.currentHp).toBe(49);
        expect(Game.player.minions).toContain(ally);
        expect(ally.currentHp).toBeGreaterThan(0);
        expect(Game.deadMinionsThisTurn).toBe(0);
        expect(Game.gameOver).not.toHaveBeenCalled();
    });

    it('does not let Blood Price restore HP after its mana-triggered heal becomes lethal', async () => {
        shift();
        Game.player.currentHp = 1;
        Game.player.relics.push({ id: 'recycle_bin' });
        Game.invalidateStackCache();

        play('BLD_MANA');
        expect(Game.player.currentHp).toBe(0);
        await settleActions();

        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game.player.currentHp).toBe(0);
    });

    it('stops upgraded Blood Price when its extra heal becomes lethal before the HP floor', async () => {
        shift();
        Game.player.currentHp = 1;
        Game.player.diceUpgrades.push('BLD_MANA');

        play('BLD_MANA');
        expect(Game.player.currentHp).toBe(0);
        await settleActions();

        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game.player.currentHp).toBe(0);
    });

    it.each([
        ['second_life', 50], ['fusion_phoenix_protocol', 100]
    ])('consumes %s once and waits for its single replacement turn', async (relic, hp) => {
        shift();
        Game.player.currentHp = 3;
        Game.player.relics.push({ id: relic });
        Game.invalidateStackCache();
        const ally = minion(7);

        play('BLD_DEFEND');
        await settleActions();

        expect(Game.player.currentHp).toBe(hp);
        expect(Game.player.hasRelic(relic)).toBeFalsy();
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game.inputLocked).toBe(true);
        expect(play('BLD_MANA', ally).used).toBe(false);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Game.rollDice).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game._revivePending).toBeNull();
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
    });

    it('keeps surviving support actions responsive while their pure visual remains active', async () => {
        Game.triggerVFX.mockRestore();
        const die = play('BLD_DEFEND');
        expect(die.used).toBe(true);
        expect(Game.player.currentHp).toBe(53);
        await settleActions();

        expect(Game.effects.some(effect => effect.type === 'hex_barrier')).toBe(true);
        expect(Game.inputLocked).toBe(false);
        expect(Game._combatActionDepth).toBe(0);
        expect(Game.gameOver).not.toHaveBeenCalled();
    });
});

describe('lethal costs before support resolution', () => {
    it.each([false, true])('stops after a lethal combo heal before the mana action (revive: %s)', async revive => {
        shift();
        Game.player.currentHp = 3;
        if (revive) Game.player.relics.push({ id: 'second_life' });
        Game.invalidateStackCache();
        const die = { type: 'BLD_MANA', id: 1, used: false };
        Game.comboSets = { FEEDING_FRENZY: { members: new Set([die.id]), name: 'Feeding Frenzy', color: '#ff0000' } };

        Game.useDie(die, document.createElement('div'), Game.player);
        await settleActions();

        expect(die.used).toBe(true);
        expect(Game.player.mana).toBe(0);
        expect(Game.player.currentHp).toBe(revive ? 50 : 0);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game._runCombatAction).not.toHaveBeenCalled();
        expect(ClassAbility.onEvent).not.toHaveBeenCalledWith('dice_used', expect.anything());
    });

    it.each(['BLD_MANA', 'BLD_DEFEND', 'VOODOO'])('cancels %s after lethal Hot Hands before mana/nullification can run', async type => {
        Game.player.currentHp = 1;
        Game._customHotHandsDmg = 2;
        Game.player._panopticonNullifyFirst = true;
        const manaBefore = Game.player.mana;

        const die = play(type, type === 'VOODOO' ? Game.enemy : Game.player);
        await settleActions();

        expect(Game.player.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(die.used).toBe(false);
        expect(Game.player.mana).toBe(manaBefore);
        expect(Game.player._panopticonNullifyFirst).toBe(true);
        expect(Game._runCombatAction).not.toHaveBeenCalled();
    });

    it('cancels the original support action after a Hot Hands revive', async () => {
        Game.player.currentHp = 1;
        Game._customHotHandsDmg = 2;
        Game.player.relics.push({ id: 'second_life' });
        Game.invalidateStackCache();

        const die = play('BLD_MANA');

        expect(Game.player.currentHp).toBe(50);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game.player.mana).toBe(0);
        expect(die.used).toBe(false);
        expect(Game._runCombatAction).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        expect(Game.rollDice).toHaveBeenCalledTimes(1);
    });
});
