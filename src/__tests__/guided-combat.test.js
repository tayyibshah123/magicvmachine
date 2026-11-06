import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { Enemy } from '../entities/enemy.js';
import { Minion } from '../entities/minion.js';
import { BOSS_DATA, STATE } from '../constants.js';
import { ParticleSys } from '../effects/particles.js';
import { ClassAbility } from '../ui/class-ability.js';
import { getBossRules } from '../ui/boss-rules.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';
import { renderFor } from './helpers/combat-renderer.js';

let originalLearningRecorder;
beforeEach(() => {
    originalLearningRecorder = Game._recordLearningAction;
    Game._recordLearningAction = vi.fn();
    setupCombatFixture({ profiles: ['cosmetics', 'ui', 'class-events', 'renderer', 'terminal-observers'],
        game: { _modernPacing: true } });
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    vi.spyOn(Game, '_qteWindupAudio').mockImplementation(() => {});
});
afterEach(() => {
    if (originalLearningRecorder) Game._recordLearningAction = originalLearningRecorder;
    else delete Game._recordLearningAction;
    teardownCombatFixture();
});

function allies(damages = [1, 2, 3, 10]) {
    Game.player.minions = damages.map((damage, index) => {
        const minion = new Minion(240 + index * 120, 1080, index + 1, true);
        minion.dmg = damage;
        return minion;
    });
    return Game.player.minions;
}

