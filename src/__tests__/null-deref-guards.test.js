// Regression tests for the deferred-callback / post-sleep null-deref
// crash class. We just hardened five paths in game.js where a captured
// `this.enemy` reference could be nulled between the schedule + the
// dereference. These tests lock the new guards in place — without
// them, the listed scenarios would throw "null is not an object
// (evaluating 'entity.x')" and surface the SYSTEM FAULT overlay.

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
    document.body.innerHTML = `
        <div id="game-container">
            <canvas id="gameCanvas" width="1080" height="1920"></canvas>
            <div id="dice-container"></div>
            <div id="reroll-badge"></div>
            <div id="hud"></div>
            <div id="tutorial-spotlight"></div>
            <div id="tutorial-overlay"></div>
            <div id="tutorial-text"></div>
            <div id="modal-settings"></div>
            <div id="screen-event"></div>
            <div id="screen-map"></div>
            <div id="combat-log"></div>
        </div>
    `;
});

describe('updateTutorialStep null-enemy guard', () => {
    it('returns cleanly when state is TUTORIAL_COMBAT but enemy is null', async () => {
        // Reproduces the SYSTEM FAULT we just fixed: setTimeout-deferred
        // updateTutorialStep call fires during the post-tutorial recap
        // fade-out window, when openPostTutorial has nulled `this.enemy`
        // but `currentState` hasn't transitioned out of TUTORIAL_COMBAT
        // yet. The new guard checks BOTH state and enemy.
        const { Game } = await import('../game.js');
        const { STATE } = await import('../constants.js');
        Game.currentState = STATE.TUTORIAL_COMBAT;
        Game.enemy = null;
        Game.tutorialStep = 6;
        // Should not throw — the guard bails on missing enemy.
        expect(() => Game.updateTutorialStep()).not.toThrow();
    });

    it('returns cleanly when state has changed away from TUTORIAL_COMBAT', async () => {
        const { Game } = await import('../game.js');
        const { STATE } = await import('../constants.js');
        Game.currentState = STATE.MAP;
        Game.enemy = null;
        Game.tutorialStep = 6;
        expect(() => Game.updateTutorialStep()).not.toThrow();
    });
});

describe('changeState dragState reset', () => {
    it('clears active drag when state changes mid-drag', async () => {
        const { Game } = await import('../game.js');
        const { STATE } = await import('../constants.js');
        // Simulate a drag in progress.
        Game.dragState = Game.dragState || {};
        Game.dragState.active = true;
        Game.dragState.die = { id: 1 };
        Game.dragState.dieElement = document.createElement('div');
        Game.dragState.ghostElement = document.createElement('div');
        Game.currentState = STATE.COMBAT;
        // Trigger a state change. We don't fully stand up a combat tick,
        // but changeState's drag teardown should run synchronously before
        // the rest of the transition logic.
        try { Game.changeState(STATE.MAP); } catch (_) {}
        expect(Game.dragState.active).toBe(false);
        expect(Game.dragState.die).toBeNull();
        expect(Game.dragState.ghostElement).toBeNull();
    });
});

describe('openPostTutorial null-safe DOM access', () => {
    it('does not throw when chrome elements are missing', async () => {
        const { Game } = await import('../game.js');
        // Nuke the tutorial chrome elements that openPostTutorial used to
        // dereference unconditionally. Replace minimal player so the
        // function's body can run without other side effects exploding.
        document.getElementById('hud')?.remove();
        document.getElementById('tutorial-overlay')?.remove();
        document.getElementById('tutorial-text')?.remove();
        Game.player = { maxHp: 30, currentHp: 30, mana: 3, baseMana: 3, shield: 0, effects: [], minions: [] };
        Game.map = Game.map || { nodes: [{ idx: 'start' }], currentIdx: 'start' };
        // Should not throw on missing DOM.
        expect(() => {
            try { Game.openPostTutorial(); } catch (e) {
                // openPostTutorial chains into _showPostTutorialRecap which
                // creates a body-level overlay — that path may have its
                // own state side-effects we don't reproduce here. The
                // contract this test locks: the FIRST stage (DOM cleanup)
                // never throws, even with chrome elements removed.
                if (/Cannot read|null is not|undefined is not/i.test(String(e.message))) throw e;
            }
        }).not.toThrow();
    });
});
