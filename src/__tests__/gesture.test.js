// Edge-swipe back gesture — guard / dispatch behavior.
//
// We verify the rules the player would actually feel:
// - swipe-from-edge dismisses the visible modal
// - mid-screen swipes don't
// - vertical drift doesn't
// - dice-drag in progress suppresses the gesture
// - hack minigame can't be swiped out of

import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { Gesture } from '../services/gesture.js';
import { trackBrowserListeners } from './helpers/browser-events.js';

let cleanupListeners;

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
    cleanupListeners = trackBrowserListeners();
    Gesture.init();
});

afterEach(() => {
    document.dispatchEvent(new Event('touchcancel'));
    cleanupListeners();
    vi.restoreAllMocks();
    delete window.Game;
    delete window.Capacitor;
});

describe('Gesture (edge-swipe back)', () => {
    it('dismisses the visible modal on a left-edge → right swipe', () => {
        const modal = buildModal('modal-glossary');
        const btn = document.createElement('button');
        btn.id = 'btn-glossary-close';
        const clicked = vi.fn();
        btn.addEventListener('click', clicked);
        modal.appendChild(btn);

        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 205)]);
        fire('touchmove', [makeTouch(120, 205)]);
        fire('touchend', []);
        expect(clicked).toHaveBeenCalledTimes(1);
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
        const called = vi.fn();
        window.Game._closeCustomRunModal = called;

        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove',  [makeTouch(85, 205)]);
        expect(called).toHaveBeenCalledTimes(1);
    });

    it.each(['touchcancel', 'touchend'])('abandons a gesture after %s', type => {
        const modal = buildModal('modal-glossary');
        modal.innerHTML = '<button id="btn-glossary-close"></button>';
        const close = vi.fn();
        modal.firstChild.addEventListener('click', close);
        fire('touchstart', [makeTouch(10, 200)]);
        fire(type, []);
        fire('touchmove', [makeTouch(100, 200)]);
        expect(close).not.toHaveBeenCalled();
    });

    it.each(['start', 'move'])('abandons multi-touch at gesture %s', phase => {
        const modal = buildModal('modal-glossary');
        modal.innerHTML = '<button id="btn-glossary-close"></button>';
        const close = vi.fn();
        modal.firstChild.addEventListener('click', close);
        fire('touchstart', phase === 'start'
            ? [makeTouch(10, 200), makeTouch(15, 250)] : [makeTouch(10, 200)]);
        if (phase === 'move') fire('touchmove', [makeTouch(20, 200), makeTouch(25, 250)]);
        fire('touchmove', [makeTouch(100, 200)]);
        expect(close).not.toHaveBeenCalled();
    });

    it('dismisses only the top modal during one continuous swipe', () => {
        const settings = buildModal('modal-settings');
        settings.innerHTML = '<button id="btn-resume"></button>';
        const glossary = buildModal('modal-glossary');
        glossary.innerHTML = '<button id="btn-glossary-close"></button>';
        const closeSettings = vi.fn();
        const closeGlossary = vi.fn(() => glossary.classList.add('hidden'));
        settings.firstChild.addEventListener('click', closeSettings);
        glossary.firstChild.addEventListener('click', closeGlossary);
        fire('touchstart', [makeTouch(10, 200)]);
        fire('touchmove', [makeTouch(85, 205)]);
        fire('touchmove', [makeTouch(150, 205)]);
        expect(closeGlossary).toHaveBeenCalledTimes(1);
        expect(closeSettings).not.toHaveBeenCalled();
    });
});

describe('Gesture (native platform skip)', () => {
    it('does not register touch listeners when Capacitor reports native', async () => {
        vi.resetModules();
        window.Capacitor = { isNativePlatform: () => true };

        const addSpy = vi.spyOn(document, 'addEventListener');
        addSpy.mockClear();
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
