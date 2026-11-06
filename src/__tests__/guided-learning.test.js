import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abandonSession, freshSession, warmSession } from './helpers/session-fixture.js';
import { V2_SAVE } from './helpers/save-fixtures.js';

vi.mock('../version.js', () => ({ APP_VERSION: '1.10.0', APP_EDITION: 'guided',
    APP_CACHE_PREFIX: 'mvm-guided-shell-v', APP_CACHE_KEY: 'mvm-guided-shell-v1-10-0' }));

let sessions = [];
beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
});
afterEach(() => {
    for (const session of sessions) abandonSession(session);
    sessions = [];
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
});
async function game() {
    const context = await warmSession();
    sessions.push(context);
    context.Learning.init({ enabled: true });
    context.Game.corruptionLevel = 0;
    context.Game._guidedRun = context.Learning.createRun(context.Game.player.classId);
    context.Game.generateMap();
    context.Game._syncSignatureDie();
    return context;
}
function profileKeys() {
    return Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('mvm_'))
        .map(key => [key, localStorage.getItem(key)]));
}

describe('explicit learning preferences and proven milestones', () => {
    it('defaults a new profile to Guided and Initiate without overriding a manual difficulty', async () => {
        const { Learning } = await game();
        expect(Learning.getMode()).toBe('guided');
        expect(localStorage.getItem('mvm_difficulty')).toBe('initiate');
        localStorage.removeItem('mvm_learning_v1');
        localStorage.setItem('mvm_difficulty', 'operator');
        Learning.init({ enabled: true });
        expect(localStorage.getItem('mvm_difficulty')).toBe('operator');
    });

    it('retains Full Rules for meaningful legacy profiles and does not infer practice from attempts', async () => {
        const { Learning } = await game();
        localStorage.removeItem('mvm_learning_v1');
        localStorage.setItem('mvm_runs_started', '99');
        Learning.init({ enabled: true });
        expect(Learning.getMode()).toBe('full');
        expect(Learning.profile().classes.tactician.practised).toEqual([]);
        expect(Learning.profile().shared.practised).toEqual([]);
    });

    it('keeps introduction, practice and skipped lessons separate and preserves the pending boundary queue', async () => {
        const { Learning } = await game();
        Learning.introduce('classAbility', 'summoner');
        Learning.skip('signature', 'summoner');
        Learning.recordAction('minion', { classId: 'summoner' });
        const stored = Learning.profile();
        expect(stored.classes.summoner.introduced).toEqual(['classAbility']);
        expect(stored.classes.summoner.practised).toEqual(['minion', 'allies']);
        expect(stored.classes.summoner.skipped).toEqual(['signature']);
        expect(stored.classes.tactician.introduced).toEqual([]);
        Learning.init({ enabled: true });
        expect(Learning.profile()).toEqual(stored);
        const run = Learning.createRun('summoner');
        Learning.boundary(run, 1);
        expect(Learning.canFeature('allyTiming', run)).toBe(false);
        Learning.boundary(run, 6);
        expect(Learning.canFeature('allyTiming', run)).toBe(true);
        expect(Learning.profile().queue).toEqual([]);
    });
});

