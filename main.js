import { Game } from './src/game.js';
import { Analytics } from './src/services/analytics.js';
import { Perf } from './src/services/perf.js';
import { ParticleSys } from './src/effects/particles.js';
import { Hints } from './src/services/hints.js';
import { Unlocks } from './src/services/unlocks.js';
import { Gesture } from './src/services/gesture.js';
import { NativeBack } from './src/services/native-back.js';
import { NativeSplash } from './src/services/native-splash.js';

// Detect device perf tier BEFORE Game.init so the game can read `Perf.tier`.
Perf.detect();
ParticleSys.quality = Perf.particleQuality();

// First-launch analytics consent. Respects the prior choice on subsequent
// visits; on a fresh install, emit events ONLY after the player explicitly
// opts in (GDPR/CCPA-safe). Decline permanently disables the emitter until
// re-toggled in Settings. Choice persisted in localStorage.
const CONSENT_KEY = 'mvm_analytics_consent';
function readConsent() {
    try {
        const v = localStorage.getItem(CONSENT_KEY);
        if (v === 'granted') return true;
        if (v === 'denied')  return false;
    } catch (e) {}
    return null; // unknown → show banner
}
function writeConsent(granted) {
    try { localStorage.setItem(CONSENT_KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    Analytics.setEnabled(granted);
    const banner = document.getElementById('analytics-consent-banner');
    if (banner) banner.remove();
}

// Init the emitter but respect the opt-in state immediately.
Analytics.init();
const consent = readConsent();

function showConsentBanner() {
    if (readConsent() !== null) return;                        // already settled
    if (document.getElementById('analytics-consent-banner')) return; // dedupe
    const el = document.createElement('div');
    el.id = 'analytics-consent-banner';
    el.className = 'analytics-consent';
    el.innerHTML = `
        <div class="analytics-consent-inner">
            <p class="analytics-consent-text">
                Share <b>anonymous gameplay data</b> (run length, class picks, crashes) to help balance the game? No ads, no personal data. You can change this later in Settings.
            </p>
            <div class="analytics-consent-actions">
                <button class="btn secondary" data-consent="denied">Decline</button>
                <button class="btn primary" data-consent="granted">Allow</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-consent]').forEach(btn => {
        btn.addEventListener('click', () => writeConsent(btn.dataset.consent === 'granted'));
    });
}

// Defer the first-launch banner until the intro splash is dismissed so it
// doesn't cover the brand moment. If the intro is already gone (reload,
// tests, etc.) show immediately. Otherwise poll briefly — intro dismisses
// on first user tap and is removed from the DOM after ~750ms.
function showConsentWhenReady() {
    if (readConsent() !== null) return;
    const poll = () => {
        if (readConsent() !== null) return;
        const intro = document.getElementById('intro-overlay');
        if (!intro) { showConsentBanner(); return; }
        // Still there — check again soon. Caps at 60s to avoid a runaway loop.
        if ((poll._tries = (poll._tries || 0) + 1) < 60) setTimeout(poll, 1000);
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', poll);
    } else {
        poll();
    }
}

if (consent === null) {
    Analytics.setEnabled(false); // silent until user decides
    showConsentWhenReady();
} else {
    Analytics.setEnabled(consent);
}

// Expose for the Settings panel (Privacy section will wire a toggle to these).
window.MVMConsent = { read: readConsent, write: writeConsent };

Hints.init();
Unlocks.init();

// Global error hook — surface client-side crashes into the analytics stream.
// Skip known browser-extension / cross-origin noise so the crash dashboard
// isn't dominated by Brave/Firefox iOS reader-mode, Grammarly, or ResizeObserver
// notifications we can't fix.
const EXT_NOISE_RE = /__firefox__|__gCrWeb|__gBleyer|webkit\.messageHandlers|Grammarly|__REACT_DEVTOOLS_|__REDUX_DEVTOOLS_|ResizeObserver loop/i;
const isNoiseMessage = (msg) => {
    const s = String(msg || '');
    if (s === 'Script error.' || s === 'Script error') return true;
    return EXT_NOISE_RE.test(s);
};
window.addEventListener('error', (e) => {
    const msg = e && (e.message || (e.error && e.error.message));
    if (isNoiseMessage(msg)) return;
    const src = String((e && e.filename) || '');
    if (/^(chrome|moz|safari-web|brave|webkit-masked)-extension:/i.test(src)) return;
    Analytics.emit('error_client', {
        where: 'window.onerror',
        message: String(msg),
        stack: String(e && e.error && e.error.stack).slice(0, 500)
    });
});
window.addEventListener('unhandledrejection', (e) => {
    const msg = e && e.reason && (e.reason.message || e.reason);
    if (isNoiseMessage(msg)) return;
    Analytics.emit('error_client', {
        where: 'unhandledrejection',
        message: String(msg),
        stack: String(e && e.reason && e.reason.stack).slice(0, 500)
    });
});

// Landscape-hint dismiss handler — moved here from an inline onclick= attribute
// so we stay CSP-clean for App Store / Capacitor wrapping.
function wireLandscapeHint() {
    const hint = document.getElementById('landscape-hint');
    if (!hint) return;
    const dismiss = () => hint.classList.add('dismissed');
    hint.addEventListener('click', dismiss);
    hint.addEventListener('touchstart', dismiss, { passive: true });
}

function bootGame() {
  Game.init();
  wireLandscapeHint();
  Gesture.init();
  NativeBack.init();
}
// Hide the native splash on the first paint after DOMContentLoaded —
// the intro overlay is part of the document, so by the time the
// browser has painted once it's already on-screen and the splash can
// fade out without exposing a blank canvas. Decoupled from Game.init()
// so an init throw / slow path doesn't strand the splash.
function dismissNativeSplashOnFirstPaint() {
  requestAnimationFrame(() => NativeSplash.hide());
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    dismissNativeSplashOnFirstPaint();
    bootGame();
  });
} else {
  dismissNativeSplashOnFirstPaint();
  bootGame();
}

// Register the service worker for offline play (PWA) + handle updates.
// Without an update-aware handler, the SW activates new versions
// silently and the running tab keeps serving stale cached code until
// the player manually refreshes. The new flow:
//   1. Register the SW on window 'load'
//   2. Watch for `updatefound` on the registration
//   3. When the installing worker reaches `installed` AND there's an
//      existing controller (i.e., this is an UPDATE, not a fresh
//      install), show the #sw-update-banner
//   4. Refresh button posts SKIP_WAITING + reloads the page
//   5. controllerchange listener catches the case where the SW
//      activates without our prompt (e.g., another tab triggered it)
//      and reloads silently to keep code in sync
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            // updatefound fires when a new SW is being installed.
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    // Only show the banner when the new worker is
                    // INSTALLED and there's already an active
                    // controller (so this is an update, not first
                    // install). On first install navigator.serviceWorker
                    // .controller is null — we don't want to show
                    // "REFRESH" before the player has even loaded once.
                    if (newWorker.state === 'installed'
                        && navigator.serviceWorker.controller) {
                        showUpdateBanner(reg);
                    }
                });
            });
            // Periodic background check (every 60s) for new builds
            // beyond the initial registration check. Important for
            // installed PWAs that stay open across multiple sessions
            // — without this, players on long sessions never see
            // updates until the next cold launch. Skipped while the
            // tab is hidden so a backgrounded PWA doesn't keep
            // pinging the server (mobile battery / data usage).
            setInterval(() => {
                if (document.visibilityState !== 'visible') return;
                try { reg.update(); } catch (_) {}
            }, 60000);
        }).catch(err => {
            console.warn('Service worker registration failed:', err);
        });

        // controllerchange fires when the active SW is replaced. We
        // reload the page so the running JS matches the new SW's
        // cached resources. Guard with a flag so a user-initiated
        // refresh-via-banner doesn't double-reload.
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (reloading) return;
            reloading = true;
            window.location.reload();
        });
    });
}

function showUpdateBanner(reg) {
    const banner = document.getElementById('sw-update-banner');
    if (!banner) return;
    banner.classList.remove('hidden');
    requestAnimationFrame(() => banner.classList.add('active'));
    const refreshBtn = document.getElementById('btn-sw-refresh');
    const dismissBtn = document.getElementById('btn-sw-dismiss');
    const onRefresh = () => {
        // Tell the waiting SW to take over. Once it does,
        // controllerchange fires and the page reloads.
        if (reg && reg.waiting) {
            try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
        }
        // Fallback: if the SW didn't respond, force a reload after
        // a short window so the player isn't stuck staring at the
        // banner.
        setTimeout(() => window.location.reload(), 600);
    };
    const onDismiss = () => {
        banner.classList.remove('active');
        setTimeout(() => banner.classList.add('hidden'), 240);
    };
    if (refreshBtn) refreshBtn.addEventListener('click', onRefresh, { once: true });
    if (dismissBtn) dismissBtn.addEventListener('click', onDismiss, { once: true });
}

