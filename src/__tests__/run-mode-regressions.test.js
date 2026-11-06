import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../game.js';
import { PLAYER_CLASSES, STATE } from '../constants.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { AudioMgr } from '../audio.js';
import { ParticleSys } from '../effects/particles.js';
import { ClassAbility } from '../ui/class-ability.js';
import { Ascension } from '../services/ascension.js';
import { Challenge } from '../services/dailies.js';
import { Achievements } from '../services/achievements.js';
import { Diag } from '../services/diag.js';

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = '<div id="btn-load-save"></div><div id="sector-display"></div>';
    document.body.className = '';
    Object.assign(Game, {
        currentState: STATE.COMBAT, _combatGen: 7, _winCombatRunning: false,
        player: null, enemy: null, sector: 1, challengeMode: false, archiveMode: false,
        customRunModifiers: new Set(), activePacts: new Set(), map: { nodes: [], currentIdx: 'start' },
        techFragments: 0, encryptedFiles: 0, corruptionLevel: 0, godMode: false,
        _challengeTwist: null, _archivistFacedThisRun: false, _activeSectorMech: null, _ascEffects: {},
        metaUpgrades: [], runStats: { turns: 5 },
        momentum: 0, _carriedUnusedDice: 0, _disabledMetaThisRun: new Set()
    });
    vi.spyOn(Game, 'hasMetaUpgrade').mockReturnValue(false);
    vi.spyOn(Game, 'renderRelics').mockImplementation(() => {});
    vi.spyOn(Game, 'updateHUD').mockImplementation(() => {});
    vi.spyOn(Game, 'shake').mockImplementation(() => {});
    vi.spyOn(Game, 'triggerSignatureVFX').mockImplementation(() => {});
    vi.spyOn(Game, 'changeState').mockImplementation(state => { Game.currentState = state; });
    vi.spyOn(ClassAbility, 'consumePreDamageBonus').mockReturnValue(0);
    vi.spyOn(ClassAbility, 'endCombat').mockImplementation(() => {});
    for (const name of ['playSound', 'startMusic', 'stopSectorAmbient', 'clearSectorMusic']) {
        vi.spyOn(AudioMgr, name).mockImplementation(() => {});
    }
    for (const name of ['createFloatingText', 'createShockwave', 'createExplosion', 'createSparks']) {
        vi.spyOn(ParticleSys, name).mockImplementation(() => {});
    }
    Game._applyCustomRunModifiers();
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

function makePlayer(classId = 'tactician') {
    const player = new Player(PLAYER_CLASSES.find(c => c.id === classId));
    player.classId = classId;
    Game.player = player;
    Game.invalidateStackCache();
    return player;
}

describe('run modifier lifecycle', () => {
    it('removes all restrictions and bonuses when the next run has no modifiers', () => {
        const player = makePlayer();
        Game.customRunModifiers = new Set(['no_rest', 'no_reroll', 'glass_cannon', 'extra_reroll', 'daily_dupes']);
        Game._applyCustomRunModifiers();
        document.body.classList.add('custom-hide-intents');
        Game.customRunModifiers.clear();
        Game._applyCustomRunModifiers();
        expect(Game._customRunActive).toEqual([]);
        expect(Game._customDisableRest).toBe(false);
        expect(Game._customDisableReroll).toBe(false);
        expect(Game._customRelicPickDupe).toBe(false);
        expect(Game._customPayoutMult).toBe(1);
        expect(Game._customDmgOutMult).toBe(1);
        expect(Game._customDmgInMult).toBe(1);
        expect(player._customExtraRerolls).toBe(0);
        expect(document.body.classList.contains('custom-hide-intents')).toBe(false);
    });

    it('keeps Glassy fixed across five fights and preserves custom damage scaling', () => {
        makePlayer();
        Game.customRunModifiers = new Set(['glass_cannon']);
        Game._applyCustomRunModifiers();
        const glassy = Challenge.twists.find(t => t.id === 'glassy');
        for (let fight = 0; fight < 5; fight++) {
            Game._applyChallengeDamageMultipliers(glassy);
            expect(Game._customDmgOutMult).toBeCloseTo(1.5 * 1.15);
            expect(Game._customDmgInMult).toBeCloseTo(1.5 * 1.15);
        }
        Game._applyChallengeDamageMultipliers(null);
        expect(Game._customDmgOutMult).toBe(1.5);
        Game.customRunModifiers.clear();
        Game._applyCustomRunModifiers();
        Game._applyChallengeDamageMultipliers(null);
        expect(Game._customDmgInMult).toBe(1);
    });

    it('resumes custom rules without repeating starting health or relic grants', () => {
        const player = makePlayer();
        player.maxHp = 50;
        player.currentHp = 17;
        player.relics = [{ id: 'nano_shield' }];
        Game.customRunModifiers = new Set(['no_rest', 'extra_reroll', 'starter_kit', 'hard_heart']);
        Game.saveGame();
        const addRelic = vi.spyOn(Player.prototype, 'addRelic');
        vi.spyOn(Game, 'renderMap').mockImplementation(() => {});
        Game.loadGame();
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game._customDisableRest).toBe(true);
        expect(Game.player._customExtraRerolls).toBe(1);
        expect(Game._customPayoutMult).toBeCloseTo(0.8);
        expect(Game.player.currentHp).toBe(17);
        expect(Game.player.relics).toHaveLength(1);
        expect(addRelic).not.toHaveBeenCalled();
    });
});

