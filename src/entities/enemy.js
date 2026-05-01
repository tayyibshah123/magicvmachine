import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { Entity } from './entity.js';
import { Game } from '../game.js';


class Enemy extends Entity {
    constructor(template, level, isElite = false) {
        // Handle Boss vs Standard scaling
        let hp = template.hp;
        let dmg = template.dmg;
        
        if (!template.actionsPerTurn) {
            // Standard Enemy Scaling
            const scaler = 1 + (level * 0.15);
            hp = Math.floor(hp * scaler);
            dmg = Math.floor(dmg * scaler);
        }

        super(540, 550, template.name, hp);
        this.baseDmg = dmg;
        this.isBoss = !!template.actionsPerTurn;
        this.bossData = template;
        this.shape = template.shape || 'drone';
        this.minions = [];

        // NEW: Array for multiple actions
        this.nextIntents = [];

        this.phase = 1;
        this.isElite = isElite;
        this.showIntent = true; // UPDATED: Default to TRUE

        // Expansion (5.2.1) — kind-specific per-enemy mechanic.
        // Each unique kind drives a branch in generateSingleIntent and may also
        // add on-start / on-hit / on-death behavior handled by Game.
        this.kind = template.kind || null;
        this.summonOnStart = template.summonOnStart || 0;
        // Per-kind flags initialised so downstream code can read them safely.
        if (this.kind === 'burrow')   { this.burrowed = false; this.burrowTurns = 0; }
        if (this.kind === 'clone')    this.cloneFired = false;
        if (this.kind === 'observer') this.observerArmed = false;
        if (this.kind === 'chaotic')  this.chaoticBuffList = ['empower', 'thorns', 'regen', 'shieldBuff'];
        if (this.kind === 'aoe_sweep') this.sweepCooldown = 0;
        
        this.affixes = [];
        if (this.isElite) {
            // Pool of elite affixes. Each is handled as a stat mod or a
            // small takeDamage / turn hook — see entity.js and enemy turn
            // resolver for the handlers.
            const pool = ['Shielded', 'Second Wind', 'Jammer', 'Reflector',
                          'Phase', 'Multiplier', 'Anchor', 'Vampiric', 'Brittle'];
            this.affixes.push(pool[Math.floor(Math.random() * pool.length)]);
        }
        this.secondWindTriggered = false;
        this.phaseFlag = false; // Phase affix alternates HP/shield target
    }

    getEffectiveDamage(baseVal) {
        let dmg = baseVal || this.baseDmg;

        // 1. Constrict / Digital Rot (Multiplicative reduction)
        const constrict = this.hasEffect('constrict');
        if (constrict) {
            dmg = Math.floor(dmg * constrict.val);
        }

        // 2. Weak (50% reduction)
        const weak = this.hasEffect('weak');
        if (weak) {
            dmg = Math.floor(dmg * 0.5);
        }

        // 3. Elite affix: Brittle — +25% outgoing damage (paired with +50%
        //    incoming in entity.js). Glass-cannon elite profile.
        if (this.affixes && this.affixes.includes('Brittle')) {
            dmg = Math.floor(dmg * 1.25);
        }

        return Math.max(0, dmg);
    }

    decideTurn() {
        this.nextIntents = [];
        // Archivist rewind cooldown resets at the start of each round so the
        // boss can rewind once per player turn, not once per fight.
        this._rewindUsedThisTurn = false;
        // STUN consumer — the effect was previously applied (e.g. SIG_ANNI_3)
        // but never read. A stunned enemy queues a single 'stunned' intent
        // (no actions) and the resolver short-circuits the turn loop. Stun
        // duration ticks down via the standard updateEffects pass so the
        // enemy returns to action automatically next turn.
        if (this.hasEffect && this.hasEffect('stun')) {
            this.nextIntents.push({ type: 'stunned', val: 0, target: null });
            this.intentRefreshedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
            return;
        }
        const actionCount = this.isBoss ? this.bossData.actionsPerTurn : 1;

        for(let i=0; i<actionCount; i++) {
            this.nextIntents.push(this.generateSingleIntent());
        }

        // FIX: Calculate effective values immediately so UI is correct at start of turn
        this.updateIntentValues();
        // Ping timestamp — the renderer reads this to expand/contract the
        // intent icons briefly so a refreshed intent catches the eye.
        this.intentRefreshedAt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    }

