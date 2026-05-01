// Performance tier detection.
// Runs once at boot. Classifies the device as 'high' / 'mid' / 'low' using
// hardware hints + a short frame-time probe. The tier is stored in
// localStorage so we don't repeat the probe every launch.
//
// Game code reads `Perf.tier` and `Perf.caps` to scale particles, shadow
// blurs, background complexity, and animation budgets.

import { PerfTrace } from './perf-trace.js';

const KEY_TIER = 'mvm_perf_tier';
const KEY_OVERRIDE = 'mvm_perf_override'; // user setting to force a tier

const CAPS = {
    high: {
        particles: 150,
        shadowBlur: true,
        maxShadowPasses: 4,
        bgDrones: 5,
        diceStagger: 80,
        gridFov: 3.0,
        particleQuality: 1.0
    },
    mid: {
        particles: 80,
        shadowBlur: true,
        maxShadowPasses: 2,
        bgDrones: 3,
        diceStagger: 60,
        gridFov: 2.5,
        particleQuality: 0.65
    },
    low: {
        particles: 40,
        shadowBlur: false,
        maxShadowPasses: 0,
        bgDrones: 1,
        diceStagger: 40,
        gridFov: 2.0,
        particleQuality: 0.35
    }
};

function classify(score) {
    if (score >= 60) return 'high';
    if (score >= 35) return 'mid';
    return 'low';
}

function hardwareScore() {
    // Compose a score from available hints. Higher = better.
    let score = 0;
    const mem = (typeof navigator !== 'undefined') ? navigator.deviceMemory : 4;
    const cores = (typeof navigator !== 'undefined') ? navigator.hardwareConcurrency : 4;

    // Memory tier (mobile browsers only expose quantised values)
    if (mem >= 8) score += 40;
    else if (mem >= 4) score += 28;
    else if (mem >= 2) score += 15;
    else score += 6;

    // CPU cores
    if (cores >= 8) score += 25;
    else if (cores >= 6) score += 18;
    else if (cores >= 4) score += 12;
    else score += 6;

    // Connection hint (slower networks often correlate with cheaper devices)
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.effectiveType) {
        if (conn.effectiveType === '4g') score += 8;
        else if (conn.effectiveType === '3g') score += 4;
    } else {
        score += 6;
    }

    // Screen size / DPI (larger + denser => stronger GPU usually)
    const dpr = window.devicePixelRatio || 1;
    if (dpr >= 3) score += 10;
    else if (dpr >= 2) score += 6;
    else score += 3;

    return score;
}

function runFrameProbe(durationMs = 900) {
    // Bumped 600 → 900ms so the first-launch sample averages over a
    // longer window (catches single-frame stalls, less swayed by a
    // cold-start GC pause). Trade-off: detection takes 300ms longer
    // before the auto-tier downgrade can kick in, but it stays in a
    // background setTimeout so the player never sees the wait.
    return new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        function tick() {
            frames++;
            if (performance.now() - start < durationMs) {
                requestAnimationFrame(tick);
            } else {
                const elapsed = performance.now() - start;
                const fps = (frames / elapsed) * 1000;
                resolve(fps);
            }
        }
        requestAnimationFrame(tick);
    });
}

