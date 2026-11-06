import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createConsentController } from '../services/consent.js';
import { STATE } from '../constants.js';

let state, choice, controller, write;
const banner = () => document.getElementById('analytics-consent-banner');
const allow = () => document.querySelector('[data-consent="granted"]');
const decline = () => document.querySelector('[data-consent="denied"]');

beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="gameplay">Map node</button>';
    document.body.className = '';
    state = STATE.MAP;
    choice = null;
    write = vi.fn(value => { choice = value; });
    controller = createConsentController({ getState: () => state, read: () => choice, write,
        idleMs: 1000, pollMs: 100, render: onChoice => {
            const element = document.createElement('div');
            element.id = 'analytics-consent-banner';
            element.innerHTML = '<button data-consent="granted">Allow</button><button data-consent="denied">Decline</button>';
            for (const button of element.querySelectorAll('button')) {
                button.onclick = () => onChoice(button.dataset.consent === 'granted', button);
            }
            document.body.appendChild(element);
            return element;
        } });
    controller.start();
});

afterEach(() => {
    controller.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('automatic consent stays outside gameplay and active input', () => {
    it('waits for a complete quiet safe-screen interval before offering a real choice', async () => {
        await vi.advanceTimersByTimeAsync(999);
        expect(banner()).toBeNull();
        await vi.advanceTimersByTimeAsync(1);
        expect(banner()).not.toBeNull();
        decline().click();
        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith(false);
        expect(banner()).toBeNull();
        await vi.advanceTimersByTimeAsync(10000);
        expect(banner()).toBeNull();
    });

    it('removes map consent immediately on combat entry and rejects a previously queued Allow click', async () => {
        await vi.advanceTimersByTimeAsync(1000);
        const stale = allow();
        state = STATE.COMBAT;
        controller.refresh({ resetIdle: true });
        expect(banner()).toBeNull();
        stale.click();
        expect(write).not.toHaveBeenCalled();
        expect(choice).toBeNull();
        state = STATE.MENU;
        controller.refresh({ resetIdle: true });
        await vi.advanceTimersByTimeAsync(1000);
        expect(banner()).not.toBeNull();
        stale.click();
        expect(write).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1000);
        decline().click();
        expect(choice).toBe(false);
    });

    it('rejects a click even if an unsafe state arrived before the explicit lifecycle hook', async () => {
        await vi.advanceTimersByTimeAsync(1000);
        const stale = allow();
        state = STATE.COMBAT;
        stale.click();
        expect(choice).toBeNull();
        expect(banner()).toBeNull();
    });

    it('defers while repeated map input is in progress and hides before the next outside tap', async () => {
        for (let i = 0; i < 3; i++) {
            await vi.advanceTimersByTimeAsync(900);
            document.getElementById('gameplay').dispatchEvent(new Event('pointerdown', { bubbles: true }));
            expect(banner()).toBeNull();
        }
        await vi.advanceTimersByTimeAsync(1000);
        expect(banner()).not.toBeNull();
        document.getElementById('gameplay').click();
        expect(banner()).toBeNull();
        expect(write).not.toHaveBeenCalled();
    });

    it('starts a fresh quiet interval when moving between two otherwise safe screens', async () => {
        await vi.advanceTimersByTimeAsync(900);
        state = STATE.MENU;
        controller.refresh({ resetIdle: true });
        await vi.advanceTimersByTimeAsync(900);
        expect(banner()).toBeNull();
        await vi.advanceTimersByTimeAsync(100);
        expect(banner()).not.toBeNull();
    });

    it('keeps visible choices available while keyboard users Tab or Shift-Tab from the surrounding menu', async () => {
        await vi.advanceTimersByTimeAsync(1000);
        document.getElementById('gameplay').focus();
        document.getElementById('gameplay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        document.getElementById('gameplay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
        document.getElementById('gameplay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        expect(banner()).not.toBeNull();
        decline().focus();
        expect(document.activeElement).toBe(decline());
        decline().click();
        expect(choice).toBe(false);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it.each(['intro-overlay', 'onboarding-overlay', 'cipher-intro'])('waits through %s and only returns after a new safe interval', async id => {
        const overlay = document.createElement('div');
        overlay.id = id;
        document.body.appendChild(overlay);
        await vi.advanceTimersByTimeAsync(5000);
        expect(banner()).toBeNull();
        overlay.remove();
        await vi.advanceTimersByTimeAsync(1100);
        expect(banner()).not.toBeNull();
    });

    it('rejects a same-tick click when a new teaching dialog has covered the map', async () => {
        await vi.advanceTimersByTimeAsync(1000);
        const stale = allow();
        const dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        document.body.appendChild(dialog);
        stale.click();
        expect(choice).toBeNull();
        expect(banner()).toBeNull();
        dialog.remove();
        await vi.advanceTimersByTimeAsync(1100);
        expect(banner()).not.toBeNull();
    });

    it('observes a settings modal opening without needing a screen change', async () => {
        const modal = document.createElement('div');
        modal.className = 'modal hidden';
        document.body.appendChild(modal);
        await vi.advanceTimersByTimeAsync(1000);
        expect(banner()).not.toBeNull();
        modal.classList.remove('hidden');
        await Promise.resolve();
        expect(banner()).toBeNull();
        modal.classList.add('hidden');
        await vi.advanceTimersByTimeAsync(1100);
        expect(banner()).not.toBeNull();
    });

    it('hides in a backgrounded document and waits after visibility returns', async () => {
        const visibility = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        await vi.advanceTimersByTimeAsync(1000);
        const stale = allow();
        visibility.mockReturnValue(true);
        document.dispatchEvent(new Event('visibilitychange'));
        expect(banner()).toBeNull();
        stale.click();
        expect(choice).toBeNull();
        visibility.mockReturnValue(false);
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(1000);
        expect(banner()).not.toBeNull();
    });

    it('removes every watcher and pending automatic display on explicit settlement', async () => {
        controller.settle();
        await vi.advanceTimersByTimeAsync(10000);
        document.getElementById('gameplay').click();
        controller.refresh();
        expect(banner()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });
});
