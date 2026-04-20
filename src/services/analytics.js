// Local analytics emitter.
// Records every event to an in-memory ring buffer + optional console output.
// A later Firebase / PostHog transport can be dropped in by swapping `_sinks`.
//
// Event schema (see Part 12.1 of the roadmap). Unknown events are logged but
// tagged as `unknown_event` so we catch typos in dev.

const BUFFER_SIZE = 500;
const KEY_SESSION = 'mvm_analytics_session';
const KEY_INSTALL = 'mvm_analytics_install';

const ALLOWED_EVENTS = new Set([
    'session_start', 'session_end',
    'onboarding_stage_complete',
    'run_start', 'run_end',
    'combat_start', 'combat_end',
    'death',
    'relic_picked', 'relic_skipped',
    'shop_purchase',
    'achievement_unlocked',
    'setting_changed',
    'error_client',
    'combo_triggered',
    'milestone_claimed',
    'qte_resolved',
    'feature_unlocked',
    'tooltip_shown'
]);

function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readInstallId() {
    let id = localStorage.getItem(KEY_INSTALL);
    if (!id) {
        id = makeId('inst');
        try { localStorage.setItem(KEY_INSTALL, id); } catch (e) {}
    }
    return id;
}

export const Analytics = {
    _buffer: [],
    _sessionId: null,
    _sessionStart: 0,
    _sinks: [], // transports (console sink added below)
    _enabled: true,

    init() {
        this._sessionId = makeId('sess');
        this._sessionStart = Date.now();
        try { sessionStorage.setItem(KEY_SESSION, this._sessionId); } catch (e) {}

        // Console sink (dev). Safe to leave in prod; gated by `enabled`.
        this._sinks.push((event) => {
            if (typeof console !== 'undefined' && console.debug) {
                console.debug('[analytics]', event.name, event.props || {});
            }
        });

        // Persist the buffer on unload so we can inspect a crashed session.
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', () => {
                this.emit('session_end', { duration_sec: Math.round((Date.now() - this._sessionStart) / 1000) });
                try { localStorage.setItem('mvm_analytics_lastbuffer', JSON.stringify(this._buffer.slice(-50))); } catch (e) {}
            });
        }

        this.emit('session_start', {
            platform: navigator.platform || 'unknown',
            ua: navigator.userAgent,
            locale: navigator.language || 'en'
        });
    },

    addSink(fn) { this._sinks.push(fn); },

    setEnabled(flag) { this._enabled = !!flag; },

    emit(name, props) {
        if (!this._enabled) return;
        const event = {
            name: ALLOWED_EVENTS.has(name) ? name : 'unknown_event',
            originalName: name,
            props: props || {},
            t: Date.now(),
            sid: this._sessionId,
            iid: readInstallId()
        };
        this._buffer.push(event);
        if (this._buffer.length > BUFFER_SIZE) this._buffer.shift();
        for (const sink of this._sinks) {
            try { sink(event); } catch (e) { /* ignore sink errors */ }
        }
    },

    // Returns recent events for debugging / the in-app bug report panel.
    recent(count = 50) {
        return this._buffer.slice(-count);
    },

    exportJSON() {
        const payload = {
            exportedAt: new Date().toISOString(),
            installId: readInstallId(),
            sessionId: this._sessionId,
            events: this._buffer
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mvm-analytics-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // Convenience: wrap a function so JS errors get reported.
    wrap(name, fn) {
        return (...args) => {
            try { return fn(...args); }
            catch (e) {
                this.emit('error_client', { where: name, message: String(e && e.message), stack: String(e && e.stack).slice(0, 500) });
                throw e;
            }
        };
    }
};
