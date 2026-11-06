import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Player } from '../entities/player.js';
import { PLAYER_CLASSES, STATE } from '../constants.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { Diag } from '../services/diag.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { Achievements } from '../services/achievements.js';
import { Analytics } from '../services/analytics.js';
import { ClassAbility } from '../ui/class-ability.js';

function makeEnemy() {
    return new Enemy({ name: 'Maintenance Spike', hp: 100, dmg: 9, kind: 'detonator' }, 0);
}

function armEnemy() {
    expect(Game.enemy.takeDamage(71, Game.player)).toBe(false);
    expect(Game.enemy._armedDetonate).toBe(true);
    return Game.enemy;
}

beforeEach(() => {
    document.body.innerHTML = `
        <div id="game-container"><div id="screen-flash"></div></div>
        <div id="dice-container"></div><div id="reroll-badge"></div>
        <button id="btn-end-turn"></button>
    `;
    localStorage.clear();
    Object.assign(Game, {
        currentState: STATE.COMBAT,
        turnCount: 3,
        sector: 1,
        _combatGen: 1,
        _combatStartedAt: 0,
        _endTurnRunning: false,
        _winCombatRunning: false,
        _resolvingSelfDestruct: false,
        inputLocked: false,
        godMode: false,
        assistDisabled: true,
        _ascEffects: {},
        metaUpgrades: [],
        metaToggledOff: new Set(),
        _disabledMetaThisRun: new Set(),
        _customDmgInMult: 1,
        runStats: null,
        turnStats: null,
        effects: [],
        _activeSectorMech: null,
        deadMinionsThisTurn: 0,
        sealedDie: null,
        player: null,
        enemy: null
    });
    for (const method of ['createDamageText', 'createExplosion', 'createFloatingText', 'createShockwave', 'createSparks']) {
        vi.spyOn(ParticleSys, method).mockImplementation(() => {});
    }
    for (const method of ['playSound', 'playHit', 'playSting', 'duck']) {
        vi.spyOn(AudioMgr, method).mockImplementation(() => {});
    }
    for (const method of ['shake', 'shakeFromDamage', 'hitStop', 'triggerScreenFlash', 'haptic', '_checkHiddenLoreTriggers']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Game, 'showPhaseBanner').mockResolvedValue();
    vi.spyOn(Game, '_isNewcomer').mockReturnValue(false);
    // Keep terminal transitions observable without running reward/save screens.
    vi.spyOn(Game, 'winCombat').mockImplementation(() => {
        if (!Game._resolvingSelfDestruct) Game.currentState = STATE.COMBAT_WIN;
    });
    vi.spyOn(Game, 'gameOver').mockImplementation(() => { Game.currentState = STATE.GAMEOVER; });
    Game.player = new Player(PLAYER_CLASSES.find(c => c.id === 'tactician'));
    Game.player.classId = 'tactician';
    Game.player.maxHp = 100;
    Game.player.currentHp = 100;
    Game.enemy = makeEnemy();
    Game.invalidateStackCache();
});

afterEach(() => {
    Game.clearTrackedTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});

function useRealRevive(relicId) {
    vi.useFakeTimers();
    Game.gameOver.mockRestore();
    for (const [object, method] of [
        [Diag, 'event'], [Diag, 'dump'], [Hints, 'trigger'], [Unlocks, 'grant'],
        [Achievements, 'unlock'], [Analytics, 'emit'], [ClassAbility, 'endCombat'],
        [AudioMgr, 'stopSectorAmbient'], [AudioMgr, 'clearSectorMusic'],
        [Game, 'renderRelics'], [Game, 'updateHUD']
    ]) {
        vi.spyOn(object, method).mockImplementation(() => {});
    }
    Game.player.relics.push({ id: relicId });
    Game._emergencyKitCharges = 0;
    Game.invalidateStackCache();
    const nextTurn = vi.spyOn(Game, 'startTurn').mockImplementation(() => {});
    let terminalWins = 0;
    Game.winCombat.mockImplementation(() => {
        if (Game._resolvingSelfDestruct) return;
        terminalWins++;
        Game.currentState = STATE.COMBAT_WIN;
    });
    return { nextTurn, wins: () => terminalWins };
}

