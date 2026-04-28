// Edge-swipe back gesture. Swiping right from the left edge of the
// screen dismisses the topmost modal/overlay — the iOS-native "back"
// gesture pattern, replicated so a returning player's muscle memory
// works without instruction.
//
// Why each guard exists:
// - Edge zone (24px): random horizontal scrolls in mid-screen don't
//   accidentally close a panel the player was reading.
// - Drag-state check: a die mid-drop must not get hijacked by the
//   gesture handler and trigger a modal close.
// - Block list: the hack minigame is a timed challenge; you can't
//   swipe out of it any more than you can swipe out of an iOS phone
//   call mid-ring.
// - Horizontal bias: a vertical scroll that drifts a few pixels right
//   shouldn't be misread as a back-gesture.

const EDGE_THRESHOLD_PX = 24;
const TRIGGER_DISTANCE_PX = 70;
const HORIZONTAL_BIAS = 1.4;

// Walked top-down. First entry whose modal is currently visible
// (lacks `.hidden`) wins. Order roughly matches z-stacking so a
// glossary opened on top of settings dismisses the glossary first.
const MODAL_REGISTRY = [
    { id: 'hack-minigame-overlay', block: true },
    { id: 'sanctuary-npc-modal', closeSelector: '[data-action="npc-close"]' },
    { id: 'modal-glossary', closeBtn: 'btn-glossary-close' },
    { id: 'modal-ios-install', closeBtn: 'btn-ios-install-close' },
    { id: 'modal-settings', closeBtn: 'btn-resume' },
    { id: 'loadout-modal', closeBtn: 'btn-loadout-close' },
    { id: 'custom-run-modal', closeFn: '_closeCustomRunModal' },
    { id: 'char-detail-overlay', closeBtn: 'btn-char-detail-back' },
    { id: 'save-slot-modal', closeBtn: 'btn-save-slot-close' },
];

let active = null;

function findTopmostModal() {
    for (const entry of MODAL_REGISTRY) {
        const el = document.getElementById(entry.id);
        if (!el) continue;
        if (el.classList.contains('hidden')) continue;
        return entry;
    }
    return null;
}

function dragInProgress() {
    const G = (typeof window !== 'undefined') ? window.Game : null;
    return !!(G && G.dragState && G.dragState.active);
}

function dismiss(entry) {
    if (entry.block) return;
    if (entry.closeFn) {
        const G = window.Game;
        if (G && typeof G[entry.closeFn] === 'function') G[entry.closeFn]();
        return;
    }
    if (entry.closeSelector) {
        const modal = document.getElementById(entry.id);
        const btn = modal && modal.querySelector(entry.closeSelector);
        if (btn) btn.click();
        return;
    }
    if (entry.closeBtn) {
        const btn = document.getElementById(entry.closeBtn);
        if (btn) btn.click();
    }
}

function onTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) { active = null; return; }
    if (dragInProgress()) { active = null; return; }
    const t = e.touches[0];
    if (t.clientX > EDGE_THRESHOLD_PX) { active = null; return; }
    const target = findTopmostModal();
    if (!target || target.block) { active = null; return; }
    active = { startX: t.clientX, startY: t.clientY, target, fired: false };
}

function onTouchMove(e) {
    if (!active || active.fired) return;
    if (!e.touches || e.touches.length !== 1) { active = null; return; }
    if (dragInProgress()) { active = null; return; }
    const t = e.touches[0];
    const dx = t.clientX - active.startX;
    const dy = t.clientY - active.startY;
    // Trigger as soon as the threshold is met — feels snappier than
    // waiting until touchend, and matches iOS's interruptible-back UX.
    if (dx >= TRIGGER_DISTANCE_PX && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS) {
        active.fired = true;
        dismiss(active.target);
    }
}

function onTouchEnd() {
    active = null;
}

export const Gesture = {
    init() {
        if (typeof document === 'undefined') return;
        // passive listeners — we never preventDefault here, so let the
        // browser keep its scroll-jank guarantees.
        document.addEventListener('touchstart', onTouchStart, { passive: true });
        document.addEventListener('touchmove', onTouchMove, { passive: true });
        document.addEventListener('touchend', onTouchEnd, { passive: true });
        document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    },
};
