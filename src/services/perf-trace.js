// Per-section frame profiler. Off by default, zero-cost when inactive
// (every mark() is gated on `active` before any work). Turn on at runtime
// from DevTools:
//
//   Perf.startTrace()                 // defaults: 25ms slow threshold, 3s report
//   Perf.startTrace({ thresholdMs: 18, intervalMs: 5000 })
//   Perf.stopTrace()
//
// While active, two outputs appear in the console:
//   1. Every `intervalMs`, a grouped report with per-section avg/max ms.
//   2. Every frame whose total exceeds `thresholdMs`, a one-line breakdown
//      naming the heaviest sections in that frame.
//
// To use, the host loop calls beginFrame() once per frame, mark('label')
// at each phase boundary, and endFrame() at the bottom. The label passed
// to mark() names the section that *just finished* (i.e. the work between
// the previous mark and this one).

const sections = new Map(); // label -> { sum, count, max }
let frameStart = 0;
let lastMarkAt = 0;
let lastLabel = '__begin';
const frameLog = []; // {label, ms} entries for the current frame
let slowFrameThresholdMs = 25;
let reportIntervalMs = 3000;
let lastReportAt = 0;
let framesSinceReport = 0;

// ── Always-on lightweight capture for the Diag dump. Separate from the
// verbose `active` mode so we always have rolling frame stats to report
// without spamming the console. Costs roughly two number writes per
// frame (a single rAF tick is ~16ms; the writes are sub-microsecond).
//
// v1.8.9 — split into TWO ring buffers because the previous version
// conflated "render work inside one rAF" with "real frame interval":
//
//   intervalBuf — wall-clock delta between consecutive beginFrame calls.
//                 This is the true frame rate. 1000/avg = real fps.
//   workBuf     — `now - frameStart` inside one rAF. The CPU/JS time
//                 we spent in the loop. Useful for spotting headroom
//                 (low work + low fps = browser/vsync throttle, not
//                 our code), but NOT a fps measurement.
//
// Honor Tab 10 diag showed avg work 2.4ms with 100% "60fps band" —
// while the device was actually rendering at ~26fps (lifetime
// 7333 frames / 276s). The FPS HUD divided 1000/2.4 and reported
// "415 fps" because it was using workBuf as a fps source. Fixed.
const FRAME_BUF_SIZE = 600; // ~10s at 60 fps
const intervalBuf = new Float32Array(FRAME_BUF_SIZE); // real frame deltas
const workBuf = new Float32Array(FRAME_BUF_SIZE);     // render work per frame
let bufWrite = 0;
let bufFilled = 0;
let totalFramesObserved = 0;
let lastFrameStamp = 0;
let prevFrameStart = 0; // wall-clock at previous beginFrame, for interval calc
// Always-on per-section accumulator that survives `stop()` so the Diag
// dump can show top phase costs even if PerfTrace was never started.
const alwaysSections = new Map();
// Slow-frame ring (last 32 frames over the active threshold). Capped
// so a runaway laggy session doesn't unbound this array.
const SLOW_RING_SIZE = 32;
const slowRing = [];

function pushSlowFrame(entry) {
    slowRing.push(entry);
    if (slowRing.length > SLOW_RING_SIZE) slowRing.shift();
}

function getEntry(label) {
    let e = sections.get(label);
    if (!e) {
        e = { sum: 0, count: 0, max: 0 };
        sections.set(label, e);
    }
    return e;
}

function emitReport() {
    const rows = [];
    sections.forEach((v, k) => {
        if (k === '__begin' || k === '__end' || v.count === 0) return;
        rows.push({ label: k, avg: v.sum / v.count, max: v.max, count: v.count, total: v.sum });
    });
    rows.sort((a, b) => b.avg - a.avg);
    const header = `[PerfTrace] ${framesSinceReport} frames over last ~${reportIntervalMs}ms`;
    if (typeof console.groupCollapsed === 'function') console.groupCollapsed(header);
    else console.log(header);
    const lines = rows.map(r =>
        `  ${r.label.padEnd(24)} avg ${r.avg.toFixed(2).padStart(6)} ms` +
        `   max ${r.max.toFixed(1).padStart(6)} ms` +
        `   total ${r.total.toFixed(0).padStart(5)} ms (${r.count} samples)`
    );
    console.log(lines.join('\n'));
    if (typeof console.groupEnd === 'function') console.groupEnd();

    // Reset rolling counters but keep label set so the next report has a
    // stable column ordering.
    sections.forEach(v => { v.sum = 0; v.count = 0; v.max = 0; });
    framesSinceReport = 0;
}

