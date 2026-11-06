// Save-sync abstraction.
//
// Launch config: **local-only**. Every save round-trips through localStorage
// with no network dependency, which means:
//   • zero backend cost at launch
//   • instant save/load on every device
//   • no auth flows, no privacy-policy complexity
//
// Cloud sync is opt-in via a provider that the host app can register later:
//
//    import { SaveSync } from './save-sync.js';
//    SaveSync.setProvider({
//        async push(key, data) { /* write to Firebase / Supabase / your own */ },
//        async pull(key)        { /* read the authoritative copy */ }
//    });
//
// Nothing in the rest of the game calls localStorage directly for save data
// — all routes go through SaveSync.write(key, data) and SaveSync.read(key).
// This keeps cloud integration a one-day swap instead of a refactor.

const PREFIX = 'mvm_';
import { PLAYER_CLASSES, UPGRADES_POOL, CORRUPTED_RELICS, MODULE_FUSIONS } from '../constants.js';
import { validRunRules } from './run-rules.js';
const RECOVERY_KEY = 'mvm_import_recovery_v1';
const rewardIds = new Set([...UPGRADES_POOL, ...CORRUPTED_RELICS, ...MODULE_FUSIONS].map(item => item.id));
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function snapshot() {
    const result = {};
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith(PREFIX) && key !== RECOVERY_KEY) result[key.slice(PREFIX.length)] = localStorage.getItem(key);
    }
    return result;
}
function restore(values) {
    // Write replacements before removing anything. The durable journal keeps
    // the original profile recoverable even if rollback itself hits quota.
    for (const [key, value] of Object.entries(values)) localStorage.setItem(PREFIX + key, value);
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith(PREFIX) && key !== RECOVERY_KEY && !Object.hasOwn(values, key.slice(PREFIX.length))) localStorage.removeItem(key);
    }
}
function safeSnapshot(values) {
    return plain(values) && Object.entries(values).every(([key, value]) =>
        /^[a-zA-Z0-9_.-]+$/.test(key)
        && !['__proto__', 'constructor', 'prototype', 'import_recovery_v1'].includes(key)
        && typeof value === 'string');
}
function validate(blob) {
    if (!plain(blob) || blob.version !== 1 || !safeSnapshot(blob.data) || !Object.keys(blob.data).length) return false;
    for (const [key, value] of Object.entries(blob.data)) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(key) || ['__proto__', 'constructor', 'prototype', 'import_recovery_v1'].includes(key)
            || typeof value !== 'string') return false;
        if (/^save_v1(?:__[ABC])?$/.test(key)) {
            let save;
            try { save = JSON.parse(value); } catch (_) { return false; }
            if (!plain(save) || !plain(save.player) || typeof save.player.classId !== 'string'
                || !PLAYER_CLASSES.some(cls => cls.id === save.player.classId)
                || (save.v !== undefined && (!Number.isInteger(save.v) || save.v < 1 || save.v > 5))
                || !Number.isFinite(save.player.hp) || save.player.hp < 0
                || !Number.isFinite(save.player.maxHp) || save.player.maxHp <= 0
                || (save.player.relics !== undefined && (!Array.isArray(save.player.relics)
                    || !save.player.relics.every(item => plain(item) && typeof item.id === 'string' && item.id.length)))
                || (save.player.upgrades !== undefined && (!Array.isArray(save.player.upgrades)
                    || !save.player.upgrades.every(item => typeof item === 'string')))
                || !Number.isSafeInteger(save.sector) || save.sector < 1) return false;
            if (!plain(save.map) || !Array.isArray(save.map.nodes) || !save.map.nodes.length
                || !save.map.nodes.every(node => plain(node) && typeof node.id === 'string' && typeof node.type === 'string'
                    && Array.isArray(node.connections) && node.connections.every(id => typeof id === 'string'))) return false;
            const nodeIds = new Set(save.map.nodes.map(node => node.id));
            if (nodeIds.size !== save.map.nodes.length || !nodeIds.has(save.currentIdx || 'start')
                || !save.map.nodes.every(node => node.connections.every(id => nodeIds.has(id)))) return false;
            const pending = save.pendingReward;
            if (save.runRules != null && !validRunRules(save.runRules)) return false;
            if (pending && (!plain(pending) || pending.v !== 1 || !['offered', 'committed'].includes(pending.status)
                || pending.payoutState !== 'settled' || typeof pending.nodeId !== 'string'
                || !Number.isInteger(pending.sector) || pending.sector < 1
                || !['combat', 'elite', 'boss'].includes(pending.encounterType)
                || !Array.isArray(pending.options) || !pending.options.every(id => rewardIds.has(id))
                || ['relicHpCost', 'sectorCrossDamage', 'fragDrainPerSector'].some(key => pending[key] !== undefined
                    && (!Number.isFinite(pending[key]) || pending[key] < 0))
                || (pending.selectedId && !pending.options.includes(pending.selectedId)))) return false;
        }
        if (key === 'active_slot' && !['A', 'B', 'C'].includes(value)) return false;
        if (['sparks', 'sparks_lifetime', 'encrypted'].includes(key) && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) return false;
        if (['upgrades', 'meta_disabled', 'lore', 'hidden_lore', 'read_lore', 'achievements_v1', 'custom_run',
            'run_history', 'challenge_history', 'archive_history', 'cosmetics_owned', 'streak_milestones'].includes(key)) {
            try { if (!Array.isArray(JSON.parse(value))) return false; } catch (_) { return false; }
        }
        if (['settings_v1', 'unlocks_v1', 'seen'].includes(key)) {
            try { if (!plain(JSON.parse(value))) return false; } catch (_) { return false; }
        }
    }
    return true;
}

