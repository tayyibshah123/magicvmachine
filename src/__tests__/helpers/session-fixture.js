import { expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('index.html', 'utf8');
let warm;

function copy(value) {
    if (Array.isArray(value)) return value.map(copy);
    if (value instanceof Set) return new Set(value);
    if (value instanceof Map) return new Map(value);
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
    }
    return value;
}

async function importSession() {
    const [{ Game }, { Player }, { Enemy }, constants, { AudioMgr }, { ParticleSys },
        { ClassAbility }, { ClassBriefing }, { ClassVfx }, { Diag }, { Breakout }, { Challenge }] = await Promise.all([
        import('../../game.js'), import('../../entities/player.js'), import('../../entities/enemy.js'),
        import('../../constants.js'), import('../../audio.js'), import('../../effects/particles.js'),
        import('../../ui/class-ability.js'), import('../../services/class-briefing.js'),
        import('../../services/class-vfx.js'), import('../../services/diag.js'),
        import('../../services/breakout.js'), import('../../services/dailies.js')
    ]);
    const context = { Game, Player, Enemy, AudioMgr, ParticleSys, ClassAbility, ClassBriefing,
        ClassVfx, Diag, Breakout, Challenge, ...constants };
    context.keys = new Set(Object.keys(Game));
    context.defaults = copy(Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(Game))
        .filter(([, descriptor]) => 'value' in descriptor)
        .map(([key, descriptor]) => [key, descriptor.value])));
    return context;
}

export function abandonSession({ Game, ClassAbility }) {
    Game._combatGen++;
    Game.clearTrackedTimers();
    for (const group of Game._combatPresentations || []) group.finish(false);
    ClassAbility.endCombat();
}

function prepareSession(context, { empty = false } = {}) {
    const { Game, Player, Enemy, AudioMgr, ParticleSys, ClassAbility, ClassBriefing, ClassVfx, Diag } = context;
    for (const key of Object.keys(Game)) if (!context.keys.has(key)) delete Game[key];
    Object.assign(Game, copy(context.defaults));
    document.documentElement.innerHTML = page;
    document.body.className = '';
    for (const method of ['playSound', 'playHit', 'playSting', 'duck', 'startMusic',
        'stopSectorAmbient', 'clearSectorMusic', 'startSectorAmbient', 'setSectorMusic']) {
        vi.spyOn(AudioMgr, method).mockImplementation(() => {});
    }
    for (const method of ['createDamageText', 'createExplosion', 'createFloatingText',
        'createShockwave', 'createSparks', 'createClassBurst', 'clear']) {
        vi.spyOn(ParticleSys, method).mockImplementation(() => {});
    }
    for (const method of ['shake', 'shakeFromDamage', 'haptic', 'hitStop', 'triggerScreenFlash',
        'renderRelics', 'renderDiceUI', '_spawnDieUseBurst', 'updateHUD', 'renderDeathCards',
        'renderRunSummary', 'renderCharSelect', '_startMenuPulse']) {
        vi.spyOn(Game, method).mockImplementation(() => {});
    }
    vi.spyOn(Game, 'showPhaseBanner').mockResolvedValue();
    vi.spyOn(Game, '_recoverFromCombatError').mockImplementation((where, error) => { throw error; });
    vi.spyOn(ClassBriefing, 'show').mockResolvedValue();
    vi.spyOn(ClassVfx, 'playDeath').mockImplementation(() => {});
    vi.spyOn(Diag, 'dump').mockImplementation(() => {});
    ClassAbility.init(Game);
    Object.assign(Game, {
        currentState: empty ? context.STATE.MENU : context.STATE.COMBAT,
        _combatGen: 10, _combatActionDepth: 0, _revivePending: null,
        _combatRecoveryRestart: false, _endTurnRunning: false, _winCombatRunning: false,
        _resolvingSelfDestruct: false, inputLocked: false, paused: false, autoQTE: true,
        qte: { active: false }, sector: 1, turnCount: 2, combatPaceMult: 1,
        metaUpgrades: [], metaToggledOff: new Set(), _disabledMetaThisRun: new Set(),
        challengeMode: false, archiveMode: false, _ascEffects: {}, _activeSectorMech: null,
        customRunModifiers: new Set(), activePacts: new Set(),
        effects: [], runStats: { turns: 2 }, techFragments: 12, encryptedFiles: 0,
        canvas: document.getElementById('gameCanvas'),
        map: { currentIdx: 'fight', nodes: [
            { id: 'start', type: 'start', status: 'completed', x: 50, y: 92, connections: ['fight'] },
            { id: 'fight', type: 'combat', status: 'available', x: 50, y: 70, connections: [] }
        ] }
    });
    if (!empty) {
        Game.player = new Player(context.PLAYER_CLASSES.find(c => c.id === 'tactician'));
        Game.player.classId = 'tactician';
        Game.enemy = new Enemy({ ...context.ENEMIES[0], hp: 100, dmg: 10 }, 0);
        ClassAbility.startCombat();
    }
    Game.invalidateStackCache();
    return context;
}

export async function warmSession(options) {
    warm ||= await importSession();
    return prepareSession(warm, options);
}

export async function freshSession(previous, options = { empty: true }) {
    vi.resetModules();
    const context = prepareSession(await importSession(), options);
    expect(context.Game, 'a cold load must have a different Game singleton').not.toBe(previous.Game);
    expect(context.Player, 'cold-load entities must come from the new dependency graph').not.toBe(previous.Player);
    return context;
}

export function grantRevive(context, id) {
    const record = context.UPGRADES_POOL.find(r => r.id === id)
        || context.MODULE_FUSIONS.find(r => r.id === id);
    expect(record, `canonical revive ${id}`).toBeTruthy();
    context.Game.player.relics.push({ ...record });
    context.Game.invalidateStackCache();
}
