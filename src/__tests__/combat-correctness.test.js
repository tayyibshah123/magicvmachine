import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Minion } from '../entities/minion.js';
import { Player } from '../entities/player.js';
import { BOSS_DATA, PLAYER_CLASSES, STATE } from '../constants.js';
import { BossMinionRoster } from '../services/boss-minion-roster.js';
import { ClassBriefing } from '../services/class-briefing.js';
import { Breakout } from '../services/breakout.js';
import { AudioMgr } from '../audio.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { renderFor } from './helpers/combat-renderer.js';

beforeEach(() => {
    setupCombatFixture({ maxHp: 100, profiles: ['cosmetics', 'ui', 'class-events', 'renderer'] });
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    vi.spyOn(Game, '_qteWindupAudio').mockImplementation(() => {});
});
afterEach(teardownCombatFixture);

describe('meaningful integer minion boosts', () => {
    it.each([
        [1, 1, 1], [1, 1.1, 2], [1, 1.3, 2],
        [2, 1, 2], [2, 1.1, 3], [2, 1.3, 3],
        [3, 1, 3], [3, 1.1, 4], [3, 1.3, 4], [90, 1.1, 99]
    ])('base %i and timing %s settle %i before the full dart', async (base, multiplier, expected) => {
        const spirit = new Minion(260, 1080, 1, true);
        spirit.dmg = base;
        Game.player.minions = [spirit];
        vi.spyOn(Game, 'startQTE').mockResolvedValue(multiplier);
        const damage = vi.spyOn(Game.enemy, 'takeDamage');
        const strike = Game._resolvePlayerMinionStrike(spirit, Game.enemy);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.enemy.currentHp).toBe(100 - expected);
        expect(Game.inputLocked).toBe(true);
        expect(Game.effects.find(effect => effect.type === 'nature_dart')).toMatchObject({ onHit: null });
        await renderFor(2300);
        await strike;
        expect(damage).toHaveBeenCalledTimes(1);
        expect(Game.effects.some(effect => effect.type === 'nature_dart')).toBe(false);
        expect(Game.inputLocked).toBe(false);
    });

    it('does not ask a disabled zero-damage ally for an empty boost', async () => {
        const spirit = new Minion(260, 1080, 1, true);
        spirit.dmg = 0;
        Game.player.minions = [spirit];
        const prompt = vi.spyOn(Game, 'startQTE');
        const visual = vi.spyOn(Game, 'triggerVFX');
        await Game._resolvePlayerMinionStrike(spirit, Game.enemy);
        expect(prompt).not.toHaveBeenCalled();
        expect(visual).not.toHaveBeenCalled();
        expect(Game.enemy.currentHp).toBe(100);
    });

    it('starts the first and subsequent real Summoner combats with visibly stronger spirits', async () => {
        Game.player = new Player(PLAYER_CLASSES.find(config => config.id === 'summoner'));
        Game.player.classId = 'summoner';
        expect(Game.player.minions.map(minion => [minion.maxHp, minion.dmg])).toEqual([[3, 2], [3, 2]]);
        vi.spyOn(ClassBriefing, 'show').mockResolvedValue();
        vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
        vi.spyOn(Game, 'saveGame').mockImplementation(() => {});
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        for (const name of ['startSectorAmbient', 'setSectorMusic']) vi.spyOn(AudioMgr, name).mockImplementation(() => {});
        for (const sector of [1, 2]) {
            Game.sector = sector;
            await Game.startCombat('combat');
            await vi.advanceTimersByTimeAsync(0);
            expect(Game.player.minions.map(minion => [minion.maxHp, minion.currentHp, minion.dmg]))
                .toEqual([[3, 3, 2], [3, 3, 2]]);
        }
    });
});

describe('passive enemy minion resolution', () => {
    it.each(['pacifist', 'zero damage'])('does not prompt or shoot for %s', async kind => {
        const minion = new Minion(260, 550, 1, false);
        minion._pacifist = kind === 'pacifist';
        minion.dmg = kind === 'pacifist' ? 8 : 0;
        const prompt = vi.spyOn(Game, 'startQTE');
        const visual = vi.spyOn(Game, 'triggerVFX');
        await Game._resolveEnemyMinionStrike(minion, Game.player);
        expect(prompt).not.toHaveBeenCalled();
        expect(visual).not.toHaveBeenCalled();
        expect(Game.player.currentHp).toBe(100);
    });

    it('keeps Tesseract passive effects but omits all four fake attacks from real endTurn', async () => {
        vi.spyOn(ClassBriefing, 'show').mockResolvedValue();
        vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
        vi.spyOn(Game, 'saveGame').mockImplementation(() => {});
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        for (const name of ['startSectorAmbient', 'setSectorMusic', 'fadeMusicOut']) {
            vi.spyOn(AudioMgr, name).mockImplementation(() => {});
        }
        Game.sector = 5;
        await Game.startCombat('boss');
        await vi.advanceTimersByTimeAsync(0);
        const boss = Game.enemy;
        expect(Game.player.hasEffect('weak')).toBeTruthy();
        boss.currentHp -= 100;
        boss.minions.forEach(minion => { minion.currentHp -= 10; });
        const heart = boss.minions.find(minion => minion._tessRole === 'heart');
        expect(boss.minions).toHaveLength(4);
        expect({ max: boss.maxHp, hp: boss.currentHp, owner: !!Game._turnStartOwner, depth: Game._combatActionDepth,
            qte: Game.qte.active }).toEqual({ max: 1000, hp: 900, owner: false, depth: 0, qte: false });
        await Game.startTurn();
        expect(boss.minionRoster.living().map(minion => [minion._tessRole, minion.currentHp, minion.maxHp]))
            .toEqual([['heart', 58, 60], ['aegis', 38, 40], ['hex', 33, 35], ['mender', 40, 50]]);
        expect(boss.currentHp).toBe(boss.maxHp - 20);
        expect(heart.currentHp).toBe(58);
        expect(boss.shield).toBeGreaterThanOrEqual(20);
        boss.nextIntents = [];
        Game._combatStartedAt = 0;
        const prompt = vi.spyOn(Game, 'startQTE');
        const visual = vi.spyOn(Game, 'triggerVFX');
        const attack = vi.spyOn(heart, 'playAnim');
        await Game.endTurn();
        await vi.advanceTimersByTimeAsync(0);
        expect(prompt).not.toHaveBeenCalled();
        expect(visual.mock.calls.some(([type]) => type === 'micro_laser')).toBe(false);
        expect(attack).not.toHaveBeenCalled();
        expect(Game.player.currentHp).toBe(100);
    });
});

