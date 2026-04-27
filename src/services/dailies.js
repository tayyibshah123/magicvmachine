// Challenge Mode service.
// Replaces the old date-seeded Daily Run with a "boss rush": every sector
// boss in a row, only a Rest node between each. No date seeding, no daily
// lockout — players can run the gauntlet whenever they want.
//
// File path is kept as `dailies.js` (and the export is aliased as `Dailies`)
// purely so callers and the legacy localStorage key namespace don't churn.
// Treat `Challenge` as the canonical name going forward.

const KEY_HISTORY = 'mvm_challenge_history';   // JSON array of {date, fragments, turns, ascension}
const KEY_ACTIVE  = 'mvm_challenge_active';    // '1' if the current run was started as Challenge

function todayString() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

// Daily Twist — a single rotating modifier that flavours every Challenge run
// played on a given UTC date. Picked deterministically from the date string so
// every player sees the same twist on the same day, making the leaderboard
// comparable. Effects are intentionally small (one knob each) so the gauntlet
// stays the focal point — the twist is texture, not a deck-rebuild.
const DAILY_TWISTS = [
    { id: 'shielded_foes', name: 'Shielded Foes', desc: '+5 shield on every enemy.',                     enemyShieldBonus: 5 },
    { id: 'frags_aplenty', name: 'Frags Aplenty', desc: '+25% Fragments from every kill.',               fragMult: 1.25 },
    { id: 'fortified',     name: 'Fortified',     desc: 'Start every fight with +10 shield.',            startShield: 10 },
    { id: 'open_market',   name: 'Open Market',   desc: 'All shop prices reduced by 20%.',               shopDiscount: 0.20 },
    { id: 'tight_hand',    name: 'Tight Hand',    desc: '-1 reroll per turn.',                           rerollDelta: -1 },
    { id: 'glassy',        name: 'Glassy',        desc: '+15% damage dealt, +15% damage taken.',         dmgOutMult: 1.15, dmgInMult: 1.15 },
    { id: 'siphon_day',    name: 'Siphon Day',    desc: '+1 Mana at every combat start.',                bonusMana: 1 }
];

// Stable string hash → array index. Same date string always picks same mod.
function hashIndex(str, mod) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h * 31) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % mod;
}

export const Challenge = {
    todayString,

    // The single Daily Twist for today's UTC date. Same for every player on
    // the same date so leaderboard scores are comparable. Returns a plain
    // object (id, name, desc, effect-flags) — Game reads the flags directly.
    todayTwist() {
        return DAILY_TWISTS[hashIndex(todayString(), DAILY_TWISTS.length)];
    },
    twists: DAILY_TWISTS,

    markActive(active) {
        if (active) localStorage.setItem(KEY_ACTIVE, '1');
        else localStorage.removeItem(KEY_ACTIVE);
    },
    isActive() { return localStorage.getItem(KEY_ACTIVE) === '1'; },

    markComplete(payload = {}) {
        const today = todayString();
        this.markActive(false);
        const history = this.getHistory();
        history.unshift({ date: today, ...payload });
        // Keep last 50 entries — the Challenge gauntlet is short, so players
        // may rip through several in a session.
        localStorage.setItem(KEY_HISTORY, JSON.stringify(history.slice(0, 50)));
    },

    getHistory() {
        try { return JSON.parse(localStorage.getItem(KEY_HISTORY) || '[]'); }
        catch { return []; }
    },

    // Personal-best leaderboard — score = (asc + 1) * fragments / (turns + 1).
    // Higher ascension and lower turn count both win against a fragment-grind.
    personalBest() {
        const h = this.getHistory();
        if (!h.length) return null;
        const score = (e) => ((e.ascension || 0) + 1) * (e.fragments || 0) / ((e.turns || 0) + 1);
        return h.reduce((best, cur) => (score(cur) > score(best) ? cur : best), h[0]);
    },
};

// Backwards-compat alias for callers that still reference `Dailies`. Remove
// once every callsite has been updated to `Challenge`.
export const Dailies = Challenge;

// Archive (Sector X) leaderboard. Separate track from Challenge so a quick
// 1-fight Archivist run isn't ranked against a 5-boss gauntlet — Roadmap
// Part 24.3 calls this out explicitly. Score formula favours low turn-count
// + high ascension, like Challenge, so the same readability applies.
const KEY_ARCH_HISTORY = 'mvm_archive_history';

export const Archive = {
    markComplete(payload = {}) {
        const today = todayString();
        const history = this.getHistory();
        history.unshift({ date: today, ...payload });
        localStorage.setItem(KEY_ARCH_HISTORY, JSON.stringify(history.slice(0, 50)));
    },
    getHistory() {
        try { return JSON.parse(localStorage.getItem(KEY_ARCH_HISTORY) || '[]'); }
        catch { return []; }
    },
    personalBest() {
        const h = this.getHistory();
        if (!h.length) return null;
        const score = (e) => ((e.ascension || 0) + 1) * (e.fragments || 0) / ((e.turns || 0) + 1);
        return h.reduce((best, cur) => (score(cur) > score(best) ? cur : best), h[0]);
    },
};
