// Diagnostic dump system. Aggregates always-on frame stats from
// PerfTrace, captured errors via window.onerror/unhandledrejection,
// gameplay event log, and a one-shot state snapshot into a single
// paste-ready text block.
//
// Usage:
//   __diag.dump()              — print + return a paste-ready string
//   __diag.dump({ copy: true }) — also copy to clipboard if available
//   __diag.event(name, data)   — record a gameplay event
//   __diag.error(msg)          — manually log an error
//
// The dump is automatically printed on gameOver and on a Sector-5 win.

import { PerfTrace } from './perf-trace.js';

// Session metadata captured once at boot.
const SESSION_START = (typeof performance !== 'undefined') ? performance.now() : Date.now();
const SESSION_BOOT = (typeof Date !== 'undefined') ? new Date().toISOString() : '?';

// Caps: trim the ring buffers so a long session doesn't unbound memory.
const ERROR_RING_MAX = 32;
const EVENT_RING_MAX = 64;

const errorRing = [];
const eventRing = [];

// Counter buckets — cheap, always-on integers ticked by Diag.event when
// the name matches a known counter key. Surface in dump() as "actions".
const counters = {
    diceUsed: 0,
    rerolls: 0,
    attacks: 0,
    qtePerfect: 0,
    qteGood: 0,
    qteFail: 0,
    parryPerfect: 0,
    bossKills: 0,
    enemyKills: 0,
    sectorsCleared: 0,
    runsStarted: 0,
    runsWon: 0,
    runsLost: 0,
    autoTierDowngrades: 0,
    autoTierUpgrades: 0
};

// Frame-stat checkpoints captured at gameplay milestones so the dump
// shows REAL combat frames, not the idle post-victory state at
// dump-time. Each entry is { label, stats: { count, avgMs, p50, p95,
// p99, maxMs, fps60Pct, fps30Pct, lt30Pct } } from PerfTrace at the
// moment the checkpoint fired. Capped to last 8 to keep the dump
// scannable.
const CHECKPOINT_MAX = 8;
const checkpoints = [];

function pushCheckpoint(label) {
    try {
        const stats = (typeof PerfTrace !== 'undefined' && PerfTrace.snapshotStats) ? PerfTrace.snapshotStats() : null;
        if (!stats || stats.count < 30) return; // skip empty / under-sampled windows
        checkpoints.push({ t: ts(), label, stats });
        if (checkpoints.length > CHECKPOINT_MAX) checkpoints.shift();
    } catch (_) {}
}

function ts() {
    return (typeof performance !== 'undefined') ? performance.now() : Date.now();
}

function pushError(entry) {
    errorRing.push(entry);
    if (errorRing.length > ERROR_RING_MAX) errorRing.shift();
}

function pushEvent(entry) {
    eventRing.push(entry);
    if (eventRing.length > EVENT_RING_MAX) eventRing.shift();
}

function fmtMs(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '—';
    return ms.toFixed(1);
}

