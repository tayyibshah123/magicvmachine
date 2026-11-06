import { STATE } from '../constants.js';

const BLOCKERS = '#intro-overlay, #onboarding-overlay, #cipher-intro, #sector-intro.active, '
    + '#tutorial-overlay, #tutorial-spotlight, .class-briefing-overlay.active, .info-overlay, '
    + '.modal, [role="dialog"], [aria-modal="true"]';

export function isConsentSurfaceSafe(state, doc = document) {
    if (doc.hidden || ![STATE.MENU, STATE.MAP].includes(state)
        || doc.body.classList.contains('breakout-active')) return false;
    return ![...doc.querySelectorAll(BLOCKERS)].some(node => {
        if (node.closest('.hidden, [hidden], [aria-hidden="true"]')) return false;
        for (let current = node; current?.nodeType === 1; current = current.parentElement) {
            const style = doc.defaultView.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
    });
}

// Automatic consent belongs to a quiet menu/map, never a committed game
// action. Both the display lifetime and a queued click recheck that rule.
export function createConsentController({ read, write, render, getState,
    doc = document, win = window, idleMs = 1200, pollMs = 250 }) {
    let banner = null, timer = null, observer = null, started = false, settled = false;
    let surface = getState(), safeSince = null, lastInteraction = Date.now();
    const hide = () => { banner?.remove(); banner = null; };
    const interaction = event => {
        if (event.target?.nodeType && banner?.contains(event.target)) return;
        // Keyboard users must be able to reach the offered buttons without
        // the first Tab or Shift removing them from the focus order.
        if (banner && event.type === 'keydown' && ['Tab', 'Shift'].includes(event.key)) return;
        lastInteraction = Date.now();
        hide();
        refresh();
    };
    const changedVisibility = () => refresh({ resetIdle: true });
    const changedStorage = () => refresh();
    function dispose() {
        clearInterval(timer);
        timer = null;
        observer?.disconnect();
        for (const event of ['pointerdown', 'touchstart', 'click', 'keydown']) win.removeEventListener(event, interaction, true);
        doc.removeEventListener('visibilitychange', changedVisibility);
        win.removeEventListener('storage', changedStorage);
        hide();
    }
    function settle() { settled = true; dispose(); }
    function choose(value, button) {
        if (settled || read() !== null || !banner?.isConnected || !button?.isConnected
            || !banner.contains(button) || getState() !== surface
            || !isConsentSurfaceSafe(getState(), doc) || safeSince === null
            || Date.now() - Math.max(safeSince, lastInteraction) < idleMs) {
            refresh({ resetIdle: true });
            return;
        }
        settle();
        write(value);
    }
    function refresh({ resetIdle = false } = {}) {
        if (settled) return;
        if (read() !== null) { settle(); return; }
        const state = getState();
        const safe = isConsentSurfaceSafe(state, doc);
        if (resetIdle || state !== surface || !safe) {
            hide();
            safeSince = null;
            if (resetIdle) lastInteraction = Date.now();
        }
        surface = state;
        if (!safe) return;
        if (safeSince === null) safeSince = Date.now();
        if (!banner && Date.now() - Math.max(safeSince, lastInteraction) >= idleMs) banner = render(choose);
    }
    function start() {
        if (started || settled) return;
        started = true;
        if (read() !== null) { settle(); return; }
        for (const event of ['pointerdown', 'touchstart', 'click', 'keydown']) {
            win.addEventListener(event, interaction, { capture: true, passive: true });
        }
        doc.addEventListener('visibilitychange', changedVisibility);
        win.addEventListener('storage', changedStorage);
        const Observer = doc.defaultView.MutationObserver;
        observer = new Observer(records => {
            // Ignore ordinary HUD text and menu animation style updates.
            const relevant = records.some(record => record.type === 'attributes'
                ? record.target === doc.body || record.target.matches(BLOCKERS) || record.target.closest(BLOCKERS)
                : [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1
                    && (node.matches(BLOCKERS) || node.querySelector(BLOCKERS))));
            if (relevant) refresh();
        });
        observer.observe(doc.body, { childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'] });
        timer = setInterval(refresh, pollMs);
        refresh();
    }
    return { start, refresh, settle, dispose };
}
