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

export const Challenge = {
    todayString,

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
