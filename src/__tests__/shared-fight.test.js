import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import '../services/edition-storage.js';
import { Game } from '../game.js';
import { STATE } from '../constants.js';
import { Breakout } from '../services/breakout.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { Share } from '../services/share.js';
import { campaignUrl, SHARED_FIGHT_ID, sharedFightFromUrl } from '../services/shared-fight.js';
import { setupCombatFixture, teardownCombatFixture, createCombatPlayer } from './helpers/combat-fixture.js';
import { renderFrames } from './helpers/combat-renderer.js';

const markup = readFileSync('index.html', 'utf8');
const byId = id => document.getElementById(id);
const checkpoint = ' { "player": { "classId": "sentinel" }, "sector": 3 } ';
const learning = '{"mode":"guided","profile":"original"}';

beforeEach(() => {
    setupCombatFixture({ state: STATE.MENU, profiles: ['cosmetics', 'ui', 'renderer'] });
    document.documentElement.innerHTML = markup;
    byId('intro-overlay')?.remove();
    Game.canvas = byId('gameCanvas');
    Game._modernPacing = true;
    Game._practiceSession = false;
    Game._menuPulseRaf = null;
    window.Game = Game;
    vi.spyOn(Game, '_startMenuPulse').mockImplementation(() => {});
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
});

afterEach(() => {
    Breakout.cancel({ returnToMenu: false });
    Hints.suspend();
    Unlocks.suspendAnnouncements();
    if (Hints._visibilityHandler) document.removeEventListener('visibilitychange', Hints._visibilityHandler);
    Hints._visibilityHandler = null;
    delete window.Game;
    vi.unstubAllGlobals();
    teardownCombatFixture();
});

async function settle(ms, quality = 'good') {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        if (Game.qte.active) Game.resolveQTE(quality);
        await renderFrames([Math.min(50, ms - elapsed)]);
    }
}

async function play(type, target) {
    const die = Game.dicePool.find(card => !card.used && card.type === type);
    expect(die, type).toBeTruthy();
    Game.useDie(die, document.createElement('div'), target);
    await settle(2200);
    expect(die.used).toBe(true);
}

async function endTurn(quality) {
    const pending = Game.endTurn();
    await settle(6000, quality);
    await pending;
}

function seedProfile() {
    localStorage.setItem('mvm_save_v1__A', checkpoint);
    localStorage.setItem('mvm_sparks', '345');
    localStorage.setItem('mvm_learning_v1', learning);
}

function expectProfileIntact() {
    expect(localStorage.getItem('mvm_save_v1__A')).toBe(checkpoint);
    expect(localStorage.getItem('mvm_sparks')).toBe('345');
    expect(localStorage.getItem('mvm_learning_v1')).toBe(learning);
}

