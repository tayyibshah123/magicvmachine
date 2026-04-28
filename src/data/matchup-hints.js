// Class-vs-boss matchup hints. One short tactical line shown on the
// boss-intro slate, tailored to the player's class. The point is to
// translate "this boss does X" into "your class should do Y" so a
// returning player isn't relearning the matchup from scratch.
//
// Keyed: MATCHUP_HINTS[classId][sector]. Sector 6 (Archivist) is
// intentionally absent — its mechanics rotate per fight, so a
// pre-fight hint would be misleading.

export const MATCHUP_HINTS = {
    tactician: {
        1: 'Multi-attack turns reward draw plans — bank pips for the volley.',
        2: 'The boss waits — the void does the work. Pip into clears, not predictions.',
        3: 'A 100-shield wall bows to volume. Pip into draw — out-tempo the armour.',
        4: 'Four actions punishes greedy pips. Hold a defence in reserve.',
        5: 'Reality Overwrite kills your draw plan. Keep a pip on the bench.',
    },
    arcanist: {
        1: 'Ice glyph eases the multi-attack pressure. Save one charge.',
        2: 'Spawns chain on Lightning. Hold mana for the Crush turn.',
        3: 'Fire eats armour fastest. Save the glyph for shield turns.',
        4: 'Lightning chains the swarm. Mana spent here is mana saved.',
        5: 'Purge clears glyphs. Cycle them BEFORE the warning lands.',
    },
    bloodstalker: {
        1: 'Each hit feeds your blood pool. Tribute when the volley ends.',
        2: 'Feed on the spawns. Save tribute for the Crush turn.',
        3: 'The Compiler buffs hard. Don\'t gamble blood pre-strike.',
        4: 'Four hits per turn each take +1. Shield first, bleed later.',
        5: 'Overwrite ignores armour. Stay above lifesteal break-even.',
    },
    annihilator: {
        1: 'Multi-attack = QTE crit windows. Each one earns a reroll.',
        2: 'AoE shines on the swarm. Bomb Bot dies clean here.',
        3: '1.5x damage cuts the wall down two turns faster.',
        4: 'Crits per small hit add up. Hunt the rerolls.',
        5: 'Three actions at full damage. Save rerolls for the kill window.',
    },
    sentinel: {
        1: '30 shield is fragile here. Counter pings every hit in the volley.',
        2: 'Crush is one big hit. Aegis Plates for that turn.',
        3: 'Counter is wasted on shield turns. Bank your break for a strike.',
        4: 'Built for this. Every action of theirs pings your counter.',
        5: 'Aegis Plates beat one Overwrite. Don\'t waste them on fluff.',
    },
    summoner: {
        1: 'Spirits divide the volley. Bloom early and stay wide.',
        2: 'Spirits soak the pull better than you. Keep the grove fed.',
        3: 'Minions keep tempo while you chip. No rush for the kill turn 1.',
        4: 'Wide threats want a wide field. Cap minions before the swarm lands.',
        5: 'Purge can clear the grove. Re-bloom every turn the fight allows.',
    },
};

export function getMatchupHint(classId, sector) {
    if (!classId) return null;
    const byClass = MATCHUP_HINTS[classId];
    if (!byClass) return null;
    return byClass[sector] || null;
}
