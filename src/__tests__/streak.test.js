// Streak service — verifies milestone claiming + grace-day forgiveness.

import { describe, it, expect, beforeEach } from 'vitest';
import { Streak } from '../services/streak.js';

function setToday(dateStr) {
    // Freeze Date for this test tick. vitest/jsdom's Date is mutable; we
    // approximate by setting a fake "today" via Date.now override.
    const t = new Date(dateStr + 'T00:00:00Z').getTime();
    globalThis.Date.now = () => t;
}

beforeEach(() => {
    localStorage.clear();
});

describe('Streak.tick()', () => {
    it('awards the day-1 milestone on first login', () => {
        setToday('2024-01-01');
        const r = Streak.tick();
        expect(r.newStreak).toBe(1);
        expect(r.claimedReward).toBe(true);
        expect(r.milestone && r.milestone.day).toBe(1);
    });

    it('increments on consecutive day', () => {
        setToday('2024-01-01');
        Streak.tick();
        setToday('2024-01-02');
        const r = Streak.tick();
        expect(r.newStreak).toBe(2);
    });

    it('resets on a 3-day gap', () => {
        setToday('2024-01-01');
        Streak.tick();
        setToday('2024-01-05');
        const r = Streak.tick();
        expect(r.newStreak).toBe(1);
    });

    it('forgives a single missed day via grace', () => {
        setToday('2024-01-01');
        Streak.tick();
        // skip 2024-01-02
        setToday('2024-01-03');
        const r = Streak.tick();
        expect(r.newStreak).toBe(2);
        expect(r.usedGrace).toBe(true);
    });
});
