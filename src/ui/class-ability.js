// Class Ability Widget
// One active, class-unique mechanic that lives between the reroll and end-phase
// corner buttons during combat. Each of the six player classes gets its own
// interactive widget. Balance values are picked to be useful early (30 HP) and
// still meaningful late (post-relic stacks, sector 5).
//
// Integration points (called from src/game.js):
//   ClassAbility.init(Game)                — once on load, caches the Game ref
//   ClassAbility.startCombat()             — combat start; rebuilds DOM for player.classId
//   ClassAbility.endCombat()               — combat end; hides widget, clears state
//   ClassAbility.onTurnStart()             — player phase begins
//   ClassAbility.onTurnEnd()               — player pressed END PHASE
//   ClassAbility.onEvent(type, payload)    — game events ('dice_used', 'shield_gained', etc.)
//   ClassAbility.consumePreDamageBonus(t)  — additive dmg bonus for the current damage die
//   ClassAbility.consumeDamageMultiplier(t)— multiplicative dmg for the current damage die
//   ClassAbility.consumeAttackBlock()      — Sentinel: nullify the incoming enemy attack?

import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { ICONS } from './icons.js';
import { Hints } from '../services/hints.js';

// Balance constants in one place so they can be re-tuned without touching render code.
const CFG = {
    tactician: {
        pipMax: 3,
        shieldGain: 8,          // meaningful at 30 HP, also scales well
        rerollsGain: 1,
        attackBonus: 5,         // passes through calculateCardDamage → multiplies with relics
    },
    arcanist: {
        cycleMs: 700,            // time one glyph stays active before the next
        fireDmg: 12,             // via calculateCardDamage
        iceShield: 5,
        iceWeakTurns: 1,
        iceWeakVal: 0.5,         // halves enemy outgoing damage for 1 turn
        lightningRerolls: 1,
    },
    bloodstalker: {
        // Blood Pool — passively fills as the player takes damage. When full,
        // the player can spend HP for one of three "Blood Tribute" rewards.
        damageToFill: 10,        // total HP-loss needed to ready an offering
        minorPct: 0.05,          // 5% of max HP
        majorPct: 0.15,          // 15% of max HP
        grandPct: 0.30,          // 30% of max HP
        majorAttack: 20,         // direct damage to enemy
        majorBleed: 5,           // bleed value for 3 turns
        grandAttack: 40,
        grandBleed: 8,
        grandManaGain: 2,
        grandRerolls: 2,
    },
    annihilator: {
        heatPerDie: 10,
        yellowMin: 50, yellowMax: 79,
        redMin: 80,  redMax: 100,
        yellowMult: 1.4,         // +40% on next damage die
        redAoeDmg: 20,           // AoE via calculateCardDamage
        redSelfDmg: 5,
        autoVentDmg: 5,
    },
    sentinel: {
        shieldPerPlate: 6,
        plateMax: 3,
    },
    summoner: {
        plotCount: 3,
        growTurns: 3,            // Seed(0) → Sprout(1) → Bloom(2) → picked; ticks 1 per end-turn if any minion alive
    },
};

let Game = null;
let widgetEl = null;
let state = null;
let classId = null;
let arcanistTimer = null;

function $w() {
    if (!widgetEl) widgetEl = document.getElementById('class-ability-widget');
    return widgetEl;
}

// After dealing damage to an enemy from a class ability, resolve the kill
// immediately so combat ends mid-player-phase (instead of waiting for the
// enemy turn to notice the corpse). Returns true if the boss enemy died and
// the caller should bail out of further processing.
function _resolveKill(target) {
    if (!target || target.currentHp > 0) return false;
    if (Game && target === Game.enemy) {
        Game.winCombat();
        return true;
    }
    if (Game && Game.enemy && Game.enemy.minions && Game.enemy.minions.includes(target)) {
        Game.enemy.minions = Game.enemy.minions.filter(m => m !== target);
    }
    return false;
}

function show() { const el = $w(); if (el) el.classList.remove('hidden'); }
function hide() { const el = $w(); if (el) el.classList.add('hidden'); }

function _defaultState(cls) {
    switch (cls) {
        case 'tactician':    return { pips: 0, pendingAttackBonus: 0 };
        case 'arcanist':     return { activeGlyph: 0, usedThisTurn: false };
        case 'bloodstalker': return { bar: 0, ready: false };
        case 'annihilator':  return { heat: 0, pendingDmgMult: 0 };
        case 'sentinel':     return { plates: 0, blockReady: false, shieldBuffer: 0 };
        case 'summoner':     return { plots: [0, 0, 0] };
        default:             return null;
    }
}

// -------- public API --------

