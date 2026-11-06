import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../game.js';
import { PLAYER_CLASSES, EVENTS_DB, DICE_TYPES, STATE } from '../constants.js';
import { createCombatPlayer, setupCombatFixture, teardownCombatFixture,
    stubClassEvents, stubTerminalServices } from './helpers/combat-fixture.js';

beforeEach(() => setupCombatFixture({ profiles: ['cosmetics', 'ui', 'terminal-observers'] }));
afterEach(teardownCombatFixture);

function randomSequence(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function unlockUniqueDice() {
    Game.player.relics.push({ id: 'voodoo_doll' }, { id: 'overcharge_chip' }, { id: 'reckless_drive' });
    Game.invalidateStackCache();
}

function die(id, type, extra = {}) {
    return { id, type, used: false, selected: false, ...extra };
}

describe('class-aware base dice and actual hand generation', () => {
    it.each(PLAYER_CLASSES.map(config => [config.id, config.classDice]))('%s deals only its own class base types', (classId, classDice) => {
        createCombatPlayer(classId);
        const expected = new Set(Object.values(classDice));
        expect(Game.BASE_DICE).toEqual(expected);
        expect(Game.BASE_DICE.size).toBe(4);
        expect(Game.UNIQUE_PER_HAND).toEqual(new Set(['RECKLESS_CHARGE', 'OVERCHARGE', 'VOODOO']));
        const available = Game._getAvailableDiceTypes();
        for (const config of PLAYER_CLASSES) for (const type of Object.values(config.classDice)) {
            expect(available.includes(type)).toBe(config.id === classId);
        }
        vi.spyOn(Math, 'random').mockImplementation(randomSequence(31));
        for (let hand = 0; hand < 12; hand++) {
            Game.rollDice(5);
            expect(Game.dicePool).toHaveLength(5);
            expect(new Set(Game.dicePool.map(d => d.id)).size).toBe(5);
            for (const rolled of Game.dicePool) {
                expect([...available, 'SIGNATURE']).toContain(rolled.type);
                expect(rolled.used).toBe(false);
                expect(rolled.selected).toBe(false);
            }
        }
    });

    it('has no base dice without an active class', () => {
        Game.player = null;
        expect(Game.BASE_DICE.size).toBe(0);
    });

    it('guarantees a signature after two actual missed hands and resets its miss streak', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        for (const streak of [1, 2]) {
            Game.rollDice(5);
            expect(Game.dicePool.some(d => d.type === 'SIGNATURE')).toBe(false);
            expect(Game.player.sigMissStreak).toBe(streak);
        }
        Game.rollDice(5);
        expect(Game.dicePool.filter(d => d.type === 'SIGNATURE')).toHaveLength(1);
        expect(Game.player.sigMissStreak).toBe(0);
    });

    it.each(PLAYER_CLASSES.map(config => [config.id, config.classDice.defend]))('%s deals its most-missed base slot and updates actual slot counters', (classId, expected) => {
        createCombatPlayer(classId);
        Game.player._slotMissStreak = { attack: 0, defend: 4, mana: 3, minion: 0 };
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        Game.rollDice(5);
        expect(Game.dicePool[1].type).toBe(expected);
        expect(Game.player._slotMissStreak.defend).toBe(0);
        for (const slot of ['attack', 'mana', 'minion']) {
            const present = Game.dicePool.some(d => Game._dieSlot(d.type) === slot);
            expect(Game.player._slotMissStreak[slot]).toBe(present ? 0 : (slot === 'mana' ? 4 : 1));
        }
    });

    it.each(PLAYER_CLASSES.map(config => [config.id, config.classDice]))('%s guarantees an affordable base die when random picks favor skills', (classId, classDice) => {
        createCombatPlayer(classId);
        // Real available-type filtering and picker still run; choose the last
        // candidate (a shared skill) until the production floor intervenes.
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        Game.rollDice(5);
        expect(Game.dicePool.some(d => Object.values(classDice).includes(d.type))).toBe(true);
        expect(Game.dicePool.slice(0, -1).every(d => !Object.values(classDice).includes(d.type))).toBe(true);
    });

    it('keeps an affordable action when a free signature wins the final slot ahead of the base floor', () => {
        const random = vi.spyOn(Math, 'random');
        for (let slot = 0; slot < 4; slot++) random.mockReturnValueOnce(0.99).mockReturnValueOnce(0.99);
        random.mockReturnValue(0.1);
        Game.rollDice(5);
        expect(Game.dicePool.at(-1).type).toBe('SIGNATURE');
        expect(Game.dicePool.some(d => DICE_TYPES[d.type].cost === 0)).toBe(true);
    });
});

