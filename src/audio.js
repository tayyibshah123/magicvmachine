/* =========================================
   2. AUDIO MANAGER
   ========================================= */
const AudioMgr = {
    ctx: null,
    bgm: null,
    musicEnabled: true, 
    sfxEnabled: true,
    bossSilence: false, // NEW: Flag to suppress music during specific boss encounters

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Master SFX gain — every synth/noise path routes through it so
            // the SFX volume slider actually scales what the player hears.
            // Samples keep their own per-play gain (already sfxVolume-scaled).
            try {
                this._sfxMaster = this.ctx.createGain();
                this._sfxMaster.gain.value = (this.sfxVolume != null ? this.sfxVolume : 0.8);
                this._sfxMaster.connect(this.ctx.destination);
            } catch (e) { this._sfxMaster = null; }
            // Lazy-preload every known SFX file into decoded AudioBuffers so
            // combat's first click/hit/attack is already cached. Fires once.
            this.preloadSfx();
        }
        // iOS Safari / Brave-iOS unlock: ctx.resume() flips the state flag
        // but isn't enough on its own — iOS only treats the context as
        // truly unlocked after an AudioBufferSource has been .start()'d
        // inside the user-gesture call stack. Fire a 1-sample silent
        // buffer so the very next SFX / bgm doesn't drop silently. Cheap
        // and idempotent (the if-guard skips it once the ctx is running).
        if (this.ctx.state !== 'running') {
            try {
                const buffer = this.ctx.createBuffer(1, 1, 22050);
                const src = this.ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(this._sfxMaster || this.ctx.destination);
                src.start(0);
            } catch (e) { /* unlock is opportunistic */ }
            this.ctx.resume().catch(() => {});
        }
    },

    // Write bgm volume straight to the audio element. We deliberately do
    // NOT pipe bgm through WebAudio's createMediaElementSource on mobile —
    // iOS Safari / Brave-iOS refuse to play a MediaElement-sourced graph
    // until a separate gesture unlocks the ctx, which meant the first
    // intro tap was silent. HTMLAudioElement.play() from a gesture is
    // allowed on iOS and works first-tap; the volume slider then stays
    // effective on every platform except iOS (where device volume rules).
    _setBgmVolume(v) {
        const clamped = Math.max(0, Math.min(1, v));
        if (!this.bgm) return;
        try { this.bgm.volume = clamped; } catch (e) {}
    },

    toggleMusic(enabled) {
        this.musicEnabled = enabled;
        if (this.bgm) {
            if (!this.musicEnabled) this.fadeMusicOut(450);
            else if (!this.bossSilence) {
                this.bgm.play().catch(e => console.log(e));
                this.fadeMusicIn(600);
            }
        } else if (enabled && !this.bossSilence) {
            this.startMusic();
        }
    },

    // Soft music transitions — used for combat start/end, boss silence, and
    // the music toggle. Targets this._baseVol on fade-in and 0 on fade-out.
    // Mutually cancels prior fades so repeated calls don't stack.
    _cancelFade() {
        if (this._fadeInterval) { clearInterval(this._fadeInterval); this._fadeInterval = null; }
    },
    fadeMusicOut(durationMs = 450) {
        if (!this.bgm) return;
        this._cancelFade();
        const startVol = this.bgm.volume;
        const start = performance.now();
        this._fadeInterval = setInterval(() => {
            const t = Math.min(1, (performance.now() - start) / durationMs);
            this._setBgmVolume(startVol * (1 - t));
            if (t >= 1) {
                this._cancelFade();
                if (this.bgm) this.bgm.pause();
            }
        }, 30);
    },
    fadeMusicIn(durationMs = 600) {
        if (!this.bgm) return;
        this._cancelFade();
        const targetVol = this._baseVol ?? 0.3;
        this._setBgmVolume(0);
        // Resume the SFX context in the same gesture so the next SFX is
        // audible; bgm uses plain HTMLAudioElement so it doesn't need it,
        // but doing it here is harmless and keeps all unlock paths together.
        if (this.ctx && this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }
        this.bgm.play().catch(() => {});
        const start = performance.now();
        this._fadeInterval = setInterval(() => {
            const t = Math.min(1, (performance.now() - start) / durationMs);
            this._setBgmVolume(targetVol * t);
            if (t >= 1) this._cancelFade();
        }, 30);
    },

    toggleSFX(enabled) {
        this.sfxEnabled = enabled;
    },

    // Music library — keyed by short id. `synth` is the default; `lofi` is
    // the original track. Tracks with multiple `sources` shuffle through
    // the files (no-repeat) instead of looping a single file.
    //
    // Per entry, `sources` / `src` are OGG Vorbis. For App Store / older iOS
    // (WKWebView before 17.4) we prefer an AAC/MP4 alternative if present:
    // `_resolveTrackSrc` checks whether a matching .m4a exists and returns
    // that instead. Drop-in fallback — no code change needed when the files
    // are added to ./music/.
    TRACKS: {
        synth: {
            sources: [
                './music/synth1.ogg',
                './music/synth2.ogg',
                './music/synth3.ogg',
                './music/synth4.ogg'
            ],
            label: 'Synth (default)'
        },
        lofi:  { src: './music/lofi.ogg',  label: 'Lofi' }
    },
    currentTrack: 'synth',
    _lastShuffleIdx: -1,

    // Pick an alternate file extension for environments that can't play OGG
    // Vorbis (older iOS/WKWebView). Probe the browser once with an <audio>
    // element's canPlayType; cache the result. Returns the candidate URL if
    // the browser reports better support, else returns the original.
    _preferredFmt: null,
    _resolveTrackSrc(oggUrl) {
        if (!oggUrl || typeof oggUrl !== 'string') return oggUrl;
        if (this._preferredFmt === null) {
            let best = 'ogg';
            try {
                const probe = document.createElement('audio');
                const oggOk = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"');
                const m4aOk = probe.canPlayType && probe.canPlayType('audio/mp4; codecs="mp4a.40.2"');
                // Prefer M4A when the browser says it's the more reliable option
                // (e.g. iOS Safari/WKWebView) — but only if we haven't disabled
                // it (Chrome/Firefox report both equally, keep OGG there).
                if (m4aOk === 'probably' && oggOk !== 'probably') best = 'm4a';
            } catch (e) { /* keep ogg */ }
            this._preferredFmt = best;
        }
        if (this._preferredFmt === 'm4a') return oggUrl.replace(/\.ogg$/i, '.m4a');
        return oggUrl;
    },

    // Pick a random source that isn't the one we just played. Falls back to
    // plain random when the playlist only has one entry.
    _pickShuffleSrc(sources) {
        if (!sources || sources.length === 0) return null;
        if (sources.length === 1) return sources[0];
        let idx;
        do { idx = Math.floor(Math.random() * sources.length); }
        while (idx === this._lastShuffleIdx);
        this._lastShuffleIdx = idx;
        return sources[idx];
    },

    // When a shuffled track finishes naturally, queue up another random one
    // at the current volume. Bails if music was turned off mid-track.
    _onShuffleTrackEnded() {
        if (!this.musicEnabled || this.bossSilence) return;
        const track = this.TRACKS[this.currentTrack];
        if (!track || !track.sources) return;
        const nextSrc = this._pickShuffleSrc(track.sources);
        if (!nextSrc) return;
        const currentVol = this.bgm ? this.bgm.volume : (this._baseVol ?? 0.3);
        this.bgm = new Audio(this._resolveTrackSrc(nextSrc));
        this.bgm.loop = false;
        this._setBgmVolume(currentVol);
        this.bgm.addEventListener('ended', () => this._onShuffleTrackEnded());
        this.bgm.play().catch(() => {});
    },

    _loadTrackPreference() {
        try {
            const saved = localStorage.getItem('mvm_music_track');
            if (saved && this.TRACKS[saved]) this.currentTrack = saved;
        } catch (e) {}
    },

    startMusic() {
        // Prevent music from starting if Boss Silence is active
        if (this.bossSilence) return;

        // Honor the stored preference on first play.
        if (!this._trackPrefLoaded) { this._loadTrackPreference(); this._trackPrefLoaded = true; }

        // Resume in the CURRENT call-stack (user-gesture) so SFX routed
        // through WebAudio aren't silent on the first interaction.
        if (this.ctx && this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
        }

        const wasNew = !this.bgm;
        if (wasNew) {
            const track = this.TRACKS[this.currentTrack] || this.TRACKS.synth;
            const isShuffle = Array.isArray(track.sources) && track.sources.length > 1;
            const rawSrc = isShuffle ? this._pickShuffleSrc(track.sources)
                                     : (track.sources ? track.sources[0] : track.src);
            this.bgm = new Audio(this._resolveTrackSrc(rawSrc));
            this.bgm.loop = !isShuffle;
            this._setBgmVolume(0);
            if (isShuffle) {
                this.bgm.addEventListener('ended', () => this._onShuffleTrackEnded());
            }
        }
        // Only play if music is specifically enabled — fade in gently.
        if (this.musicEnabled && this.bgm.paused) {
            this.fadeMusicIn(wasNew ? 900 : 600);
        }
    },

    // Swap the background track at runtime. Crossfades: old track fades out
    // over 400ms, new track replaces it and fades in over 600ms. Preference
    // persists so subsequent launches load the player's choice.
    setTrack(id) {
        if (!this.TRACKS[id]) return;
        if (this.currentTrack === id && this.bgm) return;
        this.currentTrack = id;
        try { localStorage.setItem('mvm_music_track', id); } catch (e) {}
        // If music isn't currently playing there's nothing to swap; the
        // next startMusic() will pick up the new preference.
        const wasPlaying = this.bgm && !this.bgm.paused;
        if (!wasPlaying) {
            if (this.bgm) { try { this.bgm.pause(); } catch (e) {} this.bgm = null; }
            return;
        }
        // Fade out the existing track, tear it down, then create + fade in
        // the new one.
        this.fadeMusicOut(350);
        setTimeout(() => {
            if (this.bgm) { try { this.bgm.pause(); } catch (e) {} }
            this.bgm = null;
            this.startMusic();
        }, 400);
    },

    // Temporarily lower music for dramatic moments (banners, phase transitions).
    // Restores volume after `durationMs`. Safe to call repeatedly — later calls win.
    duck(toVolume = 0.12, durationMs = 1500) {
        if (!this.bgm || !this.musicEnabled) return;
        if (this._duckTimeout) clearTimeout(this._duckTimeout);
        const baseVol = this._baseVol ?? 0.3;
        this._baseVol = baseVol;
        this._setBgmVolume(toVolume);
        this._duckTimeout = setTimeout(() => {
            this._setBgmVolume(baseVol);
            this._duckTimeout = null;
        }, durationMs);
    },

    // Volume setters used by the accessibility menu (Phase 6).
    setMusicVolume(v) {
        const clamped = Math.max(0, Math.min(1, v));
        this._baseVol = clamped;
        this._setBgmVolume(clamped);
    },
    setSFXVolume(v) {
        this.sfxVolume = Math.max(0, Math.min(1, v));
        if (this._sfxMaster) {
            try { this._sfxMaster.gain.value = this.sfxVolume; } catch (e) {}
        }
    },

    // --- Per-sector ambient loops ---
    // Synthesised drone tone that colors combat with the sector's texture.
    // Will be swapped for sampled loops when sound design lands. No-ops if
    // the audio context isn't available or music is off.
    _ambientNodes: null,
    _currentAmbientSector: null,
    _ambientVolume: 0.6, // 0..1; user-tunable via Settings

    setAmbientVolume(v) {
        this._ambientVolume = Math.max(0, Math.min(1, v));
        // Live-update the currently running drone without restarting it.
        // Important: read p.gain fresh from the profile table — never read
        // the live gain.value (it would compound on repeated calls).
        if (this._ambientNodes && this._currentAmbientSector != null) {
            const p = this._AMBIENT_PROFILES[this._currentAmbientSector];
            if (p && this._ambientNodes.gain) {
                try { this._ambientNodes.gain.gain.value = p.gain * this._ambientVolume; } catch (e) {}
            }
        }
    },

    // Sector → (base freq, waveform, filter freq). Tuned low + soft.
    _AMBIENT_PROFILES: {
        1: { freq: 110,  type: 'sawtooth', filter: 420, gain: 0.018 }, // city hum
        2: { freq: 82,   type: 'sine',     filter: 220, gain: 0.022 }, // ice wind
        3: { freq: 62,   type: 'triangle', filter: 300, gain: 0.024 }, // forge rumble
        4: { freq: 165,  type: 'sawtooth', filter: 520, gain: 0.016 }, // hive buzz
        5: { freq: 98,   type: 'square',   filter: 260, gain: 0.018 }  // source unease
    },

    startSectorAmbient(sector) {
        if (!this.ctx || this.ctx.state === 'suspended') return;
        if (!this.musicEnabled) return;
        if (this._currentAmbientSector === sector) return;
        this.stopSectorAmbient();
        const p = this._AMBIENT_PROFILES[sector];
        if (!p) return;
        try {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            const lfo = this.ctx.createOscillator();
            const lfoGain = this.ctx.createGain();

            osc.type = p.type;
            osc.frequency.value = p.freq;
            filter.type = 'lowpass';
            filter.frequency.value = p.filter;
            gain.gain.value = p.gain * this._ambientVolume;
            // Slow LFO on the filter for subtle movement
            lfo.frequency.value = 0.12;
            lfoGain.gain.value = p.filter * 0.15;
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            lfo.start();
            this._ambientNodes = { osc, filter, gain, lfo };
            this._currentAmbientSector = sector;
        } catch (e) {
            // Swallow — ambient is optional.
        }
    },

    stopSectorAmbient() {
        if (!this._ambientNodes) { this._currentAmbientSector = null; return; }
        // Capture node refs in a local so any subsequent start/stop call
        // that nulls _ambientNodes can't break our cleanup timer.
        const nodes = this._ambientNodes;
        this._ambientNodes = null;
        this._currentAmbientSector = null;
        try {
            nodes.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
            setTimeout(() => {
                try { nodes.osc.stop(); nodes.lfo.stop(); nodes.osc.disconnect(); nodes.lfo.disconnect(); } catch (e) {}
            }, 560);
        } catch (e) {}
    },

    // ============================================================
    // SAMPLE-BASED SFX (sfx/*.ogg)
    // ============================================================
    // Set of sound-IDs that have a file under /sfx/. If an ID in here is
    // requested, `playSound` attempts the sample first and falls back to
    // the WebAudio synth (`_playSoundSynth`) only if the load failed or
    // the decode is still pending on first request.
    SFX_IDS: new Set([
        'attack', 'beam', 'buy', 'chains', 'click', 'dart', 'defend',
        'digital_sever', 'earthquake', 'explosion', 'glitch_attack',
        'grid_fracture', 'heartbeat', 'hex_barrier', 'hit', 'laser',
        'mana', 'meteor', 'orbital_strike', 'overclock', 'print',
        'siren', 'snap', 'ticking', 'upgrade', 'zap'
    ]),
    _sfxBuffers: {},        // id → AudioBuffer (decoded)
    _sfxStatus: {},         // id → 'pending' | 'loaded' | 'missing'

    // Kick off an async fetch + decode for one SFX id. Idempotent — repeat
    // calls while a load is in flight are no-ops. Silent failure (logs, no
    // throw) so a missing/broken file just falls back to the synth forever.
    _loadSfxSample(id) {
        if (!this.ctx) return;
        const status = this._sfxStatus[id];
        if (status === 'loaded' || status === 'pending' || status === 'missing') return;
        this._sfxStatus[id] = 'pending';
        // Try format-preferred first; if the request or decode fails (e.g.
        // m4a not provided yet), retry with the native .ogg. If both fail
        // the synth fallback takes over permanently.
        const primary = this._resolveTrackSrc(`./sfx/${id}.ogg`);
        const attempt = (url, isRetry) => fetch(url)
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
            .then(buf => new Promise((resolve, reject) => {
                const ret = this.ctx.decodeAudioData(buf, resolve, reject);
                if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
            }))
            .then(audioBuf => {
                this._sfxBuffers[id] = audioBuf;
                this._sfxStatus[id] = 'loaded';
            })
            .catch(e => {
                if (!isRetry && primary !== `./sfx/${id}.ogg`) {
                    return attempt(`./sfx/${id}.ogg`, true);
                }
                console.warn(`[sfx] load failed for ${id} — falling back to synth:`, e);
                this._sfxStatus[id] = 'missing';
            });
        attempt(primary, false);
    },

    // Play a cached sample via a fresh BufferSource + GainNode. Concurrent
    // plays are allowed (each .start spawns its own node chain). Respects
    // the live `sfxVolume` slider. Returns true on success; false lets
    // `playSound` fall back to the synth version.
    _playSfxSample(id) {
        const buf = this._sfxBuffers[id];
        if (!buf || !this.ctx) return false;
        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            const gain = this.ctx.createGain();
            // Slight headroom so samples don't clip when played at full volume.
            gain.gain.value = Math.max(0, Math.min(1, this.sfxVolume ?? 0.8)) * 0.9;
            src.connect(gain);
            gain.connect(this.ctx.destination);
            src.start(0);
            // Disconnect on end to release nodes.
            src.onended = () => {
                try { src.disconnect(); gain.disconnect(); } catch (e) {}
            };
            return true;
        } catch (e) {
            console.warn(`[sfx] play failed for ${id}:`, e);
            return false;
        }
    },

    // Eager preload — called from AudioMgr.init so the first time each sound
    // fires in combat it's already decoded. 26 small ogg files (< 2 MB total
    // typical) — cheap and keeps the first-tap-after-boot feeling instant.
    preloadSfx() {
        if (!this.ctx) return;
        this.SFX_IDS.forEach(id => this._loadSfxSample(id));
    },

    playSound(type) {
        // Check SFX flag specifically (Phase 6: sfxVolume of 0 acts as mute)
        if (!this.ctx || !this.sfxEnabled) return;
        if (this.sfxVolume === 0) return;

        // After the tab comes back from background on mobile, the ctx may be
        // suspended or (iOS Safari) 'interrupted'. Fire-and-forget resume so
        // the next sound lands. Bail for this call only if still not running.
        if (this.ctx.state !== 'running') {
            this.ctx.resume().catch(() => {});
            if (this.ctx.state !== 'running') return;
        }

        // Sample path: if this id has a file, prefer it. Kick off the load
        // on first request (for IDs that weren't preloaded for some reason)
        // and fall through to the synth fallback until the decode lands.
        if (this.SFX_IDS.has(type)) {
            const status = this._sfxStatus[type];
            if (status === 'loaded') {
                if (this._playSfxSample(type)) return;
            } else if (status === undefined) {
                this._loadSfxSample(type);
                // First-ever play: fall through to synth so the player hears
                // *something* immediately. Subsequent plays use the sample.
            } else if (status === 'pending') {
                // Still loading — synth fallback for this one call.
            } else if (status === 'missing') {
                // Permanent fallback to synth.
            }
        }

        return this._playSoundSynth(type);
    },

    // Original WebAudio-synth implementation — kept as a fallback for any
    // sound-id missing from /sfx/ and as a safety net while samples load.
    _playSoundSynth(type) {
        if (!this.ctx || !this.sfxEnabled) return;
        if (this.sfxVolume === 0) return;
        if (this.ctx.state !== 'running') return;

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const dest = this._sfxMaster || this.ctx.destination;

        osc.connect(gain);
        gain.connect(dest);

        switch (type) {
            case 'attack': 
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(600, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.15);
                osc.start(t);
                osc.stop(t + 0.15);
                break;
            case 'hit': 
                this.createNoise(0.1, 0.3);
                break;
            case 'meteor': 
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.5);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.5);
                osc.start(t);
                osc.stop(t + 0.5);
                
                setTimeout(() => {
                    if (!this.sfxEnabled) return;
                    const osc2 = this.ctx.createOscillator();
                    const g2 = this.ctx.createGain();
                    osc2.connect(g2);
                    g2.connect(this._sfxMaster || this.ctx.destination);

                    osc2.type = 'sawtooth';
                    osc2.frequency.setValueAtTime(100, t + 0.5);
                    osc2.frequency.exponentialRampToValueAtTime(10, t + 1.5);
                    g2.gain.setValueAtTime(1.0, t + 0.5);
                    g2.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
                    osc2.start(t + 0.5);
                    osc2.stop(t + 1.5);
                    
                    this.createNoise(1.0, 0.8); 
                }, 400);
                break;
            case 'earthquake':
                const osc3 = this.ctx.createOscillator();
                const g3 = this.ctx.createGain();
                osc3.connect(g3);
                g3.connect(this._sfxMaster || this.ctx.destination);
                osc3.type = 'square';
                osc3.frequency.setValueAtTime(50, t);
                osc3.frequency.linearRampToValueAtTime(20, t + 2.0);
                g3.gain.setValueAtTime(0.3, t);
                g3.gain.linearRampToValueAtTime(0, t + 2.0);
                osc3.start(t);
                osc3.stop(t + 2.0);
                this.createNoise(2.0, 0.5);
                break;
            case 'heartbeat':
                this.playTone(100, 0.1, 'sine', 0.5);
                setTimeout(() => { if(this.sfxEnabled) this.playTone(80, 0.1, 'sine', 0.4) }, 150);
                break;
            case 'snap':
                this.createNoise(0.05, 0.8);
                break;
            case 'beam': 
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.linearRampToValueAtTime(400, t + 0.3);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;
            case 'defend':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.linearRampToValueAtTime(600, t + 0.3);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;
            case 'mana':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.setValueAtTime(880, t + 0.1);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
                osc.start(t);
                osc.stop(t + 0.4);
                break;
            case 'buy':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1200, t);
                osc.frequency.setValueAtTime(1600, t + 0.05);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                break;
            case 'upgrade':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(100, t);
                osc.frequency.linearRampToValueAtTime(300, t + 1.0);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.linearRampToValueAtTime(0, t + 1.0);
                osc.start(t);
                osc.stop(t + 1.0);
                break;
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, t);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
                osc.start(t);
                osc.stop(t + 0.05);
                break;
            case 'explosion':
                this.createNoise(0.5, 0.8);
                break;
            case 'digital_sever': 
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
                gain.gain.setValueAtTime(0.15, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.1);
                osc.start(t);
                osc.stop(t + 0.1);
                break;
            case 'hex_barrier': 
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.linearRampToValueAtTime(600, t + 0.4);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
                osc.start(t);
                osc.stop(t + 0.4);
                break;
            case 'overclock': 
                osc.type = 'square';
                osc.frequency.setValueAtTime(220, t);
                osc.frequency.linearRampToValueAtTime(880, t + 0.3);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;
            case 'print': 
                this.createNoise(0.3, 0.2);
                break;
            case 'orbital_strike': 
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1200, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.4);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.4);
                osc.start(t);
                osc.stop(t + 0.4);
                setTimeout(() => { if(this.sfxEnabled) this.createNoise(0.8, 0.8) }, 400); 
                break;
            case 'grid_fracture': 
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(60, t);
                osc.frequency.linearRampToValueAtTime(20, t + 1.5);
                gain.gain.setValueAtTime(0.5, t);
                gain.gain.linearRampToValueAtTime(0, t + 1.5);
                osc.start(t);
                osc.stop(t + 1.5);
                break;
            case 'chains': 
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1000, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                setTimeout(() => { if(this.sfxEnabled) this.createNoise(0.1, 0.2) }, 100);
                break;
            case 'ticking': 
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, t);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
                osc.start(t);
                osc.stop(t + 0.05);
                break;
            case 'zap': 
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(500, t);
                osc.frequency.linearRampToValueAtTime(1500, t + 0.1);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.1);
                osc.start(t);
                osc.stop(t + 0.1);
                break;
            case 'siren': 
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(400, t);
                osc.frequency.linearRampToValueAtTime(600, t + 0.3);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;
            case 'glitch_attack': 
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, t);
                osc.frequency.linearRampToValueAtTime(50, t + 0.2);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                this.createNoise(0.2, 0.4); 
                break;
            case 'dart':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.15);
                osc.start(t);
                osc.stop(t + 0.15);
                break;
            case 'laser':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1500, t);
                osc.frequency.exponentialRampToValueAtTime(500, t + 0.1);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
                osc.start(t);
                osc.stop(t + 0.1);
                break;
        }
    },

    playTone(freq, dur, type, vol) {
        if (!this.ctx || !this.sfxEnabled) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
        osc.connect(gain);
        gain.connect(this._sfxMaster || this.ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
    },

    createNoise(duration, volume) {
        if (!this.ctx || !this.sfxEnabled) return;
        const t = this.ctx.currentTime;
        const bSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, t);
        filter.frequency.exponentialRampToValueAtTime(100, t + duration);

        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(volume, t);
        nGain.gain.exponentialRampToValueAtTime(0.01, t + duration);

        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this._sfxMaster || this.ctx.destination);
        noise.start(t);
    }
};

export { AudioMgr };
