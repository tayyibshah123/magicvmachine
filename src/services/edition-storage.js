import { APP_EDITION } from '../version.js';

// Two editions can share a hosting origin without sharing a wallet, saves,
// settings, learning records, imports or resets. Keep the native stores only
// as backing stores; game code continues to use the ordinary Storage API.
export const editionPrefix = edition => `mvm-edition:${edition}:`;

export function createEditionStorage(storage, edition) {
    const prefix = editionPrefix(edition);
    // Stable retains the established keys in place. Copying a large profile
    // would temporarily double its size and could exhaust a full device.
    const established = key => edition === 'stable' && key.startsWith('mvm_');
    const physicalName = key => established(key) ? key : prefix + key;
    const names = () => {
        const result = new Set();
        for (let i = 0; i < storage.length; i++) {
            const key = storage.key(i);
            if (key?.startsWith(prefix)) result.add(key.slice(prefix.length));
            else if (key && established(key)) result.add(key);
        }
        return [...result];
    };
    const api = {
        getItem(key) {
            key = String(key);
            return storage.getItem(physicalName(key));
        },
        setItem(key, value) {
            key = String(key);
            storage.setItem(physicalName(key), String(value));
        },
        removeItem(key) {
            key = String(key);
            storage.removeItem(physicalName(key));
        },
        clear() {
            for (const key of names()) storage.removeItem(physicalName(key));
        },
        key(index) { return names()[Number(index)] ?? null; }
    };
    const target = Object.create(null);
    return new Proxy(target, {
        get(_, key) {
            if (key === 'length') return names().length;
            if (key === Symbol.toStringTag) return 'Storage';
            if (typeof key !== 'string') return undefined;
            return Object.hasOwn(api, key) ? api[key] : api.getItem(key) ?? undefined;
        },
        set(_, key, value) { api.setItem(key, value); return true; },
        deleteProperty(_, key) { api.removeItem(key); return true; },
        ownKeys: names,
        has(_, key) { return Object.hasOwn(api, key) || names().includes(key); },
        getOwnPropertyDescriptor(_, key) {
            return names().includes(key)
                ? { enumerable: true, configurable: true, writable: true, value: api.getItem(key) }
                : undefined;
        }
    });
}

export function installEditionStorage(win, edition = APP_EDITION) {
    if (!win?.document) return null;
    let native = win.__MVM_NATIVE_STORAGE__;
    if (!native) {
        const unavailable = error => ({
            get length() { throw error; }, key() { throw error; },
            getItem() { throw error; }, setItem() { throw error; }, removeItem() { throw error; }
        });
        const read = name => { try { return win[name]; } catch (error) { return unavailable(error); } };
        native = { local: read('localStorage'), session: read('sessionStorage') };
        Object.defineProperty(win, '__MVM_NATIVE_STORAGE__', { value: native, configurable: true });
    }
    if (win.__MVM_STORAGE_EDITION__ === edition) return native;
    Object.defineProperty(win, 'localStorage', {
        configurable: true, value: createEditionStorage(native.local, edition)
    });
    Object.defineProperty(win, 'sessionStorage', {
        configurable: true, value: createEditionStorage(native.session, edition)
    });
    Object.defineProperty(win, '__MVM_STORAGE_EDITION__', { configurable: true, value: edition });
    const label = () => {
        const stamp = win.document.querySelector('.db-version');
        if (stamp && !win.document.getElementById('edition-label')) {
            const badge = win.document.createElement('span');
            badge.id = 'edition-label';
            badge.textContent = edition === 'guided' ? 'GUIDED EDITION' : 'STABLE EDITION';
            badge.style.cssText = 'color:#83dce2;font-size:10px;letter-spacing:1px;margin-right:8px';
            stamp.before(badge);
        }
        win.document.title = `Magic v Machine | ${edition === 'guided' ? 'Guided' : 'Stable'} Edition`;
    };
    if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', label, { once: true });
    else label();
    return native;
}

if (typeof window !== 'undefined') installEditionStorage(window);
