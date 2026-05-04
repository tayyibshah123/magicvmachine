// On-screen FPS / frame-cost overlay. Pure DOM — sits top-right of the
// viewport, glass-panel styled, safe-area aware. Reads from the existing
// PerfTrace always-on rolling buffer (no new measurement loop) and from
// Perf.tier so the user can correlate frame health with the active tier.
//
// Zero cost when hidden: the rAF refresh ticker only runs while .show()
// has been called. The rest of the time the module holds nothing live.
//
// Wired from settings — `chk-show-fps` toggle in the Accessibility tab.
// Persists in mvm_settings_v1 as `showFps`.

import { Perf } from './perf.js';

let host = null;       // <div id="fps-hud">
let rafId = 0;
let lastUpdate = 0;
const REFRESH_MS = 500; // 2 Hz — fast enough to feel live, slow enough
                        // that the DOM update itself doesn't move the
                        // very fps reading we're trying to measure.

function ensureHost() {
    if (host) return host;
    const el = document.createElement('div');
    el.id = 'fps-hud';
    el.className = 'fps-hud';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
        <div class="fps-hud-row fps-hud-headline">
            <span class="fps-hud-fps" data-bind="fps">--</span>
            <span class="fps-hud-tier" data-bind="tier">--</span>
        </div>
        <div class="fps-hud-row fps-hud-sub">
            <span data-bind="p50">p50 --</span>
            <span data-bind="p95">p95 --</span>
            <span data-bind="p99">p99 --</span>
        </div>
        <div class="fps-hud-row fps-hud-sections" data-bind="sections"></div>
    `;
    document.body.appendChild(el);
    host = el;
    return el;
}

function classifyFps(fps) {
    // Colour-codes the headline so a quick glance reads health at distance.
    // Threshold map matches the auto-downgrade thresholds in Perf.startMonitor:
    //   ≥58 = green (target), ≥48 = amber (livable), <48 = red (downgrade zone).
    if (fps >= 58) return 'good';
    if (fps >= 48) return 'warn';
    return 'bad';
}

function render(now) {
    if (!host || host.classList.contains('hidden')) return;
    if (now - lastUpdate < REFRESH_MS) {
        rafId = requestAnimationFrame(render);
        return;
    }
    lastUpdate = now;

    const stats = Perf.trace && Perf.trace.frameStats ? Perf.trace.frameStats() : null;
    const top = Perf.trace && Perf.trace.topSections ? Perf.trace.topSections(4) : [];

    const fpsEl = host.querySelector('[data-bind="fps"]');
    const tierEl = host.querySelector('[data-bind="tier"]');
    const p50El = host.querySelector('[data-bind="p50"]');
    const p95El = host.querySelector('[data-bind="p95"]');
    const p99El = host.querySelector('[data-bind="p99"]');
    const sectionsEl = host.querySelector('[data-bind="sections"]');

    if (stats) {
        const fps = 1000 / Math.max(0.1, stats.avgMs);
        if (fpsEl) {
            fpsEl.textContent = fps.toFixed(0) + ' fps';
            fpsEl.dataset.health = classifyFps(fps);
        }
        if (p50El) p50El.textContent = `p50 ${stats.p50.toFixed(1)}`;
        if (p95El) p95El.textContent = `p95 ${stats.p95.toFixed(1)}`;
        if (p99El) p99El.textContent = `p99 ${stats.p99.toFixed(1)}`;
    } else {
        // Pre-warmup — buffer hasn't filled yet. Show a placeholder so the
        // panel doesn't look broken on first open.
        if (fpsEl) { fpsEl.textContent = '...'; fpsEl.dataset.health = 'warn'; }
        if (p50El) p50El.textContent = 'p50 --';
        if (p95El) p95El.textContent = 'p95 --';
        if (p99El) p99El.textContent = 'p99 --';
    }

    if (tierEl) tierEl.textContent = (Perf.tier || '?').toUpperCase();

    if (sectionsEl && top && top.length) {
        // Top-N section costs as compact pill list.
        sectionsEl.innerHTML = top.map(s =>
            `<span class="fps-hud-section">${s.label} <b>${s.avg.toFixed(1)}</b></span>`
        ).join('');
    } else if (sectionsEl) {
        sectionsEl.innerHTML = '<span class="fps-hud-section fps-hud-empty">no sections</span>';
    }

    rafId = requestAnimationFrame(render);
}

export const FpsHud = {
    show() {
        const el = ensureHost();
        el.classList.remove('hidden');
        el.setAttribute('aria-hidden', 'false');
        if (!rafId) {
            lastUpdate = 0;
            rafId = requestAnimationFrame(render);
        }
    },
    hide() {
        if (host) {
            host.classList.add('hidden');
            host.setAttribute('aria-hidden', 'true');
        }
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
    },
    toggle(on) {
        if (on === undefined) on = !host || host.classList.contains('hidden');
        if (on) this.show(); else this.hide();
    },
    isVisible() {
        return !!(host && !host.classList.contains('hidden'));
    }
};
