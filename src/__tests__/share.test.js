import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Share } from '../services/share.js';
import { Game } from '../game.js';
import { STATE } from '../constants.js';
import { Achievements } from '../services/achievements.js';
import { setupCombatFixture, teardownCombatFixture } from './helpers/combat-fixture.js';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const summary = { win: true, className: 'Blood Stalker', sector: 5, turns: 37, fragments: 263,
    achievement: 'First Sector 5 clear' };
const stable = 'https://tayyibshah123.github.io/magicvmachine/';
const guided = stable + 'guided/';

afterEach(() => {
    Share.closeFallback();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

describe('result share destinations and fallbacks', () => {
    it('builds independent canonical edition and challenge links', () => {
        expect(Share.buildPlayUrl({ edition: 'stable' })).toBe(stable);
        expect(Share.buildPlayUrl({ edition: 'guided' })).toBe(guided);
        expect(Share.buildPlayUrl({ edition: 'guided', challengeId: 'tactician-v1' })).toBe(guided + '?fight=tactician-v1');
        expect(Share.buildPlayUrl({ edition: 'stable', gauntletId: 'tactician-v1' })).toBe(stable + '?gauntlet=tactician-v1');
    });

    it('shares a clickable link, accurate result text and a PNG in the initial gesture', async () => {
        const share = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { share, canShare: vi.fn(() => true) });
        vi.spyOn(Share, 'buildDataUrl').mockReturnValue(png);
        const completion = Share.shareRun(summary, { url: stable });
        expect(share).toHaveBeenCalledTimes(1);
        const payload = share.mock.calls[0][0];
        expect(payload.url).toBe(stable);
        expect(payload.text).toBe('Cleared Sector 5 as Blood Stalker in Magic v Machine. 37 turns. First Sector 5 clear.');
        expect(payload.files[0]).toMatchObject({ name: 'magic-v-machine-result.png', type: 'image/png', size: 8 });
        expect(await completion).toBe('shared');
        expect(document.getElementById('run-share-dialog')).toBeNull();
    });

    it('still shares a guided First Fight link if file sharing is unsupported', async () => {
        const share = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { share, canShare: vi.fn(() => false) });
        vi.spyOn(Share, 'buildDataUrl').mockReturnValue(png);
        await Share.shareRun({ win: true, turns: 1, className: 'Tactician' }, { url: guided + '?fight=tactician-v1' });
        expect(share).toHaveBeenCalledWith({ title: 'Magic v Machine', url: guided + '?fight=tactician-v1',
            text: 'Won the First Fight as Tactician in Magic v Machine. 1 turn.' });
    });

    it('offers image download and an actual copy action when native sharing fails', async () => {
        const writeText = vi.fn().mockResolvedValue();
        vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('Not allowed')), clipboard: { writeText } });
        vi.spyOn(Share, 'buildDataUrl').mockReturnValue(png);
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();
        const link = stable + '?gauntlet=tactician-v1';
        expect(await Share.shareRun(summary, { url: link })).toBe('fallback');
        const dialog = document.getElementById('run-share-dialog');
        expect(dialog.parentElement).toBe(document.body);
        expect(dialog.querySelector('a[href^="https:"]').href).toBe(link);
        expect(dialog.querySelector('a[download]').getAttribute('href')).toBe(png);
        [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Copy link').click();
        await vi.waitFor(() => expect(dialog.querySelector('[role="status"]').textContent).toBe('Link copied.'));
        expect(writeText).toHaveBeenCalledWith(link);
        expect(Game.dismissOpenOverlay()).toBe(true);
        expect(document.activeElement).toBe(opener);
    });

    it('selects a safe game link for manual copy if Clipboard and image rendering are unavailable', async () => {
        vi.stubGlobal('navigator', {});
        vi.spyOn(Share, 'buildDataUrl').mockImplementation(() => { throw new Error('No canvas'); });
        expect(await Share.shareRun(summary, { url: 'javascript:alert(1)' })).toBe('fallback');
        const dialog = document.getElementById('run-share-dialog');
        const field = dialog.querySelector('input');
        const expectedLink = Share.buildPlayUrl();
        expect(field.value).toBe(expectedLink);
        expect(dialog.querySelector('a[download]')).toBeNull();
        [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Copy link').click();
        await vi.waitFor(() => expect(document.activeElement).toBe(field));
        expect(field.selectionEnd - field.selectionStart).toBe(expectedLink.length);
    });

    it('honours cancellation of the native share sheet without opening another prompt', async () => {
        vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')) });
        vi.spyOn(Share, 'buildDataUrl').mockReturnValue(png);
        expect(await Share.shareRun(summary)).toBe('abort');
        expect(document.getElementById('run-share-dialog')).toBeNull();
    });
});

