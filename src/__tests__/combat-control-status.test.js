import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Player } from '../entities/player.js';
import { Minion } from '../entities/minion.js';
import { PLAYER_CLASSES, STATE } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { Hints } from '../services/hints.js';

let now;
let hidden;

beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    hidden = false;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    document.body.innerHTML = '<div id="game-container"></div><button id="btn-end-turn"></button>';
    document.body.className = '';
    Object.assign(Game, {
        currentState: STATE.COMBAT, sector: 1, turnCount: 3, _combatGen: 1,
        _endTurnRunning: false, _winCombatRunning: false, _combatActionDepth: 0,
        _combatStartedAt: 0, inputLocked: false, paused: false, autoQTE: false,
        inputCooldown: 0, qte: { active: false }, _ascEffects: {}, godMode: false,
        assistDisabled: true, metaUpgrades: [], metaToggledOff: new Set(),
        _disabledMetaThisRun: new Set(), _customDmgInMult: 1,
        effects: [], runStats: null, turnStats: null, _activeSectorMech: null,
        deadMinionsThisTurn: 0, player: null, enemy: null, combatPaceMult: 1,
        _nextDamageIsCrit: false,
        _archivistTimerBudget: undefined, _archivistTurnExpired: false,
        _archivistClockGen: null, _archivistClockEnemy: null
    });
    for (const method of ['createDamageText', 'createExplosion', 'createFloatingText', 'createShockwave', 'createSparks']) {
        vi.spyOn(ParticleSys, method).mockImplementation(() => {});
    }
    for (const method of ['playSound', 'playHit', 'playSting', 'duck']) {
        vi.spyOn(AudioMgr, method).mockImplementation(() => {});
    }
    for (const method of ['shake', 'shakeFromDamage', 'hitStop', 'triggerScreenFlash', 'haptic', 'drawQTE', '_qteWindupAudio']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Game, 'showPhaseBanner').mockResolvedValue();
    vi.spyOn(Game, '_isNewcomer').mockReturnValue(false);
    vi.spyOn(Hints, 'trigger').mockImplementation(() => {});
    Game.player = new Player(PLAYER_CLASSES.find(c => c.id === 'tactician'));
    Game.player.classId = 'tactician';
    Game.player.maxHp = Game.player.currentHp = 100;
    Game.enemy = new Enemy({ name: 'Test target', hp: 100, dmg: 9, kind: 'detonator' }, 0);
    Game.invalidateStackCache();
});