export const PerfTrace = {
    active: false,

    start(opts) {
        const o = opts || {};
        if (typeof o.thresholdMs === 'number') slowFrameThresholdMs = o.thresholdMs;
        if (typeof o.intervalMs === 'number')  reportIntervalMs = o.intervalMs;
        sections.clear();
        frameLog.length = 0;
        lastReportAt = (typeof performance !== 'undefined') ? performance.now() : 0;
        framesSinceReport = 0;
        this.active = true;
        console.info(
            `[PerfTrace] ON — slow-frame threshold ${slowFrameThresholdMs}ms, ` +
            `summary every ${reportIntervalMs}ms. Run Perf.stopTrace() to disable.`
        );
    },

    stop() {
        if (!this.active) return;
        this.active = false;
        // Flush whatever we've accumulated so the user sees a final report.
        if (framesSinceReport > 0) emitReport();
        console.info('[PerfTrace] OFF');
    },

    beginFrame() {
        // Always-on: stamp frame start so endFrame can compute total dt
        // AND reset the mark cursor so per-section accumulator picks
        // up every frame, not just verbose-mode frames. The per-frame
        // log array is only cleared in active mode (it's a debug tool).
        const now = performance.now();
        // Capture wall-clock interval since the previous beginFrame —
        // this is the *true* frame rate as the browser is delivering
        // rAFs (matches what Perf.startMonitor measures). Skip the
        // first frame and any monstrous deltas (>500ms = page hidden
        // / tab swap / GC pause) so the post-resume stutter doesn't
        // drag the rolling avg down for the next 10s.
        if (prevFrameStart > 0) {
            const interval = now - prevFrameStart;
            if (interval >= 0 && interval < 500) {
                intervalBuf[bufWrite] = interval;
            } else {
                // Replay the previous interval rather than leaving zero —
                // a zero would make 1000/0 explode in fps maths.
                const prev = bufFilled > 0
                    ? intervalBuf[(bufWrite - 1 + FRAME_BUF_SIZE) % FRAME_BUF_SIZE]
                    : 16.7;
                intervalBuf[bufWrite] = prev;
            }
        }
        prevFrameStart = now;
        frameStart = now;
        lastMarkAt = now;
        lastLabel = '__begin';
        if (this.active) {
            frameLog.length = 0;
        }
    },

    mark(label) {
        // Always-on path runs even when the verbose console reporter is
        // off, so the Diag dump's per-section cost table populates from
        // every real combat frame. The active-mode console accumulator
        // is only updated when `active` is true.
        if (lastMarkAt === 0 || !lastLabel) {
            // First mark of a fresh frame — set the cursor without any
            // accumulation since there's no prior section to close.
            lastMarkAt = performance.now();
            lastLabel = label;
            return;
        }
        const now = performance.now();
        const dt = now - lastMarkAt;
        // Always-on accumulator (Diag dump source).
        let ae = alwaysSections.get(lastLabel);
        if (!ae) { ae = { sum: 0, count: 0, max: 0 }; alwaysSections.set(lastLabel, ae); }
        ae.sum += dt; ae.count++; if (dt > ae.max) ae.max = dt;
        // Active-mode console accumulator + per-frame log.
        if (this.active) {
            const e = getEntry(lastLabel);
            e.sum += dt;
            e.count++;
            if (dt > e.max) e.max = dt;
            frameLog.push({ label: lastLabel, ms: dt });
        }
        lastMarkAt = now;
        lastLabel = label;
    },

    endFrame() {
        // Always-on: capture render-work ms into the work ring. Real
        // frame interval (the actual fps source) was already captured
        // at beginFrame() above. This runs regardless of `active` so
        // the Diag dump always has the last ~10s to summarise.
        const now = performance.now();
        const work = now - frameStart;
        if (frameStart > 0 && work >= 0) {
            workBuf[bufWrite] = work;
            bufWrite = (bufWrite + 1) % FRAME_BUF_SIZE;
            if (bufFilled < FRAME_BUF_SIZE) bufFilled++;
            totalFramesObserved++;
            lastFrameStamp = now;
            // Slow-frame ring — gated on the *interval* (true frame
            // duration) so the dump highlights real stutters, not
            // frames where we happened to do a lot of optional work
            // inside a comfortable budget. Read the interval that
            // beginFrame() just wrote (one slot back from bufWrite
            // since we incremented above).
            const intervalIdx = (bufWrite - 1 + FRAME_BUF_SIZE) % FRAME_BUF_SIZE;
            const interval = intervalBuf[intervalIdx] || work;
            if (interval >= 25) {
                pushSlowFrame({
                    t: now,
                    total: interval,
                    work,
                    breakdown: frameLog.slice(0, 6).map(s => `${s.label}=${s.ms.toFixed(1)}`).join(' ')
                });
            }
        }
        if (!this.active) return;
        // Close the trailing section (work between the last mark and now).
        const dt = now - lastMarkAt;
        const e = getEntry(lastLabel);
        e.sum += dt;
        e.count++;
        if (dt > e.max) e.max = dt;
        const aeT = alwaysSections.get(lastLabel) || { sum: 0, count: 0, max: 0 };
        aeT.sum += dt; aeT.count++; if (dt > aeT.max) aeT.max = dt;
        alwaysSections.set(lastLabel, aeT);
        frameLog.push({ label: lastLabel, ms: dt });

        framesSinceReport++;

        if (total >= slowFrameThresholdMs) {
            // Sort the sections in *this* frame by cost so the breakdown
            // reads heaviest-first. Cap to top 6 to keep the line scannable.
            const top = frameLog
                .filter(s => s.label !== '__begin' && s.label !== '__end')
                .sort((a, b) => b.ms - a.ms)
                .slice(0, 6)
                .map(s => `${s.label}=${s.ms.toFixed(1)}`)
                .join(' ');
            console.warn(`[PerfTrace] slow frame ${total.toFixed(1)}ms — ${top}`);
        }

        if (now - lastReportAt >= reportIntervalMs) {
            emitReport();
            lastReportAt = now;
        }
    },

    // For debug callers that want a snapshot without printing.
    snapshot() {
        const out = {};
        sections.forEach((v, k) => {
            if (k === '__begin' || k === '__end') return;
            out[k] = { avg: v.count ? v.sum / v.count : 0, max: v.max, count: v.count };
        });
        return out;
    },

    /* Compute frame statistics from the always-on rolling buffers. Returns
     * { count, avgMs, p50, p95, p99, maxMs, fps60Pct, fps30Pct, lt30Pct,
     *   workAvgMs, workP99, workMaxMs }
     *
     * avgMs / p* / maxMs and the fps* buckets are computed from the
     * INTERVAL buffer — i.e. the real wall-clock gap between rAFs. This
     * is the actual fps the player is seeing.
     *
     * workAvgMs / workP99 / workMaxMs are computed from the WORK buffer —
     * the time we spent inside one rAF doing render work. Headroom
     * indicator: low work + low fps = browser/vsync throttle, not us.
     */
    frameStats() {
        const n = bufFilled;
        if (n === 0) return null;
        // Snapshot both rings to ordered oldest→newest copies so we can
        // sort one for percentiles without touching the live buffers.
        const intervals = new Float32Array(n);
        const works = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const idx = (bufWrite - n + i + FRAME_BUF_SIZE) % FRAME_BUF_SIZE;
            intervals[i] = intervalBuf[idx];
            works[i]     = workBuf[idx];
        }
        // Single pass for sums + buckets keyed on real interval.
        let iSum = 0, iMax = 0, fps60 = 0, fps30 = 0, lt30 = 0;
        let wSum = 0, wMax = 0;
        let validIntervals = 0;
        for (let i = 0; i < n; i++) {
            const iv = intervals[i];
            // First-frame slot can be 0 (no prior beginFrame yet); skip
            // those for the fps maths so the avg isn't dragged down.
            if (iv > 0) {
                iSum += iv;
                if (iv > iMax) iMax = iv;
                if (iv <= 16.7) fps60++;
                else if (iv <= 33.4) fps30++;
                else lt30++;
                validIntervals++;
            }
            const wv = works[i];
            wSum += wv;
            if (wv > wMax) wMax = wv;
        }
        const sortedI = Array.from(intervals).filter(v => v > 0).sort((a, b) => a - b);
        const sortedW = Array.from(works).sort((a, b) => a - b);
        const pickI = (p) => sortedI.length
            ? sortedI[Math.min(sortedI.length - 1, Math.floor(sortedI.length * p))]
            : 0;
        const pickW = (p) => sortedW[Math.min(n - 1, Math.floor(n * p))];
        const denom = validIntervals || 1;
        return {
            count: n,
            totalObserved: totalFramesObserved,
            avgMs:    iSum / denom,
            p50:      pickI(0.5),
            p95:      pickI(0.95),
            p99:      pickI(0.99),
            maxMs:    iMax,
            fps60Pct: (fps60 / denom) * 100,
            fps30Pct: (fps30 / denom) * 100,
            lt30Pct:  (lt30 / denom) * 100,
            workAvgMs: wSum / n,
            workP99:   pickW(0.99),
            workMaxMs: wMax
        };
    },

    /* Top-N sections from the always-on accumulator, by avg cost.
     * Used by Diag.dump. */
    topSections(limit) {
        const rows = [];
        alwaysSections.forEach((v, k) => {
            if (k === '__begin' || k === '__end' || v.count === 0) return;
            rows.push({ label: k, avg: v.sum / v.count, max: v.max, count: v.count });
        });
        rows.sort((a, b) => b.avg - a.avg);
        return rows.slice(0, limit || 8);
    },

    /* Recent slow frames for the dump. */
    recentSlow(limit) {
        const n = limit || 10;
        const start = Math.max(0, slowRing.length - n);
        return slowRing.slice(start);
    },

    /* Snapshot the current rolling-window stats. Used by Diag to
     * checkpoint frame stats at significant gameplay moments (boss
     * kill, sector clear, run end) so the dump reflects ACTUAL
     * combat frames rather than the post-victory idle state at
     * dump-time. Returns the same shape as frameStats(). */
    snapshotStats() {
        return this.frameStats();
    }
};
