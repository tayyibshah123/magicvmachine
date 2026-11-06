// Save-data schema migration tests.
//
// Exercise historical payloads and the migration engine independently of UI.

import { describe, it, expect } from 'vitest';
import { LEGACY_V1_SAVE, V2_SAVE, saveFixture } from './helpers/save-fixtures.js';

describe('save schema migration', () => {
    it('adds an empty reward receipt to v3 checkpoints without inventing a free reward', async () => {
        const { Game } = await import('../game.js');
        const source = { v: 3, sector: 2, player: { classId: 'tactician', hp: 17, maxHp: 30, relics: [] } };
        expect(Game._migrateSave(source)).toEqual({ ...source, v: 4, pendingReward: null });
        expect(source).not.toHaveProperty('pendingReward');
    });
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
        currentSave.unknownExtension = { enabled: true, values: [1, 2] };
        const complete = Game._migrateSave(currentSave);
        expect(complete).toEqual(currentSave);
        expect(complete).not.toBe(currentSave);
        expect(complete.player).not.toBe(currentSave.player);
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
        // Inject a migration after the production schema that throws,
        // then restore the registry. This exercises the inner try/catch
        // without permanently changing schema state for other tests.
        const originalMigrations = Game.SAVE_MIGRATIONS;
        const originalVersion = Game.SAVE_SCHEMA_VERSION;
        Game.SAVE_MIGRATIONS = [
            ...originalMigrations,
            { from: originalVersion, to: originalVersion + 1, migrate() { throw new Error('boom'); } }
        ];
        Game.SAVE_SCHEMA_VERSION = originalVersion + 1;
        try {
            const v1Save = { player: { classId: 'tactician' } };
            const migrated = Game._migrateSave(v1Save);
            // Production defaults survive even when the appended step fails.
            expect(migrated).not.toBeNull();
            expect(Array.isArray(migrated.player.upgrades)).toBe(true);
            expect(migrated.v).toBe(originalVersion + 1);
        } finally {
            Game.SAVE_MIGRATIONS = originalMigrations;
            Game.SAVE_SCHEMA_VERSION = originalVersion;
        }
    });

    it('breaks the chain cleanly if a migration step is missing', async () => {
        const { Game } = await import('../game.js');
        // Remove the newest production step and ask to advance beyond it.
        const originalVersion = Game.SAVE_SCHEMA_VERSION;
        const originalMigrations = Game.SAVE_MIGRATIONS;
        Game.SAVE_MIGRATIONS = originalMigrations.filter(m => m.to < originalVersion);
        Game.SAVE_SCHEMA_VERSION = originalVersion + 1;
        try {
            const v1Save = { player: { classId: 'tactician' } };
            const migrated = Game._migrateSave(v1Save);
            expect(migrated).not.toBeNull();
            // Advanced as far as the chain allowed.
            expect(migrated.v).toBe(originalVersion - 1);
        } finally {
            Game.SAVE_MIGRATIONS = originalMigrations;
            Game.SAVE_SCHEMA_VERSION = originalVersion;
        }
    });

    it('marks a legacy zero-HP snapshot for canonical death recovery', async () => {
        const { Game } = await import('../game.js');
        const dead = Game._migrateSave({ v: 2, player: { hp: 0, relics: [{ id: 'second_life' }] } });
        expect(dead.v).toBe(Game.SAVE_SCHEMA_VERSION);
        expect(dead.combatRecovery.outcome).toBe('death');
        expect(dead.player.hp).toBe(0);
        expect(dead.player.relics).toEqual([{ id: 'second_life' }]);
        const alive = Game._migrateSave({ v: 2, player: { hp: 1 } });
        expect(alive.combatRecovery).toBeNull();
        expect(alive.player.hp).toBe(1);
    });

    it.each([LEGACY_V1_SAVE, V2_SAVE])('preserves frozen historical progress while reaching the current schema %#', async source => {
        const { Game } = await import('../game.js');
        const input = saveFixture(source);
        const before = saveFixture(input);
        const migrated = Game._migrateSave(input);
        expect(migrated.v).toBe(Game.SAVE_SCHEMA_VERSION);
        expect(migrated.player.hp).toBe(17);
        expect(migrated.map).toEqual(source.map);
        expect(migrated.fragments).toBe(37);
        expect(input).toEqual(before);
    });
});
