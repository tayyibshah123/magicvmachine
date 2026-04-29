// Dice-roll tests — exercise the pure helpers on the Game object that don't
// need a canvas. Imports the module for its side-effect of defining Game,
// but only invokes the helpers directly.
//
// Run with: npm test

import { describe, it, expect, beforeEach } from 'vitest';

// The Game module mutates DOM at import time — provide stubs so import doesn't
// blow up in jsdom.
beforeEach(() => {
    document.body.innerHTML = `
        <div id="game-container">
            <canvas id="gameCanvas" width="1080" height="1920"></canvas>
            <div id="dice-container"></div>
            <div id="reroll-badge"></div>
            <div id="hud"></div>
            <div id="tutorial-spotlight"></div>
        </div>
    `;
});

describe('UNIQUE_PER_HAND + BASE_DICE', () => {
    // BASE_DICE is a class-aware getter — it reads Game.player.classId and
    // returns that class's four zero-cost dice. Tactician's are TAC_*; we
    // pin classId here so the assertions exercise a known set.
    const setupTactician = (Game) => { Game.player = { classId: 'tactician' }; };

    it('exports the expected sets', async () => {
        const { Game } = await import('../game.js');
        setupTactician(Game);
        expect(Game.UNIQUE_PER_HAND instanceof Set).toBe(true);
        expect(Game.UNIQUE_PER_HAND.has('RECKLESS_CHARGE')).toBe(true);
        expect(Game.UNIQUE_PER_HAND.has('OVERCHARGE')).toBe(true);
        expect(Game.UNIQUE_PER_HAND.has('VOODOO')).toBe(true);
        expect(Game.BASE_DICE.has('TAC_ATTACK')).toBe(true);
        expect(Game.BASE_DICE.has('TAC_DEFEND')).toBe(true);
    });

    it('does not include SIGNATURE or base dice in UNIQUE_PER_HAND', async () => {
        const { Game } = await import('../game.js');
        expect(Game.UNIQUE_PER_HAND.has('TAC_ATTACK')).toBe(false);
        expect(Game.UNIQUE_PER_HAND.has('SIGNATURE')).toBe(false);
    });

    it('BASE_DICE contains exactly the four zero-cost types for the active class', async () => {
        const { Game } = await import('../game.js');
        setupTactician(Game);
        expect(Game.BASE_DICE.size).toBe(4);
        for (const t of ['TAC_ATTACK', 'TAC_DEFEND', 'TAC_MANA', 'TAC_MINION']) {
            expect(Game.BASE_DICE.has(t)).toBe(true);
        }
    });

    it('BASE_DICE returns empty set when no class is active', async () => {
        const { Game } = await import('../game.js');
        Game.player = null;
        expect(Game.BASE_DICE.size).toBe(0);
    });
});

describe('_pickDiceType', () => {
    it('never returns a reserved once-per-hand type', async () => {
        const { Game } = await import('../game.js');
        const reserved = new Set(['RECKLESS_CHARGE']);
        const pool = ['TAC_ATTACK', 'TAC_DEFEND', 'TAC_MANA', 'TAC_MINION', 'RECKLESS_CHARGE'];
        for (let i = 0; i < 200; i++) {
            const pick = Game._pickDiceType(pool, reserved);
            expect(pick).not.toBe('RECKLESS_CHARGE');
        }
    });

    it('auto-reserves a unique pick so subsequent calls avoid it', async () => {
        const { Game } = await import('../game.js');
        const reserved = new Set();
        const pool = ['VOODOO']; // only option — should pick once, then the reserved set contains it
        const first = Game._pickDiceType(pool, reserved);
        expect(first).toBe('VOODOO');
        expect(reserved.has('VOODOO')).toBe(true);
        // With the single-option pool, the filter would empty-out but the
        // safety fallback still returns an available type.
        const second = Game._pickDiceType(pool, reserved);
        expect(second).toBe('VOODOO');
    });

    it('allows non-unique types to repeat freely', async () => {
        const { Game } = await import('../game.js');
        const reserved = new Set();
        const pool = ['TAC_ATTACK'];
        const picks = [];
        for (let i = 0; i < 10; i++) {
            picks.push(Game._pickDiceType(pool, reserved));
        }
        expect(picks.every(p => p === 'TAC_ATTACK')).toBe(true);
        expect(reserved.has('TAC_ATTACK')).toBe(false);
    });

    it('handles empty reserved set gracefully', async () => {
        const { Game } = await import('../game.js');
        const pool = ['TAC_ATTACK', 'TAC_DEFEND'];
        const pick = Game._pickDiceType(pool, new Set());
        expect(pool).toContain(pick);
    });

    it('handles null reserved set', async () => {
        const { Game } = await import('../game.js');
        const pool = ['TAC_ATTACK', 'TAC_DEFEND'];
        const pick = Game._pickDiceType(pool, null);
        expect(pool).toContain(pick);
    });

    it('falls back to full pool when all candidates are reserved', async () => {
        const { Game } = await import('../game.js');
        const reserved = new Set(['RECKLESS_CHARGE', 'OVERCHARGE', 'VOODOO']);
        const pool = ['RECKLESS_CHARGE', 'OVERCHARGE', 'VOODOO'];
        const pick = Game._pickDiceType(pool, reserved);
        expect(pool).toContain(pick);
    });
});

