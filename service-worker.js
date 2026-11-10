// Magic v Machine — service worker for offline play.
// Caches the app shell on first install; on subsequent loads serves from cache
// while updating in the background (stale-while-revalidate).

// Keep in sync with src/version.js — service worker runs in a separate
// worker context that can't import ES modules, so the version string is
// duplicated by design. Old caches are deleted on activate.
const CACHE_PREFIX = 'mvm-stable-shell-v';
const CACHE_NAME = 'mvm-stable-shell-v1-9-57';
const SCOPE = new URL(self.registration.scope);
const ACTIVE_CACHE = SCOPE.pathname + '|' + CACHE_NAME;
const SHELL_ASSETS = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './src/version.js',
    './src/services/edition-storage.js',
    // Every stylesheet linked by index.html is required on a cold offline boot.
    './src/styles/tokens.css',
    './src/styles/components.css',
    './src/styles/menu.css',
    './src/styles/settings.css',
    './src/styles/snap.css',
    './src/styles/glass.css',
    './src/styles/polish.css',
    './src/styles/bracket-screens.css',
    './src/styles/vfx.css',
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
    './src/ui/intel-modal.js',
    './src/ui/event-art.js',
    './src/ui/class-emblems.js',
    './src/ui/canvas-icons.js',
    // v1.1 services
    './src/services/analytics.js',
    './src/services/consent.js',
    './src/services/perf.js',
    './src/services/hints.js',
    './src/services/unlocks.js',
    './src/services/combat-log.js',
    './src/services/loading.js',
    './src/services/share.js',
    './src/services/streak.js',
    './src/services/boss-minion-roster.js',
    './src/services/achievements.js',
    './src/services/gesture.js',
    './src/services/native-back.js',
    './src/services/native-splash.js',
    './src/services/combat-metrics.js',
    // Include the complete imported module graph before clients.claim().
    './src/services/ascension.js',
    './src/services/assist.js',
    './src/services/breakout.js',
    './src/services/canvas-cache.js',
    './src/services/class-briefing.js',
    './src/services/class-vfx.js',
    './src/services/combat-recap.js',
    './src/services/combat-stats.js',
    './src/services/cosmetics.js',
    './src/services/dailies.js',
    './src/services/diag.js',
    './src/services/fps-hud.js',
    './src/services/intel.js',
    './src/services/onboarding.js',
    './src/services/palette.js',
    './src/services/perf-trace.js',
    './src/services/save-sync.js',
    './src/services/retired-upgrades.js',
    './src/services/run-rules.js',
    './src/services/offline-audio.js',
    './src/services/turn-digest.js',
    './src/services/ui.js',
    './src/services/vfx.js',
    './src/data/matchup-hints.js',
    './src/data/intel-codex.js',
    // SFX samples (v1.2) — precache so offline play has sound from turn 1.
    './sfx/attack.ogg',      './sfx/beam.ogg',         './sfx/buy.ogg',
    './sfx/chains.ogg',      './sfx/click.ogg',        './sfx/dart.ogg',
    './sfx/defend.ogg',      './sfx/digital_sever.ogg', './sfx/earthquake.ogg',
    './sfx/explosion.ogg',   './sfx/glitch_attack.ogg', './sfx/grid_fracture.ogg',
    './sfx/heartbeat.ogg',   './sfx/hex_barrier.ogg',  './sfx/hit.ogg',
    './sfx/laser.ogg',       './sfx/mana.ogg',         './sfx/meteor.ogg',
    './sfx/orbital_strike.ogg', './sfx/overclock.ogg', './sfx/print.ogg',
    './sfx/siren.ogg',       './sfx/snap.ogg',         './sfx/ticking.ogg',
    './sfx/upgrade.ogg',     './sfx/zap.ogg',
    './sfx/attack.m4a',      './sfx/beam.m4a',         './sfx/buy.m4a',
    './sfx/chains.m4a',      './sfx/click.m4a',        './sfx/dart.m4a',
    './sfx/defend.m4a',      './sfx/digital_sever.m4a', './sfx/earthquake.m4a',
    './sfx/explosion.m4a',   './sfx/glitch_attack.m4a', './sfx/grid_fracture.m4a',
    './sfx/heartbeat.m4a',   './sfx/hex_barrier.m4a',  './sfx/hit.m4a',
    './sfx/laser.m4a',       './sfx/mana.m4a',         './sfx/meteor.m4a',
    './sfx/orbital_strike.m4a', './sfx/overclock.m4a', './sfx/print.m4a',
    './sfx/siren.m4a',       './sfx/snap.m4a',         './sfx/ticking.m4a',
    './sfx/upgrade.m4a',     './sfx/zap.m4a'
];

// Music is large and codec-dependent. Install the playable shell first;
// the page requests only the format selected by the real audio resolver.
const MUSIC_ASSETS = [
    './music/synth1.ogg', './music/synth2.ogg', './music/synth3.ogg',
    './music/synth4.ogg', './music/lofi.ogg',
    './music/synth1.m4a', './music/synth2.m4a', './music/synth3.m4a',
    './music/synth4.m4a', './music/lofi.m4a'
];
const MUSIC_URLS = new Set(MUSIC_ASSETS.map(asset => new URL(asset, SCOPE).href));
const musicJobs = new Map();

