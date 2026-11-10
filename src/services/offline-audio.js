import { AudioMgr } from '../audio.js';

// Rounded sizes of the complete published soundtrack, in decimal MB.
const FORMATS = { ogg: 'About 107 MB in Ogg Vorbis.', m4a: 'About 72 MB in AAC.' };

function activatedWorker(registration) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Worker activation timed out'));
        }, 60000);
        const observed = new Set();
        function check() {
            if (registration.active?.state === 'activated') {
                cleanup();
                resolve(registration.active);
                return;
            }
            const candidate = registration.installing || registration.waiting || registration.active;
            if (candidate && !observed.has(candidate)) {
                observed.add(candidate);
                candidate.addEventListener('statechange', check);
            }
        }
        function cleanup() {
            clearTimeout(timeout);
            registration.removeEventListener('updatefound', check);
            for (const candidate of observed) candidate.removeEventListener('statechange', check);
        }
        registration.addEventListener('updatefound', check);
        check();
    });
}

export const OfflineAudio = {
    status: { state: 'unavailable', cached: [], missing: [] },

    init() {
        if (this._button) return;
        this._button = document.getElementById?.('btn-offline-audio-download');
        this._button?.addEventListener('click', () => this.download());
        if (window.Capacitor?.isNativePlatform?.()) this._setStatus('bundled');
    },

    start(registration) {
        this.init();
        if (this.status.state === 'bundled') return Promise.resolve(this.status);
        if (this._startup) return this._startup;
        const sources = Object.values(AudioMgr.TRACKS).flatMap(track => track.sources || [track.src]);
        this._urls = [...new Set(sources.map(source => new URL(AudioMgr._resolveTrackSrc(source), document.baseURI).href))];
        this._setStatus('checking');
        this._startup = activatedWorker(registration).then(worker => {
            this._worker = worker;
            return this._checkCache();
        }).catch(error => this._setStatus('unavailable', { error: error.message }));
        return this._startup;
    },

    download() {
        if (this._download) return this._download;
        if (!this._worker || !['available', 'incomplete'].includes(this.status.state)) return Promise.resolve(this.status);
        this._setStatus('downloading', this.status);
        // A slow connection can take minutes. The worker keeps the job alive
        // independently of the Settings panel or the initiating document.
        this._download = this._request('CACHE_MUSIC', 600000)
            .then(result => this._setStatus(result.ok ? 'ready' : 'incomplete', result))
            .catch(error => this._setStatus('incomplete', { ...this.status, error: error.message }))
            .finally(() => { this._download = null; });
        return this._download;
    },

    async _checkCache() {
        try {
            const result = await this._request('MUSIC_CACHE_STATUS', 5000);
            if (result.pending) {
                this._setStatus('downloading', result);
                setTimeout(() => this._checkCache(), 1500);
                return this.status;
            }
            const incomplete = this.status.state === 'downloading' || result.error;
            return this._setStatus(result.ok ? 'ready' : incomplete ? 'incomplete' : 'available', result);
        } catch (error) {
            // An older worker may still be active during an update. Its
            // explicit download message remains supported.
            return this._setStatus('available', { error: error.message });
        }
    },

    _request(type, timeoutMs) {
        return new Promise((resolve, reject) => {
            const channel = new MessageChannel();
            const timeout = setTimeout(() => finish(new Error('Soundtrack request timed out')), timeoutMs);
            function finish(error, data) {
                clearTimeout(timeout);
                channel.port1.close();
                if (error) reject(error); else resolve(data);
            }
            channel.port1.onmessage = event => {
                if (event.data?.type === 'MUSIC_CACHE_RESULT') finish(null, event.data);
            };
            try { this._worker.postMessage({ type, urls: this._urls }, [channel.port2]); }
            catch (error) { channel.port2.close(); finish(error); }
        });
    },

    _setStatus(state, result = {}) {
        this.status = { state, cached: result.cached || [], missing: result.missing || [], error: result.error };
        const label = document.getElementById?.('offline-audio-status');
        const size = document.getElementById?.('offline-audio-size');
        const messages = {
            unavailable: 'Soundtrack downloads are unavailable here.',
            bundled: 'The soundtrack is included in this app.',
            checking: 'Checking for saved tracks.',
            available: 'Download all tracks to listen offline.',
            downloading: 'Downloading the soundtrack. You can keep playing.',
            ready: 'The full soundtrack is ready to play offline.',
            incomplete: 'Some tracks could not be saved. Check your connection and available storage, then try again.'
        };
        if (label) label.textContent = messages[state];
        if (size) {
            size.hidden = !this._urls || state === 'unavailable' || state === 'bundled';
            if (!size.hidden) size.textContent = FORMATS[this._urls[0].split('.').at(-1)];
        }
        if (this._button) {
            this._button.disabled = !['available', 'incomplete'].includes(state);
            this._button.hidden = state === 'bundled';
            this._button.textContent = state === 'incomplete' ? 'Retry download' : 'Download soundtrack';
        }
        return this.status;
    }
};