describe('actual Guided hand, pool and encounter callers', () => {
    it('starts the Guided core through real class selection and skips forced training in Full Rules', async () => {
        const { Game, Learning, Breakout, PLAYER_CLASSES, STATE } = await game();
        const start = vi.spyOn(Breakout, 'start').mockImplementation(() => {});
        Game.currentState = STATE.CHAR_SELECT;
        Game.selectClass(PLAYER_CLASSES[0]);
        expect(start).toHaveBeenCalledWith(Game, { guided: true });
        expect(JSON.parse(Game._readSaveRaw()).guidance.core).toEqual({ roomIndex: 0, actions: [] });
        start.mockClear();
        Learning.setMode('full');
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        Game.selectClass(PLAYER_CLASSES[1]);
        expect(start).not.toHaveBeenCalled();
        expect(Game._guidedRun).toBeNull();
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game.map.nodes.filter(node => node.layer === 1 || node.layer === 2).every(node => node.type === 'rest')).toBe(true);
    });

    it.each(['tactician', 'arcanist', 'bloodstalker', 'annihilator', 'sentinel', 'summoner'])(
        '%s starts with a safe three-die class hand and gains a real paid skill at resources', async classId => {
            const { Game, Learning, Player, PLAYER_CLASSES, DICE_TYPES } = await game();
            Game.player = new Player(PLAYER_CLASSES.find(cls => cls.id === classId));
            Game.player.classId = classId;
            Game._guidedRun = Learning.createRun(classId);
            const cd = PLAYER_CLASSES.find(cls => cls.id === classId).classDice;
            Game.rollDice(9);
            expect(Game.dicePool.map(die => die.type)).toEqual(expect.arrayContaining([cd.attack, cd.defend]));
            expect(Game.dicePool).toHaveLength(3);
            expect(Game.dicePool.some(die => DICE_TYPES[die.type].isSkill || die.type === 'SIGNATURE')).toBe(false);
            if (classId === 'summoner') expect(Game.dicePool.map(die => die.type)).toContain(cd.minion);
            expect(Game._getAvailableDiceTypes().some(type => DICE_TYPES[type].isSkill)).toBe(false);
            Learning.boundary(Game._guidedRun, 3);
            Game.rollDice(9);
            expect(Game.dicePool).toHaveLength(classId === 'summoner' ? 5 : 4);
            expect(Game.dicePool.map(die => die.type)).toEqual(expect.arrayContaining([cd.attack, cd.defend, cd.mana, 'EARTHQUAKE']));
            expect(DICE_TYPES.EARTHQUAKE.cost).toBe(2);
            expect(Game.dicePool.some(die => die.type === 'SIGNATURE')).toBe(false);
        });

    it('uses the real route and enemy constructor without the two opening rests or early complex enemies', async () => {
        const { Game, STATE } = await game();
        expect(Game.map.nodes.slice(1, 6).map(node => node.type)).toEqual(['combat', 'combat', 'rest', 'combat', 'shop']);
        expect(Game.map.nodes.filter(node => node.type === 'rest')).toHaveLength(2);
        expect(Game.map.nodes.map(node => node.lesson)).toEqual(expect.arrayContaining(['status', 'hostile', 'multiwave', 'signature']));
        Game.currentState = STATE.MAP;
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const entered = Game.startCombat('combat');
        await vi.advanceTimersByTimeAsync(1200);
        await entered;
        expect(Game.enemy.name).toBe('Sentry Drone');
        expect(Game.currentState).toBe(STATE.COMBAT);
        expect(Game.dicePool).toHaveLength(3);
        expect(Game.turnCount).toBe(1);
    });

    it('records only an accepted, actually paid skill and needs no Perfect result', async () => {
        const { Game, Learning } = await game();
        Learning.boundary(Game._guidedRun, 3);
        Game.enemy.currentHp = Game.enemy.maxHp = 1000;
        const die = { id: 90, type: 'EARTHQUAKE', used: false, selected: false };
        Game.dicePool = [die];
        const el = document.createElement('div');
        Game.player.mana = 1;
        Game.useDie(die, el, Game.enemy);
        expect(die.used).toBe(false);
        expect(Learning.profile().shared.practised).not.toContain('skills');
        Game.player.mana = 3;
        Game.useDie(die, el, Game.enemy);
        expect(Game.player.mana).toBe(1);
        expect(die.used).toBe(true);
        expect(Learning.profile().shared.practised).toContain('skills');
        expect(Learning.profile().shared.practised).toContain('resources');
        await vi.advanceTimersByTimeAsync(1800);
    });

    it('keeps rewards, rest modules, skill upgrades and the first shop within the introduced pool', async () => {
        const { Game, Learning, STATE } = await game();
        Game.generateRewards({ prepareOnly: true });
        expect(Game.pendingReward.options).toEqual(['hull_plating', 'nano_shield', 'titan_module']);
        expect(Game._availableDiceUpgrades().some(id => Game._getAvailableDiceTypes().includes(id))).toBe(true);
        expect(Game._availableDiceUpgrades()).not.toContain('EARTHQUAKE');
        Game.pendingReward = null;
        Game.currentState = STATE.MAP;
        const rest = Game.map.nodes.find(node => node.guideStage === 2);
        rest.status = 'available';
        Game.visitNode(rest);
        expect(document.getElementById('btn-rest-tinker').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('btn-rest-meditate').classList.contains('hidden')).toBe(true);
        Game._openModulePicker();
        const cards = [...document.querySelectorAll('#module-pick-options .reward-card')];
        expect(cards).toHaveLength(3);
        expect(document.getElementById('module-pick-options').textContent).not.toMatch(/Voodoo|Corrupted|Fusion|Max Mana/);
        Learning.boundary(Game._guidedRun, 4);
        Game.generateShop();
        expect(Game.shopInventory).toHaveLength(3);
        expect(Game.shopInventory.every(item => item.type === 'item')).toBe(true);
        expect(Game.shopInventory.some(item => item.id === 'minion_core')).toBe(false);
        Game._refreshHackButton();
        expect(document.getElementById('btn-hack-shop').classList.contains('hidden')).toBe(true);
    });

    it('gives the first boss explicit Guided rules while leaving its actual phase identity intact', async () => {
        const { Game, Learning, STATE } = await game();
        Learning.boundary(Game._guidedRun, Game.map.nodes.find(node => node.type === 'boss').guideStage);
        Game.currentState = STATE.MAP;
        const entered = Game.startCombat('boss');
        await vi.advanceTimersByTimeAsync(3300);
        await entered;
        expect(Game.enemy.name).toBe('THE PANOPTICON');
        expect(Game.enemy.maxHp).toBe(180);
        expect(Game.enemy.baseDmg).toBe(12);
        expect(Game.enemy.bossData.actionsPerTurn).toBe(1);
        expect(Game._guidedBossRules[0].text).toContain('180 base HP');
        expect(Game.enemy.minions).toHaveLength(2);
        expect(Game.getBossRules().map(rule => rule.id)).toEqual(expect.arrayContaining(['guided-patrol', 'actions', 'support', 'analyse']));
    });

    it('carries six base dice into Sector 2 after a real boss win while keeping later introductions staged', async () => {
        const { Game, STATE, Learning } = await game();
        Game.currentState = STATE.MAP;
        const boss = Game.map.nodes.find(node => node.type === 'boss');
        for (let stage = 0; stage < boss.guideStage; stage++) Learning.boundary(Game._guidedRun, stage);
        boss.status = 'available';
        Game.visitNode(boss);
        await vi.advanceTimersByTimeAsync(3300);
        expect(Game._guidedRun.finished).toBe(false);
        vi.spyOn(Game, '_runBossDeathDissolve').mockResolvedValue();
        Game.enemy.currentHp = 0;
        const won = Game.winCombat();
        await vi.advanceTimersByTimeAsync(1000);
        await won;
        expect(Game._guidedRun.foundationComplete).toBe(true);
        expect(Game._guidedRun.finished).toBe(false);
        expect(Game._canGuidedFeature('fusions')).toBe(false);
        expect(Game._canGuidedFeature('combos')).toBe(false);
        expect(Game._guidedRun.combats).toBe(1);
        expect(Game._canGuidedFeature('allyTiming')).toBe(true);
        Game.changeState(STATE.REWARD);
        vi.spyOn(Game, 'flyRewardToStrip').mockImplementation(() => {});
        vi.spyOn(Game, 'playSectorIntro').mockImplementation(() => {});
        document.querySelector('#reward-options .reward-card').onclick();
        expect(Game.sector).toBe(2);
        Game.rollDice(Game.player.diceCount);
        expect(Game.dicePool).toHaveLength(6);
        Game.rollDice(4);
        expect(Game.dicePool).toHaveLength(4);
        Game.loadGame();
        expect(Game.player.diceCount).toBe(6);
    });
});

