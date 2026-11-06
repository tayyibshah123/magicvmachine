// Streak service — verifies milestone claiming + grace-day forgiveness.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Streak } from '../services/streak.js';

function setToday(dateStr) {
    vi.setSystemTime(new Date(dateStr + 'T00:00:00Z'));
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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

    it('does not grant rewards twice on the same UTC day', () => {
        setToday('2024-01-01');
        Streak.tick();
        expect(Streak.tick()).toMatchObject({ newStreak: 1, claimedReward: false, bonusFragments: 0, milestone: null });
        expect(JSON.parse(localStorage.getItem('mvm_streak_milestones'))).toEqual([1]);
    });

    it.each([[6, false, 1], [7, true, 6]])('enforces the seven-day grace window at %s days', (gap, forgiven, count) => {
        setToday('2024-04-16');
        localStorage.setItem('mvm_streak_last', '2024-04-14');
        localStorage.setItem('mvm_streak_count', '5');
        localStorage.setItem('mvm_streak_grace_last', gap === 6 ? '2024-04-10' : '2024-04-09');
        expect(Streak.tick()).toMatchObject({ newStreak: count, usedGrace: forgiven });
    });

    it.each([[3, 30, 2], [7, 75, 5], [14, 150, 10], [30, 300, 20], [100, 1000, 50]])('grants day %s milestone Sparks exactly once', (day, fragments, sparks) => {
        setToday('2024-04-16');
        localStorage.setItem('mvm_streak_last', '2024-04-15');
        localStorage.setItem('mvm_streak_count', String(day - 1));
        const prior = window.Game;
        const grantSparks = vi.fn();
        window.Game = { grantSparks };
        try {
            const result = Streak.tick();
            expect(result).toMatchObject({ newStreak: day, bonusFragments: fragments, bonusSparks: sparks, milestone: { day } });
            expect(Streak.tick().claimedReward).toBe(false);
            expect(grantSparks).toHaveBeenCalledTimes(1);
            expect(grantSparks).toHaveBeenCalledWith(sparks, `streak_d${day}`, { silent: true });
        } finally {
            if (prior === undefined) delete window.Game;
            else window.Game = prior;
        }
    });

    it('does not reclaim the first milestone after a broken streak', () => {
        setToday('2024-01-01');
        Streak.tick();
        setToday('2024-02-01');
        expect(Streak.tick()).toMatchObject({ newStreak: 1, milestone: null, bonusFragments: 6 });
    });

    it('handles the year boundary and awards the daily tail after day 100', () => {
        setToday('2024-01-01');
        localStorage.setItem('mvm_streak_last', '2023-12-31');
        localStorage.setItem('mvm_streak_count', '100');
        expect(Streak.tick()).toMatchObject({ newStreak: 101, milestone: null, bonusFragments: 15 });
        expect(Streak.current()).toBe(101);
        expect(Streak.nextMilestone()).toBeNull();
    });

    it.each(['{', 'null', '{}'])('recovers malformed claimed milestones %s without crashing login', raw => {
        setToday('2024-01-01');
        localStorage.setItem('mvm_streak_milestones', raw);
        expect(() => Streak.tick()).not.toThrow();
        expect(Streak.current()).toBe(1);
    });

    it('still permits login when storage is blocked', () => {
        setToday('2024-01-01');
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
        expect(() => Streak.tick()).not.toThrow();
    });
});
