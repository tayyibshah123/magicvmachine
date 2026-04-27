import { COLORS } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { TooltipMgr } from '../ui/tooltip.js';
import { Game } from '../game.js';
import { ClassAbility } from '../ui/class-ability.js';
import { Hints } from '../services/hints.js';

// Late-bound class refs (set by registerEntityClasses() after all modules load).
// Avoids circular import TDZ: entity.js cannot eagerly import its own subclasses
// because each subclass extends Entity at module-eval time. The instanceof checks
// in Entity's methods only run after registration, so module-local lets are safe.
let Player, Minion, Enemy;
export function registerEntityClasses(p, m, e) { Player = p; Minion = m; Enemy = e; }

// After dealing damage from a reflect/retaliate path, resolve the kill so
// the boss-death win condition (or minion removal) fires immediately rather
// than waiting for the next turn-tick to notice a corpse.
function _resolveEnemyKill(target) {
    if (!target || target.currentHp > 0 || !Game) return;
    if (target === Game.enemy) {
        Game.winCombat();
        return;
    }
    if (Game.enemy && Game.enemy.minions && Game.enemy.minions.includes(target)) {
        Game.enemy.minions = Game.enemy.minions.filter(m => m !== target);
    } else if (Game.player && Game.player.minions && Game.player.minions.includes(target)) {
        Game.player.minions = Game.player.minions.filter(m => m !== target);
    }
}


/* =========================================
   3. CLASSES
   ========================================= */
class Entity {
    constructor(x, y, name, maxHp) {
        this.x = x;
        this.y = y;
        this.name = name;
        this.maxHp = maxHp;
        this.currentHp = maxHp;
        this.shield = 0;
        this.radius = 120;
        this.effects = [];
        this.anim = { type: 'idle', timer: 0, startVal: 0 };
        this.flashTimer = 0; 
        // NEW: Spawn Animation State
        this.spawnTimer = 0; 
        this.maxSpawnTimer = 1.0; // 1 second spawn in
    }

