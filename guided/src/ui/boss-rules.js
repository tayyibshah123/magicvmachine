import { SECTOR_MECHANICS } from '../constants.js';

const countLabel = (count, label) => `${count} ${label}${count === 1 ? '' : 's'}`;

// Read-only descriptions of live encounter rules. The guided HUD owns their
// placement and learning gates; this module never changes combat or the DOM.
export function getBossRules({ enemy, player, sector = 1, turnCount = 0, _activeSectorMech } = {}) {
    if (!enemy || enemy.currentHp <= 0) return [];
    const rules = [];
    const add = (id, title, text, tone = 'info') => rules.push({ id, title, text, tone });
    const minions = (enemy.minions || []).filter(minion => minion && minion.currentHp > 0);
    const mechanic = _activeSectorMech || SECTOR_MECHANICS[sector] || {};
    const heat = mechanic.playerHeatDmg || 0;
    if (heat) add('sector-heat', 'Heat tiles', `End Turn burns you and every ally for ${heat} raw HP damage, bypassing shield.`, 'warning');
    if (mechanic.enemyShieldBonus && !enemy.isBoss) add('sector-shield', 'Frost field',
        `Hostiles begin with ${mechanic.enemyShieldBonus} extra shield. Break shield before damaging HP.`);
    if (mechanic.minionDmgMult) add('sector-minions', 'Hive resonance',
        `Enemy minions can gain ${Math.round((mechanic.minionDmgMult - 1) * 100)}% damage here, rounded down. Their displayed attacks include the bonus.`, 'warning');
    if (mechanic.damageNoiseRange) add('sector-noise', 'Reality glitch',
        `Your attack dice vary by up to ${Math.round(mechanic.damageNoiseRange * 100)}% before timing bonuses.`);
    if (enemy._armedDetonate && !enemy._detonated) add('detonation', 'Blast next player turn',
        `Kill this enemy now to cancel its blast. Otherwise it deals ${typeof enemy.getEffectiveDamage === 'function'
            ? enemy.getEffectiveDamage(Math.max(8, Math.floor(enemy.maxHp / 3)))
            : Math.max(8, Math.floor(enemy.maxHp / 3))} raw damage at your next turn start, before shield fades, then has 1 HP.`, 'danger');

    const shift = player?.effects?.find(effect => effect.id === 'reality_shift' && effect.duration > 0);
    if (shift) add('reversal', 'Reality Shift active',
        'Your attacks and allied attacks heal enemies. Healing harms you and living allies. End Turn lets this reversal expire after your allies act.', 'danger');
    if (enemy.name === 'TESSERACT PRIME') {
        const orbs = minions.filter(minion => minion._isTessFragment);
        if (orbs.length) add('orb-gate', `${orbs.length} orbs protect the boss`,
            'Boss damage is blocked while any orb lives. Target the orbs first.', 'danger');
        else if (enemy._fragmentResummonAt > 0) add('orb-window', 'Boss vulnerable',
            `Orbs return in ${countLabel(Math.max(0, enemy._fragmentResummonAt - turnCount), 'player turn start')}. Use this opening.`, 'warning');
        for (const orb of orbs) {
            const descriptions = {
                heart: `Heals the boss ${Math.max(1, Math.floor(enemy.maxHp * 0.08))} HP each player turn start.`,
                aegis: 'Adds 20 boss shield each player turn start.',
                hex: `Applies Weak every other player turn start. Next application in ${countLabel(Math.max(1, orb._hexCooldown || 1), 'turn start')}.`,
                mender: 'Heals every other living orb by up to 8 HP each player turn start.'
            };
            add(`orb-${orb._tessRole}`, `${orb.name}: ${orb.currentHp}/${orb.maxHp} HP`,
                descriptions[orb._tessRole] || 'Protects the boss.');
        }
        if (!shift && (enemy.phase || 1) >= 2) add('reversal-warning', 'Watch for Reality Shift',
            'Its previewed action reverses damage and healing for your next player phase.', 'warning');
    } else if (enemy.name === 'THE COMPILER') {
        if (enemy.armorPlating > 0) add('compiler-armor', `${enemy.armorPlating} armor hits left`,
            'Each hit deals 90% less damage while armor remains. Multiple small hits remove plates.');
        const supports = minions.filter(minion => minion._isBolsterMech);
        if (supports.length) add('compiler-support', `${supports.length} Bolster Mechs`,
            `Add ${supports.length * 10} boss shield per round. Every third support round primes the next sweep for double damage. Destroying mechs stops their support.`, 'warning');
        if (enemy._bolsterDamageMult > 1) add('compiler-charge', 'Double sweep charged',
            `The next sweep is multiplied by ${enemy._bolsterDamageMult}.`, 'danger');
        add('compiler-recompile', 'Recompile countdown',
            `In ${countLabel(3 - ((enemy._recompileTick || 0) % 3), 'player turn start')}, current debuffs become permanent attack power. Time status effects carefully.`);
        if (enemy.compilerOverheat > 0) add('compiler-heat', 'Boss heat bypasses shield',
            `End Turn also deals ${enemy.compilerOverheat} raw boss heat damage, in addition to ${heat} floor heat.`, 'danger');
    } else if (enemy.name === 'HIVE PROTOCOL') {
        const drones = minions.filter(minion => minion._isHiveDrone);
        const cadence = enemy._hiveResummonEvery || 4;
        const queued = enemy.nextIntents?.some(intent => intent.type === 'summon_hive');
        add('hive-assimilate', `${drones.length} Hive Drones`,
            `Each drone killed can heal the wounded boss by ${Math.floor(enemy.maxHp * 0.05)} HP. Clear threats or focus the boss; this is a trade-off.`, 'warning');
        add('hive-respawn', 'Swarm reinforcement', queued ? 'Refilling missing drones to five this enemy phase.'
            : drones.length >= 5 ? `Full swarm. After drones are lost, reinforcement takes ${cadence} enemy turns.`
                : `Reinforcement in ${countLabel(Math.max(1, cadence - (enemy._hiveTurnCounter || 0)), 'enemy turn')}. Refills missing drones to five.`);
    } else if (enemy.name === 'THE PANOPTICON') {
        if (enemy.eyeLockTurns > 0) {
            const shielded = player?.minions?.some(minion => minion && minion.currentHp > 0);
            add('panopticon-gaze', shielded ? 'Ally breaks eye lock' : 'Eye lock doubles boss damage',
                shielded ? 'Keep a living ally to prevent the focused-gaze damage multiplier.'
                    : 'A living ally breaks line of sight. Without one, boss damage to you doubles.', shielded ? 'info' : 'danger');
        }
        if (enemy.blindProtocol) add('panopticon-blind', 'Blind Protocol',
            `Both sides can miss: ${Math.round((enemy.blindRate ?? 0.2) * 100)}% per damage attempt.`, 'warning');
        if (player?._panopticonNullifyFirst || enemy.nextIntents?.some(intent => intent.type === 'analyse')) {
            add('panopticon-nullify', 'First action will be nullified', 'Sacrifice a less valuable die before playing your main attack.', 'warning');
        }
    } else if (enemy.name === 'NULL_POINTER') {
        add('void-pull', 'Pull of Void grows',
            `Next player turn start pulls ${1 + (enemy.voidPullCount || 0)} raw damage from you and every ally. Shield can absorb it.`, 'warning');
        const spawns = minions.filter(minion => minion.isVoidSpawn);
        if (spawns.length) add('void-spawns', `${spawns.length} Void Spawns`,
            'Each consumes one of your allies and heals the boss by its remaining HP. Without allies, it attacks and drains one mana on a landed hit.', 'warning');
        if (enemy.voidPhase2 && !enemy.voidShared) add('void-surge', 'Void surge',
            'The boss fills both spawn slots; at capacity it permanently strengthens the spawns.');
        if (enemy.voidShared) add('void-shared', 'Linked spawns', 'Damage to one spawn also sends half that damage to its siblings.');
        if (enemy.voidCrushTurns > 0) add('void-crush', 'Void Crush countdown',
            `In ${countLabel(enemy.voidCrushTurns, 'player turn start')}: 100 raw damage and mana becomes zero. Finish the boss or prepare shield.`, 'danger');
        if (enemy.realityShatterDmg > 0) add('void-shatter', 'Reality shatter',
            `End Turn deals ${enemy.realityShatterDmg} raw damage through shield.`, 'danger');
    }
    return rules;
}
