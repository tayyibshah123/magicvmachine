// Wires Android's hardware back button (via Capacitor) to the same
// modal-dismiss logic as ESC. On the web build this is a no-op — the
// global Capacitor object isn't present in a normal browser, so the
// init function bails before touching anything platform-specific.
//
// Without this, pressing back on a Capacitor wrap kills the whole app
// even when the player is mid-run with a modal open. With it:
//   - any open modal/overlay → close it
//   - mid-run with nothing open → open settings (graceful pause)
//   - on title / character-select / death screen → exit the app
//
// Implementation note: we deliberately use the injected
// `window.Capacitor.Plugins.App` global rather than `import { App }
// from '@capacitor/app'`. This codebase ships raw ESM with no bundler,
// so a bare specifier wouldn't resolve in the WebView. The global API
// is exposed by Capacitor 6 by default.

let registered = false;

function getCapacitorApp() {
    if (typeof window === 'undefined') return null;
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function') return null;
    if (!cap.isNativePlatform()) return null;
    const plugins = cap.Plugins;
    if (!plugins || !plugins.App) return null;
    return plugins.App;
}

export const NativeBack = {
    init() {
        if (registered) return;
        const App = getCapacitorApp();
        if (!App) return;
        registered = true;
        App.addListener('backButton', () => {
            const G = (typeof window !== 'undefined') ? window.Game : null;
            if (G && typeof G.handleBackPress === 'function' && G.handleBackPress()) return;
            try { App.exitApp(); } catch (_) { /* swallow — last-resort exit */ }
        });
    },
};