    // Pick the next boss move from the moves[] pool with two layers of
    // anti-predictability:
    //   1. Skip the immediately previous move when more than one option
    //      exists — kills the worst-case "shield, shield, shield" or
    //      "attack, attack, attack" runs that pure Math.random() lets
    //      through ~25% of the time on a 4-move boss.
    //   2. In phase 2+ (the boss is below threshold HP), bias 60% toward
    //      aggressive moves (attack / multi_attack / summon / cataclysm)
    //      so low-HP fights ramp pressure instead of stalling on
    //      shield/buff turns.
    _pickBossMove(moves) {
        if (!moves || moves.length === 0) return null;
        if (moves.length === 1) return moves[0];

        const last = this._lastBossMove;
        let pool = moves;
        if (last) {
            const filtered = moves.filter(m => m !== last);
            if (filtered.length > 0) pool = filtered;
        }

        if (this.phase >= 2) {
            const aggressive = pool.filter(m =>
                m === 'attack' || m === 'multi_attack' || m === 'summon' || m === 'cataclysm'
            );
            if (aggressive.length > 0 && Math.random() < 0.6) {
                const pick = aggressive[Math.floor(Math.random() * aggressive.length)];
                this._lastBossMove = pick;
                return pick;
            }
        }

        const pick = pool[Math.floor(Math.random() * pool.length)];
        this._lastBossMove = pick;
        return pick;
    }

