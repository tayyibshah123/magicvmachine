import { COLORS } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { Entity } from './entity.js';
import { Game } from '../game.js';
import { ClassAbility } from '../ui/class-ability.js';


class Minion extends Entity {
    constructor(x, y, id, isPlayerSide, tier = 1) {
        let name = isPlayerSide ? "Wisp Lv." + id : "Bot Unit " + id;

        if (isPlayerSide && Game.player) {
             // Tier 8 — flavor pool per class so summons read as distinct
             // individuals (SAGE, EMBER, …) instead of "Wisp 1, Wisp 2, Wisp 3".
             // Falls back to the legacy "<MinionName> N" for classes without a
             // pool or when the traits object is absent.
             const FLAVOR = {
                 'Pawn':     ['ROOK', 'BISHOP', 'KNIGHT', 'CASTLE', 'SENTRY'],
                 'Wisp':     ['SAGE', 'SPARK', 'DRIFT', 'EMBER', 'CINDER'],
                 'Thrall':   ['RUST', 'SCREAM', 'HOWL', 'MAW', 'FANG'],
                 'Bomb Bot': ['FUSE', 'SPITFIRE', 'TNT', 'KABOOM', 'CRACKLE'],
                 'Glyph':    ['AEGIS', 'WARD', 'OATH', 'BULWARK', 'KEEPER'],
                 'Spirit':   ['OAK', 'FERN', 'BLOOM', 'MOSS', 'IVY'],
             };
             const base = Game.player.traits && Game.player.traits.minionName;
             const pool = FLAVOR[base];
             if (pool && pool.length) {
                 const pick = pool[(id - 1) % pool.length];
                 name = `${base} · ${pick}`;
             } else if (base) {
                 name = `${base} ${id}`;
             }
             if (Game.player.traits && Game.player.traits.minionName === "Bug") {
                 this.dmg = 99;
                 this.maxHp = 1;
                 this.currentHp = 1;
             }
        } else {
            if (tier === 2) name = "Elite Drone " + id;
            if (tier === 3) name = "Core Guard " + id;
        }
        
        let hp = isPlayerSide ? 2 : 2;
        
        if (!isPlayerSide) {
            if (tier === 2) hp = 8;
            if (tier === 3) hp = 15;
        }

        super(x, y, name, hp);
        this.radius = 75; 
        this.dmg = isPlayerSide ? 1 : 2;
        this.tier = tier;
        this.charges = 1; 

        if (!isPlayerSide) {
            this.dmg = 4; 
            if (tier === 2) this.dmg = 8;
            if (tier === 3) this.dmg = 12;
        }

        if (isPlayerSide && Game.hasMetaUpgrade('m_minion_atk')) {
            this.dmg = Math.floor(this.dmg * 1.5); 
            if (this.dmg === 1) this.dmg = 2; 
            // Meta: Nano-Swarm (+1 HP)
            this.maxHp += 1;
            this.currentHp += 1;
        }

        this.level = 1;
        this.isPlayerSide = isPlayerSide;
        
        // Relic: Wisp Vitality (+5 HP)
        if(isPlayerSide && Game.player && Game.player.hasRelic('wisp_hp')) {
            const stacks = Game.player.relics.filter(r => r.id === 'wisp_hp').length;
            this.maxHp += (5 * stacks);
            this.currentHp += (5 * stacks);
        }

        // Relic: Neural Link (+3 HP / +3 Dmg) - Initial application
        // (Note: Dynamic addition in useDie handles new spawns, this handles init)
        if(isPlayerSide && Game.player && Game.player.hasRelic('neural_link')) {
            this.maxHp += 3;
            this.currentHp += 3;
            this.dmg += 3;
        }

        // Broadcast player-minion summon so class-ability widgets (e.g. the
        // Summoner Grove) can react to ANY summon source, not just the MINION
        // die. Routed via ClassAbility.onEvent. Late-imported to dodge the
        // entity.js ↔ class-ability.js circular; if not yet loaded, skip
        // silently (first-launch edge case before ClassAbility.init).
        //
        // DEFERRED to a microtask so the call site's `player.minions.push(m)`
        // — which runs AFTER this constructor returns — has updated the
        // array before the Summoner widget reads `player.minions.length`.
        // Without the defer, atMax was evaluated as length-1, and the Apex
        // condition (full grove + 3/3 blooms) wasn't recognised until the
        // next render trigger (typically end of turn). Microtasks still
        // drain before the next paint, so the grove glow lands in the same
        // frame visually.
        if (isPlayerSide) {
            try {
                if (ClassAbility && typeof ClassAbility.onEvent === 'function') {
                    queueMicrotask(() => {
                        try { ClassAbility.onEvent('minion_summoned', { minion: this }); }
                        catch (_) { /* ignore */ }
                    });
                }
            } catch (_) { /* ignore */ }
        }
    }

    upgrade() {
        this.maxHp += 1;
        this.currentHp += 1;
        this.dmg += 1;
        this.level++;

        if (this.name.includes("Bomb")) {
            this.charges++;
            ParticleSys.createFloatingText(this.x, this.y - 100, "+1 CHARGE", COLORS.ORANGE);
        }

        ParticleSys.createFloatingText(this.x, this.y - 80, "UPGRADE!", COLORS.GOLD);
        this.playAnim('pulse');
        AudioMgr.playSound('upgrade');

        // Fire a grove-trigger event so Summoner's Sacred Grove blooms a
        // plot on upgrade just like it does on summon. Deferred to a
        // microtask so any pending caller-side mutation (e.g. push, stat
        // tweak) is visible to _renderSummoner — the Apex check reads
        // player.minions.length immediately. Microtasks still drain
        // before paint, so the visual update is same-frame.
        if (this.isPlayerSide) {
            try {
                if (ClassAbility && typeof ClassAbility.onEvent === 'function') {
                    queueMicrotask(() => {
                        try { ClassAbility.onEvent('minion_upgraded', { minion: this }); }
                        catch (_) { /* ignore */ }
                    });
                }
            } catch (_) { /* ignore */ }
        }
    }
}

export { Minion };