function fmtSeconds(deltaMs) {
    const s = Math.floor(deltaMs / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

function envSummary() {
    const w = (typeof window !== 'undefined') ? window : {};
    const nav = (typeof navigator !== 'undefined') ? navigator : {};
    const scr = (typeof screen !== 'undefined') ? screen : {};
    const ua = nav.userAgent || '?';
    const dpr = w.devicePixelRatio || 1;
    const mem = nav.deviceMemory || '?';
    const cores = nav.hardwareConcurrency || '?';
    const screenWxH = (scr.width && scr.height) ? `${scr.width}x${scr.height}` : '?';
    const reduced = (w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'yes' : 'no';
    return { ua, dpr, mem, cores, screenWxH, reduced };
}

function memorySummary() {
    if (typeof performance === 'undefined' || !performance.memory) return null;
    const m = performance.memory;
    const MB = 1024 * 1024;
    return {
        usedMB: (m.usedJSHeapSize / MB).toFixed(1),
        totalMB: (m.totalJSHeapSize / MB).toFixed(1),
        limitMB: (m.jsHeapSizeLimit / MB).toFixed(0)
    };
}

function gameSnapshot() {
    const w = (typeof window !== 'undefined') ? window : {};
    const G = w.Game;
    if (!G) return null;
    const p = G.player;
    const e = G.enemy;
    // Perf is exposed on the game window as `__perf` (see init), not as
    // `window.Perf`. Fall through both for safety + read the tier off
    // the live module so the dump's tier label matches the engine's
    // current decision.
    const perfModule = w.__perf || w.Perf || (G && G.Perf);
    const tier = (perfModule && perfModule.tier) || '?';
    return {
        currentState: G.currentState || '?',
        sector: G.sector || 0,
        turn: G.turnCount || 0,
        rerolls: G.rerolls || 0,
        sparks: G.sparks || 0,
        sparksLifetime: G.sparksLifetime || 0,
        techFragments: G.techFragments || 0,
        playerClass: p && p.classId,
        playerHp: p && `${Math.floor(p.currentHp || 0)}/${p.maxHp || 0}`,
        playerMana: p && (p.mana || 0),
        playerShield: p && (p.shield || 0),
        playerMinions: p && (p.minions || []).filter(m => m && m.currentHp > 0).length,
        playerRelics: p && (p.relics || []).length,
        enemyName: e && e.name,
        enemyHp: e && `${Math.floor(e.currentHp || 0)}/${e.maxHp || 0}`,
        enemyPhase: e && e.phase,
        enemyShield: e && (e.shield || 0),
        momentum: G.momentum || 0,
        momentumApex: !!G._momentumApexArmed,
        perfTier: tier,
        perfMonitor: !!(G.Perf && G.Perf._monitor)
    };
}

function particleSnapshot() {
    const w = (typeof window !== 'undefined') ? window : {};
    const PS = w.ParticleSys;
    if (!PS) return null;
    let active = 0, pool = 0;
    if (Array.isArray(PS.pool)) {
        pool = PS.pool.length;
        for (let i = 0; i < PS.pool.length; i++) if (PS.pool[i] && PS.pool[i].active) active++;
    }
    return {
        active,
        pool,
        maxParticles: PS.maxParticles || '?',
        quality: PS.quality
    };
}

function effectsSnapshot() {
    const w = (typeof window !== 'undefined') ? window : {};
    const G = w.Game;
    if (!G) return null;
    const list = G.effects || [];
    const byType = {};
    for (let i = 0; i < list.length; i++) {
        const t = (list[i] && list[i].type) || 'unknown';
        byType[t] = (byType[t] || 0) + 1;
    }
    return { count: list.length, byType };
}

export const Diag = {
    init() {
        if (this._initialised) return;
        this._initialised = true;
        // Wire global error capture. Both classic errors and unhandled
        // promise rejections are recorded with timestamp + best-effort
        // file:line info. Existing error logging in the app continues
        // to fire — this is purely additive for the dump.
        if (typeof window !== 'undefined') {
            try {
                const origOnerror = window.onerror;
                window.onerror = (message, source, lineno, colno, error) => {
                    pushError({
                        t: ts(),
                        kind: 'error',
                        msg: String(message || error && error.message || 'unknown'),
                        loc: source ? `${source.split('/').pop()}:${lineno || '?'}` : '?',
                        stack: (error && error.stack) ? String(error.stack).split('\n').slice(0, 4).join(' | ') : ''
                    });
                    if (typeof origOnerror === 'function') return origOnerror(message, source, lineno, colno, error);
                    return false;
                };
                window.addEventListener('unhandledrejection', (ev) => {
                    const r = ev && ev.reason;
                    pushError({
                        t: ts(),
                        kind: 'reject',
                        msg: (r && r.message) ? String(r.message) : String(r || 'unhandled rejection'),
                        loc: '?',
                        stack: (r && r.stack) ? String(r.stack).split('\n').slice(0, 4).join(' | ') : ''
                    });
                });
            } catch (_) { /* hostile env — diagnostics still local-only */ }
        }
    },

    /* Record a gameplay event. `name` is a short string ('boss_kill',
     * 'sector_enter', 'run_end'); data is an optional shallow object
     * (no nesting beyond one level — kept paste-friendly).
     * Recognised counter keys are also incremented. */
    event(name, data) {
        if (!name) return;
        const entry = { t: ts(), name, data: data || null };
        pushEvent(entry);
        // Counter taxonomy — cheap and always-on.
        if (name === 'die_used')           counters.diceUsed++;
        else if (name === 'reroll')        counters.rerolls++;
        else if (name === 'attack')        counters.attacks++;
        else if (name === 'qte_perfect')   counters.qtePerfect++;
        else if (name === 'qte_good')      counters.qteGood++;
        else if (name === 'qte_fail')      counters.qteFail++;
        else if (name === 'parry_perfect') counters.parryPerfect++;
        else if (name === 'boss_kill')     counters.bossKills++;
        else if (name === 'enemy_kill')    counters.enemyKills++;
        else if (name === 'sector_clear')  counters.sectorsCleared++;
        else if (name === 'run_start')     counters.runsStarted++;
        else if (name === 'run_win')       counters.runsWon++;
        else if (name === 'run_loss')      counters.runsLost++;
        else if (name === 'tier_down')     counters.autoTierDowngrades++;
        else if (name === 'tier_up')       counters.autoTierUpgrades++;
        // Snapshot frame stats at major milestones so the dump shows
        // real combat-frame quality at the moment, not the idle state
        // at dump-time.
        if (name === 'boss_kill' || name === 'sector_clear' || name === 'run_win' || name === 'run_loss') {
            const lbl = name + (data && data.sector ? ' s' + data.sector : '') + (data && data.name ? ' ' + data.name : '');
            pushCheckpoint(lbl);
        }
    },

    /* Manually log an error to the ring (for app code that catches
     * exceptions in try/catch and wants them surfaced). */
    error(msg, ctx) {
        pushError({
            t: ts(),
            kind: 'manual',
            msg: String(msg || 'unknown'),
            loc: (ctx && ctx.loc) || '?',
            stack: (ctx && ctx.stack) || ''
        });
    },

    /* Build the paste-ready dump. Returns a string AND prints it to the
     * console. Pass `{ copy: true }` to also copy to clipboard. */
    dump(opts) {
        const lines = [];
        const env = envSummary();
        const mem = memorySummary();
        const game = gameSnapshot();
        const particles = particleSnapshot();
        const effects = effectsSnapshot();
        const stats = PerfTrace && PerfTrace.frameStats && PerfTrace.frameStats();
        const top = (PerfTrace && PerfTrace.topSections) ? PerfTrace.topSections(8) : [];
        const slow = (PerfTrace && PerfTrace.recentSlow) ? PerfTrace.recentSlow(10) : [];
        const sessionDuration = ts() - SESSION_START;

        lines.push('=== MVM DIAGNOSTIC REPORT ===');
        lines.push(`Boot:    ${SESSION_BOOT}`);
        lines.push(`Session: ${fmtSeconds(sessionDuration)}`);
        lines.push(`Tier:    ${game ? game.perfTier : '?'} | DPR: ${env.dpr} | mem ${env.mem} | cores ${env.cores} | screen ${env.screenWxH} | reduced-motion ${env.reduced}`);
        if (env.ua) lines.push(`UA: ${env.ua.length > 200 ? env.ua.slice(0, 200) + '…' : env.ua}`);

        lines.push('');
        lines.push('--- Game state ---');
        if (game) {
            lines.push(`State: ${game.currentState} | Sector ${game.sector} | Turn ${game.turn} | Rerolls ${game.rerolls}`);
            lines.push(`Class: ${game.playerClass || '—'} | HP ${game.playerHp || '—'} | Mana ${game.playerMana || 0} | Shield ${game.playerShield || 0} | Minions ${game.playerMinions || 0} | Relics ${game.playerRelics || 0}`);
            lines.push(`Enemy: ${game.enemyName || '—'} | HP ${game.enemyHp || '—'} | Phase ${game.enemyPhase || '—'} | Shield ${game.enemyShield || 0}`);
            lines.push(`Momentum: ${game.momentum}/6${game.momentumApex ? ' (APEX READY)' : ''}`);
            lines.push(`Currencies: Frags ${game.techFragments} | ✦ Sparks ${game.sparks} (lifetime ${game.sparksLifetime})`);
        } else {
            lines.push('(Game not initialised)');
        }

        lines.push('');
        lines.push('--- Frame stats ---');
        if (stats && stats.count > 0) {
            lines.push(`Sample window: ${stats.count} frames (lifetime observed: ${stats.totalObserved})`);
            lines.push(`avg ${fmtMs(stats.avgMs)}ms | p50 ${fmtMs(stats.p50)} | p95 ${fmtMs(stats.p95)} | p99 ${fmtMs(stats.p99)} | max ${fmtMs(stats.maxMs)}`);
            lines.push(`60fps: ${stats.fps60Pct.toFixed(1)}% | 30fps band: ${stats.fps30Pct.toFixed(1)}% | <30fps: ${stats.lt30Pct.toFixed(1)}%`);
        } else {
            lines.push('(No frame data yet — Game.loop hasn\'t closed any frames.)');
        }

        if (top && top.length) {
            lines.push('');
            lines.push('--- Top per-section costs (always-on accumulator) ---');
            for (let i = 0; i < top.length; i++) {
                const r = top[i];
                lines.push(`  ${(r.label || '?').padEnd(22)} avg ${fmtMs(r.avg).padStart(6)}ms  max ${fmtMs(r.max).padStart(6)}ms  n=${r.count}`);
            }
        }

        if (slow && slow.length) {
            lines.push('');
            lines.push('--- Recent slow frames (>=25ms) ---');
            for (let i = 0; i < slow.length; i++) {
                const f = slow[i];
                lines.push(`  +${(f.t / 1000).toFixed(1)}s  total ${fmtMs(f.total)}ms  ${f.breakdown || ''}`);
            }
        }

        if (checkpoints.length > 0) {
            lines.push('');
            lines.push(`--- Frame stats at milestones (last ${checkpoints.length} checkpoints) ---`);
            for (let i = 0; i < checkpoints.length; i++) {
                const c = checkpoints[i];
                const s = c.stats;
                lines.push(`  +${(c.t / 1000).toFixed(1)}s ${c.label}`);
                lines.push(`    n=${s.count} | avg ${fmtMs(s.avgMs)}ms | p95 ${fmtMs(s.p95)} | p99 ${fmtMs(s.p99)} | max ${fmtMs(s.maxMs)} | 60fps ${s.fps60Pct.toFixed(0)}% | <30fps ${s.lt30Pct.toFixed(1)}%`);
            }
        }

        if (particles) {
            lines.push('');
            lines.push('--- Particles ---');
            lines.push(`  active/pool: ${particles.active}/${particles.pool} | maxParticles: ${particles.maxParticles} | quality: ${particles.quality}`);
        }
        if (effects && effects.count > 0) {
            lines.push(`  effects[]: ${effects.count} entries — ${Object.entries(effects.byType).map(([k,v]) => `${k}:${v}`).join(', ')}`);
        }

        if (mem) {
            lines.push('');
            lines.push('--- Memory ---');
            lines.push(`  heap ${mem.usedMB} MB used / ${mem.totalMB} MB allocated / ${mem.limitMB} MB limit`);
        }

        // v1.8.4 — combat-metric snapshot (turn-by-turn counter trends).
        // Built for the perf-degradation investigation; auto-active during
        // combat. Reads through window.CombatMetrics so this Diag service
        // stays decoupled from the new module.
        try {
            const CM = (typeof window !== 'undefined') ? window.CombatMetrics : null;
            if (CM && typeof CM.formatForDump === 'function') {
                const body = CM.formatForDump();
                if (body && body !== '(no combat-metric samples this run)') {
                    lines.push('');
                    lines.push('--- Combat metrics (per-turn trends) ---');
                    lines.push(body);
                }
            }
        } catch (_) { /* defensive — diag must never throw during dump */ }

        lines.push('');
        lines.push('--- Action counters (since boot) ---');
        const c = counters;
        lines.push(`  dice ${c.diceUsed} | rerolls ${c.rerolls} | attacks ${c.attacks} | enemyKills ${c.enemyKills} | bossKills ${c.bossKills}`);
        lines.push(`  QTE perf/good/fail ${c.qtePerfect}/${c.qteGood}/${c.qteFail} | perfectParry ${c.parryPerfect}`);
        lines.push(`  sectors cleared ${c.sectorsCleared} | runs start/win/loss ${c.runsStarted}/${c.runsWon}/${c.runsLost}`);
        lines.push(`  auto-tier down ${c.autoTierDowngrades} | up ${c.autoTierUpgrades}`);

        if (errorRing.length > 0) {
            lines.push('');
            lines.push(`--- Errors (last ${errorRing.length}) ---`);
            for (let i = 0; i < errorRing.length; i++) {
                const e = errorRing[i];
                lines.push(`  +${(e.t / 1000).toFixed(1)}s [${e.kind}] ${e.msg} @ ${e.loc}`);
                if (e.stack) lines.push(`    ${e.stack.length > 280 ? e.stack.slice(0, 280) + '…' : e.stack}`);
            }
        } else {
            lines.push('');
            lines.push('--- Errors --- (none captured)');
        }

        if (eventRing.length > 0) {
            lines.push('');
            lines.push(`--- Recent gameplay events (last ${eventRing.length}) ---`);
            for (let i = 0; i < eventRing.length; i++) {
                const e = eventRing[i];
                let dataStr = '';
                if (e.data && typeof e.data === 'object') {
                    dataStr = ' ' + Object.entries(e.data).map(([k,v]) => `${k}=${v}`).join(' ');
                }
                lines.push(`  +${(e.t / 1000).toFixed(1)}s ${e.name}${dataStr}`);
            }
        }

        lines.push('');
        lines.push('=== END REPORT ===');

        const text = lines.join('\n');
        // Print to console — group so the user can collapse it.
        try {
            if (typeof console.groupCollapsed === 'function') console.groupCollapsed('[Diag] dump (paste-ready below — expand to copy)');
            console.log(text);
            if (typeof console.groupEnd === 'function') console.groupEnd();
        } catch (_) {
            console.log(text);
        }

        // Optional clipboard copy.
        if (opts && opts.copy && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            try { navigator.clipboard.writeText(text); console.info('[Diag] copied to clipboard'); }
            catch (_) { console.warn('[Diag] clipboard copy failed'); }
        }

        return text;
    },

    /* Reset all rings + counters. Useful between targeted test runs. */
    reset() {
        errorRing.length = 0;
        eventRing.length = 0;
        checkpoints.length = 0;
        Object.keys(counters).forEach(k => counters[k] = 0);
        console.info('[Diag] rings + counters reset');
    },

    /* Lightweight readers exposed for callers that want raw data
     * (e.g. an in-game HUD). Not used by dump. */
    counters() { return Object.assign({}, counters); },
    errors()   { return errorRing.slice(); },
    events()   { return eventRing.slice(); }
};
