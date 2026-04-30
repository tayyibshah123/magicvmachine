// Damage-flow integration tests. Loads the real Game module + entity
// classes and exercises takeDamage end-to-end. These catch regressions
// the pure-helper unit tests in shield.test.js can't see — temporal
// dead-zone errors, instanceof mismatches, late-bound class refs, and
// boss phase clamping interactions.
//
// Notable history: the v1.0 hardening pass discovered that Phase Stalker
// (kind: 'phase_shift') referenced `actualDmg` BEFORE its `let`
// declaration, blowing up with ReferenceError on every hit. This file's
// "phase_shift enemy survives a damage call" test is the regression
// guard.

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
    // Game.init() reads canvas + various DOM elements. Provide all of them
    // up front so the module's import-time DOM mutations don't blow up.
    document.body.innerHTML = `
        <div id="game-container">
            <canvas id="gameCanvas" width="1080" height="1920"></canvas>
            <div id="dice-container"></div>
            <div id="reroll-badge"></div>
            <div id="hud"></div>
            <div id="tutorial-spotlight"></div>
            <div id="screen-flash"></div>
            <div id="combat-log"></div>
        </div>
    `;
});

describe('takeDamage — basic flow', () => {
    it('dealing damage reduces enemy HP', async () => {
        const { Game } = await import('../game.js');
        const { Enemy } = await import('../entities/enemy.js');
        // Minimal template — bypass scaling by setting actionsPerTurn so the
        // boss-style HP/dmg passthrough applies.
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 5, sector: 1, actionsPerTurn: 1 },
            0
        );
        const before = enemy.currentHp;
        enemy.takeDamage(10);
        expect(enemy.currentHp).toBe(before - 10);
    });

    it('shield absorbs damage before HP', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 5, sector: 1, actionsPerTurn: 1 },
            0
        );
        enemy.shield = 8;
        enemy.takeDamage(5);
        expect(enemy.shield).toBe(3);
        expect(enemy.currentHp).toBe(50);
    });

    it('damage exceeding shield bleeds into HP', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 5, sector: 1, actionsPerTurn: 1 },
            0
        );
        enemy.shield = 4;
        enemy.takeDamage(10);
        expect(enemy.shield).toBe(0);
        expect(enemy.currentHp).toBe(50 - 6);
    });

    it('takeDamage returns true on lethal blow (non-boss)', async () => {
        // Non-boss only — the boss-phase clamp keeps a P1 boss from dying
        // in a single hit (it gets dropped to the P2 floor instead). That
        // is intentional gameplay; we test it separately below.
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 10, dmg: 5, sector: 1 },
            0
        );
        const dead = enemy.takeDamage(20);
        expect(dead).toBe(true);
        expect(enemy.currentHp).toBe(0);
    });
});

describe('takeDamage — regression guards', () => {
    it('phase_shift enemy survives a damage call without ReferenceError', async () => {
        // Regression for the v1.0 hardening pass bug where `actualDmg` was
        // referenced before its `let` declaration in entity.js takeDamage.
        // Phase Stalker (kind: 'phase_shift') is a real sector-4 enemy, so
        // any player attack against one would crash the game.
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'Phase Stalker', hp: 110, dmg: 25, sector: 4, kind: 'phase_shift', actionsPerTurn: 1 },
            0
        );
        // Run 50 damage attempts — phase_shift is RNG so we want broad coverage.
        // The test only asserts no exception is thrown; HP changes are RNG-dependent.
        expect(() => {
            for (let i = 0; i < 50; i++) enemy.takeDamage(10);
        }).not.toThrow();
    });

    it('boss phase 1 attack is clamped to phase 2 floor', async () => {
        // Boss-phase clamp: a single huge hit shouldn't skip phases. A
        // boss in P1 absorbing 200 damage when on 100 HP / 100 max should
        // land at the P2 floor, not 0.
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_BOSS', hp: 100, dmg: 5, sector: 1, actionsPerTurn: 2 },
            0
        );
        // Strip the multi-phase function so the test isolates the clamp logic
        // (without it, checkPhase fires phase transitions which we don't have
        // a phase-list for in this minimal template).
        enemy.checkPhase = () => {};
        enemy.takeDamage(200);
        // Should have clamped at P2 floor (50% - 1 = 49), not gone to 0.
        expect(enemy.currentHp).toBeGreaterThan(0);
        expect(enemy.currentHp).toBeLessThan(50);
    });

    it('takeDamage with bypassShield skips the shield reservoir', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 5, sector: 1, actionsPerTurn: 1 },
            0
        );
        enemy.shield = 999;
        enemy.takeDamage(10, null, false, /* bypassShield */ true);
        expect(enemy.shield).toBe(999);
        expect(enemy.currentHp).toBe(40);
    });

    it('zero-damage hit is handled cleanly', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 5, sector: 1, actionsPerTurn: 1 },
            0
        );
        enemy.shield = 5;
        const before = enemy.shield;
        enemy.takeDamage(0);
        expect(enemy.shield).toBe(before);
        expect(enemy.currentHp).toBe(50);
    });
});

describe('addEffect — debuff math', () => {
    it('weak applied to enemy halves outgoing damage via getEffectiveDamage', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 20, sector: 1, actionsPerTurn: 1 },
            0
        );
        enemy.addEffect('weak', 1, 0, '🦠', '50% less Dmg.', 'WEAK');
        // Base 20 → -50% → 10. Brittle/affixes are not in this template.
        expect(enemy.getEffectiveDamage()).toBe(10);
    });

    it('constrict stacks multiplicatively', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 20, sector: 1, actionsPerTurn: 1 },
            0
        );
        // 0.5 + 0.5 = 0.25 multiplier (multiplicative stack)
        enemy.addEffect('constrict', 3, 0.5, '🔗', 'Atk reduced.', 'CONSTRICT');
        enemy.addEffect('constrict', 3, 0.5, '🔗', 'Atk reduced.', 'CONSTRICT');
        const fx = enemy.hasEffect('constrict');
        expect(fx.val).toBe(0.25);
    });

    it('bleed stacks cap at 3', async () => {
        const { Enemy } = await import('../entities/enemy.js');
        const enemy = new Enemy(
            { name: 'TEST_DUMMY', hp: 50, dmg: 5, sector: 1, actionsPerTurn: 1 },
            0
        );
        for (let i = 0; i < 10; i++) {
            enemy.addEffect('bleed', 3, 2, '🩸', '2 DMG/turn', 'BLEED');
        }
        const bleed = enemy.hasEffect('bleed');
        expect(bleed.stacks).toBe(3);
    });
});
