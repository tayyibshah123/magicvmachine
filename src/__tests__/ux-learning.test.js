import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../game.js';
import { Onboarding } from '../services/onboarding.js';
import { Hints } from '../services/hints.js';
import { Unlocks } from '../services/unlocks.js';
import { Breakout } from '../services/breakout.js';
import { Analytics } from '../services/analytics.js';
import { STATE } from '../constants.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';

const markup = readFileSync('index.html', 'utf8');

beforeEach(() => {
    setupCombatFixture({ profiles: ['cosmetics', 'ui'] });
    document.documentElement.innerHTML = markup;
    document.getElementById('intro-overlay')?.remove();
    Game.currentState = STATE.MENU;
    Game.tutorialHintsEnabled = true;
    window.Game = Game;
    Object.assign(Hints, { _seen: null, _queue: [], _active: false, _activeId: null,
        _closing: false, _root: null, _dismissTimer: null });
    Object.assign(Unlocks, { _state: null, _pending: [], _announcing: null });
    Object.assign(Breakout, { _active: false, _room: null, _lastDefenceOutcome: 'none' });
    vi.spyOn(Analytics, 'emit').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
});

afterEach(() => {
    if (Breakout._tapHandler) document.removeEventListener('pointerdown', Breakout._tapHandler, true);
    Breakout._tapHandler = null;
    Breakout._active = false;
    if (Hints._visibilityHandler) document.removeEventListener('visibilitychange', Hints._visibilityHandler);
    Hints._visibilityHandler = null;
    delete window.Game;
    vi.unstubAllGlobals();
    teardownCombatFixture();
});

