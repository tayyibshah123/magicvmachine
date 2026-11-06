import { vi } from 'vitest';
import { Game } from '../../game.js';
import { Enemy } from '../../entities/enemy.js';
import { Player } from '../../entities/player.js';
import { PLAYER_CLASSES, STATE } from '../../constants.js';
import { AudioMgr } from '../../audio.js';
import { ParticleSys } from '../../effects/particles.js';
import { ClassAbility } from '../../ui/class-ability.js';
import { Intel } from '../../services/intel.js';
import { Diag } from '../../services/diag.js';
import { Hints } from '../../services/hints.js';
import { Unlocks } from '../../services/unlocks.js';
import { Achievements } from '../../services/achievements.js';
import { Analytics } from '../../services/analytics.js';
import { Assist } from '../../services/assist.js';

function stubMethods(object, methods) {
    for (const method of methods) vi.spyOn(object, method).mockImplementation(() => {});
}

// Each profile is explicit. Core damage, turn, QTE and terminal methods remain
// real unless the test specifically opts into a boundary observer.
export function stubCosmetics() {
    stubMethods(ParticleSys, ['createDamageText', 'createExplosion', 'createFloatingText',
        'createShockwave', 'createSparks', 'createClassBurst', 'createBloodstalkerBurst', 'clear']);
    stubMethods(AudioMgr, ['playSound', 'playHit', 'playSting', 'duck',
        'stopSectorAmbient', 'clearSectorMusic', 'startMusic']);
    stubMethods(Game, ['shake', 'shakeFromDamage', 'hitStop', 'triggerScreenFlash',
        'haptic', '_checkHiddenLoreTriggers', 'triggerBossZoom']);
    vi.spyOn(Game, 'showPhaseBanner').mockResolvedValue();
    vi.spyOn(Game, 'triggerPhaseGlitch').mockResolvedValue();
}

export function stubCombatUI() {
    stubMethods(Game, ['updateHUD', 'renderRelics', 'renderDiceUI', '_spawnDieUseBurst',
        '_renderPactPills', 'showTurnSummary']);
}

export function stubTerminalServices() {
    stubMethods(Game, ['_resetRunCurrency', '_showVictoryTally', 'saveGame',
        'grantSparks', '_clearSave', '_logRunHistory', 'renderDeathCards', 'renderRunSummary']);
    vi.spyOn(Game, 'showCombatWin').mockImplementation(() => Game.changeState(STATE.COMBAT_WIN));
    vi.spyOn(Game, '_runBossDeathDissolve').mockResolvedValue();
    for (const [object, methods] of [
        [Intel, ['recordKill']], [Diag, ['event', 'dump']], [Hints, ['trigger']],
        [Unlocks, ['grant']], [Achievements, ['unlock']], [Analytics, ['emit']],
        [Assist, ['recordWin', 'recordLoss']]
    ]) stubMethods(object, methods);
}

export function observeTerminalTransitions() {
    const win = vi.spyOn(Game, 'winCombat').mockImplementation(() => {
        if (!Game._resolvingSelfDestruct) Game.currentState = STATE.COMBAT_WIN;
    });
    const death = vi.spyOn(Game, 'gameOver').mockImplementation(() => { Game.currentState = STATE.GAMEOVER; });
    return { win, death };
}

export function stubQTE(result = 1) {
    return vi.spyOn(Game, 'startQTE').mockResolvedValue(result);
}

export function stubClassEvents() {
    stubMethods(ClassAbility, ['endCombat', 'onTurnStart', 'onTurnEnd', 'onEvent']);
    vi.spyOn(ClassAbility, 'consumeAttackBlock').mockReturnValue(false);
}

