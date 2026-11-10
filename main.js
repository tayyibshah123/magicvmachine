// Install the edition's storage view before any game module reads its profile.
import './src/services/edition-storage.js';
import { Game } from './src/game.js';
import { STATE } from './src/constants.js';
import { Analytics } from './src/services/analytics.js';
import { Perf } from './src/services/perf.js';
import { ParticleSys } from './src/effects/particles.js';
import { Hints } from './src/services/hints.js';
import { Unlocks } from './src/services/unlocks.js';
import { Gesture } from './src/services/gesture.js';
import { NativeBack } from './src/services/native-back.js';
import { NativeSplash } from './src/services/native-splash.js';
import * as LearningUI from './src/ui/learning-ui.js';
import { Learning } from './src/services/learning.js';
import { OfflineAudio } from './src/services/offline-audio.js';
import { createConsentController } from './src/services/consent.js';
import { sharedFightFromUrl } from './src/services/shared-fight.js';
import { APP_EDITION } from './src/version.js';

const sharedFight = APP_EDITION === 'guided' ? sharedFightFromUrl(window.location.href) : null;
// The linked fight occupies this document until the player chooses the
// campaign. Keep even incidental boot-time writes out of the real profile.
if (sharedFight) window.__MVM_PROFILE_SCOPE__?.beginPractice();

// Detect device perf tier BEFORE Game.init so the game can read `Perf.tier`.
Perf.detect();
ParticleSys.quality = Perf.particleQuality();

// Optional local diagnostics. Respect the stored choice and record nothing
// before an explicit opt-in. There is no network transport. Settings can
// change the choice later.
const CONSENT_KEY = 'mvm_analytics_consent';
let analyticsInitialized = false;
let consentController = null;
function applyAnalyticsConsent(granted) {
    Analytics.setEnabled(granted);
    if (granted && !analyticsInitialized) {
        analyticsInitialized = true;
        Analytics.init();
    }
}
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
    applyAnalyticsConsent(granted);
    consentController?.settle();
    const banner = document.getElementById('analytics-consent-banner');
    if (banner) banner.remove();
    const setting = document.getElementById('chk-local-diagnostics');
    if (setting) setting.checked = granted;
}

// Apply consent before initialization can record a session or install ID.
const consent = readConsent();
applyAnalyticsConsent(consent === true && !sharedFight);

function showConsentBanner(onChoice) {
    if (readConsent() !== null) return;                        // already settled
    if (document.getElementById('analytics-consent-banner')) return; // dedupe
    const el = document.createElement('div');
    el.id = 'analytics-consent-banner';
    el.className = 'analytics-consent';
    el.innerHTML = `
        <div class="analytics-consent-inner">
            <p class="analytics-consent-text">
                Enable <b>optional local diagnostics</b>? Gameplay and error events are kept on this device for troubleshooting, with recent events saved when you leave. Nothing is sent automatically. You can change this in Settings.
            </p>
            <div class="analytics-consent-actions">
                <button class="btn secondary" data-consent="denied">Decline</button>
                <button class="btn primary" data-consent="granted">Allow</button>
            </div>
        </div>`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-consent]').forEach(btn => {
        btn.addEventListener('click', () => onChoice(btn.dataset.consent === 'granted', btn));
    });
    return el;
}

// Ask at a visible menu or map after onboarding, never over an action or
// a teaching overlay. Diagnostics stay off throughout the wait.
function showConsentWhenReady() {
    if (readConsent() !== null) return;
    const start = () => {
        consentController = createConsentController({ read: readConsent, write: writeConsent,
            render: showConsentBanner, getState: () => Game.currentState });
        consentController.start();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else start();
}

if (consent === null && !sharedFight) {
    showConsentWhenReady();
}

// Expose for the Settings panel (Privacy section will wire a toggle to these).
window.MVMConsent = { read: readConsent, write: writeConsent,
    refresh: options => consentController?.refresh(options) };
window.MVMOfflineAudio = OfflineAudio;

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
  Game._learningUI = LearningUI;
  Game.init({ sharedFightId: sharedFight?.id });
  wireLearningSettings();
  wireLandscapeHint();
  Gesture.init();
  NativeBack.init();
}

function wireLearningSettings() {
  const anchor = document.getElementById('btn-glossary');
  if (!anchor || document.getElementById('learning-settings')) return;
  const section = document.createElement('section');
  section.id = 'learning-settings';
  section.className = 'learning-settings';
  const label = document.createElement('label');
  label.htmlFor = 'learning-mode';
  label.textContent = 'Next run rules';
  const choice = document.createElement('select');
  choice.id = 'learning-mode';
  for (const [value, text] of [['guided', 'Guided: introduce features gradually'], ['full', 'Full Rules: every system available']]) {
    const option = document.createElement('option');
    option.value = value; option.textContent = text; choice.appendChild(option);
  }
  choice.value = Learning.getMode();
  choice.onchange = () => Game.setLearningMode(choice.value);
  const note = document.createElement('p');
  note.textContent = 'Your current saved run keeps the rules it started with.';
  const practice = document.createElement('button');
  practice.id = 'btn-learning-practice';
  practice.className = 'btn secondary';
  practice.textContent = 'OPTIONAL PRACTICE';
  practice.onclick = () => Game.openPracticeLibrary();
  section.append(label, choice, note, practice);
  anchor.before(section);
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
//   5. controllerchange ignores the first worker claiming this page,
//      then reloads when an existing worker is replaced (including
//      updates triggered by another tab) to keep code in sync
let reloadingForServiceWorkerUpdate = false;
const ownWorkerUrl = new URL('./service-worker.js', import.meta.url).href;
function isOwnController(controller) {
    // A first visit to /guided/ can initially be controlled by Stable's
    // parent-scope worker. Its replacement is the child's first install,
    // not an update that should refresh onboarding.
    return !!controller && (!controller.scriptURL || controller.scriptURL === ownWorkerUrl);
}
function reloadForServiceWorkerUpdate() {
    // The activation event and Refresh's fallback can arrive in either
    // order. They must share a guard so one update only reloads once.
    if (reloadingForServiceWorkerUpdate) return;
    reloadingForServiceWorkerUpdate = true;
    window.location.reload();
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js').then(reg => {
            OfflineAudio.start(reg);
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
                        && isOwnController(navigator.serviceWorker.controller)) {
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

        // clients.claim() also fires controllerchange on a FIRST install.
        // Reloading then interrupts consent/onboarding as soon as the
        // offline download finishes. Only reload when a worker that was
        // already controlling this page is replaced by a different one.
        // Track the first claim so later updates in this session still
        // reload, and guard against duplicate update notifications.
        let currentController = navigator.serviceWorker.controller;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            const previousController = currentController;
            currentController = navigator.serviceWorker.controller;
            if (!isOwnController(previousController) || !currentController
                || previousController === currentController) return;
            reloadForServiceWorkerUpdate();
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
        setTimeout(reloadForServiceWorkerUpdate, 600);
    };
    const onDismiss = () => {
        banner.classList.remove('active');
        setTimeout(() => banner.classList.add('hidden'), 240);
    };
    if (refreshBtn) refreshBtn.addEventListener('click', onRefresh, { once: true });
    if (dismissBtn) dismissBtn.addEventListener('click', onDismiss, { once: true });
}

