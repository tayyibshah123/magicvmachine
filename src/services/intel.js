// Intel kill ledger — tracks how many times each enemy name has been
// defeated across all runs. Feeds the pre-combat briefing so returning
// players see "Encountered 3 times" instead of a blank tagline, and
// drives the Specialist / total-kills achievements.

const KEY = 'mvm_intel_kills_v1';

// Map boss name → achievement id (used by recordKill for specialist unlocks).
const SPECIALIST = {
    'THE PANOPTICON':  'SPEC_PANOPTICON',
    'NULL_POINTER':    'SPEC_NULL_POINTER',
    'THE COMPILER':    'SPEC_COMPILER',
    'HIVE PROTOCOL':   'SPEC_HIVE',
    'TESSERACT PRIME': 'SPEC_TESSERACT'
};

function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (e) { return {}; }
}
function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
}

function totalKills(data) {
    let t = 0; for (const k in data) t += data[k] || 0; return t;
}

export const Intel = {
    // Called from Game when an enemy dies. `name` is the canonical enemy
    // name (boss or regular — minions aren't tracked individually).
    recordKill(name) {
        if (!name) return 0;
        const data = read();
        data[name] = (data[name] || 0) + 1;
        write(data);

        // Specialist unlocks at 3 boss kills.
        const ach = (typeof window !== 'undefined' && window.Achievements) ? window.Achievements : null;
        if (ach) {
            const specId = SPECIALIST[name];
            if (specId && data[name] >= 3) {
                try { ach.unlock(specId); } catch (e) {}
            }
            // Total-kill tier unlocks.
            const total = totalKills(data);
            if (total >= 50)   { try { ach.unlock('KILLS_50'); }   catch (e) {} }
            if (total >= 250)  { try { ach.unlock('KILLS_250'); }  catch (e) {} }
            if (total >= 1000) { try { ach.unlock('KILLS_1000'); } catch (e) {} }
        }

        return data[name];
    },

    kills(name) {
        if (!name) return 0;
        const data = read();
        return data[name] || 0;
    },

    total() {
        return totalKills(read());
    },

    // Full map, useful for the Codex screen.
    all() {
        return read();
    },

    reset() {
        write({});
    }
};