export const ClassAbility = {

    init(gameRef) {
        Game = gameRef;
    },

    startCombat() {
        if (!Game || !Game.player) return;
        classId = Game.player.classId || null;
        state = _defaultState(classId);
        if (!state) { hide(); return; } // unknown class — no widget
        this._build();
        this.render();
        show();
        // Arcanist's glyph cycle is always active — no "ready" trigger to
        // hook, so fire the tutorial hint on first combat start.
        if (classId === 'arcanist') {
            Hints.trigger && Hints.trigger('first_arcanist_glyph');
        }
    },

    endCombat() {
        classId = null;
        state = null;
        if (arcanistTimer) { clearInterval(arcanistTimer); arcanistTimer = null; }
        hide();
    },

    onTurnStart() {
        // If state was lost mid-combat (hot-reload, stray endCombat on a UI
        // overlay), rebuild from the current player class so the widget is
        // back by the time the player acts this turn.
        if (!state && Game && Game.player && Game.player.classId && Game.enemy) {
            this.startCombat();
            return;
        }
        if (!state) return;
        if (classId === 'arcanist') state.usedThisTurn = false;
        // Sentinel: plates + buffer persist across turns (slow-build combat tool).
        this.render();
    },

    onTurnEnd() {
        if (!state) return;
        // Annihilator: passive penalty if player lets the core hit 100%
        if (classId === 'annihilator' && state.heat >= 100) {
            if (Game.player) {
                Game.player.takeDamage(CFG.annihilator.autoVentDmg);
                ParticleSys.createFloatingText(Game.player.x, Game.player.y - 80, "OVERHEAT VENT", "#ff4400");
            }
            state.heat = 0;
        }
        // Summoner: grow plots if any minion is alive (discourages letting them all die)
        if (classId === 'summoner' && Game.player && Game.player.minions.length > 0) {
            state.plots = state.plots.map(p => Math.min(2, p + 1));
        }
        this.render();
    },

    onEvent(type, payload) {
        if (!state) return;
        if (classId === 'tactician' && type === 'dice_used') {
            // pipPerAttack trait (class rework): TAC_ATTACK builds pips faster
            // so the Command Track + reroll/draw synergy rewards aggressive play.
            const traits = (Game && Game.player && Game.player.traits) || {};
            const isTacAttack = payload && payload.type === 'TAC_ATTACK';
            const gain = (isTacAttack && traits.pipPerAttack > 0) ? traits.pipPerAttack : 1;
            const before = state.pips;
            state.pips = Math.min(CFG.tactician.pipMax, state.pips + gain);
            // First time the Command Track fills, surface what the widget does.
            if (before < CFG.tactician.pipMax && state.pips >= CFG.tactician.pipMax) {
                Hints.trigger && Hints.trigger('first_tactic_ready');
            }
        }
        // Summoner: player-minion SUMMON or UPGRADE (from any source — MINION
        // die, signature die, event, relic, class ability, starting spawn,
        // dice upgrades) immediately blooms the youngest unbloomed plot, so
        // the player can tap it for a Spirit / Amplify on the SAME turn the
        // trigger fired. This replaces the previous +1-stage-per-summon
        // model, which only fully bloomed plots via the end-of-turn passive
        // tick and left new Summoners wondering why nothing was usable.
        // EXCEPTION: when the summon was itself triggered by a bloom-tap
        // (this._suppressBloomOnTap), skip the auto-bloom — otherwise the
        // tap would refund itself by re-blooming a different plot, making
        // the bloom-summon free.
        if (classId === 'summoner' && (type === 'minion_summoned' || type === 'minion_upgraded')) {
            if (this._suppressBloomOnTap) {
                // Bloom-tap consumed the charge already; do NOT refund a
                // bloom on a different plot. Plot growth resumes naturally
                // via the end-of-turn tick.
            } else {
                // Pick the youngest plot so growth spreads across the grove rather
                // than stacking on a single already-bloomed plot.
                let youngestIdx = -1;
                for (let i = 0; i < state.plots.length; i++) {
                    if (state.plots[i] < 2 && (youngestIdx < 0 || state.plots[i] < state.plots[youngestIdx])) {
                        youngestIdx = i;
                    }
                }
                if (youngestIdx >= 0) {
                    state.plots[youngestIdx] = 2; // jump straight to Bloom
                    if (Game.player) {
                        ParticleSys.createFloatingText(Game.player.x - 60, Game.player.y - 40,
                            'BLOOM!', '#00ff99');
                    }
                    Hints.trigger && Hints.trigger('first_grove_bloom');
                }
            }
        }
        if (classId === 'annihilator' && type === 'dice_used') {
            const beforeHeat = state.heat;
            state.heat = Math.min(100, state.heat + CFG.annihilator.heatPerDie);
            // Zone-entry hints — yellow at 50, red at 80. One-time per install.
            if (beforeHeat < 50 && state.heat >= 50 && state.heat < 80) {
                Hints.trigger && Hints.trigger('first_overheat_yellow');
            }
            if (beforeHeat < 80 && state.heat >= 80) {
                Hints.trigger && Hints.trigger('first_overheat_red');
            }
        }
        if (classId === 'bloodstalker' && type === 'damage_taken') {
            // Blood Pool fills as the player loses HP. Once it tops up,
            // the three Tribute buttons unlock and the bar glows red.
            const amt = (payload && payload.amount) || 0;
            if (amt > 0 && !state.ready) {
                state.bar = Math.min(CFG.bloodstalker.damageToFill, state.bar + amt);
                if (state.bar >= CFG.bloodstalker.damageToFill) {
                    state.ready = true;
                    if (Game.player) {
                        ParticleSys.createFloatingText(Game.player.x, Game.player.y - 140, "BLOOD POOL READY", "#ff2244");
                    }
                    AudioMgr.playSound('heartbeat');
                    Hints.trigger && Hints.trigger('first_blood_pool');
                }
            }
        }
        if (classId === 'sentinel' && type === 'shield_gained') {
            // Running buffer — every `shieldPerPlate` shield earned across the combat
            // lights one plate. Buffer persists between turns.
            state.shieldBuffer = (state.shieldBuffer || 0) + (payload?.amount || 0);
            while (state.shieldBuffer >= CFG.sentinel.shieldPerPlate && state.plates < CFG.sentinel.plateMax) {
                state.shieldBuffer -= CFG.sentinel.shieldPerPlate;
                state.plates++;
            }
            if (state.plates >= CFG.sentinel.plateMax && !state.blockReady) {
                state.blockReady = true;
                AudioMgr.playSound('defend');
                if (Game.player) {
                    ParticleSys.createFloatingText(Game.player.x, Game.player.y - 120, "WALL READY", "#ffffff");
                }
                Hints.trigger && Hints.trigger('first_shield_wall');
            }
        }
        this.render();
    },

    // Non-consuming variants for tooltip previews.
    peekPreDamageBonus(dieType) {
        if (!state) return 0;
        let bonus = 0;
        if (classId === 'tactician' && state.pendingAttackBonus > 0 && dieType === 'ATTACK') {
            bonus += state.pendingAttackBonus;
        }
        return bonus;
    },
    peekDamageMultiplier(dieType) {
        if (!state) return 1;
        let mult = 1;
        if (classId === 'annihilator' && state.pendingDmgMult > 1 && isDamageDie(dieType)) {
            mult *= state.pendingDmgMult;
        }
        return mult;
    },

    // Called from useDie BEFORE damage is applied. Returns additive bonus.
    consumePreDamageBonus(dieType) {
        if (!state) return 0;
        let bonus = 0;
        if (classId === 'tactician' && state.pendingAttackBonus > 0 && dieType === 'ATTACK') {
            bonus += state.pendingAttackBonus;
            state.pendingAttackBonus = 0;
            ParticleSys.createFloatingText(Game.player.x, Game.player.y - 140, "TACTIC +" + CFG.tactician.attackBonus, "#00f3ff");
        }
        if (bonus > 0) this.render();
        return bonus;
    },

    // Called from useDie BEFORE damage. Returns multiplier >= 1.
    consumeDamageMultiplier(dieType) {
        if (!state) return 1;
        let mult = 1;
        if (classId === 'annihilator' && state.pendingDmgMult > 1 && isDamageDie(dieType)) {
            mult *= state.pendingDmgMult;
            ParticleSys.createFloatingText(Game.player.x, Game.player.y - 140, "OVERCLOCK", "#ff8800");
            state.pendingDmgMult = 0;
            this.render();
        }
        return mult;
    },

    // Called from Enemy.attack: if true, the attack is nullified.
    consumeAttackBlock() {
        if (!state) return false;
        if (classId === 'sentinel' && state.blockReady) {
            state.blockReady = false;
            state.plates = 0;
            state.shieldBuffer = 0;
            ParticleSys.createFloatingText(Game.player.x, Game.player.y - 120, "PERFECT BLOCK", "#ffffff");
            AudioMgr.playSound('defend');
            this.render();
            return true;
        }
        return false;
    },

    // Fired when the widget area is tapped. The widget figures out what was clicked.
    _onClick(e) {
        if (!state || !classId) return;
        const t = e.target.closest('[data-action]');
        if (!t) return;
        const action = t.dataset.action;
        e.preventDefault(); e.stopPropagation();
        if (AudioMgr.ctx && AudioMgr.ctx.state === 'suspended') AudioMgr.ctx.resume();
        AudioMgr.playSound('click');
        this._activate(action, t);
    },

    _activate(action, el) {
        const p = Game && Game.player;
        if (!p) return;
        switch (classId) {
            case 'tactician':
                if (state.pips < CFG.tactician.pipMax) return;
                if (action === 'tact-reroll') {
                    Game.rerolls += CFG.tactician.rerollsGain;
                    document.getElementById('reroll-badge').innerText = Game.rerolls;
                    ParticleSys.createFloatingText(p.x, p.y - 80, "+1 REROLL", "#00f3ff");
                } else if (action === 'tact-shield') {
                    p.addShield(CFG.tactician.shieldGain);
                    ParticleSys.createFloatingText(p.x, p.y - 80, `+${CFG.tactician.shieldGain} SHIELD`, "#00f3ff");
                    AudioMgr.playSound('defend');
                } else if (action === 'tact-dmg') {
                    state.pendingAttackBonus = CFG.tactician.attackBonus;
                    ParticleSys.createFloatingText(p.x, p.y - 80, "ATTACK PRIMED", "#00f3ff");
                } else return;
                state.pips = 0;
                // Class rework: drawOnPipSpend — every 3-pip spend adds an
                // extra die to next turn's hand. Capped at +3 so a player who
                // cascades multiple pip-spends in a single turn can't inflate
                // the hand past a sane layout budget.
                if (p.traits && p.traits.drawOnPipSpend > 0) {
                    const cur = p.bonusDrawNextTurn || 0;
                    const next = Math.min(3, cur + p.traits.drawOnPipSpend);
                    const delta = next - cur;
                    p.bonusDrawNextTurn = next;
                    if (delta > 0) {
                        ParticleSys.createFloatingText(p.x, p.y - 120, `+${delta} DIE NEXT TURN`, "#00f3ff");
                    }
                }
                break;

            case 'arcanist': {
                if (action !== 'arc-tap') return;
                if (state.usedThisTurn) return;
                // Snapshot what we need from `state` and commit the "used"
                // flag BEFORE firing — `_fire` deals damage that can trigger
                // a fatal Reflector/thorns counter, which calls gameOver →
                // endCombat → `state = null`. Writing to `state` after that
                // would throw.
                const glyph = state.activeGlyph;
                state.usedThisTurn = true;
                if      (glyph === 0) this._fire();
                else if (glyph === 1) this._ice();
                else                  this._lightning();
                break;
            }

            case 'bloodstalker': {
                if (!state.ready) return;
                let pct = 0;
                if      (action === 'tribute-minor') pct = CFG.bloodstalker.minorPct;
                else if (action === 'tribute-major') pct = CFG.bloodstalker.majorPct;
                else if (action === 'tribute-grand') pct = CFG.bloodstalker.grandPct;
                else return;

                const cost = Math.max(1, Math.floor(p.maxHp * pct));
                if (p.currentHp <= cost) {
                    ParticleSys.createFloatingText(p.x, p.y - 100, "NOT ENOUGH HP", "#ff3333");
                    return;
                }
                // Direct HP cost — bypass vulnerable/firewall/dodge so the price is predictable.
                p.currentHp = Math.max(1, p.currentHp - cost);
                p.playAnim('shake');
                ParticleSys.createFloatingText(p.x, p.y - 60, `-${cost} HP`, "#ff3333");
                AudioMgr.playSound('heartbeat');

                // Commit bar reset BEFORE damage — Major/Grand strikes can
                // trigger a fatal reflect (Reflector affix, thorns, etc.) or
                // kill the boss; either path nulls `state` via endCombat,
                // and the trailing assignments would otherwise throw.
                state.bar = 0;
                state.ready = false;

                let bossKilled = false;
                if (action === 'tribute-minor') {
                    Game.rerolls = (Game.rerolls || 0) + 1;
                    const badge = document.getElementById('reroll-badge');
                    if (badge) badge.innerText = Game.rerolls;
                    ParticleSys.createFloatingText(p.x, p.y - 100, "MINOR TRIBUTE +1 REROLL", "#ff8888");
                } else if (action === 'tribute-major') {
                    // Direct strike + bleed.
                    if (Game.enemy && Game.enemy.currentHp > 0) {
                        const dmg = Game.calculateCardDamage(CFG.bloodstalker.majorAttack, 'ATTACK', Game.enemy);
                        Game.enemy.takeDamage(dmg, p);
                        if (Game.triggerVFX) Game.triggerVFX('slash', p, Game.enemy);
                        if (Game.enemy.currentHp > 0) {
                            Game.enemy.addEffect('bleed', 3, CFG.bloodstalker.majorBleed, '🩸',
                                `Takes ${CFG.bloodstalker.majorBleed} DMG at end of turn.`, 'BLEED');
                        }
                        bossKilled = _resolveKill(Game.enemy);
                    }
                    ParticleSys.createFloatingText(p.x, p.y - 100, "MAJOR TRIBUTE", "#ff4444");
                    AudioMgr.playSound('attack');
                } else if (action === 'tribute-grand') {
                    // Big strike + heavy bleed + mana + rerolls.
                    if (Game.enemy && Game.enemy.currentHp > 0) {
                        const dmg = Game.calculateCardDamage(CFG.bloodstalker.grandAttack, 'ATTACK', Game.enemy);
                        Game.enemy.takeDamage(dmg, p);
                        if (Game.triggerVFX) {
                            Game.triggerVFX('slash_heavy', p, Game.enemy);
                            Game.triggerVFX('lightning', p, Game.enemy);
                        }
                        if (Game.enemy.currentHp > 0) {
                            Game.enemy.addEffect('bleed', 3, CFG.bloodstalker.grandBleed, '🩸',
                                `Takes ${CFG.bloodstalker.grandBleed} DMG at end of turn.`, 'BLEED');
                        }
                        bossKilled = _resolveKill(Game.enemy);
                    }
                    p.mana = Math.min(p.maxMana || 99, (p.mana || 0) + CFG.bloodstalker.grandManaGain);
                    Game.rerolls = (Game.rerolls || 0) + CFG.bloodstalker.grandRerolls;
                    const badge = document.getElementById('reroll-badge');
                    if (badge) badge.innerText = Game.rerolls;
                    ParticleSys.createFloatingText(p.x, p.y - 100, "GRAND TRIBUTE", "#ff0044");
                    ParticleSys.createFloatingText(p.x, p.y - 130, `+${CFG.bloodstalker.grandManaGain} MANA / +${CFG.bloodstalker.grandRerolls} REROLLS`, "#ffaa44");
                    AudioMgr.playSound('explosion');
                    if (Game.shake) Game.shake(12);
                }

                if (bossKilled) return; // combat already ended; skip render below
                break;
            }

            case 'annihilator':
                if (action !== 'heat-vent') return;
                if (state.heat >= CFG.annihilator.redMin) {
                    // Red release: AoE + self damage. Drain heat BEFORE the
                    // damage cascade — `p.takeDamage(redSelfDmg)` (and any
                    // reflect from the boss) can be fatal, and gameOver →
                    // endCombat would null `state`, so a trailing
                    // `state.heat = 0` would throw.
                    state.heat = 0;
                    const dmg = Game.calculateCardDamage(CFG.annihilator.redAoeDmg, 'EARTHQUAKE');
                    // Snapshot the minion list before damage — takeDamage may mutate it.
                    const targets = Game.enemy && Game.enemy.minions ? [...Game.enemy.minions] : [];
                    if (Game.enemy && Game.enemy.currentHp > 0) Game.enemy.takeDamage(dmg);
                    targets.forEach(m => { if (m && m.currentHp > 0) m.takeDamage(dmg); });
                    p.takeDamage(CFG.annihilator.redSelfDmg);
                    ParticleSys.createExplosion(p.x, p.y, 40, "#ff4400");
                    if (Game.shake) Game.shake(18);
                    AudioMgr.playSound('explosion');
                    ParticleSys.createFloatingText(p.x, p.y - 100, "MELTDOWN!", "#ff4400");
                    targets.forEach(m => _resolveKill(m));
                    if (_resolveKill(Game.enemy)) return;
                } else if (state.heat >= CFG.annihilator.yellowMin) {
                    state.pendingDmgMult = CFG.annihilator.yellowMult;
                    ParticleSys.createFloatingText(p.x, p.y - 80, "OVERCLOCK", "#ff8800");
                    AudioMgr.playSound('zap');
                    state.heat = 0;
                } else return;
                break;

            case 'sentinel':
                // Tapping the widget at 3 plates primes the block; the block is consumed
                // automatically when the enemy attacks (see consumeAttackBlock).
                if (action !== 'wall-ready') return;
                if (state.plates < CFG.sentinel.plateMax) return;
                state.blockReady = true; // already true, but keep idempotent
                ParticleSys.createFloatingText(p.x, p.y - 80, "AEGIS PRIMED", "#ffffff");
                AudioMgr.playSound('defend');
                break;

            case 'summoner': {
                if (!action.startsWith('plot-')) return;
                const idx = parseInt(action.split('-')[1], 10);
                if (isNaN(idx) || idx < 0 || idx >= state.plots.length) return;
                if (state.plots[idx] !== 2) return; // only Bloomed plots
                // APEX path — when the grove is full (4 living minions) AND
                // every plot is bloomed, a bloom tap empowers every minion
                // at ×2. The cap rose from 3 → 4 so APEX demands a fully
                // built canopy: the grove only has 3 plots, so the player
                // must supplement with non-bloom summons to reach the
                // fourth minion before the ×2 unlocks.
                const atMax = p.minions && p.minions.length >= (p.maxMinions || 4);
                const bloomCount = (state.plots || []).filter(v => v === 2).length;
                const isApex = !!(atMax && bloomCount >= 3);
                if (isApex) {
                    const color = '#ffd76a';
                    // Apex multiplier: 2× across every stat on every living
                    // minion. Previously 3×, which made Summoner roll over
                    // any boss that didn't clear the grove first turn.
                    const mult = 2;
                    let buffed = 0;
                    p.minions.forEach(m => {
                        if (!m) return;
                        m.maxHp = Math.floor((m.maxHp || 1) * mult);
                        m.currentHp = Math.floor((m.currentHp || 1) * mult);
                        m.dmg = Math.floor((m.dmg || 1) * mult);
                        if (typeof m.playAnim === 'function') m.playAnim('pulse');
                        ParticleSys.createShockwave(m.x, m.y, color, 30);
                        ParticleSys.createFloatingText(m.x, m.y - 50, 'APEX ×2', color);
                        buffed++;
                    });
                    // APEX consumes the entire canopy — every plot drains
                    // back to seed stage regardless of its current growth.
                    for (let i = 0; i < state.plots.length; i++) state.plots[i] = 0;
                    ParticleSys.createFloatingText(p.x, p.y - 100, `GROVE APEX — ×2 EMPOWERS ${buffed} ALLIES`, color);
                    ParticleSys.createShockwave(p.x, p.y, color, 48);
                    if (Game.shake) Game.shake(16);
                    if (Game.haptic) Game.haptic('heavy');
                    AudioMgr.playSound('upgrade');
                    break;
                }
                // At max but not apex — don't consume the bloom. Let the
                // player keep building toward the three-plot Apex condition.
                if (atMax) {
                    ParticleSys.createFloatingText(p.x, p.y - 80, 'GROVE FULL — NEED FULL BLOOM', '#88eaff');
                    AudioMgr.playSound('defend');
                    break;
                }
                // Otherwise standard spawn path. Reset the plot to seed
                // BEFORE spawning so that when the new minion fires the
                // synchronous 'minion_summoned' event, the plot we just
                // tapped is the youngest-unbloomed candidate — combined
                // with the _suppressBloomOnTap flag below the auto-bloom
                // is skipped entirely. Without this gating the player
                // could chain-tap bloomed plots forever: tapping plot A
                // would spawn a spirit, the spawn would auto-bloom plot
                // B, the player would tap plot B, which would auto-
                // bloom plot C, etc. — effectively a no-cost summon.
                state.plots[idx] = 0;
                this._suppressBloomOnTap = true;
                try {
                    if (typeof Game._spawnSpirit === 'function') {
                        Game._spawnSpirit();
                    } else {
                        this._spawnSummonerSpirit();
                    }
                } finally {
                    this._suppressBloomOnTap = false;
                }
                ParticleSys.createFloatingText(p.x, p.y - 80, "BLOOM → SPIRIT", "#00ff99");
                AudioMgr.playSound('mana');
                break;
            }
        }
        this.render();
    },

    // -------- activation helpers --------

    _fire() {
        const p = Game.player;
        const e = Game.enemy;
        if (!e || e.currentHp <= 0) return;
        const dmg = Game.calculateCardDamage(CFG.arcanist.fireDmg, 'ATTACK', e);
        e.takeDamage(dmg, p);
        if (Game.triggerVFX) Game.triggerVFX('lightning', p, e);
        AudioMgr.playSound('zap');
        ParticleSys.createFloatingText(p.x, p.y - 100, `GLYPH-FIRE ${dmg}`, "#bc13fe");
        _resolveKill(e);
    },
    _ice() {
        const p = Game.player;
        p.addShield(CFG.arcanist.iceShield);
        if (Game.enemy && Game.enemy.currentHp > 0) {
            Game.enemy.addEffect('weak', CFG.arcanist.iceWeakTurns, CFG.arcanist.iceWeakVal, '🌀', 'Weakened', 'WEAK');
        }
        AudioMgr.playSound('defend');
        ParticleSys.createFloatingText(p.x, p.y - 100, "GLYPH-ICE", "#bc13fe");
    },
    _lightning() {
        const p = Game.player;
        Game.rerolls += CFG.arcanist.lightningRerolls;
        document.getElementById('reroll-badge').innerText = Game.rerolls;
        AudioMgr.playSound('zap');
        ParticleSys.createFloatingText(p.x, p.y - 100, "GLYPH-LIGHTNING", "#bc13fe");
    },

    _spawnSummonerSpirit() {
        // Minimal Summoner spirit spawn — mirrors MINION-die branch in game.js
        // Uses late import to avoid circular deps at module load time.
        import('../entities/minion.js').then(mod => {
            if (!Game.player) return;
            const m = new mod.Minion(0, 0, Game.player.minions.length + 1, true);
            m.spawnTimer = 1.0;
            if (Game.player.hasRelic && Game.player.hasRelic('neural_link')) {
                m.maxHp += 3; m.currentHp += 3; m.dmg += 3;
            }
            Game.player.minions.push(m);
            if (Game.triggerVFX) Game.triggerVFX('materialize', null, { x: Game.player.x, y: Game.player.y });
        });
    },

    // -------- DOM build / render --------

    _build() {
        const el = $w();
        if (!el) return;
        // Class-theme border color
        const color = (Game.player && Game.player.classColor) || '#00f3ff';
        el.style.setProperty('--ability-color', color);
        el.className = 'class-ability ca-' + (classId || 'none');
        el.innerHTML = this._templateFor(classId);
        // Delegated click (touch → synthetic click, matching attachButtonEvent pattern)
        el.onclick = (e) => this._onClick(e);
        el.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });

        // Arcanist needs a tick to cycle the active glyph
        if (arcanistTimer) { clearInterval(arcanistTimer); arcanistTimer = null; }
        if (classId === 'arcanist') {
            arcanistTimer = setInterval(() => {
                if (!state) return;
                state.activeGlyph = (state.activeGlyph + 1) % 3;
                this._renderArcanist();
            }, CFG.arcanist.cycleMs);
        }
    },

    _templateFor(cls) {
        switch (cls) {
            case 'tactician':
                // Short titles everywhere so they never dominate the bar on narrow mobile widths.
                return `
                    <div class="ca-reticle-bg" aria-hidden="true">${ICONS.tacticianReticle}</div>
                    <div class="ca-title">COMMAND</div>
                    <div class="ca-track">
                        <span class="ca-track-rail"></span>
                        <span class="ca-pip" data-idx="0"><span class="ca-pip-dot"></span></span>
                        <span class="ca-pip" data-idx="1"><span class="ca-pip-dot"></span></span>
                        <span class="ca-pip" data-idx="2"><span class="ca-pip-dot"></span></span>
                    </div>
                    <div class="ca-actions">
                        <button class="ca-act" data-action="tact-reroll" title="Spend 3 pips for +1 reroll">${ICONS.reroll}</button>
                        <button class="ca-act" data-action="tact-shield" title="Spend 3 pips for +${CFG.tactician.shieldGain} shield">${ICONS.defend}</button>
                        <button class="ca-act" data-action="tact-dmg" title="Spend 3 pips — next ATTACK +${CFG.tactician.attackBonus}">${ICONS.attack}</button>
                    </div>`;
            case 'arcanist':
                // Title tucked top-right so the conduit trail + vortex own the left/center.
                return `
                    <div class="ca-title ca-title-right">GLYPHS</div>
                    <button class="ca-glyph-wheel" data-action="arc-tap" title="Tap when the wanted glyph is lit. Fire: 12 dmg. Ice: 5 shield + Weak. Lightning: +1 reroll.">
                        <span class="ca-vortex-seal" aria-hidden="true">${ICONS.arcanistSeal}</span>
                        <span class="ca-glyph-orbit">
                            <span class="ca-glyph" data-idx="0">${ICONS.glyphFire}</span>
                            <span class="ca-glyph" data-idx="1">${ICONS.glyphIce}</span>
                            <span class="ca-glyph" data-idx="2">${ICONS.glyphLightning}</span>
                        </span>
                    </button>
                    <div class="ca-used-label">READY</div>`;
            case 'bloodstalker': {
                // Compact blood droplet glyph — used as the "tier pip" inside each tribute button.
                const drop = `<svg viewBox="0 0 10 14" class="ca-drop-glyph" aria-hidden="true"><path d="M5 0.8 C 5 4, 9 7, 9 10 C 9 12.5, 7.2 13.4, 5 13.4 C 2.8 13.4, 1 12.5, 1 10 C 1 7, 5 4, 5 0.8 Z" fill="currentColor"/></svg>`;
                return `
                    <div class="ca-title">BLOOD</div>
                    <div class="ca-blood">
                        <span class="ca-heart" aria-hidden="true">${ICONS.bloodstalkerHeart}</span>
                        <span class="ca-blood-bar">
                            <span class="ca-blood-fill"></span>
                        </span>
                        <div class="ca-tributes">
                            <button class="ca-tribute ca-tribute-minor" data-action="tribute-minor"
                                title="Minor Tribute — pay 5% Max HP for +1 reroll.">
                                <span class="ca-tribute-pips" aria-hidden="true">${drop}</span>
                                <span class="ca-tribute-cost">5%</span>
                            </button>
                            <button class="ca-tribute ca-tribute-major" data-action="tribute-major"
                                title="Major Tribute — pay 15% Max HP. Deal ${CFG.bloodstalker.majorAttack} DMG and apply ${CFG.bloodstalker.majorBleed} Bleed (3 turns).">
                                <span class="ca-tribute-pips" aria-hidden="true">${drop}${drop}</span>
                                <span class="ca-tribute-cost">15%</span>
                            </button>
                            <button class="ca-tribute ca-tribute-grand" data-action="tribute-grand"
                                title="Grand Tribute — pay 30% Max HP. Deal ${CFG.bloodstalker.grandAttack} DMG, apply ${CFG.bloodstalker.grandBleed} Bleed (3 turns), +${CFG.bloodstalker.grandManaGain} Mana, +${CFG.bloodstalker.grandRerolls} rerolls.">
                                <span class="ca-tribute-pips" aria-hidden="true">${drop}${drop}${drop}</span>
                                <span class="ca-tribute-cost">30%</span>
                            </button>
                        </div>
                    </div>`;
            }
            case 'annihilator':
                return `
                    <div class="ca-title">REACTOR</div>
                    <button class="ca-heat" data-action="heat-vent" title="Yellow: next die ×${CFG.annihilator.yellowMult} | Red: ${CFG.annihilator.redAoeDmg} AoE, self ${CFG.annihilator.redSelfDmg}">
                        <span class="ca-reactor-frame">
                            <span class="ca-heat-bar">
                                <span class="ca-heat-fill"></span>
                                <span class="ca-heat-bubbles">
                                    <span></span><span></span><span></span><span></span>
                                </span>
                                <span class="ca-heat-tick ca-tick-y" style="left:${CFG.annihilator.yellowMin}%" data-zone="yellow">⚠</span>
                                <span class="ca-heat-tick ca-tick-r" style="left:${CFG.annihilator.redMin}%" data-zone="red">☢</span>
                                <span class="ca-heat-label">VENT</span>
                            </span>
                        </span>
                    </button>`;
            case 'sentinel':
                return `
                    <div class="ca-title">AEGIS</div>
                    <button class="ca-wall" data-action="wall-ready" title="Fill 3 plates (+${CFG.sentinel.shieldPerPlate} shield each) to nullify the next enemy attack">
                        <span class="ca-aegis-sigil" aria-hidden="true">${ICONS.sentinelSigil}</span>
                        <span class="ca-plate ca-plate-top"    data-idx="0"></span>
                        <span class="ca-plate ca-plate-left"   data-idx="1"></span>
                        <span class="ca-plate ca-plate-right"  data-idx="2"></span>
                    </button>`;
            case 'summoner':
                // SACRED GROVE — a thicket of intermingled vines fills the
                // entire widget. Two main vines weave a horizontal braid;
                // each of the three plot positions (22 / 50 / 78 % across)
                // is wrapped in its own circular vine wreath. Side
                // tendrils, leaves, moss tufts, and floating motes fill
                // the upper / lower bands so the canvas no longer reads
                // as "thin string drawn across a black box."
                return `
                    <div class="ca-title ca-title-right">SACRED GROVE</div>
                    <svg class="ca-vine" viewBox="0 0 620 88" preserveAspectRatio="none" aria-hidden="true">
                        <defs>
                            <linearGradient id="vine-glow" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0" stop-color="#0d4a22"/>
                                <stop offset="0.5" stop-color="#00ff99"/>
                                <stop offset="1" stop-color="#0d4a22"/>
                            </linearGradient>
                            <radialGradient id="vine-mossy" cx="0.5" cy="0.5" r="0.5">
                                <stop offset="0" stop-color="rgba(0, 255, 153, 0.45)"/>
                                <stop offset="1" stop-color="rgba(0, 80, 30, 0)"/>
                            </radialGradient>
                        </defs>

                        <!-- Mossy ground patches sweeping the bottom edge -->
                        <ellipse class="ca-vine-moss" cx="80"  cy="86" rx="58" ry="6"/>
                        <ellipse class="ca-vine-moss" cx="310" cy="86" rx="80" ry="7"/>
                        <ellipse class="ca-vine-moss" cx="540" cy="86" rx="58" ry="6"/>

                        <!-- Trunk rising from the bottom-left, thickens as it climbs -->
                        <path class="ca-vine-trunk" d="M 14 92 C 8 70 30 60 24 40 Q 22 22 42 16" stroke-width="5"/>
                        <!-- Mirror trunk on the right for symmetry, slightly thinner -->
                        <path class="ca-vine-trunk" d="M 606 92 C 614 70 590 60 596 40 Q 598 22 578 16" stroke-width="4"/>

                        <!-- Upper braid — gentle S-curve through the top half -->
                        <path class="ca-vine-main" d="M 24 30
                              C 70 8, 130 12, 170 28
                              S 250 56, 310 30
                              S 430 6, 490 26
                              S 580 56, 596 30" stroke-width="2.8" fill="none"/>
                        <path class="ca-vine-core" d="M 24 30
                              C 70 8, 130 12, 170 28
                              S 250 56, 310 30
                              S 430 6, 490 26
                              S 580 56, 596 30" stroke-width="1.2" fill="none"/>

                        <!-- Lower braid — wraps under the plots and rises between -->
                        <path class="ca-vine-main" d="M 24 58
                              C 70 80, 130 76, 170 60
                              S 250 32, 310 58
                              S 430 82, 490 62
                              S 580 32, 596 58" stroke-width="2.4" fill="none" opacity="0.85"/>
                        <path class="ca-vine-core" d="M 24 58
                              C 70 80, 130 76, 170 60
                              S 250 32, 310 58
                              S 430 82, 490 62
                              S 580 32, 596 58" stroke-width="1" fill="none" opacity="0.85"/>

                        <!-- Cradle wreaths now live as CSS ::before rings on the
                             .ca-plot buttons themselves (see style.css) so the
                             wreath is GUARANTEED to be drawn at the plot's
                             position — the previous SVG cradles drifted off the
                             plot centres on some viewport widths because the
                             braid crossings between cradles also formed dashed-
                             looking lens shapes that read as extra "empty
                             wreaths" in the bar. -->

                        <!-- Curling tendrils branching off the cradles -->
                        <path class="ca-leaf-shoot" d="M 100 36 q -10 -16 6 -28" stroke-width="1.4"/>
                        <path class="ca-leaf-shoot" d="M 170 50 q 12 14 -2 30" stroke-width="1.4"/>
                        <path class="ca-leaf-shoot" d="M 270 36 q -8 -18 8 -30" stroke-width="1.4"/>
                        <path class="ca-leaf-shoot" d="M 350 50 q 10 18 -4 30" stroke-width="1.4"/>
                        <path class="ca-leaf-shoot" d="M 448 36 q -10 -16 6 -28" stroke-width="1.4"/>
                        <path class="ca-leaf-shoot" d="M 520 50 q 14 14 0 30" stroke-width="1.4"/>

                        <!-- Small leaf cluster above each plot to imply canopy -->
                        <ellipse class="ca-leaf" cx="102" cy="10" rx="6" ry="2.5" transform="rotate(-30 102 10)"/>
                        <ellipse class="ca-leaf" cx="172" cy="80" rx="6" ry="2.5" transform="rotate(30 172 80)"/>
                        <ellipse class="ca-leaf" cx="278" cy="8" rx="6" ry="2.5" transform="rotate(-25 278 8)"/>
                        <ellipse class="ca-leaf" cx="348" cy="82" rx="6" ry="2.5" transform="rotate(25 348 82)"/>
                        <ellipse class="ca-leaf" cx="454" cy="10" rx="6" ry="2.5" transform="rotate(-30 454 10)"/>
                        <ellipse class="ca-leaf" cx="522" cy="82" rx="6" ry="2.5" transform="rotate(28 522 82)"/>
                        <!-- Smaller secondary leaves for density -->
                        <ellipse class="ca-leaf" cx="56" cy="22" rx="4" ry="1.8" transform="rotate(-40 56 22)"/>
                        <ellipse class="ca-leaf" cx="220" cy="22" rx="4" ry="1.8" transform="rotate(35 220 22)"/>
                        <ellipse class="ca-leaf" cx="400" cy="20" rx="4" ry="1.8" transform="rotate(-30 400 20)"/>
                        <ellipse class="ca-leaf" cx="564" cy="22" rx="4" ry="1.8" transform="rotate(40 564 22)"/>

                        <!-- Buds at the wreath crowns. Each bud holds the leaf body
                             plus four petals that stay invisible until the grove
                             reaches full bloom (data-growth="3"), at which point
                             they unfurl with a gold glow. -->
                        <g class="ca-bud" transform="translate(136 4) rotate(0)">
                            <ellipse class="ca-bud-petal" cx="0" cy="-7" rx="2.6" ry="4.6"/>
                            <ellipse class="ca-bud-petal" cx="7" cy="0"  rx="4.6" ry="2.6"/>
                            <ellipse class="ca-bud-petal" cx="0" cy="7"  rx="2.6" ry="4.6"/>
                            <ellipse class="ca-bud-petal" cx="-7" cy="0" rx="4.6" ry="2.6"/>
                            <ellipse class="ca-leaf" cx="0" cy="0" rx="5" ry="2.5"/>
                            <circle class="ca-bud-core" cx="0" cy="0" r="1.6"/>
                        </g>
                        <g class="ca-bud" transform="translate(310 4) rotate(0)">
                            <ellipse class="ca-bud-petal" cx="0" cy="-7" rx="2.6" ry="4.6"/>
                            <ellipse class="ca-bud-petal" cx="7" cy="0"  rx="4.6" ry="2.6"/>
                            <ellipse class="ca-bud-petal" cx="0" cy="7"  rx="2.6" ry="4.6"/>
                            <ellipse class="ca-bud-petal" cx="-7" cy="0" rx="4.6" ry="2.6"/>
                            <ellipse class="ca-leaf" cx="0" cy="0" rx="5" ry="2.5"/>
                            <circle class="ca-bud-core" cx="0" cy="0" r="1.6"/>
                        </g>
                        <g class="ca-bud" transform="translate(484 4) rotate(0)">
                            <ellipse class="ca-bud-petal" cx="0" cy="-7" rx="2.6" ry="4.6"/>
                            <ellipse class="ca-bud-petal" cx="7" cy="0"  rx="4.6" ry="2.6"/>
                            <ellipse class="ca-bud-petal" cx="0" cy="7"  rx="2.6" ry="4.6"/>
                            <ellipse class="ca-bud-petal" cx="-7" cy="0" rx="4.6" ry="2.6"/>
                            <ellipse class="ca-leaf" cx="0" cy="0" rx="5" ry="2.5"/>
                            <circle class="ca-bud-core" cx="0" cy="0" r="1.6"/>
                        </g>

                        <!-- Ambient firefly motes scattered across the canopy -->
                        <circle class="ca-vine-mote" cx="60"  cy="14" r="1.3"/>
                        <circle class="ca-vine-mote" cx="200" cy="74" r="1"/>
                        <circle class="ca-vine-mote" cx="240" cy="14" r="1.2"/>
                        <circle class="ca-vine-mote" cx="380" cy="74" r="1"/>
                        <circle class="ca-vine-mote" cx="430" cy="14" r="1.3"/>
                        <circle class="ca-vine-mote" cx="560" cy="74" r="1.1"/>
                    </svg>
                    <div class="ca-plots">
                        <button class="ca-plot" data-action="plot-0" data-idx="0" title="Bloom to free-summon a Spirit"></button>
                        <button class="ca-plot" data-action="plot-1" data-idx="1" title="Bloom to free-summon a Spirit"></button>
                        <button class="ca-plot" data-action="plot-2" data-idx="2" title="Bloom to free-summon a Spirit"></button>
                    </div>`;
            default:
                return '';
        }
    },

    render() {
        // Recover if combat is live but the widget was never mounted for this
        // class — e.g. a state-reset wiped `state` mid-combat, or the DOM was
        // rebuilt without re-running startCombat(). The widget is critical
        // for Bloodstalker's Blood Pool, so it must never be silently blank.
        if ((!state || !classId) && Game && Game.player && Game.player.classId && Game.enemy) {
            classId = Game.player.classId;
            state = _defaultState(classId);
            if (state) this._build();
        }
        if (!state || !classId) return;
        const el = $w();
        if (!el) return;
        // Defensive: if the `hidden` class snuck on (third-party close, tutorial
        // overlay clean-up, etc.) while combat is live, peel it back off.
        if (el.classList.contains('hidden') && Game && Game.enemy) {
            el.classList.remove('hidden');
        }
        if (!el.innerHTML) this._build();
        switch (classId) {
            case 'tactician':    this._renderTactician(); break;
            case 'arcanist':     this._renderArcanist(); break;
            case 'bloodstalker': this._renderBloodstalker(); break;
            case 'annihilator':  this._renderAnnihilator(); break;
            case 'sentinel':     this._renderSentinel(); break;
            case 'summoner':     this._renderSummoner(); break;
        }
    },

    _renderTactician() {
        const el = $w(); if (!el) return;
        el.querySelectorAll('.ca-pip').forEach(p => {
            const idx = parseInt(p.dataset.idx, 10);
            p.classList.toggle('lit', idx < state.pips);
        });
        const ready = state.pips >= CFG.tactician.pipMax;
        el.classList.toggle('ready', ready);
        el.querySelectorAll('.ca-act').forEach(b => {
            b.disabled = !ready;
        });
    },

    _renderArcanist() {
        const el = $w(); if (!el) return;
        el.querySelectorAll('.ca-glyph').forEach(g => {
            const idx = parseInt(g.dataset.idx, 10);
            g.classList.toggle('active', idx === state.activeGlyph);
        });
        el.classList.toggle('used', !!state.usedThisTurn);
        const readyLabel = el.querySelector('.ca-used-label');
        if (readyLabel) readyLabel.textContent = state.usedThisTurn ? 'USED' : 'READY';
    },

    _renderBloodstalker() {
        const el = $w(); if (!el) return;
        const max = CFG.bloodstalker.damageToFill;
        const pct = Math.max(0, Math.min(100, (state.bar / max) * 100));
        const fill = el.querySelector('.ca-blood-fill');
        if (fill) fill.style.width = pct + '%';
        const readout = el.querySelector('.ca-blood-readout');
        if (readout) readout.textContent = `${state.bar} / ${max}`;

        // Heartbeat speed ramps with how full the pool is (1..3).
        const tier = state.ready ? 3 : (state.bar >= max * 0.66 ? 2 : (state.bar >= max * 0.33 ? 1 : 0));
        el.classList.remove('charged-1', 'charged-2', 'charged-3');
        if (tier > 0) el.classList.add('charged-' + tier);
        el.classList.toggle('ready', !!state.ready);

        const p = Game && Game.player;
        el.querySelectorAll('.ca-tribute').forEach(btn => {
            let costPct = 0;
            if (btn.classList.contains('ca-tribute-minor')) costPct = CFG.bloodstalker.minorPct;
            else if (btn.classList.contains('ca-tribute-major')) costPct = CFG.bloodstalker.majorPct;
            else if (btn.classList.contains('ca-tribute-grand')) costPct = CFG.bloodstalker.grandPct;
            const cost = p ? Math.max(1, Math.floor(p.maxHp * costPct)) : 0;
            const affordable = p ? p.currentHp > cost : false;
            btn.disabled = !state.ready || !affordable;
        });
    },

    _renderAnnihilator() {
        const el = $w(); if (!el) return;
        const fill = el.querySelector('.ca-heat-fill');
        if (fill) fill.style.width = state.heat + '%';
        const zone = state.heat >= CFG.annihilator.redMin ? 'red'
                   : state.heat >= CFG.annihilator.yellowMin ? 'yellow'
                   : 'cool';
        el.classList.remove('zone-cool', 'zone-yellow', 'zone-red');
        el.classList.add('zone-' + zone);
    },

    _renderSentinel() {
        const el = $w(); if (!el) return;
        el.querySelectorAll('.ca-plate').forEach(p => {
            const idx = parseInt(p.dataset.idx, 10);
            p.classList.toggle('lit', idx < state.plates);
        });
        el.classList.toggle('ready', !!state.blockReady);
    },

    _renderSummoner() {
        const el = $w(); if (!el) return;
        // APEX-ready is now the ONLY whole-grove payoff: full grove (4/4
        // minions out AND 3/3 plots bloomed) → tap any bloom to ×2 every
        // minion. The cap rose from 3 → 4 so the canopy + a non-grove
        // summon are both required to unlock the buff. CSS still reads
        // .apex-ready to paint the gold canopy treatment.
        const p = Game && Game.player;
        const atMax = p && p.minions && p.minions.length >= (p.maxMinions || 4);
        const bloomCount = (state.plots || []).filter(v => v === 2).length;
        const isApexReady = !!(atMax && bloomCount >= 3);
        // Keep the amplify-ready class as a harmless alias so older CSS
        // references don't break mid-deploy, but it tracks apex now.
        el.classList.toggle('amplify-ready', isApexReady);
        el.classList.toggle('apex-ready', isApexReady);
        const apexTip  = 'GROVE APEX READY — bloom a plot to ×2 every minion (consumes the canopy).';
        const fullTip  = 'MINIONS AT MAX — complete the canopy (3/3 blooms) to unleash APEX ×2.';
        const spawnTip = 'Bloom a plot to free-summon a Spirit.';
        // Grove growth = count of bloomed plots (0..3). Drives the tree
        // silhouette's brightness so the center tree visibly "grows" with
        // the forest behind the scenes.
        el.setAttribute('data-growth', String(bloomCount));

        el.querySelectorAll('.ca-plot').forEach(btn => {
            const idx = parseInt(btn.dataset.idx, 10);
            const stage = state.plots[idx] || 0;
            btn.classList.remove('stage-seed', 'stage-sprout', 'stage-bloom');
            btn.classList.add(stage === 0 ? 'stage-seed' : stage === 1 ? 'stage-sprout' : 'stage-bloom');
            btn.title = isApexReady ? apexTip : (atMax ? fullTip : spawnTip);
            const icon = stage === 0 ? ICONS.grovePlotSeed
                       : stage === 1 ? ICONS.grovePlotSprout
                                     : ICONS.grovePlotBloom;
            // Only show the ×3 badge when apex is live — no more ×2 tier.
            const badge = (stage === 2 && isApexReady)
                ? `<span class="ca-plot-amp-badge">×3</span>`
                : '';
            btn.innerHTML = icon + badge;
        });
    },
};

function isDamageDie(t) {
    return t === 'ATTACK' || t === 'METEOR' || t === 'EARTHQUAKE';
}