describe('detonator arming', () => {
    it('arms below 30 percent, updates the intent immediately, and records the next player turn', () => {
        Game.enemy.decideTurn();
        Game.enemy.takeDamage(70, Game.player);
        expect(Game.enemy.currentHp).toBe(30);
        expect(Game.enemy._armedDetonate).toBeFalsy();

        Game.enemy.takeDamage(1, Game.player);

        expect(Game.enemy.currentHp).toBe(29);
        expect(Game.enemy._armedDetonate).toBe(true);
        expect(Game.enemy._detonateOnPlayerTurn).toBe(4);
        expect(Game.enemy.nextIntents).toHaveLength(1);
        expect(Game.enemy.nextIntents[0].type).toBe('self_destruct');
    });

    it('does not arm when a shield absorbs the entire hit', () => {
        Game.enemy.currentHp = 29;
        Game.enemy.shield = 10;

        Game.enemy.takeDamage(5, Game.player);

        expect(Game.enemy.currentHp).toBe(29);
        expect(Game.enemy._armedDetonate).toBeFalsy();
    });

    it('allows a lethal first hit to kill without arming or clamping HP', () => {
        expect(Game.enemy.takeDamage(150, Game.player)).toBe(true);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.enemy._armedDetonate).toBeFalsy();
    });

    it('allows a second hit to kill the armed enemy before its explosion', () => {
        const enemy = armEnemy();

        expect(enemy.takeDamage(29, Game.player)).toBe(true);
        expect(enemy.currentHp).toBe(0);
        Game._resolvePendingSelfDestruct();

        expect(Game.player.currentHp).toBe(100);
        expect(enemy._detonated).toBeFalsy();
    });

    it('does not arm from damage during the enemy phase', () => {
        Game._endTurnRunning = true;

        Game.enemy.takeDamage(71, Game.player);

        expect(Game.enemy.currentHp).toBe(29);
        expect(Game.enemy._armedDetonate).toBeFalsy();
    });

    it('does not arm outside an active combat', () => {
        Game.currentState = STATE.MENU;

        Game.enemy.takeDamage(71, Game.player);

        expect(Game.enemy._armedDetonate).toBeFalsy();
    });

    it('keeps the pending countdown intent when stun or Mirror World would override ordinary AI', () => {
        const enemy = armEnemy();
        enemy.effects.push({ id: 'stun', duration: 3, val: 0 });
        Game._ascEffects.enemyCopiesLastDie = true;
        vi.spyOn(Math, 'random').mockReturnValue(0);

        enemy.decideTurn();

        expect(enemy.nextIntents).toHaveLength(1);
        expect(enemy.nextIntents[0].type).toBe('self_destruct');
        expect(enemy._detonateOnPlayerTurn).toBe(4);
    });
});

