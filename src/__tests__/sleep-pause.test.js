// Pause-aware sleep() — combat callbacks must NOT resume mid-flow while
// the game is paused (tab hidden, modal open). Real-time setTimeout
// fires on its own schedule; sleep() defers the actual resolution
// until `Game.paused` clears.

import { describe, it, expect, beforeEach, vi } from 'vitest';

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

describe('Game.sleep — pause awareness', () => {
    it('resolves normally when not paused', async () => {
        const { Game } = await import('../game.js');
        Game.paused = false;
        const start = Date.now();
        await Game.sleep(50);
        const elapsed = Date.now() - start;
        // Sleep ms is scaled by combatPaceMult (default 1). 50ms target,
        // allow generous slack for jsdom timer jitter.
        expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('does NOT resolve while Game.paused is true', async () => {
        const { Game } = await import('../game.js');
        Game.paused = true;
        let resolved = false;
        Game.sleep(20).then(() => { resolved = true; });
        // Wait well past the sleep duration. Even after 200ms the promise
        // must still be pending because the game is paused.
        await new Promise(r => setTimeout(r, 250));
        expect(resolved).toBe(false);
        // Cleanup — clear pause so the deferred resolve eventually fires.
        Game.paused = false;
        await new Promise(r => setTimeout(r, 250));
        expect(resolved).toBe(true);
    });

    it('resumes the moment pause clears', async () => {
        const { Game } = await import('../game.js');
        Game.paused = false;
        const sleepPromise = Game.sleep(20);
        // Pause MID-sleep (between schedule and resolve).
        await new Promise(r => setTimeout(r, 5));
        Game.paused = true;
        // Allow the inner setTimeout to fire — it'll see paused and defer.
        await new Promise(r => setTimeout(r, 50));
        // Promise still pending.
        let resolved = false;
        sleepPromise.then(() => { resolved = true; });
        await new Promise(r => setTimeout(r, 50));
        expect(resolved).toBe(false);
        // Unpause — within ~200ms (poll cadence) the resolve should fire.
        Game.paused = false;
        await new Promise(r => setTimeout(r, 300));
        expect(resolved).toBe(true);
    });

    it('honours combatPaceMult scaling on the base wait', async () => {
        const { Game } = await import('../game.js');
        Game.paused = false;
        Game.combatPaceMult = 2; // 2x faster
        const start = Date.now();
        await Game.sleep(100);
        const elapsed = Date.now() - start;
        // Scaled to 50ms. Allow slack for jitter.
        expect(elapsed).toBeLessThan(150);
        Game.combatPaceMult = 1;
    });
});
