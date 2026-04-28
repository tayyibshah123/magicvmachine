// Magic v Machine — service worker for offline play.
// Caches the app shell on first install; on subsequent loads serves from cache
// while updating in the background (stale-while-revalidate).

// Keep in sync with src/version.js — service worker runs in a separate
// worker context that can't import ES modules, so the version string is
// duplicated by design. Old caches are deleted on activate.
const CACHE_NAME = 'mvm-shell-v1-2-9';
const SHELL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './music/synth1.ogg',
    './music/synth2.ogg',
    './music/synth3.ogg',
    './music/synth4.ogg',
    './music/lofi.ogg',
    './intro.png',
    './icon.svg',
    './icon-maskable.svg',
    './manifest.json',
    './src/game.js',
    './src/constants.js',
    './src/audio.js',
    './src/effects/particles.js',
    './src/entities/entity.js',
    './src/entities/player.js',
    './src/entities/enemy.js',
    './src/entities/minion.js',
    './src/ui/tooltip.js',
    './src/ui/icons.js',
    './src/ui/class-ability.js',
    // v1.1 services
    './src/services/analytics.js',
    './src/services/perf.js',
    './src/services/hints.js',
    './src/services/unlocks.js',
    './src/services/combat-log.js',
    './src/services/loading.js',
    './src/services/share.js',
    './src/services/streak.js',
    './src/services/achievements.js',
    './src/services/gesture.js',
    './src/services/native-back.js',
    './src/data/matchup-hints.js',
    // SFX samples (v1.2) — precache so offline play has sound from turn 1.
    './sfx/attack.ogg',      './sfx/beam.ogg',         './sfx/buy.ogg',
    './sfx/chains.ogg',      './sfx/click.ogg',        './sfx/dart.ogg',
    './sfx/defend.ogg',      './sfx/digital_sever.ogg', './sfx/earthquake.ogg',
    './sfx/explosion.ogg',   './sfx/glitch_attack.ogg', './sfx/grid_fracture.ogg',
    './sfx/heartbeat.ogg',   './sfx/hex_barrier.ogg',  './sfx/hit.ogg',
    './sfx/laser.ogg',       './sfx/mana.ogg',         './sfx/meteor.ogg',
    './sfx/orbital_strike.ogg', './sfx/overclock.ogg', './sfx/print.ogg',
    './sfx/siren.ogg',       './sfx/snap.ogg',         './sfx/ticking.ogg',
    './sfx/upgrade.ogg',     './sfx/zap.ogg'
];

self.addEventListener('install', event => {
    // Don't auto-skipWaiting any more — the user-facing update
    // banner posts {type:'SKIP_WAITING'} when the player taps
    // REFRESH. That keeps a mid-run player from getting their
    // tab swapped out from under them by a silent SW update.
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            // addAll fails atomically — if any asset 404s, the SW won't install.
            // We tolerate failures by adding individually.
            Promise.all(SHELL_ASSETS.map(url => cache.add(url).catch(() => null)))
        )
    );
});

// Listen for the page-side SKIP_WAITING message — fired when the
// player taps the REFRESH button on the update banner. Replaces the
// previous unconditional skipWaiting() in install: the new SW now
// stays in `waiting` state until the player explicitly triggers it,
// so a long combat session isn't interrupted by a silent reload.
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    // Only handle GET — POSTs go straight to network
    if (req.method !== 'GET') return;
    // Skip third-party hosts (Google Fonts, etc.) — let the browser handle them
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Network-first for code/markup so dev iteration isn't blocked by stale
    // caches; cache acts only as an offline fallback.
    event.respondWith(
        fetch(req).then(resp => {
            if (resp && resp.status === 200 && resp.type === 'basic') {
                const copy = resp.clone();
                caches.open(CACHE_NAME).then(c => c.put(req, copy));
            }
            return resp;
        }).catch(() => caches.match(req))
    );
});
