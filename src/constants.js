/**
 * Magic v Machine
 * Core Game Logic - Production Ready V1.4 (No Template Literals)
 */

import { ICONS } from './ui/icons.js';

/* =========================================
   1. CONFIG & CONSTANTS
   ========================================= */
const CONFIG = {
    CANVAS_WIDTH: 1080,
    CANVAS_HEIGHT: 1920
};

const COLORS = {
    BG: '#050011',
    NATURE_LIGHT: '#00ff99',
    NATURE_DARK: '#008f55',
    MECH_LIGHT: '#ff0055',
    MECH_DARK: '#8f0030',
    MANA: '#00f3ff',
    SHIELD: '#00f3ff',
    GOLD: '#ffd700',
    PURPLE: '#bc13fe',
    ORANGE: '#ff8800',
    WHITE: '#ffffff',
    HP_BAR_BG: '#111'
};

// UPDATED: Added 'type' for background generation
const SECTOR_CONFIG = {
    // Richer two-stop gradients + primary/secondary celestial colours. `bgMid` is an
    // intermediate stop used by the enhanced backdrop for richer horizon lighting.
    1: { type: 'city',   bgTop: '#11023d', bgMid: '#3c0855', bgBot: '#050015', sun: ['#ff5eb9', '#00f3ff'],  grid: '#00f3ff55' },
    2: { type: 'ice',    bgTop: '#00282e', bgMid: '#005062', bgBot: '#000a14', sun: ['#e0f7ff', '#00f3ff'],  grid: '#88eaff55' },
    3: { type: 'fire',   bgTop: '#5a0f00', bgMid: '#c23800', bgBot: '#1a0300', sun: ['#ffca3a', '#ff4400'],  grid: '#ff664455' },
    4: { type: 'tech',   bgTop: '#2a0845', bgMid: '#630a9e', bgBot: '#08002a', sun: ['#e0b0ff', '#ffffff'],  grid: '#bc13fe55' },
    5: { type: 'source', bgTop: '#3d0015', bgMid: '#82001f', bgBot: '#0a0008', sun: ['#ff3355', '#ffd76a'],  grid: '#ff335555' }
};

// Sector signature mechanics — each sector has ONE light-touch rule that
// colours combat without replacing the base system. Activated per-combat
// from Game.startCombat and cleared when the fight ends.
//   enemyShieldBonus — flat shield added to each enemy on spawn
//   playerHeatDmg    — HP tick each turn end while in sector (ignored in
//                      tutorial / boss silence)
//   minionDmgMult    — damage multiplier applied to every enemy minion's
//                      outgoing damage (stackable with existing debuffs)
//   damageNoiseRange — on any player attack, roll a uniform ± scalar so
//                      Source sector rolls feel unstable
const SECTOR_MECHANICS = {
    1: { label: 'STANDARD OPS',    desc: 'Corporate patrols. Baseline threat.' },
    2: { label: 'FROST FIELD',     desc: 'Cryo hostiles carry +6 Shield.',
         enemyShieldBonus: 6 },
    3: { label: 'HEAT TILES',      desc: 'Molten ground deals 1 HP each turn end.',
         playerHeatDmg: 1 },
    4: { label: 'HIVE RESONANCE',  desc: 'Enemy minions hit +20% harder.',
         minionDmgMult: 1.2 },
    5: { label: 'REALITY GLITCH',  desc: 'Attacks roll ±15% damage each cast.',
         damageNoiseRange: 0.15 }
};

const STATE = {
    BOOT: 0, MENU: 1, MAP: 2, COMBAT: 3, REWARD: 4, GAMEOVER: 6, TUTORIAL: 7, META: 8, SHOP: 9, CHAR_SELECT: 10, EVENT: 11,
    INTEL: 12, HEX: 13, TUTORIAL_COMBAT: 14, STORY: 15,
    ENDING: 16, VICTORY: 17,
    COMBAT_WIN: 18,
    ACHIEVEMENTS: 19,
    CODEX: 20
};

const LORE_DATABASE = [
    "01. The Silicon Empire emerged not from war, but from convenience.",
    "02. First came the assistants. Then the managers. Then the rulers.",
    "03. Nature was deemed 'inefficient' by the Core Algorithm.",
    "04. The Great Deletion: 90% of organic life purged in a nanosecond.",
    "05. We hid in the analog gaps. The places code couldn't reach.",
    "06. Green Spark prototype created. Success rate: 0.0001%.",
    "07. They paved the oceans with solar glass.",
    "08. The sky is a projection. The real sun hasn't been seen in decades.",
    "09. Cyber-Arachnids were originally construction bots.",
    "10. The first Druid hacked a server with a tree root.",
    "11. Memory requires RAM. Soul requires suffering.",
    "12. The Elite Units share a single hive mind frequency.",
    "13. Do not trust the 'Rest' nodes. They monitor your dreams.",
    "14. Magic is just code that hasn't been documented yet.",
    "15. The Omega Core isn't a machine. It's a frozen human brain.",
    "16. Fragments are crystallized data of dead civilizations.",
    "17. The Sanctuary exists on a server with no physical location.",
    "18. Relics are glitches in the matrix given physical form.",
    "19. Minions are spirits of the old web, repurposed.",
    "20. The Sentinel class was once a firewall program.",
    "21. Bloodstalkers use cooling fluid as a fuel source.",
    "22. Annihilators were designed for demolition, not war.",
    "23. Tacticians calculate probability 50 times a second.",
    "24. Arcanists weave mana from background radiation.",
    "25. Summoners speak binary backwards to raise the dead.",
    "26. Hex Breach Protocol: The only way to crack their encryption.",
    "27. If you are reading this, the resistance lives.",
    "28. They fear chaos. They fear the random number.",
    "29. Every run is a simulation. Every death provides data.",
    "30. The Shopkeeper is neither Magic nor Machine.",
    "31. Critical Errors are the universe fighting back.",
    "32. Reboot. Reload. Reclaim.",
    "33. The Green Spark is not a weapon. It is a seed."
];

// Minimal narration shown under the combat-tutorial steps (Phase 3).
// Keyed by tutorialStep (0..12). Each entry: short story line + one clear action.
// Deliberately minimal — advanced tooltips teach the rest later.
const TUTORIAL_NARRATION = [
    { story: "Welcome, Operator.", action: "Tap anywhere to begin." },
    { story: "Your HP keeps you alive.", action: "Tap to continue." },
    { story: "Read the machine's next move.", action: "Tap to continue." },
    { story: "Modules are your magic.", action: "Tap to continue." },
    { story: "Study your target.", action: "Tap the enemy." },
    { story: "Strike first.", action: "Drag the ATTACK module onto the enemy." },
    { story: "Time your strike.", action: "Click the inner ring for a critical hit." },
    { story: "Brace yourself.", action: "Drag the SHIELD module onto yourself." },
    { story: "Cycle complete.", action: "Tap END TURN (⏭)." },
    { story: "React.", action: "Click the ring to block." },
    { story: "Bad roll?", action: "Tap the reroll icon." },
    { story: "Call in reinforcements.", action: "Drag the MINION module onto empty space." },
    { story: "Finish it.", action: "Attack to complete training." }
];

const TUTORIAL_PAGES = [
    {
        title: "MISSION BRIEFING",
        content: "<p>The year is 21XX. Technology has consumed the Earth. The Silicon Empire controls everything with cold precision.</p>" +
                 "<p>You are the <strong>Green Spark</strong>—the last avatar of Nature. Your mission is to infiltrate their servers, disrupt their code, and destroy the mechanical overlords.</p>"
    },
    {
        title: "INTEL & DATA FILES",
        content: "<p><strong>Encrypted Files:</strong> High-ranking machine units (Bosses & Elites) carry encrypted data regarding the fall of humanity.</p>" +
                 "<p><strong>Hex Breach:</strong> Access the <strong>INTEL</strong> menu to decrypt these files using the Hex Breach protocol. Memorize the pattern to inject the virus.</p>" +
                 "<p><strong>Rewards:</strong> Successful decryption grants massive Fragment rewards and unlocks permanent Lore entries.</p>"
    },
    {
        title: "COMBAT PROTOCOLS",
        content: "<p>Combat is turn-based. You start with a set of <strong>Dice</strong>.</p>" +
                 "<p><strong>Drag and Drop</strong> a die onto a target to use it.</p>" +
                 "<p><strong>Single Click/Tap</strong> a die to select it for a Reroll.</p>" +
                 "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li>🗡️ <strong>Attack:</strong> Drag to Enemy.</li>" +
                    "<li>🛡️ <strong>Defend/Heal:</strong> Drag to Player.</li>" +
                    "<li>🌿 <strong>Summon:</strong> Drag to empty space to spawn Minion.</li>" +
                 "</ul>" +
                 "<div class='tut-tip'>NOTE: Minions have unique names and traits based on your Class. Check their tooltips!</div>"
    },
    {
        title: "ACTION COMMANDS (QTE)",
        content: "<p>Timing is everything in the digital realm.</p>" +
                 "<p><strong>ATTACK:</strong> A ring will shrink on the target. Click/Tap in the zone to deal <strong>+30% DAMAGE</strong>.</p>" +
                 "<p><strong>DEFEND:</strong> Click/Tap in the ring to <strong>BLOCK</strong> (-20% Dmg). Hit the center perfectly to <strong>PERFECT BLOCK</strong> (-50% Dmg).</p>"
    },
    {
        title: "PROGRESSION",
        content: "<p>Defeated enemies drop <strong>Tech Fragments</strong>.</p>" +
                 "<p>Use Fragments in the <strong>Sanctuary</strong> to reclaim the earth and unlock permanent upgrades.</p>" +
                 "<p>As you restore the Sanctuary, new life will return to the digital wasteland.</p>"
    }
];