describe('guided shared friendly volley', () => {
    it.each([['fail', 16], ['early', 16], ['good', 20], ['perfect', 22]])(
        'one %s result settles %i damage before all four pure darts', async (quality, damage) => {
            const minions = allies();
            const hp = vi.spyOn(Game.enemy, 'takeDamage');
            const prompt = vi.spyOn(Game, 'startQTE');
            const volley = Game._resolvePlayerMinionVolley(minions);
            expect(Game.enemy.currentHp).toBe(100);
            expect(prompt).toHaveBeenCalledTimes(1);
            expect(Game.qte.volleyBoost).toEqual({ base: 16, good: 20, perfect: 22 });
            Game.resolveQTE(quality);
            await vi.advanceTimersByTimeAsync(0);
            expect(Game.enemy.currentHp).toBe(100 - damage);
            expect(Game.effects.filter(effect => effect.type === 'nature_dart')).toHaveLength(4);
            expect(Game.effects.filter(effect => effect.type === 'nature_dart').every(effect => effect.onHit === null)).toBe(true);
            expect(Game.inputLocked).toBe(true);
            expect(Game._recordLearningAction.mock.calls.filter(([action]) => action === 'allyTiming')).toHaveLength(1);
            expect(Game._recordLearningAction).toHaveBeenCalledWith('allyTiming');
            expect(ParticleSys.createFloatingText).toHaveBeenCalledWith(Game.enemy.x, Game.enemy.y - 50,
                `ALLY POWER ${damage} (+${damage - 16})`, expect.any(String));
            await renderFor(2300);
            await volley;
            expect(hp).toHaveBeenCalledTimes(4);
            expect(Game.effects.some(effect => effect.type === 'nature_dart')).toBe(false);
            expect(Game.inputLocked).toBe(false);
        });

    it('no input still launches every base attack', async () => {
        const volley = Game._resolvePlayerMinionVolley(allies([1, 1]));
        Game.qte.phase = 'active';
        Game.qte.radius = 1;
        Game.updateQTE(0.1);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.enemy.currentHp).toBe(98);
        await renderFor(2300);
        await volley;
    });

    it('keeps essential allies automatic until their timing lesson is introduced', async () => {
        const original = Game._canGuidedFeature;
        Game._canGuidedFeature = vi.fn(() => false);
        try {
            const prompt = vi.spyOn(Game, 'startQTE');
            const volley = Game._resolvePlayerMinionVolley(allies([2, 2]));
            await vi.advanceTimersByTimeAsync(0);
            expect(Game.enemy.currentHp).toBe(96);
            expect(prompt).not.toHaveBeenCalled();
            expect(Game._canGuidedFeature).toHaveBeenCalledWith('allyTiming');
            await renderFor(2300);
            await volley;
        } finally {
            if (original) Game._canGuidedFeature = original;
            else delete Game._canGuidedFeature;
        }
    });

    it('finishes every committed dart after the first one is lethal', async () => {
        Game.enemy.currentHp = 1;
        const minions = allies([1, 1, 1, 1]);
        const volley = Game._resolvePlayerMinionVolley(minions);
        Game.resolveQTE('perfect');
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.effects.filter(effect => effect.type === 'nature_dart')).toHaveLength(4);
        expect(Game.winCombat).not.toHaveBeenCalled();
        await renderFor(1200);
        expect(Game.winCombat).not.toHaveBeenCalled();
        await renderFor(1100);
        await volley;
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
        expect(Game.effects.some(effect => effect.type === 'nature_dart')).toBe(false);
    });

    it('commits Bomb Bot charges and both AoE blasts before both missiles', async () => {
        Game.player.traits.minionName = 'Bomb Bot';
        const minions = allies([1, 1]);
        minions[1].charges = 2;
        const escort = new Minion(300, 600, 1, false);
        escort.currentHp = escort.maxHp = 30;
        Game.enemy.minions = [escort];
        const prompt = vi.spyOn(Game, 'startQTE');
        const volley = Game._resolvePlayerMinionVolley(minions);
        expect(Game.enemy.currentHp).toBe(80);
        expect(escort.currentHp).toBe(10);
        expect(minions[0].currentHp).toBe(0);
        expect(minions[1].charges).toBe(1);
        expect(Game.player.minions).toEqual([minions[1]]);
        expect(prompt).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.effects.filter(effect => effect.type === 'bomb_missile')).toHaveLength(2);
        await renderFor(2300);
        await volley;
        expect(Game.enemy.currentHp).toBe(80);
        expect(escort.currentHp).toBe(10);
    });

    it('keeps all committed bomb visuals after an early lethal blast', async () => {
        Game.player.traits.minionName = 'Bomb Bot';
        Game.enemy.currentHp = 5;
        const minions = allies([1, 1, 1]);
        const volley = Game._resolvePlayerMinionVolley(minions);
        await vi.advanceTimersByTimeAsync(0);
        expect(Game.enemy.currentHp).toBe(0);
        expect(Game.player.minions).toEqual([]);
        expect(Game.effects.filter(effect => effect.type === 'bomb_missile')).toHaveLength(3);
        expect(Game.winCombat).not.toHaveBeenCalled();
        await renderFor(2300);
        await volley;
        expect(Game.winCombat).toHaveBeenCalledTimes(1);
    });

    it('cancels a volley prompt without consuming a replacement action lock', async () => {
        const minions = allies([2, 2]);
        const oldEnemy = Game.enemy;
        const volley = Game._resolvePlayerMinionVolley(minions);
        Game._combatGen++;
        Game._cancelQTE();
        Game.enemy = new Enemy({ name: 'Replacement', hp: 100, dmg: 2 }, 0);
        Game._combatActionDepth = 1;
        Game.inputLocked = true;
        await volley;
        expect(oldEnemy.currentHp).toBe(100);
        expect(Game.enemy.currentHp).toBe(100);
        expect(Game._combatActionDepth).toBe(1);
        expect(Game.inputLocked).toBe(true);
        expect(Game.effects.some(effect => effect.type === 'nature_dart')).toBe(false);
    });

    it('real endTurn chooses one shared volley only in the guided edition', async () => {
        allies([1, 1]);
        Game.enemy.nextIntents = [];
        vi.spyOn(Game, 'sleep').mockResolvedValue();
        vi.spyOn(Game, 'rollDice').mockImplementation(() => {});
        const prompt = vi.spyOn(Game, 'startQTE');
        const shared = vi.spyOn(Game, '_resolvePlayerMinionVolley');
        const single = vi.spyOn(Game, '_resolvePlayerMinionStrike');
        const turn = Game.endTurn();
        await vi.advanceTimersByTimeAsync(0);
        expect(shared).toHaveBeenCalledTimes(1);
        expect(single).not.toHaveBeenCalled();
        Game.resolveQTE('good');
        await renderFor(2300);
        await turn;
        expect(prompt).toHaveBeenCalledTimes(1);
        expect(Game.showPhaseBanner.mock.calls.slice(0, 2).map(([title]) => title)).toEqual(['ALLIES ACT', 'ENEMY ACTS']);
    });
});