    takeDamage(amount, source = null, suppressBlockText = false, bypassShield = false) {
        // --- GOD MODE INVINCIBILITY ---
        if (this instanceof Player && Game.godMode) {
            ParticleSys.createFloatingText(this.x, this.y - 60, "GOD MODE", "#ff0055");
            return false;
        }

        // Bloodstalker: Blood Thrall redirects EXTERNAL player-bound damage
        // to itself while alive. "External" = damage originating from an
        // Enemy or an enemy-side Minion — so blocking enemy attacks counts,
        // but self-costs (Blood Tribute HP payment, reroll costs, event
        // choices that drain HP, annihilator autovent) still hit the player.
        // DOT ticks from debuffs (bleed/poison, null source) also bypass the
        // thrall, which keeps the bar from double-filling off self-applied
        // tick damage. The Blood Pool bar still fills off the redirected
        // amount so the tribute charge-up loop keeps running untouched.
        const _isExternalSource = !!(source && (
            (Enemy && source instanceof Enemy) ||
            (Minion && source instanceof Minion && source.isPlayerSide === false)
        ));
        if (this instanceof Player && _isExternalSource && amount > 0
            && this.traits && this.traits.minionName === 'Blood Thrall') {
            const thrall = (this.minions || []).find(m => m && m.currentHp > 0);
            if (thrall) {
                ParticleSys.createFloatingText(thrall.x, thrall.y - 60, `SHIELDED -${amount}`, '#ff0055');
                AudioMgr.playSound('hit');
                thrall.takeDamage(amount, source, suppressBlockText);
                if (thrall.currentHp <= 0) {
                    this.minions = this.minions.filter(m => m !== thrall);
                }
                try { ClassAbility.onEvent('damage_taken', { amount, source }); } catch (_) {}
                return false;
            }
        }

        if (this instanceof Enemy && this.invincibleTurns > 0) {
            ParticleSys.createFloatingText(this.x, this.y - 60, "INVINCIBLE", "#888");
            AudioMgr.playSound('defend');
            return false;
        }

        // Elite affix: Phase — alternates between HP and shield target each hit.
        // When flagged "shield", incoming damage becomes shield-damage only.
        if (this instanceof Enemy && this.affixes && this.affixes.includes('Phase')) {
            this.phaseFlag = !this.phaseFlag;
            if (this.phaseFlag) {
                if (this.shield > 0) {
                    const take = Math.min(this.shield, amount);
                    this.shield -= take;
                    ParticleSys.createFloatingText(this.x, this.y - 80, "PHASE (SHIELD)", "#bc13fe");
                    return false;
                }
            } // else: normal HP damage this hit
        }

        if (this instanceof Enemy && this.glitchMod && this.glitchMod.id === 'evasive') {
            if (Math.random() < 0.2) {
                ParticleSys.createFloatingText(this.x, this.y - 60, "GLITCH DODGE", "#ff00ff");
                AudioMgr.playSound('defend');
                return false;
            }
        }

        let actualDmg = amount;

        if (this instanceof Player && this.incomingDamageMult > 1) {
            actualDmg = Math.floor(actualDmg * this.incomingDamageMult);
        }

        // Custom Run: Glass Cannon-style incoming-damage modifier. Applied
        // to the player on any external source so self-costs (blood tribute,
        // blood reroll) aren't double-punished.
        if (this instanceof Player && Game && Game._customDmgInMult && Game._customDmgInMult !== 1 && source) {
            actualDmg = Math.floor(actualDmg * Game._customDmgInMult);
        }

        // Expansion (5.2.1) — Foundry Golem armored plating halves incoming damage.
        if (Enemy && this instanceof Enemy && this.kind === 'armored') {
            actualDmg = Math.floor(actualDmg * 0.5);
        }

        // Elite affix: Brittle — enemy takes +50% incoming damage (paired
        // with a +25% outgoing in enemy.js getEffectiveDamage). Net: a
        // glass-cannon elite that rewards focused burst.
        if (Enemy && this instanceof Enemy && this.affixes && this.affixes.includes('Brittle')) {
            actualDmg = Math.floor(actualDmg * 1.5);
        }

        // PANOPTICON eye-lock (phase 2): player takes 2x damage unless a
        // minion is alive to break line-of-sight.
        if (this instanceof Player && Game.enemy && Game.enemy.eyeLockTurns > 0 && source === Game.enemy) {
            const hasMinion = this.minions && this.minions.some(m => m && m.currentHp > 0);
            if (!hasMinion) {
                actualDmg = Math.floor(actualDmg * 2);
                ParticleSys.createFloatingText(this.x, this.y - 170, "EYE LOCK x2", "#00ffff");
            }
        }

        // PANOPTICON blind protocol (phase 3): 20% miss chance on both sides
        // when the boss is in blind mode.
        if (Game.enemy && Game.enemy.blindProtocol && Math.random() < 0.2) {
            ParticleSys.createFloatingText(this.x, this.y - 90, "BLIND MISS", "#88eaff");
            return false;
        }

        // Ascension flat-damage twist: brittle hull
        if (this instanceof Player && Game._ascEffects && Game._ascEffects.incomingFlat > 0 && actualDmg > 0) {
            actualDmg += Game._ascEffects.incomingFlat;
        }

        const overcharge = this.hasEffect('overcharge');
        if (overcharge) {
            const modifier = overcharge.val > 0 ? 2.0 : 1.5;
            actualDmg = Math.floor(actualDmg * modifier);
        }
        
        if (this.hasEffect('frail')) {
            actualDmg = Math.floor(actualDmg * 1.3);
        }

        // Blood Pact: player's outgoing attacks deal +50%.
        if (source instanceof Player && source.hasRelic('c_blood_pact')) {
            actualDmg = Math.floor(actualDmg * 1.5);
        }
        // Entropy: enemy attacks on the player deal +50% (paired with -20% enemy HP at combat start).
        const isEnemyAttack = source && !(source instanceof Player) && !(source instanceof Minion && source.isPlayerSide);
        if (this instanceof Player && this.hasRelic('c_entropy') && isEnemyAttack) {
            actualDmg = Math.floor(actualDmg * 1.5);
        }

        // --- NEW: ARMOR PLATING (90% Reduction) ---
        if (this.armorPlating > 0) {
             actualDmg = Math.floor(actualDmg * 0.1); // Take 10%, mitigate 90%
             this.armorPlating--;
             ParticleSys.createFloatingText(this.x, this.y - 80, `ARMOR (${this.armorPlating})`, "#ffaa00");
             // Play metallic sound? Re-using 'defend' for now
             AudioMgr.playSound('defend');
        }
        // ------------------------------------------

        if (this.shield > 0 && !bypassShield) {
            const shieldWas = this.shield;
            // Compiler phase 3 — armor-projectile mode: attacks from the
            // Compiler in its shrapnel phase pierce half of the victim's
            // shield. Halve the effective shield for this absorption pass
            // then put the untouched half back after resolve.
            let effShield = this.shield;
            let pierced = 0;
            if (source && source.armorProjectileMode && source.name === 'THE COMPILER') {
                pierced = Math.floor(this.shield * 0.5);
                effShield = this.shield - pierced;
                if (pierced > 0) ParticleSys.createFloatingText(this.x, this.y - 140, "SHELL PIERCED", '#ff4500');
            }
            if (effShield >= actualDmg) {
                this.shield = pierced + (effShield - actualDmg);
                actualDmg = 0;
            } else {
                actualDmg -= effShield;
                this.shield = pierced;
            }
            // Shield just broke this hit — pop a glass-shatter VFX/SFX
            // so the collapse reads, and shake for impact.
            if (shieldWas > 0 && this.shield === 0) {
                ParticleSys.createShockwave(this.x, this.y, COLORS.SHIELD, 24);
                ParticleSys.createSparks(this.x, this.y, COLORS.SHIELD, 14);
                ParticleSys.createFloatingText(this.x, this.y - 120, "SHIELD DOWN", COLORS.SHIELD);
                AudioMgr.playSound('grid_fracture');
                if (Game && Game.shake) Game.shake(4);
                if (Player && this instanceof Player) Hints.trigger('first_shield_break');
            }
            // Coolant Loop: shield just broke this hit → heal per stack.
            if (this instanceof Player && shieldWas > 0 && this.shield === 0 && this.hasRelic('coolant_loop')) {
                const stacks = this.relics.filter(r => r.id === 'coolant_loop').length;
                this.heal(2 * stacks);
                ParticleSys.createFloatingText(this.x, this.y - 100, "COOLANT +" + (2 * stacks), COLORS.SHIELD);
            }
            // Sentinel trait: shield-break counterattack retaliates against the attacker.
            if (this instanceof Player && shieldWas > 0 && this.shield === 0 && this.traits && this.traits.shieldCounter) {
                const retaliateDmg = this.traits.shieldCounter;
                const target = source || (Game && Game.enemy);
                if (target && target.currentHp > 0 && target !== this) {
                    ParticleSys.createFloatingText(this.x, this.y - 140, `COUNTER ${retaliateDmg}`, '#ffffff');
                    if (target.takeDamage(retaliateDmg)) _resolveEnemyKill(target);
                }
            }
        }

        // Firewall — reactive softening: when you take a 30+ damage hit,
        // block 15 of it and gain 15 Shield back. Once per combat per stack
        // (stacks raise both the block and the shield refund, and allow
        // re-triggering within the same fight).
        if (this instanceof Player && this.hasRelic('firewall') && actualDmg >= 30) {
            const stacks = this.relics.filter(r => r.id === 'firewall').length;
            const triggersUsed = this._firewallTriggersUsed || 0;
            if (triggersUsed < stacks) {
                const block = 15 + (stacks - 1) * 5;
                const shieldGain = 15 + (stacks - 1) * 5;
                actualDmg = Math.max(0, actualDmg - block);
                this.addShield && this.addShield(shieldGain, { silent: true });
                this._firewallTriggersUsed = triggersUsed + 1;
                ParticleSys.createFloatingText(this.x, this.y - 140, `FIREWALL -${block}`, COLORS.SHIELD);
                ParticleSys.createFloatingText(this.x, this.y - 170, `+${shieldGain} SHIELD`, COLORS.SHIELD);
                AudioMgr.playSound('defend');
            }
        }
        
        if (this instanceof Player && this.traits.vulnerable && actualDmg > 0) {
            actualDmg += 1;
        }
        
        // Hologram: 15% Dodge — routed through Game._luckyChance so
        // Ascension 17 (Aurelia's Curse) halves it as advertised.
        if (this instanceof Player && this.hasRelic('hologram')
            && Game && Game._luckyChance && Game._luckyChance(0.15)) {
            actualDmg = 0;
            ParticleSys.createFloatingText(this.x, this.y - 60, "DODGE!", "#fff");
            // Relic: REFLECTION GLASS — dodging an attack deals 8 DMG back.
            if (this.hasRelic('reflection_glass')) {
                const target = source || (Game && Game.enemy);
                if (target && target.currentHp > 0 && target !== this) {
                    const stacks = this.relics.filter(r => r.id === 'reflection_glass').length;
                    ParticleSys.createFloatingText(this.x, this.y - 100, `GLASS ${8 * stacks}`, "#aaffff");
                    if (target.takeDamage(8 * stacks)) _resolveEnemyKill(target);
                }
            }
        }

        // Phase 3: Training Dummy is unkillable until the player reaches the final tutorial step.
        if (this.isTutorialDummy && Game.tutorialStep < 12 && (this.currentHp - actualDmg) <= 0) {
            actualDmg = Math.max(0, this.currentHp - 1);
            ParticleSys.createFloatingText(this.x, this.y - 80, "TRAINING", COLORS.MANA);
        }

        // Expansion (5.2.1) — Data Mite burrow: survive a fatal hit once by
        // going underground for 2 full idle turns, re-emerging with a heavy
        // strike on turn 3. Initial value is 3 because generateSingleIntent
        // decrements BEFORE the idle/resurge check each turn, so the sequence
        // is: set=3 → tick→2 idle → tick→1 idle → tick→0 resurge.
        if (Enemy && this instanceof Enemy && this.kind === 'burrow' && !this.burrowed && actualDmg >= this.currentHp) {
            actualDmg = Math.max(0, this.currentHp - 1);
            this.burrowed = true;
            this.burrowTurns = 3;
            ParticleSys.createFloatingText(this.x, this.y - 120, "BURROWED", "#886655");
        }
        // Expansion (5.2.1) — Echo clone on first hit.
        if (Enemy && this instanceof Enemy && this.kind === 'clone' && !this.cloneFired && actualDmg > 0 && Minion && Game.enemy) {
            this.cloneFired = true;
            for (let i = 0; i < 2; i++) {
                const c = new Minion(this.x + (i === 0 ? -120 : 120), this.y + 40, (this.minions.length + i + 1), false, 1);
                c.name = "Echo Shard";
                c.maxHp = Math.max(12, Math.floor(this.maxHp * 0.35));
                c.currentHp = c.maxHp;
                c.dmg = Math.max(3, Math.floor(this.baseDmg * 0.5));
                c.spawnTimer = 0.8;
                this.minions.push(c);
            }
            ParticleSys.createFloatingText(this.x, this.y - 150, "ECHO SPLIT", "#88eaff");
        }

        // Boss phase clamp — a boss can only be killed once it's in its
        // FINAL phase. Attacks that would drop a Phase 1 boss past the
        // 50% threshold get clamped so Phase 2 always triggers; same for
        // Phase 2 → Phase 3 at the 20% line. Keeps the fantasy honest:
        // every boss gets all three phases on-screen, and a lucky 1-shot
        // can't skip a phase.
        if (Enemy && this instanceof Enemy && this.isBoss && actualDmg > 0) {
            const nextHp = this.currentHp - actualDmg;
            const p2Floor = Math.ceil(this.maxHp * 0.5) - 1;
            const p3Floor = Math.ceil(this.maxHp * 0.2) - 1;
            if (this.phase === 1 && nextHp < this.maxHp * 0.5) {
                // Drop exactly INTO phase 2 range; checkPhase runs below.
                this.currentHp = Math.max(0, p2Floor);
            } else if (this.phase === 2 && nextHp < this.maxHp * 0.2) {
                this.currentHp = Math.max(0, p3Floor);
            } else {
                this.currentHp = Math.max(0, nextHp);
            }
        } else {
            this.currentHp = Math.max(0, this.currentHp - actualDmg);
        }

        // Immediately check for phase transition so a big hit that drops
        // the boss through a threshold plays the cinematic on the same
        // damage tick — no waiting for the player's next die use.
        if (Enemy && this instanceof Enemy && this.isBoss && typeof this.checkPhase === 'function') {
            this.checkPhase();
        }

        // Track the player's highest damage dealt so Mirror enemies can
        // reflect it on their next intent.
        if (Game && Game.player && source instanceof Player && actualDmg > 0) {
            Game.player._lastDamageDealt = Math.max(Game.player._lastDamageDealt || 0, actualDmg);
        }

        // Expansion (5.2.1) — Phage Pod death explosion.
        if (Enemy && this instanceof Enemy && this.kind === 'detonator' && this.currentHp <= 0 && !this._detonated) {
            this._detonated = true;
            const boom = Math.max(8, Math.floor(this.maxHp / 3));
            ParticleSys.createExplosion(this.x, this.y, 50, "#7fff00");
            ParticleSys.createFloatingText(this.x, this.y - 140, `DETONATE ${boom}`, "#7fff00");
            AudioMgr.playSound('explosion');
            // If the explosion kills the player mid-attack sequence we must
            // trigger gameOver here — the outer attacker flow only checks the
            // primary target's death and would otherwise call winCombat() on a
            // corpse, clobbering the death screen.
            if (Game.player) {
                const playerDied = Game.player.takeDamage(boom);
                if (playerDied && Game.player.currentHp <= 0 && Game.gameOver) {
                    Game.gameOver();
                }
            }
            if (Game.shake) Game.shake(16);
        }

        if (this instanceof Player && Game.haptic) {
            Game.haptic(actualDmg >= 30 ? 'heavy' : 'damage');
        }

        this.playAnim('shake');
        // Phase E: damage-scaled impact VFX. When the player or an allied
        // minion takes damage from an enemy, tint the impact with the sector's
        // enemy-projectile color so each zone's hits feel different.
        const particleCount = Math.min(45, 12 + Math.floor(actualDmg * 0.6));
        let impactColor = '#fff';
        let shockColor = '#ffffff';
        if (this instanceof Player || (this instanceof Minion && this.isPlayerSide)) {
            const enemySource = source && Game && Game._sourceIsEnemy && Game._sourceIsEnemy(source);
            if (enemySource) {
                impactColor = Game._sectorEnemyProjectileColor ? Game._sectorEnemyProjectileColor() : '#f00';
                shockColor = impactColor;
            } else {
                impactColor = '#f00';
                shockColor = '#ff4444';
            }
        }
        ParticleSys.createExplosion(this.x, this.y, particleCount, impactColor);
        // Sparks on every meaningful hit — tapered streaks fan outward for
        // a visceral "physical contact" feel. Count scales with damage.
        if (actualDmg > 0 && ParticleSys.createSparks) {
            const sparkCount = Math.min(14, 4 + Math.floor(actualDmg * 0.25));
            ParticleSys.createSparks(this.x, this.y, impactColor, sparkCount);
        }
        if (actualDmg >= 30) {
            ParticleSys.createShockwave(this.x, this.y, shockColor, 28);
        }
        
        if (actualDmg > 0) {
             this.flashTimer = 0.2;
             // Enemy-side hit-stop — small but it makes hits feel decisive (skip if player is the target since they get a bigger hit-stop above).
             // Heavy/catastrophic hits get a meaningful freeze for impact.
             if (!(this instanceof Player) && Game.hitStop) {
                 let hs = Math.min(80, 25 + actualDmg * 0.6);
                 if (actualDmg >= 100) hs = 200;
                 else if (actualDmg >= 30) hs = Math.max(hs, 110);
                 Game.hitStop(hs);
             }
             // Tiered damage text — chip / solid / heavy / catastrophic.
             // Pass source attribution so multi-target combat stays legible:
             // white for the player's hits, cyan for their minions, red for
             // enemy hits landing on the player side.
             let sourceKind;
             if (source instanceof Player) sourceKind = 'player';
             else if (Minion && source instanceof Minion && source.isPlayerSide) sourceKind = 'minion';
             else if ((Enemy && source instanceof Enemy) || (Minion && source instanceof Minion && !source.isPlayerSide)) sourceKind = 'enemy';
             const dmgTier = ParticleSys.createDamageText(this.x, this.y, actualDmg, this instanceof Player, sourceKind);
             // Pitch-shifted + gain-scaled hit sample per tier so chip pings
             // and catastrophic crunches feel audibly distinct.
             AudioMgr.playHit(dmgTier);
             // Heavy hits earn a screen flash even on enemies for the pop.
             if (dmgTier === 'catastrophic' && Game.triggerScreenFlash) {
                 Game.triggerScreenFlash('rgba(255,220,80,0.35)', 200);
                 // Side-chain the music a notch so the impact cuts through.
                 if (AudioMgr.duck) AudioMgr.duck(0.3, 220);
             }
             if (Game.logCombatEvent) {
                 Game.logCombatEvent({
                     type: 'damage',
                     targetName: this.name,
                     amount: actualDmg,
                     tier: dmgTier,
                     sourceName: source ? source.name : null
                 });
             }
             
             if (this instanceof Enemy && this.glitchMod && this.glitchMod.id === 'thorns' && source instanceof Player) {
                 source.takeDamage(2);
                 ParticleSys.createFloatingText(source.x, source.y - 80, "GLITCH REFLECT", "#ff00ff");
             }

             // Null Pointer phase 2 — voidling shared HP. Damage to one
             // splashes 50% to each sibling. Siblings take raw damage (no
             // shield recurse) so the splash feels like a linked pool, not
             // a chain of discrete hits. Suppress if this IS the splash
             // (via _voidSplashing flag on source) to prevent recursion.
             if (this instanceof Minion && !this.isPlayerSide && actualDmg > 0
                 && Game.enemy && Game.enemy.name === 'NULL_POINTER'
                 && Game.enemy.voidShared && !source?._voidSplashing) {
                 const splash = Math.floor(actualDmg * 0.5);
                 if (splash > 0 && Array.isArray(Game.enemy.minions)) {
                     Game.enemy.minions.forEach(sib => {
                         if (sib !== this && sib.currentHp > 0) {
                             sib.currentHp = Math.max(0, sib.currentHp - splash);
                             ParticleSys.createFloatingText(sib.x, sib.y - 60, `VOID LINK -${splash}`, '#ff00ff');
                         }
                     });
                 }
             }
        } else {
             if (amount > 0 && !suppressBlockText) ParticleSys.createFloatingText(this.x, this.y - 60, "BLOCKED", COLORS.SHIELD);
             AudioMgr.playSound('defend');
        }

        if(this instanceof Player && actualDmg > 0) {
            // Notify class abilities that the player just lost HP — Bloodstalker
            // uses this to fill the Blood Pool.
            ClassAbility.onEvent('damage_taken', { amount: actualDmg, source });
            // Tier-aware shake (replaces flat magnitude) — scales with damage % of max HP
            if (Game.shakeFromDamage) Game.shakeFromDamage(actualDmg);
            else Game.shake(Math.min(22, 4 + actualDmg / 3));
            // Player-side hit-stop — proportional to damage, capped at 90ms
            const hsMs = Math.min(90, 30 + actualDmg * 1.6);
            if (Game.hitStop) Game.hitStop(hsMs);
            // Brutal hit (>50% maxHp) → red screen flash
            if (actualDmg / Math.max(1, this.maxHp) > 0.5 && Game.triggerScreenFlash) {
                Game.triggerScreenFlash('rgba(255, 40, 80, 0.45)', 260);
            }
            // Heavier haptic the bigger the hit — feels physical.
            if (Game.haptic) Game.haptic(actualDmg >= 25 ? 'warn' : actualDmg >= 12 ? 'heavy' : 'hit');
            
             // Relic: Double Edge (Reflect 30%)
             if(this.hasRelic('spike_armor')) {
                const stacks = this.relics.filter(r => r.id === 'spike_armor').length;
                const reflectPct = 0.3 * stacks; // 30% per stack
                const reflectDmg = Math.max(1, Math.floor(actualDmg * reflectPct));
                
                const target = source || Game.enemy;
                
                if (target && target.currentHp > 0) {
                    ParticleSys.createFloatingText(this.x, this.y - 120, `REFLECT ${reflectDmg}`, COLORS.GOLD);
                    
                    if(target.takeDamage(reflectDmg)) {
                        if (target === Game.enemy) {
                            Game.winCombat();
                        } else {
                            Game.enemy.minions = Game.enemy.minions.filter(m => m !== target);
                            if(Game.player.hasRelic('brutalize') && !target.isPlayerSide) {
                                Game.triggerBrutalize(target);
                            }
                        }
                    }
                }
            }
            
            // Relic: RETALIATOR — after taking 20+ DMG in one hit, deal 10 DMG back.
            if (this.hasRelic('retaliator') && actualDmg >= 20) {
                const target = source || Game.enemy;
                if (target && target.currentHp > 0 && target !== this) {
                    const stacks = this.relics.filter(r => r.id === 'retaliator').length;
                    ParticleSys.createFloatingText(this.x, this.y - 130, `RETALIATE ${10 * stacks}`, "#ff3333");
                    if (target.takeDamage(10 * stacks)) _resolveEnemyKill(target);
                }
            }

            // Corrupted: MIRROR SHARD — 50% of damage taken is also dealt to a random enemy.
            if (this.hasRelic('c_mirror_shard') && actualDmg > 0 && Game) {
                const pool = [Game.enemy, ...(Game._enemyMinions ? Game._enemyMinions() : [])].filter(e => e && e.currentHp > 0);
                if (pool.length > 0) {
                    const victim = pool[Math.floor(Math.random() * pool.length)];
                    const mirror = Math.max(1, Math.floor(actualDmg * 0.5));
                    ParticleSys.createFloatingText(victim.x, victim.y - 110, `MIRROR ${mirror}`, "#cc00ff");
                    if (victim.takeDamage(mirror)) _resolveEnemyKill(victim);
                }
            }

            // Relic: Emergency Kit (Consumable)
            if (this.currentHp < (this.maxHp * 0.3)) {
                const kitIndex = this.relics.findIndex(r => r.id === 'emergency_kit');
                if (kitIndex !== -1) {
                    const healAmt = Math.floor(this.maxHp * 0.3); // Heal 30%
                    this.heal(healAmt);
                    this.relics.splice(kitIndex, 1); // Consume
                    Game.renderRelics(); 
                    ParticleSys.createFloatingText(this.x, this.y - 140, "KIT USED", COLORS.NATURE_LIGHT);
                }
            }
        }
        
        if (this.currentHp <= 0 && this instanceof Enemy && this.glitchMod && this.glitchMod.id === 'volatile') {
            Game.player.takeDamage(15);
            ParticleSys.createExplosion(this.x, this.y, 50, "#ff0000");
            ParticleSys.createFloatingText(this.x, this.y, "GLITCH EXPLOSION", "#ff00ff");
            Game.shake(15);
        }

        // Elite affix: Reflector — 50% of damage taken is reflected back at source.
        if (this instanceof Enemy && this.affixes && this.affixes.includes('Reflector') && actualDmg > 0 && source && source !== this) {
            const reflect = Math.max(1, Math.floor(actualDmg * 0.5));
            ParticleSys.createFloatingText(this.x, this.y - 120, `REFLECT ${reflect}`, "#ff88cc");
            if (source.takeDamage(reflect)) _resolveEnemyKill(source);
        }

        // Elite affix: Vampiric — heals for 50% of damage it deals.
        if (source instanceof Enemy && source.affixes && source.affixes.includes('Vampiric') && actualDmg > 0) {
            const heal = Math.max(1, Math.floor(actualDmg * 0.5));
            source.currentHp = Math.min(source.maxHp, source.currentHp + heal);
            ParticleSys.createFloatingText(source.x, source.y - 120, `VAMPIRIC +${heal}`, "#ff2255");
        }

        // Elite affix: Multiplier — first hit spawns a low-HP duplicate to fight alongside.
        if (this instanceof Enemy && this.affixes && this.affixes.includes('Multiplier') && !this.multiplierTriggered && actualDmg > 0) {
            this.multiplierTriggered = true;
            if (Minion && Game.enemy && Game.enemy.minions) {
                const cloneHp = Math.max(6, Math.floor(this.maxHp * 0.35));
                const clone = new Minion(this.x + 140, this.y + 20, Game.enemy.minions.length + 1, false, 1);
                clone.name = 'Echo';
                clone.maxHp = cloneHp; clone.currentHp = cloneHp;
                clone.dmg = Math.max(2, Math.floor((this.baseDmg || 4) * 0.5));
                Game.enemy.minions.push(clone);
                ParticleSys.createFloatingText(this.x, this.y - 180, "MULTIPLIER", "#ff88ff");
            }
        }

        // Elite affix: Anchor — while any Anchor enemy is alive, player minions
        // can't die this hit (HP floors at 1).
        if (this instanceof Minion && this.isPlayerSide && this.currentHp <= 0) {
            const anchorAlive = Game.enemy && (
                (Game.enemy.affixes && Game.enemy.affixes.includes('Anchor') && Game.enemy.currentHp > 0) ||
                (Game.enemy.minions || []).some(m => m && m.affixes && m.affixes.includes('Anchor') && m.currentHp > 0)
            );
            if (anchorAlive) {
                this.currentHp = 1;
                ParticleSys.createFloatingText(this.x, this.y - 120, "ANCHORED", "#ffdd33");
            }
        }

        // Med Dispenser: heal player when an enemy (or enemy minion) is killed by player damage.
        const diedByPlayer = this.currentHp <= 0 && source && (source instanceof Player || (source instanceof Minion && source.isPlayerSide));
        const killedTargetIsHostile = (this instanceof Enemy) || (this instanceof Minion && !this.isPlayerSide);

        // Bloodstalker class rework: Blood Tier ramps on every kill; each tier
        // grants +1 lifesteal via traits.bloodTierLifestealBonus (see Game.player.bloodTier reader in useDie).
        if (diedByPlayer && killedTargetIsHostile && Game.player && Game.player.traits && Game.player.traits.bloodTierPerKill > 0) {
            Game.player.bloodTier = (Game.player.bloodTier || 0) + Game.player.traits.bloodTierPerKill;
            ParticleSys.createFloatingText(Game.player.x, Game.player.y - 150, `BLOOD TIER ${Game.player.bloodTier}`, '#ff2244');
        }
        if (diedByPlayer && killedTargetIsHostile && Game.player && Game.player.hasRelic('med_dispenser')) {
            const stacks = Game.player.relics.filter(r => r.id === 'med_dispenser').length;
            Game.player.heal(3 * stacks);
            ParticleSys.createFloatingText(Game.player.x, Game.player.y - 100, "MED +" + (3 * stacks), COLORS.NATURE_LIGHT);
        }

        // Run stats tracking — damage taken (player side) for the victory
        // breakdown. Counts only actual HP hits, not blocked damage.
        if (Game.runStats && this instanceof Player && actualDmg > 0) {
            Game.runStats.damageTaken = (Game.runStats.damageTaken || 0) + actualDmg;
        }

        // Run stats tracking (player-dealt damage + kills)
        if (Game.runStats && source instanceof Player && killedTargetIsHostile) {
            Game.runStats.totalDamage = (Game.runStats.totalDamage || 0) + actualDmg;
            if (actualDmg > (Game.runStats.highestHit || 0)) {
                Game.runStats.highestHit = actualDmg;
            }
            if (diedByPlayer) {
                Game.runStats.kills = (Game.runStats.kills || 0) + 1;
                if (typeof window !== 'undefined' && window.Achievements) {
                    window.Achievements.unlock('FIRST_KILL');
                }
            }
            // Damage-tier achievements
            if (typeof window !== 'undefined' && window.Achievements) {
                if (actualDmg >= 50)  window.Achievements.unlock('BIG_HIT_50');
                if (actualDmg >= 100) window.Achievements.unlock('BIG_HIT_100');
                if (actualDmg >= 250) window.Achievements.unlock('BIG_HIT_250');
            }
        }
        // Per-turn stats for end-of-turn summary
        if (Game.turnStats) {
            if (this instanceof Player && actualDmg > 0) Game.turnStats.dmgTaken += actualDmg;
            if (source instanceof Player && killedTargetIsHostile && actualDmg > 0) Game.turnStats.dmgDealt += actualDmg;
        }

        return this.currentHp <= 0;
    }