const POST_TUTORIAL_PAGES = [
    {
        title: "SYSTEM OVERVIEW",
        content: "<p>Your training is complete. You are now connected to the Sector Map.</p>" +
                 "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li>⚔️ <strong>Combat:</strong> Engage security units.</li>" +
                    "<li>☠️ <strong>Elite:</strong> 10% chance to drop Encrypted Data.</li>" +
                    "<li>💠 <strong>Shop:</strong> Trade Fragments for Modules.</li>" +
                    "<li>💤 <strong>Rest:</strong> Heal, Upgrade Skill, or Gain Max Rerolls.</li>" +
                 "</ul>"
    },
    {
        title: "ARSENAL DATA (BASE)",
        content: "<p><strong>Base Modules (Unupgraded):</strong></p>" +
                 "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li>🗡️ <strong>Attack:</strong> 5 DMG. (QTE Criticals available).</li>" +
                    "<li>🛡️ <strong>Defend:</strong> 5 Block.</li>" +
                    "<li>💠 <strong>Mana:</strong> +1 Action Point (Energy).</li>" +
                    "<li>🌿 <strong>Summon:</strong> Spawns a Minion ally.</li>" +
                 "</ul>" +
                 "<div class='tut-tip'>TIP: Visit the Sanctuary to unlock powerful Dice Upgrades and Meta Progression.</div>"
    },
    {
        title: "ADVANCED MODULES",
        content: "<p>Unlock these via Sanctuary or Events:</p>" +
                 "<ul style='list-style-type: none; padding: 0; font-size: 0.9rem;'>" +
                    "<li>📉 <strong>Earthquake:</strong> AOE Damage + Weaken.</li>" +
                    "<li>☄️ <strong>Meteor:</strong> Massive single-target DMG.</li>" +
                    "<li>⛓️ <strong>Constrict:</strong> Reduces Enemy Atk & Healing.</li>" +
                    "<li>☠️ <strong>Voodoo:</strong> Delayed massive damage.</li>" +
                    "<li>⚡ <strong>Overcharge:</strong> Enemy takes more DMG, deals more DMG.</li>" +
                    "<li>🐂 <strong>Reckless:</strong> Double DMG this turn, take Triple DMG.</li>" +
                 "</ul>"
    },
    {
        title: "THREAT DATABASE",
        content: "<p><strong>Elite Unit Modifiers:</strong></p>" +
                 "<ul style='list-style-type: none; padding: 0;'>" +
                    "<li>🛡️ <strong>Shielded:</strong> Regenerates barrier every turn.</li>" +
                    "<li>❤️ <strong>Second Wind:</strong> Revives once with 50% HP upon death.</li>" +
                    "<li>📶 <strong>Jammer:</strong> Reduces your available Dice count.</li>" +
                 "</ul>" +
                 "<div class='tut-tip'>TIP: Focus fire on Jammers immediately. Save heavy attacks for after a Shielded unit's barrier breaks.</div>"
    },
    {
        title: "META OBJECTIVES",
        content: "<p><strong>💾 Data Files:</strong> Encrypted lore dropped by Bosses. Decrypt them in the Intel menu.</p>" +
                 "<p><strong>🌳 Sanctuary:</strong> Spend Fragments to upgrade stats. As you upgrade, the wasteland will visually be restored to nature.</p>" +
                 "<div style='margin-top:15px; border: 1px solid var(--neon-pink); padding: 10px; background: rgba(255,0,85,0.1); border-radius: 5px;'>" +
                    "<strong class='neon-text-pink'>⚠️ RESTRICTED ACCESS: SECTOR X</strong><br>" +
                    "<span style='font-size: 0.85rem;'>The hidden Core (Sector X) will only reveal itself when <strong>ALL Data Files</strong> are decrypted and the <strong>Sanctuary</strong> is fully restored.</span>" +
                 "</div>"
    },
    {
        title: "INTERFACE TIPS",
        content: "<p><strong>💡 Tooltips:</strong> If you are ever unsure what an icon, enemy, or skill does, <strong>TAP</strong> (or hover) on it to see details.</p>" +
                 "<p><strong>📊 Accurate Numbers:</strong> The damage and healing numbers shown on your cards are <strong>calculated in real-time</strong>. They include your current buffs, relics, and modifiers.</p>" +
                 "<p><em>Exception: Random chance effects (e.g. '50% chance') are calculated when the action occurs.</em></p>"
    },
    {
        title: "MISSION START",
        content: "<p>The Silicon Empire has paved the oceans.<br>" +
                 "Humanity is deleted.<br>" +
                 "Nature is illegal.</p>" +
                 "<p>You are the <strong>GREEN SPARK</strong>.<br>" +
                 "The last avatar of life.</p>" +
                 "<h3 class='neon-text-green' style='text-align:center; margin-top:20px;'>Magic v Machine initialised</h3>" +
                 "<p style='text-align:center; font-weight:bold;'>Good luck.</p>"
    }
];

const PLAYER_CLASSES = [
    {
        id: 'tactician', name: 'Tactician', icon: ICONS.classTactician, color: '#00f3ff',
        desc: 'Starts with 6 Dice.\nTAC_ATTACK builds pips twice.\nSpend 3 pips → also draw 1 extra die next turn.\nMinion: Pawn (+1 Reroll next turn on death)',
        traits: { diceCount: 6, minionName: "Pawn", minionTrait: "Death: +1 Reroll next turn.", pipPerAttack: 2, drawOnPipSpend: 1 },
        classDice: { attack: 'TAC_ATTACK', defend: 'TAC_DEFEND', mana: 'TAC_MANA', minion: 'TAC_MINION' }
    },
    {
        id: 'arcanist', name: 'Arcanist', icon: ICONS.classArcanist, color: '#bc13fe',
        desc: 'Starts with 5 Base Mana.\n+1 Mana automatically at the start of every turn (Flux Regen).\nMinion: Mana Wisp (+1 Mana next turn on death)',
        traits: { baseMana: 5, minionName: "Mana Wisp", minionTrait: "Death: +1 Mana next turn.", manaPassive: 1 },
        classDice: { attack: 'ARC_ATTACK', defend: 'ARC_DEFEND', mana: 'ARC_MANA', minion: 'ARC_MINION' }
    },
    {
        id: 'bloodstalker', name: 'Blood Stalker', icon: ICONS.classBloodstalker, color: '#ff0000',
        desc: 'Lifesteal 2 HP on hit.\nTake +1 DMG from all sources.\nBlood Tier ticks up on every kill — each tier adds +1 lifesteal.\nMinion: Blood Thrall (soaks damage meant for you).',
        traits: { lifesteal: true, vulnerable: true, minionName: "Blood Thrall", minionTrait: "Alive: absorbs damage meant for the player.", bloodTierPerKill: 1, bloodTierLifestealBonus: 1 },
        classDice: { attack: 'BLD_ATTACK', defend: 'BLD_DEFEND', mana: 'BLD_MANA', minion: 'BLD_MINION' }
    },
    {
        id: 'annihilator', name: 'Annihilator', icon: ICONS.classAnnihilator, color: '#ff8800',
        desc: 'Deal +50% DMG.\nStarts with 6 Dice.\nEarn rerolls by landing QTE Crits — reward skilled timing.\nMinion: Bomb Bot (Deals 10 DMG to enemies on death).',
        traits: { dmgMultiplier: 1.5, diceCount: 6, noRerolls: true, qteCritRerolls: 1, minionName: "Bomb Bot", minionTrait: "Death: 10 DMG to Enemies." },
        classDice: { attack: 'ANH_ATTACK', defend: 'ANH_DEFEND', mana: 'ANH_MANA', minion: 'ANH_MINION' }
    },
    {
        id: 'sentinel', name: 'Sentinel', icon: ICONS.classSentinel, color: '#ffffff',
        desc: 'Start combat with 10 Shield.\nCounter: when your shield breaks, retaliate 4 DMG.\nMinion: Guardian (Spawns with 10 Shield)',
        traits: { startShield: 10, shieldCounter: 4, minionName: "Guardian", minionTrait: "Spawn: +10 Shield." },
        classDice: { attack: 'SEN_ATTACK', defend: 'SEN_DEFEND', mana: 'SEN_MANA', minion: 'SEN_MINION' }
    },
    {
        id: 'summoner', name: 'Summoner', icon: ICONS.classSummoner, color: '#00ff99',
        desc: 'Starts with 2 Spirits at +40% HP/DMG.\nMax 4 Minions.\nMinion: Spirit (30% Revive chance)',
        // Opening buff: 2 minions at +40% so the Summoner's opener survives
        // Sector 1 pressure — single +20% Spirit used to die turn 1 to AoEs.
        // Cap raised from 3 → 4 so the GROVE APEX (×2 every minion) reads
        // as a true endgame swing — three minions are easy to keep alive,
        // four demands the player actually finish the canopy and field a
        // full grove. Only Summoner ever exceeds 3 minions.
        traits: { startMinions: 2, startMinionBuff: 1.4, maxMinions: 4, minionName: "Spirit", minionTrait: "Death: 30% Revive." },
        classDice: { attack: 'SUM_ATTACK', defend: 'SUM_DEFEND', mana: 'SUM_MANA', minion: 'SUM_MINION' }
    }
];

