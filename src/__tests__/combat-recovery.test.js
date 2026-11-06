import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonSession, freshSession, grantRevive, warmSession } from './helpers/session-fixture.js';
import { V2_SAVE, saveFixture } from './helpers/save-fixtures.js';

let active;
let runtimes;
async function runtime(options) {
    const result = await freshSession(active, options);
    runtimes.push(result);
    return result;
}
const abandon = abandonSession;

beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    localStorage.clear();
    runtimes = [];
    active = await warmSession();
    runtimes.push(active);
});

afterEach(() => {
    for (const context of runtimes) abandon(context);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});

describe('revive restart ownership', () => {
    it.each(['paused', 'hidden', 'qte', 'endTurn'])('waits for %s to finish before rolling one revival hand', async blocker => {
        const { Game } = active;
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        const roll = vi.spyOn(Game, 'rollDice');
        Game.gameOver();
        if (blocker === 'paused') Game.paused = true;
        if (blocker === 'hidden') vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
        if (blocker === 'qte') Game.qte.active = true;
        if (blocker === 'endTurn') Game._endTurnRunning = true;
        await vi.advanceTimersByTimeAsync(1400);
        expect(roll).not.toHaveBeenCalled();
        expect(Game.inputLocked).toBe(true);
        expect(Game._revivePending).toBeTruthy();
        Game.paused = false;
        vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
        Game.qte.active = false;
        Game._endTurnRunning = false;
        await vi.advanceTimersByTimeAsync(1200);
        expect(roll).toHaveBeenCalledTimes(1);
        expect(Game._revivePending).toBeNull();
        expect(Game.inputLocked).toBe(false);
    });

    it('cancels a pending revive when a replacement combat starts', async () => {
        const { Game } = active;
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        Game.gameOver();
        const oldEnemy = Game.enemy;
        const roll = vi.spyOn(Game, 'rollDice');
        Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(2200);
        expect(Game.enemy).not.toBe(oldEnemy);
        expect(Game._revivePending).toBeNull();
        expect(roll).toHaveBeenCalledTimes(1);
    });
    it.each(['second_life', 'fusion_phoenix_protocol'])('locks the old hand after %s and rolls exactly one fresh hand', async id => {
        const { Game } = active;
        grantRevive(active, id);
        Game.player.currentHp = 0;
        const roll = vi.spyOn(Game, 'rollDice');
        Game.gameOver();
        expect(Game.inputLocked).toBe(true);
        expect(Game._revivePending).toBeTruthy();
        Game._syncSignatureDie();
        const die = { type: 'SIGNATURE', used: false, selected: false };
        Game.dicePool = [die];
        Game.useDie(die, document.createElement('div'), Game.enemy);
        expect(die.used).toBe(false);
        expect(Game.qte.active).toBe(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(roll).toHaveBeenCalledTimes(1);
        expect(Game._revivePending).toBeNull();
        expect(Game.inputLocked).toBe(false);
        expect(document.getElementById('btn-end-turn').disabled).toBe(false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(roll).toHaveBeenCalledTimes(1);
    });

    it('retries a restart held by unfinished work and cancels a later restart on quit', async () => {
        const { Game, STATE } = active;
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        const roll = vi.spyOn(Game, 'rollDice');
        Game.gameOver();
        Game._combatActionDepth = 1;
        await vi.advanceTimersByTimeAsync(1200);
        expect(roll).not.toHaveBeenCalled();
        expect(Game._revivePending).toBeTruthy();
        Game._combatActionDepth = 0;
        await vi.advanceTimersByTimeAsync(100);
        expect(roll).toHaveBeenCalledTimes(1);
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        Game.gameOver();
        Game.quitRun();
        await vi.advanceTimersByTimeAsync(2000);
        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game._revivePending).toBeNull();
        expect(roll).toHaveBeenCalledTimes(1);
    });
});

describe('persistent pending deaths', () => {
    it.each(['boss', 'elite'])('restarts a cold %s recovery through the real encounter setup', async encounter => {
        const { Game, Enemy, BOSS_DATA } = active;
        Game.sector = encounter === 'boss' ? 5 : 1;
        Game.map.nodes[1].type = encounter;
        Game.enemy = new Enemy(encounter === 'boss' ? BOSS_DATA[5] : active.ENEMIES[0], 0, encounter === 'elite');
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        Game.gameOver();
        abandon(active);
        const fresh = await runtime({ empty: true });
        fresh.Game.loadGame();
        await vi.advanceTimersByTimeAsync(2000);
        expect(fresh.Game.currentState).toBe(fresh.STATE.COMBAT);
        expect(fresh.Game.enemy.isBoss).toBe(encounter === 'boss');
        expect(fresh.Game.enemy.isElite).toBe(encounter === 'elite');
        expect(fresh.Game.player.currentHp).toBe(15);
        expect(fresh.Game._revivePending).toBeNull();
        if (encounter === 'boss') {
            expect(fresh.Game.enemy.name).toBe(BOSS_DATA[5].name);
            expect(fresh.Game.enemy.minionRoster).toBeTruthy();
            expect(fresh.Game.enemy.minionRoster.living().length).toBeGreaterThan(0);
        }
    });
    it.each([2, 3])('ends a schema %s zero-HP save without granting free health', async version => {
        const { Game } = active;
        Game.player.currentHp = 0;
        Game.saveGame();
        const data = JSON.parse(Game._readSaveRaw());
        if (version === 2) {
            Object.assign(data, saveFixture(V2_SAVE, { player: { ...V2_SAVE.player, hp: 0, relics: [] } }));
            delete data.combatRecovery;
        }
        localStorage.setItem(Game._saveKey(), JSON.stringify(data));
        abandon(active);
        const fresh = await runtime({ empty: true });
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(fresh.STATE.GAMEOVER);
        expect(fresh.Game.player.currentHp).toBe(0);
        expect(fresh.Game._readSaveRaw()).toBeNull();
        const history = JSON.parse(localStorage.getItem('mvm_run_history'));
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ result: 'loss', classId: 'tactician' });
        fresh.Game.loadGame();
        expect(JSON.parse(localStorage.getItem('mvm_run_history'))).toEqual(history);
    });

    it.each(['second_life', 'fusion_phoenix_protocol'])('honors %s once after a cold load during lethal presentation', async id => {
        const { Game } = active;
        grantRevive(active, id);
        Game.player.currentHp = 1;
        let release;
        const presentation = new Promise(resolve => { release = resolve; });
        const action = Game._runCombatAction(() => Game.player.takeDamage(20, Game.enemy), () => presentation);
        expect(Game.player.currentHp).toBe(0);
        Game.saveGame();
        expect(JSON.parse(Game._readSaveRaw()).combatRecovery.outcome).toBe('death');
        abandon(active);
        release();
        await action;
        const fresh = await runtime({ empty: true });
        const death = vi.spyOn(fresh.Game, 'gameOver');
        const hand = vi.spyOn(fresh.Game, 'rollDice');
        fresh.Game.loadGame();
        const expectedHp = id === 'second_life' ? 15 : 30;
        expect(fresh.Game.player.currentHp).toBe(expectedHp);
        expect(fresh.Game.player.hasRelic(id)).toBeUndefined();
        expect(death).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fresh.Game._readSaveRaw()).combatRecovery.outcome).toBe('revive');
        expect(hand).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1700);
        expect(hand).toHaveBeenCalledTimes(1);
        expect(fresh.Game.player.currentHp).toBe(expectedHp);
    });

    it('does not consume another relic when a consumed Phoenix revive is loaded again', async () => {
        const { Game } = active;
        grantRevive(active, 'fusion_phoenix_protocol');
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        Game.gameOver();
        const saved = JSON.parse(Game._readSaveRaw());
        expect(saved.combatRecovery.outcome).toBe('revive');
        abandon(active);
        const fresh = await runtime({ empty: true });
        const death = vi.spyOn(fresh.Game, 'gameOver');
        fresh.Game.loadGame();
        expect(death).not.toHaveBeenCalled();
        expect(fresh.Game.player.currentHp).toBe(30);
        expect(fresh.Game.player.hasRelic('second_life')).toBeTruthy();
        expect(fresh.Game.player.hasRelic('fusion_phoenix_protocol')).toBeUndefined();
    });

    it.each(['map', 'combat'])('resumes a consumed revive from %s without scheduling two turns', async origin => {
        const { Game, STATE } = active;
        grantRevive(active, 'second_life');
        Game.player.currentHp = 0;
        Game.gameOver();
        Game.currentState = origin === 'map' ? STATE.MAP : STATE.COMBAT;
        const death = vi.spyOn(Game, 'gameOver');
        const hand = vi.spyOn(Game, 'rollDice');
        Game.loadGame();
        expect(Game.player.currentHp).toBe(15);
        expect(Game.player.hasRelic('second_life')).toBeUndefined();
        expect(death).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(3000);
        expect(hand).toHaveBeenCalledTimes(1);
        expect(Game._revivePending).toBeNull();
        expect(Game.inputLocked).toBe(false);
    });

    it('settles an enemy killed in the same fatal hit instead of reviving that enemy', async () => {
        const { Game } = active;
        grantRevive(active, 'second_life');
        Game.enemy.currentHp = 0;
        Game.player.currentHp = 0;
        Game.gameOver();
        abandon(active);
        const fresh = await runtime({ empty: true });
        const win = vi.spyOn(fresh.Game, 'winCombat');
        const restart = vi.spyOn(fresh.Game, 'startCombat');
        const hand = vi.spyOn(fresh.Game, 'rollDice');
        fresh.Game.loadGame();
        expect(fresh.Game.enemy.currentHp).toBe(0);
        expect(win).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(2000);
        expect(win).toHaveBeenCalledTimes(1);
        expect(restart).not.toHaveBeenCalled();
        expect(hand).not.toHaveBeenCalled();
        expect(fresh.Game.player.currentHp).toBe(15);
    });

    it.each(['map', 'combat'])('recovers a same-runtime death loaded from %s without resurrecting it', async origin => {
        const { Game, STATE } = active;
        Game.player.currentHp = 0;
        Game.saveGame();
        Game.currentState = origin === 'map' ? STATE.MAP : STATE.COMBAT;
        Game._combatActionDepth = 1;
        Game.loadGame();
        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.player.currentHp).toBe(0);
        expect(Game._readSaveRaw()).toBeNull();
    });

    it('keeps positive-HP legacy map saves on their existing resume path', async () => {
        const { Game, STATE } = active;
        Game.player.currentHp = 1;
        Game.currentState = STATE.MAP;
        Game.saveGame();
        const data = saveFixture(V2_SAVE, { player: { ...V2_SAVE.player, hp: 1 } });
        localStorage.setItem(Game._saveKey(), JSON.stringify(data));
        abandon(active);
        const fresh = await runtime({ empty: true });
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(STATE.MAP);
        expect(fresh.Game.player.currentHp).toBe(1);
        expect(fresh.Game._revivePending).toBeNull();
    });

    it('restarts a protected Breakout without consuming Second Life', async () => {
        const { Game, STATE } = active;
        grantRevive(active, 'second_life');
        Game.currentState = STATE.BREAKOUT;
        Game.player.currentHp = 0;
        Game.saveGame();
        expect(JSON.parse(Game._readSaveRaw()).combatRecovery.outcome).toBe('breakout');
        abandon(active);
        const fresh = await runtime({ empty: true });
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(STATE.BREAKOUT);
        expect(fresh.Game.player.currentHp).toBe(30);
        expect(fresh.Game.player.hasRelic('second_life')).toBeTruthy();
        expect(fresh.Breakout.isActive()).toBe(true);
    });
});