    // Apply outgoing-damage debuffs (Constrict/Digital Rot, Weak) to a base
    // attack value. Shared between enemy-side minions (direct attacks),
    // player-side minions (dart VFX resolves their hits), and the hover
    // tooltip so the displayed Atk always matches what the minion will
    // actually deal. Overridden on Enemy to stack the Brittle affix.
    getEffectiveDamage(baseVal) {
        let dmg = (baseVal !== undefined) ? baseVal : (this.dmg || 0);
        const constrict = this.hasEffect('constrict');
        if (constrict) dmg = Math.floor(dmg * (constrict.val ?? 1));
        const weak = this.hasEffect('weak');
        if (weak) dmg = Math.floor(dmg * 0.5);
        return Math.max(0, dmg);
    }

    heal(amount) {
        let actualHeal = amount;

        const constrict = this.hasEffect('constrict');
        if (constrict) {
            actualHeal = Math.floor(actualHeal * constrict.val);
            ParticleSys.createFloatingText(this.x, this.y - 100, "HEAL REDUCED", "#ff0000");
        }

        actualHeal = Math.max(0, actualHeal);

        // Ascension 14 (Conservation Law) — overheal becomes a bleed DoT on
        // the player. Computed BEFORE the cap so we know how much heal the
        // player actually consumed vs threw away. Applied after the cap so
        // the heal numbers + flash still read normally first.
        let overheal = 0;
        if (Player && this instanceof Player && actualHeal > 0
            && Game && Game._ascEffects && Game._ascEffects.overhealBecomesDot) {
            overheal = Math.max(0, (this.currentHp + actualHeal) - this.maxHp);
        }

        this.currentHp = Math.min(this.maxHp, this.currentHp + actualHeal);

        ParticleSys.createFloatingText(this.x, this.y - 80, "+" + actualHeal, '#0f0');
        AudioMgr.playSound('mana');
        if (Player && this instanceof Player && actualHeal > 0) {
            Hints.trigger('first_heal');
        }

        if (overheal > 0) {
            // Cap the per-heal bleed so a chain of small overheals still
            // matters but a single huge overheal doesn't one-shot the player.
            const tick = Math.max(1, Math.min(8, Math.ceil(overheal / 4)));
            this.addEffect('bleed', 3, tick, '🩸',
                `Overheal sickness — ${tick} DMG at end of turn.`, 'OVERHEAL ROT');
            ParticleSys.createFloatingText(this.x, this.y - 120, `OVERHEAL → ROT ${tick}`, '#ff3333');
        }
    }

