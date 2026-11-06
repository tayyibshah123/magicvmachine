import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonSession, warmSession } from './helpers/session-fixture.js';

vi.mock('../version.js', () => ({ APP_VERSION: '1.10.0', APP_EDITION: 'guided',
    APP_CACHE_PREFIX: 'mvm-guided-shell-v', APP_CACHE_KEY: 'mvm-guided-shell-v1-10-0' }));
let active;
beforeEach(async () => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    active = await warmSession();
    active.Game.corruptionLevel = 0;
    active.Learning.init({ enabled: true });
    active.Game._guidedRun = active.Learning.createRun('tactician');
    active.Game.generateMap();
    active.Game._syncSignatureDie();
});
afterEach(() => {
    abandonSession(active);
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});
function enter(lesson, sector = 1) {
    const { Game, Learning } = active;
    if (Game.sector !== sector) { Game.sector = sector; Game.generateMap(); }
    const target = Game.map.nodes.find(node => node.lesson === lesson);
    expect(target, lesson).toBeTruthy();
    for (let stage = 0; stage <= target.guideStage; stage++) Learning.boundary(Game._guidedRun, stage, { sector });
    Game.map.currentIdx = target.id;
    return target;
}

describe('production ordinary intents and separately staged threats', () => {
    it('does not smuggle a summon or low-HP heal into the first patrol through the ordinary intent fallback', () => {
        const { Game, Enemy, ENEMIES } = active;
        const drone = new Enemy(ENEMIES.find(enemy => enemy.name === 'Sentry Drone'), 1);
        vi.spyOn(Math, 'random').mockReturnValue(0.05);
        expect(drone.generateSingleIntent().type).toBe('attack');
        drone.currentHp = 1;
        expect(drone.generateSingleIntent().type).toBe('attack');
        enter('hostile');
        drone.currentHp = drone.maxHp;
        expect(drone.generateSingleIntent().type).toBe('summon');
        Game._guidedRun = null;
        drone.currentHp = 1;
        expect(drone.generateSingleIntent().type).toBe('heal');
    });

    it('keeps boss move selection outside the ordinary guided-intent override', () => {
        const { Game, Enemy, BOSS_DATA } = active;
        const override = vi.spyOn(Game, '_guidedOrdinaryIntent').mockReturnValue({ type: 'poisoned-test' });
        const boss = new Enemy(BOSS_DATA[1], 1);
        expect(boss.generateSingleIntent().type).not.toBe('poisoned-test');
        expect(override).not.toHaveBeenCalled();
    });

    it('separates status, hostile priority, two-hit pressure, signature and elite before the boss', () => {
        const steps = active.Learning.steps(1);
        const position = lesson => steps.findIndex(step => step.lesson === lesson);
        expect(position('status')).toBeLessThan(position('hostile'));
        expect(position('hostile')).toBeLessThan(position('multiwave'));
        expect(position('multiwave')).toBeLessThan(position('signature'));
        expect(position('signature')).toBeLessThan(position('elite'));
        expect(position('elite')).toBeLessThan(position('boss'));
        const { Game } = active;
        enter('status');
        expect(Game._canGuidedFeature('hostileMinions')).toBe(false);
        expect(Game._canGuidedFeature('multiwave')).toBe(false);
    });

    it('builds a real hostile target and a separate deterministic two-hit enemy intent', async () => {
        const { Game, STATE } = active;
        enter('hostile');
        Game.currentState = STATE.MAP;
        const first = Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(1200);
        await first;
        expect(Game.enemy.minions).toHaveLength(1);
        expect(Game.enemy.minions[0]).toMatchObject({ isPlayerSide: false, currentHp: 2, dmg: 4 });
        Game.changeState(STATE.MAP);
        enter('multiwave');
        const next = Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(1200);
        await next;
        expect(Game.enemy.minions).toHaveLength(0);
        expect(Game.enemy.generateSingleIntent()).toMatchObject({ type: 'multi_attack', hits: 2, val: 3, target: Game.player });
    });

    it('rejects an unearned locked map entry before mutating the lesson or replacing the enemy', () => {
        const { Game, STATE } = active;
        Game.currentState = STATE.MAP;
        const enemy = Game.enemy;
        Game.visitNode(Game.map.nodes.find(node => node.type === 'boss'));
        expect(Game._guidedRun.stage).toBe(0);
        expect(Game._guidedRun.entered).toEqual([]);
        expect(Game.enemy).toBe(enemy);
    });
});