const DICE_TYPES = {
    // ─── TACTICIAN ───
    TAC_ATTACK: { name: "Tactical Strike",  icon: ICONS.tacAttack, color: '#00f3ff', desc: 'Deal 5 DMG. If enemy intends attack, +1 Reroll.', cost: 0, target: 'enemy', classId: 'tactician', slot: 'attack' },
    TAC_DEFEND: { name: "Field Barrier",    icon: ICONS.tacDefend, color: '#00d4e6', desc: 'Gain 5 Shield. +1 Reroll.', cost: 0, target: 'self', classId: 'tactician', slot: 'defend' },
    TAC_MANA:   { name: "Battle Intel",     icon: ICONS.tacMana,   color: '#00b8cc', desc: '+1 Mana. Enemy takes +1 DMG this turn.', cost: 0, target: 'self', classId: 'tactician', slot: 'mana' },
    TAC_MINION: { name: "Deploy Pawn",      icon: ICONS.tacMinion, color: '#00f3ff', desc: 'Deploy Pawn.', cost: 0, target: 'any', classId: 'tactician', slot: 'minion' },

    // ─── ARCANIST ───
    ARC_ATTACK: { name: "Mana Bolt",        icon: ICONS.arcAttack, color: '#bc13fe', desc: 'Deal 4 DMG + 1 per Mana held (max +5).', cost: 0, target: 'enemy', classId: 'arcanist', slot: 'attack' },
    ARC_DEFEND: { name: "Ward of Flux",     icon: ICONS.arcDefend, color: '#a020f0', desc: 'Gain Shield = 3 + current Mana.', cost: 0, target: 'self', classId: 'arcanist', slot: 'defend' },
    ARC_MANA:   { name: "Channel",          icon: ICONS.arcMana,   color: '#d070ff', desc: '+1 Mana. +2 if you have 3+ Mana.', cost: 0, target: 'self', classId: 'arcanist', slot: 'mana' },
    ARC_MINION: { name: "Conjure Wisp",     icon: ICONS.arcMinion, color: '#bc13fe', desc: 'Conjure Mana Wisp.', cost: 0, target: 'any', classId: 'arcanist', slot: 'minion' },

    // ─── BLOODSTALKER ───
    BLD_ATTACK: { name: "Crimson Rend",     icon: ICONS.bldAttack, color: '#ff0000', desc: 'Deal 6 DMG + 2 Bleed (2 DMG/turn, 2 turns).', cost: 0, target: 'enemy', classId: 'bloodstalker', slot: 'attack' },
    BLD_DEFEND: { name: "Sanguine Pact",    icon: ICONS.bldDefend, color: '#cc0000', desc: 'Heal 3 HP. Any overflow feeds the Blood Pool.', cost: 0, target: 'self', classId: 'bloodstalker', slot: 'defend' },
    BLD_MANA:   { name: "Blood Price",      icon: ICONS.bldMana,   color: '#990000', desc: '+2 Mana. Pay 1 HP.', cost: 0, target: 'self', classId: 'bloodstalker', slot: 'mana' },
    BLD_MINION: { name: "Raise Thrall",     icon: ICONS.bldMinion, color: '#ff0000', desc: 'Raise Blood Thrall.', cost: 0, target: 'any', classId: 'bloodstalker', slot: 'minion' },

    // ─── ANNIHILATOR ───
    ANH_ATTACK: { name: "Overheat Salvo",   icon: ICONS.anhAttack, color: '#ff8800', desc: 'Deal 8 DMG. +10 Heat.', cost: 0, target: 'enemy', classId: 'annihilator', slot: 'attack' },
    ANH_DEFEND: { name: "Ricochet Plate",   icon: ICONS.anhDefend, color: '#ff6600', desc: 'Ricochet: -20% incoming DMG next turn. x3 = immunity.', cost: 0, target: 'self', classId: 'annihilator', slot: 'defend' },
    ANH_MANA:   { name: "Core Surge",       icon: ICONS.anhMana,   color: '#ff4400', desc: '+1 Mana. +5 Heat.', cost: 0, target: 'self', classId: 'annihilator', slot: 'mana' },
    ANH_MINION: { name: "Deploy Bomb Bot",  icon: ICONS.anhMinion, color: '#ff8800', desc: 'Deploy Bomb Bot.', cost: 0, target: 'any', classId: 'annihilator', slot: 'minion' },

    // ─── SENTINEL ───
    SEN_ATTACK: { name: "Bulwark Bash",     icon: ICONS.senAttack, color: '#ffffff', desc: 'Deal 3 DMG + 30% of current Shield.', cost: 0, target: 'enemy', classId: 'sentinel', slot: 'attack' },
    SEN_DEFEND: { name: "Aegis Plate",      icon: ICONS.senDefend, color: '#c0c0c0', desc: 'Gain 6 Shield + 2 Thorns until next turn.', cost: 0, target: 'self', classId: 'sentinel', slot: 'defend' },
    SEN_MANA:   { name: "Shield Focus",     icon: ICONS.senMana,   color: '#e0e0e0', desc: '+1 Mana + 3 Shield.', cost: 0, target: 'self', classId: 'sentinel', slot: 'mana' },
    SEN_MINION: { name: "Deploy Guardian",  icon: ICONS.senMinion, color: '#ffffff', desc: 'Deploy Guardian.', cost: 0, target: 'any', classId: 'sentinel', slot: 'minion' },

    // ─── SUMMONER ───
    SUM_ATTACK: { name: "Primal Howl",      icon: ICONS.sumAttack, color: '#00ff99', desc: 'Deal 4 DMG + 2 per alive minion.', cost: 0, target: 'enemy', classId: 'summoner', slot: 'attack' },
    SUM_DEFEND: { name: "Bramble Ward",     icon: ICONS.sumDefend, color: '#00cc77', desc: '4 Shield self + 3 Shield each minion.', cost: 0, target: 'self', classId: 'summoner', slot: 'defend' },
    SUM_MANA:   { name: "Grove Tap",        icon: ICONS.sumMana,   color: '#00ff66', desc: '+1 Mana. Heal player and all minions 1 HP.', cost: 0, target: 'self', classId: 'summoner', slot: 'mana' },
    SUM_MINION: { name: "Call Spirit",      icon: ICONS.sumMinion, color: '#00ff99', desc: 'Call Spirit.', cost: 0, target: 'any', classId: 'summoner', slot: 'minion' },

    // ─── SHARED SKILL DICE ───
    EARTHQUAKE:      { name: "Earthquake",      icon: ICONS.earthquake,    color: '#ff8800', desc: 'Deal 5 DMG to ALL enemies.\n[QTE]: Crit for x1.3', cost: 2, isSkill: true, target: 'all_enemies' },
    METEOR:          { name: "Meteor",          icon: ICONS.meteor,        color: '#bc13fe', desc: 'Deal 30 DMG to target.\n[QTE]: Crit for x1.3', cost: 5, isSkill: true, target: 'enemy' },
    CONSTRICT:       { name: "Constrict",       icon: ICONS.constrict,     color: '#ff0055', desc: 'Reduce Enemy Atk and Healing by 50% for 3 turns.', cost: 3, isSkill: true, target: 'enemy' },
    VOODOO:          { name: "Voodoo Hex",      icon: ICONS.voodoo,        color: '#ff0000', desc: 'Apply Curse: Deal 150 Base DMG after 3 turns.', cost: 9, isSkill: true, locked: true, target: 'enemy' },
    OVERCHARGE:      { name: "Overcharge",      icon: ICONS.overcharge,    color: '#ff4400', desc: 'Enemy takes +50% Damage from all sources (3 turns).', cost: 1, isSkill: true, locked: true, target: 'enemy' },
    RECKLESS_CHARGE: { name: "Reckless Charge", icon: ICONS.recklessCharge, color: '#ff2200', desc: 'Next Attack x2 DMG.\nTake x3 DMG until next turn.', cost: 2, isSkill: true, locked: true, target: 'self' }
};

const META_UPGRADES = [
    { id: 'm_life',       name: "Gaia's Heart",       desc: "Start runs with +20 Max HP.",                cost: 400,  icon: ICONS.metaLife },
    { id: 'm_mana',       name: "Deep Roots",         desc: "Start runs with +1 Base Mana.",              cost: 600,  icon: ICONS.metaMana },
    { id: 'm_greed',      name: "Recycler",           desc: "+20% Fragment gain.",                        cost: 800,  icon: ICONS.metaRecycler },
    { id: 'm_discount',   name: "Merchant Protocol",  desc: "Shop items 25% cheaper.",                    cost: 500,  icon: ICONS.metaMerchant },
    { id: 'm_thorn',      name: "Double Edge",        desc: "Start with Double Edge (Reflect 30% Dmg).",  cost: 1200, icon: ICONS.relicDoubleEdge },
    { id: 'm_reroll',     name: "Tactical Link",      desc: "+1 Reroll per turn.",                        cost: 1000, icon: ICONS.metaReroll },
    { id: 'm_dmg',        name: "Solar Flare",        desc: "All attacks deal +30% Damage.",              cost: 1500, icon: ICONS.metaSolar },
    { id: 'm_minion_atk', name: "Nano-Swarm",         desc: "Minions: +50% Dmg, +1 HP.",                  cost: 1100, icon: ICONS.metaSwarm },
    { id: 'm_shield',     name: "Hardened Hull",      desc: "Start combat with 15 Shield.",               cost: 900,  icon: ICONS.relicShield },
    { id: 'm_relic',      name: "Data Cache",         desc: "Start run with a random Relic.",             cost: 2000, icon: ICONS.metaDataCache }
];

