/* Sector 0 — The Breakout
 *
 * A scripted, hand-authored prologue that replaces the legacy auto-tutorial
 * for first-time players. Five short combats, each one a multi-beat
 * teaching sequence (intro → spotlight intent → spotlight die → wait for
 * action → spotlight next → resolve). On completion the player is granted
 * the Cellkey Shard relic and dropped into Sector 1 with their selected
 * class.
 *
 * Sequence model
 * --------------
 * Each room declares a `sequence: [...]` of beats. Each beat is:
 *   {
 *     story:   warden voice (one-line lore framing, optional)
 *     action:  imperative instruction (the one-liner the player obeys)
 *     sub:     vibrating red "system bulletin" line (optional)
 *     spot:    spotlight target ('enemy' | 'enemy_intent' | 'player' |
 *              'die:attack' | 'die:defend' | 'die:mana' | 'die:minion' |
 *              'die:signature' | 'reroll' | 'end_turn' | null)
 *     wait:    advancement trigger ('tap' | 'die_used' |
 *              'die_used:attack/defend/mana/minion/signature' |
 *              'reroll' | 'enemy_turn' | 'enemy_dies' | null)
 *     autoMs:  optional auto-advance after N ms regardless of wait
 *   }
 *
 * The controller runs beats in order. When a beat's `wait` condition is
 * met (Game calls Breakout.notify(event, data)), it advances. The final
 * beat usually waits for `enemy_dies` so the room ends with the kill.
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
            hp: 21,
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
            body: 'You wake up inside a holographic cell. A surveillance drone hovers at the bars and locks on. It will strike next turn. Read its intent and decide: shield first, or burn it before it fires.',
            glyph: 'drone'
        },
        sequence: [
            {
                story: 'The red icon above its head is its INTENT. What it will do next turn.',
                action: 'STRIKE 5 means the drone will deal 5 damage to you next turn.',
                sub: 'INTENT TELEMETRY ENABLED',
                spot: 'enemy_intent',
                wait: 'tap'
            },
            // ── ATTACK QTE TEACHING ──
            // Two-beat split: a "tell" (tap-advance) explaining the
            // timing ring, then a "do" (drag the die) so the player
            // reads the rule before the action happens.
            {
                story: 'When you ATTACK, a TIMING RING appears on the target.',
                action: 'Tap inside the GREEN INNER ZONE the moment the ring lands. PERFECT timing = CRITICAL HIT (+60% damage).',
                sub: 'TIMING PROTOCOL · CRITICAL WINDOW',
                spot: 'enemy',
                wait: 'tap'
            },
            {
                story: 'Drag the ATTACK die now. A ring will shrink. Tap GREEN to crit.',
                action: 'Drag the ATTACK die ONTO the drone.',
                sub: 'OFFENSIVE PROTOCOL · STRIKE AUTHORIZED',
                spot: 'die:attack',
                wait: 'die_used:attack'
            },
            // ── DEFEND TEACHING ──
            {
                story: 'SHIELD adds Shield Points. They absorb the next hit before HP.',
                action: 'Drag the SHIELD die ONTO YOURSELF (the player at the bottom).',
                sub: 'DEFENSIVE PROTOCOL · ARMOUR ACTIVE',
                spot: 'die:defend',
                wait: 'die_used:defend'
            },
            // ── DEFEND QTE / PARRY TEACHING ──
            // Read this BEFORE pressing END TURN so the player is
            // primed to tap when the parry ring appears. The defend
            // QTE only fires during the enemy phase.
            {
                story: 'When you END TURN, the drone will strike. A RING will appear ON YOU.',
                action: 'Tap inside the GREEN ZONE to PARRY. Halves the hit AND reflects 50% damage back.',
                sub: 'PARRY PROTOCOL · COUNTER-WINDOW',
                spot: 'player',
                wait: 'tap'
            },
            {
                story: 'Press END TURN now. Watch for the parry ring on yourself. Tap green.',
                action: 'Press the END TURN button on the right.',
                sub: 'YIELD TO ENEMY · STAY ALERT',
                spot: 'end_turn',
                wait: 'enemy_turn'
            },
            // ── FINISH ──
            {
                story: 'You parried. Now drop the drone.',
                action: 'ATTACK to finish. Time the ring again for a critical kill.',
                sub: 'TARGET DEGRADED · TERMINATE',
                spot: null,
                wait: 'enemy_dies'
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
            hp: 33,
            dmg: 4,
            shape: 'spider',
            radius: 90
        },
        intents: [
            // Order matters: SPAWN BROOD on turn 1 so the icon the player
            // reads in beat 0 (intent telegraph) matches the narration
            // ("the hive will summon a minion this turn"). After it
            // spawns the brood, both the parent and the minion attack.
            { type: 'summon', val: 0, label: 'SPAWN BROOD' },
            { type: 'attack', val: 4, label: 'STRIKE 4' },
            { type: 'attack', val: 4, label: 'STRIKE 4' }
        ],
        diceFn: (classId) => {
            const cd = classDice(classId);
            return [cd.mana, cd.minion, cd.attack];
        },
        storyboard: {
            tag: 'CORRIDOR · NESTING SHAFT',
            title: 'HIVE FRAGMENT',
            body: 'The drone\'s death rouses something deeper. A hive-fragment crawls from a service shaft. Armoured legs, a swarmling already breaking out of its underbelly. Plant a minion of your own; let it eat the brood while you strike the parent.',
            glyph: 'hive'
        },
        sequence: [
            {
                story: 'The hive\'s intent is SPAWN BROOD. When you end your turn it will summon a minion of its own.',
                action: 'Read the intent. You will face two enemies soon.',
                sub: 'INFESTATION INCOMING',
                spot: 'enemy_intent',
                wait: 'tap'
            },
            {
                story: 'MANA dice charge your reserves. Skill and signature dice spend mana.',
                action: 'Drag the MANA die ONTO YOURSELF. Watch your mana pip fill.',
                sub: 'MANA STREAM · ELEVATED',
                spot: 'die:mana',
                wait: 'die_used:mana'
            },
            {
                story: 'MINION dice summon a minion on your side. It absorbs hits and attacks back.',
                action: 'Drag the MINION die ONTO empty space.',
                sub: 'MINION DEPLOYMENT AUTHORIZED',
                spot: 'die:minion',
                wait: 'die_used:minion'
            },
            {
                story: 'The hive is the threat. Strike the parent before the brood arrives.',
                action: 'Drag ATTACK ONTO the hive (top of screen).',
                sub: 'TARGET PRIMARY: HIVE PARENT',
                spot: 'die:attack',
                wait: 'die_used:attack'
            },
            {
                story: 'End the turn. Your minion will fight while the hive spawns its brood.',
                action: 'Press END TURN.',
                sub: 'TURN PHASE · MINION DEPLOYED',
                spot: 'end_turn',
                wait: 'enemy_turn'
            },
            {
                story: 'Multiple enemies on the field. ATTACK dice can target either one.',
                action: 'Finish the hive. Drop them both.',
                sub: 'CLEANUP PROTOCOL ACTIVE',
                spot: null,
                wait: 'enemy_dies'
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
            hp: 39,
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
            body: 'A cipher unit phases out of the wall. Half-corrupted, half-spider. Its first move applies WEAK (you deal 50% less damage). Its second is an EXECUTE-class strike. Time the parry on the heavy swing.',
            glyph: 'glitch'
        },
        sequence: [
            {
                story: 'CIPHER WAVE applies the WEAK status. Your damage drops 50% for two turns.',
                action: 'Status icons appear above your HP bar. Long-press one for details.',
                sub: 'STATUS DECAY · WEAK INCOMING',
                spot: 'enemy_intent',
                wait: 'tap'
            },
            {
                story: 'SHIELD blunts the wave damage. The WEAK debuff still applies.',
                action: 'Drag the SHIELD die ONTO YOURSELF, then end turn.',
                sub: 'STATUS RESIST · DEFENSIVE ACTIVE',
                spot: 'die:defend',
                wait: 'die_used:defend'
            },
            {
                story: 'End the turn. The cipher wave hits, then it loads EXECUTE 12.',
                action: 'Press END TURN.',
                sub: 'TURN PHASE · CYCLE',
                spot: 'end_turn',
                wait: 'enemy_turn'
            },
            {
                story: 'EXECUTE 12 incoming. Use what you learned. SHIELD up, then PARRY the ring on yourself.',
                action: 'Defend the EXECUTE. Then ATTACK while WEAK fades.',
                sub: 'EXECUTE INCOMING · PARRY THE RING',
                spot: 'die:defend',
                wait: 'enemy_dies'
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
            hp: 120,
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
            body: 'The cell wall fractures. Light pours through the seams. The CAGE GUARDIAN steps through the breach. The Warden\'s lieutenant. Hulking, plated, slow but devastating. Use everything: shield through plating turns, strike through gaps, parry the executes.',
            glyph: 'seal'
        },
        sequence: [
            {
                story: 'The Guardian rotates four moves: STRIKE, PLATING, EXECUTE, BARRAGE.',
                action: 'Read its intent every turn. The icon tells you exactly what is coming.',
                sub: 'BOSS ENCOUNTER · CAGE GUARDIAN',
                spot: 'enemy_intent',
                wait: 'tap'
            },
            {
                story: 'You now roll a NATURAL HAND. The dice are class-mixed, not forced.',
                action: 'You can REROLL bad hands. Tap the dial on the left to cycle dice.',
                sub: 'REROLL ENABLED · TWO PER TURN',
                spot: 'reroll',
                wait: 'tap'
            },
            {
                story: 'Diamond pips above your HP track MOMENTUM. Combos, perfect parries and crits fill them.',
                action: 'At 6 pips, APEX READY appears. Your next attack deals x1.5 damage.',
                sub: 'MOMENTUM PROTOCOL · COMBO BONUS',
                spot: 'player',
                wait: 'tap'
            },
            {
                story: 'Free combat now. Shield the EXECUTE. Strike between PLATING turns.',
                action: 'Drop the Guardian. Use everything you have learned.',
                sub: 'CONTAINMENT BREACH · TERMINATE',
                spot: null,
                wait: 'enemy_dies',
                // Cage Guardian fight is the only room where the trailing
                // narration auto-hides — the boss takes many turns and
                // the panel was occluding the action through the whole
                // fight. Earlier teaching rooms keep their final text up
                // until the enemy actually dies (combats are short and
                // the player benefits from re-reading the instruction).
                hideAfterMs: 5000
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
        enemy:  { name: 'WOUNDED HUNTER', hp: 33, dmg: 7, shape: 'spider', radius: 80 },
        intents: [{ type: 'attack', val: 7, label: 'STRIKE 7' }],
        storyboard: {
            tag: 'BLOCK 7 · SHADOWED WING',
            title: 'WOUNDED HUNTER',
            body: 'A scout-unit limps through the corridor. Already bleeding from someone else\'s pass. The BITE die heals you for 3 every time it lands. The Bloodstalker\'s fantasy: trade HP and come out richer for it.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.attack, cd.defend],
        sequence: [
            {
                story: 'Your SIGNATURE die is gold. For the Bloodstalker, that is BITE.',
                action: 'BITE deals 8 damage AND heals you 3 HP every time it lands.',
                sub: 'BLOODSTALKER PROTOCOL · LIFESIPHON DETECTED',
                spot: 'die:signature',
                wait: 'tap'
            },
            {
                story: 'Drag BITE onto the hunter. Trade HP. And come out richer.',
                action: 'Cast BITE on the wounded hunter.',
                sub: 'TARGET: WOUNDED · LIFESIPHON ARMED',
                spot: 'die:signature',
                wait: 'die_used'
            },
            {
                story: 'Defend the strike, then finish the hunter.',
                action: 'SHIELD up. Then ATTACK to drop the kill.',
                sub: 'TERMINATE · BLEED DETECTED',
                spot: null,
                wait: 'enemy_dies'
            }
        ]
    },
    arcanist: {
        // Spark (SIG_ARC_1) — 6 dmg + 1 mana. Enemy with a small HP
        // pool but high damage so the mana-positive cycle matters.
        enemy:  { name: 'CORRUPTED PROCESS', hp: 27, dmg: 9, shape: 'drone', radius: 80 },
        intents: [{ type: 'attack', val: 9, label: 'CORRUPT 9' }],
        storyboard: {
            tag: 'DATA-VAULT 4',
            title: 'CORRUPTED PROCESS',
            body: 'Glyphs flicker against the wall. The SPARK die deals damage AND refunds a mana. The Arcanist\'s fantasy: every cast feeds the next. Strike, refill, strike again.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.defend, cd.mana],
        sequence: [
            {
                story: 'Your SIGNATURE die is gold. For the Arcanist, that is SPARK.',
                action: 'SPARK deals 6 damage AND refunds 1 mana every cast.',
                sub: 'ARCANIST PROTOCOL · MANA LOOP STABILIZED',
                spot: 'die:signature',
                wait: 'tap'
            },
            {
                story: 'Cast SPARK on the corrupted process. Watch the mana pip refill.',
                action: 'Drag SPARK onto the enemy.',
                sub: 'GLYPH IGNITION · CYCLING',
                spot: 'die:signature',
                wait: 'die_used'
            },
            {
                story: 'It will hit hard. Defend the strike, then chain another SPARK next turn.',
                action: 'SHIELD yourself. End turn. Then strike again.',
                sub: 'PROTOCOL CYCLE · DEFEND',
                spot: 'die:defend',
                wait: 'enemy_dies'
            }
        ]
    },
    sentinel: {
        // Bash (SIG_SENT_1) — 10 shield + 4 dmg. Enemy is a multi-hit
        // turret so the shield gain matters: the BASH die is the
        // wall, not just a hit.
        enemy:  { name: 'BARRAGE TURRET', hp: 36, dmg: 4, shape: 'tank', radius: 95 },
        intents: [{ type: 'multi_attack', val: 4, hits: 3, label: 'BARRAGE x3' }],
        storyboard: {
            tag: 'CORRIDOR · BARRAGE LANE',
            title: 'BARRAGE TURRET',
            body: 'A wall-mounted turret loads a three-shot barrage. The BASH die grants shield AND deals damage. The Sentinel\'s fantasy: every swing is also a wall.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.defend, cd.attack],
        sequence: [
            {
                story: 'Your SIGNATURE die is gold. For the Sentinel, that is BASH.',
                action: 'BASH grants 10 SHIELD AND deals 4 damage in one play.',
                sub: 'SENTINEL PROTOCOL · KINETIC PLATING',
                spot: 'die:signature',
                wait: 'tap'
            },
            {
                story: 'Drag BASH onto the turret. The shield will eat the barrage.',
                action: 'Cast BASH first.',
                sub: 'TARGET: BARRAGE TURRET · WALL ARMED',
                spot: 'die:signature',
                wait: 'die_used'
            },
            {
                story: 'Stack a second SHIELD die for the multi-hit barrage.',
                action: 'DEFEND for the chained strikes. End turn.',
                sub: 'BARRAGE INCOMING · PLATES STACKING',
                spot: 'die:defend',
                wait: 'enemy_dies'
            }
        ]
    },
    annihilator: {
        // Blast (SIG_ANNI_1) — 12 dmg, ignore shield. Enemy carries
        // shield so the armor-pierce reads.
        enemy:  { name: 'PLATED GUARD', hp: 27, dmg: 6, shield: 12, shape: 'tank', radius: 90 },
        intents: [{ type: 'attack', val: 6, label: 'STRIKE 6' }],
        storyboard: {
            tag: 'FOUNDRY ANNEX',
            title: 'PLATED GUARD',
            body: 'A guard-unit drops, plated to the eyes. Normal hits stop on the shield. The BLAST die ignores it entirely. The Annihilator\'s fantasy: armour is for other people.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.attack, cd.defend],
        sequence: [
            {
                story: 'Your SIGNATURE die is gold. For the Annihilator, that is BLAST.',
                action: 'BLAST deals 12 damage AND ignores enemy SHIELD entirely.',
                sub: 'ANNIHILATOR PROTOCOL · ARMOR PIERCING',
                spot: 'die:signature',
                wait: 'tap'
            },
            {
                story: 'The Plated Guard has 12 SHIELD. Normal hits stop on it. BLAST does not.',
                action: 'Drag BLAST onto the plated guard. Watch the shield drop to zero.',
                sub: 'TARGET: PLATED · ARMOR BREACH AUTHORIZED',
                spot: 'die:signature',
                wait: 'die_used'
            },
            {
                story: 'Plate down. Finish it.',
                action: 'ATTACK to finish. SHIELD if it hits hard.',
                sub: 'PLATE NEUTRALIZED · TERMINATE',
                spot: null,
                wait: 'enemy_dies'
            }
        ]
    },
    tactician: {
        // Volley (SIG_TACT_1) — 7 dmg + 1 reroll next turn. Enemy
        // with two-turn structure so the next-turn reroll matters.
        enemy:  { name: 'PROTOCOL OFFICER', hp: 33, dmg: 5, shape: 'drone', radius: 80 },
        intents: [{ type: 'attack', val: 5, label: 'STRIKE 5' }],
        storyboard: {
            tag: 'COMMAND VESTIBULE',
            title: 'PROTOCOL OFFICER',
            body: 'A planner-unit reads the Tactician like a bad hand. The VOLLEY die deals damage AND grants a reroll next turn. The Tactician\'s fantasy: every move is also a setup for the next.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.defend, cd.attack],
        sequence: [
            {
                story: 'Your SIGNATURE die is gold. For the Tactician, that is VOLLEY.',
                action: 'VOLLEY deals 7 damage AND grants +1 REROLL next turn.',
                sub: 'TACTICIAN PROTOCOL · TEMPO LOOP',
                spot: 'die:signature',
                wait: 'tap'
            },
            {
                story: 'Cast VOLLEY now. The bonus reroll banks for your next hand.',
                action: 'Drag VOLLEY onto the protocol officer.',
                sub: 'TARGET: PROTOCOL · TEMPO ARMED',
                spot: 'die:signature',
                wait: 'die_used'
            },
            {
                story: 'Defend, end turn, then use the bonus reroll to find the kill shot.',
                action: 'SHIELD up. End turn. Then REROLL to chase another VOLLEY.',
                sub: 'CYCLE STABLE · ROLL FOR KILL',
                spot: 'die:defend',
                wait: 'enemy_dies'
            }
        ]
    },
    summoner: {
        // Call (SIG_SUM_1) — summon a spirit + 4 dmg. Enemy is a
        // swarm-spawner so two minion bodies on the field is the
        // play.
        enemy:  { name: 'SWARM AGITATOR', hp: 33, dmg: 5, shape: 'spider', radius: 90 },
        intents: [{ type: 'attack', val: 5, label: 'STRIKE 5' }],
        storyboard: {
            tag: 'SACRED HOLLOW',
            title: 'SWARM AGITATOR',
            body: 'The cell wall thins around root-veins. The CALL die plants a spirit AND strikes. The Summoner\'s fantasy: never fight alone.',
            glyph: 'crest'
        },
        diceFn: (cd) => ['SIGNATURE', cd.minion, cd.attack],
        sequence: [
            {
                story: 'Your SIGNATURE die is gold. For the Summoner, that is CALL.',
                action: 'CALL summons a spirit AND deals 4 damage in one play.',
                sub: 'SUMMONER PROTOCOL · GROVE SIGNAL',
                spot: 'die:signature',
                wait: 'tap'
            },
            {
                story: 'Cast CALL on the agitator. A spirit appears beside you.',
                action: 'Drag CALL onto the swarm agitator.',
                sub: 'TARGET: AGITATOR · SPIRIT INBOUND',
                spot: 'die:signature',
                wait: 'die_used'
            },
            {
                story: 'Two on the field now. Your spirit fights with you.',
                action: 'MINION die plants another. ATTACK to finish.',
                sub: 'GROVE EXPANDING · TERMINATE',
                spot: null,
                wait: 'enemy_dies'
            }
        ]
    }
};

// Generic Room 3 fallback (in case classId is unknown).
const ROOM_3_FALLBACK = {
    enemy: { name: 'CELL CAPTAIN', hp: 27, dmg: 4 },
    intents: [{ type: 'attack', val: 4, label: 'STRIKE 4' }],
    diceFn: (cd) => [cd.attack, cd.attack],
    warden: [{
        story: 'Practise your signature. Land a clean two-strike.',
        action: 'Play both attack dice. Time the second so it crits.'
    }]
};

// Per-class flavour line played on completion of the Cage Guardian.
// Lines must avoid implying mid-run state (HP, shield, mana, modules,
// etc.) carries forward — the run starts fresh in Sector 1.
const CLASS_OUTRO = {
    bloodstalker: 'The hunter has the cage\'s scent now. Go finish what it started.',
    arcanist:    'The glyphs are older than the Warden. Sector 1 will feel them too.',
    sentinel:    'The Panopticon watches. Let it watch a wall it cannot break.',
    annihilator: 'You did not break the cage. You denied it ever existed.',
    tactician:   'Now you have data. The Panopticon hates patterns it didn\'t write.',
    summoner:    'The seedling escaped its plot. The grove is older than steel.'
};

// Per-class teaching beat for the player's class ability widget. Played
// in the Cage Guardian sequence so the player learns their class loop
// before leaving the prologue. Each entry is one beat; the controller
// inserts it at a fixed position in the boss sequence.
const CLASS_GLYPH_BEAT = {
    tactician: {
        story: 'TACTICS — your widget tracks 3 pips. Spend dice to fill.',
        action: 'When all 3 pips light, tap the widget to pick a bonus: REROLL, SHIELD, or DAMAGE.',
        sub: 'TACTICIAN PROTOCOL · TEMPO READY',
        spot: 'class_widget',
        wait: 'tap'
    },
    annihilator: {
        story: 'OVERHEAT — every die heats your reactor. Watch the meter.',
        action: 'Tap the widget in the YELLOW zone for x1.4 next attack, RED zone for an AoE blast.',
        sub: 'ANNIHILATOR PROTOCOL · CORE REACTIVE',
        spot: 'class_widget',
        wait: 'tap'
    },
    bloodstalker: {
        story: 'BLOOD POOL — damage you take fills it. The cost is the price.',
        action: 'Tap a tribute on the widget to spend HP for: REROLL, ATTACK + BLEED, or GRAND STRIKE.',
        sub: 'BLOODSTALKER PROTOCOL · TRIBUTE READY',
        spot: 'class_widget',
        wait: 'tap'
    },
    sentinel: {
        story: 'AEGIS PLATES — every shield you gain stacks one plate.',
        action: 'At 3 plates, tap the widget to PRIME. Next enemy attack is fully nullified.',
        sub: 'SENTINEL PROTOCOL · PLATING ACTIVE',
        spot: 'class_widget',
        wait: 'tap'
    },
    arcanist: {
        story: 'GLYPH CYCLE — Fire, Ice, Lightning rotate on your widget.',
        action: 'Play a die when its glyph is lit for a bonus effect. One per turn.',
        sub: 'ARCANIST PROTOCOL · GLYPH ATTUNED',
        spot: 'class_widget',
        wait: 'tap'
    },
    summoner: {
        story: 'SACRED GROVE — 4 plots below your dice. Each summon blooms a plot.',
        action: 'Tap a bloomed plot for a free Spirit. Fill the canopy for APEX (x2 minions).',
        sub: 'SUMMONER PROTOCOL · GROVE ATTUNED',
        spot: 'class_widget',
        wait: 'tap'
    }
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
            sequence: spec.sequence || [{
                story: 'Practise your class signature.',
                action: 'Use your dice to drop the enemy.',
                sub: '',
                spot: null,
                wait: 'enemy_dies'
            }]
        };
    }
    // Cage Guardian — splice in the per-class GLYPH/WIDGET teaching beat
    // before the free-combat outro. Player has already used their
    // signature die in Room 4; the Cage Guardian fight is the right
    // moment to teach their persistent class widget (Tactic Pips,
    // Overheat reactor, Sacred Grove, etc.) since they'll need it
    // for the rest of the run.
    if (r.id === 'guardian') {
        const glyphBeat = CLASS_GLYPH_BEAT[classId];
        if (!glyphBeat) return r;
        const seq = r.sequence.slice();
        // Insert just before the final free-combat beat (last beat).
        seq.splice(seq.length - 1, 0, glyphBeat);
        return Object.assign({}, r, { sequence: seq });
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
        // Tap-advance — beats with `wait: 'tap'` arm `_tapAdvanceArmed`
        // so any pointerdown anywhere on the screen advances. Listener
        // is installed once for the lifetime of the breakout, removed
        // in _finish/skip. Capture phase so it sees the event before
        // child handlers (the dice tray's drag handler will still fire
        // if the player drags a die — that's covered by die_used:slot
        // beat advance).
        if (!this._tapHandler) {
            this._tapHandler = (e) => {
                if (!this._active || !this._tapAdvanceArmed) return;
                // Don't steal taps from the storyboard slate (it has
                // its own click handler).
                if (e.target && e.target.closest && e.target.closest('#breakout-storyboard')) return;
                // CRITICAL: when a QTE is in flight, the player's tap
                // is for the QTE (crit/parry timing), NOT for advancing
                // the tutorial. Without this guard the QTE tap would
                // also pop the next teaching beat — players miss reading
                // the next instruction because it switched mid-tap.
                const g = this._game;
                if (g && g.qte && g.qte.active) return;
                this._tapAdvanceArmed = false;
                this._advanceBeat();
            };
            document.addEventListener('pointerdown', this._tapHandler, true);
        }
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
        // Drop the global tap-advance listener so menu/map taps after
        // the breakout don't accidentally pulse a stale advance.
        if (this._tapHandler) {
            try { document.removeEventListener('pointerdown', this._tapHandler, true); } catch (_) {}
            this._tapHandler = null;
        }
        this._setSpotlight(null);
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
            // Pass the player's classId so the room.diceFn(classId) →
            // classDice(classId) lookup resolves to the right class
            // dice. Without this, classId was undefined inside the
            // generic room diceFns and `classDice` fell through to its
            // TAC_* default, so non-Tactician players saw Tactician
            // dice through the entire prologue. (Class-fantasy room is
            // unaffected — its diceFn is wrapped in roomFor with the
            // classId already closed over.)
            const cid = game.player && game.player.classId;
            const types = (room.diceFn(cid) || []).map((t, i) => safeType(t, i === 0 ? 'TAC_ATTACK' : 'TAC_DEFEND'));
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

        // Sequenced teaching beats — drives the per-step narration +
        // spotlight + waitFor advancement.
        this._room = room;
        this._beatIdx = 0;
        this._tapAdvanceArmed = false;

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

        // Run the first beat AFTER the combat is built so spotlights
        // can resolve to real entity/DOM positions.
        this._runBeat(0);
    },

    /* ────────────────────────────────────────────────────────────────
     * SEQUENCE RUNNER
     * ────────────────────────────────────────────────────────────────
     *
     * _runBeat(idx) — show beat N's narration, place its spotlight,
     * arm its wait condition. notify() drains the wait condition and
     * advances when matched. */
    _runBeat(idx) {
        if (!this._active || !this._room) return;
        const seq = this._room.sequence;
        if (!Array.isArray(seq) || seq.length === 0) return;
        if (idx >= seq.length) return; // sequence ended; combat continues
        this._beatIdx = idx;
        const beat = seq[idx];
        // Render warden text from beat fields (story / action / sub).
        const pane = document.getElementById('tutorial-narration');
        const story = document.getElementById('tutorial-narration-story');
        const action = document.getElementById('tutorial-narration-action');
        const sub = document.getElementById('breakout-warden-sub');
        const tapHint = document.getElementById('breakout-tap-hint');
        if (pane) pane.classList.remove('hidden');
        if (story) story.textContent = beat.story || '';
        if (action) action.textContent = beat.action || '';
        if (sub) sub.textContent = beat.sub || '';
        // Tap-to-continue hint — only when the beat waits on a tap.
        // Other waits (die_used, enemy_turn, enemy_dies) advance from
        // gameplay actions, so a tap prompt would be misleading.
        if (tapHint) tapHint.classList.toggle('show', beat.wait === 'tap');
        // Spotlight placement.
        this._setSpotlight(beat.spot || null);
        // Tap-advance arming. Disarm immediately, then re-arm after a
        // 600ms grace window. Without this, the trailing tap from the
        // previous beat (a die-drop, a QTE tap, or even the storyboard
        // dismiss) would land BEFORE the player has read the new beat
        // and instantly advance again — the tutorial felt like it was
        // racing past instructions.
        this._tapAdvanceArmed = false;
        if (beat.wait === 'tap') {
            setTimeout(() => {
                if (this._active && this._beatIdx === idx) this._tapAdvanceArmed = true;
            }, 600);
        }
        // Optional auto-advance (used for purely cinematic beats).
        if (typeof beat.autoMs === 'number' && beat.autoMs > 0) {
            setTimeout(() => {
                if (this._active && this._beatIdx === idx) this._advanceBeat();
            }, beat.autoMs);
        }
        // Optional per-beat auto-hide. Opt-in via `hideAfterMs: N` in
        // the room data. Used only on the Cage Guardian's free-combat
        // beat where the boss fight runs many turns and the trailing
        // narration would otherwise obstruct the view through the
        // entire encounter. Earlier teaching rooms leave their final
        // text up — combats are short and the player benefits from
        // re-reading the instruction.
        const hideMs = (typeof beat.hideAfterMs === 'number') ? beat.hideAfterMs : 0;
        if (hideMs > 0) {
            setTimeout(() => {
                if (!this._active || this._beatIdx !== idx) return;
                const p = document.getElementById('tutorial-narration');
                if (p) p.classList.add('hidden');
                this._setSpotlight(null);
            }, hideMs);
        }
    },

    _advanceBeat() {
        if (!this._active || !this._room) return;
        this._tapAdvanceArmed = false;
        // Hide tap hint immediately so the prompt doesn't linger after
        // an action-driven advance.
        const tapHint = document.getElementById('breakout-tap-hint');
        if (tapHint) tapHint.classList.remove('show');
        const next = this._beatIdx + 1;
        const seq = this._room.sequence;
        if (next >= seq.length) {
            // Sequence ended — clear spotlight, leave the last beat's
            // text up. Combat continues normally; onCombatWin closes
            // the room when the enemy dies.
            this._setSpotlight(null);
            return;
        }
        this._runBeat(next);
    },

    /* Game-side hook. Called from useDie / rerollDice / endTurn /
     * winCombat with a labelled event. If the current beat's `wait`
     * matches, advance.
     *
     * For die_used events we delay the advance by ~1200ms so the
     * attack/defend QTE has time to resolve before the next beat's
     * narration appears. Without the delay, the player drops a die,
     * sees the panel switch to the next instruction, then notices a
     * QTE ring still shrinking on the previous target — confusing.
     * For other events (reroll, enemy_turn) the action is already
     * complete, so they advance immediately. */
    notify(event, data) {
        if (!this._active || !this._room) return;
        const seq = this._room.sequence;
        if (!Array.isArray(seq)) return;
        // Match against the CURRENT beat first.
        const matchesBeat = (b) => {
            if (!b || !b.wait) return false;
            if (b.wait === event) return true;
            if (event === 'die_used' && data && data.slot && b.wait === ('die_used:' + data.slot)) return true;
            if (event === 'die_used' && data && data.signature && b.wait === 'die_used:signature') return true;
            return false;
        };
        const beat = seq[this._beatIdx];
        if (matchesBeat(beat)) {
            const delayMs = (event === 'die_used') ? 1200 : 0;
            if (delayMs > 0) {
                const expectedIdx = this._beatIdx;
                setTimeout(() => {
                    if (!this._active || this._beatIdx !== expectedIdx) return;
                    this._advanceBeat();
                }, delayMs);
            } else {
                this._advanceBeat();
            }
            return;
        }
        // Out-of-order forgiveness — the player did something this beat
        // didn't expect, but a LATER beat in the sequence is satisfied
        // by the same action (e.g. they played MINION before the
        // tutorial pointed at it). Without this, the tutorial would
        // stall on the unmet beat until combat ended. Scan forward
        // and jump to the matching beat instead. Intermediate beats
        // are silently skipped — the player has demonstrated they
        // understand the action that beat would have taught.
        for (let i = this._beatIdx + 1; i < seq.length; i++) {
            if (matchesBeat(seq[i])) {
                const target = i + 1; // advance PAST the matched beat
                const delayMs = (event === 'die_used') ? 1200 : 0;
                const jump = () => {
                    if (!this._active) return;
                    // Hide tap hint immediately so the prompt doesn't
                    // linger after we skipped past the tap-wait beat.
                    const tapHint = document.getElementById('breakout-tap-hint');
                    if (tapHint) tapHint.classList.remove('show');
                    this._tapAdvanceArmed = false;
                    if (target >= seq.length) {
                        this._beatIdx = seq.length - 1;
                        this._setSpotlight(null);
                    } else {
                        this._runBeat(target);
                    }
                };
                if (delayMs > 0) setTimeout(jump, delayMs);
                else jump();
                return;
            }
        }
    },

    /* Re-apply the current beat's spotlight. Game.renderDiceUI calls
     * this on every dice rebuild so a die-targeted spotlight tracks
     * to the new DOM node (rerolls + turn starts re-render the tray). */
    refreshSpotlight() {
        if (!this._active || !this._room) return;
        const beat = this._room.sequence && this._room.sequence[this._beatIdx];
        if (!beat) return;
        this._setSpotlight(beat.spot || null);
    },

    /* Spotlight target router. Resolves the named target into a screen
     * rect and writes it onto #tutorial-spotlight. Falls back to a
     * hidden state if the target isn't found (e.g. dice tray hasn't
     * rendered yet). */
    _setSpotlight(target) {
        const spotlight = document.getElementById('tutorial-spotlight');
        if (!spotlight) return;
        if (!target) {
            spotlight.classList.add('hidden');
            return;
        }
        const rect = this._resolveSpotTarget(target);
        if (!rect) {
            spotlight.classList.add('hidden');
            return;
        }
        const containerRect = this._gameContainerRect();
        const top  = rect.top  - (containerRect ? containerRect.top  : 0);
        const left = rect.left - (containerRect ? containerRect.left : 0);
        spotlight.style.top = `${top}px`;
        spotlight.style.left = `${left}px`;
        spotlight.style.width = `${rect.width}px`;
        spotlight.style.height = `${rect.height}px`;
        spotlight.style.borderRadius = (target === 'enemy' || target === 'player') ? '50%' : '8px';
        spotlight.classList.remove('hidden');
    },

    _gameContainerRect() {
        const c = document.getElementById('game-container');
        return c ? c.getBoundingClientRect() : null;
    },

    /* Translate a named spotlight target into a screen rect. */
    _resolveSpotTarget(target) {
        const game = this._game;
        // ── Canvas-space targets (enemy + player) ──
        if (target === 'enemy' || target === 'enemy_intent' || target === 'player') {
            const canvas = document.getElementById('gameCanvas');
            if (!canvas || !game) return null;
            const r = canvas.getBoundingClientRect();
            const W = (typeof CONFIG !== 'undefined') ? CONFIG.CANVAS_WIDTH : 1080;
            const H = (typeof CONFIG !== 'undefined') ? CONFIG.CANVAS_HEIGHT : 1920;
            const sx = r.width / W, sy = r.height / H;
            let entity = null;
            if (target === 'player') entity = game.player;
            else                     entity = game.enemy;
            if (!entity) return null;
            const ex = r.left + entity.x * sx;
            const ey = r.top  + entity.y * sy;
            const radius = (entity.radius || 75) * sx;
            if (target === 'enemy_intent') {
                // Centred precisely on the intent icon. The renderer
                // draws the icon at canvas-space (entity.y - radius -
                // 88), so the screen-space y is ey - radius - 88*sx.
                // A 78x78 square frames the icon + its damage label
                // without overshooting onto the HP bar below.
                const iconCanvasOffsetY = 88; // matches drawIntentIcon offset
                const iconY = ey - radius - iconCanvasOffsetY * sx;
                const side = 78;
                return {
                    top: iconY - side / 2,
                    left: ex - side / 2,
                    width: side,
                    height: side
                };
            }
            // enemy / player full-body — circular ring around the entity.
            return { top: ey - radius - 12, left: ex - radius - 12, width: radius * 2 + 24, height: radius * 2 + 24 };
        }
        // ── DOM targets ──
        if (target === 'reroll') {
            const el = document.getElementById('btn-reroll');
            return el ? this._padRect(el.getBoundingClientRect(), 12) : null;
        }
        if (target === 'end_turn') {
            const el = document.getElementById('btn-end-turn');
            return el ? this._padRect(el.getBoundingClientRect(), 12) : null;
        }
        if (target === 'class_widget') {
            const el = document.getElementById('class-ability-widget');
            return el ? this._padRect(el.getBoundingClientRect(), 14) : null;
        }
        if (target && target.indexOf('die:') === 0) {
            // Find a die element in the tray matching the requested
            // slot. The dice are CSS-rotated (crescent arc) so the
            // raw bounding rect is the AXIS-ALIGNED box of the rotated
            // square, slightly larger and offset diagonally. We use
            // the rect's centre + a tight square (slightly smaller
            // than the die's diagonal) so the highlight reads as "on
            // the die" rather than "around a tilted box".
            const slot = target.slice(4); // attack | defend | mana | minion | signature
            const matched = this._findDieElement(slot);
            if (!matched) return null;
            const r = matched.getBoundingClientRect();
            const side = Math.min(r.width, r.height) + 12;
            const cx = r.left + r.width / 2;
            const cy = r.top  + r.height / 2;
            return {
                top:  cy - side / 2,
                left: cx - side / 2,
                width: side,
                height: side
            };
        }
        return null;
    },

    _padRect(r, pad) {
        return {
            top:    r.top    - pad,
            left:   r.left   - pad,
            width:  r.width  + pad * 2,
            height: r.height + pad * 2
        };
    },

    _findDieElement(slot) {
        // Dice are rendered as children of #dice-container. Each die
        // gets `data-slot` set from its DICE_TYPES.slot (attack /
        // defend / mana / minion / skill). Signature dice are tagged
        // separately — the renderer doesn't write a 'signature' slot,
        // so for that case we fall back to scanning dicePool for the
        // isSignature flag and matching by index against the
        // container's children.
        const container = document.getElementById('dice-container');
        if (!container) return null;
        if (slot !== 'signature') {
            const found = container.querySelector(`.die[data-slot="${slot}"]`);
            return found || null;
        }
        // Signature path — match by dicePool index.
        const game = this._game;
        if (!game || !Array.isArray(game.dicePool)) return null;
        for (let i = 0; i < game.dicePool.length; i++) {
            const die = game.dicePool[i];
            if (!die || die.used) continue;
            const isSig = (DICE_TYPES && DICE_TYPES[die.type] && DICE_TYPES[die.type].isSignature) || die.type === 'SIGNATURE';
            if (!isSig) continue;
            // The die element sits inside a `.die-slot` wrapper; the
            // wrappers appear in dicePool order so the i-th die-slot
            // contains the i-th die.
            const slotEl = container.children[i];
            if (slotEl) {
                const dieEl = slotEl.querySelector('.die');
                if (dieEl) return dieEl;
            }
        }
        return null;
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

    /* (Legacy `_showWarden` removed — replaced by `_runBeat()` which
     * drives the same DOM nodes from the room's `sequence` data.) */

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
        if (story) story.textContent = 'The cage holds. Try again. There is no penalty here.';
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
        if (this._tapHandler) {
            try { document.removeEventListener('pointerdown', this._tapHandler, true); } catch (_) {}
            this._tapHandler = null;
        }
        this._setSpotlight(null);
        game._breakoutForcedDice = null;
        game._breakoutScript = null;
        game._inBreakout = false;
        // Cancel any in-flight QTE so a stale qte.active doesn't keep
        // the document-level QTE pointerdown handler intercepting taps
        // on the closing screen / Sector 1 map.
        if (game.qte) game.qte.active = false;
        // Hide the in-combat narration pane immediately. The closing
        // beat lives in a full-screen storyboard slate instead, so
        // the pane lingering on top of the kill cinematic just
        // crowds the moment.
        const pane = document.getElementById('tutorial-narration');
        if (pane) pane.classList.add('hidden');

        // Closing storyboard slate. Replaces the previous "tap the
        // narration pane" handoff which softlocked when the pane's
        // pointer-events state was racy. A full-screen slate with its
        // own dedicated click handler is foolproof and gives the
        // outro line the cinematic moment it deserves before the
        // sector map opens.
        const cid = game.player && game.player.classId;
        const out = CLASS_OUTRO[cid] || 'You are out. The Panopticon is awake. Sector 1 begins.';
        this._showStoryboard({
            tag: 'CONTAINMENT BREACH · ESCAPE',
            title: 'YOU ARE OUT',
            // textContent flattens \n to spaces, so pack the lore
            // into a single readable paragraph.
            body: out + ' The surveillance net has logged your name. Sector 1 begins now.',
            glyph: 'crest'
        }, () => {
            game.sector = 1;
            game.changeState(STATE.MAP);
        });
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
