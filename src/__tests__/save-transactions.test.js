import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveSync } from '../services/save-sync.js';
import { RetiredUpgrades, RETIRED_UPGRADE_PRICES } from '../services/retired-upgrades.js';
import { abandonSession, freshSession, warmSession } from './helpers/session-fixture.js';
import { V2_SAVE } from './helpers/save-fixtures.js';

let sessions = [];
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
    for (const session of sessions) abandonSession(session);
    sessions = [];
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});
async function game() {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const context = await warmSession();
    sessions.push(context);
    vi.spyOn(context.Game, 'flyRewardToStrip').mockImplementation(() => {});
    return context;
}
const oldProfile = { sparks: '7', sparks_lifetime: '123', upgrades: '["m_life"]', save_v1__A: JSON.stringify(V2_SAVE) };
function seed(values) { for (const [key, value] of Object.entries(values)) localStorage.setItem('mvm_' + key, value); }

describe('validated, recoverable profile imports', () => {
    it.each([null, {}, { version: 1, data: [] }, { version: 1, data: {} },
        { version: 1, data: { sparks: 'NaN' } }, { version: 1, data: { save_v1__A: '{}' } }])('rejects malformed import %# without changing existing progress', blob => {
        seed(oldProfile);
        expect(SaveSync.importAll(blob)).toBe(false);
        expect(SaveSync.exportAll().data).toEqual(oldProfile);
    });

    it('imports valid exported data and leaves non-game storage alone', () => {
        seed(oldProfile);
        localStorage.setItem('unrelated', 'keep');
        const incoming = { sparks: '19', upgrades: '[]', save_v1__C: JSON.stringify(V2_SAVE) };
        expect(SaveSync.importAll({ version: 1, data: incoming })).toBe(true);
        expect(SaveSync.exportAll().data).toEqual(incoming);
        expect(localStorage.getItem('unrelated')).toBe('keep');
    });

    it.each([
        { ...V2_SAVE, map: undefined },
        { ...V2_SAVE, currentIdx: 'missing' },
        { ...V2_SAVE, player: { ...V2_SAVE.player, relics: [null] } },
        { ...V2_SAVE, player: { ...V2_SAVE.player, upgrades: [null] } }
    ])('rejects an unplayable checkpoint %# before replacing the original profile', save => {
        seed(oldProfile);
        expect(SaveSync.importAll({ version: 1, data: { save_v1__A: JSON.stringify(save) } })).toBe(false);
        expect(SaveSync.exportAll().data).toEqual(oldProfile);
    });

    it('accepts an actual current serializer export, including its pending reward receipt', async () => {
        const { Game, STATE } = await game();
        Game._rewardContext = { encounterType: 'elite', killName: 'Test elite' };
        Game.generateRewards({ prepareOnly: true });
        Game.saveGame();
        const receipt = structuredClone(Game.pendingReward);
        const exported = SaveSync.exportAll();
        seed({ sparks: '999' });
        expect(SaveSync.importAll(exported)).toBe(true);
        Game.loadGame();
        expect(Game.currentState).toBe(STATE.REWARD);
        expect(Game.pendingReward).toEqual(receipt);
    });

    it.each([1, 2, 3, 4])('restores the original profile after import write %s fails', failAt => {
        seed(oldProfile);
        const original = Storage.prototype.setItem;
        let writes = 0;
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (++writes === failAt) throw new DOMException('Full', 'QuotaExceededError');
            return original.call(this, key, value);
        });
        expect(SaveSync.importAll({ version: 1, data: { sparks: '999', upgrades: '[]', new_setting: 'new' } })).toBe(false);
        expect(SaveSync.exportAll().data).toEqual(oldProfile);
        expect(SaveSync.lastImportError).toMatch(/preserved|^$/);
    });

    it('keeps a durable original until a blocked rollback can finish on the next boot', () => {
        seed(oldProfile);
        const original = Storage.prototype.setItem;
        const block = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (key === 'mvm_upgrades') throw new DOMException('Blocked', 'SecurityError');
            return original.call(this, key, value);
        });
        expect(SaveSync.importAll({ version: 1, data: { sparks: '999', upgrades: '[]' } })).toBe(false);
        expect(localStorage.getItem('mvm_import_recovery_v1')).toBeTruthy();
        expect(SaveSync.lastImportError).toContain('recovery is pending');
        block.mockRestore();
        expect(SaveSync.recoverImport()).toBe(true);
        expect(SaveSync.exportAll().data).toEqual(oldProfile);
        expect(localStorage.getItem('mvm_import_recovery_v1')).toBeNull();
    });
});