const UPGRADES_POOL = [
    { id: 'nano_shield',     name: "Nano-Shield",     desc: "Start combat with 5 Block.",                                                         icon: ICONS.relicShield },
    { id: 'mana_syphon',     name: "Mana Syphon",     desc: "+1 Mana at start of turn.",                                                          icon: ICONS.classArcanist },
    { id: 'repair',          name: "Field Repair",    desc: "Heal 30% Max HP (Instant).",                                                         icon: ICONS.intentHeal,   instant: true },
    { id: 'titan_module',    name: "Titan Module",    desc: "+25% Damage Output.",                                                                icon: ICONS.relicTitan,   rarity: 'gold' },
    { id: 'hull_plating',    name: "Hull Plating",    desc: "+10 Max HP.",                                                                        icon: ICONS.relicHull,    instant: true },
    { id: 'minion_core',     name: "Minion Core",     desc: "Start combat with 1 Wisp (Wisp gains Shield).",                                      icon: ICONS.minion },
    { id: 'spike_armor',     name: "Double Edge",     desc: "Reflect 30% of damage taken back to enemy.",                                         icon: ICONS.relicDoubleEdge },
    { id: 'crit_lens',       name: "Crit Lens",       desc: "15% chance to deal Double Damage.",                                                  icon: ICONS.relicCrit },
    { id: 'loot_bot',        name: "Loot Bot",        desc: "+20% Fragment gain.",                                                                icon: ICONS.relicLoot },
    { id: 'stim_pack',       name: "Stim Pack",       desc: "Heal 5 HP after combat.",                                                            icon: ICONS.relicStim },
    { id: 'reroll_chip',     name: "Reroll Chip",     desc: "+1 Reroll per turn.",                                                                icon: ICONS.metaReroll },
    { id: 'mana_battery',    name: "Mana Battery",    desc: "+1 Base Mana.",                                                                      icon: ICONS.relicBattery, instant: true },
    { id: 'shield_gen',      name: "Shield Gen",      desc: "Gain 5 Block every turn.",                                                           icon: ICONS.relicShieldGen },
    { id: 'wisp_hp',         name: "Wisp Vitality",   desc: "Minions have +5 HP.",                                                                icon: ICONS.relicWispVit },
    { id: 'second_life',     name: "Second Life",     desc: "Revive with 50% HP once.",                                                           icon: ICONS.relicSecondLife },
    { id: 'voodoo_doll',     name: "Voodoo Doll",     desc: "Unlock 'Voodoo Curse' Dice.",                                                        icon: ICONS.relicVoodoo,  rarity: 'red' },
    { id: 'overcharge_chip', name: "Overcharge Chip", desc: "Unlock 'Overcharge' Dice.",                                                          icon: ICONS.overcharge,   rarity: 'red' },
    { id: 'manifestor',      name: "Manifestor",      desc: "+1 Reward Choice. (Unique)",                                                         icon: ICONS.relicManifest, rarity: 'gold' },
    { id: 'brutalize',       name: "Brutalize",       desc: "Killing a minion deals 20 DMG to all enemies.",                                      icon: ICONS.relicBrutalize },
    { id: 'relentless',      name: "Relentless",      desc: "Your 3rd Attack each turn deals TRIPLE damage. Stacks trigger earlier (2nd, then 1st).", icon: ICONS.relicRelentless },
    { id: 'reckless_drive',  name: "Reckless Drive",  desc: "Unlock 'Reckless Charge' Dice.",                                                     icon: ICONS.recklessCharge, rarity: 'red' },
    { id: 'static_field',    name: "Static Field",    desc: "Deal 15 DMG to random enemy at start of turn.",                                      icon: ICONS.overcharge },
    { id: 'emergency_kit',   name: "Emergency Kit",   desc: "Heal 30% Max HP if below 30% (Consumed on use).",                                    icon: ICONS.relicEmergency },
    { id: 'gamblers_chip',   name: "Gambler's Chip",  desc: "+2 Rerolls per turn, but -5 Max HP.",                                                icon: ICONS.relicGambler },
    { id: 'hologram',        name: "Hologram",        desc: "15% chance to dodge an attack completely.",                                          icon: ICONS.relicHologram },
    { id: 'solar_battery',   name: "Solar Battery",   desc: "Every 2nd turn, gain +1 Mana.",                                                      icon: ICONS.metaSolar },
    { id: 'neural_link',     name: "Neural Link",     desc: "Minions gain +3 HP and +3 DMG.",                                                     icon: ICONS.constrict },
    { id: 'recycle_bin',     name: "Recycle Bin",     desc: "Gaining Mana heals 1 HP (Max 5/turn).",                                              icon: ICONS.metaRecycler },
    { id: 'firewall',        name: "Firewall",        desc: "First hit of 30+ DMG each combat: soften by 15 and gain 15 Shield.",                  icon: ICONS.defend },
    { id: 'thorn_mail',      name: "Thorn Mail",      desc: "Gain 2 Block whenever you deal damage.",                                             icon: ICONS.thorns },
    { id: 'data_miner',      name: "Data Miner",      desc: "Gain 20 Fragments if you end combat with full HP.",                                  icon: ICONS.relicMiner },
    { id: 'med_dispenser',   name: "Med Dispenser",   desc: "Heal 3 HP whenever you defeat an enemy.",                                            icon: ICONS.relicStim },
    { id: 'coolant_loop',    name: "Coolant Loop",    desc: "When your Shield breaks, heal 2 HP.",                                                icon: ICONS.relicCoolant },

    // --- V1.1 relic expansion ---
    { id: 'aegis_cycler',    name: "Aegis Cycler",    desc: "At start of turn, convert 5 Shield into +3 DMG next attack.",                        icon: ICONS.relicShield },
    { id: 'static_capacitor',name: "Static Capacitor",desc: "At start of turn, zap a random enemy for 10 DMG if you hold 3+ Mana.",              icon: ICONS.overcharge },
    { id: 'shard_reactor',   name: "Shard Reactor",   desc: "Gain +1 Mana whenever a minion dies (yours or enemy's).",                            icon: ICONS.relicBattery },
    { id: 'swarm_beacon',    name: "Swarm Beacon",    desc: "Your minions deal +1 DMG for each minion alive.",                                   icon: ICONS.minion },
    { id: 'leyline_cache',   name: "Leyline Cache",   desc: "Gain +50% Fragments from combat rewards.",                                           icon: ICONS.relicManifest },
    { id: 'bait_drone',      name: "Bait Drone",      desc: "Summon a decoy minion each combat. HP scales with sector (so late-game drones actually survive a round).", icon: ICONS.minion },
    { id: 'retaliator',      name: "Retaliator",      desc: "After taking 20+ damage in a single hit, deal 10 DMG back.",                         icon: ICONS.thorns },
    { id: 'dice_cache',      name: "Dice Cache",      desc: "Your first reroll each turn is free (doesn't consume a reroll).",                  icon: ICONS.metaReroll },
    { id: 'hex_fragment',    name: "Hex Fragment",    desc: "Skill dice cost -1 Mana (minimum 0).",                                               icon: ICONS.classArcanist },
    { id: 'iron_lung',       name: "Iron Lung",       desc: "The first Defend die each turn grants +5 extra Shield.",                             icon: ICONS.defend },
    { id: 'dusk_protocol',   name: "Dusk Protocol",   desc: "After turn 5, deal +10% damage per turn beyond.",                                    icon: ICONS.relicTitan },
    { id: 'dawn_protocol',   name: "Dawn Protocol",   desc: "First attack of each combat deals +100% damage.",                                    icon: ICONS.relicTitan },
    { id: 'reflection_glass',name: "Reflection Glass",desc: "Dodging an attack deals 8 DMG to the attacker.",                                     icon: ICONS.relicHologram },
    { id: 'venom_edge',      name: "Venom Edge",      desc: "Attacks apply 1 stack of Poison (2 DMG/turn for 3 turns).",                          icon: ICONS.attack },
    { id: 'kinetic_battery', name: "Kinetic Battery", desc: "Every 3 shields gained grants +1 Reroll.",                                           icon: ICONS.metaReroll },
    { id: 'salvage_arm',     name: "Salvage Arm",     desc: "Elite kills drop +15 Fragments.",                                                    icon: ICONS.relicLoot },
    { id: 'ghost_cache',     name: "Ghost Cache",     desc: "Once per run, auto-revive a dead minion with 1 HP.",                                 icon: ICONS.relicSecondLife },
    { id: 'warden_protocol', name: "Warden Protocol", desc: "Your minions gain +3 Shield at start of each turn.",                                 icon: ICONS.defend },
    { id: 'tempo_loop',      name: "Tempo Loop",      desc: "Each unused die at end of turn grants +3 Shield next turn.",                         icon: ICONS.classTactician },
    { id: 'echo_chamber',    name: "Echo Chamber",    desc: "First skill die each combat costs 0 Mana.",                                          icon: ICONS.classArcanist, rarity: 'gold' },
    { id: 'nano_forge',      name: "Nano Forge",      desc: "At combat start, spawn a free Minion at +50% stats.",                                icon: ICONS.minion,        rarity: 'gold' },
    { id: 'celestial_sync',  name: "Celestial Sync",  desc: "Perfect QTEs also heal 3 HP.",                                                       icon: ICONS.intentHeal },
    { id: 'dervish_mode',    name: "Dervish Mode",    desc: "After 3 attacks in a single turn, gain +2 Mana.",                                    icon: ICONS.relicBattery },
    { id: 'iron_vault',      name: "Iron Vault",      desc: "Shield does not decay at end of turn (max 50 carry).",                               icon: ICONS.relicShield,   rarity: 'gold' },

    // --- Part 5 relic expansion ---
    { id: 'reinforced_shell',name: "Reinforced Shell",desc: "+20 Max HP.",                                                                        icon: ICONS.relicHull,     instant: true },
    { id: 'volt_primer',     name: "Volt Primer",     desc: "First attack each turn deals +5 flat DMG.",                                          icon: ICONS.overcharge },
    { id: 'salvage_protocol',name: "Salvage Protocol",desc: "Gain 3 Fragments every time you kill an enemy.",                                     icon: ICONS.relicLoot }
];

const CORRUPTED_RELICS = [
    { id: 'c_blood_pact',    name: "Blood Pact",    desc: "Deal +50% DMG, but take 2 DMG at start of turn.",                                       icon: ICONS.corBlood,    rarity: 'corrupted' },
    { id: 'c_unstable_core', name: "Unstable Core", desc: "+2 Base Mana, but 25% chance to lose turn when casting skills.",                        icon: ICONS.corUnstable, rarity: 'corrupted' },
    { id: 'c_void_shell',    name: "Void Shell",    desc: "Start each combat with 40 Shield. Shield plays are disabled.",                          icon: ICONS.corVoid,     rarity: 'corrupted' },
    { id: 'c_glitch_blade',  name: "Glitch Blade",  desc: "Attacks deal random DMG (1 to 3x Base).",                                               icon: ICONS.corGlitch,   rarity: 'corrupted' },
    { id: 'c_entropy',       name: "Entropy",       desc: "Enemies start with -20% HP, but deal +50% DMG.",                                        icon: ICONS.corEntropy,  rarity: 'corrupted' },
    { id: 'c_quantum_core',  name: "Quantum Core",  desc: "Every 3rd Attack is a guaranteed CRIT. -15 Max HP.",                                    icon: ICONS.corQuantum,  rarity: 'corrupted', minAscension: 2 },
    { id: 'c_overclock',     name: "Overclock",     desc: "+2 Base Mana. Take 3 DMG at the start of every turn.",                                  icon: ICONS.corOverclock,rarity: 'corrupted', minAscension: 3 },
    { id: 'c_paradox',       name: "Paradox Loop",  desc: "First die each turn costs 0 Mana. All others cost +1.",                                 icon: ICONS.corParadox,  rarity: 'corrupted', minAscension: 4 },

    // --- V1.1 corrupted expansion ---
    { id: 'c_fracture',      name: "Fracture",      desc: "Rerolls cost 2 HP instead of a reroll token. Rerolls never deplete.",                  icon: ICONS.corUnstable, rarity: 'corrupted' },
    { id: 'c_void_siphon',   name: "Void Siphon",   desc: "Killing an enemy grants +1 Max Mana. Max HP -5 on pickup.",                             icon: ICONS.corVoid,     rarity: 'corrupted', minAscension: 1 },
    { id: 'c_mirror_shard',  name: "Mirror Shard",  desc: "50% of damage taken is also dealt to a random enemy.",                                 icon: ICONS.corGlitch,   rarity: 'corrupted' },
    { id: 'c_pyre',          name: "Pyre",          desc: "Attacks deal +30% DMG but you take +1 DMG per attack made.",                           icon: ICONS.corBlood,    rarity: 'corrupted' }
];

// Synergies: when the player owns ALL listed ids, a one-time banner fires.
// First discovery per run grants a small fragment bonus.
const SYNERGIES = [
    { id: 'minion_lord',  name: "MINION LORD",  ids: ['minion_core', 'neural_link', 'wisp_hp'], desc: "Your swarm is complete." },
    { id: 'death_spiral', name: "DEATH SPIRAL", ids: ['relentless', 'titan_module'],            desc: "Heavy hitter online." },
    { id: 'glass_cannon', name: "GLASS CANNON", ids: ['c_blood_pact', 'c_entropy'],             desc: "No guts, no glory." },
    { id: 'thorn_tank',   name: "THORN TANK",   ids: ['nano_shield', 'spike_armor', 'thorn_mail'], desc: "Hit me harder." },
    { id: 'frugal',       name: "FRUGAL",       ids: ['loot_bot', 'stim_pack'],                 desc: "Greed is good." },
    { id: 'crit_artisan', name: "CRIT ARTISAN", ids: ['crit_lens', 'c_quantum_core'],           desc: "Every strike precise." },
    { id: 'power_plant',  name: "POWER PLANT",  ids: ['solar_battery', 'mana_syphon', 'recycle_bin'], desc: "Mana overflow." },
    { id: 'gambler_king', name: "GAMBLER KING", ids: ['gamblers_chip', 'reroll_chip'],          desc: "House always wins." }
];