describe('deliberate optional callsign entry', () => {
    it('does not advance a reader or an active typist after the former timeout', async () => {
        const start = vi.fn();
        Onboarding.run({ onStartTutorial: start });
        document.getElementById('onb-name').value = 'Still typing';
        await vi.advanceTimersByTimeAsync(90000);
        expect(start).not.toHaveBeenCalled();
        expect(Onboarding.isComplete()).toBe(false);
        expect(document.getElementById('onb-name').value).toBe('Still typing');
        document.getElementById('onb-next-1').click();
        expect(start).toHaveBeenCalledTimes(1);
        expect(Onboarding.getName()).toBe('Still typing');
    });

    it('allows a blank callsign and safely displays a saved name as input text', () => {
        localStorage.setItem('mvm_operator_name', '<b>operator</b>');
        Onboarding.run();
        expect(document.querySelector('#onb-name').value).toBe('<b>operator</b>');
        expect(document.querySelector('#onboarding-overlay b')).toBeNull();
        document.getElementById('onb-name').value = '';
        document.getElementById('onb-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        expect(Onboarding.getName()).toBe('OPERATOR');
        expect(Onboarding.isComplete()).toBe(true);
    });
});

describe('learning eligibility and queued reading', () => {
    it('leaves suppressed and disabled hints eligible for the next relevant action', () => {
        document.body.classList.add('breakout-active');
        Hints.trigger('first_qte');
        expect(Hints._seen.has('first_qte')).toBe(false);
        expect(document.querySelector('.hint-toast')).toBeNull();
        document.body.classList.remove('breakout-active');
        Game.tutorialHintsEnabled = false;
        Hints.trigger('first_qte');
        expect(Hints._seen.has('first_qte')).toBe(false);
        Game.tutorialHintsEnabled = true;
        Hints.trigger('first_qte');
        expect(document.querySelector('.hint-toast-body').textContent).toContain('Tap anywhere');
        document.querySelector('.hint-toast').click();
        expect(Hints._seen.has('first_qte')).toBe(true);
    });

    it('persists an unread active hint and later queued hints across a cold service import', async () => {
        Hints.trigger('first_shop');
        Hints.trigger('first_reward');
        expect(JSON.parse(localStorage.getItem('mvm_hints_pending_v1'))).toEqual(['first_shop', 'first_reward']);
        expect(JSON.parse(localStorage.getItem('mvm_hints_seen') || '[]')).toEqual([]);
        vi.clearAllTimers();
        document.removeEventListener('visibilitychange', Hints._visibilityHandler);
        document.querySelector('.hint-toast').remove();
        vi.resetModules();
        const { Hints: reloaded } = await import('../services/hints.js');
        reloaded.init();
        reloaded.resume();
        expect(document.querySelector('.hint-toast-title').textContent).toBe('SHOP');
        document.querySelector('.hint-toast').click();
        await vi.advanceTimersByTimeAsync(180);
        expect(document.querySelector('.hint-toast-title').textContent).toBe('REWARD');
        expect(JSON.parse(localStorage.getItem('mvm_hints_seen'))).toEqual(['first_shop']);
        document.removeEventListener('visibilitychange', reloaded._visibilityHandler);
    });

    it('does not count hidden time as a reading window', async () => {
        let hidden = false;
        vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
        Hints.trigger('first_crit');
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(5000);
        expect(Hints._seen.has('first_crit')).toBe(false);
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
        expect(document.querySelector('.hint-toast-body').textContent).toContain('60%');
        await vi.advanceTimersByTimeAsync(4000);
        expect(Hints._seen.has('first_crit')).toBe(true);
    });

    it('announces multiple newly earned menu features in order without overwriting them', async () => {
        Unlocks.init();
        Unlocks.grant('saves');
        Unlocks.grant('sanctuary');
        Unlocks.applyMenuVisibility();
        expect(document.getElementById('btn-save-slots').classList.contains('just-unlocked')).toBe(true);
        expect(document.getElementById('btn-upgrades').classList.contains('just-unlocked')).toBe(false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(document.getElementById('btn-upgrades').classList.contains('just-unlocked')).toBe(true);
        expect(JSON.parse(localStorage.getItem('mvm_unlock_announcements_v1'))).toEqual(['sanctuary']);
        await vi.advanceTimersByTimeAsync(5000);
        expect(JSON.parse(localStorage.getItem('mvm_unlock_announcements_v1'))).toEqual([]);
    });
});

function openDrill(classId = 'tactician', room = 0) {
    Game.player.classId = classId;
    vi.spyOn(Game, '_buildBreakoutCombat').mockImplementation(() => {});
    vi.spyOn(Breakout, '_setSpotlight').mockImplementation(() => {});
    vi.spyOn(Breakout, '_showStoryboard').mockImplementation((slate, done) => done());
    Breakout.start(Game);
    if (room) { Breakout._roomIdx = room; Breakout._enterRoom(); }
}

describe('outcome-aware Breakout instructions', () => {
    it.each([['combat', 'COMBAT WON'], ['elite', 'ELITE DEFEATED'], ['boss', 'SECTOR CLEARED']])('labels a %s reward by its actual encounter', (type, title) => {
        Game.map = { currentIdx: 'fight', nodes: [{ id: 'fight', type, status: 'available', connections: [] }] };
        vi.spyOn(Game, 'generateRewards').mockImplementation(() => {});
        Game.changeState(STATE.REWARD);
        expect(document.getElementById('reward-title').textContent).toBe(title);
    });

    it.each(['miss', 'good', 'perfect', 'none'])('uses resolved %s feedback without inventing a successful parry', outcome => {
        openDrill();
        Breakout._runBeat(5);
        Breakout.notify('enemy_turn', { defenceOutcome: outcome });
        const story = document.getElementById('tutorial-narration-story').textContent;
        expect(story).not.toContain('You parried');
        expect(story).toContain({ miss: 'timing missed', good: 'Good defensive', perfect: 'Perfect defensive', none: 'phase is complete' }[outcome]);
        expect(Breakout._beatIdx).toBe(6);
    });

    it('keeps the attack instruction until its QTE and presentation have settled', async () => {
        openDrill();
        Breakout._runBeat(2);
        Game.qte.active = true;
        Game.inputLocked = true;
        Game._combatActionDepth = 1;
        Breakout.notify('die_used', { slot: 'attack' });
        await vi.advanceTimersByTimeAsync(3000);
        expect(Breakout._beatIdx).toBe(2);
        Game.qte.active = false;
        await vi.advanceTimersByTimeAsync(500);
        expect(Breakout._beatIdx).toBe(2);
        Game._combatActionDepth = 0;
        Game.inputLocked = false;
        await vi.advanceTimersByTimeAsync(30);
        expect(Breakout._beatIdx).toBe(3);
    });

    it.each([['bloodstalker', 'heals HP instead'], ['annihilator', 'reduces incoming damage']])('teaches the actual %s defensive die', (classId, text) => {
        openDrill(classId);
        Breakout._runBeat(3);
        expect(document.getElementById('tutorial-narration-story').textContent).toContain(text);
    });

    it('waits for the actual Execute phase after using the second defensive die', async () => {
        openDrill('tactician', 2);
        Breakout._runBeat(3);
        Breakout.notify('die_used', { slot: 'defend' });
        await vi.advanceTimersByTimeAsync(30);
        expect(Breakout._room.sequence[Breakout._beatIdx].wait).toBe('enemy_turn');
        expect(document.getElementById('tutorial-narration-story').textContent).not.toContain('Good defensive');
        Breakout.notify('enemy_turn', { defenceOutcome: 'miss' });
        expect(document.getElementById('tutorial-narration-story').textContent).toContain('timing missed');
    });
});