afterEach(() => {
    Game._stopArchivistTimeControl();
    Game.clearTrackedTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

async function advance(ms) {
    now += ms;
    await vi.advanceTimersByTimeAsync(ms);
}

function stubTurnPresentation() {
    vi.spyOn(Game, 'sleep').mockResolvedValue();
    vi.spyOn(Game, 'showTurnSummary').mockImplementation(() => {});
    vi.spyOn(Game, 'updateHUD').mockImplementation(() => {});
    vi.spyOn(Game, 'startTurn').mockImplementation(() => {});
    return vi.spyOn(Game, '_recoverFromCombatError').mockImplementation(() => {});
}

describe('combat turn input', () => {
    it.each(['qte', 'input', 'presentation', 'enemy phase'])('rejects rerolls during %s', block => {
        Game.rerolls = 2;
        const die = { id: 1, type: 'TAC_ATTACK', used: false };
        Game.dicePool = [die];
        if (block === 'qte') Game.qte.active = true;
        if (block === 'input') Game.inputLocked = true;
        if (block === 'presentation') Game._combatActionDepth = 1;
        if (block === 'enemy phase') Game._endTurnRunning = true;
        const render = vi.spyOn(Game, 'renderDiceUI').mockImplementation(() => {});

        Game.rerollDice();

        expect(Game.rerolls).toBe(2);
        expect(Game.dicePool).toEqual([die]);
        expect(render).not.toHaveBeenCalled();
    });

    it.each(['qte', 'input', 'presentation'])('rejects manual end turn during %s', async block => {
        if (block === 'qte') Game.qte.active = true;
        if (block === 'input') Game.inputLocked = true;
        if (block === 'presentation') Game._combatActionDepth = 1;
        const stop = vi.spyOn(Game, '_stopArchivistTimeControl');

        await Game.endTurn();

        expect(stop).not.toHaveBeenCalled();
        expect(Game._endTurnRunning).toBe(false);
        expect(Game.showPhaseBanner).not.toHaveBeenCalled();
    });

    it('settles the QTE promise only after its asynchronous attack callback finishes', async () => {
        Game.runStats = {};
        let finishAction;
        const action = new Promise(resolve => { finishAction = resolve; });
        const callback = vi.fn(() => action);
        let settled = false;
        const qte = Game.startQTE('ATTACK', 540, 550, callback);
        qte.then(() => { settled = true; });

        const completion = Game.resolveQTE('good');
        await Promise.resolve();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(settled).toBe(false);

        finishAction();
        await completion;
        await qte;
        expect(settled).toBe(true);
        Game.resolveQTE('good');
        expect(callback).toHaveBeenCalledTimes(1);
        expect(Game.runStats.totalQTEs).toBe(1);
    });

    it('observes rejected attack callbacks and still settles the QTE', async () => {
        const error = new Error('attack failed');
        const recover = vi.spyOn(Game, '_recoverFromCombatError').mockImplementation(() => {});
        const qte = Game.startQTE('ATTACK', 540, 550, async () => { throw error; });

        await Game.resolveQTE('good');
        await qte;

        expect(recover).toHaveBeenCalledWith('QTE action', error, false);
    });

    it('keeps automatic QTE input locked and delays its callback during pause', async () => {
        Game.autoQTE = true;
        const callback = vi.fn();
        const qte = Game.startQTE('ATTACK', 540, 550, callback);
        Game.paused = true;
        await advance(1000);
        expect(Game.qte.active).toBe(true);
        expect(callback).not.toHaveBeenCalled();

        Game.paused = false;
        await advance(200);
        await qte;

        expect(Game.qte.active).toBe(false);
        expect(callback).toHaveBeenCalledOnce();
    });

    it('automatically scores every declared chain wave once at the good tier', async () => {
        Game.autoQTE = true;
        const onWave = vi.fn();
        const qte = Game.startQTE('ATTACK', 540, 550, null,
            { pattern: 'multi', waves: 3, onWave });

        await advance(300);
        await qte;

        expect(onWave.mock.calls).toEqual([
            ['good', 0, 1.15], ['good', 1, 1.15], ['good', 2, 1.15]
        ]);
    });

    it('actual automatic Starfall settles damage and presents all three meteors', async () => {
        Game.autoQTE = true;
        Game.player.mana = 10;
        Game.player.diceUpgrades.push('METEOR');
        Game._customHotHandsDmg = 0;
        Game._customDmgOutMult = 1;
        Game.attacksThisTurn = 0;
        Game.diceUsedThisTurn = 0;
        Game.firstAttackDealt = false;
        for (const method of ['renderDiceUI', 'updateHUD', '_spawnDieUseBurst', '_checkHiddenLoreTriggers']) {
            vi.spyOn(Game, method).mockImplementation(() => {});
        }
        const visuals = vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
        const win = vi.spyOn(Game, 'winCombat').mockImplementation(() => { Game.currentState = STATE.COMBAT_WIN; });
        const enemy = Game.enemy;
        const die = { id: 1, type: 'METEOR', used: false, selected: false };
        Game.dicePool = [die];

        Game.useDie(die, document.createElement('div'), enemy);
        expect(die.used).toBe(true);
        expect(enemy.currentHp).toBe(100);
        await advance(300);

        expect(enemy.currentHp).toBe(0);
        expect(win).not.toHaveBeenCalled();
        await advance(2000);

        expect(visuals.mock.calls.filter(call => call[0] === 'orbital_strike')).toHaveLength(3);
        expect(visuals.mock.calls.every(call => typeof call[3] !== 'function')).toBe(true);
        expect(win).toHaveBeenCalledTimes(1);
    });

    it('discards a QTE callback captured in a previous combat', async () => {
        const callback = vi.fn();
        const qte = Game.startQTE('ATTACK', 540, 550, callback);
        Game._combatGen++;

        await Game.resolveQTE('good');
        await qte;

        expect(callback).not.toHaveBeenCalled();
    });
});

describe('Archivist turn clock', () => {
    it('defers expiry through a QTE and its presentation, then ends the turn once', async () => {
        const end = vi.spyOn(Game, 'endTurn').mockResolvedValue();
        Game._startArchivistTimeControl();
        Game.qte.active = true;
        await advance(30000);
        expect(Game._archivistTurnExpired).toBe(true);
        expect(end).not.toHaveBeenCalled();
        Game.qte.active = false;
        Game._combatActionDepth = 1;
        await advance(1000);
        expect(end).not.toHaveBeenCalled();

        Game._combatActionDepth = 0;
        expect(Game._tryResolveExpiredTurn()).toBe(true);
        Game._tryResolveExpiredTurn();
        await advance(1000);
        expect(end).toHaveBeenCalledTimes(1);
    });

    it('does not charge paused time against the turn budget', async () => {
        Game._startArchivistTimeControl();
        await advance(1000);
        const remaining = Game._archivistTimerRemaining;
        Game.paused = true;
        await advance(60000);
        expect(Game._archivistTimerRemaining).toBe(remaining);
        Game.paused = false;
        await advance(100);
        expect(Game._archivistTimerRemaining).toBe(remaining);
        await advance(1000);
        expect(Game._archivistTimerRemaining).toBe(remaining - 1000);
    });

    it('rebases across hidden time even if no background interval was delivered', async () => {
        Game._startArchivistTimeControl();
        await advance(1000);
        const remaining = Game._archivistTimerRemaining;
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
        now += 60000;
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));

        await advance(100);

        expect(Game._archivistTimerRemaining).toBe(remaining - 100);
    });

    it('drops a pending timeout when combat is replaced', async () => {
        const end = vi.spyOn(Game, 'endTurn').mockResolvedValue();
        Game._startArchivistTimeControl();
        Game.qte.active = true;
        await advance(30000);
        Game._combatGen++;
        Game.enemy = new Enemy({ name: 'Replacement', hp: 50, dmg: 5 }, 0);
        Game.qte.active = false;

        expect(Game._tryResolveExpiredTurn()).toBe(false);
        expect(Game._archivistTurnExpired).toBe(false);
        expect(end).not.toHaveBeenCalled();
    });

    it('shrinks successive budgets to the ten-second floor and resets for a new fight', () => {
        for (let i = 0; i < 25; i++) Game._startArchivistTimeControl();
        expect(Game._archivistTimerBudget).toBe(10000);
        Game._combatGen++;

        Game._startArchivistTimeControl();

        expect(Game._archivistTimerBudget).toBe(30000);
    });
});

