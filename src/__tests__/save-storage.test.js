import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonSession, freshSession, warmSession } from './helpers/session-fixture.js';
import { LEGACY_V1_SAVE, V2_SAVE, saveFixture } from './helpers/save-fixtures.js';

let active;
let sessions;
beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    localStorage.clear();
    active = await warmSession();
    sessions = [active];
});
afterEach(() => {
    for (const session of sessions) abandonSession(session);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});

describe('legacy save import durability', () => {
    it('keeps the legacy checkpoint readable when promotion writes are blocked', () => {
        const raw = JSON.stringify(LEGACY_V1_SAVE);
        localStorage.setItem('mvm_save_v1', raw);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
        expect(active.Game._readSaveRaw()).toBe(raw);
        expect(active.Game._readSaveRaw()).toBe(raw);
        expect(localStorage.getItem('mvm_save_v1')).toBe(raw);
    });

    it('imports explicit slot A without touching a different active slot', () => {
        const { Game } = active;
        const raw = JSON.stringify(LEGACY_V1_SAVE);
        localStorage.setItem('mvm_save_v1', raw);
        Game._setActiveSlot('B');
        localStorage.setItem(Game._saveKey('B'), 'other checkpoint');
        expect(Game._readSaveRaw('A')).toBe(raw);
        expect(Game._readSaveRaw('A')).toBe(raw);
        expect(localStorage.getItem(Game._saveKey('B'))).toBe('other checkpoint');
        expect(Game._activeSlot()).toBe('B');
    });
    it('keeps an imported legacy save available on a second read', () => {
        const raw = JSON.stringify(LEGACY_V1_SAVE);
        localStorage.setItem('mvm_save_v1', raw);
        expect(active.Game._readSaveRaw()).toBe(raw);
        expect(active.Game._readSaveRaw()).toBe(raw);
        expect(localStorage.getItem('mvm_save_v1__A')).toBe(raw);
        expect(localStorage.getItem('mvm_save_v1')).toBeNull();
    });

    it('loads an imported legacy save after the next cold startup', async () => {
        localStorage.setItem('mvm_save_v1', JSON.stringify(LEGACY_V1_SAVE));
        // The menu probes for a resumable run before the player taps Resume.
        expect(active.Game._readSaveRaw()).toBeTruthy();
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(fresh.STATE.MAP);
        expect(fresh.Game.player.currentHp).toBe(17);
        expect(fresh.Game.sector).toBe(2);
    });
});

