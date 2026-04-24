// Ascension ladder — 10 player-facing difficulty levels.
// Clear a run on Ascension N → unlock Ascension N+1.
// Each level adds one defined twist on top of the previous.

export const ASCENSION_TWISTS = [
    // Level 0 — base game, no twist
    { level: 0,  name: 'Standard',        desc: 'Standard run.',                                   effect: { } },
    { level: 1,  name: 'Tougher Foes',    desc: 'All enemies have +10% HP.',                       effect: { enemyHpMult: 1.10 } },
    { level: 2,  name: 'Sharper Blows',   desc: 'Enemy attacks deal +10% damage.',                 effect: { enemyDmgMult: 1.10 } },
    { level: 3,  name: 'Lean Start',      desc: 'You start each combat with -1 base mana.',        effect: { startManaPenalty: -1 } },
    { level: 4,  name: 'Brittle Hull',    desc: 'You take +1 damage from every source.',           effect: { incomingFlat: 1 } },
    { level: 5,  name: 'Compounding',     desc: 'Stacks the previous four effects.',               effect: { stack: true } },
    { level: 6,  name: 'Heavy Bosses',    desc: 'Bosses gain +25% HP.',                            effect: { bossHpMult: 1.25 } },
    { level: 7,  name: 'Less Reroll',     desc: '-1 reroll per turn.',                             effect: { rerollPenalty: -1 } },
    { level: 8,  name: 'Ablative Foes',   desc: 'All non-boss enemies start with 5 shield.',       effect: { enemyShieldStart: 5 } },
    { level: 9,  name: 'No Mercy',        desc: 'Elites become as strong as bosses.',              effect: { elitesAsBosses: true } },
    { level: 10, name: 'Apex',            desc: 'All prior twists active; relic prices doubled.',  effect: { apex: true, shopPriceMult: 2 } },
    // ---- Ascension 2.0 extension — mechanical twists (not number tweaks).
    // Each L11-L13 twist changes how the player plans a run, not just the
    // numbers the game prints at you.
    { level: 11, name: 'Hungry Relics',   desc: 'Each relic pickup costs 8 HP.',                    effect: { relicHpCost: 8 } },
    { level: 12, name: 'Heat Debt',       desc: 'Crossing a sector boundary deals 12 true damage.', effect: { sectorCrossDamage: 12 } },
    { level: 13, name: 'Sparse Hand',     desc: 'Every combat starts with 1 fewer die in hand.',    effect: { diceCountPenalty: -1 } },
    { level: 14, name: 'Conservation Law',desc: 'Overheal becomes damage over time.',              effect: { overhealBecomesDot: true } },
    { level: 15, name: 'Mirror World',    desc: 'Enemies copy the player\'s last-played die.',     effect: { enemyCopiesLastDie: true } },
    { level: 16, name: 'Endless Loop',    desc: 'Boss Phase 3 lasts two extra turns.',             effect: { bossPhase3Bonus: 2 } },
    { level: 17, name: 'Aurelia\'s Curse',desc: 'All chance rolls are taken twice — worse wins.',  effect: { doubleRollWorse: true } },
    { level: 18, name: 'Dark Contract',   desc: 'No rewards on elite kills.',                      effect: { noEliteRewards: true } },
    { level: 19, name: 'Apostate',        desc: 'Lose one passive meta-upgrade effect per run.',   effect: { loseOneMeta: true } },
    { level: 20, name: 'The Final Archive',desc: 'Archivist (Sector X) becomes a required boss.',  effect: { forceArchivist: true } },
];

const KEY_UNLOCKED = 'mvm_ascension_unlocked';
const KEY_SELECTED = 'mvm_ascension_selected';

