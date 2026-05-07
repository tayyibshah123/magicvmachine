import { UPGRADES_POOL, COLORS } from '../constants.js';
import { ICONS } from '../ui/icons.js';
import { ParticleSys } from '../effects/particles.js';
import { Entity } from './entity.js';
import { Minion } from './minion.js';
import { Game } from '../game.js';


class Player extends Entity {
    constructor(classConfig) {
        super(540, 1080, classConfig.name, 30);
        
        // Initialize Arrays FIRST to prevent crashes
        this.minions = [];
        this.relics = [];
        this.diceUpgrades = [];
        this.signatureTier = 1;

        this.classColor = classConfig.color || '#00ff99';
        // Shallow clone — class-specific Sanctuary upgrades mutate trait
        // fields below. Without the clone we'd mutate the shared
        // PLAYER_CLASSES.traits object and the buffs would compound on
        // subsequent runs (each Sentinel would get +8, +16, +24 shield).
        this.traits = Object.assign({}, classConfig.traits || {});
        this.baseMana = this.traits.baseMana || 3;

        // Meta: Gaia's Heart (+20 Max HP)
        if(Game.hasMetaUpgrade('m_life')) this.maxHp += 20;

        // Meta: Deep Roots
        if(Game.hasMetaUpgrade('m_mana')) this.baseMana += 1;

        // ── Class specialisation Sanctuary upgrades. Each gates on the
        // active class id (taken from classConfig since this.classId
        // isn't assigned by the caller until after the constructor
        // returns). Trait modifications compound with the existing
        // class baselines so the class identity stays intact and the
        // upgrade reads as "more of what you already do."
        const cid = this.classId || (classConfig && classConfig.id);
        if (cid === 'tactician' && Game.hasMetaUpgrade('cls_tactician')) {
            this.traits.pipPerAttack = (this.traits.pipPerAttack || 1) + 1;
        }
        if (cid === 'arcanist' && Game.hasMetaUpgrade('cls_arcanist')) {
            this.traits.manaPassive = (this.traits.manaPassive || 0) + 1;
        }
        if (cid === 'bloodstalker' && Game.hasMetaUpgrade('cls_bloodstalker')) {
            this.traits.bloodTierLifestealBonus = (this.traits.bloodTierLifestealBonus || 0) + 1;
        }
        if (cid === 'annihilator' && Game.hasMetaUpgrade('cls_annihilator')) {
            this.traits.dmgMultiplier = (this.traits.dmgMultiplier || 1) + 0.2;
        }
        if (cid === 'sentinel' && Game.hasMetaUpgrade('cls_sentinel')) {
            this.traits.startShield = (this.traits.startShield || 0) + 8;
        }
        if (cid === 'summoner' && Game.hasMetaUpgrade('cls_summoner')) {
            this.traits.startMinionBuff = (this.traits.startMinionBuff || 1) + 0.2;
        }
        
        // Meta: Double Edge (Formerly Thorns)
        if(Game.hasMetaUpgrade('m_thorn')) {
            this.addRelic({ id: 'spike_armor', name: "Double Edge", desc: "Reflect 30% damage.", icon: ICONS.relicDoubleEdge });
        }
        
        // Meta: Data Cache — random starting relic. Filtered to entries
        // the current class is allowed to roll so a Sentinel doesn't
        // start with a Bloodstalker-locked module. classId hasn't been
        // assigned by the caller yet at constructor time, so fall back
        // to classConfig.id which DOES carry the picked class.
        if(Game.hasMetaUpgrade('m_relic')) {
            const cid = this.classId || (classConfig && classConfig.id);
            const pool = UPGRADES_POOL.filter(r => !r.classLocked || r.classLocked === cid);
            const randomRelic = pool[Math.floor(Math.random() * pool.length)];
            this.addRelic(randomRelic);
        }
        
        this.currentHp = this.maxHp;
        this.mana = this.baseMana;
        this.diceCount = this.traits.diceCount || 5;
        this.maxMinions = this.traits.maxMinions || 2;
        
        this.nextAttackMult = 1;
        this.incomingDamageMult = 1;
        this.sigMissStreak = 0;

        this.spawnTimer = 0;
        
        if (this.traits.startMinions) {
            const buff = this.traits.startMinionBuff || 1;
            for(let i=0; i<this.traits.startMinions; i++) {
                 const m = new Minion(0, 0, i+1, true);
                 if (buff !== 1) {
                    m.maxHp = Math.max(1, Math.floor(m.maxHp * buff));
                    m.currentHp = m.maxHp;
                    m.dmg = Math.max(1, Math.floor(m.dmg * buff));
                 }
                 this.minions.push(m);
            }
        }
    }
    
