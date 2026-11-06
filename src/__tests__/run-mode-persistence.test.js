import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonSession, freshSession, warmSession } from './helpers/session-fixture.js';

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

describe('run rules through actual encounter setup', () => {
    it('records a final Challenge win and its payouts exactly once', async () => {
        const { Game, Enemy, BOSS_DATA, Challenge, STATE } = active;
        Game.sector = 5;
        Game.enemy = new Enemy(BOSS_DATA[5], 0);
        Game.enemy.currentHp = 0;
        Game.challengeMode = true;
        Game._challengeTwist = Challenge.twists[0];
        Game.activePacts = new Set(['test_pact']);
        Challenge.markActive(true);
        for (const method of ['_runBossDeathDissolve', 'triggerSystemCrash', 'sleep']) {
            vi.spyOn(Game, method).mockResolvedValue();
        }
        // Keep real state transitions, save clearing, rewards and both histories.
        for (const method of ['triggerSlowMo', '_checkHiddenLoreTriggers', '_checkTrophyChallenges',
            '_renderPactPills']) vi.spyOn(Game, method).mockImplementation(() => {});
        await Game.winCombat();
        expect(Game.currentState).toBe(STATE.VICTORY);
        expect(Challenge.getHistory()).toHaveLength(1);
        expect(Challenge.getHistory()[0]).toMatchObject({ fragments: 12, turns: 2, pacts: ['test_pact'] });
        const history = JSON.parse(localStorage.getItem('mvm_run_history'));
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ result: 'win', classId: 'tactician' });
        const sparks = Game.sparks;
        expect(sparks).toBeGreaterThanOrEqual(78);
        expect(Game._readSaveRaw()).toBeNull();
        await Game.winCombat();
        expect(Game.sparks).toBe(sparks);
        expect(JSON.parse(localStorage.getItem('mvm_run_history'))).toEqual(history);
        expect(Challenge.getHistory()).toHaveLength(1);
    });
    it('keeps Glassy and custom damage stable through three real combat starts', async () => {
        const { Game, Challenge } = active;
        Game.challengeMode = true;
        Game._challengeTwist = Challenge.twists.find(t => t.id === 'glassy');
        Game.customRunModifiers = new Set(['glass_cannon', 'extra_reroll']);
        Game._applyCustomRunModifiers();
        for (let fight = 0; fight < 3; fight++) {
            Game.startCombat('combat');
            await vi.advanceTimersByTimeAsync(750);
            expect(Game._customDmgOutMult).toBeCloseTo(1.5 * 1.15);
            expect(Game._customDmgInMult).toBeCloseTo(1.5 * 1.15);
            expect(Game.inputLocked).toBe(false);
            expect(Game.dicePool.length).toBeGreaterThan(0);
        }
    });

    it('restores Challenge custom rules after a cold load without regranting starting bonuses', async () => {
        const { Game, Challenge, STATE } = active;
        vi.spyOn(Challenge, 'todayTwist').mockReturnValue(Challenge.twists.find(t => t.id === 'glassy'));
        Game.challengeMode = true;
        Challenge.markActive(true);
        Game.customRunModifiers = new Set(['glass_cannon', 'extra_reroll', 'no_rest', 'starter_kit', 'hard_heart']);
        Game._applyCustomRunModifiers();
        Game.player.currentHp = 11;
        Game.currentState = STATE.MAP;
        Game.saveGame();
        const relicIds = Game.player.relics.map(r => r.id);
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        vi.spyOn(fresh.Challenge, 'todayTwist').mockReturnValue(fresh.Challenge.twists.find(t => t.id === 'glassy'));
        fresh.Game.loadGame();
        expect(fresh.Challenge.isActive()).toBe(true);
        expect(fresh.Game.player.currentHp).toBe(11);
        expect(fresh.Game.player.relics.map(r => r.id)).toEqual(relicIds);
        expect(fresh.Game._customDisableRest).toBe(true);
        expect(fresh.Game.player._customExtraRerolls).toBe(1);
        fresh.Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(750);
        expect(fresh.Game._customDmgOutMult).toBeCloseTo(1.5 * 1.15);
        expect(fresh.Game._customDmgInMult).toBeCloseTo(1.5 * 1.15);
        expect(fresh.Game.player.currentHp).toBe(11);
    });

    it('resets real combat damage and reroll restrictions for a following ordinary run', async () => {
        const { Game } = active;
        Game.customRunModifiers = new Set(['glass_cannon', 'no_reroll']);
        Game._applyCustomRunModifiers();
        Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(750);
        expect(Game.rerolls).toBe(0);
        Game.customRunModifiers.clear();
        Game.challengeMode = false;
        Game._challengeTwist = null;
        Game._applyCustomRunModifiers();
        Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(750);
        expect(Game._customDmgOutMult).toBe(1);
        expect(Game._customDmgInMult).toBe(1);
        expect(Game.rerolls).toBeGreaterThan(0);
    });
});
