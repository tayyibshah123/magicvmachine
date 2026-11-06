import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
import { STATE, META_UPGRADES } from '../constants.js';
import { Breakout } from '../services/breakout.js';
import { Onboarding } from '../services/onboarding.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { CombatStats } from '../services/combat-stats.js';
import { CombatLog } from '../services/combat-log.js';
import { decorateClassSelection, showObjective, hideObjective, showPracticeLibrary,
    hidePracticeLibrary, showBossRules, hideBossRules, dismissLearningOverlay,
    decorateSanctuary, hideSanctuaryGuidance, decorateOutcome, hideOutcomeGuidance,
    decorateReward, showReturnGuidance, hideReturnGuidance } from '../ui/learning-ui.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';

const markup = readFileSync('index.html', 'utf8');

beforeEach(() => {
    setupCombatFixture({ profiles: ['cosmetics', 'ui', 'class-events'] });
    document.documentElement.innerHTML = markup;
    document.getElementById('intro-overlay')?.remove();
    Game.canvas = document.getElementById('gameCanvas');
    Game.currentState = STATE.MENU;
    Game._practiceSession = false;
    Game._modernPacing = true;
    Game._menuPulseRaf = null;
    Game.map = { currentIdx: 'start', nodes: [{ id: 'start', type: 'start', connections: [], status: 'completed' }] };
    Game.runStats = { kills: 9, turns: 5, nested: { selected: ['original'] } };
    Game.techFragments = 123;
    Game.sparks = 42;
    delete Game._showAllLearningOperators;
    delete Game._learningSanctuaryBrowseAll;
    delete Game._onGuidedCoreComplete;
    delete Game._onGuidedCoreProgress;
    window.Game = Game;
    Object.assign(Breakout, { _active: false, _practice: false, _guided: false, _restorePractice: null, _advancing: false });
    Object.assign(Hints, { _seen: new Set(), _queue: [], _active: false, _activeId: null, _root: null, _closing: false });
    Unlocks.init();
    vi.spyOn(Game, '_startMenuPulse').mockImplementation(() => {});
    vi.spyOn(Game, 'drawQTE').mockImplementation(() => {});
    vi.spyOn(Breakout, '_setSpotlight').mockImplementation(() => {});
    vi.spyOn(Breakout, '_showStoryboard').mockImplementation((slate, done) => done());
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
});

afterEach(() => {
    Breakout.cancel({ returnToMenu: false });
    hidePracticeLibrary();
    hideBossRules();
    hideObjective();
    hideSanctuaryGuidance();
    hideOutcomeGuidance();
    hideReturnGuidance();
    Hints.suspend();
    Unlocks.suspendAnnouncements();
    if (Hints._visibilityHandler) document.removeEventListener('visibilitychange', Hints._visibilityHandler);
    Hints._visibilityHandler = null;
    delete window.Game;
    delete window.__MVM_PROFILE_SCOPE__;
    vi.unstubAllGlobals();
    teardownCombatFixture();
});

