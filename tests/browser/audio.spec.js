import { test, expect, storagePrefix } from './fixtures.js';

test.setTimeout(180000);

async function prepareProfile(context, forceAAC) {
    await context.addInitScript(({ prefix, forceAAC }) => {
        if (location.origin === 'null') return;
        if (!localStorage.getItem(prefix + 'mvm_qa_audio_seeded')) {
            for (const [key, value] of Object.entries({ mvm_onboarding_done: '1', mvm_first_run_done: '1',
                mvm_analytics_consent: 'denied', mvm_operator_name: 'AUDIO QA', mvm_music_track: 'synth' })) {
                localStorage.setItem(prefix + key, value);
            }
            localStorage.setItem(prefix + 'mvm_qa_audio_seeded', '1');
            localStorage.setItem(prefix + 'mvm_qa_audio_seed_count', '1');
        }
        window.__qaAudioDocument = `${Date.now()}-${Math.random()}`;
        window.__qaMediaErrors = [];
        document.addEventListener('error', event => {
            if (event.target instanceof HTMLMediaElement && event.target.error) {
                window.__qaMediaErrors.push({ src: event.target.currentSrc || event.target.src,
                    code: event.target.error.code, message: event.target.error.message });
            }
        }, true);
        const original = HTMLMediaElement.prototype.canPlayType;
        window.__qaNativeAAC = original.call(document.createElement('audio'), 'audio/mp4; codecs="mp4a.40.2"');
        if (forceAAC) {
            // Exercise the actual AAC resolver/media pipeline on Chromium.
            // This models an AAC-only codec policy, not a physical Safari.
            HTMLMediaElement.prototype.canPlayType = function (mime) {
                return mime.includes('ogg') ? '' : original.call(this, mime);
            };
        }
    }, { prefix: storagePrefix, forceAAC });
}

async function enterMenu(page, path = '/') {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.Game?.canvas && window.Game?.ctx);
    await page.locator('#intro-overlay').tap();
    await expect(page.locator('#intro-overlay')).toHaveCount(0);
    await expect(page.locator('#btn-start')).toBeVisible();
}

async function inspectActualAudio(page, extension) {
    const tracks = [];
    for (const id of ['synth1', 'synth2', 'synth3', 'synth4', 'lofi']) {
        await page.evaluate(async id => {
            const { AudioMgr } = await import('/src/audio.js');
            AudioMgr.musicEnabled = true;
            AudioMgr.bossSilence = false;
            if (id === 'lofi') AudioMgr.setTrack('lofi');
            else {
                AudioMgr.setTrack('synth');
                AudioMgr.setSectorMusic(Number(id.slice(-1)));
            }
            AudioMgr.startMusic();
        }, id);
        await expect.poll(() => page.evaluate(async ({ id, extension }) => {
            const { AudioMgr } = await import('/src/audio.js');
            const bgm = AudioMgr.bgm;
            return !!bgm && new URL(bgm.currentSrc || bgm.src).pathname.endsWith('/' + id + extension)
                && !bgm.error && bgm.readyState >= 2 && bgm.duration > 0
                && bgm.buffered.length > 0 && bgm.buffered.end(bgm.buffered.length - 1) > 0
                && !bgm.paused && bgm.currentTime > 0;
        }, { id, extension }), { timeout: 20000, message: `${id}${extension} loads and actually decodes/plays` }).toBe(true).catch(async error => {
            const actual = await page.evaluate(async () => {
                const { AudioMgr } = await import('/src/audio.js');
                const bgm = AudioMgr.bgm;
                return { src: bgm?.currentSrc || bgm?.src, readyState: bgm?.readyState,
                    duration: bgm?.duration, currentTime: bgm?.currentTime, paused: bgm?.paused,
                    error: bgm?.error?.message, format: AudioMgr._preferredFmt, mediaErrors: window.__qaMediaErrors };
            });
            throw new Error(error.message + '\nActual audio: ' + JSON.stringify(actual));
        });
        tracks.push(await page.evaluate(async () => {
            const { AudioMgr } = await import('/src/audio.js');
            const bgm = AudioMgr.bgm;
            return { src: new URL(bgm.currentSrc || bgm.src).pathname,
                // The QA server has no byte-range/Content-Length support;
                // Vorbis legitimately reports Infinity for that stream.
                duration: Number.isFinite(bgm.duration) ? bgm.duration : 'stream',
                decodedBufferedSeconds: bgm.buffered.end(bgm.buffered.length - 1),
                readyState: bgm.readyState, currentTime: bgm.currentTime, error: bgm.error?.code || null };
        }));
    }
    await expect.poll(() => page.evaluate(async () => {
        const { AudioMgr } = await import('/src/audio.js');
        return [...AudioMgr.SFX_IDS].every(id => AudioMgr._sfxStatus[id] === 'loaded'
            && AudioMgr._sfxBuffers[id]?.duration > 0);
    }), { timeout: 20000, message: 'all 26 real SFX ids fetch and decode into fresh Web Audio buffers' }).toBe(true);
    const sfx = await page.evaluate(async () => {
        const { AudioMgr } = await import('/src/audio.js');
        return [...AudioMgr.SFX_IDS].map(id => ({ id, src: AudioMgr._resolveTrackSrc('./sfx/' + id + '.ogg'),
            status: AudioMgr._sfxStatus[id], duration: AudioMgr._sfxBuffers[id].duration }));
    });
    expect(sfx).toHaveLength(26);
    expect(sfx.every(sample => sample.src.endsWith(extension))).toBe(true);
    expect(await page.evaluate(() => window.__qaMediaErrors)).toEqual([]);
    return { tracks, sfx };
}

