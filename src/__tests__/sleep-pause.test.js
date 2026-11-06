import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';

beforeEach(() => {
    vi.useFakeTimers();
    Game.paused = false;
    Game.combatPaceMult = 1;
});

afterEach(() => {
    Game.paused = false;
    Game.combatPaceMult = 1;
    vi.clearAllTimers();
    vi.useRealTimers();
});

describe('Game.sleep pause awareness', () => {
    it.each([[1, 50, 50], [2, 100, 50], [0.5, 50, 100]])(
        'waits for the scaled boundary at pace %s', async (pace, requested, duration) => {
            Game.combatPaceMult = pace;
            const resolved = vi.fn();
            const sleep = Game.sleep(requested).then(resolved);
            await vi.advanceTimersByTimeAsync(duration - 1);
            expect(resolved).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(1);
            await sleep;
            expect(resolved).toHaveBeenCalledTimes(1);
        });

    it('keeps an initially paused wait pending until the player resumes', async () => {
        Game.paused = true;
        const resolved = vi.fn();
        const sleep = Game.sleep(20).then(resolved);
        await vi.advanceTimersByTimeAsync(5000);
        expect(resolved).not.toHaveBeenCalled();
        Game.paused = false;
        await vi.advanceTimersByTimeAsync(250);
        await sleep;
        expect(resolved).toHaveBeenCalledTimes(1);
    });

    it('does not resume an in-flight wait while a later pause is active', async () => {
        const resolved = vi.fn();
        const sleep = Game.sleep(20).then(resolved);
        await vi.advanceTimersByTimeAsync(5);
        Game.paused = true;
        await vi.advanceTimersByTimeAsync(5000);
        expect(resolved).not.toHaveBeenCalled();
        Game.paused = false;
        await vi.advanceTimersByTimeAsync(250);
        await sleep;
        expect(resolved).toHaveBeenCalledTimes(1);
    });
});