describe('guided choices and reference UI', () => {
    it('commits one explicit Guided or Full Rules choice before deployment', () => {
        const calls = [];
        Onboarding.run({ onModeChoice: mode => calls.push(['mode', mode]), onStartTutorial: mode => calls.push(['start', mode]) });
        expect(document.querySelector('[data-learning-mode="guided"]').getAttribute('aria-checked')).toBe('true');
        document.querySelector('[data-learning-mode="full"]').click();
        document.getElementById('onb-next-1').click();
        document.getElementById('onb-next-1').click();
        expect(calls).toEqual([['mode', 'full'], ['start', 'full']]);
    });

    it('keeps the original onboarding surface when no mode callback is supplied', () => {
        Onboarding.run();
        expect(document.querySelector('[data-learning-mode]')).toBeNull();
    });

    it('supports keyboard selection of Full Rules without deploying on an arrow key', () => {
        const choice = vi.fn();
        Onboarding.run({ onModeChoice: choice });
        const guided = document.querySelector('[data-learning-mode="guided"]');
        guided.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement.dataset.learningMode).toBe('full');
        expect(choice).not.toHaveBeenCalled();
        document.getElementById('onb-next-1').click();
        expect(choice).toHaveBeenCalledWith('full');
    });

    it('foregrounds two recommendations while preserving access to every class', () => {
        const grid = document.getElementById('char-grid');
        for (const id of ['tactician', 'sentinel', 'arcanist', 'summoner', 'bloodstalker', 'annihilator']) {
            const button = document.createElement('button');
            button.className = 'char-card'; button.dataset.classId = id; grid.appendChild(button);
        }
        decorateClassSelection(Game, { mode: 'guided', coreComplete: false });
        expect(grid.querySelectorAll('.learning-recommended')).toHaveLength(2);
        expect(grid.querySelectorAll('.learning-advanced-hidden')).toHaveLength(4);
        document.getElementById('btn-more-operators').click();
        expect(grid.querySelectorAll('.char-card')).toHaveLength(6);
        expect(grid.querySelectorAll('.learning-advanced-hidden')).toHaveLength(0);
        expect(document.getElementById('btn-more-operators').getAttribute('aria-expanded')).toBe('true');
        decorateClassSelection(Game, { mode: 'full' });
        expect(document.getElementById('btn-more-operators')).toBeNull();
        expect(grid.querySelectorAll('.learning-advanced-hidden')).toHaveLength(0);
    });

    it('puts combat coaching in its reserved control row rather than over targets', () => {
        document.getElementById('hud').classList.remove('hidden');
        const help = vi.fn();
        const objective = showObjective({ title: 'NEXT STEP', text: 'Use one defensive die.', onHelp: help });
        expect(objective.parentElement.classList.contains('bottom-controls')).toBe(true);
        expect(objective.classList.contains('learning-objective--combat')).toBe(true);
        objective.querySelector('button').click();
        expect(help).toHaveBeenCalledTimes(1);
        expect(document.getElementById('btn-end-turn').parentElement.contains(objective)).toBe(false);
    });

    it('opens readable boss rule objects in a body-level panel and closes without a game action', () => {
        document.getElementById('hud').classList.remove('hidden');
        showBossRules({ rules: [{ id: 'purge', title: 'THE PURGE', text: 'Ignores shield. Reduce damage before the hit.', tone: 'danger' }] });
        document.querySelector('.learning-objective-help').click();
        const panel = document.getElementById('learning-boss-rules');
        expect(panel.parentElement).toBe(document.body);
        expect(panel.textContent).toContain('Ignores shield');
        expect(panel.textContent).not.toContain('[object Object]');
        expect(dismissLearningOverlay()).toBe(true);
        expect(document.getElementById('learning-boss-rules')).toBeNull();
        expect(Game.currentState).toBe(STATE.MENU);
    });

    it('selects a single practice lesson without treating selection as completion or close', () => {
        const select = vi.fn(), close = vi.fn();
        showPracticeLibrary({ lessons: [{ id: 'core', title: 'Core loop', description: 'Attack and defend.' }], onSelect: select, onClose: close });
        const panel = document.getElementById('learning-practice-library');
        expect(panel.parentElement).toBe(document.body);
        panel.querySelector('[data-lesson-id="core"]').click();
        expect(select).toHaveBeenCalledTimes(1);
        expect(select).toHaveBeenCalledWith({ id: 'core', title: 'Core loop', description: 'Attack and defend.' });
        expect(close).not.toHaveBeenCalled();
        expect(document.getElementById('learning-practice-library')).toBeNull();
    });

    it('does not open boss reading during an action and releases reading ownership on any close', () => {
        document.getElementById('hud').classList.remove('hidden');
        let allowed = false;
        const opened = vi.fn(), closed = vi.fn();
        showBossRules({ rules: ['Watch the next strike.'], canInspect: () => allowed, onOpen: opened, onClose: closed });
        document.querySelector('.learning-objective-help').click();
        expect(document.getElementById('learning-boss-rules')).toBeNull();
        allowed = true;
        document.querySelector('.learning-objective-help').click();
        expect(opened).toHaveBeenCalledTimes(1);
        hideBossRules();
        hideBossRules();
        expect(closed).toHaveBeenCalledTimes(1);
    });

    it('closing the practice library invokes its return callback exactly once', () => {
        const close = vi.fn();
        showPracticeLibrary({ lessons: [], onClose: close });
        document.querySelector('.learning-modal-close').click();
        hidePracticeLibrary();
        expect(close).toHaveBeenCalledTimes(1);
        expect(Game._practiceSession).toBe(false);
    });
});

