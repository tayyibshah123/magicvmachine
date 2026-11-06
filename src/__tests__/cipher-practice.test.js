import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
import { STATE } from '../constants.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';

const markup = readFileSync('index.html', 'utf8');
beforeEach(() => {
    setupCombatFixture({ profiles: ['cosmetics', 'ui'] });
    document.documentElement.innerHTML = markup;
    document.getElementById('intro-overlay')?.remove();
    Object.assign(Game, { currentState: STATE.INTEL, encryptedFiles: 2, sparks: 100, unlockedLore: [], _customDisableLore: false });
    vi.spyOn(Game, 'sleep').mockResolvedValue();
    vi.spyOn(Game, 'grantSparks').mockImplementation(amount => { Game.sparks += amount; });
    vi.spyOn(Game, '_showLoreUnlockPopup').mockImplementation(() => {});
    vi.spyOn(Game, '_checkHiddenLoreTriggers').mockImplementation(() => {});
});
afterEach(teardownCombatFixture);

describe('Cipher informed choice and free practice', () => {
    it('explains the complete stakes before the first paid sequence and cancel spends nothing', () => {
        Game.startHexBreach();
        expect(Game.currentState).toBe(STATE.INTEL);
        const intro = document.getElementById('cipher-intro');
        expect(intro.textContent).toContain('8 Sparks');
        expect(intro.textContent).toContain('Two mistakes');
        expect(intro.textContent).toContain('spend 1 encrypted file');
        document.getElementById('btn-cipher-cancel').click();
        expect(document.getElementById('cipher-intro')).toBeNull();
        expect(Game.encryptedFiles).toBe(2);
        expect(Game.sparks).toBe(100);
    });

    it('completes all real practice rounds without spending a file or awarding currency or lore', async () => {
        Game.encryptedFiles = 0;
        Game.startHexBreach({ practice: true });
        for (let round = 0; round < 3; round++) {
            await vi.advanceTimersByTimeAsync(1000);
            expect(Game.hex.acceptingInput).toBe(true);
            for (const id of [...Game.hex.sequence]) Game.handleHexInput(id);
        }
        expect(document.getElementById('hex-result-title').textContent).toBe('PRACTICE COMPLETE');
        expect(Game.encryptedFiles).toBe(0);
        expect(Game.sparks).toBe(100);
        expect(Game.unlockedLore).toEqual([]);
        expect(Game.grantSparks).not.toHaveBeenCalled();
        expect(localStorage.getItem('mvm_encrypted')).toBeNull();
    });

    it('two real wrong practice inputs give feedback without consuming the inventory', async () => {
        Game.startHexBreach({ practice: true });
        await vi.advanceTimersByTimeAsync(1000);
        Game.handleHexInput((Game.hex.sequence[0] + 1) % 9);
        await vi.advanceTimersByTimeAsync(1500);
        Game.handleHexInput((Game.hex.sequence[0] + 1) % 9);
        expect(document.getElementById('hex-result-title').textContent).toBe('PRACTICE ENDED');
        expect(Game.encryptedFiles).toBe(2);
        expect(Game.sparks).toBe(100);
    });

    it('paid success and failure each consume exactly one file and never settle twice', () => {
        Game.startHexBreach({ confirmed: true });
        Game.winHexBreach();
        Game.winHexBreach();
        expect(Game.encryptedFiles).toBe(1);
        expect(Game.sparks).toBe(108);
        expect(Game.unlockedLore).toEqual([0]);
        expect(Game.grantSparks).toHaveBeenCalledTimes(1);
        Game.startHexBreach({ confirmed: true });
        Game.failHexBreach();
        Game.failHexBreach();
        expect(Game.encryptedFiles).toBe(0);
        expect(Game.sparks).toBe(108);
        expect(JSON.parse(localStorage.getItem('mvm_lore'))).toEqual([0]);
    });

    it('does not let an old memorisation continuation change a replacement practice', async () => {
        let release;
        Game.sleep.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        Game.startHexBreach({ practice: true });
        await vi.advanceTimersByTimeAsync(1000);
        const oldHex = Game.hex;
        Game.changeState(STATE.INTEL);
        Game.startHexBreach({ practice: true });
        release();
        await Promise.resolve();
        expect(Game.hex).not.toBe(oldHex);
        expect(Game.hex.acceptingInput).toBe(false);
        expect(Game.hex.sequence).toEqual([]);
    });

    it('native back dismisses only the Cipher briefing before touching the underlying screen', () => {
        Game.startHexBreach();
        expect(Game.dismissOpenOverlay()).toBe(true);
        expect(document.getElementById('cipher-intro')).toBeNull();
        expect(Game.currentState).toBe(STATE.INTEL);
        expect(Game.encryptedFiles).toBe(2);
    });
});
