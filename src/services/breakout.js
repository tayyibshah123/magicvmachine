/* Sector 0 — The Breakout
 *
 * A scripted, hand-authored prologue that replaces the legacy auto-tutorial
 * for first-time players. Five short combats teach one mechanic each, plus
 * a 2-phase Cage Guardian mini-boss as synthesis. On completion the player
 * is granted the Cellkey Shard relic and dropped into Sector 1 with their
 * already-selected class.
 *
 * Design intent
 * -------------
 *   - Story-framed: the Warden narrates each room. New players get the
 *     premise (you are an organic consciousness imprisoned inside the
 *     Panopticon) before they ever face a real enemy.
 *   - Per-class fantasy: Room 3 is class-specific — forced dice + scripted
 *     enemy behaviour are tuned so each class's signature ability is the
 *     star of its own teaching beat.
 *   - Cannot lose: takeDamage clamps to 1 HP while in BREAKOUT. Failures
 *     don't end the run; the Warden just ribs the player.
 *   - Skippable: any player who has already completed the breakout
 *     (mvm_breakout_done === '1') gets a single "RELIVE" / "SKIP" option
 *     on entry instead of the full play.
 *
 * Architecture
 * ------------
 * Runs on the existing combat engine (Enemy, dice pipeline, intents). The
 * service installs scripted overrides on Game (`_breakoutForcedDice`,
 * `_breakoutScript`) and the combat code reads them ONLY when state is
 * STATE.BREAKOUT. After the Cage Guardian dies we grant the relic, set
 * the persistence flag, and hand off to changeState(STATE.MAP) so the
 * normal run flow resumes — the player keeps their class, their relic,
 * and a freshly-rolled run map.
 */

import { STATE, DICE_TYPES, PLAYER_CLASSES, UPGRADES_POOL } from '../constants.js';

