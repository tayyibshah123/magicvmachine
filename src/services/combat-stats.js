// Combat-scoped + turn-scoped stat accumulator.
//
// Day 4 — feeds two new UI surfaces:
//   - TurnDigest (top-centre 2s glass card at end of player turn)
//   - CombatRecap (3s portrait-vs-portrait card before reward screen)
//
// Scoped, not run-scoped — Game.runStats keeps doing its job for the
// run-end victory screen. This module owns the smaller windows.
//
// Hooks (all wired from game.js / entity.js):
//   startCombat()  — reset per-combat counters
//   startTurn()    — reset per-turn counters
//   recordDamage(amount, sourceKind, targetKind, opts)
//                  — sourceKind: 'player' | 'minion' | 'enemy' | 'env'
//                    targetKind: 'player' | 'minion' | 'enemy' | 'enemyMinion'
//                    opts.tier:  damage tier from createDamageText (chip/solid/heavy/critical/catastrophic)
//   recordCombo(name)
//   recordParry()              — perfect QTE / parry beat
//   recordDieUsed()
//   recordLifesteal(amount)
//
// Snapshots:
//   snapshotTurn()   — { turn, dealt, taken, diceUsed, classMetric }
//   snapshotCombat() — { dealt, taken, biggestHit, combos, parries, lifesteal, turns }

const EMPTY_TURN = () => ({
    turn: 0,
    dealt: 0,
    taken: 0,
    diceUsed: 0
});

const EMPTY_COMBAT = () => ({
    dealt: 0,
    taken: 0,
    biggestHit: 0,
    combos: [],          // ordered list of combo names
    parries: 0,
    lifesteal: 0,
    turns: 0
});

let combat = EMPTY_COMBAT();
let turn = EMPTY_TURN();

function isPlayerSide(kind) {
    return kind === 'player' || kind === 'minion';
}
function isEnemySide(kind) {
    return kind === 'enemy' || kind === 'enemyMinion';
}

export const CombatStats = {
    startCombat() {
        combat = EMPTY_COMBAT();
        turn = EMPTY_TURN();
    },
    startTurn(turnNumber) {
        // Combat counter mirrors the game's turnCount so the digest can
        // header-stamp without an extra parameter.
        combat.turns = Math.max(combat.turns, turnNumber || 0);
        turn = EMPTY_TURN();
        turn.turn = turnNumber || 0;
    },
    recordDamage(amount, sourceKind, targetKind, opts) {
        if (!amount || amount <= 0) return;
        // Outgoing — player or player-side minion damaging an enemy /
        // enemy-side minion. Bucketed into both dealt and biggestHit so
        // the recap card can highlight the heaviest single landing.
        if (isPlayerSide(sourceKind) && isEnemySide(targetKind)) {
            combat.dealt += amount;
            turn.dealt += amount;
            if (amount > combat.biggestHit) combat.biggestHit = amount;
        }
        // Incoming — enemy-side hitting the player or a player-side minion.
        // Bucketed into taken so the player can read "I bled X this turn".
        else if (isEnemySide(sourceKind) && isPlayerSide(targetKind)) {
            combat.taken += amount;
            turn.taken += amount;
        }
        // Environmental damage to the player (heat tiles, frost ticks)
        // counts as taken even with no source attribution.
        else if (sourceKind === 'env' && isPlayerSide(targetKind)) {
            combat.taken += amount;
            turn.taken += amount;
        }
    },
    recordCombo(name) {
        if (!name) return;
        combat.combos.push(String(name));
    },
    recordParry() { combat.parries++; },
    recordDieUsed() { turn.diceUsed++; },
    recordLifesteal(amount) {
        if (!amount || amount <= 0) return;
        combat.lifesteal += amount;
    },

    snapshotTurn() {
        return { ...turn };
    },
    snapshotCombat() {
        return { ...combat, combos: combat.combos.slice() };
    }
};
