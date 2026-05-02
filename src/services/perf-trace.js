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
const FRAME_BUF_SIZE = 600; // ~10s at 60 fps
const frameBuf = new Float32Array(FRAME_BUF_SIZE);
let frameBufWrite = 0;
let frameBufFilled = 0;
let totalFramesObserved = 0;
let lastFrameStamp = 0;
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
        // even when the verbose console reporter is off. Active-mode
        // additionally clears the per-frame log + label cursor so the
        // mark()/endFrame() sequence works.
        const now = performance.now();
        frameStart = now;
        if (!this.active) return;
        lastMarkAt = now;
        lastLabel = '__begin';
        frameLog.length = 0;
    },

    mark(label) {
        if (!this.active) return;
        const now = performance.now();
        const dt = now - lastMarkAt;
        const e = getEntry(lastLabel);
        e.sum += dt;
        e.count++;
        if (dt > e.max) e.max = dt;
        // Always-on accumulator for Diag — even when the verbose console
        // reporter is off, we record per-section costs so the dump has
        // something to show.
        let ae = alwaysSections.get(lastLabel);
        if (!ae) { ae = { sum: 0, count: 0, max: 0 }; alwaysSections.set(lastLabel, ae); }
        ae.sum += dt; ae.count++; if (dt > ae.max) ae.max = dt;
        frameLog.push({ label: lastLabel, ms: dt });
        lastMarkAt = now;
        lastLabel = label;
    },

    endFrame() {
        // Always-on: capture total frame ms into the rolling buffer. This
        // runs regardless of `active` so the Diag dump always has the
        // last ~10s of frame timings to summarise.
        const now = performance.now();
        const total = now - frameStart;
        if (frameStart > 0 && total >= 0) {
            frameBuf[frameBufWrite] = total;
            frameBufWrite = (frameBufWrite + 1) % FRAME_BUF_SIZE;
            if (frameBufFilled < FRAME_BUF_SIZE) frameBufFilled++;
            totalFramesObserved++;
            lastFrameStamp = now;
            // Slow-frame ring — capped lookback for the dump.
            if (total >= 25) {
                pushSlowFrame({ t: now, total, breakdown: frameLog.slice(0, 6).map(s => `${s.label}=${s.ms.toFixed(1)}`).join(' ') });
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

    /* Compute frame statistics from the always-on rolling buffer. Returns
     * { count, avgMs, p50, p95, p99, maxMs, fps60Pct, fps30Pct, lt30Pct }
     * — used by Diag.dump to produce a paste-ready summary. */
    frameStats() {
        const n = frameBufFilled;
        if (n === 0) return null;
        // Snapshot to an array we can sort without disturbing the ring.
        const arr = new Float32Array(n);
        // Copy ordered oldest→newest so ranges are intuitive (not required
        // for percentile maths but matches the recent-frames feel).
        for (let i = 0; i < n; i++) {
            const idx = (frameBufWrite - n + i + FRAME_BUF_SIZE) % FRAME_BUF_SIZE;
            arr[i] = frameBuf[idx];
        }
        // Aggregate stats first (one pass).
        let sum = 0, max = 0, fps60 = 0, fps30 = 0, lt30 = 0;
        for (let i = 0; i < n; i++) {
            const v = arr[i];
            sum += v;
            if (v > max) max = v;
            if (v <= 16.7) fps60++;
            else if (v <= 33.4) fps30++;
            else lt30++;
        }
        // Sort for percentiles.
        const sorted = Array.from(arr).sort((a, b) => a - b);
        const pick = (p) => sorted[Math.min(n - 1, Math.floor(n * p))];
        return {
            count: n,
            totalObserved: totalFramesObserved,
            avgMs: sum / n,
            p50: pick(0.5),
            p95: pick(0.95),
            p99: pick(0.99),
            maxMs: max,
            fps60Pct: (fps60 / n) * 100,
            fps30Pct: (fps30 / n) * 100,
            lt30Pct: (lt30 / n) * 100
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
    }
};