describe('retired upgrade refunds', () => {
    it.each([1, 2, 3, 4, 5])('recovers refund write %s without double credit or changing lifetime earnings', failAt => {
        seed({ sparks: '7', sparks_lifetime: '123', upgrades: JSON.stringify([...Object.keys(RETIRED_UPGRADE_PRICES), 'm_life']),
            meta_disabled: '["s_extra_choice","m_life"]' });
        const original = Storage.prototype.setItem;
        let writes = 0;
        const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (++writes === failAt) throw new DOMException('Full', 'QuotaExceededError');
            return original.call(this, key, value);
        });
        expect(RetiredUpgrades.recoverAndRefund().ok).toBe(false);
        fail.mockRestore();
        expect(RetiredUpgrades.recoverAndRefund()).toEqual({ ok: true, refunded: 80 });
        expect(RetiredUpgrades.recoverAndRefund()).toEqual({ ok: true, refunded: 0 });
        expect(localStorage.getItem('mvm_sparks')).toBe('87');
        expect(localStorage.getItem('mvm_sparks_lifetime')).toBe('123');
        expect(JSON.parse(localStorage.getItem('mvm_upgrades'))).toEqual(['m_life']);
        expect(JSON.parse(localStorage.getItem('mvm_meta_disabled'))).toEqual(['m_life']);
    });

    it('does not offer the eight retired purchases in the actual catalog', async () => {
        const { SPARKS_UPGRADES } = await import('../constants.js');
        expect(SPARKS_UPGRADES.some(item => Object.hasOwn(RETIRED_UPGRADE_PRICES, item.id))).toBe(false);
    });
});

describe('checkpoint navigation', () => {
    it('cancels Challenge through its actual button before clearing the checkpoint or changing mode', async () => {
        const { Game, Challenge } = await game();
        Game.saveGame();
        const raw = Game._readSaveRaw();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        Game.bindEvents();
        document.getElementById('btn-challenge').click();
        expect(Game._readSaveRaw()).toBe(raw);
        expect(Game.challengeMode).toBe(false);
        expect(Challenge.isActive()).toBe(false);
    });
    it('preserves the checkpoint and current run when new-run or abandonment confirmation is cancelled', async () => {
        const { Game, STATE, PLAYER_CLASSES } = await game();
        Game.saveGame();
        const raw = Game._readSaveRaw();
        const player = Game.player;
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        Game.selectClass(PLAYER_CLASSES[1]);
        expect(Game.player).toBe(player);
        expect(Game._readSaveRaw()).toBe(raw);
        expect(Game.abandonRun()).toBe(false);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game._readSaveRaw()).toBe(raw);
    });

    it('saves and returns without losing run currency, then confirms abandonment of only the active slot', async () => {
        const { Game, STATE } = await game();
        Game.techFragments = 87;
        localStorage.setItem(Game._saveKey('C'), JSON.stringify(V2_SAVE));
        expect(Game.saveAndReturn()).toBe(true);
        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game.techFragments).toBe(87);
        Game.loadGame();
        expect(Game.techFragments).toBe(87);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        expect(Game.abandonRun()).toBe(true);
        expect(Game._readSaveRaw()).toBeNull();
        expect(localStorage.getItem(Game._saveKey('C'))).toBe(JSON.stringify(V2_SAVE));
        expect(Game.techFragments).toBe(0);
        expect(JSON.parse(localStorage.getItem('mvm_run_history'))).toHaveLength(1);
        expect(Game.abandonRun()).toBe(false);
    });

    it('stays in the run if Save and Return cannot write its checkpoint', async () => {
        const { Game, STATE } = await game();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
        expect(Game.saveAndReturn()).toBe(false);
        expect(Game.currentState).toBe(STATE.COMBAT);
    });
});