describe('guided first-return choices', () => {
    function renderSanctuary({ sparks = 8, owned = [] } = {}) {
        Game.sparks = sparks;
        Game.metaUpgrades = [...owned];
        Game.metaToggledOff = new Set();
        Game.renderMeta();
        return document.getElementById('upgrade-list');
    }

    it('offers at most three affordable working unowned upgrades with this operator first', () => {
        renderSanctuary({ sparks: 8, owned: ['m_life'] });
        const section = decorateSanctuary(Game, { mode: 'guided', introductory: true, classId: 'tactician' });
        const ids = [...section.querySelectorAll('[data-upgrade-id]')].map(card => card.dataset.upgradeId);
        expect(ids).toEqual(['cls_tactician', 'm_shield', 'm_mana']);
        expect(section.querySelector('[data-upgrade-id="cls_tactician"]').textContent).toContain('YOUR OPERATOR');
        for (const id of ids) {
            expect(META_UPGRADES.find(upgrade => upgrade.id === id).cost).toBeLessThanOrEqual(Game.sparks);
        }
        expect(section.textContent).not.toContain('Foresight');
        expect(section.textContent).not.toContain('Challenge');
    });

    it('routes a suggested purchase through the real card once and preserves its normal save', () => {
        renderSanctuary({ sparks: 8 });
        const section = decorateSanctuary(Game, { mode: 'guided', introductory: true, classId: 'sentinel' });
        const purchase = section.querySelector('[data-upgrade-id="cls_sentinel"]');
        purchase.click();
        purchase.click();
        expect(Game.sparks).toBe(0);
        expect(Game.metaUpgrades.filter(id => id === 'cls_sentinel')).toHaveLength(1);
        expect(JSON.parse(localStorage.getItem('mvm_upgrades'))).toContain('cls_sentinel');
        expect(document.querySelectorAll('#upgrade-list .upgrade-name').length).toBeGreaterThan(20);
    });

    it('keeps the full catalogue and its original owned-toggle handlers behind Browse All', () => {
        const list = renderSanctuary({ owned: ['m_life'] });
        const originalCards = [...list.querySelectorAll('.upgrade-card')];
        const ownedCard = originalCards.find(card => card.querySelector('.upgrade-name')?.textContent === "Gaia's Heart");
        const toggle = vi.spyOn(Game, 'toggleMetaUpgrade');
        decorateSanctuary(Game, { mode: 'guided', introductory: true });
        const browse = document.querySelector('.learning-sanctuary-browse');
        expect(list.classList.contains('learning-sanctuary-focused')).toBe(true);
        browse.click();
        expect(list.classList.contains('learning-sanctuary-focused')).toBe(false);
        expect(browse.getAttribute('aria-expanded')).toBe('true');
        expect(originalCards.every(card => card.isConnected)).toBe(true);
        expect(list.querySelectorAll('.cosmetic-card').length).toBeGreaterThan(0);
        ownedCard.click();
        expect(toggle).toHaveBeenCalledTimes(1);
        expect(toggle).toHaveBeenCalledWith('m_life');
        expect(Game.metaToggledOff.has('m_life')).toBe(true);
    });

    it('explains an unaffordable class goal without presenting it as a buyable recommendation', () => {
        renderSanctuary({ sparks: 5 });
        const section = decorateSanctuary(Game, { mode: 'guided', introductory: true, classId: 'summoner' });
        expect(section.querySelector('[data-upgrade-id="cls_summoner"]')).toBeNull();
        expect(section.querySelector('.learning-sanctuary-goal').textContent).toContain('Save 3 more Sparks');
        expect([...section.querySelectorAll('[data-upgrade-id]')].map(card => card.dataset.upgradeId))
            .toEqual(['m_life', 'm_cache_primer', 'm_greed']);
        renderSanctuary({ sparks: 0 });
        const empty = decorateSanctuary(Game, { mode: 'guided', introductory: true, classId: 'summoner' });
        expect(empty.querySelectorAll('[data-upgrade-id]')).toHaveLength(0);
        expect(empty.textContent).toContain('No suggested upgrade is affordable yet');
    });

    it('redecorates idempotently and leaves experienced or Full Rules catalogues unchanged', () => {
        const list = renderSanctuary();
        const cards = [...list.querySelectorAll('.upgrade-card')];
        decorateSanctuary(Game, { mode: 'guided', introductory: true });
        decorateSanctuary(Game, { mode: 'guided', introductory: true });
        expect(document.querySelectorAll('#learning-sanctuary-intro')).toHaveLength(1);
        decorateSanctuary(Game, { mode: 'full', introductory: true });
        expect(document.getElementById('learning-sanctuary-intro')).toBeNull();
        expect(list.classList.contains('learning-sanctuary-focused')).toBe(false);
        decorateSanctuary(Game, { mode: 'guided', introductory: false });
        expect(document.getElementById('learning-sanctuary-intro')).toBeNull();
        expect(cards.every(card => card.isConnected)).toBe(true);
    });

    it('keeps retry controls and offers a relevant optional drill without changing mode or progression', () => {
        const practise = vi.fn(), acknowledge = vi.fn();
        const retry = document.getElementById('btn-retry-class');
        const originalState = Game.currentState;
        decorateOutcome(Game, { mode: 'guided', introductory: true, onPractice: practise,
            practiceLabel: 'PRACTISE DEFENCE', onDismiss: acknowledge });
        const note = document.getElementById('learning-outcome-note');
        expect(note.nextElementSibling).toBe(retry);
        expect(note.textContent).toContain('Sparks stay banked between runs');
        expect(note.textContent).toContain('Fragments and augmentations reset');
        expect(note.textContent).not.toContain('Challenge');
        const button = note.querySelector('.learning-outcome-practice');
        button.click();
        button.click();
        expect(practise).toHaveBeenCalledTimes(1);
        expect(acknowledge).not.toHaveBeenCalled();
        expect(Game.currentState).toBe(originalState);
        expect(document.getElementById('btn-retry-class')).toBe(retry);
    });

    it('distinguishes saving a live run from losing one and acknowledges only an explicit dismissal', () => {
        const acknowledge = vi.fn();
        decorateOutcome(Game, { mode: 'guided', introductory: true, kind: 'return', host: '#screen-start .db-shell', onDismiss: acknowledge });
        decorateOutcome(Game, { mode: 'guided', introductory: true, kind: 'return', host: '#screen-start .db-shell', onDismiss: acknowledge });
        expect(acknowledge).not.toHaveBeenCalled();
        const note = document.getElementById('learning-outcome-note');
        expect(note.textContent).toContain('Save and Return keeps your current run');
        expect(note.textContent).not.toContain('its Fragments and augmentations reset');
        const dismiss = note.querySelector('.learning-note-dismiss');
        dismiss.click();
        dismiss.click();
        expect(acknowledge).toHaveBeenCalledTimes(1);
        decorateOutcome(Game, { mode: 'full', introductory: true });
        expect(document.getElementById('learning-outcome-note')).toBeNull();
    });

    it('labels reward scope once without claiming instant effects are persistent purchases', () => {
        decorateReward(Game, { mode: 'guided' });
        decorateReward(Game, { mode: 'guided' });
        expect(document.querySelectorAll('#learning-reward-scope')).toHaveLength(1);
        const note = document.getElementById('learning-reward-scope');
        expect(note.nextElementSibling.id).toBe('reward-options');
        expect(note.textContent).toBe('Choose one augmentation for this run. Instant effects apply now.');
        decorateReward(Game, { mode: 'full' });
        expect(document.getElementById('learning-reward-scope')).toBeNull();
    });

    it('puts first-return copy in a body-level dialog without changing the fixed menu layout', () => {
        const menu = document.getElementById('screen-start');
        const before = menu.innerHTML;
        showReturnGuidance(Game);
        const modal = document.getElementById('learning-return-guidance');
        expect(modal.parentElement).toBe(document.body);
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.textContent).toContain('Sparks stay banked');
        expect(modal.textContent).toContain('Save and Return keeps your current run');
        expect(modal.querySelectorAll('button')).toHaveLength(1);
        expect(modal.querySelector('button').textContent).toBe('GOT IT');
        expect(menu.innerHTML).toBe(before);
    });

    it('acknowledges only the explicit Got It button and restores focus', () => {
        const acknowledge = vi.fn();
        const previous = document.getElementById('btn-settings-main');
        previous.focus();
        showReturnGuidance(Game, { onDismiss: acknowledge });
        const button = document.querySelector('#learning-return-guidance .learning-modal-close');
        expect(document.activeElement).toBe(button);
        button.click();
        button.click();
        expect(acknowledge).toHaveBeenCalledTimes(1);
        expect(document.activeElement).toBe(previous);
        expect(document.getElementById('learning-return-guidance')).toBeNull();
    });

    it('lets Escape and native overlay dismissal close unread return copy without marking it seen', () => {
        const acknowledge = vi.fn();
        showReturnGuidance(Game, { onDismiss: acknowledge });
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('learning-return-guidance')).toBeNull();
        expect(acknowledge).not.toHaveBeenCalled();
        showReturnGuidance(Game, { onDismiss: acknowledge });
        expect(dismissLearningOverlay()).toBe(true);
        expect(acknowledge).not.toHaveBeenCalled();
    });

    it('closes the return dialog before optional practice opens and does not consume acknowledgement', () => {
        const acknowledge = vi.fn();
        const practise = vi.fn(() => {
            expect(document.getElementById('learning-return-guidance')).toBeNull();
            showPracticeLibrary({ lessons: [] });
        });
        showReturnGuidance(Game, { onPractice: practise, practiceLabel: 'PRACTISE DEFENCE', onDismiss: acknowledge });
        document.querySelector('#learning-return-guidance .learning-outcome-practice').click();
        expect(practise).toHaveBeenCalledTimes(1);
        expect(acknowledge).not.toHaveBeenCalled();
        expect(document.getElementById('learning-practice-library')).not.toBeNull();
    });

    it('replaces return guidance without duplicate dialogs or old acknowledgement callbacks', () => {
        const old = vi.fn(), current = vi.fn();
        showReturnGuidance(Game, { onDismiss: old });
        showReturnGuidance(Game, { onDismiss: current });
        expect(document.querySelectorAll('#learning-return-guidance')).toHaveLength(1);
        document.querySelector('#learning-return-guidance .learning-modal-close').click();
        expect(old).not.toHaveBeenCalled();
        expect(current).toHaveBeenCalledTimes(1);
    });
});