    addRelic(relic) {
        this.relics.push(relic);
        // v1.8.4 — invalidate Game.stackCount() Map cache. The cache
        // returns sums per relic id; any push/splice on the relic list
        // invalidates it. _rebuildStackCache lazily rebuilds on next read.
        if (Game && Game.invalidateStackCache) Game.invalidateStackCache();
        // Custom Run: Daily Dupes — relics duplicate on pickup. Guard against
        // recursion by short-circuiting on the second entry (_dupeMarker).
        if (Game && Game._customRelicPickDupe && !relic._dupeMarker) {
            const dupe = Object.assign({}, relic, { _dupeMarker: true });
            // Defer the dupe to the next tick so both relics show in the
            // list UI and synergies can check the combined set.
            setTimeout(() => { this.addRelic(dupe); }, 0);
        }
        // Custom Run: Cursed Relics — picking a relic damages the player.
        // Fires once per real pickup (skip duplicated _dupeMarker entries so
        // Daily Dupes doesn't double-tax).
        if (Game && Game._customRelicPickDmg && !relic._dupeMarker) {
            const dmg = Game._customRelicPickDmg;
            // Bypass shield — the curse is the point of the modifier.
            this.takeDamage(dmg, null, false, /*bypassShield*/ true);
            ParticleSys.createFloatingText(this.x, this.y - 140, `CURSED -${dmg}`, '#ff0055');
        }
        if (relic.id === 'gamblers_chip') {
            this.maxHp = Math.max(1, this.maxHp - 5);
            if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
            ParticleSys.createFloatingText(this.x, this.y - 100, "-5 MAX HP", "#ff0000");
        }
        if (relic.id === 'c_quantum_core') {
            this.maxHp = Math.max(1, this.maxHp - 15);
            if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
            ParticleSys.createFloatingText(this.x, this.y - 100, "-15 MAX HP", "#ff0000");
        }
        if (relic.id === 'c_overclock') {
            this.baseMana = (this.baseMana || 3) + 2;
            ParticleSys.createFloatingText(this.x, this.y - 100, "+2 MANA", COLORS.MANA);
        }
        if (relic.id === 'c_unstable_core') {
            this.baseMana = (this.baseMana || 3) + 2;
            ParticleSys.createFloatingText(this.x, this.y - 100, "+2 MANA", COLORS.MANA);
        }
        if (relic.id === 'c_void_siphon') {
            this.maxHp = Math.max(1, this.maxHp - 5);
            if (this.currentHp > this.maxHp) this.currentHp = this.maxHp;
            ParticleSys.createFloatingText(this.x, this.y - 100, "-5 MAX HP", "#ff0000");
        }
        Game.renderRelics();
        Game.checkSynergies && Game.checkSynergies(relic);
        // Achievement: first relic acquired
        if (typeof window !== 'undefined' && window.Achievements) {
            window.Achievements.unlock('FIRST_RELIC');
            if (this.relics && this.relics.length >= 10) window.Achievements.unlock('RELIC_10');
            const corruptedCount = (this.relics || []).filter(r => r.rarity === 'corrupted').length;
            if (corruptedCount >= 3) window.Achievements.unlock('CORRUPTED_3');
        }
    }
    
    hasRelic(id) {
        return this.relics.find(r => r.id === id);
    }
    
    hasDiceUpgrade(type) {
        return this.diceUpgrades.includes(type);
    }
}

export { Player };
