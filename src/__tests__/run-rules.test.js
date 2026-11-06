import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonSession, freshSession, warmSession } from './helpers/session-fixture.js';
import { V2_SAVE } from './helpers/save-fixtures.js';
import { Ascension } from '../services/ascension.js';
import { SaveSync } from '../services/save-sync.js';

let sessions = [];
beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
    for (const session of sessions) abandonSession(session);
    sessions = [];
    vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers(); localStorage.clear();
});
async function game(level = 12, { difficulty = 'ascendant', corruption = 0 } = {}) {
    const context = await warmSession();
    sessions.push(context);
    Ascension.setUnlocked(20);
    Ascension.setSelected(level);
    localStorage.setItem('mvm_difficulty', difficulty);
    context.Game.corruptionLevel = corruption;
    context.Game.saveGame();
    return context;
}
async function cold(active) {
    abandonSession(active);
    const fresh = await freshSession(active);
    sessions.push(fresh);
    fresh.Game.corruptionLevel = 9;
    fresh.Game.loadGame();
    return fresh;
}

describe('a run owns its selected rules', () => {
    it('captures real class selection, including its one A19 disabled meta upgrade', async () => {
        const { Game, PLAYER_CLASSES, STATE } = await game(19);
        Game._clearSave();
        Game.metaUpgrades = ['m_life', 'm_mana'];
        localStorage.setItem('mvm_first_run_done', '1');
        Game.currentState = STATE.CHAR_SELECT;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        Game.selectClass(PLAYER_CLASSES[0]);
        expect(Game._runRules).toMatchObject({ ascension: 19, difficulty: 'ascendant', newcomer: false, origin: 'selected' });
        expect(Game._runRules.disabledMeta).toEqual(['m_life']);
        const disabled = [...Game._disabledMetaThisRun];
        Ascension.setSelected(0);
        localStorage.setItem('mvm_difficulty', 'initiate');
        Game.loadGame();
        expect([...Game._disabledMetaThisRun]).toEqual(disabled);
        expect(Game._getRunAscension()).toBe(19);
        expect(Game._isNewcomer()).toBe(false);
        expect(Game._getDifficultyTier()).toBe('initiate');
    });

    it('cold-resumes actual enemy stats, shop prices and effect costs after next-run preferences change', async () => {
        const active = await game(12, { corruption: 2 });
        const { Game } = active;
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        Game.generateShop();
        const prices = Game.shopInventory.map(item => ({ id: item.id || item.key, cost: item.cost }));
        const saved = JSON.parse(Game._readSaveRaw());
        expect(saved.runRules).toMatchObject({ ascension: 12, corruption: 2, difficulty: 'ascendant' });
        Ascension.setSelected(0);
        localStorage.setItem('mvm_difficulty', 'initiate');
        const fresh = await cold(active);
        const effects = Ascension.activeEffects(12);
        expect(fresh.Game._ascEffects).toEqual(effects);
        expect(fresh.Game._getRunCorruption()).toBe(2);
        expect(fresh.Game._isNewcomer()).toBe(false);
        fresh.Game.generateShop();
        expect(fresh.Game.shopInventory.map(item => ({ id: item.id || item.key, cost: item.cost }))).toEqual(prices);
        const entered = fresh.Game.startCombat('boss');
        await vi.advanceTimersByTimeAsync(3300);
        await entered;
        expect(fresh.Game.enemy.maxHp).toBe(Math.floor(300 * effects.enemyHpMult * 1.4 * effects.bossHpMult));
        expect(fresh.Game.enemy.baseDmg).toBe(Math.floor(20 * effects.enemyDmgMult));
        expect(fresh.Game._ascEffects.relicHpCost).toBe(8);
        expect(fresh.Game._ascEffects.sectorCrossDamage).toBe(12);
    });

    it('retains the actual first-run assist after later class attempts and a different next difficulty', async () => {
        const active = await game(0, { difficulty: 'operator' });
        active.Game._clearSave();
        localStorage.setItem('mvm_first_run_done', '1');
        active.Game.selectClass(active.PLAYER_CLASSES[0]);
        expect(active.Game._isNewcomer()).toBe(true);
        localStorage.setItem('mvm_runs_started', '99');
        localStorage.setItem('mvm_difficulty', 'ascendant');
        const fresh = await cold(active);
        expect(fresh.Game._isNewcomer()).toBe(true);
        const before = fresh.Game.player.currentHp;
        fresh.Game.player.takeDamage(10);
        expect(fresh.Game.player.currentHp).toBe(before - 8);
    });

    it('uses the saved Ascension for a real event payout rather than the next-run selection', async () => {
        const active = await game(12);
        Ascension.setSelected(0);
        const { Game, EVENTS_DB } = await cold(active);
        const pool = EVENTS_DB.filter(event => !event.condition || event.condition(Game));
        const index = pool.findIndex(event => event.title === 'ABANDONED CACHE');
        vi.spyOn(Math, 'random').mockReturnValue((index + 0.1) / pool.length);
        Game.startEvent();
        const option = [...document.querySelectorAll('.event-option-card')].find(button =>
            button.querySelector('.event-option-headline')?.textContent === 'Open');
        expect(option).toBeTruthy();
        const before = Game.techFragments;
        option.onclick();
        expect(Game.techFragments - before).toBe(40);
    });

    it('keeps Conservation Law active in the actual Rest healing caller immediately after cold load', async () => {
        const active = await game(14);
        active.Game.player.maxHp = 100;
        active.Game.player.currentHp = 80;
        active.Game.saveGame();
        Ascension.setSelected(0);
        const { Game } = await cold(active);
        Game.handleRest('sleep');
        expect(Game.player.currentHp).toBe(100);
        expect(Game.player.hasEffect('bleed')).toBeTruthy();
    });

    it('keeps the saved sector-crossing tax in the actual reward choice and sector transition', async () => {
        const active = await game(12);
        active.Game.player.maxHp = 100;
        active.Game.player.currentHp = 90;
        active.Game._rewardContext = { encounterType: 'boss', killName: 'THE PANOPTICON' };
        active.Game.generateRewards({ prepareOnly: true });
        active.Game.saveGame();
        Ascension.setSelected(0);
        const { Game, UPGRADES_POOL } = await cold(active);
        expect(Game.pendingReward.sectorCrossDamage).toBe(12);
        expect(Game.pendingReward.relicHpCost).toBe(8);
        vi.spyOn(Game, 'flyRewardToStrip').mockImplementation(() => {});
        vi.spyOn(Game, 'playSectorIntro').mockImplementation(() => {});
        const index = Game.pendingReward.options.findIndex(id => !UPGRADES_POOL.find(item => item.id === id)?.instant);
        const before = Game.player.currentHp;
        document.querySelectorAll('#reward-options .reward-card')[index].onclick();
        expect(Game.sector).toBe(2);
        // Saved A12 also includes Brittle Hull: its +1 applies to each
        // of the 8 HP pickup and 12 HP boundary damage events.
        expect(Game.player.currentHp).toBe(before - 22);
        expect(Game._getRunAscension()).toBe(12);
    });

    it('uses chosen A20 for actual final-win Sparks, promotion and forced Archivist routing', async () => {
        const active = await game(20);
        const { Game, Enemy, BOSS_DATA, STATE } = active;
        Game.sector = 5;
        Game.enemy = new Enemy(BOSS_DATA[5], 1);
        Game.enemy.currentHp = 0;
        Game.player.relics = [];
        Game.player.currentHp = Game.player.maxHp;
        Game.currentState = STATE.COMBAT;
        Game.saveGame();
        Ascension.setSelected(0);
        const promote = vi.spyOn(Ascension, 'onRunVictory');
        const payout = vi.spyOn(Game, 'grantSparks');
        vi.spyOn(Game, '_runBossDeathDissolve').mockResolvedValue();
        vi.spyOn(Game, 'triggerSystemCrash').mockResolvedValue();
        vi.spyOn(Game, 'playSectorIntro').mockImplementation(() => {});
        const won = Game.winCombat();
        await vi.advanceTimersByTimeAsync(1400);
        await won;
        expect(payout).toHaveBeenCalledWith(75, 'run_win_asc20');
        expect(promote).toHaveBeenCalledWith(20);
        expect(Game.sector).toBe(6);
        expect(Game.archiveMode).toBe(true);
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game._getRunAscension()).toBe(20);
    });
});

describe('migration and import ownership', () => {
    it('adopts missing legacy rules once, persists their provenance and cannot adopt a later preference twice', async () => {
        const { Game } = await game(12);
        localStorage.setItem(Game._saveKey(), JSON.stringify({ ...V2_SAVE, v: 4, pendingReward: null }));
        Game.loadGame();
        expect(Game._runRules).toMatchObject({ ascension: 12, origin: 'legacy' });
        expect(JSON.parse(Game._readSaveRaw()).runRules).toEqual(Game._runRules);
        Ascension.setSelected(0);
        Game.loadGame();
        expect(Game._getRunAscension()).toBe(12);
    });

    it('imports its actual current export and refuses invalid run rules without replacing existing progress', async () => {
        await game(12);
        const exported = SaveSync.exportAll();
        expect(SaveSync.importAll(exported)).toBe(true);
        const malformed = structuredClone(exported);
        const save = JSON.parse(malformed.data.save_v1__A);
        save.runRules.ascension = 999;
        malformed.data.save_v1__A = JSON.stringify(save);
        expect(SaveSync.importAll(malformed)).toBe(false);
        expect(SaveSync.exportAll().data).toEqual(exported.data);
    });
});