export const Perf = {
    tier: 'high',
    caps: CAPS.high,

    detect() {
        // Honour explicit user override first. localStorage may throw on
        // certain Safari Private / corporate WebView profiles — treat any
        // failure as "no override set" so the tier-detection path runs.
        let override = null;
        try { override = localStorage.getItem(KEY_OVERRIDE); } catch (_) {}
        if (override && CAPS[override]) {
            this.tier = override;
            this.caps = CAPS[override];
            return;
        }

        // If we have a prior detection, trust it (probe is expensive).
        let prior = null;
        try { prior = localStorage.getItem(KEY_TIER); } catch (_) {}
        if (prior && CAPS[prior]) {
            this.tier = prior;
            this.caps = CAPS[prior];
        } else {
            // First-run: classify by hardware hints. Probe in background to refine.
            const score = hardwareScore();
            const tier = classify(score);
            this.tier = tier;
            this.caps = CAPS[tier];
            try { localStorage.setItem(KEY_TIER, tier); } catch (e) {}
        }
        // Mirror initial tier onto <body> so the CSS perf-gate kicks in
        // immediately at boot — before any rAF samples have come back.
        if (typeof document !== 'undefined' && document.body) {
            const cl = document.body.classList;
            cl.remove('perf-low', 'perf-mid', 'perf-high');
            cl.add('perf-' + this.tier);
        }

        // Background frame-rate probe — adjusts the tier downward if we're
        // hitting way under 60fps. Avoids tier-up on a laggy cold start.
        setTimeout(() => {
            runFrameProbe().then(fps => {
                if (fps < 30 && this.tier !== 'low') {
                    this.setTier('low');
                } else if (fps < 48 && this.tier === 'high') {
                    this.setTier('mid');
                }
            });
        }, 2500);
    },

    setTier(tier) {
        if (!CAPS[tier]) return;
        this.tier = tier;
        this.caps = CAPS[tier];
        try { localStorage.setItem(KEY_TIER, tier); } catch (e) {}
        // Reset the runtime monitor's rolling FPS buffer. Without this, after
        // a downgrade the next 3s of measurement averages in stale pre-downgrade
        // samples — the user kept seeing "the same exact 47.8 fps" reported
        // because the new (faster) post-tier-change frames were being mixed
        // with 180 pre-change samples in the same Float32Array. Calling the
        // hook here clears the window so the new tier's actual FPS is what
        // the next threshold check sees.
        if (typeof this._resetMonitorWindow === 'function') {
            try { this._resetMonitorWindow(); } catch (_) {}
        }
        // Mirror the tier onto <body> so CSS can gate expensive animations
        // (mix-blend-mode scanlines, animated drop-shadow, mask-image grid)
        // without the JS perf path having to know about each rule. The intro
        // and main-menu were averaging ~48fps on borderline desktops because
        // those animations force a full layer paint every frame even when
        // the canvas is idle. Stripping them when the device is already
        // borderline keeps the tier from oscillating on screens that aren't
        // even running the game's own render loop.
        if (typeof document !== 'undefined' && document.body) {
            const cl = document.body.classList;
            cl.remove('perf-low', 'perf-mid', 'perf-high');
            cl.add('perf-' + tier);
        }
    },

    setOverride(tier) {
        if (!CAPS[tier]) {
            try { localStorage.removeItem(KEY_OVERRIDE); } catch (_) {}
            return;
        }
        try { localStorage.setItem(KEY_OVERRIDE, tier); } catch (_) {}
        this.setTier(tier);
    },

    // Runtime FPS monitor with hysteresis. Samples the gap between rAF calls
    // over a sliding window; downgrades one tier if sustained framerate is
    // low, upgrades back if sustained framerate is comfortably high. Skipped
    // entirely when the user has set an explicit override (respects intent).
    // Call Perf.startMonitor() once from Game.init. Cheap: just a timestamp
    // compare and an integer tick per frame.
    _monitor: null,
    startMonitor() {
        if (this._monitor) return; // idempotent
        // User-pinned tier — skip the runtime monitor. Wrap localStorage
        // since Safari Private mode throws on access; treat any failure
        // as "no override" so the monitor still runs.
        let pinned = null;
        try { pinned = localStorage.getItem(KEY_OVERRIDE); } catch (_) {}
        if (pinned) return;
        const WINDOW = 180;             // ~3s of frames at 60fps
        const DOWNGRADE_FPS = 48;
        const UPGRADE_FPS   = 58;
        let cooldownMs = 15000;         // base cool-down between tier changes
        const FLAP_COOLDOWN_MS = 90000; // if we've flapped, lock in the lower
                                        // tier for a longer window so the
                                        // user doesn't see the log spam the
                                        // dev console flagged in the trace
                                        // (auto-down → auto-up → auto-down
                                        // every 15s when the avg fps was
                                        // bouncing around the threshold).
        let last = performance.now();
        // Circular buffer — O(1) per frame. Previously used Array.shift()
        // on a 180-entry Array, which was O(n) × 60fps = 10k+ ops/sec of
        // pure churn and contributed to mobile GC stalls.
        const deltas = new Float32Array(WINDOW);
        let writeIdx = 0;
        let filled = 0;
        let sum = 0;
        let lastChange = performance.now();
        // Expose a reset hook so setTier() can wipe the rolling window
        // when the tier changes. Without this, a downgrade-to-mid was
        // measured against 180 stale high-tier samples for the next
        // ~3 seconds, which is why the same "47.8 fps" reading kept
        // surfacing regardless of whether the new tier was actually
        // running faster.
        this._resetMonitorWindow = () => {
            writeIdx = 0;
            filled = 0;
            sum = 0;
            last = performance.now();
        };
        // Anti-flap: track whether the previous transition was a downgrade.
        // If we then upgrade and downgrade again within FLAP_COOLDOWN_MS,
        // we've identified an oscillation — pin the lower tier and stop
        // upgrading attempts until the cooldown clears.
        let lastDirection = null;       // 'down' | 'up' | null
        let flapDetectedUntil = 0;
        const tick = (now) => {
            const dt = now - last;
            last = now;
            if (filled < WINDOW) {
                deltas[writeIdx] = dt;
                sum += dt;
                filled++;
            } else {
                sum += dt - deltas[writeIdx];
                deltas[writeIdx] = dt;
            }
            writeIdx = (writeIdx + 1) % WINDOW;
            // Only react once we have a full window + cool-down elapsed.
            if (filled >= WINDOW && (now - lastChange) > cooldownMs) {
                const avgDt = sum / WINDOW;
                const fps = 1000 / avgDt;
                const inFlapLockout = now < flapDetectedUntil;
                if (fps < DOWNGRADE_FPS && this.tier !== 'low') {
                    const nextTier = this.tier === 'high' ? 'mid' : 'low';
                    console.warn(`[Perf] auto-downgrade → ${nextTier} (avg ${fps.toFixed(1)} fps)`);
                    this.setTier(nextTier);
                    lastChange = now;
                    if (lastDirection === 'up') {
                        // up-then-down inside the same monitor session is the
                        // signature of a borderline FPS that the rolling avg
                        // can't decide on. Pin the lower tier for 90s.
                        flapDetectedUntil = now + FLAP_COOLDOWN_MS;
                        cooldownMs = FLAP_COOLDOWN_MS;
                    }
                    lastDirection = 'down';
                } else if (fps > UPGRADE_FPS && this.tier === 'low' && !inFlapLockout) {
                    console.info(`[Perf] auto-upgrade → mid (avg ${fps.toFixed(1)} fps)`);
                    this.setTier('mid');
                    lastChange = now;
                    lastDirection = 'up';
                } else if (fps > UPGRADE_FPS && this.tier === 'mid' && !inFlapLockout) {
                    console.info(`[Perf] auto-upgrade → high (avg ${fps.toFixed(1)} fps)`);
                    this.setTier('high');
                    lastChange = now;
                    lastDirection = 'up';
                }
            }
            this._monitor = requestAnimationFrame(tick);
        };
        this._monitor = requestAnimationFrame(tick);
    },
    stopMonitor() {
        if (this._monitor) {
            cancelAnimationFrame(this._monitor);
            this._monitor = null;
        }
        // Drop the reset hook so a stale closure can't be invoked after
        // the monitor has been torn down.
        this._resetMonitorWindow = null;
    },

    // Per-section frame profiler — flip on at runtime to find which phase
    // of Game.loop is consistently eating ms when the auto-downgrade fires.
    // Default thresholds: log slow frames (>25ms) individually and emit a
    // sorted summary every 3s. Pass an options object to tune both.
    //
    //   Perf.startTrace()
    //   Perf.startTrace({ thresholdMs: 18, intervalMs: 5000 })
    //   Perf.stopTrace()
    //
    // Also reachable from DevTools as `window.__perf.startTrace()`.
    trace: PerfTrace,
    startTrace(opts) { PerfTrace.start(opts); },
    stopTrace()      { PerfTrace.stop(); },

    // Convenience getters for hot-path code.
    shadowBlur(base) {
        if (!this.caps.shadowBlur) return 0;
        if (this.tier === 'mid') return base * 0.6;
        return base;
    },

    particleQuality() {
        return this.caps.particleQuality;
    }
};