describe('cold checkpoints, mode separation and harmless rehearsal', () => {
    it('retains earned introductions on a comeback without manufacturing practice or advancing the route', async () => {
        const { Game, Learning } = await game();
        Learning.boundary(Game._guidedRun, 3);
        Learning.init({ enabled: true });
        const nextRun = Learning.createRun('tactician');
        expect(nextRun.stage).toBe(0);
        expect(nextRun.combats).toBe(0);
        expect(Learning.canFeature('skills', nextRun)).toBe(true);
        expect(Learning.profile().shared.practised).not.toContain('skills');
        expect(Learning.handPlan(nextRun, 'tactician')).toContain('EARTHQUAKE');
    });

    it('saves before starting optional practice and leaves a blocked checkpoint open', async () => {
        const { Game, Breakout, STATE } = await game();
        let picker;
        Game._learningUI = { showPracticeLibrary: options => { picker = options; } };
        const start = vi.spyOn(Breakout, 'start').mockImplementation(() => {});
        Game.openPracticeLibrary();
        picker.onSelect(picker.lessons[0]);
        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game._readSaveRaw()).toBeTruthy();
        expect(start).toHaveBeenCalledWith(Game, { practiceRoom: 0, classId: 'tactician', onComplete: expect.any(Function) });
        start.mockClear();
        Game.currentState = STATE.COMBAT;
        vi.spyOn(Game, 'saveGame').mockReturnValue(false);
        Game.openPracticeLibrary();
        picker.onSelect(picker.lessons[1]);
        expect(start).not.toHaveBeenCalled();
        expect(Game.currentState).toBe(STATE.COMBAT);
    });

    it('restores exact stage, introduced rules and offers even if the next-run preference changes to Full', async () => {
        const active = await game();
        const { Game, Learning } = active;
        Learning.boundary(Game._guidedRun, 6);
        Game.generateRewards({ prepareOnly: true });
        Game.saveGame();
        const raw = JSON.parse(Game._readSaveRaw());
        expect(raw.v).toBe(6);
        Learning.setMode('full');
        abandonSession(active);
        const fresh = await freshSession(active);
        sessions.push(fresh);
        fresh.Learning.init({ enabled: true });
        fresh.Game.loadGame();
        expect(fresh.Learning.getMode()).toBe('full');
        expect(fresh.Game._guidedRun).toEqual(raw.guidance);
        expect(fresh.Game._canGuidedFeature('signature')).toBe(false);
        expect(fresh.Game.pendingReward).toEqual(raw.pendingReward);
        expect(fresh.Game.currentState).toBe(fresh.STATE.REWARD);
    });

    it('loads a v4 legacy map with Full Rules and no invented guidance', async () => {
        const { Game, STATE } = await game();
        localStorage.setItem(Game._saveKey(), JSON.stringify({ ...V2_SAVE, v: 4, pendingReward: null }));
        Game.loadGame();
        expect(Game._guidedRun).toBeNull();
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Game.map.nodes.map(node => node.id)).toEqual(['start', 'fight']);
        expect(Game._canGuidedFeature('classAbility')).toBe(true);
        expect(Game._canGuidedFeature('allyTiming')).toBe(true);
    });

    it('round-trips its real v6 export and rejects malformed guidance before replacing it', async () => {
        const { Game } = await game();
        const { SaveSync } = await import('../services/save-sync.js');
        Game.saveGame();
        const exported = SaveSync.exportAll();
        expect(SaveSync.importAll(exported)).toBe(true);
        const invalid = structuredClone(exported);
        const save = JSON.parse(invalid.data.save_v1__A);
        save.guidance.stage = 999;
        invalid.data.save_v1__A = JSON.stringify(save);
        expect(SaveSync.importAll(invalid)).toBe(false);
        expect(SaveSync.exportAll().data).toEqual(exported.data);
    });

    it('resumes the current core room through the production recovery caller and grants its key once', async () => {
        const { Game, Breakout, STATE, Learning } = await game();
        Game.currentState = STATE.BREAKOUT;
        Game._onGuidedCoreProgress({ roomIndex: 1, actions: ['attack', 'defend'] });
        const start = vi.spyOn(Breakout, 'start').mockImplementation(() => {});
        Game.loadGame();
        expect(start).toHaveBeenCalledWith(Game, { guided: true,
            progress: { roomIndex: 1, actions: ['attack', 'defend'] } });
        const hp = Game.player.maxHp;
        Game._onGuidedCoreComplete();
        expect(Game.player.hasRelic('cellkey_shard')).toBeTruthy();
        expect(Game.player.maxHp).toBe(hp + 3);
        expect(Game.currentState).toBe(STATE.MAP);
        expect(Learning.coreComplete()).toBe(true);
        const checkpoint = Game._readSaveRaw();
        Game._onGuidedCoreComplete();
        expect(Game.player.maxHp).toBe(hp + 3);
        expect(Game._readSaveRaw()).toBe(checkpoint);
    });

    it('never writes a checkpoint, profile reward or learning milestone during practice', async () => {
        const { Game, Learning } = await game();
        Game.saveGame();
        const before = profileKeys();
        Game._practiceSession = { active: true };
        expect(Game.saveGame()).toBe(true);
        Game.saveData();
        expect(Game.grantSparks(90, 'practice')).toBe(0);
        Game._recordLearningAction('classAbility');
        Learning.recordAction('skills', { classId: 'tactician', practice: true, cost: 2, skill: true });
        expect(profileKeys()).toEqual(before);
    });

    it('honours disabled help without marking any hint as seen', async () => {
        const { Game } = await game();
        const show = vi.fn();
        const hide = vi.fn();
        Game._learningUI = { showObjective: show, hideObjective: hide };
        Game.tutorialHintsEnabled = false;
        const before = profileKeys();
        Game._showLearningObjective();
        expect(show).not.toHaveBeenCalled();
        expect(hide).toHaveBeenCalled();
        expect(profileKeys()).toEqual(before);
    });

    it('opens actual encounter rules at body level, pauses reading and restores it through Back', async () => {
        const { Game } = await game();
        Game._learningUI = await import('../ui/learning-ui.js');
        document.getElementById('hud').classList.remove('hidden');
        Game.enemy._armedDetonate = true;
        Game._showLearningObjective();
        const card = document.getElementById('learning-objective');
        expect(card.dataset.kind).toBe('boss');
        card.querySelector('button').click();
        expect(document.getElementById('learning-boss-rules').parentElement).toBe(document.body);
        expect(Game.paused).toBe(true);
        expect(Game.dismissOpenOverlay()).toBe(true);
        expect(document.getElementById('learning-boss-rules')).toBeNull();
        expect(Game.paused).toBe(false);
    });

    it('does not open a reading panel over timing, turn resolution or a committed attack', async () => {
        const { Game } = await game();
        Game._learningUI = await import('../ui/learning-ui.js');
        document.getElementById('hud').classList.remove('hidden');
        Game.enemy._armedDetonate = true;
        Game._showLearningObjective();
        const click = () => document.querySelector('#learning-objective button').click();
        for (const lock of ['inputLocked', '_endTurnRunning', '_combatActionDepth']) {
            Game[lock] = 1;
            click();
            expect(document.getElementById('learning-boss-rules')).toBeNull();
            Game[lock] = 0;
        }
        Game.qte.active = true;
        click();
        expect(document.getElementById('learning-boss-rules')).toBeNull();
        expect(Game.paused).toBe(false);
    });

    it('lets a defeated player open and close harmless practice without changing the lost run', async () => {
        const { Game, STATE } = await game();
        Game._learningUI = await import('../ui/learning-ui.js');
        Game.currentState = STATE.GAMEOVER;
        Game.player.currentHp = 0;
        const before = profileKeys();
        Game.openPracticeLibrary();
        expect(document.getElementById('learning-practice-library')).not.toBeNull();
        expect(Game.paused).toBe(true);
        expect(Game.dismissOpenOverlay()).toBe(true);
        expect(Game.paused).toBe(false);
        expect(Game.player.currentHp).toBe(0);
        expect(profileKeys()).toEqual(before);
    });

    it('explains the Challenge before it can replace a Guided checkpoint', async () => {
        const { Game, Learning, STATE } = await game();
        Game.saveGame();
        const checkpoint = Game._readSaveRaw();
        const briefing = vi.fn();
        Game._learningUI = { showModeBriefing: briefing };
        expect(Game.startChallenge()).toBe(false);
        expect(briefing).toHaveBeenCalledOnce();
        expect(Game._readSaveRaw()).toBe(checkpoint);
        const options = briefing.mock.calls[0][0];
        options.onCancel();
        expect(Learning.isAcknowledged('mode:challenge')).toBe(false);
        expect(Game._readSaveRaw()).toBe(checkpoint);
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        options.onStart();
        expect(Learning.isAcknowledged('mode:challenge')).toBe(true);
        expect(Game._readSaveRaw()).toBe(checkpoint);
        expect(Game.currentState).toBe(STATE.COMBAT);
    });
});