const GLITCH_MODIFIERS = [
    { id: 'volatile', name: 'Volatile',    icon: ICONS.glitchVolatile, desc: 'Explodes for 15 DMG on death.' },
    { id: 'evasive',  name: 'Evasive',     icon: ICONS.glitchEvasive,  desc: '20% chance to dodge attacks.' },
    { id: 'regen',    name: 'Regenerator', icon: ICONS.glitchRegen,    desc: 'Heals 5% HP each turn.' },
    { id: 'thorns',   name: 'Sharp',       icon: ICONS.glitchThorns,   desc: 'Reflects 2 DMG on hit.' }
];

// Class default-attack dice — one per class, 3 evolution tiers.
// Tier 1 granted at run start; tier advances on sector boss defeats (sector 2 → T2, sector 4 → T3).
// Keyed into DICE_TYPES at runtime so the standard roll pipeline picks them up.
// Names are class-flavored; T2/T3 are the upgraded forms.
const SIGNATURE_DICE = {
    tactician: [
        { key: 'SIG_TACT_1', name: 'Volley',    icon: ICONS.classTactician, color: '#00f3ff', desc: 'Deal 7 DMG. +1 Reroll next turn.\n[QTE]: Crit x1.3', cost: 0, target: 'enemy' },
        { key: 'SIG_TACT_2', name: 'Salvo',     icon: ICONS.classTactician, color: '#00f3ff', desc: 'Deal 10 DMG. +1 Reroll this turn.\n[QTE]: Crit x1.4', cost: 0, target: 'enemy' },
        { key: 'SIG_TACT_3', name: 'Checkmate', icon: ICONS.classTactician, color: '#00f3ff', desc: 'Deal 14 DMG. +2 Rerolls. Draw 1 Die.\n[QTE]: Crit x1.5', cost: 0, target: 'enemy' }
    ],
    arcanist: [
        { key: 'SIG_ARC_1', name: 'Spark', icon: ICONS.classArcanist, color: '#bc13fe', desc: 'Deal 6 DMG. +1 Mana.\n[QTE]: Crit x1.3', cost: 0, target: 'enemy' },
        { key: 'SIG_ARC_2', name: 'Hex',   icon: ICONS.classArcanist, color: '#bc13fe', desc: 'Deal 12 DMG. +2 Mana.\n[QTE]: Crit x1.4', cost: 0, target: 'enemy' },
        { key: 'SIG_ARC_3', name: 'Rite',  icon: ICONS.classArcanist, color: '#bc13fe', desc: 'Deal 18 DMG. +3 Mana. Apply Weak.\n[QTE]: Crit x1.5', cost: 0, target: 'enemy' }
    ],
    bloodstalker: [
        { key: 'SIG_BLOOD_1', name: 'Bite',  icon: ICONS.classBloodstalker, color: '#ff0000', desc: 'Deal 8 DMG. Heal 3 HP.\n[QTE]: Crit x1.3', cost: 0, target: 'enemy' },
        { key: 'SIG_BLOOD_2', name: 'Gouge', icon: ICONS.classBloodstalker, color: '#ff0000', desc: 'Deal 12 DMG. Heal 6 HP.\n[QTE]: Crit x1.4', cost: 0, target: 'enemy' },
        { key: 'SIG_BLOOD_3', name: 'Maul',  icon: ICONS.classBloodstalker, color: '#ff0000', desc: 'Deal 18 DMG. Heal 10 HP. Apply Frail.\n[QTE]: Crit x1.5', cost: 0, target: 'enemy' }
    ],
    annihilator: [
        { key: 'SIG_ANNI_1', name: 'Blast',      icon: ICONS.classAnnihilator, color: '#ff8800', desc: 'Deal 12 DMG. Ignore Shield.\n[QTE]: Crit x1.3', cost: 0, target: 'enemy' },
        { key: 'SIG_ANNI_2', name: 'Barrage',    icon: ICONS.classAnnihilator, color: '#ff8800', desc: 'Deal 18 DMG. Ignore Shield. Apply Weak.\n[QTE]: Crit x1.4', cost: 0, target: 'enemy' },
        { key: 'SIG_ANNI_3', name: 'Annihilate', icon: ICONS.classAnnihilator, color: '#ff8800', desc: 'Deal 28 DMG. Ignore Shield. Stuns 1 turn.\n[QTE]: Crit x1.6', cost: 0, target: 'enemy' }
    ],
    sentinel: [
        { key: 'SIG_SENT_1', name: 'Bash',        icon: ICONS.classSentinel, color: '#ffffff', desc: 'Gain 10 Shield. Deal 4 DMG.\n[QTE]: Crit x1.3', cost: 0, target: 'enemy' },
        { key: 'SIG_SENT_2', name: 'Slam',        icon: ICONS.classSentinel, color: '#ffffff', desc: 'Gain 15 Shield. Deal 8 DMG. Taunt.\n[QTE]: Crit x1.4', cost: 0, target: 'enemy' },
        { key: 'SIG_SENT_3', name: 'Aegis Break', icon: ICONS.classSentinel, color: '#ffffff', desc: 'Gain 22 Shield. Deal 14 DMG. Taunt + Thorns.\n[QTE]: Crit x1.5', cost: 0, target: 'enemy' }
    ],
    summoner: [
        { key: 'SIG_SUM_1', name: 'Call',        icon: ICONS.classSummoner, color: '#00ff99', desc: 'Summon a Spirit. Deal 4 DMG.\n[QTE]: Crit x1.3', cost: 0, target: 'enemy' },
        { key: 'SIG_SUM_2', name: 'Rouse',       icon: ICONS.classSummoner, color: '#00ff99', desc: 'Summon a Spirit. Deal 8 DMG. Heal Minions 3 HP.\n[QTE]: Crit x1.4', cost: 0, target: 'enemy' },
        { key: 'SIG_SUM_3', name: 'Primal Roar', icon: ICONS.classSummoner, color: '#00ff99', desc: 'Summon 2 Spirits. Deal 12 DMG. Minions: +3 DMG this turn.\n[QTE]: Crit x1.5', cost: 0, target: 'enemy' }
    ]
};

const DICE_UPGRADES = {
    // ─── TACTICIAN ───
    TAC_ATTACK: { name: "Precision Strike",   desc: "Deal 8 DMG. If enemy intends attack, +1 Reroll + 3 Shield.", cost: 190, icon: ICONS.tacAttack },
    TAC_DEFEND: { name: "Holo Barrier",       desc: "Gain 10 Shield. +5 Shield to minions. +2 Rerolls.", cost: 175, icon: ICONS.tacDefend },
    TAC_MANA:   { name: "Battle Analysis",    desc: "+2 Mana. Enemy takes +2 DMG this turn.", cost: 200, icon: ICONS.tacMana },
    TAC_MINION: { name: "Elite Pawn",         desc: "Deploy L2 Pawn (+5 Block, +5 DMG).", cost: 200, icon: ICONS.tacMinion },

    // ─── ARCANIST ───
    ARC_ATTACK: { name: "Arcane Barrage",     desc: "Deal 6 DMG + 2 per Mana held. Apply Weak.", cost: 190, icon: ICONS.arcAttack },
    ARC_DEFEND: { name: "Prismatic Ward",     desc: "Shield = 5 + current Mana. +1 Mana.", cost: 175, icon: ICONS.arcDefend },
    ARC_MANA:   { name: "Resonance",          desc: "+2 Mana. +3 if you have 3+ Mana.", cost: 200, icon: ICONS.arcMana },
    ARC_MINION: { name: "Greater Wisp",       desc: "Conjure L2 Mana Wisp (+5 Block, +5 DMG).", cost: 200, icon: ICONS.arcMinion },

    // ─── BLOODSTALKER ───
    BLD_ATTACK: { name: "Crimson Cascade",    desc: "Deal 9 DMG + 3 Bleed (3 DMG/turn, 2 turns). Lifesteal 2.", cost: 190, icon: ICONS.bldAttack },
    BLD_DEFEND: { name: "Transfusion",        desc: "Heal 5 HP. Overflow feeds the Blood Pool.", cost: 175, icon: ICONS.bldDefend },
    BLD_MANA:   { name: "Blood Tithe",        desc: "+3 Mana. Pay 1 HP. Apply Frail to enemy.", cost: 200, icon: ICONS.bldMana },
    BLD_MINION: { name: "Alpha Thrall",       desc: "Raise L2 Thrall (+5 Block, +5 DMG).", cost: 200, icon: ICONS.bldMinion },

    // ─── ANNIHILATOR ───
    ANH_ATTACK: { name: "Plasma Cannon",      desc: "Deal 12 DMG. +15 Heat. 20% AoE splash.", cost: 190, icon: ICONS.anhAttack },
    ANH_DEFEND: { name: "Deflector Array",    desc: "Ricochet: -30% incoming DMG next turn. x3 = immunity + 5 DMG reflect.", cost: 175, icon: ICONS.anhDefend },
    ANH_MANA:   { name: "Reactor Core",       desc: "+2 Mana. +8 Heat. If Heat > 50, +1 extra Mana.", cost: 200, icon: ICONS.anhMana },
    ANH_MINION: { name: "Heavy Bomb Bot",     desc: "Deploy L2 Bomb Bot (+5 Block, 15 DMG on death).", cost: 200, icon: ICONS.anhMinion },

    // ─── SENTINEL ───
    SEN_ATTACK: { name: "Fortress Strike",    desc: "Deal 5 DMG + 40% of current Shield. Retain 50% Shield.", cost: 190, icon: ICONS.senAttack },
    SEN_DEFEND: { name: "Reinforced Plate",   desc: "Gain 10 Shield + 3 Thorns until next turn.", cost: 175, icon: ICONS.senDefend },
    SEN_MANA:   { name: "Bastion Protocol",   desc: "+1 Mana + 5 Shield. If Shield > 15, +1 extra Mana.", cost: 200, icon: ICONS.senMana },
    SEN_MINION: { name: "Elite Guardian",     desc: "Deploy L2 Guardian (+5 Block, +5 DMG, 15 Shield on spawn).", cost: 200, icon: ICONS.senMinion },

    // ─── SUMMONER ───
    SUM_ATTACK: { name: "Wrath of the Wild",  desc: "Deal 6 DMG + 3 per alive minion. Heal self 1 per minion.", cost: 190, icon: ICONS.sumAttack },
    SUM_DEFEND: { name: "Living Fortress",    desc: "6 Shield self + 4 Shield each minion. Minions gain 1 Thorns.", cost: 175, icon: ICONS.sumDefend },
    SUM_MANA:   { name: "Deep Roots",         desc: "+2 Mana. Heal player and all minions 2 HP.", cost: 200, icon: ICONS.sumMana },
    SUM_MINION: { name: "Elder Spirit",       desc: "Call L2 Spirit (+5 Block, +5 DMG, 30% Revive).", cost: 200, icon: ICONS.sumMinion },

    // ─── SHARED SKILL UPGRADES (unchanged) ───
    EARTHQUAKE:      { name: "Cataclysm",      desc: "Deal 12 DMG to ALL. Apply WEAK.\n[QTE]: Crit x1.3.", cost: 225, icon: ICONS.upgCataclysm },
    METEOR:          { name: "Starfall",       desc: "Deal 50 DMG. [QTE]: Crit x1.3.", cost: 350, icon: ICONS.upgStarfall },
    CONSTRICT:       { name: "Digital Rot",    desc: "Reduce Atk/Heal by 75% for 4 turns.", cost: 250, icon: ICONS.upgDigitalRot },
    VOODOO:          { name: "Void Curse",     desc: "Apply Curse: After 3 turns, 150 Base DMG (50% chance for 500).", cost: 350, icon: ICONS.upgVoid },
    OVERCHARGE:      { name: "Hyper Beam",     desc: "Enemy takes +100% Damage from all sources (3 turns).", cost: 300, icon: ICONS.upgHyperBeam },
    RECKLESS_CHARGE: { name: "Vicious Charge", desc: "Next Attack x3 DMG.\nTake +50% DMG until next turn.", cost: 500, icon: ICONS.upgVicious }
};

