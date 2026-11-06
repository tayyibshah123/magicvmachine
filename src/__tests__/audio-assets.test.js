// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import { AudioMgr } from '../audio.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workerSource = readFileSync(resolve(root, 'service-worker.js'), 'utf8');
const origin = 'https://game.example';
const music = Object.values(AudioMgr.TRACKS).flatMap(track => track.sources || [track.src]);
const media = [...music, ...[...AudioMgr.SFX_IDS].map(id => './sfx/' + id + '.ogg')];

function codecPolicy(ogg, aac, native = false) {
    vi.stubGlobal('document', { baseURI: origin + '/', createElement: () => ({ canPlayType: mime => mime.includes('ogg') ? ogg : aac }) });
    vi.stubGlobal('window', { Capacitor: { isNativePlatform: () => native } });
    AudioMgr._preferredFmt = null;
}

function containerHeader(path) {
    const descriptor = openSync(path, 'r');
    const header = Buffer.alloc(12);
    try { readSync(descriptor, header, 0, header.length, 0); } finally { closeSync(descriptor); }
    return header;
}

// Execute the actual worker. Only the browser's cache/network primitives
// are replaced, with each network response backed by the real local asset.
function workerHarness() {
    const listeners = new Map(), stores = new Map(), downloads = [];
    const failed = new Set();
    let online = true;
    const absolute = request => new URL(typeof request === 'string' ? request : request.url, origin + '/').href;
    const network = async request => {
        const url = absolute(request);
        if (!online || failed.has(url)) throw new Error('Network unavailable: ' + url);
        const path = new URL(url).pathname;
        const header = containerHeader(resolve(root, '.' + (path === '/' ? '/index.html' : path)));
        const response = new Response(header, { status: 200 });
        Object.defineProperty(response, 'type', { value: 'basic' });
        return response;
    };
    const caches = {
        keys: async () => [...stores.keys()],
        delete: async name => stores.delete(name),
        open: async name => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                match: async request => store.get(absolute(request))?.clone(),
                put: async (request, response) => { store.set(absolute(request), response.clone()); },
                add: async request => { downloads.push(absolute(request)); store.set(absolute(request), await network(request)); }
            };
        }
    };
    const self = {
        registration: { scope: origin + '/' }, location: { origin },
        clients: { claim: vi.fn() }, skipWaiting: vi.fn(),
        addEventListener: (name, callback) => listeners.set(name, callback)
    };
    runInNewContext(workerSource, { self, caches, URL, Set, Promise, fetch: network });
    const dispatch = async (name, fields = {}) => {
        const pending = [];
        let response;
        listeners.get(name)({ ...fields, waitUntil: promise => pending.push(promise), respondWith: promise => { response = promise; } });
        await Promise.all(pending);
        return response && await response;
    };
    return { dispatch, caches, stores, downloads, failed, self,
        offline: () => { online = false; }, online: () => { online = true; } };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); AudioMgr._preferredFmt = null; });

