import { AudioMgr } from '../audio.js';

// Acknowledged worker caching is separate from playable-shell readiness.
// Failures are visible to callers and retried on the next page load.
export const OfflineAudio = {
    status: { state: 'unavailable', cached: [], missing: [] },
    ready: null,
    start(registration) {
        if (this.ready) return this.ready;
        this.status = { state: 'downloading', cached: [], missing: [] };
        this.ready = (async () => {
            try {
                const worker = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => { cleanup(); reject(new Error('Worker activation timed out')); }, 60000);
                    const observed = new Set();
                    const check = () => {
                        if (registration.active?.state === 'activated') { cleanup(); resolve(registration.active); return; }
                        const candidate = registration.installing || registration.waiting;
                        if (candidate && !observed.has(candidate)) {
                            observed.add(candidate);
                            candidate.addEventListener('statechange', check);
                        }
                    };
                    const cleanup = () => {
                        clearTimeout(timeout);
                        registration.removeEventListener('updatefound', check);
                        for (const candidate of observed) candidate.removeEventListener('statechange', check);
                    };
                    registration.addEventListener('updatefound', check);
                    check();
                });
                const sources = Object.values(AudioMgr.TRACKS).flatMap(track => track.sources || [track.src]);
                const urls = [...new Set(sources.map(source => new URL(AudioMgr._resolveTrackSrc(source), document.baseURI).href))];
                const result = await new Promise((resolve, reject) => {
                    const channel = new MessageChannel();
                    const finish = (error, data) => {
                        clearTimeout(timeout);
                        channel.port1.close();
                        if (error) reject(error); else resolve(data);
                    };
                    // Long tracks can take minutes on mobile data. The worker
                    // owns the download lifetime even if the page is closed.
                    const timeout = setTimeout(() => finish(new Error('Music download acknowledgement timed out')), 600000);
                    channel.port1.onmessage = event => {
                        if (event.data?.type === 'MUSIC_CACHE_RESULT') finish(null, event.data);
                    };
                    try { worker.postMessage({ type: 'CACHE_MUSIC', urls }, [channel.port2]); }
                    catch (error) { finish(error); }
                });
                this.status = { state: result.ok ? 'ready' : 'incomplete', cached: result.cached || [], missing: result.missing || [], error: result.error };
            } catch (error) {
                this.status = { state: 'incomplete', cached: [], missing: [], error: String(error.message || error) };
            }
            return this.status;
        })();
        return this.ready;
    }
};