describe('later introductions remain tied to actual context', () => {
    it('delivers an earned Command draw on the next real player turn without exposing hidden tools', async () => {
        const { Game, ClassAbility } = active;
        enter('allies');
        ClassAbility.init(Game);
        ClassAbility.startCombat();
        ClassAbility.onEvent('dice_used', { type: 'TAC_ATTACK' });
        ClassAbility.onEvent('dice_used', { type: 'TAC_ATTACK' });
        ClassAbility._activate('tact-shield');
        expect(Game.player.bonusDrawNextTurn).toBe(1);
        const turn = Game.startTurn();
        await vi.advanceTimersByTimeAsync(1500);
        await turn;
        expect(Game.dicePool).toHaveLength(6);
        expect(Game.dicePool.some(die => die.type === 'SIGNATURE' || die.type === 'CONSTRICT')).toBe(false);
        expect(Game.player.bonusDrawNextTurn).toBe(0);
        const next = Game.startTurn();
        await vi.advanceTimersByTimeAsync(1500);
        await next;
        expect(Game.dicePool).toHaveLength(5);
    });
    it.each(['tactician', 'sentinel', 'arcanist', 'bloodstalker', 'annihilator', 'summoner'])
        ('adds %s signature without removing the learned ally or paid skill', async classId => {
            const { Game, Learning, Player, PLAYER_CLASSES } = active;
            const cls = PLAYER_CLASSES.find(item => item.id === classId);
            Game.player = new Player(cls);
            Game.player.classId = classId;
            Game._guidedRun = Learning.createRun(classId);
            Game._syncSignatureDie();
            enter('signature');
            Game.rollDice(6);
            await vi.advanceTimersByTimeAsync(600);
            expect(Game.dicePool.map(die => die.type)).toEqual(expect.arrayContaining([
                cls.classDice.attack, cls.classDice.defend, cls.classDice.mana,
                cls.classDice.minion, 'CONSTRICT', 'SIGNATURE'
            ]));
            expect(Game.dicePool).toHaveLength(6);
        });
    it('keeps combos and momentum out of the opening hand and introduces their real effects separately', () => {
        const { Game, Learning } = active;
        Game.rollDice(6);
        expect(Game.comboDoubleStrike).toBe(false);
        Game._tickMomentum('parry', 1);
        expect(Game.momentum).toBe(0);
        enter('boss');
        Learning.recordWin(Game._guidedRun, 'guide-boss', { boss: true, sector: 1 });
        expect(Game._guidedRun.foundationComplete).toBe(true);
        expect(Game._guidedRun.finished).toBe(false);
        expect(Game._canGuidedFeature('combos')).toBe(false);
        expect(Game._canGuidedFeature('fusions')).toBe(false);
        enter('sectorMechanics', 2);
        expect(Game._canGuidedFeature('sectorMechanics')).toBe(true);
        expect(Game._canGuidedFeature('combos')).toBe(false);
        enter('combos', 2);
        Game.rollDice(6);
        expect(Game.comboDoubleStrike).toBe(true);
        for (const die of Game.dicePool.filter(die => Game._dieSlot(die.type) === 'attack')) Game._onDieConsumed(die);
        expect(Learning.profile().shared.practised).toContain('combos');
        expect(Game.momentum).toBe(0);
        enter('momentum', 2);
        Game._tickMomentum('combo', 1);
        expect(Game.momentum).toBe(1);
        expect(Learning.profile().shared.practised).toContain('momentum');
    });

    it('curates actual later-sector enemy kinds and each new sector explanation', async () => {
        const { Game, STATE } = active;
        enter('boss');
        enter('sectorMechanics', 2);
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        Game.currentState = STATE.MAP;
        let started = Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(1200);
        await started;
        expect(Game.enemy.kind).toBeNull();
        Game.changeState(STATE.MAP);
        enter('enemy_frost', 2);
        started = Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(1200);
        await started;
        expect(Game.enemy.kind).toBe('frost');
        expect(Game._canGuidedFeature('enemy_armored')).toBe(false);
        enter('sectorMechanics', 3);
        expect(active.Learning.objective(Game._guidedRun, 'tactician').text).toContain('SECTOR 3');
        expect(active.Learning.profile().shared.introduced).toEqual(expect.arrayContaining(['sector_2', 'sector_3']));
    });

    it('requires an actual ordinary purchase before the contextual shop-hack introduction', () => {
        const { Game, STATE } = active;
        enter('shop');
        Game.techFragments = 400;
        Game.generateShop();
        Game.renderShop();
        document.querySelector('#shop-grid .shop-item').onclick();
        expect(active.Learning.profile().shared.practised).toContain('shopBuy');
        expect(Game._canGuidedFeature('shopHack')).toBe(false);
        Game.sector = 2;
        Game.generateMap();
        const shop = Game.map.nodes.find(node => node.type === 'shop');
        for (let stage = 0; stage < shop.guideStage; stage++) active.Learning.boundary(Game._guidedRun, stage, { sector: 2 });
        shop.status = 'available';
        Game.currentState = STATE.MAP;
        Game.visitNode(shop);
        expect(Game._canGuidedFeature('shopHack')).toBe(true);
        expect(Game._guidedRun.lesson).toBe('shopHack');
        expect(active.Learning.objective(Game._guidedRun, 'tactician').text).toContain('failure doubles');
    });

    it('preserves v1 route and mechanic semantics for an existing snapshot', () => {
        const { Game, Learning, UPGRADES_POOL } = active;
        Game._guidedRun = { v: 1, route: 'first-sector-v1', classId: 'tactician', stage: 3, combats: 2, completed: [],
            features: ['attack', 'defend', 'mana', 'skills'], core: null, finished: false };
        expect(Learning.restoreRun(Game._guidedRun)).toEqual(Game._guidedRun);
        expect(Learning.route(Game._guidedRun, 1).nodes).toHaveLength(11);
        expect(Game._canGuidedFeature('combos')).toBe(true);
        expect(Learning.allowDie('METEOR', Game._guidedRun)).toBe(false);
        expect(Game._guidedPool(UPGRADES_POOL, 'modules').some(item => item.id === 'voodoo_doll')).toBe(false);
    });

    it('gives the healing-support lesson an actually wounded ally to demonstrate its real heal intent', async () => {
        const { Game, STATE } = active;
        enter('enemy_healer', 3);
        Game.currentState = STATE.MAP;
        const started = Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(1200);
        await started;
        expect(Game.enemy.kind).toBe('healer');
        const support = Game.enemy.minions[0];
        expect(support.currentHp).toBe(4);
        expect(support.maxHp).toBe(8);
        expect([Game.enemy.generateSingleIntent(), Game.enemy.generateSingleIntent()])
            .toContainEqual({ type: 'heal_ally', val: 1, target: support });
    });
});

