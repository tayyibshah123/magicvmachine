import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditionStorage, installEditionStorage } from '../services/edition-storage.js';

const native = window.__MVM_NATIVE_STORAGE__?.local || window.localStorage;
const session = window.__MVM_NATIVE_STORAGE__?.session || window.sessionStorage;
const resetWindow = () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: native });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: session });
    delete window.__MVM_NATIVE_STORAGE__;
    delete window.__MVM_STORAGE_EDITION__;
};

beforeEach(() => { resetWindow(); native.clear(); session.clear(); });
afterEach(() => { vi.unstubAllGlobals(); resetWindow(); native.clear(); session.clear(); });

describe('independent edition profiles', () => {
    it('isolates the same wallet, save and preference keys on one origin', () => {
        const stable = createEditionStorage(native, 'stable');
        const guided = createEditionStorage(native, 'guided');
        for (const [storage, value] of [[stable, 'stable'], [guided, 'guided']]) {
            storage.setItem('mvm_sparks', value);
            storage.setItem('mvm_save_v1__A', value + ' run');
            storage.mvm_text_scale = value;
        }
        expect(stable.getItem('mvm_sparks')).toBe('stable');
        expect(guided.getItem('mvm_sparks')).toBe('guided');
        expect(stable.mvm_save_v1__A).toBe('stable run');
        expect(guided.mvm_save_v1__A).toBe('guided run');
        expect(stable.mvm_text_scale).toBe('stable');
        expect(Object.keys(stable).sort()).toEqual(['mvm_save_v1__A', 'mvm_sparks', 'mvm_text_scale']);
        expect(Object.keys(guided).sort()).toEqual(Object.keys(stable).sort());
    });

    it('enumerates logical keys for imports and resets without exposing the other edition', () => {
        const stable = createEditionStorage(native, 'stable');
        const guided = createEditionStorage(native, 'guided');
        native.setItem('another-application', 'keep');
        stable.setItem('mvm_save_v1__A', 'stable');
        guided.setItem('mvm_save_v1__A', 'guided');
        expect(stable.length).toBe(1);
        expect(stable.key(0)).toBe('mvm_save_v1__A');
        expect(stable.key(1)).toBeNull();
        stable.clear();
        expect(stable.length).toBe(0);
        expect(guided.getItem('mvm_save_v1__A')).toBe('guided');
        expect(native.getItem('another-application')).toBe('keep');
        delete guided.mvm_save_v1__A;
        expect(guided.getItem('mvm_save_v1__A')).toBeNull();
    });

    it('keeps existing Stable saves in place without importing them into Guided', () => {
        native.setItem('mvm_sparks', '47');
        native.setItem('mvm_save_v1__A', 'original');
        native.setItem('unrelated', 'keep');
        const stable = createEditionStorage(native, 'stable');
        const guided = createEditionStorage(native, 'guided');
        expect(stable.getItem('mvm_save_v1__A')).toBe('original');
        expect(guided.getItem('mvm_save_v1__A')).toBeNull();
        expect(native.getItem('mvm_save_v1__A')).toBe('original');
        stable.setItem('mvm_sparks', '52');
        expect(stable.getItem('mvm_sparks')).toBe('52');
        expect(native.getItem('mvm_sparks')).toBe('52');
        expect(stable.getItem('unrelated')).toBeNull();
    });

    it('can open a full existing profile without making any quota-consuming migration writes', () => {
        native.setItem('mvm_sparks', '47');
        native.setItem('mvm_save_v1__A', 'original');
        const quota = new DOMException('Full', 'QuotaExceededError');
        let writes = 0;
        const blocked = {
            get length() { return native.length; }, key: i => native.key(i),
            getItem: key => native.getItem(key),
            setItem(key, value) {
                writes++;
                throw quota;
            }
        };
        const win = { document, localStorage: blocked, sessionStorage: session };
        installEditionStorage(win, 'stable');
        const readable = win.localStorage;
        expect(readable.getItem('mvm_save_v1__A')).toBe('original');
        expect(readable.getItem('mvm_sparks')).toBe('47');
        expect(writes).toBe(0);
        expect(() => readable.setItem('mvm_sparks', '55')).toThrow('Full');
        expect(native.getItem('mvm_sparks')).toBe('47');
    });

    it('does not resurrect progress after a deliberate scoped clear', () => {
        native.setItem('mvm_sparks', '47');
        createEditionStorage(native, 'stable').clear();
        expect(createEditionStorage(native, 'stable').getItem('mvm_sparks')).toBeNull();
        expect(native.getItem('mvm_sparks')).toBeNull();
    });

    it('installs idempotently and isolates session data as well as permanent data', () => {
        const win = { document, localStorage: native, sessionStorage: session };
        installEditionStorage(win, 'stable');
        const stable = win.localStorage;
        stable.setItem('mvm_sparks', '47');
        win.sessionStorage.setItem('mvm_analytics_session', 'stable session');
        installEditionStorage(win, 'stable');
        expect(win.localStorage).toBe(stable);
        installEditionStorage(win, 'guided');
        expect(win.localStorage.getItem('mvm_sparks')).toBeNull();
        expect(win.sessionStorage.getItem('mvm_analytics_session')).toBeNull();
        win.localStorage.setItem('mvm_sparks', '9');
        installEditionStorage(win, 'stable');
        expect(win.localStorage.getItem('mvm_sparks')).toBe('47');
        expect(win.sessionStorage.getItem('mvm_analytics_session')).toBe('stable session');
    });

    it('keeps blocked storage errors visible to guarded callers without crashing installation', () => {
        const blocked = { document };
        const error = new DOMException('Blocked', 'SecurityError');
        Object.defineProperty(blocked, 'localStorage', { configurable: true, get() { throw error; } });
        Object.defineProperty(blocked, 'sessionStorage', { configurable: true, get() { throw error; } });
        expect(() => installEditionStorage(blocked, 'guided')).not.toThrow();
        expect(() => blocked.localStorage.setItem('mvm_sparks', '1')).toThrow('Blocked');
        expect(() => blocked.sessionStorage.getItem('mvm_session')).toThrow('Blocked');
    });
});