describe('production once-per-hand selection and rerolls', () => {
    it.each(PLAYER_CLASSES.map(config => [config.id]))('%s never duplicates a unique die in actual dealt hands', classId => {
        createCombatPlayer(classId);
        unlockUniqueDice();
        vi.spyOn(Math, 'random').mockImplementation(randomSequence(929));
        const seen = new Set();
        for (let hand = 0; hand < 30; hand++) {
            Game.rollDice(7);
            for (const unique of Game.UNIQUE_PER_HAND) {
                const matches = Game.dicePool.filter(d => d.type === unique);
                expect(matches.length).toBeLessThanOrEqual(1);
                if (matches.length) seen.add(unique);
            }
        }
        expect(seen).toEqual(Game.UNIQUE_PER_HAND);
    });

    it.each([null, new Set()])('picks a real available type with reservation %s', reserved => {
        expect(['TAC_ATTACK', 'TAC_DEFEND']).toContain(Game._pickDiceType(['TAC_ATTACK', 'TAC_DEFEND'], reserved));
    });

    it('reserves unique picks, permits repeat base dice, and uses the documented exhausted-pool fallback', () => {
        const reserved = new Set();
        expect(Game._pickDiceType(['VOODOO'], reserved)).toBe('VOODOO');
        expect(reserved).toEqual(new Set(['VOODOO']));
        expect(Game._pickDiceType(['VOODOO'], reserved)).toBe('VOODOO');
        expect(Game._pickDiceType(['TAC_ATTACK'], reserved)).toBe('TAC_ATTACK');
        expect(reserved.has('TAC_ATTACK')).toBe(false);
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        expect(Game._pickDiceType(['TAC_DEFEND', 'VOODOO'], reserved)).toBe('TAC_DEFEND');
    });

    it('rerolls actual unlocked dice while preserving selected, used and sealed dice and reserved unique types', async () => {
        unlockUniqueDice();
        const locked = die(0, 'VOODOO', { selected: true });
        const used = die(1, 'OVERCHARGE', { used: true });
        const sealed = die(2, 'RECKLESS_CHARGE', { sealed: true });
        const rerolled = [die(3, 'TAC_ATTACK'), die(4, 'TAC_DEFEND')];
        Game.dicePool = [locked, used, sealed, ...rerolled];
        const pick = vi.spyOn(Game, '_pickDiceType');
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        Game.rerollDice();
        expect(Game.rerolls).toBe(1);
        expect(pick).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(520);
        expect(pick).toHaveBeenCalledTimes(2);
        expect(Game.dicePool.slice(0, 3)).toEqual([locked, used, sealed]);
        expect([locked.type, used.type, sealed.type]).toEqual(['VOODOO', 'OVERCHARGE', 'RECKLESS_CHARGE']);
        expect(rerolled.every(d => !Game.UNIQUE_PER_HAND.has(d.type))).toBe(true);
        expect(Game._rerollIntervals).toEqual([]);
        expect(Game._rerollTimeout).toBeNull();
        expect(Game.renderDiceUI).toHaveBeenCalledTimes(1);
    });

    it('rerolls all otherwise eligible dice when every unused die is selected', async () => {
        Game.dicePool = [die(0, 'TAC_ATTACK', { selected: true }), die(1, 'TAC_MANA', { selected: true })];
        const pick = vi.spyOn(Game, '_pickDiceType');
        Game.rerollDice();
        await vi.advanceTimersByTimeAsync(520);
        expect(pick).toHaveBeenCalledTimes(2);
        expect(Game.dicePool.every(d => !d.selected)).toBe(true);
    });

    it('does not spend a reroll when only used and sealed dice remain', () => {
        Game.dicePool = [die(0, 'TAC_ATTACK', { used: true }), die(1, 'TAC_DEFEND', { sealed: true })];
        Game.rerollDice();
        expect(Game.rerolls).toBe(2);
        expect(Game.renderDiceUI).not.toHaveBeenCalled();
        expect(Game._rerollTimeout).toBeNull();
    });

    it.each([
        { name: 'QTE reward', tokens: 1, hp: 100, after: 100, tokensAfter: 0 },
        { name: 'blood cost', tokens: 0, hp: 100, after: 80, tokensAfter: 0 },
        { name: 'suicide prevention', tokens: 0, hp: 20, after: 20, tokensAfter: 0 }
    ])('Annihilator rerolls use $name before changing the real hand', async ({ tokens, hp, after, tokensAfter }) => {
        createCombatPlayer('annihilator', { hp });
        Game.player.shield = 999;
        Game.player.qteRerolls = tokens;
        Game.rerolls = 0;
        Game.dicePool = [die(0, 'ANH_ATTACK')];
        const pick = vi.spyOn(Game, '_pickDiceType');
        Game.rerollDice();
        await vi.advanceTimersByTimeAsync(520);
        expect(Game.player.currentHp).toBe(after);
        expect(Game.player.shield).toBe(999);
        expect(Game.player.qteRerolls).toBe(tokensAfter);
        expect(pick).toHaveBeenCalledTimes(hp <= 20 ? 0 : 1);
        expect(Game.rerolls).toBe(0);
    });

    it.each([1, 3])('settles lethal Fracture at %i HP and cancels any earlier pending reroll', async hp => {
        Game.player.currentHp = hp;
        Game.player.relics.push({ id: 'c_fracture' });
        Game.invalidateStackCache();
        Game.dicePool = [die(0, 'TAC_ATTACK')];
        const pick = vi.spyOn(Game, '_pickDiceType');
        if (hp === 3) {
            Game.rerollDice();
            expect(Game.player.currentHp).toBe(1);
            expect(Game._rerollTimeout).not.toBeNull();
        }
        Game.rerollDice();
        await vi.advanceTimersByTimeAsync(520);
        expect({ hp: Game.player.currentHp, state: Game.currentState,
            deaths: Game.gameOver.mock.calls.length, newPicks: pick.mock.calls.length })
            .toEqual({ hp: 0, state: STATE.GAMEOVER, deaths: 1, newPicks: 0 });
        expect(Game._rerollTimeout).toBeNull();
    });

    it.each([['second_life', 50], ['fusion_phoenix_protocol', 100]])(
        'settles a lethal Fracture through real %s revival before dealing one fresh hand', async (relic, hp) => {
            Game.gameOver.mockRestore();
            stubTerminalServices();
            stubClassEvents();
            const death = vi.spyOn(Game, 'gameOver');
            const roll = vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
            const pick = vi.spyOn(Game, '_pickDiceType');
            Game.player.currentHp = 1;
            Game.player.relics.push({ id: 'c_fracture' }, { id: relic });
            Game.invalidateStackCache();
            Game.dicePool = [die(0, 'TAC_ATTACK')];

            Game.rerollDice();
            expect(Game.player.currentHp).toBe(hp);
            expect(Game.player.hasRelic(relic)).toBeFalsy();
            expect(death).toHaveBeenCalledTimes(1);
            expect(Game.inputLocked).toBe(true);
            expect(Game._revivePending).not.toBeNull();
            await vi.advanceTimersByTimeAsync(520);
            expect(pick).not.toHaveBeenCalled();
            expect(roll).not.toHaveBeenCalled();
            await vi.advanceTimersByTimeAsync(500);
            expect(roll).toHaveBeenCalledTimes(1);
            expect(Game._revivePending).toBeNull();
            expect(Game.currentState).toBe(STATE.COMBAT);
            expect(death).toHaveBeenCalledTimes(1);
        });

    it('clears real scheduled reroll callbacks, and repeated cleanup remains safe', async () => {
        const callback = vi.fn();
        Game._rerollIntervals = [setInterval(callback, 50), setInterval(callback, 70)];
        Game._rerollTimeout = setTimeout(callback, 90);
        Game._clearRerollIntervals();
        Game._clearRerollIntervals();
        await vi.advanceTimersByTimeAsync(1000);
        expect(callback).not.toHaveBeenCalled();
        expect(Game._rerollIntervals).toEqual([]);
        expect(Game._rerollTimeout).toBeNull();
    });
});