describe('phase-bound status effects', () => {
    it('one-turn Stun replaces the queued attack and is consumed by the skipped enemy phase', async () => {
        const recover = stubTurnPresentation();
        Game.enemy.decideTurn();
        expect(Game.enemy.nextIntents[0].type).toBe('attack');
        Game.enemy.addEffect('stun', 1, 0, '', 'Skip turn');
        Game.enemy.updateEffects();
        expect(Game.enemy.hasEffect('stun').duration).toBe(1);
        expect(Game.enemy.nextIntents[0].type).toBe('stunned');

        await Game.endTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(Game.player.currentHp).toBe(100);
        expect(Game.enemy.hasEffect('stun')).toBeFalsy();
        Game.enemy.decideTurn();
        expect(Game.enemy.nextIntents[0].type).toBe('attack');
    });

    it('two turns of Stun skip exactly two enemy phases', async () => {
        const recover = stubTurnPresentation();
        Game.enemy.addEffect('stun', 2, 0, '', 'Skip turns');
        await Game.endTurn();
        expect(Game.enemy.hasEffect('stun').duration).toBe(1);
        Game.enemy.updateEffects();
        Game.enemy.decideTurn();

        await Game.endTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(Game.player.currentHp).toBe(100);
        expect(Game.enemy.hasEffect('stun')).toBeFalsy();
    });

    it('keeps Reality Shift through a playable turn and expires it after allied actions', async () => {
        const recover = stubTurnPresentation();
        Game.player.addEffect('reality_shift', 1, 1, '', 'Invert');
        Game.player.updateEffects();
        expect(Game.player.hasEffect('reality_shift').duration).toBe(1);
        Game.enemy.currentHp = 50;
        Game.enemy.takeDamage(5, Game.player);
        expect(Game.enemy.currentHp).toBe(55);
        Game.player.heal(10);
        expect(Game.player.currentHp).toBe(90);
        Game.enemy.nextIntents = [{ type: 'charge', val: 0 }];

        await Game.endTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(Game.player.hasEffect('reality_shift')).toBeFalsy();
        expect(document.body.classList.contains('reality-shift-active')).toBe(false);
        Game.enemy.takeDamage(5, Game.player);
        expect(Game.enemy.currentHp).toBe(50);
    });
});