    addShield(amount, { force = false, silent = false } = {}) {
        // Void Shell: once the startup 30 shield is granted (with force=true),
        // the player cannot gain further shield from cards/relics during the run.
        if (!force && this instanceof Player && this.hasRelic('c_void_shell')) {
            ParticleSys.createFloatingText(this.x, this.y - 80, "SHIELD BLOCKED", "#555");
            return;
        }
        // Bloodstalker thralls don't wear armour — the class fantasy is flesh
        // paying the cost, not metal. Any would-be shield (Bulwark augments,
        // Sentinel shield-on-defend bonuses, relic payouts, forced startup
        // shields, etc.) feeds the minion's HP pool instead so the thrall
        // ends up larger rather than over-shielded.
        if (amount > 0 && Minion && this instanceof Minion && this.isPlayerSide
            && Game && Game.player && Game.player.classId === 'bloodstalker') {
            this.maxHp += amount;
            this.currentHp += amount;
            this.playAnim('pulse');
            ParticleSys.createFloatingText(this.x, this.y - 60, `+${amount} HP`, '#ff2244');
            return;
        }
        this.shield += amount;
        this.playAnim('pulse');
        // Shield-gain chime — a pitched "click" reads as the metallic plate
        // clicking into place. Silent flag suppresses it for inherent combat-
        // start shields so we don't double-cue with the combat boot sound.
        if (!silent && amount > 0) {
            AudioMgr.playSound('click', { playbackRate: 0.7, volume: 0.8 });
        }
        // Class-ability: broadcast to Sentinel SHIELD WALL when the player gains shield.
        // `silent` suppresses the broadcast so inherent class-start shield (Sentinel's
        // startShield trait) doesn't pre-charge the glyph widget on combat open.
        if (!silent && this instanceof Player && amount > 0) {
            ClassAbility.onEvent('shield_gained', { amount });
        }
        // Relic: KINETIC BATTERY — every 3 shields gained → +1 Reroll.
        if (!silent && this instanceof Player && amount > 0 && this.hasRelic('kinetic_battery') && Game) {
            this._kineticCounter = (this._kineticCounter || 0) + amount;
            const rolls = Math.floor(this._kineticCounter / 3);
            if (rolls > 0) {
                this._kineticCounter -= rolls * 3;
                Game.rerolls = (Game.rerolls || 0) + rolls;
                ParticleSys.createFloatingText(this.x, this.y - 140, `KINETIC +${rolls} REROLL`, '#00f3ff');
            }
        }
    }