async function musicCacheResult(urls, download = false) {
    const cached = [], missing = [];
    let cache;
    try { cache = await caches.open(ACTIVE_CACHE); }
    catch (_) {
        return { type: 'MUSIC_CACHE_RESULT', ok: false, cached, missing: urls, error: 'Music cache unavailable' };
    }
    // Serial downloads avoid competing with gameplay resources and keep peak
    // network and memory pressure small on phones. Status checks only read.
    for (const url of urls) {
        try {
            if (!(await cache.match(url))) {
                if (!download) { missing.push(url); continue; }
                await cache.add(url);
            }
            cached.push(url);
        } catch (_) { missing.push(url); }
    }
    return { type: 'MUSIC_CACHE_RESULT', ok: missing.length === 0, cached, missing };
}

self.addEventListener('install', event => {
    // Don't auto-skipWaiting any more — the user-facing update
    // banner posts {type:'SKIP_WAITING'} when the player taps
    // REFRESH. That keeps a mid-run player from getting their
    // tab swapped out from under them by a silent SW update.
    event.waitUntil(
        caches.open(ACTIVE_CACHE).then(cache =>
            // addAll fails atomically — if any asset 404s, the SW won't install.
            // We tolerate failures by adding individually.
            Promise.all(SHELL_ASSETS.map(url => cache.add(url).catch(error => {
                if (url === './' || /\.(?:html|js|css)$/.test(url)) throw error;
                return null;
            })))
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
    if (event.data && ['CACHE_MUSIC', 'MUSIC_CACHE_STATUS'].includes(event.data.type)) {
        const urls = event.data.urls;
        const valid = Array.isArray(urls) && urls.length > 0 && urls.length <= 5
            && new Set(urls).size === urls.length && urls.every(url => MUSIC_URLS.has(url));
        if (!valid) {
            event.ports?.[0]?.postMessage({ type: 'MUSIC_CACHE_RESULT', ok: false, cached: [], missing: [], error: 'Invalid music request' });
            return;
        }
        const key = JSON.stringify([...urls].sort());
        const reply = result => event.ports?.[0]?.postMessage(result);
        let job = musicJobs.get(key);
        if (event.data.type === 'MUSIC_CACHE_STATUS') {
            event.waitUntil(musicCacheResult(urls).then(result => reply({ ...result, pending: !!job && !result.ok })));
            return;
        }
        if (!job) {
            job = musicCacheResult(urls, true).finally(() => musicJobs.delete(key));
            musicJobs.set(key, job);
        }
        event.waitUntil(job.then(reply));
    }
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.map(async key => {
            const sameEdition = key.startsWith(SCOPE.pathname + '|' + CACHE_PREFIX);
            const legacy = CACHE_PREFIX === 'mvm-stable-shell-v' && key.startsWith('mvm-shell-v')
                && await (await caches.open(key)).match(new URL('index.html', SCOPE));
            if ((sameEdition && key !== ACTIVE_CACHE) || legacy) {
                // Unchanged tracks can survive an app update without another
                // large download. Never read another edition's music cache.
                const previous = await caches.open(key);
                const current = await caches.open(ACTIVE_CACHE);
                for (const url of MUSIC_URLS) {
                    const response = await previous.match(url);
                    if (response && !(await current.match(url))) await current.put(url, response);
                }
                await caches.delete(key);
            }
        }))).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    // Only handle GET — POSTs go straight to network
    if (req.method !== 'GET') return;
    // Skip third-party hosts (Google Fonts, etc.) — let the browser handle them
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (!url.pathname.startsWith(SCOPE.pathname)) return;
    // The nested Guided edition owns its own worker and offline shell.
    if (url.pathname.slice(SCOPE.pathname.length).startsWith('guided/')) return;

    // Network-first for code/markup so dev iteration isn't blocked by stale
    // caches; cache acts only as an offline fallback.
    event.respondWith(
        fetch(req).then(resp => {
            if (resp && resp.status === 200 && resp.type === 'basic') {
                const copy = resp.clone();
                caches.open(ACTIVE_CACHE).then(c => c.put(req, copy));
            }
            return resp;
        }).catch(async () => {
            const cache = await caches.open(ACTIVE_CACHE);
            const exact = await cache.match(req);
            if (exact) return exact;
            // The manifest launch URL includes ?src=pwa. A first offline
            // launch has only the precached canonical HTML, not that query.
            // Restrict this fallback to this edition's document navigation.
            if (req.mode === 'navigate' && (url.pathname === SCOPE.pathname
                || url.pathname === new URL('index.html', SCOPE).pathname)) {
                return cache.match(new URL('index.html', SCOPE), { ignoreSearch: true });
            }
            return undefined;
        })
    );
});
