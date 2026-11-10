// Progressive feature unlocks.
// Hides complexity on fresh installs. Each feature has a gate that flips
// to `true` when its unlock condition is met (stored in localStorage).
// Game code calls `Unlocks.check()` on relevant events; the HUD reads
// `Unlocks.has(key)` to decide whether to render the button.

import { Analytics } from './analytics.js';
import { STATE } from '../constants.js';

const KEY = 'mvm_unlocks_v1';
const PENDING_KEY = 'mvm_unlock_announcements_v1';

const DEFAULT = {
    daily: false,       // first run complete (win or lose) → CHALLENGE
    ascension: false,   // first Sector 5 clear → ARCHIVE / Ascension picker
    corrupted: false,   // first event reward choice
    intel: false,       // first boss elite drop → INTEL
    shop: false,        // first shop visit (visual only — doesn't hide button)
    sanctuary: false,   // first Spark earned → SANCTUARY
    saves: false        // first run started → SAVES
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
        try {
            const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
            this._pending = [...new Set(Array.isArray(saved) ? saved : [])].filter(key => key in DEFAULT);
        } catch (_) { this._pending = []; }
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
        this._pending ||= [];
        if (!this._pending.includes(key)) this._pending.push(key);
        this._savePending();
        return true;
    },

    // Apply gating to the main menu. Called when the menu opens.
    // New players see ONLY the INITIATE RUN button + settings gear.
    // Other entries reveal as their unlock conditions trigger so the
    // first-run experience is uncluttered. Each unlock plays a brief
    // "just-unlocked" pulse the next time the menu is reached.
    applyMenuVisibility() {
        const map = {
            // Legacy `daily` unlock key now drives the CHALLENGE entry.
            daily:     'btn-challenge',
            intel:     'btn-intel',
            sanctuary: 'btn-upgrades',
            saves:     'btn-save-slots'
        };
        for (const [key, id] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (!el) continue;
            const unlocked = this.has(key);
            // Fully hide locked features (was: dim only). Cleaner first-
            // run menu — only the primary CTA shows until the player
            // actually unlocks each surface. The container row collapses
            // when all of its children are hidden via CSS rules.
            el.classList.toggle('feature-locked-hidden', !unlocked);
            el.classList.toggle('locked-feature', !unlocked); // legacy hook for any styling
        }
        const preset = document.getElementById('btn-gauntlet-preset');
        preset?.classList.toggle('feature-locked-hidden', !this.has('daily'));
        // Daily-twist pill is conditional on Challenge being unlocked.
        const twist = document.getElementById('challenge-daily-twist');
        if (twist) twist.classList.toggle('feature-locked-hidden', !this.has('daily'));
        // Also hide the entire menu row when every button inside is
        // locked, so we don't render an empty bordered row.
        document.querySelectorAll('.menu-row').forEach(row => {
            const visible = Array.from(row.querySelectorAll('.btn'))
                .some(b => !b.classList.contains('feature-locked-hidden') && !b.classList.contains('hidden'));
            row.classList.toggle('feature-locked-hidden', !visible);
        });
        this._announceNext(map);
    },

    _savePending() {
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(this._pending)); } catch (_) {}
    },

    _announceNext(map) {
        if (this._announcing) return;
        this._pending ||= [];
        const game = typeof window !== 'undefined' && window.Game;
        if (document.hidden || game && game.currentState !== STATE.MENU) return;
        const key = this._pending.find(key => map[key] && document.getElementById(map[key]));
        if (!key) return;
        this._announcing = key;
        const el = document.getElementById(map[key]);
        el.classList.add('just-unlocked');
        setTimeout(() => {
            el.classList.remove('just-unlocked');
            this._announcing = null;
            const liveGame = typeof window !== 'undefined' && window.Game;
            if (document.hidden || liveGame && liveGame.currentState !== STATE.MENU) return;
            this._pending = this._pending.filter(item => item !== key);
            this._savePending();
            this._announceNext(map);
        }, 5000);
    }
};