describe('settled enemy-minion strikes', () => {
    function attacker() {
        const minion = new Minion(400, 600, 1, false, 2);
        minion.dmg = 10;
        Game.enemy.minions = [minion];
        return minion;
    }

    it('asks for timing before damage and presents a laser without a damage callback', async () => {
        const minion = attacker();
        Game.enemy.currentHp = 50;
        let answer;
        const timing = new Promise(resolve => { answer = resolve; });
        const prompt = vi.spyOn(Game, 'startQTE').mockReturnValue(timing);
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        const visual = vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});

        const strike = Game._resolveEnemyMinionStrike(minion, Game.player);
        expect(Game.player.currentHp).toBe(100);
        expect(Game._combatActionDepth).toBe(1);
        expect(prompt).toHaveBeenCalledWith('DEFEND', Game.player.x, Game.player.y, null,
            expect.objectContaining({ shortTiming: true, incomingDamage: 10 }));
        answer(0.6);
        await strike;

        expect(Game.player.currentHp).toBe(94);
        expect(Game.enemy.currentHp).toBe(52);
        expect(visual).toHaveBeenCalledWith('micro_laser', minion, Game.player, null, { settledDamage: true });
        expect(Game._combatActionDepth).toBe(0);
        expect(Game.inputLocked).toBe(false);
    });

    it('a full block prevents damage, leech and void mana drain', async () => {
        const minion = attacker();
        Game.enemy.currentHp = 50;
        Game.player.mana = 3;
        vi.spyOn(Game, 'startQTE').mockResolvedValue(0);
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});

        await Game._resolveEnemyMinionStrike(minion, Game.player);
        await Game._resolveEnemyMinionStrike(minion, Game.player, { voidDrain: true });

        expect(Game.player.currentHp).toBe(100);
        expect(Game.player.mana).toBe(3);
        expect(Game.enemy.currentHp).toBe(50);
    });

    it('settles void damage and mana drain once, before its presentation completes', async () => {
        const minion = attacker();
        Game.player.mana = 3;
        Game.enemy.currentHp = 50;
        vi.spyOn(Game, 'startQTE').mockResolvedValue(1);
        let finish;
        const presentation = new Promise(resolve => { finish = resolve; });
        vi.spyOn(Game, '_presentCombatHits').mockReturnValue(presentation);

        const strike = Game._resolveEnemyMinionStrike(minion, Game.player, { voidDrain: true });
        await advance(0);
        expect(Game.player.currentHp).toBe(90);
        expect(Game.player.mana).toBe(2);
        expect(Game.enemy.currentHp).toBe(50);
        expect(Game.inputLocked).toBe(true);
        finish();
        await strike;
        expect(Game.player.currentHp).toBe(90);
        expect(Game.player.mana).toBe(2);
    });

    it('defers a lethal minion hit until its complete presentation', async () => {
        const minion = attacker();
        Game.player.currentHp = 5;
        vi.spyOn(Game, 'startQTE').mockResolvedValue(1);
        let finish;
        const presentation = new Promise(resolve => { finish = resolve; });
        vi.spyOn(Game, '_presentCombatHits').mockReturnValue(presentation);
        const death = vi.spyOn(Game, 'gameOver').mockImplementation(() => { Game.currentState = STATE.GAMEOVER; });

        const strike = Game._resolveEnemyMinionStrike(minion, Game.player);
        await advance(0);
        expect(Game.player.currentHp).toBe(0);
        expect(death).not.toHaveBeenCalled();
        finish();
        expect(await strike).toBe(false);
        expect(death).toHaveBeenCalledTimes(1);
    });

    it('drops a minion strike when combat changes during the timing prompt', async () => {
        const minion = attacker();
        let answer;
        vi.spyOn(Game, 'startQTE').mockReturnValue(new Promise(resolve => { answer = resolve; }));
        const visual = vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
        const strike = Game._resolveEnemyMinionStrike(minion, Game.player);
        const oldPlayer = Game.player;
        Game._combatGen++;
        Game.enemy = new Enemy({ name: 'Replacement', hp: 50, dmg: 5 }, 0);
        Game.inputLocked = false;
        Game._combatActionDepth = 0;

        answer(1);
        await strike;

        expect(oldPlayer.currentHp).toBe(100);
        expect(Game.enemy.currentHp).toBe(50);
        expect(visual).not.toHaveBeenCalled();
        expect(Game._combatActionDepth).toBe(0);
        expect(Game.inputLocked).toBe(false);
    });

    it('short defensive timing preserves the old full-parry outcome', async () => {
        Game.enemy.currentHp = 100;
        const qte = Game.startQTE('DEFEND', Game.player.x, Game.player.y, null,
            { shortTiming: true, incomingDamage: 10 });
        expect(Game.qte.warmupTimer).toBe(0.25);

        await Game.resolveQTE('perfect');

        expect(await qte).toBe(0);
        expect(Game.enemy.currentHp).toBe(100);
    });

    it.each([
        ['perfect', 1.3, 'DART +30%'],
        ['good', 1.1, 'DART +10%'],
        ['fail', 1, 'DART READY']
    ])('keeps dart %s boost and its displayed percentage consistent', async (quality, multiplier, message) => {
        const qte = Game.startQTE('ATTACK', Game.enemy.x, Game.enemy.y, null,
            { shortTiming: true, minionBoost: true });

        await Game.resolveQTE(quality);

        expect(await qte).toBe(multiplier);
        expect(Game._nextDamageIsCrit).toBe(false);
        expect(ParticleSys.createFloatingText).toHaveBeenCalledWith(
            Game.enemy.x, Game.enemy.y - 50, message, expect.any(String));
    });

    it('keeps automatic dart timing at the configured good tier', async () => {
        Game.autoQTE = true;
        const qte = Game.startQTE('ATTACK', Game.enemy.x, Game.enemy.y, null,
            { shortTiming: true, minionBoost: true });

        await advance(300);

        expect(await qte).toBe(1.1);
    });
});