let _provider = null;       // cloud provider hooks (optional)
let _dirty = new Set();     // keys changed locally but not yet pushed
let _autoPushTimer = null;

async function _flushToCloud() {
    if (!_provider || !_provider.push) return;
    const dirty = Array.from(_dirty);
    _dirty.clear();
    for (const k of dirty) {
        try {
            const raw = localStorage.getItem(PREFIX + k);
            if (raw != null) await _provider.push(k, raw);
        } catch (e) { /* swallow — local is already written */ }
    }
}

function _scheduleFlush() {
    if (!_provider) return;
    if (_autoPushTimer) clearTimeout(_autoPushTimer);
    // Batch for 2s so rapid saves coalesce into one cloud write.
    _autoPushTimer = setTimeout(_flushToCloud, 2000);
}

export const SaveSync = {
    lastImportError: '',
    recoverImport() {
        let raw;
        try { raw = localStorage.getItem(RECOVERY_KEY); }
        catch (_) { return true; } // Storage-disabled browsers may still play without persistence.
        try {
            if (!raw) return true;
            const journal = JSON.parse(raw);
            if (journal.v !== 1 || !safeSnapshot(journal.before)) throw new Error('Invalid import recovery journal');
            restore(journal.before);
            localStorage.removeItem(RECOVERY_KEY);
            this.lastImportError = '';
            return true;
        } catch (_) {
            this.lastImportError = 'Original save recovery is pending. Free storage and reload before continuing.';
            return false;
        }
    },
    // Write a value locally. Synchronous and reliable. Cloud push is batched.
    write(key, data) {
        try {
            const serialized = typeof data === 'string' ? data : JSON.stringify(data);
            localStorage.setItem(PREFIX + key, serialized);
            _dirty.add(key);
            _scheduleFlush();
            return true;
        } catch (e) {
            // Quota exceeded / storage disabled — best-effort no-op.
            return false;
        }
    },

    // Read synchronously from local. Returns raw string (caller JSON.parses
    // if needed) so this stays symmetric with write().
    read(key) {
        try { return localStorage.getItem(PREFIX + key); }
        catch (e) { return null; }
    },

    // Parsed convenience wrapper.
    readJSON(key) {
        const raw = this.read(key);
        if (raw == null) return null;
        try { return JSON.parse(raw); } catch (e) { return null; }
    },

    remove(key) {
        try { localStorage.removeItem(PREFIX + key); _dirty.delete(key); } catch (e) {}
    },

    // Register a cloud provider. Fires an initial pull for every known key
    // so the authoritative copy wins on cold start.
    async setProvider(provider) {
        _provider = provider || null;
        if (!_provider) return;
        // On provider registration, reconcile: remote overwrites local for
        // known keys. If the host app wants merge semantics they can do it
        // in provider.pull itself before returning.
        for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(PREFIX)) continue;
            const short = key.slice(PREFIX.length);
            try {
                const remote = await _provider.pull(short);
                if (remote != null) localStorage.setItem(key, remote);
            } catch (e) { /* offline / auth failure — keep local */ }
        }
    },

    hasProvider() { return _provider != null; },

    // Manual export — returns a snapshot of every mvm_* key as a portable
    // JSON blob. Useful for the "export save" button in Settings.
    exportAll() {
        if (!this.recoverImport()) throw new Error(this.lastImportError);
        return { version: 1, t: Date.now(), data: snapshot() };
    },

    // Manual import — inverse of exportAll(). Wipes existing mvm_* keys to
    // avoid half-merges.
    importAll(blob) {
        this.lastImportError = '';
        if (!validate(blob)) { this.lastImportError = 'Invalid save file. Existing progress was not changed.'; return false; }
        if (!this.recoverImport()) return false;
        try {
            const before = snapshot();
            localStorage.setItem(RECOVERY_KEY, JSON.stringify({ v: 1, before }));
            restore(blob.data);
            localStorage.removeItem(RECOVERY_KEY);
            return true;
        } catch (_) {
            const recovered = this.recoverImport();
            if (recovered) this.lastImportError = 'Import failed. Your original progress has been preserved.';
            return false;
        }
    }
};
