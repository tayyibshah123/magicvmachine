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
        const blob = {};
        for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(PREFIX)) continue;
            blob[key.slice(PREFIX.length)] = localStorage.getItem(key);
        }
        return { version: 1, t: Date.now(), data: blob };
    },

    // Manual import — inverse of exportAll(). Wipes existing mvm_* keys to
    // avoid half-merges.
    importAll(blob) {
        if (!blob || !blob.data) return false;
        for (const key of Object.keys(localStorage)) {
            if (key.startsWith(PREFIX)) localStorage.removeItem(key);
        }
        for (const k of Object.keys(blob.data)) {
            try { localStorage.setItem(PREFIX + k, blob.data[k]); } catch (e) {}
        }
        return true;
    }
};