describe('published audio and offline codec compatibility', () => {
    it.each([
        ['Vorbis browser', 'probably', 'probably', false, '.ogg'],
        ['AAC-only browser', '', 'probably', false, '.m4a'],
        ['AAC-preferred browser', 'maybe', 'probably', false, '.m4a'],
        ['native WebView', 'probably', 'probably', true, '.m4a']
    ])('%s resolves every actual music and SFX id to an existing valid container', (name, ogg, aac, native, extension) => {
        codecPolicy(ogg, aac, native);
        expect(media).toHaveLength(31);
        for (const input of media) {
            const url = AudioMgr._resolveTrackSrc(input);
            expect(url.endsWith(extension), input).toBe(true);
            const header = containerHeader(resolve(root, url));
            expect(extension === '.ogg' ? header.toString('ascii', 0, 4) : header.toString('ascii', 4, 8), url)
                .toBe(extension === '.ogg' ? 'OggS' : 'ftyp');
        }
    });

    it('activates the playable shell with both tiny SFX formats before downloading any music', async () => {
        const worker = workerHarness();
        await worker.dispatch('install');
        await worker.dispatch('activate');
        expect(worker.self.clients.claim).toHaveBeenCalledOnce();
        expect(worker.downloads.filter(url => url.includes('/music/'))).toEqual([]);
        expect(worker.downloads.filter(url => url.includes('/sfx/'))).toHaveLength(52);
        expect(worker.downloads).toContain(origin + '/src/services/run-rules.js');
        worker.offline();
        for (const path of ['/main.js', '/src/services/offline-audio.js', '/src/services/run-rules.js', '/sfx/attack.ogg', '/sfx/attack.m4a']) {
            const response = await worker.dispatch('fetch', { request: { url: origin + path, method: 'GET' } });
            expect(response?.status, path).toBe(200);
        }
    });

    it.each([['Vorbis', 'probably', '.ogg'], ['AAC', '', '.m4a']])('acknowledges only selected %s music and serves all resolved media on an offline cold request', async (name, ogg, extension) => {
        codecPolicy(ogg, 'probably');
        const worker = workerHarness();
        await worker.dispatch('install');
        const urls = music.map(input => new URL(AudioMgr._resolveTrackSrc(input), origin + '/').href);
        const replies = [];
        await worker.dispatch('message', { data: { type: 'CACHE_MUSIC', urls }, ports: [{ postMessage: data => replies.push(data) }] });
        expect(replies).toEqual([{ type: 'MUSIC_CACHE_RESULT', ok: true, cached: urls, missing: [] }]);
        expect(worker.downloads.filter(url => url.includes('/music/'))).toEqual(urls);
        expect(urls.every(url => url.endsWith(extension))).toBe(true);
        worker.offline();
        for (const input of media) {
            const url = new URL(AudioMgr._resolveTrackSrc(input), origin + '/').href;
            const response = await worker.dispatch('fetch', { request: { url, method: 'GET' } });
            expect(response?.status, url).toBe(200);
            const header = Buffer.from(await response.arrayBuffer());
            expect(extension === '.ogg' ? header.toString('ascii', 0, 4) : header.toString('ascii', 4, 8), url)
                .toBe(extension === '.ogg' ? 'OggS' : 'ftyp');
        }
    });

    it('reports a partial music failure accurately and retries only missing tracks', async () => {
        const worker = workerHarness();
        const urls = music.map(input => new URL(input, origin + '/').href);
        const replies = [];
        worker.failed.add(urls[2]);
        await worker.dispatch('message', { data: { type: 'CACHE_MUSIC', urls }, ports: [{ postMessage: data => replies.push(data) }] });
        expect(replies[0].ok).toBe(false);
        expect(replies[0].missing).toEqual([urls[2]]);
        worker.failed.clear();
        await worker.dispatch('message', { data: { type: 'CACHE_MUSIC', urls }, ports: [{ postMessage: data => replies.push(data) }] });
        expect(replies[1].ok).toBe(true);
        expect(worker.downloads.filter(url => url === urls[2])).toHaveLength(2);
        expect(worker.downloads.filter(url => url === urls[0])).toHaveLength(1);
    });

    it.each([
        ['https://elsewhere.example/music/synth1.ogg'],
        [origin + '/guided/music/synth1.ogg'],
        [origin + '/music/unknown.ogg'],
        [origin + '/music/synth1.ogg?download=other'],
        []
    ])('rejects unlisted or foreign music requests %j without fetching anything', async (...urls) => {
        const worker = workerHarness();
        const replies = [];
        await worker.dispatch('message', { data: { type: 'CACHE_MUSIC', urls }, ports: [{ postMessage: data => replies.push(data) }] });
        expect(replies[0].ok).toBe(false);
        expect(worker.downloads).toEqual([]);
    });

    it('carries unchanged music into an app update without copying or deleting another edition', async () => {
        const worker = workerHarness();
        const previousName = '/|' + workerSource.match(/const CACHE_PREFIX = '([^']+)'/)[1] + '0-0-0';
        const guidedName = '/guided/|mvm-guided-shell-v0-0-0';
        const url = origin + '/music/synth1.ogg';
        await (await worker.caches.open(previousName)).put(url, new Response('old track'));
        await (await worker.caches.open(guidedName)).put(origin + '/guided/music/synth1.ogg', new Response('other edition'));
        await worker.dispatch('install');
        await worker.dispatch('activate');
        expect(await worker.caches.keys()).not.toContain(previousName);
        expect(await worker.caches.keys()).toContain(guidedName);
        worker.offline();
        const response = await worker.dispatch('fetch', { request: { url, method: 'GET' } });
        expect(await response.text()).toBe('old track');
        expect(worker.downloads.filter(download => download.includes('/music/'))).toEqual([]);
    });
});

describe('page-to-worker music readiness acknowledgement', () => {
    it('uses the real resolver once, waits for worker acknowledgement and reuses its readiness promise', async () => {
        vi.resetModules();
        codecPolicy('', 'probably');
        vi.stubGlobal('MessageChannel', MessageChannel);
        const { OfflineAudio } = await import('../services/offline-audio.js');
        const postMessage = vi.fn((data, ports) => {
            expect(data.urls).toEqual(music.map(input => new URL(input.replace('.ogg', '.m4a'), origin + '/').href));
            ports[0].postMessage({ type: 'MUSIC_CACHE_RESULT', ok: true, cached: data.urls, missing: [] });
            ports[0].close();
        });
        const registration = Object.assign(new EventTarget(), { active: { state: 'activated', postMessage } });
        const ready = OfflineAudio.start(registration);
        expect(OfflineAudio.status.state).toBe('downloading');
        expect(OfflineAudio.start(registration)).toBe(ready);
        expect((await ready).state).toBe('ready');
        expect(OfflineAudio.status.cached).toHaveLength(5);
        expect(postMessage).toHaveBeenCalledOnce();
    });

    it('does not report music ready merely because the shell activated, and exposes an incomplete acknowledgement', async () => {
        vi.resetModules();
        codecPolicy('probably', 'probably');
        vi.stubGlobal('MessageChannel', MessageChannel);
        const { OfflineAudio } = await import('../services/offline-audio.js');
        let reply;
        const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn((data, ports) => {
            reply = () => {
                ports[0].postMessage({ type: 'MUSIC_CACHE_RESULT', ok: false, cached: data.urls.slice(0, 4), missing: [data.urls[4]] });
                ports[0].close();
            };
        }) });
        const registration = Object.assign(new EventTarget(), { installing: worker, active: null });
        const ready = OfflineAudio.start(registration);
        expect(worker.postMessage).not.toHaveBeenCalled();
        registration.active = worker;
        worker.state = 'activated';
        worker.dispatchEvent(new Event('statechange'));
        await Promise.resolve();
        expect(OfflineAudio.status.state).toBe('downloading');
        expect(worker.postMessage).toHaveBeenCalledOnce();
        reply();
        expect((await ready).state).toBe('incomplete');
        expect(OfflineAudio.status.missing).toEqual([origin + '/music/lofi.ogg']);
    });
});