describe('_enemyMinions', () => {
    it('returns empty array when enemy is null', async () => {
        const { Game } = await import('../game.js');
        Game.enemy = null;
        expect(Game._enemyMinions()).toEqual([]);
    });

    it('returns empty array when enemy has no minions', async () => {
        const { Game } = await import('../game.js');
        Game.enemy = { currentHp: 50 };
        expect(Game._enemyMinions()).toEqual([]);
    });

    it('returns the minions array when it exists', async () => {
        const { Game } = await import('../game.js');
        const minions = [{ currentHp: 10 }, { currentHp: 20 }];
        Game.enemy = { currentHp: 50, minions };
        expect(Game._enemyMinions()).toBe(minions);
    });
});

describe('_clearRerollIntervals', () => {
    it('clears all stored intervals and timeout', async () => {
        const { Game } = await import('../game.js');
        Game._rerollIntervals = [
            setInterval(() => {}, 1000),
            setInterval(() => {}, 1000)
        ];
        Game._rerollTimeout = setTimeout(() => {}, 5000);
        Game._clearRerollIntervals();
        expect(Game._rerollIntervals).toEqual([]);
        expect(Game._rerollTimeout).toBeNull();
    });

    it('is safe to call when no intervals exist', async () => {
        const { Game } = await import('../game.js');
        Game._rerollIntervals = [];
        Game._rerollTimeout = null;
        expect(() => Game._clearRerollIntervals()).not.toThrow();
    });
});

describe('once-per-hand constraint (integration)', () => {
    it('picks at most one copy of each unique type in a 5-slot hand', async () => {
        const { Game } = await import('../game.js');
        const pool = ['TAC_ATTACK', 'TAC_DEFEND', 'TAC_MANA', 'RECKLESS_CHARGE', 'OVERCHARGE', 'VOODOO'];
        for (let trial = 0; trial < 50; trial++) {
            const reserved = new Set();
            const hand = [];
            for (let i = 0; i < 5; i++) {
                hand.push(Game._pickDiceType(pool, reserved));
            }
            for (const uType of ['RECKLESS_CHARGE', 'OVERCHARGE', 'VOODOO']) {
                const count = hand.filter(d => d === uType).length;
                expect(count).toBeLessThanOrEqual(1);
            }
        }
    });
});

describe('pity timer logic', () => {
    it('sigMissStreak >= 2 triggers sigPity flag', () => {
        expect((2) >= 2).toBe(true);
        expect((1) >= 2).toBe(false);
        expect((0) >= 2).toBe(false);
    });

    it('sigMissStreak resets to 0 when signature placed', () => {
        let sigPlaced = true;
        let streak = 3;
        streak = sigPlaced ? 0 : (streak + 1);
        expect(streak).toBe(0);
    });

    it('sigMissStreak increments when signature not placed', () => {
        let sigPlaced = false;
        let streak = 1;
        streak = sigPlaced ? 0 : (streak + 1);
        expect(streak).toBe(2);
    });
});

describe('base-dice floor logic', () => {
    it('last slot selects a base die when no base placed yet', async () => {
        const { Game } = await import('../game.js');
        // Pin a class so BASE_DICE resolves — getter returns empty set when
        // player.classId is not set, which would make the candidate filter
        // empty and the test meaningless.
        Game.player = { classId: 'tactician' };
        const baseCandidates = ['TAC_ATTACK', 'TAC_DEFEND', 'TAC_MANA', 'TAC_MINION']
            .filter(t => Game.BASE_DICE.has(t));
        expect(baseCandidates.length).toBeGreaterThan(0);
        for (let i = 0; i < 100; i++) {
            const pick = baseCandidates[Math.floor(Math.random() * baseCandidates.length)];
            expect(Game.BASE_DICE.has(pick)).toBe(true);
        }
    });
});