describe('short guided core', () => {
    it.each(['tactician', 'sentinel', 'arcanist', 'bloodstalker', 'annihilator', 'summoner'])('keeps %s essentials in a small core hand without paid skills or hostile minions', classId => {
        Game.player.classId = classId;
        Breakout.start(Game, { guided: true });
        expect(Breakout.totalRooms()).toBe(2);
        expect(Game.dicePool).toHaveLength(classId === 'summoner' ? 3 : 2);
        expect(Game.enemy.minions).toEqual([]);
        expect(Game.dicePool.every(die => ['attack', 'defend', ...(classId === 'summoner' ? ['minion'] : [])].includes(Game._dieSlot(die.type)))).toBe(true);
        if (classId === 'bloodstalker') expect(Game.player.currentHp).toBe(Game.player.maxHp - 3);
    });

    it('runs two drills, retains demonstrated fundamentals and delegates completion once', async () => {
        const complete = Game._onGuidedCoreComplete = vi.fn();
        const progress = Game._onGuidedCoreProgress = vi.fn();
        Breakout.start(Game, { guided: true });
        Breakout.notify('die_used', { slot: 'attack' });
        Breakout.notify('die_used', { slot: 'defend' });
        Breakout.notify('enemy_turn', { defenceOutcome: 'miss' });
        Breakout.onCombatWin();
        await vi.advanceTimersByTimeAsync(600);
        expect(Breakout.currentRoomIdx()).toBe(1);
        expect(Game._guidedRhythmPractice).toBe(true);
        expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ roomIndex: 1, actions: expect.arrayContaining(['attack', 'defend', 'enemy_turn']) }));
        Breakout.onCombatWin();
        Breakout.onCombatWin();
        expect(complete).toHaveBeenCalledTimes(1);
        expect(Game._guidedRhythmPractice).toBe(false);
        expect(Game.player.hasRelic('cellkey_shard')).toBeFalsy();
        expect(localStorage.getItem('mvm_breakout_done')).toBeNull();
    });

    it('resumes the current short drill and does not require a Perfect timing result', () => {
        Game._onGuidedCoreComplete = vi.fn();
        Breakout.start(Game, { guided: true, progress: { roomIndex: 1, actions: ['attack', 'defend', 'enemy_turn'] } });
        expect(Breakout.currentRoomIdx()).toBe(1);
        Breakout.onCombatWin();
        expect(Game._onGuidedCoreComplete).toHaveBeenCalledTimes(1);
    });

    it('does not claim core mastery if a quick kill skipped the defensive action', () => {
        Game._onGuidedCoreComplete = vi.fn();
        Breakout.start(Game, { guided: true, progress: { roomIndex: 1, actions: ['attack'] } });
        Breakout.onCombatWin();
        expect(Game._onGuidedCoreComplete).not.toHaveBeenCalled();
        expect(Breakout.isActive()).toBe(true);
        expect(Breakout.currentRoomIdx()).toBe(1);
    });
});