for (const codec of [{ name: 'native Chromium Vorbis', extension: '.ogg', forceAAC: false },
    { name: 'AAC-only codec policy', extension: '.m4a', forceAAC: true }]) {
    test(`published audio plays online and after an HTTP-cache-cleared offline cold launch (${codec.name})`, async ({ page, context }, testInfo) => {
        await prepareProfile(context, codec.forceAAC);
        const failures = [], responses = [], cancellations = [];
        const responseStatus = new WeakMap();
        let offline = false;
        page.on('response', response => {
            const path = new URL(response.url()).pathname;
            if (/\/(?:music|sfx)\//.test(path)) {
                responseStatus.set(response.request(), response.status());
                responses.push({ path, status: response.status(), worker: response.fromServiceWorker(), offline });
                if (response.status() >= 400) failures.push(`${response.status()} ${path}`);
            }
        });
        page.on('requestfailed', request => {
            const path = new URL(request.url()).pathname;
            if (/\/(?:music|sfx)\//.test(path)) {
                const error = request.failure()?.errorText;
                const status = responseStatus.get(request);
                // Track changes and leaving the document deliberately retire
                // successful long media streams. Keep the evidence, require
                // that exact track to pass actual playback in both launches,
                // and still fail every HTTP, transport or decode failure.
                if (error === 'net::ERR_ABORTED' && request.resourceType() === 'media' && (status === 200 || status === 206)) {
                    cancellations.push({ path, status, error });
                } else failures.push(`${error} ${path}`);
            }
        });
        try {
            await enterMenu(page);
            expect(await page.evaluate(() => window.__qaNativeAAC), 'Chromium must support the AAC media pipeline exercised by this case').toBeTruthy();
            await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state), { timeout: 30000 }).toBe('activated');
            await expect.poll(() => page.evaluate(() => window.MVMOfflineAudio?.status.state), {
                timeout: 90000, message: 'the worker acknowledges the selected-format background music cache'
            }).toBe('ready');
            await expect(page.locator('#offline-audio-status')).toHaveText('Offline audio: ready.');
            const ready = await page.evaluate(() => window.MVMOfflineAudio.status);
            expect(ready.cached).toHaveLength(5);
            expect(ready.cached.every(url => url.endsWith(codec.extension))).toBe(true);
            expect(ready.missing).toEqual([]);
            const online = await inspectActualAudio(page, codec.extension);
            const documentId = await page.evaluate(() => window.__qaAudioDocument);
            // Music and SFX live in CacheStorage, which this official CDP
            // operation deliberately preserves while clearing HTTP cache.
            const cdp = await context.newCDPSession(page);
            await cdp.send('Network.clearBrowserCache');
            await cdp.detach();
            await page.goto('about:blank');
            await context.setOffline(true);
            offline = true;
            await enterMenu(page);
            expect(await page.evaluate(() => window.__qaAudioDocument)).not.toBe(documentId);
            expect(await page.evaluate(() => localStorage.getItem('mvm_qa_audio_seed_count'))).toBe('1');
            await expect.poll(() => page.evaluate(() => window.MVMOfflineAudio?.status.state)).toBe('ready');
            const cold = await inspectActualAudio(page, codec.extension);
            for (const cancellation of cancellations) {
                expect(online.tracks.some(track => track.src === cancellation.path)
                    && cold.tracks.some(track => track.src === cancellation.path),
                `cancelled stream ${cancellation.path} must still prove real playback in both documents`).toBe(true);
            }
            for (const track of cold.tracks) {
                expect(responses.some(response => response.offline && response.worker && response.status === 200
                    && response.path === track.src), `offline ${track.src} comes from the installed worker`).toBe(true);
            }
            for (const sample of cold.sfx) {
                const path = new URL(sample.src, page.url()).pathname;
                expect(responses.some(response => response.offline && response.worker && response.status === 200
                    && response.path === path), `offline ${path} is fetched and decoded anew`).toBe(true);
            }
            expect(failures, 'all music and SFX responses, including fallback attempts, must succeed').toEqual([]);
            await testInfo.attach('audio-playback-online-and-cold-offline', {
                body: JSON.stringify({ codec, ready, online, cold, responses, failures, cancellations }, null, 2), contentType: 'application/json'
            });
        } finally {
            await testInfo.attach('audio-network-evidence', { body: JSON.stringify({ responses, failures, cancellations }, null, 2), contentType: 'application/json' });
            await context.setOffline(false);
        }
    });
}
