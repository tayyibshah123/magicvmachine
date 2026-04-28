// NativeBack bridge — Capacitor backButton → Game.handleBackPress wiring.
//
// We simulate the Capacitor global the same way the plugin would expose
// it on Android, then verify the bridge:
//   - is a no-op on the web (no Capacitor global)
//   - registers a backButton listener on native
//   - routes to handleBackPress, falls through to exitApp when not handled

import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
    delete window.Capacitor;
    delete window.Game;
    vi.resetModules();
});

function makeMockApp() {
    const listeners = {};
    return {
        addListener: vi.fn((event, fn) => { listeners[event] = fn; }),
        exitApp: vi.fn(),
        _fire(event, payload) {
            const fn = listeners[event];
            if (fn) fn(payload);
        },
    };
}

function installCapacitorMock(App, isNative = true) {
    window.Capacitor = {
        isNativePlatform: () => isNative,
        Plugins: { App },
    };
}

describe('NativeBack', () => {
    it('is a no-op when window.Capacitor is missing', async () => {
        const { NativeBack } = await import('../services/native-back.js');
        // Should not throw.
        expect(() => NativeBack.init()).not.toThrow();
    });

    it('is a no-op when isNativePlatform returns false', async () => {
        const App = makeMockApp();
        installCapacitorMock(App, false);
        const { NativeBack } = await import('../services/native-back.js');
        NativeBack.init();
        expect(App.addListener).not.toHaveBeenCalled();
    });

    it('registers a backButton listener on native', async () => {
        const App = makeMockApp();
        installCapacitorMock(App, true);
        const { NativeBack } = await import('../services/native-back.js');
        NativeBack.init();
        expect(App.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
    });

    it('does NOT call exitApp when Game.handleBackPress returns true', async () => {
        const App = makeMockApp();
        installCapacitorMock(App, true);
        window.Game = { handleBackPress: vi.fn(() => true) };
        const { NativeBack } = await import('../services/native-back.js');
        NativeBack.init();
        App._fire('backButton', {});
        expect(window.Game.handleBackPress).toHaveBeenCalled();
        expect(App.exitApp).not.toHaveBeenCalled();
    });

    it('calls exitApp when Game.handleBackPress returns false', async () => {
        const App = makeMockApp();
        installCapacitorMock(App, true);
        window.Game = { handleBackPress: vi.fn(() => false) };
        const { NativeBack } = await import('../services/native-back.js');
        NativeBack.init();
        App._fire('backButton', {});
        expect(App.exitApp).toHaveBeenCalled();
    });

    it('calls exitApp when Game is unavailable', async () => {
        const App = makeMockApp();
        installCapacitorMock(App, true);
        // Game absent.
        const { NativeBack } = await import('../services/native-back.js');
        NativeBack.init();
        App._fire('backButton', {});
        expect(App.exitApp).toHaveBeenCalled();
    });

    it('init is idempotent — second call does not double-register', async () => {
        const App = makeMockApp();
        installCapacitorMock(App, true);
        const { NativeBack } = await import('../services/native-back.js');
        NativeBack.init();
        NativeBack.init();
        expect(App.addListener).toHaveBeenCalledTimes(1);
    });
});
