// Progressive feature unlocks.
// Hides complexity on fresh installs. Each feature has a gate that flips
// to `true` when its unlock condition is met (stored in localStorage).
// Game code calls `Unlocks.check()` on relevant events; the HUD reads
// `Unlocks.has(key)` to decide whether to render the button.

import { Analytics } from './analytics.js';

const KEY = 'mvm_unlocks_v1';

const DEFAULT = {
    daily: false,       // first run complete (win or lose)
    ascension: false,   // first Sector 5 clear
    corrupted: false,   // first event reward choice
    intel: false,       // first boss elite drop
    shop: false         // first shop visit (visual only — doesn't hide button)
};

function read() {
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
        return { ...DEFAULT, ...raw };
    } catch (e) {
        return { ...DEFAULT };
    }
}
function write(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export const Unlocks = {
    _state: null,

    init() {
        this._state = read();
    },

    has(key) {
        if (!this._state) this.init();
        return !!this._state[key];
    },

    grant(key, reason) {
        if (!this._state) this.init();
        if (this._state[key]) return false;
        this._state[key] = true;
        write(this._state);
        Analytics.emit('feature_unlocked', { key, reason: reason || 'condition_met' });
        // Light the +NEW badge on the next main-menu render.
        document.body.dataset.newUnlock = key;
        return true;
    },

    // Apply gating to the main menu. Called when the menu opens.
    applyMenuVisibility() {
        // Only gate buttons that actually exist on the main menu. Ascension is a
        // run-start modifier (shown on char-select), not a standalone menu item.
        const map = {
            daily: 'btn-daily',
            intel: 'btn-intel'
        };
        for (const [key, id] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (this.has(key)) {
                el.classList.remove('locked-feature');
                // Badge "+NEW" on newly unlocked
                if (document.body.dataset.newUnlock === key) {
                    el.classList.add('just-unlocked');
                    setTimeout(() => el.classList.remove('just-unlocked'), 5000);
                    delete document.body.dataset.newUnlock;
                }
            } else {
                el.classList.add('locked-feature');
            }
        }
    }
};
