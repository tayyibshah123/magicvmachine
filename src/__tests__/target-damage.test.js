import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Minion } from '../entities/minion.js';
import { BossMinionRoster } from '../services/boss-minion-roster.js';
import { ClassAbility } from '../ui/class-ability.js';
import { TooltipMgr } from '../ui/tooltip.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { renderFor } from './helpers/combat-renderer.js';

beforeEach(() => {
    setupCombatFixture({ classId: 'arcanist', maxHp: 100,
        profiles: ['cosmetics', 'ui', 'renderer', 'terminal-services'] });
    ClassAbility.init(Game);
    ClassAbility.startCombat();
    Game.player.mana = 5;
    Game.player.traits = { ...Game.player.traits, critChance: 0 };
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    vi.spyOn(Game, '_qteWindupAudio').mockImplementation(() => {});
});
afterEach(() => { ClassAbility.endCombat(); teardownCombatFixture(); });

function status(id, val = 0) {
    Game.enemy.addEffect(id, 2, val, '', id);
}

async function playAttack() {
    const die = { id: 0, type: 'ARC_ATTACK', used: false, selected: false };
    Game.dicePool = [die];
    Game.useDie(die, document.createElement('div'), Game.enemy);
    expect(die.used).toBe(true);
    expect(Game.qte.active).toBe(true);
    Game.resolveQTE('fail'); // A missed optional attack bonus retains base power.
    await renderFor(3000);
    expect(Game._combatActionDepth).toBe(0);
}

const receiverCases = [
    { name: 'normal', setup() {}, fire: 12, die: 9 },
    { name: 'Frail', setup() { status('frail'); }, fire: 18, die: 13 },
    { name: 'Overcharge', setup() { status('overcharge'); }, fire: 18, die: 13 },
    { name: 'Hypercharge', setup() { status('overcharge', 1); }, fire: 24, die: 18 },
    { name: 'Overcharge plus Frail', setup() { status('overcharge'); status('frail'); }, fire: 27, die: 19 },
    { name: 'shield', setup() { Game.enemy.shield = 5; }, fire: 12, die: 9, shield: 5 },
    { name: 'Frail behind shield', setup() { status('frail'); Game.enemy.shield = 5; }, fire: 18, die: 13, shield: 5 }
];

describe('target damage has one authoritative receiving step', () => {
    it.each(receiverCases)('Fire preview and actual widget agree for $name', async row => {
        row.setup();
        const effectsBefore = structuredClone(Game.enemy.effects);
        expect(Game.calculateCardDamage(12, 'ATTACK', Game.enemy, { peek: true })).toBe(row.fire);
        expect(Game.enemy.effects).toEqual(effectsBefore);
        const receive = vi.spyOn(Game.enemy, 'takeDamage');
        const action = ClassAbility._activate('arc-tap');
        expect(receive).toHaveBeenCalledWith(12, Game.player);
        expect(Game.enemy.currentHp).toBe(100 - row.fire + (row.shield || 0));
        expect(Game.enemy.shield).toBe(0);
        await renderFor(3000);
        await action;
        expect(receive).toHaveBeenCalledTimes(1);
    });

    it.each(receiverCases)('real die preview and actual attack agree for $name', async row => {
        row.setup();
        expect(Game.calculateCardDamage(9, 'ARC_ATTACK', Game.enemy, { peek: true })).toBe(row.die);
        const receive = vi.spyOn(Game.enemy, 'takeDamage');
        await playAttack();
        expect(receive).toHaveBeenCalledWith(9, Game.player, false, false);
        expect(Game.enemy.currentHp).toBe(100 - row.die + (row.shield || 0));
        expect(Game.enemy.shield).toBe(0);
        expect(receive).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['tribute-major', 20, 30, 5],
        ['tribute-grand', 40, 60, 8]
    ])('%s sends outgoing power once before Frail and preserves its Bleed', async (actionName, power, damage, bleed) => {
        Game.player.classId = 'bloodstalker';
        ClassAbility.startCombat();
        Game.player.takeDamage(10, Game.enemy);
        status('frail');
        const receive = vi.spyOn(Game.enemy, 'takeDamage');
        expect(Game.calculateCardDamage(power, 'ATTACK', Game.enemy, { peek: true })).toBe(damage);
        const action = ClassAbility._activate(actionName);
        expect(Game.enemy.currentHp).toBe(100 - damage);
        expect(Game.enemy.hasEffect('bleed')).toMatchObject({ val: bleed, duration: 3 });
        expect(receive).toHaveBeenCalledWith(power, Game.player);
        await renderFor(3500);
        await action;
        expect(receive).toHaveBeenCalledTimes(1);
    });

    it('previews a late outgoing flat bonus before receiving Frail without consuming the bonus', async () => {
        Game.player.relics.push({ id: 'volt_primer' });
        Game.invalidateStackCache();
        Game._voltPrimerUsedThisTurn = false;
        status('frail');
        expect(Game.calculateCardDamage(12, 'ATTACK', Game.enemy, { peek: true })).toBe(25);
        expect(Game._voltPrimerUsedThisTurn).toBe(false);
        const action = ClassAbility._activate('arc-tap');
        expect(Game.enemy.currentHp).toBe(75);
        expect(Game._voltPrimerUsedThisTurn).toBe(true);
        await renderFor(3000);
        await action;
    });
});

