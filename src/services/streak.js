// Login streak — tracks consecutive daily logins.
// Milestone rewards at 1/3/7/14/30/100 days with escalating prizes.
// A single missed day per 7-day window is forgiven (grace day) so casual
// players don't get punished for one missed commute.

const KEY_LAST_LOGIN = 'mvm_streak_last';
const KEY_STREAK     = 'mvm_streak_count';
const KEY_GRACE_USED = 'mvm_streak_grace_last'; // date on which grace was consumed
const KEY_MILESTONES = 'mvm_streak_milestones'; // JSON array of claimed milestone days

// Milestone reward table. Keys are day counts; values describe the grant.
const MILESTONES = [
    { day: 1,   fragments: 10,  title: "DAY 1",   sub: "Booting up." },
    { day: 3,   fragments: 30,  title: "DAY 3",   sub: "Finding your footing." },
    { day: 7,   fragments: 75,  relic: true, title: "DAY 7",   sub: "One week online." },
    { day: 14,  fragments: 150, title: "DAY 14",  sub: "Two weeks deep." },
    { day: 30,  fragments: 300, cosmetic: 'frame_d30', title: "DAY 30", sub: "A month in the grid." },
    { day: 100, fragments: 1000, cosmetic: 'skin_d100', title: "DAY 100", sub: "Veteran of the resistance." }
];

// Small repeating bonus once the user passes the top milestone, so daily
// logins still feel worth it after day 100.
const TAIL_DAILY_BONUS = 15;

function todayStr() {
    // Use Date.now() explicitly so tests that mock the clock via
    // `Date.now = ...` see the mocked time — `new Date()` without args
    // reads the native clock on some engines and bypasses the override.
    const d = new Date(Date.now());
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function daysBetween(a, b) {
    const A = new Date(a + 'T00:00:00Z').getTime();
    const B = new Date(b + 'T00:00:00Z').getTime();
    return Math.round((B - A) / (24 * 60 * 60 * 1000));
}

function readClaimedMilestones() {
    try { return JSON.parse(localStorage.getItem(KEY_MILESTONES) || '[]'); }
    catch (e) { return []; }
}

function writeClaimedMilestones(arr) {
    try { localStorage.setItem(KEY_MILESTONES, JSON.stringify(arr)); } catch (e) {}
}

// Wrap raw localStorage reads/writes — Safari Private mode + a few
// Capacitor WebView profiles throw on access. Treat any failure as
// "no record" so the streak just resets, never crashes.
const _read  = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const _write = (key, val) => { try { localStorage.setItem(key, val); } catch (_) {} };

export const Streak = {
    tick() {
        const today = todayStr();
        const last  = _read(KEY_LAST_LOGIN);
        let streak  = parseInt(_read(KEY_STREAK) || '0', 10) || 0;
        let claimedMilestone = null;
        let bonus = 0;
        let usedGrace = false;

        if (last === today) {
            return { newStreak: streak, claimedReward: false, bonusFragments: 0, milestone: null, usedGrace: false };
        }

        if (!last) {
            streak = 1;
        } else {
            const gap = daysBetween(last, today);
            if (gap === 1) {
                streak += 1;
            } else if (gap === 2) {
                // Grace: one missed day per 7-day window is forgiven.
                const graceLast = _read(KEY_GRACE_USED);
                const graceGap = graceLast ? daysBetween(graceLast, today) : 999;
                if (graceGap >= 7) {
                    streak += 1;
                    usedGrace = true;
                    _write(KEY_GRACE_USED, today);
                } else {
                    streak = 1;
                }
            } else {
                streak = 1;
            }
        }

        // Check for milestone first-claim.
        const claimed = readClaimedMilestones();
        const hit = MILESTONES.find(m => m.day === streak && !claimed.includes(m.day));
        if (hit) {
            claimedMilestone = hit;
            bonus = hit.fragments || 0;
            claimed.push(hit.day);
            writeClaimedMilestones(claimed);
        } else if (streak > 100) {
            // Daily tail reward past the top milestone.
            bonus = TAIL_DAILY_BONUS;
        } else {
            // Small catch-up bonus proportional to streak length, capped.
            bonus = Math.min(5 + streak, 25);
        }

        _write(KEY_LAST_LOGIN, today);
        _write(KEY_STREAK, String(streak));

        return {
            newStreak: streak,
            claimedReward: bonus > 0,
            bonusFragments: bonus,
            milestone: claimedMilestone,
            usedGrace
        };
    },

    current() {
        return parseInt(_read(KEY_STREAK) || '0', 10) || 0;
    },

    // Returns the next upcoming milestone the user hasn't claimed, or null.
    nextMilestone() {
        const streak = this.current();
        const claimed = readClaimedMilestones();
        return MILESTONES.find(m => m.day > streak && !claimed.includes(m.day)) || null;
    },

    allMilestones() {
        return MILESTONES.slice();
    }
};