export function installCanvasContext() {
    const gradient = { addColorStop() {} };
    const context = new Proxy({}, {
        get: (target, key) => target[key] ?? (key === 'createLinearGradient' || key === 'createRadialGradient'
            ? () => gradient : () => {}),
        set: (target, key, value) => { target[key] = value; return true; }
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(ParticleSys, '_acquire').mockImplementation(() => ({}));
    Game.ctx = context;
    return context;
}

const profiles = {
    cosmetics: stubCosmetics,
    ui: stubCombatUI,
    'terminal-services': stubTerminalServices,
    'terminal-observers': observeTerminalTransitions,
    qte: stubQTE,
    'class-events': stubClassEvents,
    renderer: installCanvasContext
};

export function createCombatPlayer(classId = 'tactician', { maxHp = 100, hp = maxHp } = {}) {
    const classConfig = PLAYER_CLASSES.find(config => config.id === classId);
    if (!classConfig) throw new Error(`Unknown fixture class: ${classId}`);
    Game.player = new Player(classConfig);
    Game.player.classId = classId;
    Game.player.maxHp = maxHp;
    Game.player.currentHp = hp;
    // startCombat synchronises this class-specific runtime die before rolling.
    Game._syncSignatureDie();
    Game.invalidateStackCache();
    return Game.player;
}

export function setupCombatFixture({ classId = 'tactician', maxHp = 100, hp = maxHp,
    enemyTemplate = { name: 'Combat Test', hp: 100, dmg: 20 }, enemyLevel = 0,
    state = STATE.COMBAT, fakeTimers = true, game = {}, profiles: selected = [] } = {}) {
    if (fakeTimers) {
        vi.useFakeTimers();
        vi.setSystemTime(1000);
        vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
    }
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.body.innerHTML = `
        <div id="game-container"><canvas id="gameCanvas" width="1080" height="1920"></canvas>
            <div id="screen-flash"></div></div>
        <div id="dice-container"></div><div id="reroll-badge"></div><div id="hud"></div>
        <div id="tutorial-spotlight"></div><div id="combat-log"></div>
        <div id="screen-combat-win" class="screen"></div><div id="modal-settings" class="hidden"></div>
        <button id="btn-end-turn"></button><button id="btn-load-save"></button><button id="btn-reroll"></button>
    `;
    document.body.className = '';
    localStorage.clear();
    Object.assign(Game, {
        currentState: state, sector: 1, turnCount: 3, combatPaceMult: 1, corruptionLevel: 0, _modernPacing: false,
        _combatGen: 10, _combatActionDepth: 0, _combatStartedAt: 0,
        _endTurnRunning: false, _winCombatRunning: false, _resolvingSelfDestruct: false,
        _revivePending: null, _turnStartOwner: null, _enemyTurnFeedback: null,
        _settledCombatVfx: undefined, _activeCombatPresentation: null,
        _combatPresentations: new Set(), _presentationEffectOwners: new WeakMap(),
        _combatActionInputWasLocked: false, inputLocked: false, paused: false,
        inputCooldown: 0, godMode: false, assistDisabled: true, autoQTE: false,
        challengeMode: false, archiveMode: false, qte: { active: false },
        dragState: { active: false, die: null, dieElement: null, ghostElement: null,
            hoverTarget: null, startX: 0, startY: 0 },
        _audioResumeArmed: false,
        _archivistTurnExpired: false, _archivistClockEnemy: null, _archivistClockGen: null,
        _archivistTimerBudget: undefined, _ascEffects: {}, metaUpgrades: [],
        metaToggledOff: new Set(), _disabledMetaThisRun: new Set(), activePacts: new Set(),
        _customDmgInMult: 1, _customDmgOutMult: 1, _customHotHandsDmg: 0,
        _customRelicPickDmg: 0, _customRelicPickDupe: false, _hotHandsUsedThisTurn: false,
        _customDisableReroll: false, _sparkBatteryUsed: false,
        runStats: null, turnStats: null, effects: [], _activeSectorMech: null,
        deadMinionsThisTurn: 0, sealedDie: null, techFragments: 0, encryptedFiles: 0,
        dicePool: [], rerolls: 2, bonusRerollsNextTurn: 0, freeRerollUsedThisTurn: false,
        comboSets: {}, comboFlurry: false, comboDoubleStrike: false, comboOverflow: false,
        comboBulwark: false, comboSiblingBond: false, activeCombos: [],
        attacksThisTurn: 0, diceUsedThisTurn: 0, firstAttackDealt: false, _nextDamageIsCrit: false,
        _rerollIntervals: [], _rerollTimeout: null, _emergencyKitCharges: 0,
        player: null, enemy: null, canvas: document.getElementById('gameCanvas'), ctx: null,
        ...game
    });
    for (const name of selected) {
        if (!profiles[name]) throw new Error(`Unknown combat fixture profile: ${name}`);
        profiles[name]();
    }
    vi.spyOn(Game, '_isNewcomer').mockReturnValue(false);
    vi.spyOn(Game, '_recoverFromCombatError').mockImplementation((where, error) => { throw error; });
    createCombatPlayer(classId, { maxHp, hp });
    Game.enemy = new Enemy(enemyTemplate, enemyLevel);
    return { player: Game.player, enemy: Game.enemy };
}

export function teardownCombatFixture() {
    // Cancel owners before restoring clocks. Clearing a timer alone leaves
    // presentation promises pending and can leak continuations into another case.
    Game._combatGen++;
    for (const group of [...(Game._combatPresentations || [])]) group.finish(false);
    Game._revivePending = null;
    Game._stopArchivistTimeControl();
    Game._clearRerollIntervals();
    Game.clearTrackedTimers();
    if (vi.isFakeTimers()) vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    document.body.className = '';
    document.body.innerHTML = '';
    Game.ctx = null;
    Game.canvas = null;
}
