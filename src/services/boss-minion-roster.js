// BossMinionRoster — read-only consolidation utility for bosses that
// command a dependent minion swarm. The three sector bosses with this
// pattern (Tesseract Prime / Hive Protocol / The Compiler) each grew
// their per-turn passives, kill hooks, invincibility gates, and
// resummon timers as inline branches in game.js / entity.js.
//
// This module does not rewire that hand-bolted logic. Instead it
// provides a unified accessor + tag — registered on the boss at spawn
// — so future bosses can opt in to a clean API without each one
// inventing its own filter expression. A future refactor pass can
// migrate the existing branches over progressively.
//
// Usage:
//
//   import { BossMinionRoster } from './services/boss-minion-roster.js';
//
//   const roster = new BossMinionRoster(bossEnemy, {
//       kind: 'tesseract',
//       invincibleWhileAnyAlive: true,
//       isMember: (m) => !!m._isTessFragment
//   });
//   bossEnemy.minionRoster = roster;
//
// Then anywhere in the engine that needs to query the swarm:
//
//   const fragments = bossEnemy.minionRoster.living();
//   if (bossEnemy.minionRoster.shouldGateBossDamage()) { ... }

export class BossMinionRoster {
    constructor(boss, config) {
        this.boss = boss || null;
        this.config = Object.assign({
            kind: 'generic',
            invincibleWhileAnyAlive: false,
            isMember: (m) => !!m
        }, config || {});
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

    // Should boss damage be gated entirely while any roster member is
    // alive? entity.takeDamage can call this to short-circuit damage
    // when the swarm is acting as a shield (Tesseract Prime today).
    shouldGateBossDamage() {
        if (!this.config.invincibleWhileAnyAlive) return false;
        return this.living().length > 0;
    }
}