describe('preview uncertainty and immunity', () => {
    it.each(['widget', 'die'])('%s preview never rolls dodge and a real phase miss deals no damage', async source => {
        Game.enemy.kind = 'phase_shift';
        const rng = vi.spyOn(Math, 'random').mockReturnValue(0.1);
        const base = source === 'widget' ? 12 : 9;
        expect(Game.calculateCardDamage(base, 'ARC_ATTACK', Game.enemy, { peek: true })).toBe(base);
        expect(rng).not.toHaveBeenCalled();
        if (source === 'widget') {
            const action = ClassAbility._activate('arc-tap');
            await renderFor(3000);
            await action;
        } else await playAttack();
        expect(Game.enemy.currentHp).toBe(100);
        expect(rng).toHaveBeenCalled();
    });

    it.each(['widget', 'die'])('%s still hits a Phase Stalker when its actual dodge roll fails', async source => {
        Game.enemy.kind = 'phase_shift';
        vi.spyOn(Math, 'random').mockReturnValue(0.9);
        if (source === 'widget') {
            const action = ClassAbility._activate('arc-tap');
            await renderFor(3000);
            await action;
        } else await playAttack();
        expect(Game.enemy.currentHp).toBe(source === 'widget' ? 88 : 91);
    });

    it.each(['widget', 'die'])('%s respects the real living-fragment boss gate', async source => {
        const fragment = new Minion(100, 100, 1, false);
        fragment._isTessFragment = true;
        Game.enemy.minions = [fragment];
        Game.enemy.minionRoster = new BossMinionRoster(Game.enemy, {
            invincibleWhileAnyAlive: true, isMember: minion => !!minion._isTessFragment
        });
        const base = source === 'widget' ? 12 : 9;
        expect(Game.calculateCardDamage(base, 'ARC_ATTACK', Game.enemy, { peek: true })).toBe(0);
        if (source === 'widget') {
            const action = ClassAbility._activate('arc-tap');
            await renderFor(3000);
            await action;
        } else await playAttack();
        expect(Game.enemy.currentHp).toBe(100);
        fragment.currentHp = 0;
        expect(Game.calculateCardDamage(base, 'ARC_ATTACK', Game.enemy, { peek: true })).toBe(base);
    });

    it('renders pre-timing shield damage and states the real chance/gate limitations', () => {
        Game.renderDiceUI.mockRestore();
        const show = vi.spyOn(TooltipMgr, 'show').mockImplementation(() => {});
        Game.dicePool = [{ id: 0, type: 'ARC_ATTACK', used: false, selected: false }];
        status('frail');
        Game.enemy.shield = 5;
        const hover = () => {
            Game.renderDiceUI();
            document.querySelector('.die').onmouseenter({ clientX: 0, clientY: 0 });
            return show.mock.calls.at(-1)[0];
        };
        expect(hover()).toContain('POWER BEFORE TIMING: 13');
        expect(hover()).toContain('8 HP damage after 5 shield');
        Game.enemy.kind = 'phase_shift';
        expect(hover()).toContain('35% chance this attack misses entirely');
        expect(hover()).not.toContain('8 HP damage after 5 shield');
    });
});

describe('widget descriptions use the committed rule values', () => {
    it('matches Ice and Lightning effects, including current held mana', () => {
        const description = ClassAbility._glyphDescriptions();
        expect(description).toMatchObject({
            fire: expect.stringContaining('12 base damage'),
            ice: expect.stringContaining('13 shield (8 + 1 per held mana)'),
            lightning: expect.stringContaining('+1 reroll'),
            cycle: expect.stringContaining('0.7 seconds')
        });
        vi.spyOn((Game.player), 'addShield');
        ClassAbility._ice();
        expect(Game.player.addShield).toHaveBeenCalledWith(13);
        expect(Game.enemy.hasEffect('weak')).toMatchObject({ duration: 1, val: 0.5 });
        const rerolls = Game.rerolls;
        ClassAbility._lightning();
        expect(Game.rerolls).toBe(rerolls + 1);
        Game.player.mana = 7;
        expect(ClassAbility._glyphDescriptions().ice).toContain('15 shield');
        expect(ClassAbility._glyphDescriptions().ice).toContain('50% less enemy damage for 1 turn');
    });
});