describe('save slot isolation and failures', () => {
    it.each(['A', 'B', 'C'])('loads and clears slot %s without changing the other slots', slot => {
        const { Game, STATE } = active;
        const stored = Object.fromEntries(Game.SAVE_SLOTS.map((id, i) => [id,
            JSON.stringify(saveFixture(V2_SAVE, { fragments: 20 + i, player: { ...V2_SAVE.player, hp: 10 + i } }))]));
        for (const [id, raw] of Object.entries(stored)) localStorage.setItem(Game._saveKey(id), raw);
        Game._setActiveSlot(slot);
        Game.loadGame();
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game.techFragments).toBe(20 + Game.SAVE_SLOTS.indexOf(slot));
        expect(Game.player.currentHp).toBe(10 + Game.SAVE_SLOTS.indexOf(slot));
        Game._clearSave(slot);
        expect(localStorage.getItem(Game._saveKey(slot))).toBeNull();
        for (const id of Game.SAVE_SLOTS.filter(id => id !== slot)) {
            expect(localStorage.getItem(Game._saveKey(id))).toBe(stored[id]);
        }
    });

    it('returns no save rather than throwing when storage reads are blocked', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        expect(() => active.Game._readSaveRaw()).not.toThrow();
        expect(active.Game._readSaveRaw()).toBeNull();
        expect(active.Game._activeSlot()).toBe('A');
    });

    it('preserves the last checkpoint and warns once when writes are blocked', () => {
        const { Game, ParticleSys } = active;
        const raw = JSON.stringify(V2_SAVE);
        localStorage.setItem(Game._saveKey(), raw);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('Blocked', 'SecurityError');
        });
        expect(() => { Game.saveGame(); Game.saveGame(); }).not.toThrow();
        expect(Game._readSaveRaw()).toBe(raw);
        expect(ParticleSys.createFloatingText).toHaveBeenCalledTimes(1);
    });

    it('preserves every slot when a write reaches quota', () => {
        const { Game } = active;
        Game._setActiveSlot('B');
        localStorage.setItem(Game._saveKey('A'), JSON.stringify(V2_SAVE));
        localStorage.setItem(Game._saveKey('B'), 'last good checkpoint');
        localStorage.setItem(Game._saveKey('C'), JSON.stringify({ ...V2_SAVE, padding: 'x'.repeat(300) }));
        const set = Storage.prototype.setItem;
        let attempts = 0;
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (key === Game._saveKey('B') && attempts++ === 0) throw new DOMException('Full', 'QuotaExceededError');
            return set.call(this, key, value);
        });
        const remove = vi.spyOn(Storage.prototype, 'removeItem');
        Game.saveGame();
        expect(attempts).toBe(1);
        expect(remove).not.toHaveBeenCalled();
        expect(localStorage.getItem(Game._saveKey('A'))).toBe(JSON.stringify(V2_SAVE));
        expect(localStorage.getItem(Game._saveKey('C'))).toBeTruthy();
        expect(Game._readSaveRaw()).toBe('last good checkpoint');
    });

    it.each(['{', 'null', '[]', '{"v":3,"player":{"relics":{}}}'])('recovers corrupt snapshot %s without wiping another slot', raw => {
        const { Game } = active;
        localStorage.setItem(Game._saveKey('A'), raw);
        localStorage.setItem(Game._saveKey('C'), JSON.stringify(V2_SAVE));
        const select = vi.spyOn(Game, 'goToCharSelect');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => Game.loadGame()).not.toThrow();
        expect(select).toHaveBeenCalledTimes(1);
        expect(Game._readSaveRaw()).toBeNull();
        expect(localStorage.getItem(Game._saveKey('C'))).toBe(JSON.stringify(V2_SAVE));
    });
});

describe('current save round trip', () => {
    it('restores current run fields in a genuinely fresh module graph', async () => {
        const { Game, STATE } = active;
        Game.currentState = STATE.MAP;
        Game.sector = 6;
        Game._endlessActive = true;
        Game.archiveMode = true;
        Game._archivistFacedThisRun = true;
        Game.techFragments = 77;
        Game.customRunModifiers = new Set(['extra_reroll', 'no_rest']);
        Game.activePacts = new Set(['test_pact']);
        Game.runStats = { turns: 9, totalDamage: 34, highestHit: 21, kills: 3, rerollsUsed: 2,
            perfectQTEs: 1, totalQTEs: 2, damageTaken: 13, synergies: ['test'], deaths: 0, bossFightMinionLosses: 0 };
        Game.player.currentHp = 17;
        Game.player.baseMana = 5;
        Game.player.diceUpgrades = ['ATTACK'];
        Game.player.signatureTier = 2;
        Game.saveGame();
        const saved = JSON.parse(Game._readSaveRaw());
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        fresh.Game.loadGame();
        const actual = fresh.Game;
        expect(actual.currentState).toBe(STATE.MAP);
        expect(actual.player).toMatchObject({ classId: 'tactician', currentHp: 17, maxHp: 30,
            baseMana: 5, diceUpgrades: ['ATTACK'], signatureTier: 2 });
        expect(actual.sector).toBe(6);
        expect(actual.techFragments).toBe(77);
        expect(actual._endlessActive).toBe(true);
        expect(actual.archiveMode).toBe(true);
        expect(actual._archivistFacedThisRun).toBe(true);
        expect([...actual.customRunModifiers]).toEqual(saved.customRunModifiers);
        expect([...actual.activePacts]).toEqual(saved.activePacts);
        expect(actual.runStats).toEqual(saved.runStats);
        expect(actual.map.currentIdx).toBe(saved.currentIdx);
        expect(actual.map.nodes).toMatchObject(saved.map.nodes);
    });
});
