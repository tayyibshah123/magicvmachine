import { UPGRADES_POOL, COLORS } from '../constants.js';
import { ICONS } from '../ui/icons.js';
import { ParticleSys } from '../effects/particles.js';
import { Entity } from './entity.js';
import { Minion } from './minion.js';
import { Game } from '../game.js';


class Player extends Entity {
    constructor(classConfig) {
        super(540, 1150, classConfig.name, 30); 
        
        // Initialize Arrays FIRST to prevent crashes
        this.minions = [];
        this.relics = [];
        this.diceUpgrades = [];
        this.signatureTier = 1;

        this.classColor = classConfig.color || '#00ff99'; 
        this.traits = classConfig.traits || {};
        this.baseMana = this.traits.baseMana || 3;
        
        // Meta: Gaia's Heart (+20 Max HP)
        if(Game.hasMetaUpgrade('m_life')) this.maxHp += 20;
        
        // Meta: Deep Roots
        if(Game.hasMetaUpgrade('m_mana')) this.baseMana += 1;
        
        // Meta: Double Edge (Formerly Thorns)
        if(Game.hasMetaUpgrade('m_thorn')) {
            this.addRelic({ id: 'spike_armor', name: "Double Edge", desc: "Reflect 30% damage.", icon: ICONS.relicDoubleEdge });
        }
        
        // Meta: Data Cache
        if(Game.hasMetaUpgrade('m_relic')) {
            const pool = [...UPGRADES_POOL];
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
