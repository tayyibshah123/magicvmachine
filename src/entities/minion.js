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
             name = Game.player.traits.minionName + " " + id;
             if (Game.player.traits.minionName === "Bug") {
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
        if (isPlayerSide) {
            // Synchronous call so the grove UI updates in the same frame
            // the minion spawns — the earlier dynamic-import version
            // deferred the plot bloom by a microtask, which was visible
            // as a one-frame delay on mobile.
            try {
                if (ClassAbility && typeof ClassAbility.onEvent === 'function') {
                    ClassAbility.onEvent('minion_summoned', { minion: this });
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
        // plot on upgrade just like it does on summon. Synchronous so the
        // plot update lands on the same frame as the upgrade VFX.
        if (this.isPlayerSide) {
            try {
                if (ClassAbility && typeof ClassAbility.onEvent === 'function') {
                    ClassAbility.onEvent('minion_upgraded', { minion: this });
                }
            } catch (_) { /* ignore */ }
        }
    }
}

export { Minion };
