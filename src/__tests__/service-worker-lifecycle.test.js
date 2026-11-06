import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the real bootstrap and worker listeners without starting the game.
vi.mock('../game.js', () => ({ Game: { init: vi.fn() } }));
vi.mock('../services/perf.js', () => ({
    Perf: { detect: vi.fn(), particleQuality: vi.fn(() => 1) }
}));
vi.mock('../effects/particles.js', () => ({ ParticleSys: {} }));
vi.mock('../services/hints.js', () => ({ Hints: { init: vi.fn() } }));
vi.mock('../services/unlocks.js', () => ({ Unlocks: { init: vi.fn() } }));
vi.mock('../services/gesture.js', () => ({ Gesture: { init: vi.fn() } }));
vi.mock('../services/native-back.js', () => ({ NativeBack: { init: vi.fn() } }));
vi.mock('../services/native-splash.js', () => ({ NativeSplash: { hide: vi.fn() } }));

let browserWindow;
let workers;
let registration;
let reload;

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.innerHTML = `
        <div id="sw-update-banner" class="hidden">
            <button id="btn-sw-refresh">Refresh</button>
            <button id="btn-sw-dismiss">Dismiss</button>
        </div>
    `;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('mvm_analytics_consent', 'granted');
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');

    registration = Object.assign(new EventTarget(), {
        installing: null,
        waiting: null,
        update: vi.fn()
    });
    vi.spyOn(registration, 'addEventListener');
    workers = Object.assign(new EventTarget(), {
        controller: null,
        register: vi.fn().mockResolvedValue(registration)
    });
    reload = vi.fn();
    browserWindow = Object.assign(new EventTarget(), {
        location: { reload }
    });
    vi.stubGlobal('window', browserWindow);
    vi.stubGlobal('navigator', { serviceWorker: workers });
    vi.stubGlobal('requestAnimationFrame', vi.fn(callback => {
        callback(0);
        return 1;
    }));
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
});

async function loadBootstrap(controller = null) {
    workers.controller = controller;
    await import('../../main.js');
    browserWindow.dispatchEvent(new Event('load'));
    // The registration promise installs updatefound listeners asynchronously.
    await vi.advanceTimersByTimeAsync(0);
    expect(workers.register).toHaveBeenCalledWith('./service-worker.js');
    expect(registration.addEventListener).toHaveBeenCalledWith('updatefound', expect.any(Function));
}

function takeControl(controller) {
    workers.controller = controller;
    workers.dispatchEvent(new Event('controllerchange'));
}

function finishInstallingWorker() {
    const installing = Object.assign(new EventTarget(), { state: 'installing' });
    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));
}

describe('browser service-worker lifecycle', () => {
    it('reloads once when the controller of an already controlled page is replaced', async () => {
        await loadBootstrap({ version: 'previous build' });

        takeControl({ version: 'new build' });
        workers.dispatchEvent(new Event('controllerchange'));

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('ignores notifications that leave the same worker in control', async () => {
        const controller = { version: 'current build' };
        await loadBootstrap(controller);

        takeControl(controller);

        expect(reload).not.toHaveBeenCalled();
    });

    it('still reloads for an update after the first claim in the same session', async () => {
        await loadBootstrap();
        takeControl({ version: 'first install' });
        expect(reload).not.toHaveBeenCalled();

        takeControl({ version: 'later update' });
        workers.dispatchEvent(new Event('controllerchange'));

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not offer an update banner during a fresh installation', async () => {
        await loadBootstrap();

        finishInstallingWorker();

        expect(document.getElementById('sw-update-banner').classList.contains('hidden')).toBe(true);
    });

    it('offers refresh for an update and asks the waiting worker to activate', async () => {
        await loadBootstrap({ version: 'previous build' });
        registration.waiting = { postMessage: vi.fn() };

        finishInstallingWorker();
        expect(document.getElementById('sw-update-banner').classList.contains('hidden')).toBe(false);
        document.getElementById('btn-sw-refresh').click();

        expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
        expect(reload).not.toHaveBeenCalled();
        takeControl({ version: 'new build' });
        expect(reload).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('does not reload again when takeover arrives after the refresh fallback', async () => {
        await loadBootstrap({ version: 'previous build' });
        registration.waiting = { postMessage: vi.fn() };
        finishInstallingWorker();

        document.getElementById('btn-sw-refresh').click();
        await vi.advanceTimersByTimeAsync(600);
        expect(reload).toHaveBeenCalledTimes(1);

        takeControl({ version: 'slow update' });

        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('dismisses an update without activating or reloading it', async () => {
        await loadBootstrap({ version: 'previous build' });
        registration.waiting = { postMessage: vi.fn() };
        finishInstallingWorker();
        document.getElementById('btn-sw-dismiss').click();
        await vi.advanceTimersByTimeAsync(240);
        expect(document.getElementById('sw-update-banner').classList.contains('hidden')).toBe(true);
        expect(registration.waiting.postMessage).not.toHaveBeenCalled();
        expect(reload).not.toHaveBeenCalled();
    });

    it('checks for updates only while the document is visible', async () => {
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
        await loadBootstrap({ version: 'previous build' });
        await vi.advanceTimersByTimeAsync(60000);
        expect(registration.update).not.toHaveBeenCalled();
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        await vi.advanceTimersByTimeAsync(60000);
        expect(registration.update).toHaveBeenCalledTimes(1);
    });
});

describe('real analytics bootstrap consent', () => {
    it.each([null, 'denied'])('does not record or create an install identifier before consent %s', async consent => {
        if (consent === null) localStorage.removeItem('mvm_analytics_consent');
        else localStorage.setItem('mvm_analytics_consent', consent);
        await loadBootstrap();
        const { Analytics } = await import('../services/analytics.js');
        expect(Analytics.recent()).toEqual([]);
        expect(localStorage.getItem('mvm_analytics_install')).toBeNull();
        expect(sessionStorage.getItem('mvm_analytics_session')).toBeNull();
    });

    it('enables later events only after Allow and persists a later decline', async () => {
        localStorage.removeItem('mvm_analytics_consent');
        await loadBootstrap();
        const { Analytics } = await import('../services/analytics.js');
        document.querySelector('[data-consent="granted"]').click();
        Analytics.emit('run_start', { class: 'tactician' });
        expect(Analytics.recent(1)[0].name).toBe('run_start');
        expect(localStorage.getItem('mvm_analytics_consent')).toBe('granted');
        const before = Analytics.recent(500).length;
        browserWindow.MVMConsent.write(false);
        Analytics.emit('combat_start');
        expect(Analytics.recent(500)).toHaveLength(before);
        expect(localStorage.getItem('mvm_analytics_consent')).toBe('denied');
    });

    it('starts one analytics session across repeated Allow and Decline choices', async () => {
        localStorage.removeItem('mvm_analytics_consent');
        await loadBootstrap();
        const { Analytics } = await import('../services/analytics.js');
        browserWindow.MVMConsent.write(true);
        const session = sessionStorage.getItem('mvm_analytics_session');
        browserWindow.MVMConsent.write(false);
        browserWindow.MVMConsent.write(true);
        expect(sessionStorage.getItem('mvm_analytics_session')).toBe(session);
        expect(Analytics.recent(500).filter(event => event.name === 'session_start')).toHaveLength(1);
    });
});
