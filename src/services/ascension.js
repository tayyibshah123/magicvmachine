// Ascension ladder — 10 player-facing difficulty levels.
// Clear a run on Ascension N → unlock Ascension N+1.
// Each level adds one defined twist on top of the previous.

export const ASCENSION_TWISTS = [
    // Level 0 — base game, no twist
    { level: 0, name: 'Standard',     desc: 'Standard run.',                              effect: { } },
    { level: 1, name: 'Tougher Foes', desc: 'All enemies have +10% HP.',                 effect: { enemyHpMult: 1.10 } },
    { level: 2, name: 'Sharper Blows',desc: 'Enemy attacks deal +10% damage.',           effect: { enemyDmgMult: 1.10 } },
    { level: 3, name: 'Lean Start',   desc: 'You start each combat with -1 base mana.',  effect: { startManaPenalty: -1 } },
    { level: 4, name: 'Brittle Hull', desc: 'You take +1 damage from every source.',     effect: { incomingFlat: 1 } },
    { level: 5, name: 'Compounding',  desc: 'Stacks the previous four effects.',         effect: { stack: true } },
    { level: 6, name: 'Heavy Bosses', desc: 'Bosses gain +25% HP.',                      effect: { bossHpMult: 1.25 } },
    { level: 7, name: 'Less Reroll',  desc: '-1 reroll per turn.',                       effect: { rerollPenalty: -1 } },
    { level: 8, name: 'Ablative Foes',desc: 'All non-boss enemies start with 5 shield.', effect: { enemyShieldStart: 5 } },
    { level: 9, name: 'No Mercy',     desc: 'Elites become as strong as bosses.',        effect: { elitesAsBosses: true } },
    { level: 10,name: 'Apex',         desc: 'Apex challenge: all twists active + relic prices doubled.', effect: { apex: true } },
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
            enemyHpMult: 1, enemyDmgMult: 1, startManaPenalty: 0,
            incomingFlat: 0, bossHpMult: 1, rerollPenalty: 0,
            enemyShieldStart: 0, elitesAsBosses: false, apex: false
        };
        for (let l = 1; l <= level; l++) {
            const t = ASCENSION_TWISTS[l] && ASCENSION_TWISTS[l].effect;
            if (!t) continue;
            // Levels that don't "stack: true" still apply themselves
            if (t.enemyHpMult)    eff.enemyHpMult    *= t.enemyHpMult;
            if (t.enemyDmgMult)   eff.enemyDmgMult   *= t.enemyDmgMult;
            if (t.startManaPenalty) eff.startManaPenalty += t.startManaPenalty;
            if (t.incomingFlat)   eff.incomingFlat   += t.incomingFlat;
            if (t.bossHpMult)     eff.bossHpMult     *= t.bossHpMult;
            if (t.rerollPenalty)  eff.rerollPenalty  += t.rerollPenalty;
            if (t.enemyShieldStart) eff.enemyShieldStart = Math.max(eff.enemyShieldStart, t.enemyShieldStart);
            if (t.elitesAsBosses) eff.elitesAsBosses = true;
            if (t.apex) eff.apex = true;
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
