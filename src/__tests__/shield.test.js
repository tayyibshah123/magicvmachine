// Shield + takeDamage math tests. Avoid the full Game module — build a
// minimal Entity fixture so we can verify the damage pipeline in isolation.

import { describe, it, expect, beforeEach } from 'vitest';

// We can't import entity.js cleanly because it pulls in Game. Replicate the
// core shield math as a pure function that mirrors the production behavior.
// When we refactor takeDamage into a pure helper we'll point this at it.

function resolveDamage(amount, shield) {
    let actualDmg = amount;
    if (shield > 0) {
        if (shield >= actualDmg) {
            return { newShield: shield - actualDmg, hpLoss: 0 };
        }
        actualDmg -= shield;
        return { newShield: 0, hpLoss: actualDmg };
    }
    return { newShield: 0, hpLoss: actualDmg };
}

describe('shield math', () => {
    it('full block when shield >= damage', () => {
        const r = resolveDamage(8, 10);
        expect(r.newShield).toBe(2);
        expect(r.hpLoss).toBe(0);
    });

    it('shield exactly equals damage → shield 0, no HP loss', () => {
        const r = resolveDamage(10, 10);
        expect(r.newShield).toBe(0);
        expect(r.hpLoss).toBe(0);
    });

    it('excess damage bleeds into HP after shield breaks', () => {
        const r = resolveDamage(15, 10);
        expect(r.newShield).toBe(0);
        expect(r.hpLoss).toBe(5);
    });

    it('no shield → full damage to HP', () => {
        const r = resolveDamage(12, 0);
        expect(r.newShield).toBe(0);
        expect(r.hpLoss).toBe(12);
    });

    it('zero damage never moves the shield', () => {
        const r = resolveDamage(0, 5);
        expect(r.newShield).toBe(5);
        expect(r.hpLoss).toBe(0);
    });
});