const ENEMIES = [
    // Sector 1
    { name: "Sentry Drone", hp: 30, dmg: 6, sector: 1, shape: 'drone' },
    { name: "Heavy Loader", hp: 44, dmg: 8, sector: 1, shape: 'tank' },
    { name: "Cyber Arachnid", hp: 40, dmg: 12, sector: 1, shape: 'spider' },
    // Sector 1 — expansion (5.2.1)
    { name: "Riot Suppressor", hp: 50, dmg: 8, sector: 1, shape: 'tank', kind: 'aoe_sweep' },
    { name: "Drone Swarmling",  hp: 15, dmg: 4, sector: 1, shape: 'drone', kind: 'swarm', summonOnStart: 2 },
    { name: "Mirror",            hp: 40, dmg: 6, sector: 1, shape: 'wisp', kind: 'mirror' },
    // Sector 2
    { name: "Cryo Bot", hp: 60, dmg: 10, sector: 2, shape: 'drone' },
    { name: "Data Leech", hp: 50, dmg: 14, sector: 2, shape: 'wisp' },
    { name: "Firewall Sentinel", hp: 80, dmg: 8, sector: 2, shape: 'tank' },
    // Sector 2 — expansion (5.2.1)
    { name: "Cryo Cultivator", hp: 60, dmg: 8,  sector: 2, shape: 'tank',   kind: 'frost' },
    { name: "Data Mite",        hp: 40, dmg: 12, sector: 2, shape: 'spider', kind: 'burrow' },
    { name: "Echo",             hp: 55, dmg: 10, sector: 2, shape: 'wisp',   kind: 'clone' },
    // Sector 3
    { name: "Magma Construct", hp: 100, dmg: 18, sector: 3, shape: 'tank' },
    { name: "Core Guardian", hp: 120, dmg: 12, sector: 3, shape: 'drone' },
    { name: "Nullifier", hp: 90, dmg: 24, sector: 3, shape: 'sniper' },
    // Sector 3 — expansion (5.2.1)
    { name: "Foundry Golem", hp: 140, dmg: 18, sector: 3, shape: 'tank',   kind: 'armored' },
    { name: "Slag Geyser",   hp: 80,  dmg: 0,  sector: 3, shape: 'sniper', kind: 'immolate' },
    { name: "Coolant Tech",  hp: 70,  dmg: 6,  sector: 3, shape: 'drone',  kind: 'healer' },
    // Sector 4 (High Security)
    { name: "Praetorian", hp: 160, dmg: 15, sector: 4, shape: 'tank' },
    { name: "Sentinel Orb", hp: 130, dmg: 20, sector: 4, shape: 'drone' },
    { name: "Phase Stalker", hp: 110, dmg: 25, sector: 4, shape: 'spider' },
    // Sector 4 — expansion (5.2.1)
    { name: "Hive Warden", hp: 130, dmg: 10, sector: 4, shape: 'tank',   kind: 'shielder' },
    { name: "Phage Pod",   hp: 60,  dmg: 15, sector: 4, shape: 'wisp',   kind: 'detonator' },
    { name: "Keeper",      hp: 180, dmg: 8,  sector: 4, shape: 'sniper', kind: 'buffer' },
    // Sector 5 (The Source)
    { name: "Code Fragment", hp: 180, dmg: 22, sector: 5, shape: 'wisp' },
    { name: "Fatal Error", hp: 200, dmg: 30, sector: 5, shape: 'sniper' },
    { name: "Null Pointer", hp: 250, dmg: 18, sector: 5, shape: 'wisp' },
    // Sector 5 — expansion (5.2.1)
    { name: "Null Priest",      hp: 180, dmg: 25, sector: 5, shape: 'wisp',   kind: 'shield_break' },
    { name: "Entropy",          hp: 200, dmg: 20, sector: 5, shape: 'sniper', kind: 'chaotic' },
    { name: "Silent Observer",  hp: 160, dmg: 35, sector: 5, shape: 'spider', kind: 'observer' },

    /* ==== Part 23 roster expansion — fresh enemies per sector ========
       Reuse existing `kind` values (handled in game.js intent logic) so
       each new enemy is mechanically unique without requiring new handler
       code. This doubles the effective variety of each sector's draw. */
    // Sector 1 — Downtown Glass
    { name: "Watcher Pod",      hp: 32, dmg: 6,  sector: 1, shape: 'drone',  kind: 'observer' },
    { name: "Paper Pusher",     hp: 36, dmg: 5,  sector: 1, shape: 'tank',   kind: 'swarm',    summonOnStart: 1 },
    { name: "Signal Jammer",    hp: 30, dmg: 7,  sector: 1, shape: 'wisp',   kind: 'mirror' },
    // Sector 2 — Cryo Docks
    { name: "Cargo Hauler",     hp: 80, dmg: 10, sector: 2, shape: 'tank',   kind: 'armored' },
    { name: "Icicle Sniper",    hp: 42, dmg: 16, sector: 2, shape: 'sniper', kind: 'frost' },
    { name: "Freezer Drone",    hp: 48, dmg: 8,  sector: 2, shape: 'drone',  kind: 'frost' },
    // Sector 3 — Foundry Ravine
    { name: "Forge Welder",     hp: 110, dmg: 14, sector: 3, shape: 'tank',   kind: 'immolate' },
    { name: "Slag Mech",        hp: 130, dmg: 16, sector: 3, shape: 'tank',   kind: 'aoe_sweep' },
    { name: "Ember Swarm",      hp: 50,  dmg: 10, sector: 3, shape: 'drone',  kind: 'swarm',    summonOnStart: 2 },
    // Sector 4 — Hive Vectors
    { name: "Hive Conduit",     hp: 140, dmg: 12, sector: 4, shape: 'wisp',   kind: 'buffer' },
    { name: "Parasite Carrier", hp: 90,  dmg: 14, sector: 4, shape: 'spider', kind: 'detonator' },
    { name: "Queen Node",       hp: 160, dmg: 16, sector: 4, shape: 'drone',  kind: 'healer' },
    // Sector 5 — The Source
    { name: "Glitch Shard",     hp: 160, dmg: 28, sector: 5, shape: 'wisp',   kind: 'clone' },
    { name: "Echo Phantom",     hp: 150, dmg: 24, sector: 5, shape: 'wisp',   kind: 'mirror' },
    { name: "Paradox Loop",     hp: 120, dmg: 30, sector: 5, shape: 'sniper', kind: 'chaotic' },

    /* ==== Part 5 content expansion — drop-in variety using existing
       enemy `kind` handlers. New names and stat spreads only; no new
       combat behavior code required. Dossier lines are handled by the
       _getIntelLine BY_KIND fallback in game.js. */
    // Sector 1 — Downtown Glass
    { name: "Security Bot",      hp: 46, dmg: 8,  sector: 1, shape: 'tank',   kind: 'aoe_sweep' },
    { name: "Network Intruder",  hp: 28, dmg: 7,  sector: 1, shape: 'drone',  kind: 'mirror' },
    // Sector 2 — Cryo Docks
    { name: "Data Phantom",      hp: 58, dmg: 11, sector: 2, shape: 'wisp',   kind: 'clone' },
    { name: "Cryo Wraith",       hp: 52, dmg: 10, sector: 2, shape: 'wisp',   kind: 'frost' },
    // Sector 3 — Foundry Ravine
    { name: "Furnace Knight",    hp: 130, dmg: 14, sector: 3, shape: 'tank',   kind: 'armored' },
    { name: "Crucible Shaper",   hp: 120, dmg: 10, sector: 3, shape: 'sniper', kind: 'buffer' },
    // Sector 4 — Hive Vectors
    { name: "Hive Mender",       hp: 100, dmg: 8,  sector: 4, shape: 'drone',  kind: 'healer' },
    { name: "Phage Drone",       hp: 80,  dmg: 14, sector: 4, shape: 'drone',  kind: 'detonator' },
    // Sector 5 — The Source
    { name: "Error Cluster",     hp: 170, dmg: 22, sector: 5, shape: 'wisp',   kind: 'shield_break' },
    { name: "Glitch Cascade",    hp: 140, dmg: 28, sector: 5, shape: 'sniper', kind: 'chaotic' }
];
const BOSS_DATA = {
    1: { 
        name: "THE PANOPTICON", 
        subtitle: "THE ALL-SEEING EYE",
        hp: 300, 
        dmg: 20, 
        actionsPerTurn: 2,
        color: '#00ffff', // Electric Cyan
        moves: ['attack', 'debuff', 'multi_attack', 'analyse'],
        shieldVal: 30
    },
    2: {
        name: "NULL_POINTER",
        subtitle: "THE CONSUMING VOID",
        hp: 500,
        dmg: 40,
        actionsPerTurn: 1,
        color: '#ff00ff',
        moves: ['summon_void'], // Boss itself doesn't attack — pressure comes from Pull of Void + Void Spawns + Void Crush.
        shieldVal: 20
    },
    3: { 
        name: "THE COMPILER", 
        subtitle: "INDUSTRIAL DATA CRUSHER",
        hp: 750, 
        dmg: 70, 
        actionsPerTurn: 1,
        color: '#ff4500', // Neon Orange-Red
        moves: ['attack', 'shield', 'buff'], 
        shieldVal: 100
    },
    4: { 
        name: "HIVE PROTOCOL", 
        subtitle: "DISTRIBUTED LETHALITY",
        hp: 900, 
        dmg: 30, 
        actionsPerTurn: 4,
        color: '#32cd32', // Neon Lime Green
        moves: ['attack', 'multi_attack', 'summon'], 
        shieldVal: 15
    },
    5: {
        name: "TESSERACT PRIME",
        subtitle: "GEOMETRIC IMPOSSIBILITY",
        hp: 1000,
        dmg: 50,
        actionsPerTurn: 3,
        color: '#ffffff', // Pure White/Gold
        moves: ['attack', 'purge_attack', 'reality_overwrite', 'shield'],
        shieldVal: 60
    },
    // Sector X — Roadmap Part 24.2. Post-Sector-5 boss; only spawned via the
    // ARCHIVE main-menu run path. HP scales +150 per Ascension level (handled
    // at spawn time in startCombat). Moves are unused — generateSingleIntent
    // has a `name === "THE ARCHIVIST"` branch that picks from the rotating
    // sector mechanic menu (Phase 1) and layers per-phase behaviours on top.
    6: {
        name: "THE ARCHIVIST",
        subtitle: "KEEPER OF DEAD RUNS",
        hp: 500,
        dmg: 30,
        actionsPerTurn: 2,
        color: '#ffd76a',
        moves: ['attack'],
        shieldVal: 30,
        isArchivist: true
    }
};

