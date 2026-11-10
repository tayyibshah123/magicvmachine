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
    const pauses = new Map();
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
                add: async request => {
                    const url = absolute(request);
                    downloads.push(url);
                    await pauses.get(url);
                    store.set(url, await network(request));
                }
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
    return { dispatch, caches, stores, downloads, failed, pauses, self,
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

    it('only inspects the selected soundtrack on startup, even when offline', async () => {
        const worker = workerHarness();
        await worker.dispatch('install');
        const urls = music.map(input => new URL(input, origin + '/').href);
        worker.offline();
        const replies = [];
        await worker.dispatch('message', { data: { type: 'MUSIC_CACHE_STATUS', urls }, ports: [{ postMessage: data => replies.push(data) }] });
        expect(replies).toEqual([{ type: 'MUSIC_CACHE_RESULT', ok: false, cached: [], missing: urls, pending: false }]);
        expect(worker.downloads.filter(url => url.includes('/music/'))).toEqual([]);
    });

    it('shares one explicit download across tabs and reports its pending and ready states without extra transfers', async () => {
        const worker = workerHarness();
        const urls = music.map(input => new URL(input, origin + '/').href);
        const replies = [];
        const send = (type, urls) => worker.dispatch('message',
            { data: { type, urls }, ports: [{ postMessage: data => replies.push(data) }] });
        let resume;
        worker.pauses.set(urls[0], new Promise(resolve => { resume = resolve; }));
        const first = send('CACHE_MUSIC', urls);
        const second = send('CACHE_MUSIC', [...urls].reverse());
        await send('MUSIC_CACHE_STATUS', urls);
        expect(replies[0]).toMatchObject({ pending: true, ok: false, missing: urls });
        resume();
        await Promise.all([first, second]);
        expect(replies.slice(1).every(result => result.ok)).toBe(true);
        worker.offline();
        await send('MUSIC_CACHE_STATUS', urls);
        expect(replies.at(-1)).toMatchObject({ pending: false, ok: true, cached: urls });
        expect(worker.downloads).toEqual(urls);
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
        const urls = music.map(input => new URL(input, origin + '/').href);
        const previous = await worker.caches.open(previousName);
        for (const url of urls) await previous.put(url, new Response('old track'));
        await (await worker.caches.open(guidedName)).put(origin + '/guided/music/synth1.ogg', new Response('other edition'));
        await worker.dispatch('install');
        await worker.dispatch('activate');
        expect(await worker.caches.keys()).not.toContain(previousName);
        expect(await worker.caches.keys()).toContain(guidedName);
        worker.offline();
        const replies = [];
        await worker.dispatch('message', { data: { type: 'MUSIC_CACHE_STATUS', urls },
            ports: [{ postMessage: data => replies.push(data) }] });
        expect(replies[0]).toMatchObject({ ok: true, cached: urls, pending: false });
        const response = await worker.dispatch('fetch', { request: { url: urls[0], method: 'GET' } });
        expect(await response.text()).toBe('old track');
        expect(worker.downloads.filter(download => download.includes('/music/'))).toEqual([]);
    });
});

describe('page-to-worker music readiness acknowledgement', () => {
    it('checks the selected AAC cache on activation and sends one download only after explicit action', async () => {
        vi.resetModules();
        codecPolicy('', 'probably');
        vi.stubGlobal('MessageChannel', MessageChannel);
        const { OfflineAudio } = await import('../services/offline-audio.js');
        const postMessage = vi.fn((data, ports) => {
            expect(data.urls).toEqual(music.map(input => new URL(input.replace('.ogg', '.m4a'), origin + '/').href));
            const download = data.type === 'CACHE_MUSIC';
            ports[0].postMessage({ type: 'MUSIC_CACHE_RESULT', ok: download,
                cached: download ? data.urls : [], missing: download ? [] : data.urls });
            ports[0].close();
        });
        const registration = Object.assign(new EventTarget(), { active: { state: 'activated', postMessage } });
        const startup = OfflineAudio.start(registration);
        expect(OfflineAudio.status.state).toBe('checking');
        expect(OfflineAudio.start(registration)).toBe(startup);
        expect((await startup).state).toBe('available');
        expect(postMessage.mock.calls.map(([data]) => data.type)).toEqual(['MUSIC_CACHE_STATUS']);
        const download = OfflineAudio.download();
        expect(OfflineAudio.status.state).toBe('downloading');
        expect(OfflineAudio.download()).toBe(download);
        expect((await download).state).toBe('ready');
        expect(OfflineAudio.status.cached).toHaveLength(5);
        expect(postMessage.mock.calls.map(([data]) => data.type)).toEqual(['MUSIC_CACHE_STATUS', 'CACHE_MUSIC']);
    });

    it('waits for activation, shows an incomplete download and lets the player retry', async () => {
        vi.resetModules();
        codecPolicy('probably', 'probably');
        vi.stubGlobal('MessageChannel', MessageChannel);
        const { OfflineAudio } = await import('../services/offline-audio.js');
        let attempts = 0;
        const worker = Object.assign(new EventTarget(), { state: 'installing', postMessage: vi.fn((data, ports) => {
            if (data.type === 'CACHE_MUSIC') attempts++;
            const count = attempts === 0 ? 0 : attempts === 1 ? 4 : 5;
            ports[0].postMessage({ type: 'MUSIC_CACHE_RESULT', ok: count === 5,
                cached: data.urls.slice(0, count), missing: data.urls.slice(count) });
            ports[0].close();
        }) });
        const registration = Object.assign(new EventTarget(), { installing: worker, active: null });
        const startup = OfflineAudio.start(registration);
        expect(worker.postMessage).not.toHaveBeenCalled();
        registration.active = worker;
        worker.state = 'activated';
        worker.dispatchEvent(new Event('statechange'));
        expect((await startup).state).toBe('available');
        expect((await OfflineAudio.download()).state).toBe('incomplete');
        expect(OfflineAudio.status.missing).toEqual([origin + '/music/lofi.ogg']);
        expect((await OfflineAudio.download()).state).toBe('ready');
        expect(attempts).toBe(2);
    });

    it('recognises an existing full soundtrack from cache status alone', async () => {
        vi.resetModules();
        codecPolicy('probably', 'probably');
        vi.stubGlobal('MessageChannel', MessageChannel);
        const { OfflineAudio } = await import('../services/offline-audio.js');
        const postMessage = vi.fn((data, ports) => {
            ports[0].postMessage({ type: 'MUSIC_CACHE_RESULT', ok: true, cached: data.urls, missing: [] });
            ports[0].close();
        });
        const registration = Object.assign(new EventTarget(), { active: { state: 'activated', postMessage } });
        expect((await OfflineAudio.start(registration)).state).toBe('ready');
        expect((await OfflineAudio.download()).state).toBe('ready');
        expect(postMessage.mock.calls.map(([data]) => data.type)).toEqual(['MUSIC_CACHE_STATUS']);
    });
});
