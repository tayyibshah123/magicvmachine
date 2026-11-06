import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

let active;
let runtimes;
const page = readFileSync('index.html', 'utf8');

async function runtime({ empty = false } = {}) {
    vi.resetModules();
    document.documentElement.innerHTML = page;
    const [{ Game }, { Player }, { Enemy }, constants, { AudioMgr }, { ParticleSys },
        { ClassAbility }, { ClassBriefing }, { ClassVfx }, { Diag }, { Breakout }] = await Promise.all([
        import('../game.js'), import('../entities/player.js'), import('../entities/enemy.js'),
        import('../constants.js'), import('../audio.js'), import('../effects/particles.js'),
        import('../ui/class-ability.js'), import('../services/class-briefing.js'),
        import('../services/class-vfx.js'), import('../services/diag.js'), import('../services/breakout.js')
    ]);
    for (const method of ['playSound', 'playHit', 'playSting', 'duck', 'startMusic',
        'stopSectorAmbient', 'clearSectorMusic', 'startSectorAmbient', 'setSectorMusic']) {
        vi.spyOn(AudioMgr, method).mockImplementation(() => {});
    }
    for (const method of ['createDamageText', 'createExplosion', 'createFloatingText',
        'createShockwave', 'createSparks', 'createClassBurst', 'clear']) {
        vi.spyOn(ParticleSys, method).mockImplementation(() => {});
    }
    for (const method of ['shake', 'shakeFromDamage', 'haptic', 'hitStop', 'triggerScreenFlash',
        'renderRelics', 'renderDiceUI', '_spawnDieUseBurst', 'updateHUD', 'renderDeathCards',
        'renderRunSummary', '_startMenuPulse']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Game, 'showPhaseBanner').mockResolvedValue();
    vi.spyOn(Game, '_recoverFromCombatError').mockImplementation((where, error) => { throw error; });
    vi.spyOn(ClassBriefing, 'show').mockResolvedValue();
    vi.spyOn(ClassVfx, 'playDeath').mockImplementation(() => {});
    vi.spyOn(Diag, 'dump').mockImplementation(() => {});
    ClassAbility.init(Game);
    Object.assign(Game, {
        currentState: empty ? constants.STATE.MENU : constants.STATE.COMBAT,
        _combatGen: 10, _combatActionDepth: 0, _revivePending: null,
        _combatRecoveryRestart: false, _endTurnRunning: false, _winCombatRunning: false,
        _resolvingSelfDestruct: false, inputLocked: false, paused: false, autoQTE: true,
        qte: { active: false }, sector: 1, turnCount: 2, combatPaceMult: 1,
        metaUpgrades: [], metaToggledOff: new Set(), _disabledMetaThisRun: new Set(),
        challengeMode: false, archiveMode: false, _ascEffects: {}, _activeSectorMech: null,
        _customDmgInMult: 1, _customDmgOutMult: 1, _customRelicPickDupe: false,
        _customRelicPickDmg: 0, customRunModifiers: new Set(), activePacts: new Set(),
        effects: [], runStats: { turns: 2 }, techFragments: 12, encryptedFiles: 0,
        canvas: document.getElementById('gameCanvas'),
        map: { currentIdx: 'fight', nodes: [
            { id: 'start', type: 'start', status: 'completed', x: 50, y: 92, connections: ['fight'] },
            { id: 'fight', type: 'combat', status: 'available', x: 50, y: 70, connections: [] }
        ] }
    });
    if (!empty) {
        Game.player = new Player(constants.PLAYER_CLASSES.find(c => c.id === 'tactician'));
        Game.player.classId = 'tactician';
        Game.enemy = new Enemy({ ...constants.ENEMIES[0], hp: 100, dmg: 10 }, 0);
        ClassAbility.startCombat();
    }
    Game.invalidateStackCache();
    const result = { Game, Player, Enemy, Breakout, ...constants };
    runtimes.push(result);
    return result;
}

function grantRevive(context, id) {
    const record = context.UPGRADES_POOL.find(r => r.id === id)
        || context.MODULE_FUSIONS.find(r => r.id === id);
    context.Game.player.relics.push({ ...record });
    context.Game.invalidateStackCache();
}

function abandon(context) {
    context.Game._combatGen++;
    context.Game.clearTrackedTimers();
    for (const group of context.Game._combatPresentations || []) group.finish(false);
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    localStorage.clear();
    runtimes = [];
    active = await runtime();
});

afterEach(() => {
    for (const context of runtimes) abandon(context);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});

describe('revive restart ownership', () => {
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
    it.each([2, 3])('ends a schema %s zero-HP save without granting free health', async version => {
        const { Game } = active;
        Game.player.currentHp = 0;
        Game.saveGame();
        const data = JSON.parse(Game._readSaveRaw());
        data.v = version;
        if (version === 2) delete data.combatRecovery;
        localStorage.setItem(Game._saveKey(), JSON.stringify(data));
        abandon(active);
        const fresh = await runtime({ empty: true });
        fresh.Game.loadGame();
        expect(fresh.Game.currentState).toBe(fresh.STATE.GAMEOVER);
        expect(fresh.Game.player.currentHp).toBe(0);
        expect(fresh.Game._readSaveRaw()).toBeNull();
        const history = JSON.parse(localStorage.getItem('mvm_run_history'));
        fresh.Game.loadGame();
        expect(JSON.parse(localStorage.getItem('mvm_run_history'))).toEqual(history);
    });

    it.each(['second_life', 'fusion_phoenix_protocol'])('honors %s once after a cold load during lethal presentation', async id => {
        const { Game } = active;
        grantRevive(active, id);
        Game.player.currentHp = 1;
        let release;
        const presentation = new Promise(resolve => { release = resolve; });
        Game._runCombatAction(() => Game.player.takeDamage(20, Game.enemy), () => presentation);
        expect(Game.player.currentHp).toBe(0);
        Game.saveGame();
        expect(JSON.parse(Game._readSaveRaw()).combatRecovery.outcome).toBe('death');
        abandon(active);
        release();
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
        const data = JSON.parse(Game._readSaveRaw());
        data.v = 2;
        delete data.combatRecovery;
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