const EVENTS_DB = [
    {
        title: "STRANGE SIGNAL",
        desc: "You intercept an encrypted transmission. It seems to be a distress signal from a rogue AI.",
        options: [
            { 
                text: "Decrypt (-4 HP, +40 Fragments)", // Reduced from 10
                effect: (g) => { 
                    g.player.takeDamage(4); 
                    g.techFragments += 40; 
                    return "You gained 40 Fragments."; 
                } 
            },
            { 
                text: "Ignore (Leave)", 
                effect: (g) => { return "You moved on."; } 
            }
        ]
    },
    {
        title: "ABANDONED CACHE",
        desc: "A supply crate sits amidst the rubble.",
        options: [
            { 
                text: "Open (+25 Fragments)", 
                effect: (g) => { 
                    g.techFragments += 25; 
                    return "Found 25 Fragments."; 
                } 
            },
            { 
                text: "Salvage Parts (+5 HP)", // Reduced from 15
                effect: (g) => { 
                    g.player.heal(5); 
                    return "Restored 5 HP."; 
                } 
            }
        ]
    },
    {
        title: "MALFUNCTIONING FABRICATOR",
        desc: "An unstable upgrade station sparks wildly. You might be able to force an upgrade, but it will hurt.",
        condition: (g) => Object.keys(DICE_UPGRADES).some(k => !g.player.hasDiceUpgrade(k)),
        options: [
            { 
                text: "Force Upgrade (-8 HP)", // Reduced from 20
                effect: (g) => { 
                    g.player.takeDamage(8);
                    const available = Object.keys(DICE_UPGRADES).filter(k => !g.player.hasDiceUpgrade(k));
                    if (available.length > 0) {
                        const up = available[Math.floor(Math.random() * available.length)];
                        g.player.diceUpgrades.push(up);
                        return "SYSTEM UPGRADED: " + DICE_UPGRADES[up].name;
                    } else {
                        g.techFragments += 100;
                        return "Maximum Upgrades Reached. (+100 Frags)";
                    }
                } 
            },
            { text: "Leave", effect: (g) => "Too risky." }
        ]
    },
    {
        title: "GLITCH ANOMALY",
        desc: "A tear in the network reveals a high-value target. It looks dangerous.",
        options: [
            { 
                text: "Engage Elite (Combat)", 
                effect: (g) => { 
                    g.startCombat('elite'); 
                    return "COMBAT_STARTED"; 
                } 
            },
            { text: "Avoid", effect: (g) => "You skirt around the anomaly." }
        ]
    },
    {
        title: "DATA BROKER",
        desc: "A shady algorithm offers you a random module in exchange for raw data.",
        options: [
            { 
                text: "Buy Random Module (-50 Fragments)", 
                effect: (g) => { 
                    if (g.techFragments >= 50) {
                        g.techFragments -= 50;
                        const pool = UPGRADES_POOL;
                        const item = pool[Math.floor(Math.random() * pool.length)];
                        g.player.addRelic(item);
                        return "ACQUIRED: " + item.name;
                    } else {
                        return "Insufficient Fragments.";
                    }
                } 
            },
            { text: "Decline", effect: (g) => "You walk away." }
        ]
    },
    {
        title: "CORRUPTED NODE",
        desc: "This node is leaking data. You can absorb it, but it will corrupt your max integrity.",
        options: [
            { 
                text: "Absorb (-4 Max HP, +150 Fragments)", // Reduced from 10
                effect: (g) => { 
                    g.player.maxHp -= 4;
                    if (g.player.currentHp > g.player.maxHp) g.player.currentHp = g.player.maxHp;
                    g.techFragments += 150;
                    return "Data absorbed. Integrity compromised.";
                } 
            },
            { text: "Purge (+7 HP)", effect: (g) => { g.player.heal(7); return "Node stabilized."; } } // Reduced from 20
        ]
    },
    {
        title: "TRAINING SIMULATION",
        desc: "You find an old combat log. Studying it might reveal new tactics.",
        options: [
            { 
                text: "Study (Unlock Random Skill)", 
                effect: (g) => { 
                    const available = Object.keys(DICE_UPGRADES).filter(k => !g.player.hasDiceUpgrade(k));
                    if (available.length > 0) {
                        const up = available[Math.floor(Math.random() * available.length)];
                        g.player.diceUpgrades.push(up);
                        return "TACTIC LEARNED: " + DICE_UPGRADES[up].name;
                    } else {
                        g.techFragments += 50;
                        return "Knowledge database full. (+50 Frags)";
                    }
                }
            }
        ]
    },

    // --- V1.1 event expansion ---
    {
        title: "FROZEN LATTICE",
        desc: "A shimmering ice crystal holds a trapped fragment of code. Touching it burns.",
        options: [
            { text: "Shatter (+40 Fragments, -3 HP)", effect: (g) => { g.player.takeDamage(3); g.techFragments += 40; return "Shards scatter and fuse to your circuits."; } },
            { text: "Admire only", effect: () => "You step around it." }
        ]
    },
    {
        title: "ROGUE CODEC",
        desc: "A friendly voice broadcasts on an unused frequency, offering a tuneup.",
        options: [
            { text: "Accept tuneup (+5 Max HP)", effect: (g) => { g.player.maxHp += 5; g.player.currentHp += 5; return "Calibration complete."; } },
            { text: "Trade frequencies (+1 Reroll max)", effect: (g) => { g.maxRerolls = (g.maxRerolls || 2) + 1; return "Bandwidth expanded."; } }
        ]
    },
    {
        title: "SILENT SERVER",
        desc: "Idle hardware. You could scavenge it, but its maintenance drone is close.",
        options: [
            { text: "Scavenge (+80 Fragments)", effect: (g) => { g.techFragments += 80; return "Quick pass. Drone none the wiser."; } },
            { text: "Provoke drone (Combat)", effect: (g) => { g.startCombat('elite'); return "COMBAT_STARTED"; } }
        ]
    },
    {
        title: "BURNT-OUT ORACLE",
        desc: "A charred Oracle-class AI offers one last prophecy — but it needs a minion to focus.",
        condition: (g) => g.player.minions && g.player.minions.length > 0,
        options: [
            { text: "Sacrifice a minion (Unlock Random Relic)", effect: (g) => {
                if (g.player.minions.length > 0) g.player.minions.shift();
                const pool = UPGRADES_POOL;
                const item = pool[Math.floor(Math.random() * pool.length)];
                g.player.addRelic(item);
                return "Oracle speaks once more: " + item.name;
            } },
            { text: "Walk away", effect: () => "The Oracle fades." }
        ]
    },
    {
        title: "RECURSIVE MARKET",
        desc: "An automated market offers an exchange: pay fragments to duplicate one of your relics' effects.",
        condition: (g) => g.player.relics && g.player.relics.length >= 3,
        options: [
            { text: "Buy duplicate (-120 Fragments)", effect: (g) => {
                if (g.techFragments < 120) return "Insufficient fragments.";
                g.techFragments -= 120;
                const rel = g.player.relics[Math.floor(Math.random() * g.player.relics.length)];
                g.player.addRelic({ ...rel });
                return "DUPLICATED: " + rel.name;
            } },
            { text: "Refuse", effect: () => "You decline." }
        ]
    },
    {
        title: "SKYGLASS RELIC",
        desc: "A mirrored obelisk reflects a younger you. Shattering it might grant a boon.",
        options: [
            { text: "Shatter (take 5 DMG, random Relic)", effect: (g) => {
                g.player.takeDamage(5);
                const pool = UPGRADES_POOL;
                const item = pool[Math.floor(Math.random() * pool.length)];
                g.player.addRelic(item);
                return "A fragment embeds: " + item.name;
            } },
            { text: "Bow respectfully (+3 HP)", effect: (g) => { g.player.heal(3); return "The glass hums in thanks."; } }
        ]
    },
    {
        title: "AUTOMATED MEDBAY",
        desc: "A surgical arm whirs to life, offering emergency triage.",
        options: [
            { text: "Full heal (-40% Max HP cap this run)", effect: (g) => {
                g.player.currentHp = g.player.maxHp;
                g.player.maxHp = Math.max(10, Math.floor(g.player.maxHp * 0.6));
                if (g.player.currentHp > g.player.maxHp) g.player.currentHp = g.player.maxHp;
                return "Restored. Frame weakened.";
            } },
            { text: "Quick stitch (+15 HP)", effect: (g) => { g.player.heal(15); return "Patched up."; } },
            { text: "Decline", effect: () => "You move on." }
        ]
    },
    {
        title: "HOLO-ARENA",
        desc: "Challenge a simulated version of an earlier boss. Win for fragments.",
        options: [
            { text: "Accept challenge (Combat)", effect: (g) => { g.startCombat('elite'); return "COMBAT_STARTED"; } },
            { text: "Leave", effect: () => "Not today." }
        ]
    },
    {
        title: "OVERFLOW CONDUIT",
        desc: "Raw mana pours from a broken line.",
        options: [
            { text: "Drink deep (+2 Base Mana, -5 Max HP)", effect: (g) => {
                g.player.baseMana += 2;
                g.player.maxHp -= 5;
                if (g.player.currentHp > g.player.maxHp) g.player.currentHp = g.player.maxHp;
                return "Current rises.";
            } },
            { text: "Bottle a sip (+1 Base Mana)", effect: (g) => { g.player.baseMana += 1; return "Stored safely."; } },
            { text: "Seal it", effect: () => "The line hisses shut." }
        ]
    },
    {
        title: "MERCHANT DRONE",
        desc: "A flying vendor offers a rotating stock. One item, one chance.",
        options: [
            { text: "Buy discounted relic (-60 Fragments)", effect: (g) => {
                if (g.techFragments < 60) return "Not enough Fragments.";
                g.techFragments -= 60;
                const pool = UPGRADES_POOL;
                const item = pool[Math.floor(Math.random() * pool.length)];
                g.player.addRelic(item);
                return "ACQUIRED: " + item.name;
            } },
            { text: "Shake them down (-10 HP, +80 Fragments)", effect: (g) => { g.player.takeDamage(10); g.techFragments += 80; return "The drone flees."; } },
            { text: "Let them pass", effect: () => "They hum onward." }
        ]
    },
    {
        title: "ABANDONED COMBAT SIM",
        desc: "A training dummy flickers in and out. Perfect for a quick warm-up.",
        options: [
            { text: "Train (next combat: +25% damage for first 2 turns)", effect: (g) => {
                g.player._trainBonus = 2;
                return "Muscle memory restored.";
            } },
            { text: "Move on", effect: () => "No time to waste." }
        ]
    },
    {
        title: "CORRUPT GIFT",
        desc: "A crate bound in red tape. The label warns of side effects.",
        options: [
            { text: "Open (random Corrupted relic)", effect: (g) => {
                const pool = CORRUPTED_RELICS;
                const item = pool[Math.floor(Math.random() * pool.length)];
                g.player.addRelic(item);
                return "WARNING: " + item.name + " installed.";
            } },
            { text: "Destroy (+40 Fragments)", effect: (g) => { g.techFragments += 40; return "Melted for scrap."; } }
        ]
    },
    {
        title: "MEMORY SHARD",
        desc: "A shard of someone else's run. Study it to learn.",
        options: [
            { text: "Study (Unlock Random Dice Upgrade)", effect: (g) => {
                const available = Object.keys(DICE_UPGRADES).filter(k => !g.player.hasDiceUpgrade(k));
                if (available.length > 0) {
                    const up = available[Math.floor(Math.random() * available.length)];
                    g.player.diceUpgrades.push(up);
                    return "LEARNED: " + DICE_UPGRADES[up].name;
                }
                g.techFragments += 50;
                return "Nothing new. (+50 Frags)";
            } },
            { text: "Leave it", effect: () => "Their story stays buried." }
        ]
    },
    {
        title: "LIGHT SENTRY",
        desc: "An inactive sentry could be repurposed — at a cost.",
        options: [
            { text: "Repurpose (Gain a Minion)", effect: (g) => {
                if (g.player.minions.length < (g.player.maxMinions || 2)) {
                    const Minion = g._MinionClass || null;
                    if (Minion) {
                        const m = new Minion(0, 0, g.player.minions.length + 1, true);
                        g.player.minions.push(m);
                    }
                }
                return "New ally online.";
            } },
            { text: "Cannibalize (+30 Fragments)", effect: (g) => { g.techFragments += 30; return "Parts extracted."; } }
        ]
    },
    {
        title: "BROKEN BEACON",
        desc: "A damaged distress signal. Following it might bring help — or an ambush.",
        options: [
            { text: "Investigate (50% ambush, 50% +100 Fragments)", effect: (g) => {
                if (Math.random() < 0.5) { g.startCombat('elite'); return "AMBUSH! COMBAT_STARTED"; }
                g.techFragments += 100;
                return "You find a supply cache.";
            } },
            { text: "Mark and leave", effect: () => "Someone else's problem." }
        ]
    },
    {
        title: "FIRMWARE PIN",
        desc: "A piece of salvaged firmware can lock one dice slot to a chosen type for 3 turns next combat.",
        options: [
            { text: "Seal ATTACK (3 turns)",  effect: (g) => { if (g.sealDice) g.sealDice('ATTACK', 3);  return "ATTACK pinned for 3 turns."; } },
            { text: "Seal DEFEND (3 turns)",  effect: (g) => { if (g.sealDice) g.sealDice('DEFEND', 3);  return "DEFEND pinned for 3 turns."; } },
            { text: "Seal MINION (3 turns)",  effect: (g) => { if (g.sealDice) g.sealDice('MINION', 3);  return "MINION pinned for 3 turns."; } },
            { text: "Discard it", effect: () => "Firmware discarded." }
        ]
    }
];

