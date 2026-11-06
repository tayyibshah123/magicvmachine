import { vi } from 'vitest';
import { Game } from '../../game.js';
import { STATE } from '../../constants.js';

// Exercise the production descriptor renderer against the fixture's shared
// Date/performance clock. No effect is manually removed to settle an action.
export async function renderFrames(intervals) {
    for (const interval of intervals) {
        await vi.advanceTimersByTimeAsync(interval);
        if (!Game.paused && !document.hidden && [STATE.COMBAT, STATE.TUTORIAL_COMBAT, STATE.BREAKOUT].includes(Game.currentState)) {
            Game.drawEffects();
        }
    }
}

export async function renderFor(ms, fps = 30) {
    const frames = Math.floor(ms * fps / 1000);
    const intervals = [];
    let previous = 0;
    for (let frame = 1; frame <= frames; frame++) {
        const next = Math.round(frame * 1000 / fps);
        intervals.push(next - previous);
        previous = next;
    }
    await renderFrames(intervals);
    if (previous < ms) await vi.advanceTimersByTimeAsync(ms - previous);
}
