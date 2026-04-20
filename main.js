import { Game } from './src/game.js';
import { Analytics } from './src/services/analytics.js';
import { Perf } from './src/services/perf.js';
import { ParticleSys } from './src/effects/particles.js';
import { Hints } from './src/services/hints.js';
import { Unlocks } from './src/services/unlocks.js';

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { Game.init(); wireLandscapeHint(); });
} else {
  Game.init();
  wireLandscapeHint();
}

// Register the service worker for offline play (PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
}