describe('detonator turn-start explosion', () => {
    it('waits for the recorded deadline and explodes only once', () => {
        const enemy = armEnemy();
        Game.turnCount = 1;
        expect(Game._resolvePendingSelfDestruct()).toBe(true);
        expect(Game.player.currentHp).toBe(100);
        expect(enemy.currentHp).toBe(29);

        Game.turnCount = 3;
        expect(Game._resolvePendingSelfDestruct()).toBe(true);
        expect(Game.player.currentHp).toBe(67);
        expect(enemy.currentHp).toBe(1);
        expect(enemy._armedDetonate).toBeFalsy();
        expect(enemy._detonated).toBe(true);

        Game.turnCount = 4;
        Game._resolvePendingSelfDestruct();
        expect(Game.player.currentHp).toBe(67);
    });

    it('leaves the detonated enemy killable without arming again', () => {
        const enemy = armEnemy();
        Game._resolvePendingSelfDestruct();

        expect(enemy.takeDamage(1, Game.player)).toBe(true);
        expect(enemy.currentHp).toBe(0);
        expect(enemy._armedDetonate).toBeFalsy();
        expect(enemy._detonated).toBe(true);
    });

    it('uses normal shield absorption and removes the carrier shield', () => {
        const enemy = armEnemy();
        enemy.shield = 20;
        Game.player.shield = 50;

        expect(Game._resolvePendingSelfDestruct()).toBe(true);

        expect(Game.player.currentHp).toBe(100);
        expect(Game.player.shield).toBe(17);
        expect(enemy.currentHp).toBe(1);
        expect(enemy.shield).toBe(0);
    });

    it('preserves a fully mitigated zero-damage explosion', () => {
        const enemy = armEnemy();
        enemy.effects.push({ id: 'constrict', duration: 2, val: 0.01 });

        Game._resolvePendingSelfDestruct();

        expect(Game.player.currentHp).toBe(100);
        expect(enemy.currentHp).toBe(1);
        expect(enemy._detonated).toBe(true);
    });

    it('keeps a zero-damage explosion harmless when newcomer assistance is active', () => {
        const enemy = armEnemy();
        enemy.effects.push({ id: 'constrict', duration: 2, val: 0.01 });
        Game._isNewcomer.mockReturnValue(true);
        Game.assistDisabled = false;

        Game._resolvePendingSelfDestruct();

        expect(Game.player.currentHp).toBe(100);
        expect(enemy.currentHp).toBe(1);
    });

    it('does not resurrect a carrier killed by reflected explosion damage', () => {
        const enemy = armEnemy();
        Game.player.relics.push({ id: 'spike_armor' });
        Game.invalidateStackCache();

        expect(Game._resolvePendingSelfDestruct()).toBe(false);

        expect(Game.player.currentHp).toBe(67);
        expect(enemy.currentHp).toBe(0);
        expect(enemy._armedDetonate).toBeFalsy();
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
    });

    it('leaves a Vampiric carrier at one HP after its outgoing-damage heal', () => {
        const enemy = armEnemy();
        enemy.affixes.push('Vampiric');

        expect(Game._resolvePendingSelfDestruct()).toBe(true);

        expect(Game.player.currentHp).toBe(67);
        expect(enemy.currentHp).toBe(1);
        expect(enemy._detonated).toBe(true);
    });

    it('does not let Vampiric resurrect a carrier killed by reflected explosion damage', () => {
        const enemy = armEnemy();
        enemy.affixes.push('Vampiric');
        Game.player.relics.push({ id: 'spike_armor' });
        Game.invalidateStackCache();

        expect(Game._resolvePendingSelfDestruct()).toBe(false);

        expect(enemy.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
    });

    it('gives a full player turn to finish a carrier before regeneration and Shielded recover', async () => {
        const enemy = armEnemy();
        enemy.glitchMod = { id: 'regen' };
        enemy.affixes.push('Shielded');
        const roll = vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
        vi.spyOn(Game, 'updateHUD').mockImplementation(() => {});
        const recover = vi.spyOn(Game, '_recoverFromCombatError').mockImplementation(() => {});

        await Game.startTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(Game.turnCount).toBe(4);
        expect(enemy.currentHp).toBe(1);
        expect(enemy.shield).toBe(0);
        expect(Game.inputLocked).toBe(false);
        expect(roll).toHaveBeenCalledTimes(1);

        await Game.startTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(Game.turnCount).toBe(5);
        expect(enemy.currentHp).toBe(6);
        expect(enemy.shield).toBe(10);
        expect(roll).toHaveBeenCalledTimes(2);
    });

    it('does not roll a new hand when a real DoT finishes the carrier after its blast', async () => {
        const enemy = armEnemy();
        enemy.effects.push({ id: 'poison', duration: 2, val: 1 });
        const roll = vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
        vi.spyOn(Game, 'updateHUD').mockImplementation(() => {});
        const recover = vi.spyOn(Game, '_recoverFromCombatError').mockImplementation(() => {});

        await Game.startTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(Game.player.currentHp).toBe(67);
        expect(enemy.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(roll).not.toHaveBeenCalled();
    });

    it('ends the run when the explosion kills the player', () => {
        armEnemy();
        Game.player.currentHp = 10;

        expect(Game._resolvePendingSelfDestruct()).toBe(false);

        expect(Game.player.currentHp).toBe(0);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.winCombat).not.toHaveBeenCalled();
    });

    it('prioritises player death when shield-break retaliation also kills the carrier', () => {
        const enemy = armEnemy();
        Game.player.currentHp = 10;
        Game.player.shield = 1;
        Game.player.traits.shieldCounter = 4;

        expect(Game._resolvePendingSelfDestruct()).toBe(false);

        expect(enemy.currentHp).toBe(0);
        expect(Game.player.currentHp).toBe(0);
        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.gameOver).toHaveBeenCalledTimes(1);
        expect(Game._resolvingSelfDestruct).toBe(false);
    });

    it('does not apply an old enemy countdown to its replacement', () => {
        const oldEnemy = armEnemy();
        const replacement = makeEnemy();
        Game.enemy = replacement;
        Game._combatGen++;
        Game.turnCount = 10;

        Game._resolvePendingSelfDestruct();

        expect(Game.player.currentHp).toBe(100);
        expect(replacement.currentHp).toBe(100);
        expect(replacement._detonated).toBeFalsy();
        expect(oldEnemy.currentHp).toBe(29);
    });

    it('stops real startTurn before passives and dice when the pending blast is lethal', async () => {
        armEnemy();
        Game.player.currentHp = 10;
        const roll = vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
        const effects = vi.spyOn(Game.player, 'updateEffects');

        await Game.startTurn();

        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(effects).not.toHaveBeenCalled();
        expect(roll).not.toHaveBeenCalled();
        expect(Game.showPhaseBanner).not.toHaveBeenCalledWith('PLAYER PHASE', expect.anything(), 'player');
    });

    it('keeps the warning harmless through the real enemy phase until the next player turn', async () => {
        const enemy = armEnemy();
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        vi.spyOn(Game, 'showTurnSummary').mockImplementation(() => {});
        vi.spyOn(Game, 'updateHUD').mockImplementation(() => {});
        const nextTurn = vi.spyOn(Game, 'startTurn').mockImplementation(() => {});
        const recover = vi.spyOn(Game, '_recoverFromCombatError').mockImplementation(() => {});

        await Game.endTurn();

        expect(recover).not.toHaveBeenCalled();
        expect(nextTurn).toHaveBeenCalledTimes(1);
        expect(Game.player.currentHp).toBe(100);
        expect(enemy.currentHp).toBe(29);
        expect(enemy._armedDetonate).toBe(true);
        expect(enemy._detonated).toBeFalsy();
    });

    it('defers real winCombat while the explosion damage is still being resolved', async () => {
        Game.winCombat.mockRestore();
        const enemy = Game.enemy;
        enemy.currentHp = 0;
        Game._resolvingSelfDestruct = true;

        await Game.winCombat();

        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game.enemy).toBe(enemy);
        expect(Game._winCombatRunning).toBe(false);
    });
});

