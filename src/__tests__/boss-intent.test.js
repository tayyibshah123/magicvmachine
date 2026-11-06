import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../game.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';

beforeEach(() => setupCombatFixture({
    enemyTemplate: { name: 'Intent boss', hp: 100, dmg: 10, actionsPerTurn: 2 },
    profiles: ['cosmetics']
}));
afterEach(teardownCombatFixture);

describe('production boss intent selection', () => {
    it.each([{ name: 'null', moves: null }, { name: 'empty', moves: [] }])('returns null for $name move pool', ({ moves }) => {
        expect(Game.enemy._pickBossMove(moves)).toBeNull();
    });

    it('allows the only move without filtering it away', () => {
        Game.enemy._lastBossMove = 'attack';
        expect(Game.enemy._pickBossMove(['attack'])).toBe('attack');
    });

    it.each([
        { moves: ['attack', 'shield'] },
        { moves: ['attack', 'shield', 'buff'] },
        { moves: ['attack', 'shield', 'buff', 'debuff'] }
    ])('excludes the last move from $moves and records the actual pick', ({ moves }) => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        Game.enemy._lastBossMove = 'attack';
        const first = Game.enemy._pickBossMove(moves);
        expect(first).toBe('shield');
        expect(Game.enemy._lastBossMove).toBe(first);
        const next = Game.enemy._pickBossMove(moves);
        expect(next).toBe('attack');
        expect(Game.enemy._lastBossMove).toBe(next);
    });

    it.each([2, 3])('uses the aggressive branch in phase %i', phase => {
        Game.enemy.phase = phase;
        const random = vi.spyOn(Math, 'random').mockReturnValue(0);
        const picked = Game.enemy._pickBossMove(['shield', 'attack', 'buff', 'multi_attack']);
        expect(picked).toBe('attack');
        expect(random).toHaveBeenCalledTimes(2);
        expect(Game.enemy._lastBossMove).toBe(picked);
    });

    it('uses the ordinary pool when the aggression coin misses', () => {
        Game.enemy.phase = 2;
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.6).mockReturnValue(0);
        expect(Game.enemy._pickBossMove(['shield', 'attack', 'buff'])).toBe('shield');
        expect(Game.enemy._lastBossMove).toBe('shield');
    });

    it('does not bias phase one and falls back when no aggressive move exists', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        expect(Game.enemy._pickBossMove(['shield', 'attack'])).toBe('shield');
        Game.enemy.phase = 2;
        Game.enemy._lastBossMove = 'shield';
        expect(Game.enemy._pickBossMove(['shield', 'buff', 'debuff'])).toBe('buff');
        expect(Game.enemy._lastBossMove).toBe('buff');
    });
});
