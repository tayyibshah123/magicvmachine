// Capacitor SplashScreen plugin bridge.
//
// The Android splash configured in capacitor.config.json auto-hides
// after launchShowDuration (1200ms). That's a fallback for slow boots;
// once the game's actually ready we should dismiss it earlier so the
// player isn't staring at a static frame longer than necessary.
//
// On web (no Capacitor global), this whole module is a no-op.

let hidden = false;

function getPlugin() {
    if (typeof window === 'undefined') return null;
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function') return null;
    if (!cap.isNativePlatform()) return null;
    const plugins = cap.Plugins;
    if (!plugins || !plugins.SplashScreen) return null;
    return plugins.SplashScreen;
}

export const NativeSplash = {
    hide() {
        if (hidden) return;
        const plugin = getPlugin();
        if (!plugin) return;
        hidden = true;
        try { plugin.hide({ fadeOutDuration: 200 }); } catch (_) { /* ignore */ }
    },
};