    generateSingleIntent() {
        // Targeting Logic — slight finisher bias: 50% player, 50% minion,
        // but when minions exist, 70% of the minion-target picks go to the
        // lowest-HP player minion (so enemies feel tactical and finish off
        // weakened minions instead of spreading damage evenly). Random 30%
        // stays spread to avoid full-deterministic cheese.
        const getTarget = () => {
            const minions = Game.player ? Game.player.minions : null;
            if (!minions || minions.length === 0) return Game.player;
            if (Math.random() < 0.5) return Game.player;
            if (Math.random() < 0.7) {
                // Pick lowest-HP minion (stable for equal HP via index).
                let lowest = minions[0];
                for (let i = 1; i < minions.length; i++) {
                    if (minions[i] && minions[i].currentHp < lowest.currentHp) lowest = minions[i];
                }
                return lowest;
            }
            return minions[Math.floor(Math.random() * minions.length)];
        };

        // Ascension 15 — Mirror World. Every enemy has a 28% chance per
        // action to echo the player's last damage dealt as a mirror_attack.
        // Scales the threat to the player's own output, so burst builds get
        // punished by burst echoes. Falls back to baseDmg if the player
        // hasn't dealt damage yet this combat.
        const cbMirrored = Game && Game._ascEffects && Game._ascEffects.enemyCopiesLastDie;
        if (cbMirrored && Math.random() < 0.28) {
            const mirroredBase = (Game.player && Game.player._lastDamageDealt)
                ? Game.player._lastDamageDealt : this.baseDmg;
            return {
                type: 'mirror_attack',
                val: Math.max(4, Math.floor(mirroredBase * 0.85)),
                target: Game.player
            };
        }

        if (this.isBoss) {
            // --- THE ARCHIVIST (Sector X) ---
            // 4-phase fight that channels mechanics from every prior boss:
            //   Phase 1 — rotating "mechanic menu" — one sector mechanic per turn.
            //   Phase 2 — "archive" the player's last-played die so it can't be
            //              played next turn (handled in Game.useDie).
            //   Phase 3 — "rewind" — heavy hits restore boss HP (handled in
            //              entity.takeDamage when `currentHp` drops by >= 80 in
            //              one tick).
            //   Phase 4 — enrage; all prior mechanics fire simultaneously for
            //              up to 3 turns.
            if (this.name === "THE ARCHIVIST") {
                // Pick this turn's signature mechanic by rotating an index.
                // Phase 4 (enrage) triggers BOTH the rotating mechanic AND
                // an attack/multi_attack on the second action — handled by
                // the actionCount loop in decideTurn picking different
                // intents per call.
                this._archivistTurn = (this._archivistTurn || 0) + 1;
                this._archivistMechIdx = ((this._archivistMechIdx || 0) + 1) % 5;
                const mechIdx = this._archivistMechIdx;
                // Rotating menu — keyed by sector mechanic.
                //   0: Panopticon → analyse (nullify a die next turn)
                //   1: Cryo       → frost AoE (Weak debuff on player + minions)
                //   2: Foundry    → heat tick (player burn this turn)
                //   3: Hive       → summon glitch ally (cap 2)
                //   4: Source     → reality overwrite (chaos)
                let intent;
                if (mechIdx === 0) intent = { type: 'analyse', val: 0 };
                else if (mechIdx === 1) intent = { type: 'frost_aoe', val: Math.floor(this.baseDmg * 0.7), isAOE: true };
                else if (mechIdx === 2) intent = { type: 'attack', val: Math.floor(this.baseDmg * 1.1), target: Game.player, _archivistHeat: true };
                else if (mechIdx === 3) intent = (this.minions.length < 2)
                    ? { type: 'summon_glitch', val: 0 }
                    : { type: 'attack', val: this.baseDmg, target: Game.player };
                else intent = { type: 'reality_overwrite', val: 0 };
                // Phase 4 enrage — alternating action slot becomes a hard
                // multi-attack so the simultaneous-mechanic feeling lands.
                if (this.phase === 4) {
                    if (Math.random() < 0.5) {
                        return { type: 'multi_attack', val: Math.floor(this.baseDmg * 0.7), hits: 3, target: getTarget() };
                    }
                }
                return intent;
            }

            // --- THE SOURCE SPECIAL LOGIC ---
            if (this.name === "THE SOURCE") {
                if (this.chargingPurge) {
                    this.chargingPurge = false;
                    return { type: 'purge_attack', val: 100, target: Game.player };
                }
                if (!this.realityOverwritten && Math.random() < 0.15) {
                    return { type: 'reality_overwrite', val: 0 };
                }
            }

            const moves = this.bossData.moves;
            const roll = this._pickBossMove(moves);

            // --- NEW MOVES ---
            if (roll === 'purge') {
                this.chargingPurge = true;
                return { type: 'charge', val: 0 }; 
            }
            if (roll === 'summon_glitch') {
                if (this.minions.length < 2) return { type: 'summon_glitch', val: 0 };
                return { type: 'attack', val: this.baseDmg, target: getTarget() };
            }
            if (roll === 'summon_void') {
                if (this.minions.length < 2) return { type: 'summon_void', val: 0 };
                return { type: 'shield', val: this.bossData.shieldVal || 20 };
            }
            if (roll === 'reality_overwrite') return { type: 'reality_overwrite', val: 0 };
            // Analyse — telegraphs the Panopticon's nullify beat on this
            // turn's intent preview instead of firing from an invisible
            // startTurn cooldown. Resolution sets the player's
            // _panopticonNullifyFirst flag for next turn.
            if (roll === 'analyse') return { type: 'analyse', val: 0 };
            
            // FIX: Dispel Logic - Only if debuffed
            if (roll === 'dispel') {
                if (this.effects.length > 0) return { type: 'dispel', val: 0 };
                // If no debuffs, reroll to attack
                return { type: 'attack', val: this.baseDmg, target: getTarget() };
            }

            // --- EXISTING MOVES ---
            if (roll === 'attack') return { type: 'attack', val: this.baseDmg, target: getTarget() };
            if (roll === 'shield') return { type: 'shield', val: this.bossData.shieldVal || 15 }; 
            if (roll === 'buff') return { type: 'buff', val: 0, secondary: { type: 'buff', id: 'empower'} };
            if (roll === 'debuff') return { type: 'debuff', val: 15, secondary: { type: 'debuff', id: 'frail'}, target: Game.player };
            
            if (roll === 'consume') {
                if (Game.player.minions.length > 0) return { type: 'consume', val: 0 };
                return { type: 'attack', val: this.baseDmg * 1.5, target: Game.player }; 
            }
            
            if (roll === 'cataclysm') return { type: 'attack', val: this.baseDmg * 0.5, isAOE: true };
            if (roll === 'multi_attack') return { type: 'multi_attack', val: Math.floor(this.baseDmg * 0.6), hits: 3, target: getTarget() };
            if (roll === 'summon' && this.minions.length < 2) return { type: 'summon', val: 0 };
            
            return { type: 'attack', val: this.baseDmg, target: getTarget() }; 
        }

        // ===== Expansion (5.2.1) kind-branches — each before the generic logic =====
        if (this.kind === 'aoe_sweep') {
            // Every 3rd turn unleashes a sweeping attack that hits player + all minions.
            this.sweepCooldown = (this.sweepCooldown || 0) - 1;
            if (this.sweepCooldown <= 0) {
                this.sweepCooldown = 2;
                return { type: 'aoe_sweep', val: Math.floor(this.baseDmg * 0.85), isAOE: true };
            }
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'mirror') {
            // Reflects the player's last-used damage die value; falls back to baseDmg.
            const mirrored = (Game.player && Game.player._lastDamageDealt) ? Game.player._lastDamageDealt : this.baseDmg;
            return { type: 'mirror_attack', val: Math.max(4, Math.floor(mirrored * 0.85)), target: Game.player };
        }
        if (this.kind === 'frost') {
            // 50/50 frost AoE (Weak debuff) or basic attack.
            if (Math.random() < 0.5) return { type: 'frost_aoe', val: Math.floor(this.baseDmg * 0.6), isAOE: true };
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'burrow') {
            // Burrow turn = no damage; resurges with a heavy hit on turn 3.
            if (this.burrowed) {
                this.burrowTurns--;
                if (this.burrowTurns <= 0) {
                    this.burrowed = false;
                    return { type: 'burrow_resurge', val: Math.floor(this.baseDmg * 1.8), target: Game.player };
                }
                return { type: 'burrow_idle', val: 0 };
            }
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'clone') {
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'phase_shift') {
            // Phase Stalker — slips between forms. Damage taken is
            // resolved in entity.takeDamage where 35% of incoming hits
            // pass through; here it just attacks at a heavy multiplier
            // so when it DOES connect it lands harder than its
            // sector-tier stats imply.
            return { type: 'attack', val: Math.floor(this.baseDmg * 1.1), target: getTarget() };
        }
        if (this.kind === 'armored') {
            // Slow & heavy — shields itself on alternate turns.
            this._armoredTick = (this._armoredTick || 0) + 1;
            if (this._armoredTick % 2 === 0) return { type: 'shield', val: Math.floor(this.maxHp * 0.1) };
            return { type: 'attack', val: Math.floor(this.baseDmg * 1.2), target: getTarget() };
        }
        if (this.kind === 'immolate') {
            // Builds charge 3 turns, then self-immolates for massive AoE and dies.
            this.immolateCharge = (this.immolateCharge || 0) + 1;
            if (this.immolateCharge >= 3) {
                return { type: 'immolate', val: Math.floor(this.maxHp * 0.6), isAOE: true };
            }
            return { type: 'charging_immolate', val: 0 };
        }
        if (this.kind === 'healer') {
            // Heal a wounded ally at most every other turn (cooldown prevents
            // pseudo-infinite sustain when paired with an elite or boss).
            this._healCooldown = (this._healCooldown || 0) - 1;
            if (this._healCooldown <= 0) {
                const wounded = (this.minions || []).filter(m => m.currentHp < m.maxHp);
                if (Game.enemy && Game.enemy !== this && Game.enemy.currentHp < Game.enemy.maxHp) wounded.push(Game.enemy);
                if (wounded.length > 0) {
                    this._healCooldown = 2;
                    const t = wounded[Math.floor(Math.random() * wounded.length)];
                    return { type: 'heal_ally', val: Math.floor(t.maxHp * 0.15), target: t };
                }
            }
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'shielder') {
            // Gives ally-shield every other turn; otherwise a medium attack.
            this._shielderTick = (this._shielderTick || 0) + 1;
            if (this._shielderTick % 2 === 0) return { type: 'shield_ally', val: 12 };
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'detonator') {
            // Low HP, mid attack — the real threat is the death explosion handled on takeDamage.
            return { type: 'attack', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'buffer') {
            // Buffs allies' damage every other turn; fills with weak attacks.
            this._bufferTick = (this._bufferTick || 0) + 1;
            if (this._bufferTick % 2 === 0) return { type: 'buff_allies', val: 3 };
            return { type: 'attack', val: Math.floor(this.baseDmg * 0.75), target: getTarget() };
        }
        if (this.kind === 'shield_break') {
            // Strips shield before dealing damage — erases, then hits.
            return { type: 'shield_strip_attack', val: this.baseDmg, target: Game.player };
        }
        if (this.kind === 'chaotic') {
            // Gains a random self-buff, then attacks.
            return { type: 'chaotic_act', val: this.baseDmg, target: getTarget() };
        }
        if (this.kind === 'observer') {
            // Turn 1: armed (does nothing). Turn 2+: heavy strike.
            if (!this.observerArmed) {
                this.observerArmed = true;
                return { type: 'observer_wait', val: 0 };
            }
            return { type: 'observer_strike', val: Math.floor(this.baseDmg * 1.6), target: Game.player };
        }

        // Standard Enemy Logic
        const isLowHp = this.currentHp < this.maxHp * 0.3;
        const roll = Math.random();

        if (isLowHp) return { type: 'heal', val: Math.floor(this.maxHp * 0.1) };
        if (this.minions.length < 2 && roll < 0.2) return { type: 'summon', val: 0 };

        return { type: 'attack', val: this.baseDmg, target: getTarget() };
    }

    updateIntentValues() {
        // Every intent type that resolves as outgoing damage routes through
        // getEffectiveDamage so Constrict / Digital Rot / Weak all stack.
        // Previous version only listed attack/multi_attack/debuff/purge_attack,
        // which left Slag Geyser's IMMOLATE and the sector-4 AoE sweeps dealing
        // full damage even while the enemy was debuffed.
        const DAMAGE_INTENTS = new Set([
            'attack', 'multi_attack', 'debuff', 'purge_attack',
            'aoe_sweep', 'frost_aoe', 'immolate',
            'shield_strip_attack', 'chaotic_act',
            'mirror_attack', 'observer_strike', 'burrow_resurge'
        ]);
        this.nextIntents.forEach(intent => {
            if (DAMAGE_INTENTS.has(intent.type)) {
                intent.effectiveVal = this.getEffectiveDamage(intent.val);
            } else if (intent.type === 'heal') {
                let heal = intent.val;
                const constrict = this.hasEffect('constrict');
                if (constrict) heal = Math.floor(heal * constrict.val);
                intent.effectiveVal = heal;
            } else {
                // For non-value intents (like shield), effective is just val
                intent.effectiveVal = intent.val;
            }
        });
    }
    
    checkPhase() {
        // Multi-phase boss progression. Phase 1 (100%–51%), Phase 2 (50%–21%),
        // Phase 3 (20%–0%). Each transition fires Game.triggerBossPhaseTransition
        // which handles the cinematic beat (zoom, shake, banner, flash).
        if (!this.isBoss) return;
        // Archivist runs a 4-phase cadence (66/33/15) — see generateSingleIntent
        // for the mechanic each phase unlocks.
        if (this.name === "THE ARCHIVIST") {
            if (this.phase === 1 && this.currentHp < this.maxHp * 0.66) {
                this.phase = 2;
                ParticleSys.createExplosion(this.x, this.y, 50, '#ffd76a');
                AudioMgr.playSound('explosion');
                if (Game && typeof Game.triggerBossPhaseTransition === 'function') {
                    Game.triggerBossPhaseTransition(this, 2);
                }
            } else if (this.phase === 2 && this.currentHp < this.maxHp * 0.33) {
                this.phase = 3;
                ParticleSys.createExplosion(this.x, this.y, 60, '#ff77aa');
                AudioMgr.playSound('explosion');
                if (Game && typeof Game.triggerBossPhaseTransition === 'function') {
                    Game.triggerBossPhaseTransition(this, 3);
                }
            } else if (this.phase === 3 && this.currentHp < this.maxHp * 0.15) {
                this.phase = 4;
                ParticleSys.createExplosion(this.x, this.y, 80, '#ff0055');
                AudioMgr.playSound('explosion');
                if (Game && typeof Game.triggerBossPhaseTransition === 'function') {
                    Game.triggerBossPhaseTransition(this, 4);
                }
            }
            return;
        }
        if (this.phase === 1 && this.currentHp < this.maxHp * 0.5) {
            this.phase = 2;
            ParticleSys.createExplosion(this.x, this.y, 50, '#f0f');
            AudioMgr.playSound('explosion');
            if (!this.phase2Triggered) {
                this.phase2Triggered = true;
                if (Game && typeof Game.triggerBossPhaseTransition === 'function') {
                    Game.triggerBossPhaseTransition(this, 2);
                }
            }
        } else if (this.phase === 2 && this.currentHp < this.maxHp * 0.2) {
            this.phase = 3;
            ParticleSys.createExplosion(this.x, this.y, 70, '#ff3355');
            AudioMgr.playSound('explosion');
            if (!this.phase3Triggered) {
                this.phase3Triggered = true;
                // Ascension 16 (Endless Loop) — Phase 3 lasts N extra turns.
                // Heal the boss back up by ~10% maxHp per bonus turn so the
                // fight literally takes longer to close. Capped at 70%
                // maxHp so it never undoes the player's whole Phase 1+2
                // grind, and surfaced as a "REWIND" floater so the
                // modifier reads on screen.
                const bonus = (Game && Game._ascEffects && Game._ascEffects.bossPhase3Bonus) || 0;
                if (bonus > 0) {
                    const cap = Math.floor(this.maxHp * 0.7);
                    const restore = Math.min(cap, Math.floor(this.maxHp * 0.10 * bonus));
                    this.currentHp = Math.min(this.maxHp, this.currentHp + restore);
                    ParticleSys.createFloatingText(this.x, this.y - 120,
                        `ENDLESS LOOP +${restore} HP`, '#ff3355');
                }
                if (Game && typeof Game.triggerBossPhaseTransition === 'function') {
                    Game.triggerBossPhaseTransition(this, 3);
                }
            }
        }
    }
}

export { Enemy };