export const Ascension = {
    // Highest unlocked level (default 0 — base game always available)
    getUnlocked() {
        const v = parseInt(localStorage.getItem(KEY_UNLOCKED) || '0', 10);
        return Math.max(0, Math.min(ASCENSION_TWISTS.length - 1, v));
    },
    setUnlocked(level) {
        const cap = Math.max(0, Math.min(ASCENSION_TWISTS.length - 1, level));
        const cur = this.getUnlocked();
        if (cap > cur) localStorage.setItem(KEY_UNLOCKED, String(cap));
    },
    // Selected ascension for the next run
    getSelected() {
        const v = parseInt(localStorage.getItem(KEY_SELECTED) || '0', 10);
        const max = this.getUnlocked();
        return Math.max(0, Math.min(max, v));
    },
    setSelected(level) {
        const cap = Math.max(0, Math.min(this.getUnlocked(), level));
        localStorage.setItem(KEY_SELECTED, String(cap));
    },
    twist(level) {
        return ASCENSION_TWISTS[level] || ASCENSION_TWISTS[0];
    },
    // Resolve the cumulative effect at a level (stacks effects ≤ level when twist.stack is true)
    activeEffects(level) {
        const eff = {
            // Legacy L1-L10 keys
            enemyHpMult: 1, enemyDmgMult: 1, startManaPenalty: 0,
            incomingFlat: 0, bossHpMult: 1, rerollPenalty: 0,
            enemyShieldStart: 0, elitesAsBosses: false, apex: false,
            // Ascension 2.0 keys (L11-L20). Data present on the effect
            // object even when the applier isn't yet wired, so UI can
            // surface the active modifier list accurately.
            shopPriceMult: 1,
            relicDecayEveryN: 0,
            maxHpLossPerSector: 0,
            // Tier-41 rewrites
            relicHpCost: 0,
            sectorCrossDamage: 0,
            diceCountPenalty: 0,
            overhealBecomesDot: false,
            enemyCopiesLastDie: false,
            bossPhase3Bonus: 0,
            doubleRollWorse: false,
            noEliteRewards: false,
            loseOneMeta: false,
            forceArchivist: false
        };
        for (let l = 1; l <= level; l++) {
            const t = ASCENSION_TWISTS[l] && ASCENSION_TWISTS[l].effect;
            if (!t) continue;
            // Numeric stacking
            if (t.enemyHpMult)        eff.enemyHpMult      *= t.enemyHpMult;
            if (t.enemyDmgMult)       eff.enemyDmgMult     *= t.enemyDmgMult;
            if (t.startManaPenalty)   eff.startManaPenalty += t.startManaPenalty;
            if (t.incomingFlat)       eff.incomingFlat     += t.incomingFlat;
            if (t.bossHpMult)         eff.bossHpMult       *= t.bossHpMult;
            if (t.rerollPenalty)      eff.rerollPenalty    += t.rerollPenalty;
            if (t.shopPriceMult)      eff.shopPriceMult    *= t.shopPriceMult;
            if (t.maxHpLossPerSector) eff.maxHpLossPerSector = Math.max(eff.maxHpLossPerSector, t.maxHpLossPerSector);
            if (t.relicHpCost)        eff.relicHpCost       = Math.max(eff.relicHpCost, t.relicHpCost);
            if (t.sectorCrossDamage)  eff.sectorCrossDamage = Math.max(eff.sectorCrossDamage, t.sectorCrossDamage);
            if (t.diceCountPenalty)   eff.diceCountPenalty  += t.diceCountPenalty;
            if (t.bossPhase3Bonus)    eff.bossPhase3Bonus  += t.bossPhase3Bonus;
            if (t.relicDecayEveryN)   eff.relicDecayEveryN = t.relicDecayEveryN; // latest wins
            // Max-taking
            if (t.enemyShieldStart) eff.enemyShieldStart = Math.max(eff.enemyShieldStart, t.enemyShieldStart);
            // Flags
            if (t.elitesAsBosses)     eff.elitesAsBosses    = true;
            if (t.apex)               eff.apex              = true;
            if (t.overhealBecomesDot) eff.overhealBecomesDot= true;
            if (t.enemyCopiesLastDie) eff.enemyCopiesLastDie= true;
            if (t.doubleRollWorse)    eff.doubleRollWorse   = true;
            if (t.noEliteRewards)     eff.noEliteRewards    = true;
            if (t.loseOneMeta)        eff.loseOneMeta       = true;
            if (t.forceArchivist)     eff.forceArchivist    = true;
        }
        return eff;
    },
    // Promote unlock if a run is cleared at the current selected level
    onRunVictory(level) {
        if (level >= this.getUnlocked()) {
            this.setUnlocked(level + 1);
            return true;
        }
        return false;
    },
};
