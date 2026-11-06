import { ASCENSION_TWISTS } from './ascension.js';

const DIFFICULTIES = ['initiate', 'operator', 'ascendant'];
export function validRunRules(value) {
    return !!value && value.v === 1 && Number.isInteger(value.ascension)
        && value.ascension >= 0 && value.ascension < ASCENSION_TWISTS.length
        && DIFFICULTIES.includes(value.difficulty) && typeof value.newcomer === 'boolean'
        && Number.isSafeInteger(value.corruption) && value.corruption >= 0
        && Array.isArray(value.disabledMeta) && value.disabledMeta.every(id => typeof id === 'string' && id.length > 0)
        && ['selected', 'legacy'].includes(value.origin);
}

export function makeRunRules({ ascension = 0, difficulty = 'operator', corruption = 0,
    newcomer = false, disabledMeta = [], origin = 'selected' } = {}) {
    return { v: 1, ascension: Math.max(0, Math.min(ASCENSION_TWISTS.length - 1, Math.floor(Number(ascension) || 0))),
        difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'operator',
        corruption: Number.isSafeInteger(corruption) && corruption >= 0 ? corruption : 0,
        newcomer: !!newcomer, disabledMeta: [...new Set(disabledMeta.filter(id => typeof id === 'string' && id.length))],
        origin: origin === 'legacy' ? 'legacy' : 'selected' };
}