describe.each([
    ['second_life', 50],
    ['fusion_phoenix_protocol', 100]
])('detonation with real %s revival', (relicId, revivedHp) => {
    it('settles simultaneous death as one win after revival instead of starting a turn against a corpse', async () => {
        const enemy = armEnemy();
        const revival = useRealRevive(relicId);
        Game.player.currentHp = 10;
        Game.player.shield = 1;
        Game.player.traits.shieldCounter = 4;

        expect(Game._resolvePendingSelfDestruct()).toBe(false);

        expect(enemy.currentHp).toBe(0);
        expect(Game.player.currentHp).toBe(revivedHp);
        expect(Game.player.relics.some(relic => relic.id === relicId)).toBe(false);
        expect(revival.nextTurn).not.toHaveBeenCalled();
        expect(revival.wins()).toBe(0);
        await vi.advanceTimersByTimeAsync(1000);

        expect(revival.nextTurn).not.toHaveBeenCalled();
        expect(revival.wins()).toBe(1);
        expect(Game.currentState).toBe(STATE.COMBAT_WIN);
        await vi.advanceTimersByTimeAsync(1000);
        expect(revival.wins()).toBe(1);
    });

    it('resumes a normal player turn after revival when the carrier survived', async () => {
        armEnemy();
        const revival = useRealRevive(relicId);
        Game.player.currentHp = 10;

        Game._resolvePendingSelfDestruct();
        await vi.advanceTimersByTimeAsync(1000);

        expect(Game.player.currentHp).toBe(revivedHp);
        expect(Game.enemy.currentHp).toBe(1);
        expect(revival.nextTurn).toHaveBeenCalledTimes(1);
        expect(revival.wins()).toBe(0);
    });

    it('ignores the scheduled revival continuation after the player leaves combat', async () => {
        armEnemy();
        const revival = useRealRevive(relicId);
        Game.player.currentHp = 10;
        Game._resolvePendingSelfDestruct();
        Game.currentState = STATE.MENU;

        await vi.advanceTimersByTimeAsync(1000);

        expect(revival.nextTurn).not.toHaveBeenCalled();
        expect(revival.wins()).toBe(0);
        expect(Game.currentState).toBe(STATE.MENU);
    });

    it('does not let an old revival continuation act in a replacement combat', async () => {
        armEnemy();
        const revival = useRealRevive(relicId);
        Game.player.currentHp = 10;
        Game._resolvePendingSelfDestruct();
        const replacement = makeEnemy();
        Game.enemy = replacement;
        Game._combatGen++;

        await vi.advanceTimersByTimeAsync(1000);

        expect(revival.nextTurn).not.toHaveBeenCalled();
        expect(revival.wins()).toBe(0);
        expect(replacement.currentHp).toBe(100);
        expect(Game.currentState).toBe(STATE.COMBAT);
    });
});
