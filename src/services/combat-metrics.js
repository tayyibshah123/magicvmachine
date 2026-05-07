// Combat-only turn-level metric sampler. Built for the v1.8.4
// degradation investigation — the existing PerfTrace gives you per-
// frame timing but no view of WHICH subsystem grows fight-to-fight
// during a long run. CombatMetrics samples a small set of counters
// once per turn and merges into Diag.dump so the user can paste a
// degradation report.
//
// Zero overhead when not active (the sampleTurn path early-returns).
// Activated automatically on combat start; deactivated on quit.
//
// To capture a degradation report:
//   1. Open settings → Show FPS (already wired) — gives you live FPS.
//   2. Run a normal S1 → S5 path. Diag.dump() auto-fires on Sector-5
//      win and gameOver; it now includes the CombatMetrics snapshot
//      with min/max/peak-turn for each counter.
//   3. Paste the dump in a bug report.

const RING_SIZE = 256; // ~256 turns is more than any normal run

export const CombatMetrics = {
    _active: false,
    _samples: [],

    start() {
        this._active = true;
        this._samples = [];
    },

    stop() {
        this._active = false;
    },

    /** Push a single sample. Called once per player turn from endTurn.
     *  Reads through window.* so this module never imports Game
     *  (avoids the circular import the audio fade-cancel hit). */
    sampleTurn(turnNum) {
        if (!this._active) return;
        if (typeof window === 'undefined') return;
        const G = window.Game;
        const PS = window.ParticleSys;
        if (!G) return;

        const player = G.player;
        const enemy  = G.enemy;
        const playerEffects = (player && Array.isArray(player.effects))
            ? player.effects.length : 0;
        const enemyEffects  = (enemy && Array.isArray(enemy.effects))
            ? enemy.effects.length : 0;
        const minionAlive = (player && Array.isArray(player.minions))
            ? player.minions.filter(m => m && m.currentHp > 0).length : 0;
        const enemyMinionAlive = (enemy && Array.isArray(enemy.minions))
            ? enemy.minions.filter(m => m && m.currentHp > 0).length : 0;
        const relicCount = (player && Array.isArray(player.relics))
            ? player.relics.length : 0;
        const sample = {
            t:      Math.round(performance.now()),
            turn:   turnNum | 0,
            sector: G.sector || 1,
            // Counter snapshots — these are the fields the v1.8.4
            // investigation cares about. Add more as new suspects
            // surface; the snapshot() formatter is generic.
            particlesActive: (PS && typeof PS.activeCount === 'number') ? PS.activeCount : 0,
            poolSize:        (PS && PS.pool) ? PS.pool.length : 0,
            effectsCount:    (G.effects && Array.isArray(G.effects)) ? G.effects.length : 0,
            playerEffects, enemyEffects,
            minionAlive, enemyMinionAlive,
            relicCount,
            timersActive:    (G._timers && G._timers.size)    || 0,
            intervalsActive: (G._intervals && G._intervals.size) || 0
        };
        this._samples.push(sample);
        if (this._samples.length > RING_SIZE) this._samples.shift();
    },

    /** Compact rollup for Diag.dump. Returns null if no data. */
    snapshot() {
        if (this._samples.length === 0) return null;
        const s = this._samples;
        const fields = [
            'particlesActive', 'effectsCount', 'playerEffects',
            'enemyEffects', 'minionAlive', 'enemyMinionAlive',
            'relicCount', 'timersActive', 'intervalsActive'
        ];
        const stats = {};
        for (const f of fields) {
            let min = Infinity, max = -Infinity, peakTurn = 0;
            for (const x of s) {
                const v = x[f] || 0;
                if (v < min) min = v;
                if (v > max) { max = v; peakTurn = x.turn; }
            }
            stats[f] = {
                min: (min === Infinity) ? 0 : min,
                max: (max === -Infinity) ? 0 : max,
                final: s[s.length - 1][f] || 0,
                peakTurn
            };
        }
        return {
            samples: s.length,
            firstTurn: s[0].turn,
            lastTurn: s[s.length - 1].turn,
            sectorRange: [s[0].sector, s[s.length - 1].sector],
            stats
        };
    },

    /** Pretty-print for the Diag dump body. Returns a multi-line string
     *  that fits inside the existing dump's 80-col block format. */
    formatForDump() {
        const snap = this.snapshot();
        if (!snap) return '(no combat-metric samples this run)';
        const lines = [
            `samples: ${snap.samples} turns (T${snap.firstTurn}-T${snap.lastTurn}, S${snap.sectorRange[0]}-S${snap.sectorRange[1]})`
        ];
        const order = [
            ['effectsCount',     'effects[]      '],
            ['particlesActive',  'particles      '],
            ['playerEffects',    'player.effects '],
            ['enemyEffects',     'enemy.effects  '],
            ['minionAlive',      'player minions '],
            ['enemyMinionAlive', 'enemy minions  '],
            ['relicCount',       'relics         '],
            ['timersActive',     '_timers active '],
            ['intervalsActive',  '_intervals     ']
        ];
        for (const [key, label] of order) {
            const x = snap.stats[key];
            if (!x) continue;
            // Only emit fields that actually moved during the run.
            if (x.min === x.max && x.max === 0) continue;
            lines.push(
                `  ${label} min=${x.min} max=${x.max}@T${x.peakTurn} final=${x.final}`
            );
        }
        return lines.join('\n');
    }
};

// Global handle so Diag (already non-module-aware in places) can find it.
if (typeof window !== 'undefined') window.CombatMetrics = CombatMetrics;
