// Class-vs-boss matchup hints — coverage + null-safety.

import { describe, it, expect } from 'vitest';
import { MATCHUP_HINTS, getMatchupHint } from '../data/matchup-hints.js';

const CLASSES = ['tactician', 'arcanist', 'bloodstalker', 'annihilator', 'sentinel', 'summoner'];
const SECTORS = [1, 2, 3, 4, 5];

describe('MATCHUP_HINTS', () => {
    it('covers all six classes', () => {
        for (const c of CLASSES) {
            expect(MATCHUP_HINTS[c]).toBeDefined();
        }
    });

    it('covers all five main-run sectors per class', () => {
        for (const c of CLASSES) {
            for (const s of SECTORS) {
                expect(typeof MATCHUP_HINTS[c][s]).toBe('string');
                expect(MATCHUP_HINTS[c][s].length).toBeGreaterThan(10);
            }
        }
    });

    it('skips Archivist (sector 6) — its mechanics rotate', () => {
        for (const c of CLASSES) {
            expect(MATCHUP_HINTS[c][6]).toBeUndefined();
        }
    });

    it('keeps each hint short enough to fit the slate', () => {
        // 90 chars is tight for the slate — anything longer wraps badly
        // on small phones.
        for (const c of CLASSES) {
            for (const s of SECTORS) {
                expect(MATCHUP_HINTS[c][s].length).toBeLessThanOrEqual(90);
            }
        }
    });
});

describe('getMatchupHint', () => {
    it('returns the right hint for a known pair', () => {
        const h = getMatchupHint('tactician', 1);
        expect(h).toBe(MATCHUP_HINTS.tactician[1]);
    });

    it('returns null for unknown class', () => {
        expect(getMatchupHint('mystery', 1)).toBeNull();
    });

    it('returns null for unknown sector (e.g. Archivist)', () => {
        expect(getMatchupHint('tactician', 6)).toBeNull();
    });

    it('returns null for missing classId', () => {
        expect(getMatchupHint(null, 1)).toBeNull();
        expect(getMatchupHint(undefined, 1)).toBeNull();
        expect(getMatchupHint('', 1)).toBeNull();
    });
});