describe('actual terminal run summary', () => {
    function prepare(win) {
        setupCombatFixture({ classId: 'bloodstalker', enemyTemplate: { name: win ? 'TESSERACT PRIME' : 'Maintenance Spike', hp: 10, dmg: 4 },
            profiles: ['cosmetics', 'ui', 'class-events', 'terminal-services'] });
        document.documentElement.innerHTML = readFileSync('index.html', 'utf8');
        Game._resetRunCurrency.mockRestore();
        Game.renderRunSummary.mockRestore();
        Game.sector = win ? 5 : 2;
        Game.turnCount = 4;
        Game.techFragments = 263;
        Game.runStats = { turns: 37, totalDamage: 1200, synergies: ['Shield Engine'] };
        Game._resultShareSummary = null;
        Game._shareTriggerPending = win ? null : { id: 'earned', label: 'Spark milestone' };
        Game.enemy.isBoss = win;
        Game._resultShareUrl = () => stable + '?gauntlet=tactician-v1';
        vi.stubGlobal('requestAnimationFrame', fn => setTimeout(fn, 0));
    }

    afterEach(() => {
        delete Game._resultShareUrl;
        Game._resultShareSummary = null;
        Game._shareTriggerPending = null;
        teardownCombatFixture();
    });

    it('keeps a real defeat’s run-wide turns, pre-wipe currency and achievement', () => {
        prepare(false);
        Game.player.currentHp = 0;
        Game.gameOver();
        expect(Game.currentState).toBe(STATE.GAMEOVER);
        expect(Game.techFragments).toBe(0);
        expect(Game._resultShareSummary).toMatchObject({ win: false, className: 'Blood Stalker', sector: 2,
            turns: 37, fragments: 263, killName: 'Maintenance Spike', achievement: 'Spark milestone',
            url: stable + '?gauntlet=tactician-v1' });
        expect(document.querySelector('.run-summary').textContent).toContain('263');
        Game.runStats.synergies.push('Later');
        expect(Game._resultShareSummary.synergies).toEqual(['Shield Engine']);
    });

    it('keeps the corresponding victory summary through the wipe and recap rendering', async () => {
        prepare(true);
        vi.spyOn(Game, 'triggerSystemCrash').mockResolvedValue();
        Game.enemy.currentHp = 0;
        const finished = Game.winCombat();
        await vi.advanceTimersByTimeAsync(20000);
        await finished;
        expect(Game.currentState).toBe(STATE.ENDING);
        expect(Game.techFragments).toBe(0);
        Game.changeState(STATE.VICTORY);
        expect(Game._resultShareSummary).toMatchObject({ win: true, className: 'Blood Stalker', sector: 5,
            turns: 37, fragments: 263, killName: 'TESSERACT PRIME', achievement: 'FIRST SECTOR 5 CLEAR',
            url: stable + '?gauntlet=tactician-v1' });
        expect(document.getElementById('victory-stats').textContent).toContain('263');
    });

    it('includes the real first-defeat achievement when it unlocks', () => {
        prepare(false);
        Game._shareTriggerPending = null;
        Achievements.unlock.mockRestore();
        Game.player.currentHp = 0;
        Game.gameOver();
        expect(Achievements.isUnlocked('GAMEOVER_FIRST')).toBe(true);
        expect(Game._resultShareSummary.achievement).toBe('Walked the Plank');
    });
});
