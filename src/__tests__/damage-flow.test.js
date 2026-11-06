import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Minion } from '../entities/minion.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';

beforeEach(() => setupCombatFixture({ profiles: ['cosmetics', 'ui', 'terminal-observers'] }));
afterEach(teardownCombatFixture);

function enemy(template = {}) {
    return new Enemy({ name: 'Damage target', hp: 50, dmg: 20, sector: 1, ...template }, 0);
}

describe('real shield and HP damage pipeline', () => {
    it.each([
        { name: 'full block', shield: 10, damage: 8, remainingShield: 2, hp: 50 },
        { name: 'exact shield break', shield: 10, damage: 10, remainingShield: 0, hp: 50 },
        { name: 'overflow', shield: 10, damage: 15, remainingShield: 0, hp: 45 },
        { name: 'no shield', shield: 0, damage: 12, remainingShield: 0, hp: 38 },
        { name: 'zero damage', shield: 5, damage: 0, remainingShield: 5, hp: 50 }
    ])('$name updates the real shield reservoir and HP', ({ shield, damage, remainingShield, hp }) => {
        const target = enemy();
        target.shield = shield;
        const dead = target.takeDamage(damage);
        expect(target.shield).toBe(remainingShield);
        expect(target.currentHp).toBe(hp);
        expect(dead).toBe(false);
    });

    it('returns true on lethal damage and clamps HP to zero', () => {
        const target = enemy({ hp: 10 });
        expect(target.takeDamage(20)).toBe(true);
        expect(target.currentHp).toBe(0);
    });

    it('bypasses shield without consuming it', () => {
        const target = enemy();
        target.shield = 999;
        target.takeDamage(10, null, false, true);
        expect(target.shield).toBe(999);
        expect(target.currentHp).toBe(40);
    });
});

describe('real enemy damage regressions', () => {
    it.each(['player', 'summon'])('credits a %s finishing blow once and ignores later corpse hits', kind => {
        Game.runStats = { totalDamage: 0, highestHit: 0, kills: 0 };
        const previousAchievements = window.Achievements;
        const unlock = vi.fn();
        window.Achievements = { unlock };
        try {
            const source = kind === 'player' ? Game.player : new Minion(100, 100, 1, true);
            const target = enemy({ hp: 10 });
            expect(target.takeDamage(10, source)).toBe(true);
            const settledDamage = Game.runStats.totalDamage;
            expect(Game.runStats.kills).toBe(1);
            expect(unlock).toHaveBeenCalledWith('FIRST_KILL');
            expect(target.takeDamage(100, source)).toBe(true);
            expect(Game.runStats.kills).toBe(1);
            expect(Game.runStats.totalDamage).toBe(settledDamage);
            expect(unlock.mock.calls.filter(([id]) => id === 'FIRST_KILL')).toHaveLength(1);
        } finally {
            if (previousAchievements === undefined) delete window.Achievements;
            else window.Achievements = previousAchievements;
        }
    });

    it('does not award player kill credit for enemy damage or a friendly casualty', () => {
        Game.runStats = { totalDamage: 0, highestHit: 0, kills: 0 };
        const attacker = new Minion(100, 100, 1, false);
        const hostile = enemy({ hp: 10 });
        hostile.takeDamage(10, attacker);
        const ally = new Minion(100, 100, 2, true);
        ally.takeDamage(100, Game.player);
        expect(Game.runStats.kills).toBe(0);
    });

    it.each([
        ['dodge', 0.1, 110], ['land', 0.9, 100]
    ])('phase_shift %s branch has no temporal-dead-zone error and exact damage', (branch, random, hp) => {
        const target = enemy({ hp: 110, kind: 'phase_shift', sector: 4 });
        vi.spyOn(Math, 'random').mockReturnValue(random);
        expect(() => target.takeDamage(10)).not.toThrow();
        expect(target.currentHp).toBe(hp);
    });

    it('preserves real boss phases through oversized hits before allowing the final kill', () => {
        const boss = enemy({ name: 'TEST BOSS', hp: 100, actionsPerTurn: 2 });
        Game.enemy = boss;
        const transition = vi.spyOn(Game, 'triggerBossPhaseTransition').mockResolvedValue();
        expect(boss.takeDamage(200)).toBe(false);
        expect(boss.currentHp).toBe(49);
        expect(boss.phase).toBe(2);
        expect(transition).toHaveBeenLastCalledWith(boss, 2);
        expect(boss.takeDamage(200)).toBe(false);
        expect(boss.currentHp).toBe(19);
        expect(boss.phase).toBe(3);
        expect(transition).toHaveBeenLastCalledWith(boss, 3);
        expect(boss.takeDamage(200)).toBe(true);
        expect(boss.currentHp).toBe(0);
        expect(boss.phase).toBe(3);
        expect(transition).toHaveBeenCalledTimes(2);
    });
});

describe('real status effect damage and stacking', () => {
    it('weak halves outgoing enemy damage', () => {
        const target = enemy();
        target.addEffect('weak', 1, 0, '', '', 'WEAK');
        expect(target.getEffectiveDamage()).toBe(10);
    });

    it.each([
        ['constrict', 3, 0.5, 2, 6],
        ['bleed', 3, 2, 10, 30]
    ])('%s accumulates duration while preserving one stack and source strength', (id, duration, val, count, total) => {
        const target = enemy();
        for (let i = 0; i < count; i++) target.addEffect(id, duration, val, '', '', id);
        expect(target.hasEffect(id)).toMatchObject({ val, duration: total });
        if (id === 'bleed') expect(target.hasEffect(id).stacks).toBe(1);
    });
});
