// Intel kill ledger — tracks how many times each enemy name has been
// defeated across all runs. Feeds the pre-combat briefing so returning
// players see "Encountered 3 times" instead of a blank tagline, drives
// the Specialist / total-kills achievements, and (Intel 3.0) powers the
// progressive-disclosure dossier in the menu.
//
// v2 storage: each entry is `{ count, firstSeen, lastSeen, sectors[] }`.
// v1 (a flat numeric `count`) is read on first load and migrated up so
// the old kill ledger isn't lost.

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

// Normalise legacy `count` numbers to the v2 record shape on read so the
// rest of the service can assume `{ count, firstSeen, lastSeen, sectors }`.
function _entry(raw) {
    if (raw == null) return { count: 0, firstSeen: 0, lastSeen: 0, sectors: [] };
    if (typeof raw === 'number') return { count: raw, firstSeen: 0, lastSeen: 0, sectors: [] };
    return {
        count: raw.count || 0,
        firstSeen: raw.firstSeen || 0,
        lastSeen: raw.lastSeen || 0,
        sectors: Array.isArray(raw.sectors) ? raw.sectors.slice() : []
    };
}

function totalKills(data) {
    let t = 0;
    for (const k in data) {
        const e = _entry(data[k]);
        t += e.count;
    }
    return t;
}

export const Intel = {
    // Called from Game when an enemy dies. `name` is the canonical enemy
    // name (boss or regular — minions aren't tracked individually).
    // Optional `sector` records the zone the kill happened in so the
    // dossier can show "FIRST SEEN: SECTOR 2" style metadata.
    recordKill(name, sector) {
        if (!name) return 0;
        const data = read();
        const e = _entry(data[name]);
        const now = Date.now();
        if (!e.firstSeen) e.firstSeen = now;
        e.lastSeen = now;
        e.count = (e.count || 0) + 1;
        if (typeof sector === 'number' && sector > 0 && !e.sectors.includes(sector)) {
            e.sectors.push(sector);
            e.sectors.sort((a, b) => a - b);
        }
        data[name] = e;
        write(data);

        // Specialist unlocks at 3 boss kills.
        const ach = (typeof window !== 'undefined' && window.Achievements) ? window.Achievements : null;
        if (ach) {
            const specId = SPECIALIST[name];
            if (specId && e.count >= 3) {
                try { ach.unlock(specId); } catch (er) {}
            }
            // Total-kill tier unlocks.
            const total = totalKills(data);
            if (total >= 50)   { try { ach.unlock('KILLS_50'); }   catch (er) {} }
            if (total >= 250)  { try { ach.unlock('KILLS_250'); }  catch (er) {} }
            if (total >= 1000) { try { ach.unlock('KILLS_1000'); } catch (er) {} }
        }

        return e.count;
    },

    kills(name) {
        if (!name) return 0;
        return _entry(read()[name]).count;
    },

    // Full record for one enemy (count + firstSeen + lastSeen + sectors).
    // Returns the v2 shape regardless of the underlying storage version.
    record(name) {
        return _entry(read()[name]);
    },

    total() {
        return totalKills(read());
    },

    // Map of name → v2 record. The Codex / Dossier UI iterates this.
    all() {
        const raw = read();
        const out = {};
        for (const k in raw) out[k] = _entry(raw[k]);
        return out;
    },

    // Distinct-name count. Drives the Operator Profile "BESTIARY" stat.
    distinctCount() {
        const raw = read();
        let n = 0;
        for (const k in raw) if (_entry(raw[k]).count > 0) n++;
        return n;
    },

    reset() {
        write({});
    }
};