describe('settled player-minion darts', () => {
    function spirit() {
        const minion = new Minion(540, 1000, 1, true);
        minion.dmg = 10;
        Game.player.minions = [minion];
        return minion;
    }

    it.each([[1, 90], [1.1, 89], [1.3, 87]])(
        'settles the chosen %s boost after timing and uses a pure visual', async (multiplier, expectedHp) => {
            const minion = spirit();
            let answer;
            const prompt = vi.spyOn(Game, 'startQTE').mockReturnValue(new Promise(resolve => { answer = resolve; }));
            vi.spyOn(Game, 'sleep').mockResolvedValue();
            const visual = vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});

            const strike = Game._resolvePlayerMinionStrike(minion, Game.enemy);
            expect(Game.enemy.currentHp).toBe(100);
            expect(Game._combatActionDepth).toBe(1);
            expect(prompt).toHaveBeenCalledWith('ATTACK', Game.enemy.x, Game.enemy.y, null,
                { shortTiming: true, minionBoost: true, pattern: 'steady', waves: 1 });
            answer(multiplier);
            await strike;

            expect(Game.enemy.currentHp).toBe(expectedHp);
            expect(visual).toHaveBeenCalledWith('nature_dart', minion, Game.enemy, null, { settledDamage: true });
            expect(Game._combatActionDepth).toBe(0);
        }
    );

    it('keeps a lethal dart on screen until its presentation finishes', async () => {
        const minion = spirit();
        Game.enemy.currentHp = 10;
        vi.spyOn(Game, 'startQTE').mockResolvedValue(1.3);
        let finish;
        vi.spyOn(Game, '_presentCombatHits').mockReturnValue(new Promise(resolve => { finish = resolve; }));
        const win = vi.spyOn(Game, 'winCombat').mockImplementation(() => { Game.currentState = STATE.COMBAT_WIN; });

        const strike = Game._resolvePlayerMinionStrike(minion, Game.enemy);
        await advance(0);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(win).not.toHaveBeenCalled();
        finish();
        await strike;

        expect(win).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
    });

    it('a summoner dart needs one perfect press and receives the full thirty-percent boost', async () => {
        Game.player.classId = 'summoner';
        const minion = spirit();
        minion.dmg = 20;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
        const enemy = Game.enemy;

        const strike = Game._resolvePlayerMinionStrike(minion, enemy);
        expect(Game.qte.waveTotal).toBe(1);
        expect(Game.qte.pattern).toBe('steady');
        expect(Game.qte.minionBoost).toBe(true);
        Game.qte.phase = 'active';
        Game.qte.radius = 30;
        Game.inputCooldown = 0;
        Game.checkQTE();
        await strike;

        expect(Game.qte.active).toBe(false);
        expect(enemy.currentHp).toBe(74);
        expect(ParticleSys.createFloatingText).toHaveBeenCalledWith(
            enemy.x, enemy.y - 50, 'DART +30%', expect.any(String));
    });

    it('does not damage the old encounter after quitting during its prompt', async () => {
        const minion = spirit();
        let answer;
        vi.spyOn(Game, 'startQTE').mockReturnValue(new Promise(resolve => { answer = resolve; }));
        const visual = vi.spyOn(Game, 'triggerVFX').mockImplementation(() => {});
        const strike = Game._resolvePlayerMinionStrike(minion, Game.enemy);
        const oldEnemy = Game.enemy;
        Game._combatGen++;
        Game.currentState = STATE.MENU;
        Game.inputLocked = false;
        Game._combatActionDepth = 0;

        answer(1.3);
        await strike;

        expect(oldEnemy.currentHp).toBe(100);
        expect(visual).not.toHaveBeenCalled();
        expect(Game.currentState).toBe(STATE.MENU);
    });
});