    addEffect(id, duration, val, icon, desc, displayName = null) {
        const existing = this.effects.find(e => e.id === id);
        const name = displayName || id.toUpperCase();

        if (existing) {
            existing.duration = Math.max(existing.duration, duration);

            if (displayName) {
                existing.name = displayName;
            }

            if (id === 'constrict') {
                existing.val = existing.val * val;
                ParticleSys.createFloatingText(this.x, this.y - 120, "EFFECT STACKED", "#ff00ff");
            }
            else if (id === 'weak') {
                 if (val < existing.val) existing.val = val;
            }
            else if (id === 'bleed' || id === 'poison') {
                // DoT stacks up to 3. Per-stack value tracks the highest single
                // application so a stronger source elevates the floor; total
                // tick damage = val * stacks.
                const cap = 3;
                existing.stacks = Math.min(cap, (existing.stacks || 1) + 1);
                if (val > existing.val) existing.val = val;
                const stackColor = id === 'poison' ? '#88ff00' : '#ff3333';
                ParticleSys.createFloatingText(this.x, this.y - 120, `${name} x${existing.stacks}`, stackColor);
            }
            else {
                 if (val > existing.val) existing.val = val;
            }
        } else {
            const eff = { id, duration, val, icon, desc, name: name };
            if (id === 'bleed' || id === 'poison') eff.stacks = 1;
            this.effects.push(eff);
            ParticleSys.createFloatingText(this.x, this.y - 100, name, '#ff00ff');
        }

        // If this debuff changes outgoing damage (weak) or healing (constrict)
        // and it landed on the active enemy, re-bake nextIntents so the
        // already-queued attack reflects the reduced value in the UI AND when
        // the attack resolves. Without this, `effectiveVal` was computed
        // before the debuff landed and the enemy hits at full strength.
        if (Enemy && this instanceof Enemy && typeof this.updateIntentValues === 'function') {
            if (id === 'weak' || id === 'constrict' || id === 'frail') {
                this.updateIntentValues();
            }
        }
    }