describe('durable post-combat reward receipts', () => {
    it('persists both Daily Dupes pickups and their passive effects before an immediate cold reload', async () => {
        const active = await game();
        const { Game } = active;
        Game.customRunModifiers = new Set(['daily_dupes']);
        Game._applyCustomRunModifiers({ restore: true });
        let randomState = 1;
        vi.spyOn(Math, 'random').mockImplementation(() => {
            randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
            return randomState / 0x100000000;
        });
        // Use the actual offer generator, retaining the first real offer
        // containing a module with a measurable pickup-only passive effect.
        for (let attempt = 0; attempt < 100; attempt++) {
            Game.pendingReward = null;
            Game.generateRewards({ prepareOnly: true });
            if (Game.pendingReward.options.includes('gamblers_chip')) break;
        }
        expect(Game.pendingReward.options).toContain('gamblers_chip');
        Game.saveGame();
        abandonSession(active);
        const restored = await freshSession(active);
        sessions.push(restored);
        vi.spyOn(restored.Game, 'flyRewardToStrip').mockImplementation(() => {});
        restored.Game.loadGame();
        const before = restored.Game.player.maxHp;
        const index = restored.Game.pendingReward.options.indexOf('gamblers_chip');
        document.querySelectorAll('#reward-options .reward-card')[index].onclick();
        const picked = JSON.parse(restored.Game._readSaveRaw());
        expect(picked.player.relics.filter(item => item.id === 'gamblers_chip')).toHaveLength(2);
        expect(picked.player.maxHp).toBe(before - 10);
        // No timer advance is allowed between the pick and this fresh import.
        abandonSession(restored);
        const fresh = await freshSession(restored);
        sessions.push(fresh);
        fresh.Game.loadGame();
        expect(fresh.Game.player.relics.filter(item => item.id === 'gamblers_chip')).toHaveLength(2);
        expect(fresh.Game.player.maxHp).toBe(before - 10);
    });

    it('persists a Dark Contract elite as completed without inventing a reward or replaying its payout', async () => {
        const active = await game();
        const { Game, STATE } = active;
        Game.enemy.isElite = true;
        Game.enemy.currentHp = 0;
        Game._ascEffects = { noEliteRewards: true };
        const won = Game.winCombat();
        await vi.advanceTimersByTimeAsync(400);
        await won;
        expect(Game.pendingReward).toBeNull();
        const fragments = Game.techFragments;
        expect(JSON.parse(Game._readSaveRaw()).map.nodes.find(node => node.id === 'fight').status).toBe('completed');
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(STATE.MAP);
        expect(fresh.Game.pendingReward).toBeNull();
        expect(fresh.Game.techFragments).toBe(fragments);
        expect(fresh.Game.map.nodes.find(node => node.id === 'fight').status).toBe('completed');
    });

    it('finishes the real boss presentation before Save and Return persists its earned choice', async () => {
        const active = await game();
        const { Game, Enemy, BOSS_DATA, STATE } = active;
        Game.sparks = 11;
        Game.sparksLifetime = 21;
        seed({ sparks: '11', sparks_lifetime: '21' });
        Game.saveGame();
        Game.enemy = new Enemy(BOSS_DATA[1], 0);
        Game.enemy.currentHp = 0;
        vi.spyOn(Game, '_runBossDeathDissolve').mockResolvedValue();
        const won = Game.winCombat();
        await vi.advanceTimersByTimeAsync(0);
        const returning = Game.saveAndReturn();
        expect(Game.saveAndReturn()).toBe(returning);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(localStorage.getItem('mvm_sparks')).toBe('11');
        await vi.advanceTimersByTimeAsync(1100);
        await won;
        expect(await returning).toBe(true);
        expect(Game.currentState).toBe(STATE.MENU);
        const receipt = JSON.parse(Game._readSaveRaw()).pendingReward;
        expect(receipt).toMatchObject({ status: 'offered', encounterType: 'boss' });
        const wallet = localStorage.getItem('mvm_sparks');
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(STATE.REWARD);
        expect(fresh.Game.pendingReward).toEqual(receipt);
        expect(localStorage.getItem('mvm_sparks')).toBe(wallet);
    });

    it('restores a real boss reward without repeating boss currency or losing transition penalties', async () => {
        const active = await game();
        const { Game, Enemy, BOSS_DATA } = active;
        Game.enemy = new Enemy(BOSS_DATA[1], 0);
        Game.enemy.currentHp = 0;
        Game._ascEffects = { relicHpCost: 8, sectorCrossDamage: 12 };
        Game._customFragDrainPerSector = 0.10;
        vi.spyOn(Game, '_runBossDeathDissolve').mockResolvedValue();
        const won = Game.winCombat();
        await vi.advanceTimersByTimeAsync(1100);
        await won;
        const pending = structuredClone(Game.pendingReward);
        const wallet = localStorage.getItem('mvm_sparks');
        const files = localStorage.getItem('mvm_encrypted');
        const fragments = Game.techFragments;
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        vi.spyOn(fresh.Game, 'flyRewardToStrip').mockImplementation(() => {});
        vi.spyOn(fresh.Game, 'playSectorIntro').mockImplementation(() => {});
        fresh.Game.loadGame();
        expect(fresh.Game.pendingReward).toEqual(pending);
        expect(localStorage.getItem('mvm_sparks')).toBe(wallet);
        expect(localStorage.getItem('mvm_encrypted')).toBe(files);
        const id = pending.options.find(id => !fresh.UPGRADES_POOL.find(item => item.id === id)?.instant);
        expect(id).toBeTruthy();
        const beforeHp = fresh.Game.player.currentHp;
        document.querySelectorAll('#reward-options .reward-card')[pending.options.indexOf(id)].onclick();
        expect(fresh.Game.sector).toBe(2);
        expect(fresh.Game.player.currentHp).toBe(Math.max(1, beforeHp - 20));
        expect(fresh.Game.techFragments).toBe(fragments - Math.floor(fragments * 0.10));
        fresh.Game.loadGame();
        expect(fresh.Game.sector).toBe(2);
        expect(localStorage.getItem('mvm_sparks')).toBe(wallet);
    });
    it('restores the same real win choices and currencies, then applies a pick once without replaying combat', async () => {
        const active = await game();
        const { Game, STATE, UPGRADES_POOL } = active;
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
        Game.enemy.currentHp = 0;
        const won = Game.winCombat();
        await vi.advanceTimersByTimeAsync(1000);
        await won;
        const receipt = structuredClone(Game.pendingReward);
        expect(receipt).toMatchObject({ status: 'offered', payoutState: 'settled', encounterType: 'combat' });
        expect(receipt.options).toHaveLength(3);
        const fragments = Game.techFragments;
        const sparks = localStorage.getItem('mvm_sparks');
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        vi.spyOn(fresh.Game, 'flyRewardToStrip').mockImplementation(() => {});
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(STATE.REWARD);
        expect(fresh.Game.pendingReward).toEqual(receipt);
        expect(fresh.Game.techFragments).toBe(fragments);
        expect(localStorage.getItem('mvm_sparks')).toBe(sparks);
        expect(fresh.Game.enemy).toBeNull();
        const id = receipt.options.find(id => !UPGRADES_POOL.find(item => item.id === id)?.instant);
        expect(id).toBeTruthy();
        const index = receipt.options.indexOf(id);
        const card = document.querySelectorAll('#reward-options .reward-card')[index];
        const pick = card.onclick;
        pick();
        const count = fresh.Game.player.relics.filter(item => item.id === id).length;
        expect(count).toBe(1);
        pick();
        expect(fresh.Game.player.relics.filter(item => item.id === id)).toHaveLength(count);
        expect(fresh.Game.currentState).toBe(STATE.MAP);
        expect(fresh.Game.pendingReward).toBeNull();
        expect(fresh.Game.map.nodes.find(node => node.id === 'fight').status).toBe('completed');
        expect(JSON.parse(fresh.Game._readSaveRaw()).pendingReward).toBeNull();
    });

    it('finishes a persisted committed boss selection without granting it or advancing a sector twice', async () => {
        const { Game, STATE } = await game();
        Game.pendingReward = { v: 1, id: 'committed', status: 'committed', payoutState: 'settled',
            sector: 1, nodeId: 'fight', encounterType: 'boss', options: ['crit_lens'], selectedId: 'crit_lens' };
        Game.player.relics = [{ id: 'crit_lens' }];
        Game.saveGame();
        vi.spyOn(Game, 'playSectorIntro').mockImplementation(() => {});
        Game.loadGame();
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game.sector).toBe(2);
        expect(Game.player.relics.filter(item => item.id === 'crit_lens')).toHaveLength(1);
        Game.loadGame();
        expect(Game.sector).toBe(2);
        expect(Game.player.relics.filter(item => item.id === 'crit_lens')).toHaveLength(1);
    });
});
