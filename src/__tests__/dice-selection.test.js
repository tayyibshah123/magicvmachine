import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { PLAYER_CLASSES } from '../constants.js';
import { createCombatPlayer, setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { mountGamePage, trackBrowserListeners } from './helpers/browser-events.js';

let cleanup;
beforeEach(() => {
    setupCombatFixture({ classId: 'annihilator', profiles: ['cosmetics', 'ui'] });
    Game.renderDiceUI.mockRestore();
    Game.canvas = mountGamePage();
    vi.spyOn(Game.canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, right: 1080, bottom: 1920, width: 1080, height: 1920
    });
    cleanup = trackBrowserListeners();
    Game.bindEvents();
    Game.bindKeyboardShortcuts();
    Game.rerolls = 0;
    Game.player.qteRerolls = 0;
    Game.dicePool = [
        { id: 0, type: 'ANH_DEFEND', used: false, selected: false },
        { id: 1, type: 'ANH_ATTACK', used: false, selected: false }
    ];
    Game.renderDiceUI();
});
afterEach(() => { cleanup(); teardownCombatFixture(); });

function select(mode, index = 0) {
    const tile = document.querySelectorAll('#dice-container .die')[index];
    if (mode === 'keyboard') {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: String(index + 1), bubbles: true }));
    } else if (mode === 'context menu') {
        tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    } else {
        const down = new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
        Object.defineProperty(down, 'pointerType', { value: 'touch' });
        tile.dispatchEvent(down);
        const up = new MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 });
        Object.defineProperty(up, 'pointerType', { value: 'touch' });
        window.dispatchEvent(up);
    }
}

describe('free die locks before paid rerolls', () => {
    it.each(['touch', 'context menu', 'keyboard'])('Annihilator can lock through %s before an actual HP-paid reroll', async mode => {
        const keep = Game.dicePool[0];
        const roll = Game.dicePool[1];
        const picker = vi.spyOn(Game, '_pickDiceType');
        select(mode);
        expect(keep.selected).toBe(true);
        expect(Game.player.currentHp).toBe(100);
        expect(Game.rerolls).toBe(0);
        document.getElementById('btn-reroll').click();
        expect(Game.player.currentHp).toBe(80);
        await vi.advanceTimersByTimeAsync(520);
        expect(picker).toHaveBeenCalledTimes(1);
        expect(Game.dicePool[0]).toBe(keep);
        expect(keep).toMatchObject({ type: 'ANH_DEFEND', selected: true, used: false });
        expect(Game.dicePool[1]).toBe(roll);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Game.player.currentHp).toBe(80);
        expect(picker).toHaveBeenCalledTimes(1);
    });

    it.each([
        { name: 'QTE token', tokens: 1, free: 0, tokensAfter: 0, freeAfter: 0 },
        { name: 'free reroll', tokens: 0, free: 2, tokensAfter: 0, freeAfter: 1 }
    ])('keeps a real selected die and spends exactly one $name without HP loss', async row => {
        Game.player.qteRerolls = row.tokens;
        Game.rerolls = row.free;
        select('touch');
        const picker = vi.spyOn(Game, '_pickDiceType');
        document.getElementById('btn-reroll').click();
        await vi.advanceTimersByTimeAsync(1520);
        expect(Game.player.currentHp).toBe(100);
        expect(Game.player.qteRerolls).toBe(row.tokensAfter);
        expect(Game.rerolls).toBe(row.freeAfter);
        expect(picker).toHaveBeenCalledTimes(1);
        expect(Game.dicePool[0]).toMatchObject({ type: 'ANH_DEFEND', selected: true });
    });

    it.each(PLAYER_CLASSES.map(cls => [cls.id, cls.classDice.defend]))('%s can lock an unused die with no rerolls remaining', (classId, type) => {
        createCombatPlayer(classId);
        Game.dicePool = [{ id: 0, type, selected: false, used: false }];
        Game.renderDiceUI();
        select('context menu');
        expect(Game.dicePool[0].selected).toBe(true);
        expect(Game.rerolls).toBe(0);
        expect(Game.player.currentHp).toBe(100);
    });

    it.each(['touch', 'context menu', 'keyboard'])('does not select a used die through %s', mode => {
        Game.dicePool[0].used = true;
        Game.renderDiceUI();
        select(mode);
        expect(Game.dicePool[0].selected).toBe(false);
    });
});
