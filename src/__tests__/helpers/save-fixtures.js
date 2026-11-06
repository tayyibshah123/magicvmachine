// Frozen historical shapes, independent of the current serializer.
function freeze(value) {
    for (const item of Object.values(value)) if (item && typeof item === 'object') freeze(item);
    return Object.freeze(value);
}
export const LEGACY_V1_SAVE = freeze({
    sector: 2, fragments: 37, encrypted: 1, currentIdx: 'fight',
    map: { currentIdx: 'fight', nodes: [
        { id: 'start', type: 'start', status: 'completed', x: 50, y: 92, connections: ['fight'] },
        { id: 'fight', type: 'combat', status: 'available', x: 50, y: 70, connections: [] }
    ] },
    player: { classId: 'tactician', hp: 17, maxHp: 30, mana: 3 }
});

export const V2_SAVE = freeze({
    ...LEGACY_V1_SAVE, v: 2, sector: 1,
    player: { classId: 'tactician', hp: 17, maxHp: 30, mana: 3,
        relics: [{ id: 'nano_shield', name: 'Nano Shield' }], upgrades: ['ATTACK'], signatureTier: 2 }
});

export function saveFixture(source, overrides = {}) {
    return JSON.parse(JSON.stringify({ ...source, ...overrides }));
}
