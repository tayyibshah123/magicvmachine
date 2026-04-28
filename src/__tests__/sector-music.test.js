// Per-sector music routing — locks the synth shuffle to a sector-specific
// track so each region of the run has its own theme. lofi (single-source)
// is left untouched.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AudioMgr } from '../audio.js';

beforeEach(() => {
    AudioMgr._sectorLock = null;
    AudioMgr._lastShuffleIdx = -1;
    AudioMgr.bossSilence = false;
    AudioMgr.bgm = null;
    AudioMgr.currentTrack = 'synth';
    AudioMgr._preferredFmt = 'ogg'; // skip codec probe
});

describe('AudioMgr.setSectorMusic', () => {
    it('maps each sector to its synth track index', () => {
        const expected = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 };
        for (const [sector, idx] of Object.entries(expected)) {
            AudioMgr._sectorLock = null;
            AudioMgr.setSectorMusic(Number(sector));
            expect(AudioMgr._sectorLock).toBe(idx);
        }
    });

    it('is a no-op when current track is single-source (lofi)', () => {
        AudioMgr.currentTrack = 'lofi';
        AudioMgr.setSectorMusic(2);
        expect(AudioMgr._sectorLock).toBeNull();
    });

    it('is a no-op during boss silence', () => {
        AudioMgr.bossSilence = true;
        AudioMgr.setSectorMusic(3);
        expect(AudioMgr._sectorLock).toBeNull();
    });

    it('ignores out-of-range sectors silently', () => {
        AudioMgr.setSectorMusic(99);
        expect(AudioMgr._sectorLock).toBeNull();
        AudioMgr.setSectorMusic(null);
        expect(AudioMgr._sectorLock).toBeNull();
    });

    it('does not crossfade when re-locking the same sector', () => {
        AudioMgr.setSectorMusic(2);
        const fadeSpy = vi.spyOn(AudioMgr, 'fadeMusicOut');
        AudioMgr.setSectorMusic(2);
        expect(fadeSpy).not.toHaveBeenCalled();
        fadeSpy.mockRestore();
    });
});

describe('AudioMgr._pickShuffleSrc with sector lock', () => {
    it('returns the locked source when set', () => {
        const sources = ['./music/synth1.ogg', './music/synth2.ogg', './music/synth3.ogg', './music/synth4.ogg'];
        AudioMgr._sectorLock = 2; // sector 3 → synth3
        const picked = AudioMgr._pickShuffleSrc(sources);
        expect(picked).toBe('./music/synth3.ogg');
    });

    it('falls back to anything-but-last shuffle when no lock', () => {
        const sources = ['a', 'b', 'c', 'd'];
        AudioMgr._sectorLock = null;
        // The do-while in _pickShuffleSrc only skips the IMMEDIATELY-prior
        // index, so the guarantee is: the next pick after 'c' is not 'c'.
        AudioMgr._lastShuffleIdx = 2; // 'c'
        const picked = AudioMgr._pickShuffleSrc(sources);
        expect(picked).not.toBe('c');
    });

    it('repeats the same locked track on natural-end re-pick', () => {
        const sources = ['./a.ogg', './b.ogg', './c.ogg', './d.ogg'];
        AudioMgr._sectorLock = 1;
        const first = AudioMgr._pickShuffleSrc(sources);
        const second = AudioMgr._pickShuffleSrc(sources);
        expect(first).toBe(second);
        expect(first).toBe('./b.ogg');
    });
});

describe('AudioMgr.clearSectorMusic', () => {
    it('drops the lock', () => {
        AudioMgr._sectorLock = 3;
        AudioMgr.clearSectorMusic();
        expect(AudioMgr._sectorLock).toBeNull();
    });
});