describe('provenance and completed voluntary drills', () => {
    it.each([
        ['mvm_upgrades', '["m_life"]'], ['mvm_unlocks_v1', '{"ascension":true}'], ['mvm_sparks_lifetime', '9']
    ])('recognises earned legacy evidence from %s without needing a surviving run counter', (key, value) => {
        localStorage.removeItem('mvm_learning_v1');
        localStorage.setItem(key, value);
        active.Learning.init({ enabled: true });
        expect(active.Learning.profile().legacy).toBe(true);
        expect(active.Learning.getMode()).toBe('full');
    });
    it('persists legacy provenance and acknowledgement without treating a core completion as a legacy profile', () => {
        const { Learning } = active;
        expect(Learning.isIntroductory()).toBe(true);
        Learning.recordCore('tactician');
        expect(Learning.isIntroductory()).toBe(true);
        Learning.acknowledge('return');
        Learning.init({ enabled: true });
        expect(Learning.isAcknowledged('return')).toBe(true);
        localStorage.removeItem('mvm_learning_v1');
        localStorage.setItem('mvm_runs_started', '5');
        Learning.init({ enabled: true });
        expect(Learning.profile().legacy).toBe(true);
        Learning.setMode('guided');
        Learning.init({ enabled: true });
        expect(Learning.isIntroductory()).toBe(false);
    });

    it('credits an explicitly completed drill without introducing tools, enqueuing progression or paying currency', () => {
        const { Game, Learning } = active;
        const before = Learning.profile();
        const wallet = localStorage.getItem('mvm_sparks');
        expect(Learning.recordPractice('resources', 'tactician')).toBe(true);
        expect(Learning.profile().shared.practised).toContain('resources');
        expect(Learning.profile().shared.introduced).toEqual(before.shared.introduced);
        expect(Learning.profile().queue).toEqual(before.queue);
        expect(Game._guidedRun.combats).toBe(0);
        expect(Learning.canFeature('skills', Learning.createRun('tactician'))).toBe(false);
        expect(localStorage.getItem('mvm_sparks')).toBe(wallet);
    });
});