describe('shared Relay Drone fight', () => {
    it('recognises one exact versioned link and removes only the fight query on exit', () => {
        const url = 'https://example.test/guided/?fight=tactician-v1&campaign=1#menu';
        expect(sharedFightFromUrl(url)?.id).toBe(SHARED_FIGHT_ID);
        expect(sharedFightFromUrl(url.replace('-v1', '-v2'))).toBeNull();
        expect(sharedFightFromUrl(url.replace('&campaign=1', '&fight=tactician-v1'))).toBeNull();
        expect(campaignUrl(url)).toBe('https://example.test/guided/?campaign=1#menu');
        expect(Game.startSharedFight('tactician-v2')).toBe(false);
        expect(Breakout.isActive()).toBe(false);
    });

    it('plays the same isolated first hand and real intent cycle, shares the win, and restarts the fixed fight', async () => {
        seedProfile();
        createCombatPlayer('sentinel', { hp: 11, maxHp: 55 });
        Game.momentum = 99;
        Game.godMode = true;
        const resume = vi.spyOn(Game, 'loadGame').mockImplementation(() => {});
        const share = vi.spyOn(Share, 'shareRun').mockResolvedValue('copied');
        expect(Game.startSharedFight(SHARED_FIGHT_ID)).toBe(true);
        expect(Game.player).toMatchObject({ classId: 'tactician', currentHp: 24, maxHp: 24 });
        expect(Game.godMode).toBe(false);
        expect(Game.momentum).toBe(0);
        expect(Game.dicePool.map(card => card.type)).toEqual(['TAC_ATTACK', 'TAC_ATTACK', 'TAC_DEFEND']);
        expect(byId('learning-objective').textContent).toContain('deals 9 damage');
        for (let turn = 0; turn < 6 && Breakout.isSharedFight(); turn++) {
            await play('TAC_ATTACK', Game.enemy);
            if (!Breakout.isSharedFight()) break;
            await play('TAC_ATTACK', Game.enemy);
            if (!Breakout.isSharedFight()) break;
            await play('TAC_DEFEND', Game.player);
            await endTurn('good');
            Breakout.renderSharedFightObjective();
            if (turn === 0) expect(byId('learning-objective').textContent).toContain('gains 4 shield');
            if (turn === 1) expect(byId('learning-objective').textContent).toContain('deals 12 damage');
        }
        expect(byId('shared-fight-title').textContent).toBe('Drone defeated');
        expect(byId('shared-fight-stats').textContent).toMatch(/^[2-6] turns · [1-9]\d?\/24 HP$/);
        expect(Game.player).toMatchObject({ classId: 'sentinel', currentHp: 11, maxHp: 55 });
        expect(Game.godMode).toBe(true);
        expectProfileIntact();
        await byId('shared-fight-share').onclick();
        expect(share).toHaveBeenCalledTimes(1);
        expect(share).toHaveBeenCalledWith(expect.objectContaining({
            win: true, maxHp: 24, turns: expect.any(Number), hp: expect.any(Number)
        }), { challengeId: SHARED_FIGHT_ID });
        const { turns, hp } = share.mock.calls[0][0];
        expect(byId('shared-fight-stats').textContent).toBe(`${turns} turns · ${hp}/24 HP`);
        expect(byId('shared-fight-share-feedback').textContent).toBe('Fight link copied.');
        expect(byId('shared-fight-campaign').textContent).toBe('Resume campaign');
        byId('shared-fight-retry').click();
        expect(Game.player.currentHp).toBe(24);
        expect(Game.enemy.currentHp).toBe(32);
        expect(Game.turnCount).toBe(0);
        expectProfileIntact();
        expect(resume).not.toHaveBeenCalled();
    });

    it.each([
        ['miss', false, 'Drone held the relay', '4 turns · 0/24 HP'],
        ['good', true, 'Turn limit reached', '6 turns · 20/24 HP']
    ])('ends a %s defensive route at its real terminal outcome', async (quality, defend, title, stats) => {
        seedProfile();
        Game.startSharedFight(SHARED_FIGHT_ID);
        const originalEnemy = Game.enemy;
        for (let turn = 0; turn < 6 && Breakout.isSharedFight(); turn++) {
            if (defend) await play('TAC_DEFEND', Game.player);
            await endTurn(quality);
        }
        expect(originalEnemy.currentHp).toBe(32);
        expect(Breakout.isActive()).toBe(false);
        expect(byId('shared-fight-title').textContent).toBe(title);
        expect(byId('shared-fight-stats').textContent).toBe(stats);
        expectProfileIntact();
        const resume = vi.spyOn(Game, 'loadGame').mockImplementation(() => {});
        byId('shared-fight-campaign').click();
        expect(resume).toHaveBeenCalledTimes(1);
    });

    it('exits a live timing prompt without any delayed hit or campaign writes', async () => {
        seedProfile();
        createCombatPlayer('sentinel', { hp: 11, maxHp: 55 });
        Game.startSharedFight(SHARED_FIGHT_ID);
        const enemy = Game.enemy;
        const attack = Game.dicePool[0];
        Game.useDie(attack, document.createElement('div'), enemy);
        expect(Game.qte.active).toBe(true);
        localStorage.setItem('mvm_sparks', '2');
        localStorage.removeItem('mvm_save_v1__A');
        byId('learning-objective').querySelector('button').click();
        await settle(4000);
        expect(Breakout.isActive()).toBe(false);
        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game.qte.active).toBe(false);
        expect(enemy.currentHp).toBe(32);
        expect(Game.player).toMatchObject({ classId: 'sentinel', currentHp: 11 });
        expectProfileIntact();
    });

    it('offers the first ordinary share only after the real reward receipt commits', () => {
        createCombatPlayer('sentinel');
        Game.currentState = STATE.REWARD;
        Game.map = { nodes: [] };
        const saved = vi.spyOn(Game, 'saveGame').mockReturnValue(false);
        vi.spyOn(Game, 'renderMap').mockImplementation(() => {});
        const offer = byId('first-fight-share');
        Game.pendingReward = { status: 'committed', sector: 1, encounterType: 'combat', killName: 'Gate Hound' };
        expect(Game._finishPendingReward()).toBe(false);
        expect(offer.classList.contains('hidden')).toBe(true);
        expect(localStorage.getItem('mvm_share_seen_first_fight')).toBeNull();
        saved.mockReturnValue(true);
        expect(Game._finishPendingReward()).toBe(true);
        expect(Game.currentState).toBe(STATE.MAP);
        expect(offer.classList.contains('hidden')).toBe(false);
        expect(byId('first-fight-share-title').textContent).toBe('Defeated Gate Hound');
        expect(localStorage.getItem('mvm_share_seen_first_fight')).toBe('1');
        byId('first-fight-share-dismiss').click();
        Game.pendingReward = { status: 'committed', sector: 1, encounterType: 'combat', killName: 'Data Hound' };
        expect(Game._finishPendingReward()).toBe(true);
        expect(offer.classList.contains('hidden')).toBe(true);
    });
});