describe('Annihilator signature piercing', () => {
    it('deals the same HP damage through different shield amounts without consuming shield', () => {
        const player = makePlayer('annihilator');
        const losses = [];
        for (const shield of [0, 100]) {
            const enemy = new Enemy({ name: 'PIERCE TEST', hp: 500, dmg: 5, sector: 1 }, 0);
            enemy.shield = shield;
            Game.enemy = enemy;
            Game._resolveSignature({ signatureTier: 1 }, enemy, player, 1.5, 1.3);
            losses.push(enemy.maxHp - enemy.currentHp);
            expect(enemy.shield).toBe(shield);
        }
        expect(losses[0]).toBeGreaterThan(0);
        expect(losses[1]).toBe(losses[0]);
    });
});

describe('final run routing', () => {
    it.each([
        { challenge: true, keyOwned: false, state: STATE.VICTORY, sector: 5, archive: false },
        { challenge: true, keyOwned: true, state: STATE.VICTORY, sector: 5, archive: false },
        { challenge: false, keyOwned: false, state: STATE.ENDING, sector: 5, archive: false },
        { challenge: false, keyOwned: true, state: STATE.MAP, sector: 6, archive: true },
        { challenge: false, keyOwned: false, ascension: 19, state: STATE.ENDING, sector: 5, archive: false },
        { challenge: false, keyOwned: false, ascension: 20, state: STATE.MAP, sector: 6, archive: true },
        { challenge: true, keyOwned: false, ascension: 20, state: STATE.VICTORY, sector: 5, archive: false }
    ])('routes challenge=$challenge, key=$keyOwned and ascension=$ascension to $state', async expected => {
        makePlayer();
        Game.enemy = new Enemy({ name: 'TESSERACT PRIME', hp: 500, dmg: 5, actionsPerTurn: 2 }, 0);
        Game.enemy.currentHp = 0;
        Game.sector = 5;
        Game.challengeMode = expected.challenge;
        Game.techFragments = 100;
        Game._challengeTwist = Challenge.twists[0];
        Game.hasMetaUpgrade.mockImplementation(id => id === 's_archivist_key' && expected.keyOwned);
        Challenge.markActive(expected.challenge);
        const complete = vi.spyOn(Challenge, 'markComplete');
        for (const name of ['_runBossDeathDissolve', 'sleep', 'triggerSystemCrash']) {
            vi.spyOn(Game, name).mockResolvedValue();
        }
        for (const name of ['triggerSlowMo', 'triggerScreenFlash', '_logRunHistory', 'grantSparks',
            '_checkHiddenLoreTriggers', '_checkTrophyChallenges', '_renderPactPills', 'playSectorIntro', 'saveGame', '_clearSave']) {
            vi.spyOn(Game, name).mockImplementation(() => {});
        }
        vi.spyOn(Ascension, 'getSelected').mockReturnValue(expected.ascension || 0);
        Game._ascEffects = Ascension.activeEffects(expected.ascension || 0);
        vi.spyOn(Ascension, 'onRunVictory').mockReturnValue(false);
        vi.spyOn(Achievements, 'unlock').mockImplementation(() => {});
        vi.spyOn(Achievements, 'isUnlocked').mockReturnValue(false);
        vi.spyOn(Diag, 'dump').mockImplementation(() => {});
        await Game.winCombat();
        expect(complete).toHaveBeenCalledTimes(expected.challenge ? 1 : 0);
        expect(Game.currentState).toBe(expected.state);
        expect(Game.archiveMode).toBe(expected.archive);
        expect(Game.sector).toBe(expected.sector);
        if (expected.archive) {
            expect(Game._archivistFacedThisRun).toBe(true);
            expect(Game.map.nodes.find(node => node.id === 'boss-x')).toMatchObject({ type: 'boss', nodeSector: 6 });
            expect(Game.techFragments).toBe(100);
        }
    });
});
