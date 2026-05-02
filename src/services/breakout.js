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
// STORYBOARD GLYPHS
// ────────────────────────────────────────────────────────────────────
// Inline SVG line-drawings stamped at the centre of each storyboard
// slate. 60x60 viewBox; CSS handles colour + glow + float animation.
// One glyph per room; each is a simple silhouette of the threat the
// player is about to face — drone, sentry, blade, glitch-X, warden
// seal — so the slate reads as a "wanted poster" / dossier file.
const GLYPHS = {
    drone:        '<svg viewBox="0 0 60 60"><circle cx="30" cy="32" r="13"/><circle cx="30" cy="32" r="5"/><path d="M10 22 L18 26 M50 22 L42 26 M30 14 L30 18 M30 50 L30 54"/></svg>',
    hive:         '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="14"/><circle cx="30" cy="30" r="3" fill="currentColor" stroke="none"/><path d="M16 16 L8 8 M44 16 L52 8 M16 44 L8 52 M44 44 L52 52 M30 4 L30 12 M30 48 L30 56 M4 30 L12 30 M48 30 L56 30"/></svg>',
    crest:        '<svg viewBox="0 0 60 60"><path d="M30 8 L48 18 L48 34 L30 52 L12 34 L12 18 Z"/><path d="M30 18 L30 38 M22 28 L38 28"/></svg>',
    glitch:       '<svg viewBox="0 0 60 60"><path d="M14 14 L46 46 M46 14 L14 46"/><path d="M8 30 L20 30 M40 30 L52 30 M30 8 L30 20 M30 40 L30 52"/></svg>',
    seal:         '<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="20"/><circle cx="30" cy="30" r="10"/><path d="M30 12 L30 48 M12 30 L48 30 M16 16 L44 44 M44 16 L16 44"/></svg>'
};

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
    // ──────────────────────────────────────────────────────────────
    // ROOM 1 — FIRST STRIKE
    // Mechanics: attack + defend
    // Compact drone, telegraphed strike, player learns the basic
    // "swing then guard" rhythm. Hand starts mixed so the player
    // has to figure out which die goes where.
    // ──────────────────────────────────────────────────────────────
    {
        id: 'first-strike',
        teaches: 'attack + defend basics, intent reading',
        enemy: {
            name: 'SURVEILLANCE DRONE',
            hp: 14,
            dmg: 5,
            shape: 'drone',
            radius: 70
        },
        intents: [
            { type: 'attack', val: 5, label: 'STRIKE 5' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            return [cd.defend, cd.attack];
        },
        storyboard: {
            tag: 'PRISON BLOCK 7 · CELL 14',
            title: 'BREATHING DETECTED',
            body: 'You wake up inside a holographic cell. A surveillance drone hovers at the bars and locks on. It will strike next turn — read its intent and decide: shield first, or burn it before it fires.',
            glyph: 'drone'
        },
        warden: [
            {
                story: 'A drone. The first lock is electrical, not mechanical.',
                action: 'SHIELD onto yourself first. Then ATTACK to break the lock.',
                sub: 'TARGET: PRISONER · LETHAL FORCE PERMITTED'
            }
        ]
    },

    // ──────────────────────────────────────────────────────────────
    // ROOM 2 — HIVE FRAGMENT
    // Mechanics: mana economy + minion summon + multiple targets
    // The fight has the boss enemy AND a swarmling that spawns on
    // turn 2. Player has [mana, minion, attack] dice — has to spend
    // mana to charge a Wisp, then chain attacks across two enemies.
    // Larger spider-shape enemy reads as bigger threat than room 1.
    // ──────────────────────────────────────────────────────────────
    {
        id: 'hive-fragment',
        teaches: 'mana spend + minion summon + multi-target',
        enemy: {
            name: 'HIVE FRAGMENT',
            hp: 22,
            dmg: 4,
            shape: 'spider',
            radius: 90
        },
        intents: [
            { type: 'attack', val: 4, label: 'STRIKE 4' },
            { type: 'summon', val: 0, label: 'SPAWN BROOD' },
            { type: 'attack', val: 4, label: 'STRIKE 4' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            return [cd.mana, cd.minion, cd.attack];
        },
        storyboard: {
            tag: 'CORRIDOR · NESTING SHAFT',
            title: 'HIVE FRAGMENT',
            body: 'The drone\'s death rouses something deeper. A hive-fragment crawls from a service shaft — armoured legs, a swarmling already breaking out of its underbelly. Plant a Wisp; let it eat the brood while you strike the parent.',
            glyph: 'hive'
        },
        warden: [
            {
                story: 'It will spawn a brood next turn. Plant your own first.',
                action: 'MANA up. Summon a WISP. Then strike the parent.',
                sub: 'INFESTATION DETECTED · QUARANTINE FAILED'
            }
        ]
    },

    // ──────────────────────────────────────────────────────────────
    // ROOM 3 — GLITCH CIPHER
    // Mechanics: status effects (Weak debuff) + parry timing on a
    // heavy strike. The cipher applies WEAK to the player on its
    // first action (50% damage cut), then loads a heavy strike on
    // turn 2 that the player has to parry. Player has a 3-die hand
    // including a defend so they can buffer the heavy hit.
    // ──────────────────────────────────────────────────────────────
    {
        id: 'glitch-cipher',
        teaches: 'status effects + parry timing',
        enemy: {
            name: 'GLITCH CIPHER',
            hp: 26,
            dmg: 12,
            shape: 'spider',
            radius: 95
        },
        intents: [
            { type: 'frost_aoe', val: 4, label: 'CIPHER WAVE', isAOE: true },
            { type: 'attack', val: 12, label: 'EXECUTE 12' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            return [cd.defend, cd.attack, cd.mana];
        },
        storyboard: {
            tag: 'DATA-VAULT 9',
            title: 'GLITCH CIPHER',
            body: 'A cipher unit phases out of the wall — half-corrupted, half-spider. Its first move applies WEAK (you deal 50% less damage). Its second is an EXECUTE-class strike. Time the parry on the heavy swing.',
            glyph: 'glitch'
        },
        warden: [
            {
                story: 'It will WEAKEN you, then swing hard. Time the parry.',
                action: 'DEFEND when the EXECUTE icon shows. Tap inside the green ring.',
                sub: 'CIPHER PROTOCOL ACTIVE · STATUS DECAY APPLIED'
            }
        ]
    },

    // ──────────────────────────────────────────────────────────────
    // ROOM 4 — CLASS PROVING
    // Mechanics: the player's class signature die + signature kit
    // (heal, mana feedback, plate, armour pierce, tempo, summon).
    // Per-class data lives in CLASS_ROOM_3 below. Each class's
    // signature die is forced into the hand alongside their attack
    // and defend so the player sees the full class identity.
    // ──────────────────────────────────────────────────────────────
    {
        id: 'class-fantasy',
        teaches: 'class signature die + kit',
        // populated dynamically in roomFor() based on player class.
    },

    // ──────────────────────────────────────────────────────────────
    // ROOM 5 — CAGE GUARDIAN (boss)
    // Synthesis fight. Tank-shape, ×2 radius (visually hulking),
    // 4-intent rotation cycling on a queue. Real natural-roll dice
    // (forcedHand=null) so the player practises a real run hand
    // before they leave the prologue. The Warden's lieutenant.
    // ──────────────────────────────────────────────────────────────
    {
        id: 'guardian',
        teaches: 'synthesis — everything together',
        enemy: {
            name: 'CAGE GUARDIAN',
            hp: 80,
            dmg: 8,
            shape: 'tank',
            radius: 140,
            isBoss: true
        },
        intents: [
            { type: 'attack', val: 6, label: 'STRIKE 6' },
            { type: 'shield', val: 8, label: 'PLATING +8' },
            { type: 'attack', val: 10, label: 'EXECUTE 10' },
            { type: 'multi_attack', val: 4, hits: 2, label: 'BARRAGE x2' }
        ],
        diceFn: null, // real combat — natural roll
        storyboard: {
            tag: 'OUTER GATE · WARDEN\'S DOMAIN',
            title: 'CAGE GUARDIAN',
            body: 'The cell wall fractures. Light pours through the seams. The CAGE GUARDIAN steps through the breach — the Warden\'s lieutenant. Hulking, plated, slow but devastating. Use everything: shield through plating turns, strike through gaps, parry the executes.',
            glyph: 'seal'
        },
        warden: [
            {
                story: 'The cell wall cracks. Beat the Guardian and the Panopticon learns your name.',
                action: 'Shield through PLATING. Strike between attacks. Parry the EXECUTE.',
                sub: 'CONTAINMENT BREACH · GUARDIAN ENGAGED · TERMINATE'
            }
        ]
    }
];

// Per-class Room 4 — class proving. Each class gets a tuned encounter
// that puts their signature die front-and-centre alongside their base
// kit. The signature die is registered as DICE_TYPES.SIGNATURE by
// `_syncSignatureDie()` (called from _buildBreakoutCombat) so we can
// reference the literal 'SIGNATURE' key here. Per-class enemies have
// distinct shapes + radii so each fight reads visually different.
const CLASS_ROOM_3 = {
    bloodstalker: {
        // Bite (SIG_BLOOD_1) — 8 dmg + 3 heal. Enemy chosen so the
        // heal matters: HP-swap encounter where a normal attack
        // sequence would leave the player low.
        enemy:  { name: 'WOUNDED HUNTER', hp: 22, dmg: 7, shape: 'spider', radius: 80 },
        intents: [{ type: 'attack', val: 7, label: 'STRIKE 7' }],
        storyboard: {
            tag: 'BLOCK 7 · SHADOWED WING',
            title: 'WOUNDED HUNTER',
            body: 'A scout-unit limps through the corridor — already bleeding from someone else\'s pass. The BITE die heals you for 3 every time it lands. The Bloodstalker\'s fantasy: trade HP and come out richer for it.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.attack, cd.defend],
        warden: [{
            story: 'BITE feeds you. Strike and heal in the same swing.',
            action: 'Drag the BITE die onto the hunter. Watch your HP refill.',
            sub: 'BLOODSTALKER PROTOCOL · LIFESIPHON DETECTED'
        }]
    },
    arcanist: {
        // Spark (SIG_ARC_1) — 6 dmg + 1 mana. Enemy with a small HP
        // pool but high damage so the mana-positive cycle matters.
        enemy:  { name: 'CORRUPTED PROCESS', hp: 18, dmg: 9, shape: 'drone', radius: 80 },
        intents: [{ type: 'attack', val: 9, label: 'CORRUPT 9' }],
        storyboard: {
            tag: 'DATA-VAULT 4',
            title: 'CORRUPTED PROCESS',
            body: 'Glyphs flicker against the wall. The SPARK die deals damage AND refunds a mana. The Arcanist\'s fantasy: every cast feeds the next. Strike, refill, strike again.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.defend, cd.mana],
        warden: [{
            story: 'SPARK refunds mana. The cycle never stops.',
            action: 'Cast SPARK. Then DEFEND the corrupt strike.',
            sub: 'ARCANIST PROTOCOL · MANA LOOP STABILIZED'
        }]
    },
    sentinel: {
        // Bash (SIG_SENT_1) — 10 shield + 4 dmg. Enemy is a multi-hit
        // turret so the shield gain matters: the BASH die is the
        // wall, not just a hit.
        enemy:  { name: 'BARRAGE TURRET', hp: 24, dmg: 4, shape: 'tank', radius: 95 },
        intents: [{ type: 'multi_attack', val: 4, hits: 3, label: 'BARRAGE x3' }],
        storyboard: {
            tag: 'CORRIDOR · BARRAGE LANE',
            title: 'BARRAGE TURRET',
            body: 'A wall-mounted turret loads a three-shot barrage. The BASH die grants shield AND deals damage. The Sentinel\'s fantasy: every swing is also a wall.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.defend, cd.attack],
        warden: [{
            story: 'BASH walls and strikes. Both at once.',
            action: 'BASH first — eat the barrage on shield. Then strike.',
            sub: 'SENTINEL PROTOCOL · KINETIC PLATING ACTIVE'
        }]
    },
    annihilator: {
        // Blast (SIG_ANNI_1) — 12 dmg, ignore shield. Enemy carries
        // shield so the armor-pierce reads.
        enemy:  { name: 'PLATED GUARD', hp: 18, dmg: 6, shield: 12, shape: 'tank', radius: 90 },
        intents: [{ type: 'attack', val: 6, label: 'STRIKE 6' }],
        storyboard: {
            tag: 'FOUNDRY ANNEX',
            title: 'PLATED GUARD',
            body: 'A guard-unit drops, plated to the eyes. Normal hits stop on the shield. The BLAST die ignores it entirely. The Annihilator\'s fantasy: armour is for other people.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.attack, cd.defend],
        warden: [{
            story: 'BLAST punches through plating like it\'s wet paper.',
            action: 'Drag BLAST onto the plated guard. Watch the shield evaporate.',
            sub: 'ANNIHILATOR PROTOCOL · ARMOR PIERCING ACTIVE'
        }]
    },
    tactician: {
        // Volley (SIG_TACT_1) — 7 dmg + 1 reroll next turn. Enemy
        // with two-turn structure so the next-turn reroll matters.
        enemy:  { name: 'PROTOCOL OFFICER', hp: 22, dmg: 5, shape: 'drone', radius: 80 },
        intents: [{ type: 'attack', val: 5, label: 'STRIKE 5' }],
        storyboard: {
            tag: 'COMMAND VESTIBULE',
            title: 'PROTOCOL OFFICER',
            body: 'A planner-unit reads the Tactician like a bad hand. The VOLLEY die deals damage AND grants a reroll next turn. The Tactician\'s fantasy: every move is also a setup for the next.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.defend, cd.attack],
        warden: [{
            story: 'VOLLEY pays you back next turn. Tempo wins fights.',
            action: 'Open with VOLLEY. Stack the reroll for next turn.',
            sub: 'TACTICIAN PROTOCOL · TEMPO LOOP DETECTED'
        }]
    },
    summoner: {
        // Call (SIG_SUM_1) — summon a spirit + 4 dmg. Enemy is a
        // swarm-spawner so two minion bodies on the field is the
        // play.
        enemy:  { name: 'SWARM AGITATOR', hp: 22, dmg: 5, shape: 'spider', radius: 90 },
        intents: [{ type: 'attack', val: 5, label: 'STRIKE 5' }],
        storyboard: {
            tag: 'SACRED HOLLOW',
            title: 'SWARM AGITATOR',
            body: 'The cell wall thins around root-veins. The CALL die plants a spirit AND strikes. The Summoner\'s fantasy: never fight alone.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.minion, cd.attack],
        warden: [{
            story: 'CALL plants a spirit. The grove answers.',
            action: 'Drag CALL onto the agitator. The spirit appears next to you.',
            sub: 'SUMMONER PROTOCOL · GROVE SIGNAL DETECTED'
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
            // Per-class spec carries its own storyboard so the player
            // gets context tuned to their class. Falls back to a
            // generic line if the class spec hasn't shipped one.
            storyboard: spec.storyboard || {
                tag: 'TRAINING WING',
                title: 'CLASS PROVING',
                body: 'A class-tuned encounter. Everything you have built into your dice answers this room.'
            },
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
        // Body class drives Breakout-only CSS — narration pane becomes
        // pointer-events: none so drag drops pass through to the
        // canvas, and warden subtext styling activates.
        try { document.body.classList.add('breakout-active'); } catch (_) {}
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
        try { document.body.classList.remove('breakout-active'); } catch (_) {}
        // Reset run-start flags the breakout had toggled, then continue
        // into the regular run flow at the sector map.
        game._breakoutForcedDice = null;
        game._breakoutScript = null;
        game.sector = 1;
        game.changeState(STATE.MAP);
    },

    /* Build + enter the current room. Shows the storyboard slate first,
     * then spawns the scripted enemy, installs the dice + intent
     * overrides, opens the narration pane, and routes into the existing
     * combat pipeline. */
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
        // Storyboard interlude before the combat. Tap-to-continue, then
        // _buildRoom() takes over. Skipped if the room has no story
        // slate defined (defensive — every room ships with one).
        if (room.storyboard) {
            this._showStoryboard(room.storyboard, () => this._buildRoom(room));
        } else {
            this._buildRoom(room);
        }
    },

    /* Per-room combat spawn, called after the storyboard slate is
     * dismissed. Separated from _enterRoom so the slate's tap-to-
     * continue handler has a clean continuation. */
    _buildRoom(room) {
        const game = this._game;
        if (!game) return;
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

    /* Show the full-screen storyboard slate. Fades in, listens for one
     * tap, fades out, then runs the supplied callback. */
    _showStoryboard(sb, onContinue) {
        const host = document.getElementById('breakout-storyboard');
        const tag = document.getElementById('breakout-storyboard-tag');
        const title = document.getElementById('breakout-storyboard-title');
        const body = document.getElementById('breakout-storyboard-body');
        const glyph = document.getElementById('breakout-storyboard-glyph');
        if (!host || !tag || !title || !body) {
            // Element missing — skip straight to the room build.
            if (typeof onContinue === 'function') onContinue();
            return;
        }
        tag.textContent = sb.tag || '';
        title.textContent = sb.title || '';
        body.textContent = sb.body || '';
        // Stamp the per-room glyph SVG. Falls back to the seal if the
        // room hasn't declared one (defensive — every room ships with
        // a glyph in the data).
        if (glyph) {
            const key = sb.glyph || 'seal';
            glyph.innerHTML = GLYPHS[key] || GLYPHS.seal;
        }
        host.style.display = 'flex';
        // Force reflow so the opacity transition fires.
        // eslint-disable-next-line no-unused-expressions
        host.offsetHeight;
        host.classList.add('show');

        const advance = () => {
            host.removeEventListener('click', advance);
            host.classList.remove('show');
            setTimeout(() => {
                host.style.display = 'none';
                if (typeof onContinue === 'function') onContinue();
            }, 380);
        };
        // Small delay so the same tap that closed the previous screen
        // can't immediately advance the slate.
        setTimeout(() => {
            host.addEventListener('click', advance, { once: true });
        }, 350);
    },

    _showWarden(room) {
        const lines = (room && room.warden) || [];
        const line = lines[this._wardenStep] || lines[0] || null;
        if (!line) return;
        // Reuse the existing tutorial-narration pane if present.
        const pane = document.getElementById('tutorial-narration');
        const story = document.getElementById('tutorial-narration-story');
        const action = document.getElementById('tutorial-narration-action');
        const sub = document.getElementById('breakout-warden-sub');
        if (pane) pane.classList.remove('hidden');
        if (story) story.textContent = line.story || '';
        if (action) action.textContent = line.action || '';
        // Warden "system bulletin" — vibrating red sub-line. Empty
        // string clears the subtext (CSS hides empty `:empty`).
        if (sub) sub.textContent = line.sub || '';
    },

    /* Called after the player kills the room's scripted enemy. Advances
     * the room cursor, runs a beat of warden flavour, and opens the
     * next room.
     *
     * Idempotency: a deferred VFX kill (Bomb Bot, lifesteal, reflect,
     * thorns, etc.) can fire `winCombat` a second time on the same
     * dead enemy. The combat-side guard (`_winCombatRunning`) catches
     * most of those, but the BREAKOUT branch resets the flag eagerly
     * to allow the next room's combat to proceed — leaving a small
     * window where a second `onCombatWin` could double-advance the
     * room cursor. The `_advancing` latch closes that window. */
    onCombatWin() {
        if (!this._active) return;
        if (this._advancing) return;
        this._advancing = true;
        const game = this._game;
        const room = roomFor(this._roomIdx, game && game.player && game.player.classId);
        // Last room = guardian → grant relic + finish.
        if (room && room.id === 'guardian') {
            this._advancing = false;
            this._finish();
            return;
        }
        this._roomIdx++;
        // Brief delay so the kill VFX lands before the next spawn.
        setTimeout(() => {
            this._advancing = false;
            // Defensive: a state change during the timeout (e.g.
            // selectClass re-entry, manual skip) could deactivate the
            // flow. Don't spawn a room into a dead controller.
            if (!this._active) return;
            this._enterRoom();
        }, 600);
    },

    /* Called when the player's HP hits 0 inside a breakout room. The
     * fight should never be lost — we restore HP, reset the room, and
     * print a Warden ribbing line. */
    onPlayerWouldDie() {
        const game = this._game;
        if (!game || !game.player || !this._active) return;
        game.player.currentHp = Math.max(1, Math.floor(game.player.maxHp * 0.5));
        // Re-spawn the same room so the player can try again. Keeps run
        // intact (no death cinematic, no GAMEOVER state).
        const pane = document.getElementById('tutorial-narration');
        const story = document.getElementById('tutorial-narration-story');
        const action = document.getElementById('tutorial-narration-action');
        const sub = document.getElementById('breakout-warden-sub');
        if (story) story.textContent = 'The cage holds. Try again — there is no penalty here.';
        if (action) action.textContent = 'Resetting room...';
        if (sub) sub.textContent = 'CONTAINMENT FAILSAFE · RESPAWN AUTHORIZED';
        if (pane) pane.classList.remove('hidden');
        setTimeout(() => {
            // Defensive: if the controller was deactivated during the
            // delay (e.g. user skipped, app backgrounded + lifecycle
            // restarted), don't spawn a room into stale state.
            if (!this._active) return;
            this._enterRoom();
        }, 900);
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
        try { document.body.classList.remove('breakout-active'); } catch (_) {}
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