describe('guided routine banner timing', () => {
    it.each([['arcanist', 'pulse', 1], ['annihilator', 'accelerate', 1], ['summoner', 'multi', 2]])(
        'practises the real %s attack rhythm only during its guided drill', (classId, pattern, waves) => {
            Game.currentState = STATE.BREAKOUT;
            Game.player.classId = classId;
            Game._guidedRhythmPractice = false;
            expect(Game._qtePatternFor('ATTACK')).toEqual({ pattern: 'steady', waves: 1 });
            Game._guidedRhythmPractice = true;
            expect(Game._qtePatternFor('ATTACK')).toEqual({ pattern, waves });
            expect(Game._qtePatternFor('DEFEND')).toEqual({ pattern: 'steady', waves: 1 });
            Game._modernPacing = false;
            expect(Game._qtePatternFor('ATTACK')).toEqual({ pattern: 'steady', waves: 1 });
        });

    it.each([[true, 800], [false, 2800]])('modern=%s takes %i ms and leaves boss pacing unchanged', async (modern, duration) => {
        Game._modernPacing = modern;
        Game.showPhaseBanner.mockRestore();
        document.getElementById('game-container').insertAdjacentHTML('beforeend',
            '<div id="phase-banner"><div class="banner-text"></div><div class="banner-sub"></div></div>');
        let done = false;
        const banner = Game.showPhaseBanner('PLAYER PHASE', 'Ready', 'player').then(() => { done = true; });
        await vi.advanceTimersByTimeAsync(duration - 1);
        expect(done).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        await banner;
        expect(done).toBe(true);
        const boss = vi.spyOn(Game, '_showDramaticBanner').mockResolvedValue();
        await Game.showPhaseBanner('BOSS', 'Phase 2', 'boss');
        expect(boss).toHaveBeenCalledWith('BOSS', 'Phase 2', 'boss', { variant: 'boss' });
    });
});

describe('introduced class abilities', () => {
    it('does not build hidden heat or shields, then initializes the introduced mechanic once', () => {
        for (const method of ['endCombat', 'onTurnStart', 'onTurnEnd', 'onEvent', 'consumeAttackBlock']) {
            ClassAbility[method].mockRestore();
        }
        document.getElementById('game-container').insertAdjacentHTML('beforeend',
            '<div id="class-ability-widget" class="hidden"></div>');
        const original = Game._canGuidedFeature;
        let introduced = false;
        Game._canGuidedFeature = () => introduced;
        ClassAbility.init(Game);
        try {
            Game.player.classId = 'annihilator';
            ClassAbility.startCombat();
            for (let die = 0; die < 12; die++) ClassAbility.onEvent('dice_used', { type: 'ANH_ATTACK' });
            ClassAbility.onTurnEnd();
            ClassAbility._activate('heat-vent');
            expect(ClassAbility.getHeat()).toBe(0);
            expect(Game.player.currentHp).toBe(100);
            expect(Game._recordLearningAction).not.toHaveBeenCalled();
            expect(document.getElementById('class-ability-widget').classList.contains('hidden')).toBe(true);
            introduced = true;
            ClassAbility.onEvent('dice_used', { type: 'ANH_ATTACK' });
            expect(ClassAbility.getHeat()).toBe(10);
            for (let die = 0; die < 4; die++) ClassAbility.onEvent('dice_used', { type: 'ANH_ATTACK' });
            Game.inputLocked = true;
            ClassAbility._activate('heat-vent');
            expect(ClassAbility.getHeat()).toBe(50);
            expect(Game._recordLearningAction).not.toHaveBeenCalled();
            Game.inputLocked = false;
            ClassAbility._activate('heat-vent');
            expect(Game._recordLearningAction).toHaveBeenCalledTimes(1);
            expect(Game._recordLearningAction).toHaveBeenCalledWith('classAbility');
            introduced = false;
            ClassAbility.onTurnStart();
            expect(ClassAbility.getHeat()).toBe(0);

            Game.player.classId = 'sentinel';
            ClassAbility.startCombat();
            ClassAbility.onEvent('shield_gained', { amount: 18 });
            expect(ClassAbility.getPlates()).toBe(0);
            expect(ClassAbility.consumeAttackBlock()).toBe(false);
            expect(Game._recordLearningAction).toHaveBeenCalledTimes(1);
            introduced = true;
            ClassAbility.onEvent('shield_gained', { amount: 18 });
            expect(ClassAbility.getPlates()).toBe(3);
            expect(ClassAbility.consumeAttackBlock()).toBe(true);
            expect(ClassAbility.consumeAttackBlock()).toBe(false);
            expect(Game._recordLearningAction).toHaveBeenCalledTimes(2);
        } finally {
            ClassAbility.endCombat();
            if (original) Game._canGuidedFeature = original;
            else delete Game._canGuidedFeature;
        }
    });
});