describe('Hive round cadence', () => {
    function hive() {
        Game.enemy = new Enemy({ ...BOSS_DATA[4] }, 0);
        Game.enemy.minions = Array.from({ length: 4 }, () => ({ currentHp: 60, _isHiveDrone: true }));
        Game.enemy.minionRoster = new BossMinionRoster(Game.enemy, {
            isMember: minion => minion._isHiveDrone,
            resummonRule: { counterKey: '_hiveTurnCounter', cap: 5,
                cadenceFn: boss => boss._hiveResummonEvery || 4 }
        });
        return Game.enemy;
    }

    it('counts four rounds, not three action slots or repeated previews', () => {
        const boss = hive();
        for (let round = 1; round <= 4; round++) {
            Game.turnCount = round;
            boss.decideTurn();
            expect(boss.nextIntents.filter(intent => intent.type === 'summon_hive')).toHaveLength(round === 4 ? 1 : 0);
            const counter = boss._hiveTurnCounter;
            boss.decideTurn();
            expect(boss._hiveTurnCounter).toBe(counter);
        }
    });

    it('uses the actual faster phase-three rule even below twenty percent HP', () => {
        const boss = hive();
        boss.currentHp = 100;
        Game._applyBossPhaseMechanic(boss, 3);
        boss.phase = 3;
        for (let round = 1; round <= 3; round++) {
            Game.turnCount = round;
            boss.decideTurn();
            expect(boss.nextIntents.filter(intent => intent.type === 'summon_hive')).toHaveLength(round === 3 ? 1 : 0);
        }
    });

    it('starts a new missing-drone wait after the swarm has refilled', () => {
        const boss = hive();
        Game.turnCount = 1;
        boss.decideTurn();
        boss.minions.push({ currentHp: 60, _isHiveDrone: true });
        Game.turnCount = 2;
        boss.decideTurn();
        expect(boss._hiveTurnCounter).toBe(0);
        boss.minions.pop();
        for (let round = 3; round <= 6; round++) {
            Game.turnCount = round;
            boss.decideTurn();
            expect(boss.nextIntents.filter(intent => intent.type === 'summon_hive')).toHaveLength(round === 6 ? 1 : 0);
        }
    });
});

describe('resolved tutorial defence outcomes', () => {
    it.each([['fail', 'miss', 8], ['good', 'good', 4], ['perfect', 'perfect', 4], ['auto', 'good', 4]])(
        'reports %s only after the enemy action settles', async (quality, outcome, damageTaken) => {
            Game.currentState = STATE.BREAKOUT;
            Game.runStats = { damageTaken: 0 };
            Game._breakoutScript = null;
            Game.enemy.nextIntents = [{ type: 'attack', val: 8, effectiveVal: 8, target: Game.player }];
            Game.autoQTE = quality === 'auto';
            vi.spyOn(Breakout, 'isActive').mockReturnValue(true);
            const notify = vi.spyOn(Breakout, 'notify').mockImplementation(() => {});
            vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
            vi.spyOn(Game, 'sleep').mockResolvedValue();
            const turn = Game.endTurn();
            await vi.advanceTimersByTimeAsync(0);
            if (quality !== 'auto') {
                expect(Game.qte.active).toBe(true);
                Game.resolveQTE(quality);
                await vi.advanceTimersByTimeAsync(0);
            }
            expect(notify).not.toHaveBeenCalled();
            await renderFor(2300);
            await turn;
            await vi.advanceTimersByTimeAsync(0);
            expect(notify).toHaveBeenCalledWith('enemy_turn', expect.objectContaining({
                defenceOutcome: outcome, damageTaken,
                defences: [{ quality: quality === 'auto' ? 'good' : quality, shortTiming: false }]
            }));
            expect(notify).toHaveBeenCalledTimes(1);
        }
    );
});
