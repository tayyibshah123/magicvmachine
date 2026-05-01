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
        if (!this.active) return;
        const now = performance.now();
        frameStart = now;
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
        frameLog.push({ label: lastLabel, ms: dt });
        lastMarkAt = now;
        lastLabel = label;
    },

    endFrame() {
        if (!this.active) return;
        // Close the trailing section (work between the last mark and now).
        const now = performance.now();
        const dt = now - lastMarkAt;
        const e = getEntry(lastLabel);
        e.sum += dt;
        e.count++;
        if (dt > e.max) e.max = dt;
        frameLog.push({ label: lastLabel, ms: dt });

        const total = now - frameStart;
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
    }
};
