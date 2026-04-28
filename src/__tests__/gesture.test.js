// Edge-swipe back gesture — guard / dispatch behavior.
//
// We verify the rules the player would actually feel:
// - swipe-from-edge dismisses the visible modal
// - mid-screen swipes don't
// - vertical drift doesn't
// - dice-drag in progress suppresses the gesture
// - hack minigame can't be swiped out of

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Gesture } from '../services/gesture.js';

function makeTouch(clientX, clientY) {
    return { clientX, clientY };
}

function fire(type, touches) {
    const ev = new Event(type, { bubbles: true });
    ev.touches = touches;
    document.dispatchEvent(ev);
}

function buildModal(id, hidden = false) {
    const el = document.createElement('div');
    el.id = id;
    if (hidden) el.classList.add('hidden');
    document.body.appendChild(el);
    return el;
}

beforeEach(() => {
    document.body.innerHTML = '';
    delete window.Capacitor;
    window.Game = { dragState: { active: false } };
    Gesture.init();
});

describe('Gesture (edge-swipe back)', () => {
    it('dismisses the visible modal on a left-edge → right swipe', () => {
        const modal = buildModal('modal-glossary');
        const btn = document.createElement('button');
        btn.id = 'btn-glossary-close';
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });
        modal.appendChild(btn);

        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 205)]);
        expect(clicked).toBe(true);
    });

    it('ignores swipes that start away from the edge', () => {
        const modal = buildModal('modal-glossary');
        const btn = document.createElement('button');
        btn.id = 'btn-glossary-close';
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });
        modal.appendChild(btn);

        fire('touchstart', [makeTouch(200, 200)]);
        fire('touchmove',  [makeTouch(280, 205)]);
        expect(clicked).toBe(false);
    });

    it('ignores mostly-vertical drags', () => {
        const modal = buildModal('modal-glossary');
        const btn = document.createElement('button');
        btn.id = 'btn-glossary-close';
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });
        modal.appendChild(btn);

        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 400)]);
        expect(clicked).toBe(false);
    });

    it('does nothing when no modal is visible', () => {
        // No modal in DOM at all — should not throw.
        expect(() => {
            fire('touchstart', [makeTouch(10, 200)]);
            fire('touchmove',  [makeTouch(85, 205)]);
        }).not.toThrow();
    });

    it('aborts when a die drag is in progress', () => {
        const modal = buildModal('modal-glossary');
        const btn = document.createElement('button');
        btn.id = 'btn-glossary-close';
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });
        modal.appendChild(btn);

        window.Game.dragState.active = true;
        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 205)]);
        expect(clicked).toBe(false);
    });

    it('refuses to dismiss the hack minigame overlay', () => {
        const hack = buildModal('hack-minigame-overlay');
        // Glossary is also visible but the hack overlay is higher in the
        // registry, so the gesture lands on the block-list entry and bails.
        const modal = buildModal('modal-glossary');
        const btn = document.createElement('button');
        btn.id = 'btn-glossary-close';
        let clicked = false;
        btn.addEventListener('click', () => { clicked = true; });
        modal.appendChild(btn);

        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 205)]);
        expect(clicked).toBe(false);
    });

    it('calls a registered close function when set (custom-run)', () => {
        const modal = buildModal('custom-run-modal');
        let called = false;
        window.Game._closeCustomRunModal = () => { called = true; };

        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 205)]);
        expect(called).toBe(true);
    });
});

describe('Gesture (native platform skip)', () => {
    it('does not register touch listeners when Capacitor reports native', async () => {
        vi.resetModules();
        window.Capacitor = { isNativePlatform: () => true };

        // Spy on document.addEventListener BEFORE importing the module
        // so the init's listener registration is observable. Module-level
        // listeners persist across tests in jsdom, so verifying side
        // effects via add/dispatch doesn't work — pure spy is reliable.
        const addSpy = vi.spyOn(document, 'addEventListener');
        const { Gesture: NativeGesture } = await import('../services/gesture.js');
        NativeGesture.init();

        const touchCalls = addSpy.mock.calls.filter(
            ([type]) => type === 'touchstart' || type === 'touchmove'
                     || type === 'touchend'  || type === 'touchcancel'
        );
        expect(touchCalls.length).toBe(0);

        addSpy.mockRestore();
        delete window.Capacitor;
    });
});