describe('sealed hand guarantees', () => {
    it.each([
        { classId: 'tactician', dealt: false }, { classId: 'tactician', dealt: true },
        { classId: 'summoner', dealt: false }, { classId: 'summoner', dealt: true }
    ])('does not carry a previous pin into a new $classId run (dealt: $dealt)', ({ classId, dealt }) => {
        Game.sealDice('attack', 3);
        if (dealt) Game.rollDice(5);
        expect(Game.sealedDie).not.toBeNull();
        const previousPlayer = Game.player;
        stubTerminalServices();
        // Keep actual run reset, class construction and map generation. Only
        // the subsequent screen rendering and persistence are boundaries.
        vi.spyOn(Game, 'changeState').mockImplementation(state => { Game.currentState = state; });
        localStorage.setItem('mvm_first_run_done', '1');

        Game.selectClass(PLAYER_CLASSES.find(config => config.id === classId));

        expect(Game.player).not.toBe(previousPlayer);
        expect(Game.player.classId).toBe(classId);
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game.sealedDie).toBeNull();
        Game.rollDice(5);
        expect(Game.dicePool.every(die => !die.sealed)).toBe(true);
    });

    it('pins three advertised hands through real turn starts without rerolls consuming duration', async () => {
        const event = EVENTS_DB.find(candidate => candidate.title === 'FIRMWARE PIN');
        event.options[0].effect(Game);
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const pinned = [];
        for (let turn = 0; turn < 4; turn++) {
            await Game.startTurn();
            pinned.push(Game.dicePool[0].type === 'TAC_ATTACK' && !!Game.dicePool[0].sealed);
            if (turn === 0) {
                const remaining = Game.sealedDie.turnsLeft;
                Game.rerollDice();
                await vi.advanceTimersByTimeAsync(520);
                expect(Game.sealedDie.turnsLeft).toBe(remaining);
                expect(Game.dicePool[0]).toMatchObject({ type: 'TAC_ATTACK', sealed: true });
            }
        }
        expect(pinned).toEqual([true, true, true, false]);
        expect(Game.sealedDie).toBeNull();
    });

    it('does not consume a promised hand when a turn is canceled before its deal', async () => {
        Game.sealDice('attack', 3);
        let finishBanner;
        const banner = new Promise(resolve => { finishBanner = resolve; });
        Game.showPhaseBanner.mockReturnValueOnce(banner);
        const canceled = Game.startTurn();
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.showPhaseBanner).toHaveBeenCalledTimes(1);
        expect(Game.dicePool).toHaveLength(0);
        Game._combatGen++;
        Game.currentState = STATE.MENU;
        finishBanner();
        await canceled;
        expect(Game.sealedDie.turnsLeft).toBe(3);
        Game.currentState = STATE.COMBAT;
        await Game.startTurn();
        expect(Game.dicePool[0]).toMatchObject({ type: 'TAC_ATTACK', sealed: true });
        expect(Game.sealedDie.turnsLeft).toBe(3);
    });

    it('resolves legacy uppercase slot requests while keeping concrete die requests compatible', () => {
        createCombatPlayer('summoner');
        Game.sealDice('ATTACK', 3);
        Game.rollDice(5);
        expect(Game.dicePool[0]).toMatchObject({ type: 'SUM_ATTACK', sealed: true });
        Game.sealDice('SUM_DEFEND', 3);
        Game.rollDice(5);
        expect(Game.dicePool[0]).toMatchObject({ type: 'SUM_DEFEND', sealed: true });
    });
    it.each(PLAYER_CLASSES.map(config => [config.id, config.classDice]))('FIRMWARE PIN actually pins each promised base slot for %s', (classId, classDice) => {
        createCombatPlayer(classId);
        const event = EVENTS_DB.find(candidate => candidate.title === 'FIRMWARE PIN');
        const actual = [];
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        for (const option of event.options.slice(0, 3)) {
            option.effect(Game);
            Game.rollDice(5);
            actual.push({ type: Game.dicePool[0].type, sealed: Game.dicePool[0].sealed });
        }
        expect(actual).toEqual(['attack', 'defend', 'minion'].map(slot => ({ type: classDice[slot], sealed: true })));
    });

    it('pins an available sealed die into slot zero until its actual expiry', () => {
        Game.sealDice('TAC_DEFEND', 2);
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        Game.rollDice(5);
        expect(Game.dicePool[0]).toMatchObject({ type: 'TAC_DEFEND', sealed: true });
        Game._tickSealedDie();
        expect(Game.sealedDie).toMatchObject({ turnsLeft: 1 });
        Game.rollDice(5);
        expect(Game.dicePool[0]).toMatchObject({ type: 'TAC_DEFEND', sealed: true });
        Game._tickSealedDie();
        expect(Game.sealedDie).toBeNull();
        Game.rollDice(5);
        expect(Game.dicePool.every(d => !d.sealed)).toBe(true);
    });

    it('does not force an unavailable sealed class die into another class hand', () => {
        Game.sealDice('SUM_ATTACK', 2);
        Game.rollDice(5);
        expect(Game.dicePool.some(d => d.type === 'SUM_ATTACK')).toBe(false);
        expect(Game.dicePool.every(d => !d.sealed)).toBe(true);
    });

});

describe('enemy minion accessor', () => {
    it.each([null, { currentHp: 50 }])('handles an absent minion collection on %s', enemy => {
        Game.enemy = enemy;
        expect(Game._enemyMinions()).toEqual([]);
    });
    it('returns the existing minion collection without replacing its identity', () => {
        const minions = [{ currentHp: 10 }, { currentHp: 20 }];
        Game.enemy.minions = minions;
        expect(Game._enemyMinions()).toBe(minions);
    });
});