    updateEffects() {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.duration--;

            // Damage-over-time ticks. Bleed/poison deal `val * stacks` damage
            // at end of turn for each remaining duration unit. Skip if the
            // entity is already dead from a prior tick this loop.
            if ((e.id === 'bleed' || e.id === 'poison') && this.currentHp > 0 && e.val > 0) {
                const stacks = e.stacks || 1;
                const tickDmg = e.val * stacks;
                const color = e.id === 'poison' ? '#88ff00' : '#ff3333';
                ParticleSys.createFloatingText(this.x, this.y - 80, `${e.id === 'poison' ? 'POISON' : 'BLEED'} ${tickDmg}`, color);
                const isDead = this.takeDamage(tickDmg, null, true);
                if (isDead) {
                    if (this === Game.enemy) Game.winCombat();
                    else if (Game.enemy && Game.enemy.minions && Game.enemy.minions.includes(this)) {
                        Game.enemy.minions = Game.enemy.minions.filter(m => m !== this);
                    } else if (Game.player && Game.player.minions && Game.player.minions.includes(this)) {
                        Game.player.minions = Game.player.minions.filter(m => m !== this);
                    }
                }
            }

            if (e.id === 'voodoo' && e.duration <= 0) {
                // Trigger Visual
                Game.triggerVFX('voodoo_hit', null, this);
                
                // Delay damage to sync with visual
                setTimeout(() => {
                    let dmg = e.val;
                    if (dmg === 0) { 
                        // FIX: Updated Base to 150
                        let base = 150; 
                        // Logic: 50% chance for 500 (Critical Curse)
                        if (Math.random() < 0.5) {
                            base = 500;
                            ParticleSys.createFloatingText(this.x, this.y - 50, "VOID CRUSH!", "#f00");
                        }
                        dmg = Game.calculateCardDamage(base);
                    }
                    
                    const isDead = this.takeDamage(dmg);
                    ParticleSys.createFloatingText(this.x, this.y, "CURSE TRIGGERED!", "#f00");

                    if (isDead) {
                        if (this === Game.enemy) {
                            Game.winCombat();
                        } 
                        else if (Game.enemy && Game.enemy.minions.includes(this)) {
                            Game.enemy.minions = Game.enemy.minions.filter(m => m !== this);
                        } 
                        else if (Game.player && Game.player.minions.includes(this)) {
                            Game.player.minions = Game.player.minions.filter(m => m !== this);
                        }
                    }
                }, 300);
            }
        }
        this.effects = this.effects.filter(e => e.duration > 0);
    }

    hasEffect(id) {
        return this.effects.find(e => e.id === id);
    }

    playAnim(type) {
        // Per-type duration so lunges feel weightier than shakes.
        const durations = { lunge: 22, shake: 12, pulse: 18, windup: 15 };
        const t = durations[type] ?? 15;
        this.anim.type = type;
        this.anim.timer = t;
        this.anim.maxTimer = t;
    }
}

export { Entity };
