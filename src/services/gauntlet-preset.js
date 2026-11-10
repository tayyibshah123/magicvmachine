const TACTICIAN = Object.freeze({
    id: 'tactician-v1',
    name: 'Tactician Gauntlet',
    classId: 'tactician',
    difficulty: 'operator',
    ascension: 0,
    twistId: 'fortified',
    seed: 0x4d564d31
});

export function readGauntletPreset(href) {
    if (!href) return null;
    const ids = new URL(href).searchParams.getAll('gauntlet');
    return ids.length === 1 && ids[0] === TACTICIAN.id ? TACTICIAN : null;
}

export function gauntletPresetUrl(href) {
    const url = new URL('./', href);
    url.searchParams.set('gauntlet', TACTICIAN.id);
    return url.href;
}

let nextRoll;

export function startGauntletRolls(preset) {
    let state = preset.seed;
    nextRoll = () => {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

// Only gameplay decisions use the preset stream. Render frames, previews,
// animation noise and receipt IDs use the browser's ordinary random stream.
export function gameplayRandom() {
    return nextRoll ? nextRoll() : Math.random();
}