// ────────────────────────────────────────────────────────────────────
// ROOM SCRIPTS
// ────────────────────────────────────────────────────────────────────
//
// Each entry defines one breakout room. Fields:
//   id        — short tag for analytics + diag
//   teaches   — single-sentence summary (developer-facing)
//   enemy     — { name, hp, dmg } passed into the Enemy constructor
//   intents   — turn-by-turn enemy intent queue. Cycles if combat
//               outlasts the script (shouldn't, but defensive).
//   diceFn    — receives (classId) and returns the forced hand. Lets
//               Room 3 deliver per-class signature dice. If null, the
//               normal hand is rolled (used for the boss room so the
//               player practises real combat).
//   warden    — narration steps shown over the room: { story, action }.
//               { story } prints in the Warden's voice; { action }
//               tells the player what to do.
const ROOMS = [
    {
        id: 'cell-block',
        teaches: 'drag-to-aim attack basics',
        enemy: { name: 'CELL DRONE', hp: 8, dmg: 2 },
        intents: [
            { type: 'idle', val: 0, label: 'SCANNING' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            // Two attack dice — first room is a free swing.
            return [cd.attack, cd.attack];
        },
        warden: [
            {
                story: 'Operator. The Warden hears you breathing inside the cell.',
                action: 'Drag a die ONTO the drone to strike. Release to commit.'
            },
            {
                story: 'Good. The first lock is electrical, not mechanical.',
                action: 'Use both dice. The drone falls in two strikes.'
            }
        ]
    },
    {
        id: 'shock-collar',
        teaches: 'reading enemy intent + defending',
        enemy: { name: 'SHOCK SENTRY', hp: 14, dmg: 6 },
        intents: [
            { type: 'attack', val: 6, label: 'STRIKE 6' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            return [cd.defend, cd.attack];
        },
        warden: [
            {
                story: 'The collar telegraphs before it bites. See the red icon.',
                action: 'Drag the SHIELD die onto YOURSELF first. Then attack.'
            }
        ]
    },
    // Room 3 — class signature beat. Per-class enemy + intent + dice.
    {
        id: 'class-fantasy',
        teaches: 'class signature mechanic',
        // populated dynamically in roomFor() based on player class.
    },
    {
        id: 'parry-window',
        teaches: 'QTE / parry timing',
        enemy: { name: 'EXECUTIONER', hp: 24, dmg: 12 },
        intents: [
            { type: 'attack', val: 12, label: 'EXECUTE 12' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            return [cd.attack, cd.defend];
        },
        warden: [
            {
                story: 'This one swings hard. Time the QTE — green ring is perfect.',
                action: 'Defend the strike. Tap inside the ring at the right moment.'
            }
        ]
    },
    {
        id: 'reroll-room',
        teaches: 'rerolls + module synergy',
        enemy: { name: 'GLITCH WARDEN', hp: 20, dmg: 8 },
        intents: [
            { type: 'attack', val: 8, label: 'STRIKE 8' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            // Mismatched hand on purpose so the player learns reroll.
            return [cd.defend, cd.defend];
        },
        warden: [
            {
                story: 'Bad hand? You have rerolls. Cycle them until you get a strike.',
                action: 'Tap the reroll dial (left). Reroll BOTH dice into attacks.'
            }
        ]
    },
    // Boss room — real combat against the Cage Guardian.
    {
        id: 'guardian',
        teaches: 'synthesis fight',
        enemy: { name: 'CAGE GUARDIAN', hp: 70, dmg: 8, isBoss: true },
        intents: [
            { type: 'attack', val: 6, label: 'STRIKE 6' },
            { type: 'shield', val: 8, label: 'PLATING +8' },
            { type: 'attack', val: 10, label: 'EXECUTE 10' },
            { type: 'attack', val: 6, label: 'STRIKE 6' }
        ],
        diceFn: null, // real combat — natural roll
        warden: [
            {
                story: 'The cell wall cracks. The CAGE GUARDIAN steps through.',
                action: 'Use everything you learned. Shield. Strike. Parry.'
            }
        ]
    }
];

// Per-class Room 3 specs. The signature die varies, the enemy and intent
// are tuned so the player's class fantasy lands cleanly.
const CLASS_ROOM_3 = {
    bloodstalker: {
        enemy:  { name: 'WOUNDED HUNTER', hp: 22, dmg: 4 },
        intents: [{ type: 'attack', val: 4, label: 'STRIKE 4' }],
        diceFn: (cd) => [cd.attack, 'STALK'],
        warden: [{
            story: 'Wounded prey. STALK reveals their seam.',
            action: 'Play STALK first, then strike the marked seam for double.'
        }]
    },
    arcanist: {
        enemy:  { name: 'CORRUPTED PROCESS', hp: 18, dmg: 14 },
        intents: [{ type: 'attack', val: 14, label: 'CORRUPT 14' }],
        diceFn: (cd) => [cd.mana, 'GLYPH_INTERRUPT'],
        warden: [{
            story: 'A heavy attack winds up. Glyph it before it lands.',
            action: 'Drag the GLYPH onto the enemy to interrupt. Then mana up.'
        }]
    },
    sentinel: {
        enemy:  { name: 'BARRAGE TURRET', hp: 22, dmg: 4 },
        intents: [{ type: 'multi_attack', val: 4, hits: 3, label: 'BARRAGE x3' }],
        diceFn: (cd) => [cd.defend, cd.defend],
        warden: [{
            story: 'Multi-strike incoming. PLATES stack one for each hit.',
            action: 'Stack two defend dice. Plates absorb the barrage, not HP.'
        }]
    },
    annihilator: {
        enemy:  { name: 'OVERHEATED GUARD', hp: 6, dmg: 5 },
        intents: [{ type: 'attack', val: 5, label: 'STRIKE 5' }],
        diceFn: (cd) => [cd.attack, 'OVERCHARGE'],
        warden: [{
            story: 'One HP from death. Push it over with OVERCHARGE.',
            action: 'OVERCHARGE the attack die. Land the kill shot.'
        }]
    },
    tactician: {
        enemy:  { name: 'PROTOCOL OFFICER', hp: 18, dmg: 6 },
        intents: [{ type: 'buff', val: 0, label: 'STRENGTHEN' }],
        diceFn: (cd) => [cd.attack, 'STRATAGEM'],
        warden: [{
            story: 'It is buffing itself. Strip the protocol with STRATAGEM.',
            action: 'STRATAGEM removes the buff. Then strike clean.'
        }]
    },
    summoner: {
        enemy:  { name: 'SWARM AGITATOR', hp: 24, dmg: 5 },
        intents: [{ type: 'attack', val: 5, label: 'STRIKE 5' }],
        diceFn: (cd) => [cd.minion, cd.attack],
        warden: [{
            story: 'Sacred Grove answers. Plant a Wisp; it eats the next hit.',
            action: 'Play MINION. The grove blooms. Then strike with the survivor.'
        }]
    }
};

// Generic Room 3 fallback (in case classId is unknown).
const ROOM_3_FALLBACK = {
    enemy: { name: 'CELL CAPTAIN', hp: 18, dmg: 4 },
    intents: [{ type: 'attack', val: 4, label: 'STRIKE 4' }],
    diceFn: (cd) => [cd.attack, cd.attack],
    warden: [{
        story: 'Practise your signature. Land a clean two-strike.',
        action: 'Play both attack dice. Time the second so it crits.'
    }]
};

// Per-class flavour line played on completion of the Cage Guardian.
const CLASS_OUTRO = {
    bloodstalker: 'The hunter remembers what the cage couldn\'t.',
    arcanist:    'Glyphs older than the Warden whisper through your veins.',
    sentinel:    'The shield you raised inside the cell stays raised outside.',
    annihilator: 'You did not break the cage. You denied it ever existed.',
    tactician:   'Now you have data. Use it. The Panopticon hates patterns it didn\'t write.',
    summoner:    'The seedling escaped its plot. The grove is older than steel.'
};

// ────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────

function classDice(classId) {
    const cls = PLAYER_CLASSES.find(c => c.id === classId);
    const cd = (cls && cls.classDice) || {};
    return {
        attack: cd.attack || 'TAC_ATTACK',
        defend: cd.defend || 'TAC_DEFEND',
        mana:   cd.mana   || 'TAC_MANA',
        minion: cd.minion || 'TAC_MINION'
    };
}

function roomFor(roomIdx, classId) {
    const r = ROOMS[roomIdx];
    if (!r) return null;
    if (r.id === 'class-fantasy') {
        const spec = CLASS_ROOM_3[classId] || ROOM_3_FALLBACK;
        const cd = classDice(classId);
        return {
            id: 'class-fantasy',
            teaches: 'class signature mechanic',
            enemy: spec.enemy,
            intents: spec.intents,
            diceFn: () => spec.diceFn(cd),
            warden: spec.warden
        };
    }
    return r;
}

function isUnlockedDieType(type) {
    // Signature/special die types referenced in scripts may not be in
    // DICE_TYPES on every loadout (e.g. STALK belongs to bloodstalker).
    // Fall back to a base attack die if the script names a type the
    // current loadout doesn't actually have, so the rigging never
    // produces a black/empty die slot.
    return !!(DICE_TYPES && DICE_TYPES[type]);
}

function safeType(t, fallback) {
    return isUnlockedDieType(t) ? t : (fallback || 'TAC_ATTACK');
}

// ────────────────────────────────────────────────────────────────────
// CONTROLLER
// ────────────────────────────────────────────────────────────────────

export const Breakout = {
    _game: null,
    _roomIdx: 0,
    _active: false,
    _wardenStep: 0,

    isActive() { return !!this._active; },
    currentRoomIdx() { return this._roomIdx; },
    totalRooms() { return ROOMS.length; },

    /* Determine if a fresh player should play the breakout. Veterans who
     * have already cleared it once get a one-tap skip path; first-time
     * players walk all six rooms. */
    shouldOffer() {
        try { return localStorage.getItem('mvm_breakout_done') !== '1'; }
        catch (_) { return true; }
    },
    markComplete() {
        try {
            localStorage.setItem('mvm_breakout_done', '1');
            // Also mark the legacy first-run flag so the player doesn't
            // see the old auto-tutorial on their next run. The Breakout
            // covers everything that tutorial taught (and more).
            localStorage.setItem('mvm_first_run_done', '1');
        } catch (_) {}
    },

    /* Entry point. Called from selectClass after the player object is
     * built. Sets state + opens room 0. */
    start(game) {
        this._game = game;
        this._roomIdx = 0;
        this._wardenStep = 0;
        this._active = true;
        // Hint banner so the player knows the map will follow afterwards.
        try {
            game.changeState(STATE.BREAKOUT);
        } catch (_) {}
        this._enterRoom();
    },

    /* One-tap skip: completes the flow and grants the relic without
     * walking the rooms. Used by veterans who've cleared it before. */
    skip() {
        const game = this._game;
        if (!game) return;
        this._active = false;
        this._grantCellkey(game);
        this.markComplete();
        // Reset run-start flags the breakout had toggled, then continue
        // into the regular run flow at the sector map.
        game._breakoutForcedDice = null;
        game._breakoutScript = null;
        game.changeState(STATE.MAP);
    },

    /* Build + enter the current room. Spawns the scripted enemy, installs
     * the dice + intent overrides, opens the narration pane, and routes
     * into the existing combat pipeline. */
    _enterRoom() {
        const game = this._game;
        if (!game) return;
        const idx = this._roomIdx;
        const room = roomFor(idx, game.player && game.player.classId);
        if (!room) {
            // Past the last room — finish.
            this._finish();
            return;
        }
        // Forced dice override — read by Game.rollDice's BREAKOUT branch.
        if (typeof room.diceFn === 'function') {
            const types = (room.diceFn() || []).map((t, i) => safeType(t, i === 0 ? 'TAC_ATTACK' : 'TAC_DEFEND'));
            game._breakoutForcedDice = types;
        } else {
            game._breakoutForcedDice = null;
        }
        // Intent script — read by Enemy.decideTurn's BREAKOUT branch.
        game._breakoutScript = {
            roomId: room.id,
            intents: room.intents.slice(),
            cursor: 0
        };

        // Open the narration pane with the first warden line. Fall back
        // to a transient floating text if the pane element is missing
        // (e.g. legacy DOM).
        this._wardenStep = 0;
        this._showWarden(room);

        // Sector 0 — light-weight spawn. We deliberately bypass the
        // heavy `startCombat` path because it expects a valid
        // BOSS_DATA[sector] / SECTOR_CONFIG entry, applies sector
        // multipliers, and triggers boss-intro cinematics that aren't
        // appropriate for the prologue. The custom builder below
        // produces a clean enemy + initial dice pool with the scripted
        // HP/DMG values.
        game.sector = 0;
        game._inBreakout = true;
        if (typeof game._buildBreakoutCombat === 'function') {
            game._buildBreakoutCombat(room);
        }
    },

    _showWarden(room) {
        const lines = (room && room.warden) || [];
        const line = lines[this._wardenStep] || lines[0] || null;
        if (!line) return;
        // Reuse the existing tutorial-narration pane if present.
        const pane = document.getElementById('tutorial-narration');
        const story = document.getElementById('tutorial-narration-story');
        const action = document.getElementById('tutorial-narration-action');
        if (pane) pane.classList.remove('hidden');
        if (story) story.textContent = line.story || '';
        if (action) action.textContent = line.action || '';
    },

    /* Called after the player kills the room's scripted enemy. Advances
     * the room cursor, runs a beat of warden flavour, and opens the
     * next room. */
    onCombatWin() {
        if (!this._active) return;
        const game = this._game;
        const room = roomFor(this._roomIdx, game && game.player && game.player.classId);
        // Last room = guardian → grant relic + finish.
        if (room && room.id === 'guardian') {
            this._finish();
            return;
        }
        this._roomIdx++;
        // Brief delay so the kill VFX lands before the next spawn.
        setTimeout(() => this._enterRoom(), 600);
    },

    /* Called when the player's HP hits 0 inside a breakout room. The
     * fight should never be lost — we restore HP, reset the room, and
     * print a Warden ribbing line. */
    onPlayerWouldDie() {
        const game = this._game;
        if (!game || !game.player) return;
        game.player.currentHp = Math.max(1, Math.floor(game.player.maxHp * 0.5));
        // Re-spawn the same room so the player can try again. Keeps run
        // intact (no death cinematic, no GAMEOVER state).
        const pane = document.getElementById('tutorial-narration');
        const story = document.getElementById('tutorial-narration-story');
        const action = document.getElementById('tutorial-narration-action');
        if (story) story.textContent = 'The cage holds. Try again — there is no penalty here.';
        if (action) action.textContent = 'Resetting room...';
        if (pane) pane.classList.remove('hidden');
        setTimeout(() => this._enterRoom(), 900);
    },

    /* Final beat: grant Cellkey Shard, set persistence flag, route into
     * the regular run on the sector map. Plays a closing warden line
     * tuned to the player's class. */
    _finish() {
        const game = this._game;
        if (!game) return;
        this._active = false;
        this._grantCellkey(game);
        this.markComplete();
        game._breakoutForcedDice = null;
        game._breakoutScript = null;
        game._inBreakout = false;

        // Closing warden line keyed to class.
        const cid = game.player && game.player.classId;
        const out = CLASS_OUTRO[cid] || 'You are out. The Panopticon will be watching.';
        const pane = document.getElementById('tutorial-narration');
        const story = document.getElementById('tutorial-narration-story');
        const action = document.getElementById('tutorial-narration-action');
        if (pane) pane.classList.remove('hidden');
        if (story) story.textContent = out;
        if (action) action.textContent = 'Tap to continue into Sector 1.';
        if (pane) {
            pane.style.cursor = 'pointer';
            const advance = () => {
                pane.removeEventListener('click', advance);
                pane.classList.add('hidden');
                pane.style.cursor = '';
                game.sector = 1;
                game.changeState(STATE.MAP);
            };
            pane.addEventListener('click', advance, { once: true });
        } else {
            // Pane missing — just transition.
            game.sector = 1;
            game.changeState(STATE.MAP);
        }
    },

    _grantCellkey(game) {
        if (!game || !game.player || !game.player.addRelic) return;
        if (game.player.hasRelic && game.player.hasRelic('cellkey_shard')) return;
        // The relic is always defined in UPGRADES_POOL (constants.js).
        // No icon-set fallback needed — if the pool entry is missing,
        // something has gone very wrong upstream and a synthetic
        // relic without a real icon would just paper over the bug.
        const relic = UPGRADES_POOL && UPGRADES_POOL.find(r => r.id === 'cellkey_shard');
        if (!relic) return;
        game.player.addRelic(relic);
        // Apply the Max HP portion immediately. Reroll behaviour is
        // wired in Game.endTurn via hasRelic('cellkey_shard').
        game.player.maxHp += 3;
        game.player.currentHp += 3;
    },

    /* Combat pipeline reads this when state === BREAKOUT to decide which
     * dice to deal. Returns a hand of die-type strings for the current
     * roll, or null to fall back to natural rolling (e.g. boss room). */
    forcedHand() {
        const game = this._game;
        if (!game || !this._active) return null;
        return game._breakoutForcedDice || null;
    },

    /* Called by Enemy.decideTurn when state === BREAKOUT. Returns the
     * next scripted intent, cycling on the queue if combat outlasts
     * the script. */
    nextScriptedIntent() {
        const game = this._game;
        if (!game || !game._breakoutScript) return null;
        const s = game._breakoutScript;
        if (!s.intents || s.intents.length === 0) return null;
        const intent = s.intents[s.cursor % s.intents.length];
        s.cursor++;
        return Object.assign({}, intent);
    }
};
