// Daily Run service.
// - Date-based seeded RNG using Mulberry32 → identical map/relics worldwide each day
// - Tracks daily-completion status in localStorage so the player can't re-roll the same day
// - Public API: getTodaySeed(), beginDailyRun(), isDailyAvailable(), markDailyComplete()

const KEY_LAST_DAILY    = 'mvm_daily_last_complete';   // YYYY-MM-DD of last completed daily
const KEY_DAILY_HISTORY = 'mvm_daily_history';         // JSON array of {date, fragments, score}
const KEY_DAILY_ACTIVE  = 'mvm_daily_active';          // '1' if current run was started as daily

// --- seeded RNG (Mulberry32) ---
export function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t |= 0; t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

// Hash YYYY-MM-DD into a deterministic 32-bit seed
function hashDate(dateStr) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < dateStr.length; i++) {
        h ^= dateStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function todayString() {
    const d = new Date();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

export const Dailies = {
    todayString,
    getTodaySeed() { return hashDate(this.todayString()); },

    isDailyAvailable() {
        const last = localStorage.getItem(KEY_LAST_DAILY) || '';
        return last !== this.todayString();
    },

    markActive(active) {
        if (active) localStorage.setItem(KEY_DAILY_ACTIVE, '1');
        else localStorage.removeItem(KEY_DAILY_ACTIVE);
    },
    isActive() { return localStorage.getItem(KEY_DAILY_ACTIVE) === '1'; },

    markDailyComplete(payload = {}) {
        const today = this.todayString();
        localStorage.setItem(KEY_LAST_DAILY, today);
        this.markActive(false);
        const history = this.getHistory();
        history.unshift({ date: today, ...payload });
        // Keep last 30 entries
        localStorage.setItem(KEY_DAILY_HISTORY, JSON.stringify(history.slice(0, 30)));
    },

    getHistory() {
        try { return JSON.parse(localStorage.getItem(KEY_DAILY_HISTORY) || '[]'); }
        catch { return []; }
    },

    // Time until midnight UTC (ms) — useful for the menu countdown
    msUntilReset() {
        const now = new Date();
        const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
        return next.getTime() - now.getTime();
    },

    formatCountdown(ms) {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = String(Math.floor(total / 3600)).padStart(2, '0');
        const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
        return `${h}:${m}`;
    }
};