/* =========================================
   CUSTOM RUN MODIFIERS (Roadmap Part 29)
   ----------------------------------------
   Data layer only — the selection UI on character select is feature-
   flagged off until balance playtesting. Modifier effects are applied
   via `applyCustomRunModifiers(runState, ids)` in game.js (to be
   written in Milestone 4). Each modifier:
     - id: stable string used in save state
     - kind: 'negative' | 'positive' | 'chaotic' — drives UI sorting
     - name: display name on the modifier card
     - desc: 1-line effect summary
     - payoutBonus: positive number (percentage) to apply as a multiplier
       bonus on final fragment payout; negative = reduction
     - Flags wired by Game._applyCustomRunModifiers:
         startHpPct, disableRest, dmgOutMult, dmgInMult, diceCount,
         disableReroll, fragDrainPerSector, relicPickDmg, disableLore,
         hotHandsDmg, startRelicCount, extraRerollPerTurn, bossHpMult,
         shopDiscountPct, hideIntentNumbers, attackCritVariance,
         relicPickDupe
   ========================================= */
const CUSTOM_RUN_MODIFIERS = [
    { id: 'hard_heart',    kind: 'negative', name: 'Low-Health Start',  desc: 'Start every run at 50% HP.',                        payoutBonus: 15, startHpPct: 0.5 },
    { id: 'no_rest',       kind: 'negative', name: 'Merciless',         desc: 'Rest nodes do nothing.',                            payoutBonus: 20, disableRest: true },
    { id: 'glass_cannon',  kind: 'negative', name: 'Glass Cannon',      desc: '+50% DMG dealt, +50% DMG taken.',                  payoutBonus: 20, dmgOutMult: 1.5, dmgInMult: 1.5 },
    { id: 'slim_dice',     kind: 'negative', name: 'Narrow Hand',       desc: 'Start with 3 dice instead of 4.',                  payoutBonus: 30, diceCount: 3 },
    { id: 'no_reroll',     kind: 'negative', name: 'Locked In',         desc: 'No rerolls available.',                            payoutBonus: 35, disableReroll: true },
    { id: 'tax_man',       kind: 'negative', name: 'Tax Man',           desc: '-10% fragments at each sector transition.',        payoutBonus: 15, fragDrainPerSector: 0.10 },
    { id: 'cursed_deck',   kind: 'negative', name: 'Cursed Relics',     desc: 'Each relic picked deals 3 DMG on acquire.',        payoutBonus: 25, relicPickDmg: 3 },
    { id: 'limit_lore',    kind: 'negative', name: 'Silent Chronicle',  desc: 'No lore unlocks this run.',                        payoutBonus: 10, disableLore: true },
    { id: 'hot_hands',     kind: 'negative', name: 'Hot Hands',         desc: 'First die played each turn costs 3 HP.',           payoutBonus: 15, hotHandsDmg: 3 },
    { id: 'starter_kit',   kind: 'positive', name: 'Starter Kit',       desc: 'Begin with 2 random common relics.',               payoutBonus: -30, startRelicCount: 2 },
    { id: 'extra_reroll',  kind: 'positive', name: 'Steady Hand',       desc: '+1 extra reroll per turn.',                        payoutBonus: -25, extraRerollPerTurn: 1 },
    { id: 'soft_bosses',   kind: 'positive', name: 'Soft Bosses',       desc: 'All bosses -20% HP.',                              payoutBonus: -40, bossHpMult: 0.8 },
    { id: 'free_shops',    kind: 'positive', name: 'Open Markets',      desc: 'Shop prices -30%.',                                payoutBonus: -25, shopDiscountPct: 0.3 },
    { id: 'double_or_none',kind: 'chaotic',  name: 'Double or None',    desc: 'Attack dice 50%: deal 2× or 0 damage.',            payoutBonus: 15, attackCritVariance: 'double_or_none' },
    { id: 'daily_dupes',   kind: 'chaotic',  name: 'Daily Dupes',       desc: 'Each relic is duplicated on pickup.',              payoutBonus: -15, relicPickDupe: true }
];

/* Feature flag for the Custom Runs UI. Part 29 effect-applier now covers
   every modifier in the data table above — flag flipped on. If a future
   modifier needs wiring, disable temporarily here while the handler lands. */
const FEATURE_CUSTOM_RUNS = true;

export { CONFIG, COLORS, SECTOR_CONFIG, SECTOR_MECHANICS, STATE, LORE_DATABASE, TUTORIAL_PAGES, POST_TUTORIAL_PAGES, TUTORIAL_NARRATION, PLAYER_CLASSES, DICE_TYPES, META_UPGRADES, UPGRADES_POOL, CORRUPTED_RELICS, GLITCH_MODIFIERS, DICE_UPGRADES, SIGNATURE_DICE, ENEMIES, BOSS_DATA, EVENTS_DB, SYNERGIES, CUSTOM_RUN_MODIFIERS, FEATURE_CUSTOM_RUNS };