describe('reward-free practice lifecycle', () => {
    it.each(['cancel', 'win', 'skip', 'exit-button'])('%s restores the original live run, stats and exact checkpoint before ending the profile sandbox', async exit => {
        const originalPlayer = Game.player;
        originalPlayer._customExtraRerolls = 3;
        const originalStats = structuredClone(Game.runStats);
        CombatStats.startCombat();
        CombatStats.recordDamage(17, 'player', 'enemy');
        CombatStats.recordCombo('PINCER');
        const originalCombat = CombatStats.snapshotCombat();
        CombatLog.clear();
        CombatLog.push({ type: 'note', text: 'Original encounter log' });
        const originalLog = structuredClone(CombatLog._entries);
        localStorage.setItem('mvm_save_v1__A', '{"checkpoint":"unchanged"}');
        const endScope = vi.fn(() => {
            expect(Game.player).toBe(originalPlayer);
            expect(Game.runStats).toEqual(originalStats);
            expect(Game._practiceSession).toBe(false);
        });
        window.__MVM_PROFILE_SCOPE__ = { beginPractice: vi.fn(() => endScope) };
        Game._onGuidedCoreComplete = vi.fn();
        Breakout.start(Game, { practiceRoom: 0, classId: 'annihilator' });
        expect(Game.player).not.toBe(originalPlayer);
        expect(Game.player.classId).toBe('annihilator');
        expect(Game._practiceSession).toBe(true);
        Game.runStats.kills = 50;
        Game.runStats.nested = { changed: true };
        CombatStats.recordDamage(999, 'player', 'enemy');
        if (exit === 'win') {
            Game.enemy.currentHp = 0;
            await Game.winCombat();
        } else if (exit === 'skip') Breakout.skip();
        else if (exit === 'exit-button') document.querySelector('.learning-objective-help').click();
        else Breakout.cancel();
        expect(Game.currentState).toBe(STATE.MENU);
        expect(Game.player).toBe(originalPlayer);
        expect(originalPlayer._customExtraRerolls).toBe(3);
        expect(Game.runStats).toEqual(originalStats);
        expect(CombatStats.snapshotCombat()).toEqual(originalCombat);
        expect(CombatLog._entries).toEqual(originalLog);
        expect(Game.techFragments).toBe(123);
        expect(Game.sparks).toBe(42);
        expect(localStorage.getItem('mvm_save_v1__A')).toBe('{"checkpoint":"unchanged"}');
        expect(localStorage.getItem('mvm_breakout_done')).toBeNull();
        expect(Game._onGuidedCoreComplete).not.toHaveBeenCalled();
        expect(endScope).toHaveBeenCalledTimes(1);
    });

    it.each([0, 1, 2, 3, 4])('offers old room %i as one isolated drill without progression flags', room => {
        const original = Game.player;
        Breakout.start(Game, { practiceRoom: room, classId: 'arcanist' });
        expect(Breakout.currentRoomIdx()).toBe(room);
        expect(Breakout.totalRooms()).toBe(1);
        if (room === 3) expect(Game.dicePool.some(die => die.type === 'SIGNATURE')).toBe(true);
        Breakout.cancel();
        expect(Game.player).toBe(original);
        expect(localStorage.getItem('mvm_first_run_done')).toBeNull();
        expect(localStorage.getItem('mvm_breakout_done')).toBeNull();
    });

    it('cancels an active timing promise without invoking its damage callback', async () => {
        const player = Game.player;
        Breakout.start(Game, { practiceRoom: 0 });
        const damage = vi.fn();
        const timing = Game.startQTE('ATTACK', Game.enemy.x, Game.enemy.y, damage);
        Breakout.cancel();
        await timing;
        expect(damage).not.toHaveBeenCalled();
        expect(Game.player).toBe(player);
        expect(Game.qte.active).toBe(false);
    });

    it('does not let a previous drill death timer restart a replacement drill', async () => {
        const build = vi.spyOn(Game, '_buildBreakoutCombat');
        Breakout.start(Game, { practiceRoom: 0 });
        Breakout.onPlayerWouldDie();
        Breakout.cancel();
        Breakout.start(Game, { practiceRoom: 1 });
        const count = build.mock.calls.length;
        await vi.advanceTimersByTimeAsync(900);
        expect(Breakout.currentRoomIdx()).toBe(1);
        expect(build).toHaveBeenCalledTimes(count);
    });
});
