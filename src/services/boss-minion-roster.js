import { ParticleSys } from '../effects/particles.js';

// BossMinionRoster — boss-side swarm consolidation utility.
//
// Each of the three swarm bosses (Tesseract Prime / Hive Protocol /
// The Compiler) registers a roster on its boss enemy at spawn time
// with a config object describing its membership predicate and any
// applicable callbacks (per-turn passives, on-kill hooks, resummon
// rules). The engine then calls into the roster from a few central
// chokepoints (entity.takeDamage, _resolveEnemyKill, game.startTurn,
// enemy.generateSingleIntent) instead of switching on boss name.
//
// Adding a new swarm boss is now: write the spawn site + register a
// config. No edits to entity.js or to the startTurn hub required.
//
// Usage:
//
//   import { BossMinionRoster } from './services/boss-minion-roster.js';
//
//   bossEnemy.minionRoster = new BossMinionRoster(bossEnemy, {
//       kind: 'tesseract',
//       isMember: (m) => !!m._isTessFragment,
//       invincibleWhileAnyAlive: true,
//       invincibleFloaterText: 'INVINCIBLE — DESTROY FRAGMENTS',
//       perTurnPassive: (boss, members, game) => { ... },
//       onMinionKill: (boss, dead, remaining, game) => { ... },
//       resummonRule: {
//           deadlineKey: '_fragmentResummonAt',
//           delayTurns: 3,
//           spawn: (boss, game) => { ... }
//       }
//   });
//
// All config fields are optional. A roster with no callbacks is a
// pure read-only swarm tracker.

export class BossMinionRoster {
    constructor(boss, config) {
        this.boss = boss || null;
        this.config = Object.assign({
            kind: 'generic',
            invincibleWhileAnyAlive: false,
            isMember: (m) => !!m
        }, config || {});
        // Internal: tracks the rate-limit on the invincibility floater so
        // a flurry of player attacks against a gated boss does not flood
        // the screen with the same banner.
        this._invincibleTextAt = 0;
    }

    // Live members of the roster — boss-side minions that match the
    // config's member predicate AND still have HP. Reads from the
    // boss's existing `minions` array so any add / remove the engine
    // does is reflected automatically.
    living() {
        if (!this.boss || !Array.isArray(this.boss.minions)) return [];
        const isMember = this.config.isMember || (() => true);
        return this.boss.minions.filter(m => m && m.currentHp > 0 && isMember(m));
    }

    count() {
        return this.living().length;
    }

    byRole(role) {
        return this.living().filter(m => m && m._tessRole === role);
    }

    // Boss damage-gate query. Used by entity.takeDamage to short-circuit
    // damage when the swarm is acting as a shield (Tesseract Prime today).
    shouldGateBossDamage() {
        if (!this.config.invincibleWhileAnyAlive) return false;
        return this.living().length > 0;
    }

    // Boss-name-agnostic invincibility floater. Surfaces the configured
    // text + a soft shockwave on the boss, rate-limited to once per
    // 600ms so a multi-hit attack chain does not flood the screen.
    fireInvincibilityFloater() {
        if (!this.boss) return;
        const text = this.config.invincibleFloaterText;
        if (!text) return;
        const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
        if (now - this._invincibleTextAt < 600) return;
        this._invincibleTextAt = now;
        try {
            ParticleSys.createFloatingText(this.boss.x, this.boss.y - 140,
                text, '#ffd76a');
            ParticleSys.createShockwave(this.boss.x, this.boss.y, '#ffd76a', 28);
        } catch (_) {}
    }

    // Per-turn passive invocation. Engine calls this from startTurn for
    // every boss; the roster delegates to the configured callback if
    // present. No-op otherwise.
    tickPassives(turnCount, game) {
        const fn = this.config.perTurnPassive;
        if (typeof fn !== 'function') return;
        try {
            fn(this.boss, this.living(), game, turnCount);
        } catch (_) {}
    }

    // Minion-death dispatcher. Called from entity._resolveEnemyKill
    // when a minion belonging to this boss is removed. The roster
    // computes the surviving members AFTER the death and hands both
    // to the configured callback.
    handleMinionKill(deadMinion, game) {
        const fn = this.config.onMinionKill;
        if (typeof fn !== 'function') return;
        // Living members AFTER this death — the boss.minions array
        // still includes the corpse at this point because the splice
        // happens after _resolveEnemyKill returns.
        const isMember = this.config.isMember || (() => true);
        const remaining = (this.boss && Array.isArray(this.boss.minions))
            ? this.boss.minions.filter(m => m && m !== deadMinion && m.currentHp > 0 && isMember(m))
            : [];
        try {
            fn(this.boss, deadMinion, remaining, game);
        } catch (_) {}
    }

    // Resummon timer check. Engine calls this each startTurn; if the
    // configured deadline key is set on the boss and turnCount has
    // reached it, fire the spawn factory and clear the deadline.
    checkResummon(turnCount, game) {
        const rule = this.config.resummonRule;
        if (!rule || typeof rule.spawn !== 'function' || !this.boss) return;
        const key = rule.deadlineKey;
        if (!key) return;
        const deadline = this.boss[key];
        if (typeof deadline !== 'number' || deadline <= 0) return;
        if (turnCount < deadline) return;
        // Fire the spawn factory and clear the deadline.
        this.boss[key] = 0;
        try {
            rule.spawn(this.boss, game);
        } catch (_) {}
    }

    // AI query — should the boss schedule a resummon intent THIS turn?
    // Used by enemy.generateSingleIntent for cadence-driven swarms
    // (Hive Protocol's summon_hive cadence). Reads the config's
    // cadenceFn(boss) for the current cadence in turns.
    shouldRespawn(turnCount) {
        const rule = this.config.resummonRule;
        if (!rule || typeof rule.cadenceFn !== 'function') return false;
        if (!this.boss) return false;
        const cap = (typeof rule.cap === 'number') ? rule.cap : Infinity;
        if (this.living().length >= cap) return false;
        // Cadence flag — consumer increments this each enemy turn so
        // the modulo check fires consistently independent of skipped
        // turns from other intents.
        const counterKey = rule.counterKey || '_swarmRespawnCounter';
        this.boss[counterKey] = (this.boss[counterKey] || 0) + 1;
        const cadence = rule.cadenceFn(this.boss);
        if (cadence <= 0) return false;
        return (this.boss[counterKey] % cadence) === 0;
    }
}