describe('pure live boss rule descriptions', () => {
    it('derives the faster Hive closing countdown and healing trade from actual phase state', () => {
        Game.enemy = new Enemy({ ...BOSS_DATA[4] }, 0);
        Game.enemy._hiveTurnCounter = 2;
        Game._applyBossPhaseMechanic(Game.enemy, 3);
        const rules = getBossRules(Game);
        expect(rules.find(rule => rule.id === 'hive-respawn').text).toContain('1 enemy turn.');
        expect(rules.find(rule => rule.id === 'hive-assimilate').text).toContain('45 HP');
        Game.enemy.nextIntents = [{ type: 'summon_hive', val: 0 }];
        expect(getBossRules(Game).find(rule => rule.id === 'hive-respawn').text).toContain('this enemy phase');
    });

    it('describes the actual Null Pointer closing mechanics and increasing pull', () => {
        Game.enemy = new Enemy({ ...BOSS_DATA[2] }, 0);
        Game.enemy.voidPullCount = 2;
        Game._applyBossPhaseMechanic(Game.enemy, 3);
        const rules = getBossRules(Game);
        expect(rules.find(rule => rule.id === 'void-pull').text).toContain('3 raw damage');
        expect(rules.find(rule => rule.id === 'void-crush').text).toContain('5 player turn starts');
        expect(rules.find(rule => rule.id === 'void-shared').text).toContain('half');
        expect(rules.find(rule => rule.id === 'void-shatter').text).toContain('through shield');
        expect(getBossRules({})).toEqual([]);
        Game.enemy.currentHp = 0;
        expect(getBossRules(Game)).toEqual([]);
    });

    it('reports exact orb roles, their live HP and the vulnerability deadline without mutation', () => {
        Game.enemy.name = 'TESSERACT PRIME';
        Game.enemy.maxHp = 1000;
        Game._tesseractSpawnFragments(Game.enemy);
        const snapshot = JSON.stringify(Game.enemy);
        const rules = getBossRules(Game);
        expect(rules.find(rule => rule.id === 'orb-gate').title).toContain('4');
        expect(rules.find(rule => rule.id === 'orb-heart').text).toContain('80 HP');
        expect(rules.find(rule => rule.id === 'orb-mender').text).toContain('8 HP');
        expect(JSON.stringify(Game.enemy)).toBe(snapshot);
        Game.enemy.minions = [];
        Game.enemy._fragmentResummonAt = Game.turnCount + 3;
        expect(getBossRules(Game).find(rule => rule.id === 'orb-window').text).toContain('3 player turn starts');
    });

    it('explains actual shield bypass, gaze, reversal and detonation consequences', () => {
        Game.enemy.name = 'THE PANOPTICON';
        Game._applyBossPhaseMechanic(Game.enemy, 2);
        expect(getBossRules(Game).find(rule => rule.id === 'panopticon-gaze').tone).toBe('danger');
        allies([1]);
        expect(getBossRules(Game).find(rule => rule.id === 'panopticon-gaze').tone).toBe('info');
        Game.player.effects.push({ id: 'reality_shift', duration: 1 });
        expect(getBossRules(Game).find(rule => rule.id === 'reversal').text).toContain('Healing harms');
        Game.enemy._armedDetonate = true;
        expect(getBossRules(Game).find(rule => rule.id === 'detonation').text).toContain('before shield fades');
        Game.enemy.name = 'THE COMPILER';
        Game.enemy.armorPlating = 10;
        Game._applyBossPhaseMechanic(Game.enemy, 3);
        Game.sector = 3;
        expect(getBossRules(Game).find(rule => rule.id === 'compiler-armor').title).toContain('10');
        expect(getBossRules(Game).find(rule => rule.id === 'compiler-heat').text).toContain('5 raw');
        expect(getBossRules(Game).find(rule => rule.id === 'sector-heat').text).toContain('bypassing shield');
    });
});
