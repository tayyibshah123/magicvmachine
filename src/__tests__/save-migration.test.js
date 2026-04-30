// Save-data schema migration tests.
//
// Exercises Game._migrateSave directly so we can guarantee a v1 (pre-
// versioning) save still loads on a v2 build, and that the migration
// chain is forward-compatible with any future v2→v3 addition.

import { describe, it, expect, beforeEach } from 'vitest';

beforeEach(() => {
    document.body.innerHTML = `
        <div id="game-container">
            <canvas id="gameCanvas" width="1080" height="1920"></canvas>
            <div id="dice-container"></div>
            <div id="reroll-badge"></div>
            <div id="hud"></div>
            <div id="tutorial-spotlight"></div>
        </div>
    `;
});

describe('save schema migration', () => {
    it('migrates a pre-versioning (no `v`) save to current schema', async () => {
        const { Game } = await import('../game.js');
        const v1Save = {
            sector: 3,
            map: { nodes: [], currentIdx: 'node_5' },
            player: { classId: 'tactician', hp: 22, maxHp: 30 }
            // No `v` — this is a pre-migration-framework save.
        };
        const migrated = Game._migrateSave(v1Save);
        expect(migrated).not.toBeNull();
        expect(migrated.v).toBe(Game.SAVE_SCHEMA_VERSION);
        // Defensive defaults should be filled in.
        expect(Array.isArray(migrated.player.upgrades)).toBe(true);
        expect(Array.isArray(migrated.player.relics)).toBe(true);
        expect(typeof migrated.player.signatureTier).toBe('number');
        // Original fields preserved.
        expect(migrated.sector).toBe(3);
        expect(migrated.player.hp).toBe(22);
    });

    it('does not mutate the input object', async () => {
        const { Game } = await import('../game.js');
        const v1Save = { player: { classId: 'arcanist' } };
        const before = JSON.stringify(v1Save);
        Game._migrateSave(v1Save);
        expect(JSON.stringify(v1Save)).toBe(before);
    });

    it('passes a current-version save through unchanged', async () => {
        const { Game } = await import('../game.js');
        const currentSave = {
            v: Game.SAVE_SCHEMA_VERSION,
            sector: 5,
            player: {
                classId: 'sentinel',
                hp: 40, maxHp: 40,
                relics: [{ id: 'thorn_mail' }],
                upgrades: ['ATTACK'],
                signatureTier: 2
            }
        };
        const migrated = Game._migrateSave(currentSave);
        expect(migrated.v).toBe(Game.SAVE_SCHEMA_VERSION);
        expect(migrated.player.classId).toBe('sentinel');
        expect(migrated.player.relics).toEqual([{ id: 'thorn_mail' }]);
    });

    it('accepts a future-version save without dropping it', async () => {
        const { Game } = await import('../game.js');
        // Simulate a save written by a build that's ahead of this one — no
        // matching migration exists, but the save should still load rather
        // than be wiped. Forward-compat is best-effort.
        const futureSave = {
            v: 99,
            sector: 1,
            player: { classId: 'tactician', hp: 30, maxHp: 30, relics: [], upgrades: [], signatureTier: 1 },
            futureField: 'unknown-but-harmless'
        };
        const migrated = Game._migrateSave(futureSave);
        expect(migrated).not.toBeNull();
        expect(migrated.v).toBe(99);
        expect(migrated.futureField).toBe('unknown-but-harmless');
    });

    it('returns null for non-object input', async () => {
        const { Game } = await import('../game.js');
        expect(Game._migrateSave(null)).toBeNull();
        expect(Game._migrateSave(undefined)).toBeNull();
        expect(Game._migrateSave('not a save')).toBeNull();
        expect(Game._migrateSave(42)).toBeNull();
    });

    it('survives a migration step that throws — keeps progress to that point', async () => {
        const { Game } = await import('../game.js');
        // Inject a temporary v2→v3 migration that throws, run migration,
        // then restore the registry. This exercises the inner try/catch
        // without permanently changing schema state for other tests.
        const originalMigrations = Game.SAVE_MIGRATIONS;
        const originalVersion = Game.SAVE_SCHEMA_VERSION;
        Game.SAVE_MIGRATIONS = [
            ...originalMigrations,
            { from: 2, to: 3, migrate() { throw new Error('boom'); } }
        ];
        Game.SAVE_SCHEMA_VERSION = 3;
        try {
            const v1Save = { player: { classId: 'tactician' } };
            const migrated = Game._migrateSave(v1Save);
            // Even though the v2→v3 step threw, the data object should be
            // populated up to v2 (defensive defaults applied), and the
            // version should reflect the highest successfully-applied step.
            expect(migrated).not.toBeNull();
            expect(Array.isArray(migrated.player.upgrades)).toBe(true);
            // v ends up at 3 because the step swallows but still bumps —
            // that's a tradeoff: prevents the migrator from re-running a
            // throwing step on every load. Documented in _migrateSave.
            expect(migrated.v).toBe(3);
        } finally {
            Game.SAVE_MIGRATIONS = originalMigrations;
            Game.SAVE_SCHEMA_VERSION = originalVersion;
        }
    });

    it('breaks the chain cleanly if a migration step is missing', async () => {
        const { Game } = await import('../game.js');
        // Saved at v1, target is v3, but no v2→v3 migration registered.
        // The migrator should advance from v1→v2 and stop, never looping.
        const originalVersion = Game.SAVE_SCHEMA_VERSION;
        Game.SAVE_SCHEMA_VERSION = 3;
        try {
            const v1Save = { player: { classId: 'tactician' } };
            const migrated = Game._migrateSave(v1Save);
            expect(migrated).not.toBeNull();
            // Advanced as far as the chain allowed.
            expect(migrated.v).toBe(2);
        } finally {
            Game.SAVE_SCHEMA_VERSION = originalVersion;
        }
    });
});
