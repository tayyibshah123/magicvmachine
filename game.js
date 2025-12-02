/**
 * Protocol: Magic
 * Core Game Logic - Production Ready V1.4 (No Template Literals)
 */

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

const SECTOR_CONFIG = {
    1: { bgTop: '#050011', bgBot: '#100020', sun: ['#ffe600', '#ff0055'], grid: '#00f3ff33' }, 
    2: { bgTop: '#001115', bgBot: '#002025', sun: ['#ffffff', '#00f3ff'], grid: '#ffffff33' }, 
    3: { bgTop: '#150500', bgBot: '#250a00', sun: ['#ff8800', '#ff0000'], grid: '#ff440033' }
};

const STATE = {
    BOOT: 0, MENU: 1, MAP: 2, COMBAT: 3, REWARD: 4, GAMEOVER: 6, TUTORIAL: 7, META: 8, SHOP: 9, CHAR_SELECT: 10, EVENT: 11,
    INTEL: 12, HEX: 13,
    TUTORIAL_COMBAT: 14, STORY: 15
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
                 "<h3 class='neon-text-green' style='text-align:center; margin-top:20px;'>Protocol:Magic initialised</h3>" +
                 "<p style='text-align:center; font-weight:bold;'>Good luck.</p>"
    }
];

const PLAYER_CLASSES = [
    { 
        id: 'tactician', name: 'Tactician', icon: '♟️', color: '#00f3ff', 
        desc: 'Starts with 6 Dice.\nMinion: Pawn (+1 Reroll next turn on death)', 
        traits: { diceCount: 6, minionName: "Pawn", minionTrait: "Death: +1 Reroll next turn." } 
    },
    { 
        id: 'arcanist', name: 'Arcanist', icon: '🔮', color: '#bc13fe', 
        desc: 'Starts with 5 Base Mana.\nMinion: Mana Wisp (+1 Mana next turn on death)', 
        traits: { baseMana: 5, minionName: "Mana Wisp", minionTrait: "Death: +1 Mana next turn." } 
    },
    { 
        id: 'bloodstalker', name: 'Bloodstalker', icon: '🦇', color: '#ff0000', 
        desc: 'Lifesteal 2 HP on hit.\nTake +1 DMG from all sources.\nMinion: Blood Thrall (Heal Player 10HP on kill)', 
        traits: { lifesteal: true, vulnerable: true, minionName: "Blood Thrall", minionTrait: "Kill: Heals Player 10HP." } 
    },
    { 
        id: 'annihilator', name: 'Annihilator', icon: '💥', color: '#ff8800', 
        desc: 'Deal +50% DMG (All sources).\nNo Rerolls.\nMinion: Bomb Bot (Deals 10 DMG to enemies on death)', 
        traits: { dmgMultiplier: 1.5, noRerolls: true, minionName: "Bomb Bot", minionTrait: "Death: 10 DMG to Enemies." } 
    },
    { 
        id: 'sentinel', name: 'Sentinel', icon: '🛡️', color: '#ffffff', 
        desc: 'Start combat with 10 Shield.\nMinion: Guardian (Spawns with 10 Shield)', 
        traits: { startShield: 10, minionName: "Guardian", minionTrait: "Spawn: +10 Shield." } 
    },
    { 
        id: 'summoner', name: 'Summoner', icon: '🌿', color: '#00ff99', 
        desc: 'Starts with 1 Minion.\nMax 3 Minions.\nMinion: Spirit (30% Revive chance)', 
        traits: { startMinions: 1, maxMinions: 3, minionName: "Spirit", minionTrait: "Death: 30% Revive." } 
    }
];

const META_UPGRADES = [
    { id: 'm_life', name: "Gaia's Heart", desc: "Start runs with +10 Max HP.", cost: 400, icon: "💚" },
    { id: 'm_mana', name: "Deep Roots", desc: "Start runs with +1 Base Mana.", cost: 600, icon: "💠" },
    { id: 'm_greed', name: "Recycler", desc: "+20% Fragment gain.", cost: 800, icon: "♻️" },
    { id: 'm_start_frag', name: "Seed Capital", desc: "Start runs with 50 Fragments.", cost: 480, icon: "💰" },
    { id: 'm_thorn', name: "Thorns", desc: "Start runs with Spike Armor relic.", cost: 1200, icon: "🌵" },
    { id: 'm_reroll', name: "Tactical Link", desc: "+1 Reroll per turn.", cost: 1000, icon: "🎲" },
    { id: 'm_dmg', name: "Solar Flare", desc: "All attacks deal +1 Damage.", cost: 1500, icon: "☀️" },
    { id: 'm_minion_atk', name: "Nano-Swarm", desc: "Minions deal +1 Damage.", cost: 1100, icon: "🐝" },
    { id: 'm_shield', name: "Hardened Hull", desc: "Start combat with 10 Shield.", cost: 900, icon: "🛡️" },
    { id: 'm_relic', name: "Data Cache", desc: "Start run with a random Relic.", cost: 2000, icon: "💾" }
];

const UPGRADES_POOL = [
    { id: 'nano_shield', name: "Nano-Shield", desc: "Start combat with 5 Block.", icon: "🛡️" },
    { id: 'mana_syphon', name: "Mana Syphon", desc: "+1 Mana at start of turn.", icon: "🔮" },
    { id: 'repair', name: "Field Repair", desc: "Heal 25 HP (Instant).", icon: "💚", instant: true },
    { id: 'titan_module', name: "Titan Module", desc: "+25% Damage Output.", icon: "💪", rarity: 'gold' },
    { id: 'hull_plating', name: "Hull Plating", desc: "+15 Max HP.", icon: "⚙️", instant: true },
    { id: 'minion_core', name: "Minion Core", desc: "Start combat with 1 Wisp.", icon: "🌱" },
    { id: 'spike_armor', name: "Spike Armor", desc: "Deal 3 DMG when hit.", icon: "🌵" },
    { id: 'crit_lens', name: "Crit Lens", desc: "15% chance to deal Double Damage. (Max 5)", icon: "🎯" },
    { id: 'loot_bot', name: "Loot Bot", desc: "+20% Fragment gain.", icon: "💰" },
    { id: 'stim_pack', name: "Stim Pack", desc: "Heal 5 HP after combat.", icon: "💉" },
    { id: 'reroll_chip', name: "Reroll Chip", desc: "+1 Reroll per turn.", icon: "🎲" },
    { id: 'mana_battery', name: "Mana Battery", desc: "+1 Base Mana.", icon: "🔋", instant: true },
    { id: 'shield_gen', name: "Shield Gen", desc: "Gain 2 Block every turn.", icon: "🌫️" },
    { id: 'wisp_hp', name: "Wisp Vitality", desc: "Minions have +3 HP.", icon: "💖" },
    { id: 'second_life', name: "Second Life", desc: "Revive with 50% HP once.", icon: "✝️" },
    { id: 'voodoo_doll', name: "Voodoo Doll", desc: "Unlock 'Voodoo Curse' Dice.", icon: "🧶", rarity: 'red' },
    { id: 'overcharge_chip', name: "Overcharge Chip", desc: "Unlock 'Overcharge' Dice.", icon: "⚡", rarity: 'red' },
    { id: 'manifestor', name: "Manifestor", desc: "+1 Reward Choice. (Unique)", icon: "📜", rarity: 'gold' },
    { id: 'brutalize', name: "Brutalize", desc: "Killing a minion deals (its DMG + 3) to others.", icon: "😤" },
    { id: 'relentless', name: "Relentless", desc: "3rd Attack in a turn deals TRIPLE damage.", icon: "🔥" },

    // NEW UPGRADES
    { id: 'reckless_drive', name: "Reckless Drive", desc: "Unlock 'Reckless Charge' Dice.", icon: "🐂", rarity: 'red' },
    { id: 'static_field', name: "Static Field", desc: "Deal 5 DMG to random enemy at start of turn.", icon: "⚡" },
    { id: 'emergency_kit', name: "Emergency Kit", desc: "Heal 20% Max HP if you drop below 30% HP (Once/Combat).", icon: "⛑️" },
    { id: 'gamblers_chip', name: "Gambler's Chip", desc: "+1 Reroll, but -5 Max HP.", icon: "🎰" },
    { id: 'hologram', name: "Hologram", desc: "10% chance to dodge an attack completely.", icon: "👻" },
    { id: 'solar_battery', name: "Solar Battery", desc: "Every 3rd turn, gain increasing Mana. (1, 3, 5...)", icon: "☀️" },
    { id: 'neural_link', name: "Neural Link", desc: "Minions gain +2 HP and +1 DMG.", icon: "🔗" },
    { id: 'recycle_bin', name: "Recycle Bin", desc: "Gaining Mana also heals 1 HP.", icon: "♻️" },
    { id: 'firewall', name: "Firewall", desc: "First unblocked damage capped at 50. (Stacks lower cap)", icon: "🧱" },
    { id: 'thorn_mail', name: "Thorn Mail", desc: "Gain 1 Block whenever you deal damage.", icon: "🧥" },
    { id: 'data_miner', name: "Data Miner", desc: "Gain 5 Fragments if you end combat with full HP.", icon: "⛏️" }
];

const DICE_TYPES = {
    ATTACK: { icon: '🗡️', color: '#ff0055', desc: 'Deal 5 damage.\n[QTE]: Crit for x1.3', cost: 0, target: 'enemy' },
    DEFEND: { icon: '🛡️', color: '#00f3ff', desc: 'Gain 5 Shield.', cost: 0, target: 'self' },
    MANA:   { icon: '💠', color: '#ffd700', desc: 'Gain 1 Mana.', cost: 0, target: 'self' },
    MINION: { icon: '🌱', color: '#00ff99', desc: 'Summon Wisp.\nDrag to Wisp to UPGRADE.', cost: 0, target: 'any' },
    
    // CHANGED: Added QTE description
    EARTHQUAKE: { icon: '📉', color: '#ff8800', desc: 'Deal 5 DMG to ALL enemies.\n[QTE]: Crit for x1.3', cost: 2, isSkill: true, target: 'all_enemies' },
    METEOR:     { icon: '☄️', color: '#bc13fe', desc: 'Deal 30 DMG to target.\n[QTE]: Crit for x1.3', cost: 5, isSkill: true, target: 'enemy' },
    CONSTRICT:  { icon: '⛓️', color: '#ff0055', desc: 'Reduce Enemy Atk and Healing by 50% for 2 turns.', cost: 3, isSkill: true, target: 'enemy' },
    VOODOO:     { icon: '☠️', color: '#ff0000', desc: 'Apply Curse: Deal 100 Base DMG after 3 turns.', cost: 9, isSkill: true, locked: true, target: 'enemy' },
    OVERCHARGE: { icon: '⚡', color: '#ff4400', desc: 'Enemy: +25% Dmg Dealt, +50% Dmg Taken.', cost: 1, isSkill: true, locked: true, target: 'enemy' },
    
    RECKLESS_CHARGE: { icon: '🐂', color: '#ff2200', desc: 'Next Attack x2 DMG.\nTake x3 DMG until next turn.', cost: 2, isSkill: true, locked: true, target: 'self' }
};

const DICE_UPGRADES = {
    ATTACK:     { name: "Blade Storm", desc: "Deal 8 DMG. 25% chance to hit ALL enemies.", cost: 190, icon: "⚔️" },
    DEFEND:     { name: "Aegis Field", desc: "Gain 8 Shield. All allies gain 3 Shield.", cost: 175, icon: "🏰" },
    MANA:       { name: "Soul Battery", desc: "Gain 2 Mana and Heal 2 HP.", cost: 200, icon: "🔋" },
    MINION:     { name: "Alpha Call", desc: "Summon Level 2 Wisp.\n(+5 Block, +5 DMG)", cost: 200, icon: "🌳" },
    // CHANGED: Added QTE description
    EARTHQUAKE: { name: "Cataclysm", desc: "Deal 8 DMG to ALL. Apply WEAK (50% less dmg).\n[QTE]: Crit x1.3.", cost: 225, icon: "🌋" },
    METEOR:     { name: "Starfall", desc: "Deal 50 DMG. [QTE]: Crit x1.3.", cost: 350, icon: "🌠" },
    CONSTRICT:  { name: "Digital Rot", desc: "Reduce Atk/Heal by 75% for 3 turns.", cost: 250, icon: "🕸️" },
    VOODOO:     { name: "Void Curse", desc: "Apply Curse: After 3 turns, 50% chance for 500 Base DMG, else 100 Base DMG.", cost: 350, icon: "🕳️" },
    OVERCHARGE: { name: "Hyper Beam", desc: "Enemy takes +100% Damage from all sources.", cost: 300, icon: "☢️" },
    RECKLESS_CHARGE: { name: "Vicious Charge", desc: "Next Attack x3 DMG.\nTake +50% DMG until next turn.", cost: 500, icon: "👹" }
};

const ENEMIES = [
    // Sector 1
    { name: "Sentry Drone", hp: 30, dmg: 5, sector: 1 },
    { name: "Heavy Loader", hp: 45, dmg: 8, sector: 1 },
    { name: "Cyber Arachnid", hp: 40, dmg: 12, sector: 1 },
    // Sector 2
    { name: "Cryo Bot", hp: 60, dmg: 10, sector: 2 },
    { name: "Data Leech", hp: 50, dmg: 15, sector: 2 },
    { name: "Firewall Sentinel", hp: 80, dmg: 8, sector: 2 },
    // Sector 3
    { name: "Magma Construct", hp: 100, dmg: 18, sector: 3 },
    { name: "Core Guardian", hp: 120, dmg: 12, sector: 3 },
    { name: "Nullifier", hp: 90, dmg: 25, sector: 3 }
];

const BOSSES = {
    SECTOR1: { name: "Omega Core", hp: 300, dmg: 20 },
    SECTOR2: { name: "The Architect", hp: 500, dmg: 25 },
    SECTOR3: { name: "System Prime", hp: 800, dmg: 35 }
};

const EVENTS_DB = [
    {
        title: "STRANGE SIGNAL",
        desc: "You intercept an encrypted transmission. It seems to be a distress signal from a rogue AI.",
        options: [
            { 
                text: "Decrypt (-10 HP, +40 Fragments)", 
                effect: (g) => { 
                    g.player.takeDamage(10); 
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
                text: "Salvage Parts (+15 HP)", 
                effect: (g) => { 
                    g.player.heal(15); 
                    return "Restored 15 HP."; 
                } 
            }
        ]
    },
    // NEW EVENTS
    {
        title: "MALFUNCTIONING FABRICATOR",
        desc: "An unstable upgrade station sparks wildly. You might be able to force an upgrade, but it will hurt.",
        options: [
            { 
                text: "Force Upgrade (-20 HP)", 
                effect: (g) => { 
                    g.player.takeDamage(20);
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
                text: "Trade (-50 Fragments)", 
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
                text: "Absorb (-10 Max HP, +150 Fragments)", 
                effect: (g) => { 
                    g.player.maxHp -= 10;
                    if (g.player.currentHp > g.player.maxHp) g.player.currentHp = g.player.maxHp;
                    g.techFragments += 150;
                    return "Data absorbed. Integrity compromised.";
                } 
            },
            { text: "Purge (+20 HP)", effect: (g) => { g.player.heal(20); return "Node stabilized."; } }
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
    }
];

/* =========================================
   2. AUDIO MANAGER
   ========================================= */
const AudioMgr = {
    ctx: null,
    bgm: null,
    isMuted: false,

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    toggleMusic(enabled) {
        this.isMuted = !enabled;
        if (this.bgm) {
            if (this.isMuted) this.bgm.pause();
            else this.bgm.play().catch(e => console.log(e));
        } else if (enabled) {
            this.startMusic();
        }
    },

    startMusic() {
        // Initialize if missing
        if (!this.bgm) {
            this.bgm = new Audio('./lofi.mp3');
            this.bgm.loop = true;
            this.bgm.volume = 0.3;
        }
        
        // Try to play if muted conditions allow and it's currently not playing
        if (!this.isMuted && this.bgm.paused) {
            const playPromise = this.bgm.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Expected if user hasn't interacted yet. 
                    // The button clicks will trigger this again successfully.
                    console.log("Music waiting for interaction");
                });
            }
        }
    },

    playSound(type) {
        if (!this.ctx || this.isMuted) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        switch (type) {
            case 'attack': 
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                break;
            case 'hit': 
                const bSize = this.ctx.sampleRate * 0.2;
                const buffer = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
                const data = buffer.getChannelData(0);
                for (let i = 0; i < bSize; i++) data[i] = Math.random() * 2 - 1;
                const noise = this.ctx.createBufferSource();
                noise.buffer = buffer;
                const nGain = this.ctx.createGain();
                nGain.gain.setValueAtTime(0.5, t);
                nGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                noise.connect(nGain);
                nGain.connect(this.ctx.destination);
                noise.start(t);
                break;
            case 'defend':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, t);
                osc.frequency.linearRampToValueAtTime(600, t + 0.3);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.linearRampToValueAtTime(0, t + 0.3);
                osc.start(t);
                osc.stop(t + 0.3);
                break;
            case 'mana':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, t);
                osc.frequency.setValueAtTime(880, t + 0.1);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
                osc.start(t);
                osc.stop(t + 0.4);
                break;
            case 'buy':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1200, t);
                osc.frequency.setValueAtTime(1600, t + 0.05);
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
                break;
            case 'upgrade':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(100, t);
                osc.frequency.linearRampToValueAtTime(300, t + 1.0);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.linearRampToValueAtTime(0, t + 1.0);
                osc.start(t);
                osc.stop(t + 1.0);
                break;
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, t);
                gain.gain.setValueAtTime(0.05, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
                osc.start(t);
                osc.stop(t + 0.05);
                break;
            case 'explosion':
                const eSize = this.ctx.sampleRate * 0.5;
                const eBuf = this.ctx.createBuffer(1, eSize, this.ctx.sampleRate);
                const eDat = eBuf.getChannelData(0);
                for (let i = 0; i < eSize; i++) eDat[i] = Math.random() * 2 - 1;
                const eSrc = this.ctx.createBufferSource();
                eSrc.buffer = eBuf;
                const eGain = this.ctx.createGain();
                eGain.gain.setValueAtTime(1.0, t);
                eGain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
                eSrc.connect(eGain);
                eGain.connect(this.ctx.destination);
                eSrc.start(t);
                break;
        }
    }
};

/* =========================================
   3. CLASSES
   ========================================= */
class Entity {
    constructor(x, y, name, maxHp) {
        this.x = x;
        this.y = y;
        this.name = name;
        this.maxHp = maxHp;
        this.currentHp = maxHp;
        this.shield = 0;
        this.radius = 120;
        this.effects = [];
        this.anim = { type: 'idle', timer: 0, startVal: 0 };
    }

    // CHANGED: Added 'source' parameter to identify attacker
    takeDamage(amount, source = null) {
        let actualDmg = amount;

        // Apply Player Incoming Damage Multiplier
        if (this instanceof Player && this.incomingDamageMult > 1) {
            actualDmg = Math.floor(actualDmg * this.incomingDamageMult);
        }

        const overcharge = this.hasEffect('overcharge');
        if (overcharge) {
            const modifier = overcharge.val > 0 ? 2.0 : 1.5;
            actualDmg = Math.floor(actualDmg * modifier);
        }
        
        if (this.hasEffect('frail')) {
            actualDmg = Math.floor(actualDmg * 1.3);
        }

        // 1. Apply Shields
        if (this.shield > 0) {
            if (this.shield >= actualDmg) {
                this.shield -= actualDmg;
                actualDmg = 0;
            } else {
                actualDmg -= this.shield;
                this.shield = 0;
            }
        }

        // 2. Firewall Relic
        if (this instanceof Player && this.hasRelic('firewall') && !this.firewallTriggered && actualDmg > 0) {
            const stacks = this.relics.filter(r => r.id === 'firewall').length;
            const cap = 50 - ((stacks - 1) * 10); 
            
            if (actualDmg > cap) {
                actualDmg = cap;
                ParticleSys.createFloatingText(this.x, this.y - 140, "FIREWALL (" + cap + ")", COLORS.SHIELD);
            }
            this.firewallTriggered = true; 
        }
        
        if (this instanceof Player && this.traits.vulnerable && actualDmg > 0) {
            actualDmg += 1;
        }
        
        // Hologram Relic
        if (this instanceof Player && this.hasRelic('hologram') && Math.random() < 0.1) {
            actualDmg = 0;
            ParticleSys.createFloatingText(this.x, this.y - 60, "DODGE!", "#fff");
        }

        this.currentHp = Math.max(0, this.currentHp - actualDmg);
        
        this.playAnim('shake');
        ParticleSys.createExplosion(this.x, this.y, 15, (this instanceof Player) ? '#f00' : '#fff');
        
        if (actualDmg > 0) {
             ParticleSys.createFloatingText(this.x, this.y - 60, "-" + actualDmg, '#ff3333');
             AudioMgr.playSound('hit');
        } else {
             if (amount > 0) ParticleSys.createFloatingText(this.x, this.y - 60, "BLOCKED", COLORS.SHIELD);
             AudioMgr.playSound('defend');
        }

        if(this instanceof Player && actualDmg > 0) {
            Game.shake(5);
            
            // FIX: Spike Logic (Target the source of damage)
            if(this.hasRelic('spike_armor')) {
                let spikeDmg = 3;
                const spikes = this.relics.filter(r => r.id === 'spike_armor').length;
                spikeDmg *= spikes;
                
                // Determine target: Source -> Enemy -> null
                const target = source || Game.enemy;
                
                if (target && target.currentHp > 0) {
                    ParticleSys.createFloatingText(this.x, this.y - 120, "SPIKES!", COLORS.GOLD);
                    
                    // Deal damage back
                    if(target.takeDamage(spikeDmg)) {
                        // Handle Spike Kill
                        if (target === Game.enemy) {
                            Game.winCombat();
                        } else {
                            // It was a minion
                            Game.enemy.minions = Game.enemy.minions.filter(m => m !== target);
                            if(Game.player.hasRelic('brutalize') && !target.isPlayerSide) {
                                Game.triggerBrutalize(target);
                            }
                        }
                    }
                }
            }
            
            if (this.hasRelic('emergency_kit') && !this.emergencyKitUsed && this.currentHp < (this.maxHp * 0.3)) {
                // CHANGED: Heal 20% of Max HP instead of flat 15
                const healAmt = Math.floor(this.maxHp * 0.2);
                this.heal(healAmt);
                this.emergencyKitUsed = true; 
                ParticleSys.createFloatingText(this.x, this.y - 140, "EMERGENCY KIT", COLORS.NATURE_LIGHT);
            }
        }
        
        return this.currentHp <= 0;
    }

    heal(amount) {
        let actualHeal = amount;
        
        const constrict = this.hasEffect('constrict');
        if (constrict) {
            // Apply the reduction (val is the multiplier, e.g. 0.5)
            const oldHeal = actualHeal;
            actualHeal = Math.floor(actualHeal * constrict.val);
            
            // Visual feedback if healing was actually reduced
            if (actualHeal < oldHeal) {
                ParticleSys.createFloatingText(this.x, this.y - 120, "HEALING STIFLED", "#ff0000");
            }
        }
        
        // Prevent negative healing
        actualHeal = Math.max(0, actualHeal);

        this.currentHp = Math.min(this.maxHp, this.currentHp + actualHeal);
        
        // Show the final heal amount
        ParticleSys.createFloatingText(this.x, this.y - 80, "+" + actualHeal, '#0f0');
        AudioMgr.playSound('mana');
    }

    addShield(amount) {
        this.shield += amount;
        this.playAnim('pulse');
    }

    addEffect(id, duration, val, icon, desc, displayName = null) {
        const existing = this.effects.find(e => e.id === id);
        const name = displayName || id.toUpperCase();
        
        if (existing) {
            existing.duration = Math.max(existing.duration, duration);
            
            // FIX: Force update the display name if provided (e.g. Constrict -> Digital Rot)
            if (displayName) {
                existing.name = displayName; 
            }
            
            if (id === 'constrict') {
                existing.val = existing.val * val;
                ParticleSys.createFloatingText(this.x, this.y - 120, "EFFECT STACKED", "#ff00ff");
            } 
            else if (id === 'weak') {
                 if (val < existing.val) existing.val = val;
            } else {
                 if (val > existing.val) existing.val = val; 
            }
        } else {
            this.effects.push({ id, duration, val, icon, desc, name: name });
            ParticleSys.createFloatingText(this.x, this.y - 100, name, '#ff00ff');
        }
    }

    updateEffects() {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.duration--;
            
            if (e.id === 'voodoo' && e.duration <= 0) {
                let dmg = e.val;
                
                // Upgraded Version (Void Curse) logic
                if (dmg === 0) { 
                    let base = 100;
                    if (Math.random() < 0.5) {
                        base = 500;
                        ParticleSys.createFloatingText(this.x, this.y - 50, "VOID CRUSH!", "#f00");
                    }
                    // Apply modifiers at time of detonation for Void Curse
                    // We access Game.player to get the current modifiers
                    dmg = Game.calculateCardDamage(base);
                }
                
                this.takeDamage(dmg);
                ParticleSys.createFloatingText(this.x, this.y, "CURSE TRIGGERED!", "#f00");
                AudioMgr.playSound('explosion');
            }
        }
        this.effects = this.effects.filter(e => e.duration > 0);
    }

    hasEffect(id) {
        return this.effects.find(e => e.id === id);
    }

    playAnim(type) {
        this.anim.type = type;
        this.anim.timer = 15;
    }
}

class Player extends Entity {
    constructor(classConfig) {
        super(540, 1150, classConfig.name, 100); 
        this.classColor = classConfig.color || '#00ff99'; 
        this.traits = classConfig.traits || {};
        this.baseMana = this.traits.baseMana || 3;
        
        if(Game.hasMetaUpgrade('m_life')) this.maxHp += 10;
        if(Game.hasMetaUpgrade('m_mana')) this.baseMana += 1;
        if(Game.hasMetaUpgrade('m_thorn')) this.addRelic({ id: 'spike_armor', name: "Spike Armor", desc: "Meta Upgrade", icon: "🌵" });
        if(Game.hasMetaUpgrade('m_relic')) {
            const pool = [...UPGRADES_POOL];
            const randomRelic = pool[Math.floor(Math.random() * pool.length)];
            this.addRelic(randomRelic);
        }
        
        this.currentHp = this.maxHp;
        this.mana = this.baseMana;
        this.diceCount = this.traits.diceCount || 5;
        this.maxMinions = this.traits.maxMinions || 2;
        
        this.minions = [];
        this.relics = [];
        this.diceUpgrades = [];
	this.nextAttackMult = 1;
        this.incomingDamageMult = 1;
        
        if (this.traits.startMinions) {
            for(let i=0; i<this.traits.startMinions; i++) {
                 this.minions.push(new Minion(0, 0, i+1, true));
            }
        }
    }
    
    addRelic(relic) {
        this.relics.push(relic);
        Game.renderRelics(); 
    }
    
    hasRelic(id) {
        return this.relics.find(r => r.id === id);
    }
    
    hasDiceUpgrade(type) {
        return this.diceUpgrades.includes(type);
    }
}

class Minion extends Entity {
    constructor(x, y, id, isPlayerSide) {
        // FIX: Replaced backticks with standard string concatenation
        let name = isPlayerSide ? "Wisp Lv." + id : "Bot Unit " + id;
        
        if (isPlayerSide && Game.player) {
             name = Game.player.traits.minionName + " " + id;
             
             if (Game.player.traits.minionName === "Bug") {
                 this.dmg = 99;
                 this.maxHp = 1;
                 this.currentHp = 1;
             }
        }
        
        super(x, y, name, 5);
        this.radius = 50;
        this.dmg = isPlayerSide ? 1 : 2;
        
        if (isPlayerSide && Game.hasMetaUpgrade('m_minion_atk')) {
            this.dmg += 1;
        }

        this.level = 1;
        this.isPlayerSide = isPlayerSide;
        
        if(isPlayerSide && Game.player && Game.player.hasRelic('wisp_hp')) {
            const stacks = Game.player.relics.filter(r => r.id === 'wisp_hp').length;
            this.maxHp += (3 * stacks);
            this.currentHp += (3 * stacks);
        }
    }

    upgrade() {
        this.maxHp += 2;
        this.currentHp += 2;
        this.dmg += 1;
        this.level++;
        ParticleSys.createFloatingText(this.x, this.y - 80, "UPGRADE!", COLORS.GOLD);
        this.playAnim('pulse');
        AudioMgr.playSound('upgrade');
    }
}

class Enemy extends Entity {
    constructor(template, level, isElite = false) {
        const scaler = 1 + (level * 0.15);
        super(540, 550, template.name, Math.floor(template.hp * scaler));
        this.baseDmg = Math.floor(template.dmg * scaler);
        this.isBoss = template.name.includes("Omega") || template.name.includes("Architect") || template.name.includes("Prime");
        this.minions = [];
        this.nextIntent = null; 
        this.phase = 1;
        this.isElite = isElite;
        this.showIntent = false;
        
        this.affixes = [];
        if (this.isElite) {
            const roll = Math.random();
            if (roll < 0.33) this.affixes.push('Shielded');
            else if (roll < 0.66) this.affixes.push('Second Wind');
            else this.affixes.push('Jammer');
        }
        this.secondWindTriggered = false;
    }

    getEffectiveDamage() {
        let dmg = this.baseDmg;
        
        const constrict = this.hasEffect('constrict');
        if (constrict) {
            dmg = Math.floor(dmg * constrict.val);
        }
        
        const weak = this.hasEffect('weak');
        if (weak) {
            dmg = Math.floor(dmg * 0.5); 
        }

        const overcharge = this.hasEffect('overcharge');
        if (overcharge) {
            // FIX: val 0 = Base Overcharge (1.25x Damage Dealt)
            // FIX: val 1 = Hyper Beam (No Damage Dealt increase, only Damage Taken increase)
            if (overcharge.val === 0) {
                dmg = Math.floor(dmg * 1.25);
            }
        }
        
        return Math.max(0, dmg);
    }

    takeDamage(amount) {
        const dead = super.takeDamage(amount);
        if (dead && this.affixes.includes('Second Wind') && !this.secondWindTriggered) {
            this.secondWindTriggered = true;
            this.currentHp = Math.floor(this.maxHp * 0.5);
            ParticleSys.createFloatingText(this.x, this.y - 100, "SECOND WIND!", COLORS.GOLD);
            AudioMgr.playSound('upgrade');
            return false;
        }
        return dead;
    }

    decideTurn() {
        let target = Game.player;
        const targets = [Game.player, ...Game.player.minions];
        if (targets.length > 1) {
            target = targets[Math.floor(Math.random() * targets.length)];
        }

        const isLowHp = this.currentHp < this.maxHp * 0.3;
        const roll = Math.random();

        let secondary = null;
        if (roll < 0.4) {
             const subRoll = Math.random();
             if (subRoll < 0.5) {
                 secondary = { type: 'buff', id: 'empower' };
             } else {
                 secondary = { type: 'debuff', id: Math.random() < 0.5 ? 'weak' : 'frail' };
             }
        }

        if (isLowHp) {
            this.nextIntent = { type: 'heal', val: Math.floor(this.maxHp * 0.1), target: this };
        } else if (this.minions.length < 2 && roll < 0.25) {
            this.nextIntent = { type: 'summon', val: 0, target: null, secondary: secondary };
        } else {
            this.nextIntent = { type: 'attack', val: this.baseDmg, target: target, secondary: secondary };
        }
        this.updateIntentValues();
    }

    updateIntentValues() {
        if (!this.nextIntent) return;

        if (this.nextIntent.type === 'attack') {
            this.nextIntent.val = this.getEffectiveDamage();
        } 
        else if (this.nextIntent.type === 'heal') {
            let healAmt = Math.floor(this.maxHp * 0.1);
            
            const constrict = this.hasEffect('constrict');
            if (constrict) {
                healAmt = Math.floor(healAmt * constrict.val);
            }
            
            this.nextIntent.val = healAmt;
        }
    }
    
    checkPhase() {
        if (!this.isBoss) return;
        if (this.phase === 1 && this.currentHp < this.maxHp * 0.7) {
            this.phase = 2;
            ParticleSys.createExplosion(this.x, this.y, 50, '#f0f');
            AudioMgr.playSound('explosion');
            this.decideTurn();
        } else if (this.phase === 2 && this.currentHp < this.maxHp * 0.35) {
            this.phase = 3;
            this.baseDmg = Math.floor(this.baseDmg * 1.3);
            ParticleSys.createExplosion(this.x, this.y, 80, '#f00');
            AudioMgr.playSound('explosion');
            this.decideTurn();
        }
    }
}

const ParticleSys = {
    particles: [],
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.life -= dt;
            p.x += p.vx;
            p.y += p.vy;
            p.alpha = p.life / p.maxLife;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    },
    draw(ctx) {
        ctx.save();
        for (let p of this.particles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            if(p.text) {
                ctx.font = "bold 40px 'Orbitron'";
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 10;
                ctx.textAlign = 'center';
                ctx.fillText(p.text, p.x, p.y);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    },
    createExplosion(x, y, count, color) {
        for(let i=0; i<count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 12,
                vy: (Math.random() - 0.5) * 12,
                life: 0.6, maxLife: 0.6,
                size: Math.random() * 5 + 2,
                color: color, alpha: 1
            });
        }
    },
    createFloatingText(x, y, text, color) {
        this.particles.push({
            x: x, y: y, vx: 0, vy: -2, life: 1.0, maxLife: 1.0,
            size: 0, color: color, text: text, alpha: 1
        });
    }
};

const TooltipMgr = {
    el: null,
    init() { this.el = document.getElementById('tooltip'); },
    show(text, x, y) {
        if(!this.el) return;
        this.el.innerHTML = text;
        this.el.classList.remove('hidden');
        
        const rect = this.el.getBoundingClientRect();
        let top = y - rect.height - 25;
        let left = x - rect.width / 2;
        if (left < 10) left = 10;
        if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
        if (top < 10) top = y + 40;
        
        this.el.style.top = `${top}px`;
        this.el.style.left = `${left}px`;
    },
    hide() { if(this.el) this.el.classList.add('hidden'); }
};

const Game = {
    canvas: null, ctx: null, lastTime: 0, currentState: STATE.BOOT,
    player: null, enemy: null, techFragments: 0,
    dicePool: [], rerolls: 2, shakeTime: 0, mouseX: 0, mouseY: 0,
    map: { nodes: [], currentIdx: -1 },
    turnCount: 0,
    attacksThisTurn: 0,
    tutorialPage: 0,
    currentHoverEntity: null,
    effects: [],
    
    qte: {
        active: false,
        type: null, 
        targetX: 0,
        targetY: 0,
        radius: 0,
        maxRadius: 100,
        timer: 0,
        callback: null
    },

    metaUpgrades: [],
    
    dragState: {
        active: false,
        die: null,
        dieElement: null,
        ghostElement: null,
        startX: 0,
        startY: 0
    },

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CONFIG.CANVAS_WIDTH;
        this.canvas.height = CONFIG.CANVAS_HEIGHT;
        this.shopInventory = null;
	
	this.tutorialStep = 0; // Track tutorial progress
	this.tutorialData = TUTORIAL_PAGES; // NEW: Default to standard help

        try {
            // Load Meta Data
            const savedFrags = localStorage.getItem('mvm_fragments');
            this.techFragments = savedFrags ? parseInt(savedFrags) : 0;
            
            const savedMeta = localStorage.getItem('mvm_upgrades');
            this.metaUpgrades = savedMeta ? JSON.parse(savedMeta) : [];

            const savedEncrypted = localStorage.getItem('mvm_encrypted');
            this.encryptedFiles = savedEncrypted ? parseInt(savedEncrypted) : 0;

            const savedLore = localStorage.getItem('mvm_lore');
            this.unlockedLore = savedLore ? JSON.parse(savedLore) : [];
            
            // CHECK ACTIVE RUN
            const saveFile = localStorage.getItem('mvm_save_v1');
            // CHANGED: Target the new unique ID
            const btnLoad = document.getElementById('btn-load-save');
            
            if (saveFile && saveFile !== "null") {
                if (btnLoad) {
                    btnLoad.classList.remove('hidden');
                    btnLoad.style.display = "inline-block"; 
                    const data = JSON.parse(saveFile);
                    btnLoad.innerText = "RESUME SECTOR " + (data.sector || 1);
                }
            } else {
                if (btnLoad) btnLoad.style.display = "none";
            }

        } catch (e) {
            console.warn("LocalStorage error:", e);
            this.techFragments = 0;
            this.metaUpgrades = [];
        }

        this.effects = [];

        document.getElementById('run-fragments').innerText = this.techFragments;
        document.getElementById('fragment-count').innerText = `Fragments: ${this.techFragments}`;

        const unlockAudio = () => {
            AudioMgr.init();
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };
        window.addEventListener('click', unlockAudio);
        window.addEventListener('touchstart', unlockAudio);

        this.bindEvents();
        TooltipMgr.init();
        this.changeState(STATE.MENU);
        requestAnimationFrame(this.loop.bind(this));
    },

    bindEvents() {
        const d = document;
        
        // HELPER: Clean Click Handler for Mobile/Desktop
        const attachButtonEvent = (id, callback) => {
            const btn = d.getElementById(id);
            if (!btn) return;

            // Handle Touch Start (Stop propagation immediately)
            btn.addEventListener('touchstart', (e) => {
                e.stopPropagation(); 
            }, { passive: false });

            // Handle Click
            btn.onclick = (e) => {
                e.stopPropagation(); 
                e.preventDefault();  
                btn.blur(); 
                TooltipMgr.hide();
                AudioMgr.playSound('click');
                callback(e);
            };
        };

        // --- BUTTON BINDINGS ---

        // Resume & Pause
        attachButtonEvent('btn-load-save', () => this.loadGame());
        attachButtonEvent('btn-resume', () => d.getElementById('modal-settings').classList.add('hidden'));

        // Main Menu
        attachButtonEvent('btn-start', () => this.goToCharSelect());
        attachButtonEvent('btn-back-char', () => this.changeState(STATE.MENU));
        
        attachButtonEvent('btn-tutorial-mode', () => this.startTutorial());
        
        attachButtonEvent('btn-finish-story', () => { 
            AudioMgr.startMusic(); 
            this.changeState(STATE.MENU); 
        });

        attachButtonEvent('btn-debrief', () => {
            this.tutorialData = TUTORIAL_PAGES;
            this.changeState(STATE.TUTORIAL); 
        });
        attachButtonEvent('btn-back-tutorial', () => {
            this.tutorialData = TUTORIAL_PAGES;
            this.changeState(STATE.MENU); 
        });

        attachButtonEvent('btn-intel', () => this.changeState(STATE.INTEL));
        attachButtonEvent('btn-back-intel', () => this.changeState(STATE.MENU));
        attachButtonEvent('btn-decrypt', () => this.startHexBreach());
        
        attachButtonEvent('btn-upgrades', () => {
            this.renderMeta();
            this.changeState(STATE.META);
        });

        attachButtonEvent('btn-back-meta', () => {
            const screen = d.getElementById('screen-meta');
            const btn = d.getElementById('btn-view-sanctuary');
            
            screen.classList.remove('viewing-mode');
            btn.innerText = "👁️ VIEW WORLD";
            
            // Clear inline styles
            d.getElementById('upgrade-list').style.opacity = "";
            d.getElementById('fragment-count').style.opacity = "";
            const h2 = d.querySelector('#screen-meta h2');
            if(h2) h2.style.opacity = "";
            
            this.changeState(STATE.MENU);
        });

        attachButtonEvent('btn-view-sanctuary', () => {
            const screen = d.getElementById('screen-meta');
            const btn = d.getElementById('btn-view-sanctuary');
            if (screen.classList.contains('viewing-mode')) {
                screen.classList.remove('viewing-mode');
                btn.innerText = "👁️ VIEW WORLD";
            } else {
                screen.classList.add('viewing-mode');
                btn.innerText = "🔙 RESTORE UI";
            }
            AudioMgr.playSound('click');
        });

        attachButtonEvent('btn-reroll', () => this.rerollDice());
        
        attachButtonEvent('btn-end-turn', () => {
            this.dicePool.forEach(d => d.selected = false);
            this.renderDiceUI();
            this.endTurn();
        });

        attachButtonEvent('btn-settings', () => d.getElementById('modal-settings').classList.remove('hidden'));
        attachButtonEvent('btn-settings-main', () => d.getElementById('modal-settings').classList.remove('hidden'));
        attachButtonEvent('btn-quit', () => this.quitRun());
        attachButtonEvent('btn-menu', () => this.changeState(STATE.MENU));
        
        d.getElementById('chk-music').onchange = (e) => AudioMgr.toggleMusic(e.target.checked);
        
        attachButtonEvent('btn-tut-next', () => this.nextTutorial());
        attachButtonEvent('btn-tut-prev', () => this.prevTutorial());
        attachButtonEvent('btn-leave-shop', () => this.leaveShop());

        attachButtonEvent('btn-rest-sleep', () => this.handleRest('sleep'));
        attachButtonEvent('btn-rest-meditate', () => this.handleRest('meditate'));
        attachButtonEvent('btn-rest-tinker', () => this.handleRest('tinker'));

        const relicBtn = d.getElementById('btn-relics');
        if (relicBtn) {
            relicBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
            relicBtn.onclick = (e) => {
                e.stopPropagation();
                relicBtn.blur();
                AudioMgr.playSound('click');
                const el = d.getElementById('relic-dropdown');
                if (el.classList.contains('hidden')) {
                    el.classList.remove('hidden');
                    el.classList.add('active');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('active');
                }
            };
        }

        // --- GLOBAL CLICK HANDLER (Must be inside bindEvents) ---
        window.addEventListener('click', (e) => {
            const el = d.getElementById('relic-dropdown');
            const btn = d.getElementById('btn-relics');
            
            // 1. Close Dropdown
            if(el && !el.classList.contains('hidden') && e.target !== btn && !el.contains(e.target)) {
                el.classList.add('hidden');
                el.classList.remove('active');
            }
            
            // 2. Tutorial Step 0 Advance
            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                if (this.tutorialStep === 0) {
                    AudioMgr.playSound('click');
                    this.tutorialStep++;
                    this.updateTutorialStep();
                }
            }
        });

        // --- MOBILE TUTORIAL ADVANCE ---
        const tutorialOverlay = d.getElementById('tutorial-overlay');
        if (tutorialOverlay) {
            tutorialOverlay.addEventListener('touchstart', (e) => {
                if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    AudioMgr.playSound('click');
                    this.tutorialStep++;
                    this.updateTutorialStep();
                }
            }, { passive: false });
        }

        // --- CANVAS INTERACTIONS ---
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            this.mouseX = (e.clientX - rect.left) * scaleX;
            this.mouseY = (e.clientY - rect.top) * scaleY;
            this.handleCanvasHover(e.clientX, e.clientY);
        });
        
        const handleInteraction = (e) => {
             if (this.qte.active) { this.checkQTE(); return; }
             if (this.dragState.active) return;

             // Update coords for click/tap interactions
             const rect = this.canvas.getBoundingClientRect();
             const scaleX = this.canvas.width / rect.width;
             const scaleY = this.canvas.height / rect.height;
             
             let clientX = e.clientX;
             let clientY = e.clientY;
             if(e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
             } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
             }

             if (clientX) {
                this.mouseX = (clientX - rect.left) * scaleX;
                this.mouseY = (clientY - rect.top) * scaleY;
             }

             if ((this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT) && this.enemy && this.enemy.currentHp > 0) {
                const dist = Math.hypot(this.mouseX - this.enemy.x, this.mouseY - this.enemy.y);
                if (dist < this.enemy.radius) {
                    this.enemy.showIntent = !this.enemy.showIntent;
                    if (this.enemy.showIntent) {
                        ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "INTENT REVEALED", COLORS.MANA);
                        AudioMgr.playSound('click');
                        
                        if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 1) {
                            this.tutorialStep = 2;
                            this.updateTutorialStep();
                        }
                    }
                }
            }
        };

        this.canvas.addEventListener('mousedown', handleInteraction);
        this.canvas.addEventListener('touchstart', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            if(e.touches[0]) {
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                this.mouseX = (e.touches[0].clientX - rect.left) * scaleX;
                this.mouseY = (e.touches[0].clientY - rect.top) * scaleY;
            }
            handleInteraction(e);
        }, {passive: false});

        let dragRaf = null;
        window.addEventListener('pointermove', (e) => {
            if (this.dragState.active && this.dragState.ghostElement) {
                if(e.cancelable) e.preventDefault();
                const cx = e.clientX;
                const cy = e.clientY;
                if (!dragRaf) {
                    dragRaf = requestAnimationFrame(() => {
                        if (this.dragState.ghostElement) {
                            this.dragState.ghostElement.style.transform = `translate(${cx - 32}px, ${cy - 32}px) scale(1.1) rotate(5deg)`;
                        }
                        dragRaf = null;
                    });
                }
            }
        }, { passive: false });

        window.addEventListener('pointerup', (e) => {
            if (this.dragState.active) {
                this.handleDragEnd(e);
                if(dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
            }
        });
        
        window.addEventListener('pointercancel', (e) => {
            if (this.dragState.active) {
                this.handleDragEnd(e);
                if(dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
            }
        });
    },

    hasMetaUpgrade(id) {
        return this.metaUpgrades.includes(id);
    },

    handleCanvasHover(screenX, screenY) {
        if(this.currentState !== STATE.COMBAT && this.currentState !== STATE.TUTORIAL_COMBAT) { TooltipMgr.hide(); return; }
        if (this.dragState.active || this.qte.active) { TooltipMgr.hide(); return; }

        let hoveredEntity = null;
        
        const entities = [];
        if(this.enemy) { entities.push(this.enemy); entities.push(...this.enemy.minions); }
        if(this.player) { entities.push(this.player); entities.push(...this.player.minions); }

        for(let ent of entities) {
            if(!ent || ent.currentHp <= 0) continue;
            const dist = Math.hypot(this.mouseX - ent.x, this.mouseY - ent.y);
            if(dist < ent.radius) {
                hoveredEntity = ent;
                let txt = `<strong>${ent.name}</strong>\nHP: ${ent.currentHp}/${ent.maxHp}`;
                if(ent.shield > 0) txt += `\nShield: ${ent.shield}`;
                
                if(ent instanceof Player) {
                    txt += `\nMana: ${ent.mana}/${ent.baseMana}`;

                    // FIX: Display Active Charge/Multipliers
                    if (ent.nextAttackMult > 1) {
                        txt += `\n\n🔥 CHARGED: Next Atk x${ent.nextAttackMult}`;
                    }
                    if (ent.incomingDamageMult > 1) {
                        // Format nicely: 1.5 becomes "+50%", 3 becomes "x3"
                        const val = ent.incomingDamageMult === 1.5 ? "+50%" : `x${ent.incomingDamageMult}`;
                        txt += `\n⚠️ VULNERABLE: Taking ${val} Dmg`;
                    }
                }

                // Standard Effects
                if(ent.effects.length > 0) {
                    txt += `\n\n--- EFFECTS ---`;
                    ent.effects.forEach(eff => {
                        // CHANGED: Use eff.name instead of eff.id
                        txt += `\n${eff.icon} ${eff.name} (${eff.duration}t): ${eff.desc || ''}`;
                    });
                }

                if(ent instanceof Enemy) {
                    txt += "\n(Left Click to toggle targets)";
                    if(ent.nextIntent) {
                        const i = ent.nextIntent;
                        txt += `\n\nIntent: ${i.type.toUpperCase()}`;
                        if(i.val > 0) txt += ` (${i.val})`;
                        
                        if(i.secondary) {
                            if(i.secondary.type === 'buff') {
                                txt += `\n+ BUFF: ${this.enemy.isElite || this.enemy.isBoss ? 'Protocol+' : 'Protocol'}`;
                            } else if (i.secondary.type === 'debuff') {
                                txt += `\n+ HACK: ${i.secondary.id.toUpperCase()}`;
                            }
                        }
                    }
                }
                if(ent instanceof Minion) {
                    txt += `\nAtk: ${ent.dmg}`;
                    if (ent.isPlayerSide && Game.player.traits.minionTrait) {
                        txt += `\n${Game.player.traits.minionTrait}`;
                    }
                }
                TooltipMgr.show(txt, screenX, screenY);
                break;
            }
        }
        
        if (hoveredEntity !== this.currentHoverEntity) {
            this.currentHoverEntity = hoveredEntity;
            if (hoveredEntity) {
                AudioMgr.playSound('click');
            }
        }

        if(!hoveredEntity) TooltipMgr.hide();
    },

    startDrag(e, die, el) {
        // 1. Prevent default browser behavior (scrolling/zooming)
        if (e.cancelable) e.preventDefault();
        
        if (die.used || this.qte.active) return;

        // 2. FAILSAFE: If a previous drag got stuck, clean it up now.
        if (this.dragState.active) {
            if (this.dragState.ghostElement) {
                this.dragState.ghostElement.remove();
            }
            // Reset opacity of the previous die if it was stuck
            if (this.dragState.dieElement) {
                this.dragState.dieElement.style.opacity = '1';
            }
        }
        
        this.dragState.active = true;
        this.dragState.die = die;
        this.dragState.dieElement = el;
        
        // 3. Unified coordinate handling (Mouse vs Touch)
        let clientX = e.clientX;
        let clientY = e.clientY;
        if(e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        this.dragState.startX = clientX;
        this.dragState.startY = clientY;
        
        // 4. Create Ghost Element
        const ghost = el.cloneNode(true);
        ghost.style.position = 'fixed';
        // FIX: Z-Index 5000 ensures it floats above Tutorial HUD and Text
        ghost.style.zIndex = '5000'; 
        ghost.style.pointerEvents = 'none'; 
        ghost.style.opacity = '0.9';
        ghost.style.transition = 'none';
        
        // Initial position off-center to see under finger
        ghost.style.left = '0';
        ghost.style.top = '0';
        ghost.style.transform = `translate(${clientX - 32}px, ${clientY - 32}px) scale(1.1) rotate(5deg)`;
        
        document.body.appendChild(ghost);
        this.dragState.ghostElement = ghost;

        el.style.opacity = '0.2';
        AudioMgr.playSound('click');
    },

    handleDragEnd(e) {
        TooltipMgr.hide();

        if (!this.dragState.active) return;
        
        // Calculate drop coordinates (Mouse or Touch)
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        let clientX = e.clientX;
        let clientY = e.clientY;
        if ((isNaN(clientX) || clientX === undefined) && e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }

        // Update internal game mouse position to where the drop happened
        this.mouseX = (clientX - rect.left) * scaleX;
        this.mouseY = (clientY - rect.top) * scaleY;

        const dist = Math.hypot(clientX - this.dragState.startX, clientY - this.dragState.startY);
        
        // Cleanup Ghost
        if (this.dragState.ghostElement) {
            this.dragState.ghostElement.remove();
            this.dragState.ghostElement = null;
        }
        if (this.dragState.dieElement) {
            this.dragState.dieElement.style.opacity = '1';
        }

        if (dist < 10) {
            // Click/Tap: Select for Reroll
            const die = this.dragState.die;
            if(die && !this.player.traits.noRerolls) {
                die.selected = !die.selected;
                this.renderDiceUI();
                AudioMgr.playSound('click');
            }
        } else {
            // Drag Drop: Use Ability
            const target = this.getDropTarget();
            
            // FIX: Allow useDie if we have a valid target OR if it's a MINION die (which targets the ground)
            if (target || this.dragState.die.type === 'MINION') {
                this.useDie(this.dragState.die, this.dragState.dieElement, target);
            }
        }

        this.dragState.active = false;
        this.dragState.die = null;
        this.dragState.dieElement = null;
    },

    getDropTarget() {
        const entities = [];
        if(this.enemy) { entities.push(this.enemy); entities.push(...this.enemy.minions); }
        if(this.player) { entities.push(this.player); entities.push(...this.player.minions); }

        for(let ent of entities) {
            if(!ent || ent.currentHp <= 0) continue;
            const dist = Math.hypot(this.mouseX - ent.x, this.mouseY - ent.y);
            if(dist < ent.radius + 20) {
                return ent;
            }
        }
        return null;
    },

    startQTE(type, x, y, callback) {
        return new Promise(resolve => {
            this.qte = {
                active: true,
                type: type,
                targetX: x,
                targetY: y,
                maxRadius: 100,
                radius: 100,
                timer: 0,
                callback: callback || resolve
            };
            
            // FIX: Force render immediately
            this.drawQTE();

            // FAILSAFE: If QTE gets stuck for 5 seconds, force resolve it
            setTimeout(() => {
                if (this.qte.active && (this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT)) {
                    console.log("QTE Failsafe Triggered");
                    this.resolveQTE('fail'); 
                }
            }, 5000);
        });
    },

    updateQTE(dt) {
        if (!this.qte.active) return;

        let shrinkSpeed = 160; // Base speed

        // TIME DILATION: Slow down when inside the "Sweet Spot"
        // The target radius for a perfect hit is 30 pixels.
        const dist = Math.abs(this.qte.radius - 30);
        
        // If we are close to the target (within 25px), slow down time
        if (dist < 25) { 
            shrinkSpeed = 40; // 4x Slower
            
            // In Tutorial Mode, slow it down even more (almost a pause) to let the player learn
            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                shrinkSpeed = 10; // 16x Slower (Virtual Pause)
            }
        }

        this.qte.radius -= shrinkSpeed * dt;

        if (this.qte.radius <= 0) {
            this.resolveQTE('fail');
        }
    },

    drawQTE() {
        if (!this.qte.active) return;
        const ctx = this.ctx;
        const { targetX, targetY, radius } = this.qte;
        
        ctx.save();
        ctx.lineWidth = 6;
        
        const color = (this.qte.type === 'ATTACK') ? '#ff4400' : '#00ffff';
        
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        ctx.arc(targetX, targetY, 100, 0, Math.PI*2);
        ctx.stroke();

        if (this.qte.type === 'DEFEND') {
            ctx.strokeStyle = COLORS.SHIELD;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(targetX, targetY, 60, 0, Math.PI*2);
            ctx.stroke();
        }

        ctx.strokeStyle = (this.qte.type === 'ATTACK') ? '#00ff00' : '#ffff00';
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(targetX, targetY, 30, 0, Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 6;

        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(targetX, targetY, Math.max(0, radius), 0, Math.PI*2);
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px 'Orbitron'";
        ctx.textAlign = "center";
        const txt = (this.qte.type === 'ATTACK') ? "CLICK TO CRIT!" : "CLICK TO BLOCK!";
        ctx.fillText(txt, targetX, targetY - 120);

        ctx.restore();
    },

    checkQTE() {
        if (!this.qte.active) return;
        
        const diff = Math.abs(this.qte.radius - 30);
        let quality = 'fail';
        
        if (this.qte.type === 'ATTACK') {
             // Attack: Hit inside ring (25px tolerance)
             if (diff < 25) quality = 'perfect'; 
        } else {
             // Defend: Perfect (20px) or Good (50px)
             if (diff < 20) quality = 'perfect'; 
             else if (diff < 50) quality = 'good';
        }
        
        // TUTORIAL OVERRIDE:
        // If in tutorial, give them the 'perfect' result even if they missed slightly,
        // to ensure the flow continues and they see the "Critical Hit" message.
        if (this.currentState === STATE.TUTORIAL_COMBAT) {
            quality = 'perfect';
        }
        
        this.resolveQTE(quality);
    },

    resolveQTE(quality) {
        const cb = this.qte.callback;
        this.qte.active = false;
        
        let multiplier = 1.0;
        let msg = "TOO LATE";
        let color = "#888";

        // TUTORIAL ASSIST: Even a miss counts as a hit to keep flow moving
        if (this.currentState === STATE.TUTORIAL_COMBAT && quality === 'fail') {
             quality = 'perfect'; // Force success for tutorial flow
             // Optional: Change msg to "CALIBRATION ADJUSTED" to indicate assist
        }

        if (quality !== 'fail') {
             if (this.qte.type === 'ATTACK') {
                 if (quality === 'perfect') {
                     multiplier = 1.3; 
                     msg = "CRITICAL!";
                     color = COLORS.GOLD;
                     AudioMgr.playSound('mana');
                 }
             } else {
                 if (quality === 'perfect') {
                     multiplier = 0.5; 
                     msg = "PERFECT BLOCK!";
                     color = COLORS.GOLD;
                     AudioMgr.playSound('defend');
                 } else {
                     multiplier = 0.8; 
                     msg = "BLOCK";
                     color = COLORS.SHIELD;
                     AudioMgr.playSound('defend');
                 }
             }
             
             ParticleSys.createExplosion(this.qte.targetX, this.qte.targetY, 20, color);
        }
        
        ParticleSys.createFloatingText(this.qte.targetX, this.qte.targetY - 50, msg, color);

        if (cb) cb(multiplier);
    },

    changeState(newState) {
        document.querySelectorAll('.screen').forEach(el => {
            el.classList.remove('active');
            setTimeout(() => { if(!el.classList.contains('active')) el.classList.add('hidden'); }, 300);
        });
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('modal-settings').classList.add('hidden');
        TooltipMgr.hide();

        this.currentState = newState;
        const activate = (id) => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.remove('hidden');
                setTimeout(() => el.classList.add('active'), 10);
            }
        };

        switch(newState) {
            case STATE.MENU: activate('screen-start'); break;
            case STATE.CHAR_SELECT: activate('screen-char-select'); this.renderCharSelect(); break;
            case STATE.TUTORIAL: 
                activate('screen-tutorial'); 
                this.tutorialPage = 0;
                this.renderTutorial();
                break;
            case STATE.META: 
                activate('screen-meta'); 
                document.getElementById('fragment-count').innerText = `Fragments: ${this.techFragments}`;
                break;
            case STATE.MAP: 
                activate('screen-map'); 
                this.renderMap(); 
                this.saveGame();
                break;
            case STATE.SHOP: activate('screen-shop'); this.renderShop(); break;
            case STATE.COMBAT: 
                document.getElementById('hud').classList.remove('hidden');
                this.renderRelics(); 
                break;
            case STATE.REWARD: activate('screen-reward'); this.generateRewards(); break;
            case STATE.GAMEOVER: activate('screen-gameover'); break;
            case STATE.EVENT: activate('screen-event'); break;
            case STATE.INTEL: 
                activate('screen-intel'); 
                this.renderIntel();
                break;
            case STATE.HEX: activate('screen-hex'); break;
		
	case STATE.TUTORIAL_COMBAT:
                document.getElementById('hud').classList.remove('hidden');
                break;
        case STATE.STORY:
                activate('screen-story');
                break;
        }
    },
    
    openPostTutorial() {
        // 1. Remove Z-Index Highlights (Fixes Blank Screen/Softlock)
        document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
        
        // 2. Clean up Combat UI
        document.getElementById('hud').style.zIndex = ""; 
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('tutorial-overlay').classList.add('hidden');
        document.getElementById('tutorial-text').classList.add('hidden');

        // 3. Load Post-Tutorial Content
        this.tutorialData = POST_TUTORIAL_PAGES;
        this.tutorialPage = 0; 
        
        // 4. Switch State
        this.changeState(STATE.TUTORIAL);
    },

    renderTutorial() {
        // Use dynamic data source
        const pages = this.tutorialData;
        const page = pages[this.tutorialPage];
        
        document.getElementById('tut-title').innerText = page.title;
        document.getElementById('tut-content').innerHTML = page.content;
        document.getElementById('tut-page-num').innerText = `${this.tutorialPage + 1} / ${pages.length}`;
        
        const btnPrev = document.getElementById('btn-tut-prev');
        const btnNext = document.getElementById('btn-tut-next');
        const btnClose = document.getElementById('btn-back-tutorial');

        // Logic: Disable Prev on first page
        btnPrev.disabled = (this.tutorialPage === 0);
        btnPrev.style.opacity = (this.tutorialPage === 0) ? 0.3 : 1;
        
        // Logic: Disable Next on last page
        const isLast = (this.tutorialPage === pages.length - 1);
        btnNext.disabled = isLast;
        btnNext.style.opacity = isLast ? 0.3 : 1;

        // Change "Close" button text based on context
        if (this.tutorialData === POST_TUTORIAL_PAGES && isLast) {
            btnClose.innerText = "ENTER SYSTEM";
            btnClose.classList.add("neon-border-gold");
        } else {
            btnClose.innerText = "CLOSE DEBRIEFING";
            btnClose.classList.remove("neon-border-gold");
        }
    },

    nextTutorial() {
        AudioMgr.playSound('click');
        if(this.tutorialPage < this.tutorialData.length - 1) {
            this.tutorialPage++;
            this.renderTutorial();
        }
    },

    prevTutorial() {
        AudioMgr.playSound('click');
        if(this.tutorialPage > 0) {
            this.tutorialPage--;
            this.renderTutorial();
        }
    },
    
    renderMeta() {
        const list = document.getElementById('upgrade-list');
        list.innerHTML = '';
        list.className = 'meta-grid'; 

        META_UPGRADES.forEach(u => {
            const unlocked = this.hasMetaUpgrade(u.id);
            const div = document.createElement('div');
            div.className = `upgrade-card ${unlocked ? 'unlocked' : ''}`;
            div.innerHTML = `
                <div class="upgrade-icon">${u.icon}</div>
                <div class="upgrade-info">
                    <div class="upgrade-name">${u.name}</div>
                    <div class="upgrade-desc">${u.desc}</div>
                </div>
                <div class="upgrade-cost">${unlocked ? 'INSTALLED' : u.cost + ' F'}</div>
            `;
            div.onclick = () => {
                if (unlocked) return;
                if (this.techFragments >= u.cost) {
                    this.techFragments -= u.cost;
                    this.metaUpgrades.push(u.id);
                    try {
                        localStorage.setItem('mvm_fragments', this.techFragments);
                        localStorage.setItem('mvm_upgrades', JSON.stringify(this.metaUpgrades));
                    } catch(e) { console.warn("Save failed", e); }
                    
                    document.getElementById('fragment-count').innerText = `Fragments: ${this.techFragments}`;
                    AudioMgr.playSound('upgrade');
                    this.renderMeta();
                } else {
                    div.style.borderColor = 'red';
                    setTimeout(() => div.style.borderColor = '', 200);
                }
            };
            list.appendChild(div);
        });
    },

    drawSanctuary(dt) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const time = Date.now() / 1000;
        
        const totalUpgrades = META_UPGRADES.length;
        const unlockedCount = this.metaUpgrades.length;
        const progress = Math.max(0.1, unlockedCount / totalUpgrades);

        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        const r = Math.floor(50 * (1 - progress));
        const g = Math.floor(34 * progress);
        const topColor = `rgb(${r}, ${g}, 17)`;
        const botColor = progress > 0.5 ? '#052205' : '#220505';
        
        skyGrad.addColorStop(0, topColor);
        skyGrad.addColorStop(1, botColor);
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        const groundY = h * 0.7;
        ctx.fillStyle = progress > 0.3 ? '#001a05' : '#1a0505';
        ctx.fillRect(0, groundY, w, h - groundY);

        const treeCount = Math.max(1, unlockedCount * 2);
        
        const visibleWidth = w * 0.6;
        const spacing = visibleWidth / (treeCount + 1);

        const drawBranch = (x, y, len, angle, depth) => {
            ctx.beginPath();
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle * Math.PI / 180);
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -len);
            
            if (progress < 0.3) {
                ctx.strokeStyle = depth > 2 ? '#555' : '#333';
            } else {
                ctx.strokeStyle = depth > 2 ? COLORS.NATURE_LIGHT : COLORS.NATURE_DARK;
                if (depth === 1) ctx.strokeStyle = '#004400';
            }
            
            ctx.lineWidth = depth * 1.5;
            ctx.stroke();

            if (len < 10) {
                ctx.restore();
                return;
            }

            ctx.translate(0, -len);
            
            const angleVar = 15 + (Math.sin(time + x) * 5); 
            
            drawBranch(0, 0, len * 0.75, -angleVar, depth - 1);
            drawBranch(0, 0, len * 0.75, angleVar, depth - 1);
            ctx.restore();
        };

        for (let i = 1; i <= treeCount; i++) {
            const seed = i * 1234;
            const x = (i * spacing) + (Math.sin(seed) * 20) + 50;
            const height = 100 + (unlockedCount * 20) + (Math.cos(seed) * 50);
            const startAngle = Math.sin(time + i) * 2; 
            
            const depth = Math.floor(3 + (progress * 3)); 
            drawBranch(x, groundY, height, startAngle, depth);
        }

        if (progress > 0.2) {
            const particleCount = Math.floor(progress * 50);
            for (let i = 0; i < particleCount; i++) {
                const seed = i * 999;
                const fx = (time * 50 + seed) % w;
                const fy = (groundY - 200) + Math.sin(time * 2 + seed) * 150;
                
                ctx.globalAlpha = 0.5 + Math.sin(time * 5 + seed) * 0.5;
                ctx.fillStyle = COLORS.GOLD;
                ctx.beginPath();
                ctx.arc(fx, fy, 2, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }
        
        if (progress > 0.5) {
            ctx.fillStyle = "rgba(0, 255, 0, 0.05)";
            for (let y = 0; y < h; y+=4) {
                ctx.fillRect(0, y, w, 1);
            }
        }
    },

    goToCharSelect() {
        AudioMgr.startMusic();
        this.changeState(STATE.CHAR_SELECT);
    },

    renderCharSelect() {
        const grid = document.getElementById('char-grid');
        grid.innerHTML = '';
        PLAYER_CLASSES.forEach(cls => {
            const div = document.createElement('div');
            div.className = 'char-card';
            div.innerHTML = `
                <div class="char-icon">${cls.icon}</div>
                <div class="char-name">${cls.name}</div>
                <div class="char-desc">${cls.desc.replace(/\n/g, '<br>')}</div>
            `;
            div.onclick = () => this.selectClass(cls);
            grid.appendChild(div);
        });
    },

    selectClass(cls) {
        AudioMgr.playSound('click');
        
        // Wipe the active run save
        localStorage.removeItem('mvm_save_v1');
        document.getElementById('btn-load-save').style.display = "none";
        
        this.player = new Player(cls);
        this.player.classId = cls.id; 
        this.sector = 1; 
        this.bossDefeated = false; 
        
        if(this.hasMetaUpgrade('m_start_frag')) {
            this.techFragments += 50; 
            try { localStorage.setItem('mvm_fragments', this.techFragments); } catch(e) {}
        }
        
        this.generateMap();
        this.renderRelics();
        this.changeState(STATE.MAP);
        
        // Save initial state
        this.saveGame();
    },

    getRelicDescription(relic, count) {
        // Special Logic for Relentless
        if (relic.id === 'relentless') {
            if (count === 1) return "3rd Attack in a turn deals TRIPLE damage.";
            if (count === 2) return "2nd Attack in a turn deals TRIPLE damage.";
            return "1st Attack in a turn deals TRIPLE damage.";
        }

        // NEW: Special Logic for Firewall (Cap reduces with stacks: 50 -> 40 -> 30)
        if (relic.id === 'firewall') {
            const cap = 50 - ((count - 1) * 10);
            return `First unblocked damage capped at ${cap}.`;
        }

	// NEW: Special Logic for Solar Battery (1, 3, 5...)
        if (relic.id === 'solar_battery') {
            const manaAmt = (count * 2) - 1;
            return `Every 3rd turn, gain +${manaAmt} Mana.`;
	}

	// NEW: Special Logic for Brutalize
        if (relic.id === 'brutalize') {
            if (count === 1) return "Killing a minion deals (its DMG + 3) to others.";
            return `Killing a minion deals ${count}x (its DMG + 3) to others.`;
        }
        
        // Standard Logic
        return relic.desc.replace(/(\d+)/g, (match) => {
            return parseInt(match) * count;
        });
    },

    renderRelics() {
        const container = document.getElementById('relic-list');
        if(!container || !this.player) return;
        container.innerHTML = '';

        const counts = {};
        this.player.relics.forEach(r => {
            counts[r.id] = (counts[r.id] || 0) + 1;
        });

        const uniqueIds = Object.keys(counts);

        if (uniqueIds.length === 0) {
            container.innerHTML = '<div style="color:#555; font-size:0.8rem;">No modules installed.</div>';
            return;
        }

        uniqueIds.forEach(id => {
            const r = this.player.relics.find(item => item.id === id);
            const count = counts[id];
            
            const wrapper = document.createElement('div');
            wrapper.className = 'relic-wrapper';

            const el = document.createElement('div');
            el.className = 'relic-icon';
            el.innerHTML = r.icon;
            el.style.fontSize = "2rem";

            if (count > 1) {
                const badge = document.createElement('div');
                badge.className = 'relic-count';
                badge.innerText = count;
                wrapper.appendChild(badge);
            }

            const dynamicDesc = this.getRelicDescription(r, count);
            const titleText = count > 1 ? `<strong>${r.name} (x${count})</strong>` : `<strong>${r.name}</strong>`;

            // PC Hover
            wrapper.onmouseenter = (e) => TooltipMgr.show(`${titleText}\n${dynamicDesc}`, e.clientX, e.clientY);
            wrapper.onmouseleave = () => TooltipMgr.hide();

            // NEW: Mobile Touch Support for Dropdown Items
            wrapper.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                const touch = e.touches[0];
                TooltipMgr.show(`${titleText}\n${dynamicDesc}`, touch.clientX, touch.clientY - 80);
            }, { passive: true });
            
            wrapper.appendChild(el);
            container.appendChild(wrapper);
        });
    },

    generateMap() {
        this.map.nodes = [];
        const levels = 12; 
        const lanes = 3;

        // 1. Create Start Node
        // FIX: Start node is 'completed' by default so the next row is accessible immediately
        this.map.nodes.push({ id: 'start', layer: 0, lane: -1, x: 50, y: 95, type: 'start', connections: [], status: 'completed' });

        const stepY = 85 / levels;

        // 2. Generate Grid Nodes
        for(let l=1; l<=levels; l++) {
            const nodeCount = (l === levels) ? 1 : lanes; 
            
            for(let i=0; i<nodeCount; i++) {
                let type = 'combat';
                
                if (l === levels) type = 'boss';
                else if (l === 4) type = 'shop';
                else if (l === 8) type = 'rest';
                else if (l === 6) type = 'elite';
                else {
                    const r = Math.random();
                    let pool = [];
                    
                    if (i === 0) pool = ['elite', 'event', 'combat', 'combat']; 
                    else if (i === 1) pool = ['shop', 'event', 'combat', 'combat']; 
                    else pool = ['shop', 'event', 'event', 'combat']; 

                    if (l === 3 || l === 5) {
                        pool = pool.filter(t => t !== 'shop');
                    }

                    type = pool[Math.floor(r * pool.length)] || 'combat';
                }

                let x = 50;
                // Zig Zag Logic
                if(nodeCount === 3) {
                    x = 20 + (i * 30);
                    const zigZag = (l % 2 === 0) ? -4 : 4;
                    x += zigZag;
                }
                
                const jitter = (Math.random() - 0.5) * 1.5;

                // FIX: Layer 1 nodes are 'available' by default
                const initialStatus = (l === 1) ? 'available' : 'locked';

                this.map.nodes.push({
                    id: `${l}-${i}`,
                    layer: l,
                    lane: i, 
                    x: x + jitter,
                    y: 95 - (l * stepY), 
                    type: type,
                    connections: [],
                    status: initialStatus 
                });
            }
        }

        // 3. Connect Start Node
        const startNode = this.map.nodes.find(n => n.layer === 0);
        const layer1 = this.map.nodes.filter(n => n.layer === 1);
        layer1.forEach(n => startNode.connections.push(n.id));

        // 4. Connect Layers (Strict Vertical)
        for(let l=1; l<levels; l++) {
            const currentNodes = this.map.nodes.filter(n => n.layer === l);
            const nextNodes = this.map.nodes.filter(n => n.layer === l+1);

            currentNodes.forEach(curr => {
                if (nextNodes.length === 1) {
                    curr.connections.push(nextNodes[0].id);
                } else {
                    const target = nextNodes.find(n => n.lane === curr.lane);
                    if (target) curr.connections.push(target.id);
                }
            });
        }
        
        this.map.currentIdx = 'start';
    },

    renderMap() {
        const titleEl = document.getElementById('map-sector-display');
        if (titleEl) titleEl.innerText = `// SECTOR ${this.sector}`;

        const container = document.getElementById('map-nodes');
        container.innerHTML = `<div class="map-svg-layer" id="map-svg"></div>`;
        
        this.map.nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = `map-node-abs ${node.status}`;
            el.style.left = `${node.x}%`;
            el.style.top = `${node.y}%`;
            
            let icon = '⚔️';
            if(node.type === 'start') icon = '🚩';
            if(node.type === 'shop') icon = '💠';
            if(node.type === 'elite') icon = '☠️';
            if(node.type === 'rest') icon = '💤';
            if(node.type === 'boss') icon = '👹';
            if(node.type === 'event') icon = '❔';

            el.innerHTML = icon;
            
            if(node.status === 'available') {
                el.onclick = () => this.visitNode(node);
            }
            
            el.onmouseenter = (e) => TooltipMgr.show(node.type.toUpperCase(), e.clientX, e.clientY);
            el.onmouseleave = () => TooltipMgr.hide();

            container.appendChild(el);
        });

        const svg = document.getElementById('map-svg');
        let svgHTML = `<svg width="100%" height="100%">`;
        this.map.nodes.forEach(node => {
            node.connections.forEach(targetId => {
                const target = this.map.nodes.find(n => n.id === targetId);
                if(target) {
                    let color = '#333';
                    let width = '1';
                    
                    if (node.status === 'completed' && (target.status === 'available' || target.status === 'completed')) {
                        color = COLORS.MANA;
                        width = '2';
                    }
                    
                    svgHTML += `<line x1="${node.x}%" y1="${node.y}%" x2="${target.x}%" y2="${target.y}%" stroke="${color}" stroke-width="${width}" stroke-dasharray="8,6" />`;
                }
            });
        });
        svgHTML += `</svg>`;
        svg.innerHTML = svgHTML;
    },

	completeCurrentNode() {
        const node = this.map.nodes.find(n => n.id === this.map.currentIdx);
        if (node) {
            node.status = 'completed';
            // Unlock next nodes
            node.connections.forEach(tid => {
                const t = this.map.nodes.find(n => n.id === tid);
                if(t) t.status = 'available';
            });
        }
        this.saveGame();
    },

    visitNode(node) {
        AudioMgr.playSound('click');
        
        if (node.type === 'start') return;

        // FIX: Removed early return for 'event'. 
        // It must flow through the logic below to update currentIdx correctly.
        
        // 1. Update previous node status (Visuals & Locking)
        if (this.map.currentIdx !== node.id) {
            const previous = this.map.nodes.find(n => n.id === this.map.currentIdx);
            if(previous) previous.status = 'completed';
            
            this.map.nodes.forEach(n => {
                if (n.status === 'available' && n.id !== node.id) {
                    n.status = 'locked';
                }
            });
        }

        // 2. Update Player Position (Crucial for completeCurrentNode to work)
        this.map.currentIdx = node.id;
        
        // 3. Save Game (at start of node)
        this.saveGame();

        // 4. Trigger Node Action
        if(node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
            this.startCombat(node.type);
        } else if (node.type === 'shop') {
            this.generateShop(); 
            this.changeState(STATE.SHOP);
        } else if (node.type === 'event') {
            // FIX: Handle event here so position is already updated
            this.startEvent();
        } else if (node.type === 'rest') {
            const available = Object.keys(DICE_UPGRADES).filter(k => !this.player.hasDiceUpgrade(k));
            const btnTinker = document.getElementById('btn-rest-tinker');
            
            if (available.length === 0) {
                btnTinker.innerHTML = "<div>🛒 ACCESS SHOP</div><div style='font-size: 0.8rem; color: #aaa;'>All Skills Maxed</div>";
            } else {
                btnTinker.innerHTML = "<div>🔧 TINKER</div><div style='font-size: 0.8rem; color: #aaa;'>Upgrade a Random Skill</div>";
            }
            
            document.getElementById('screen-rest').classList.remove('hidden');
            document.getElementById('screen-rest').classList.add('active');
        } else {
            this.renderMap();
        }
    },

    handleRest(action) {
        // Common actions for Sleep/Meditate hide the screen immediately
        if (action === 'sleep') {
            document.getElementById('screen-rest').classList.remove('active');
            document.getElementById('screen-rest').classList.add('hidden');
            const healAmt = Math.floor(this.player.maxHp * 0.5);
            this.player.heal(healAmt);
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, "SYSTEM RESTORED", COLORS.NATURE_LIGHT);
            AudioMgr.playSound('mana');
            this.completeCurrentNode();
            this.renderMap();
        } else if (action === 'meditate') {
            document.getElementById('screen-rest').classList.remove('active');
            document.getElementById('screen-rest').classList.add('hidden');
            this.player.addRelic({ id: 'reroll_chip', name: "Reroll Chip", desc: "+1 Reroll per turn.", icon: "🎲" });
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, "FOCUS INCREASED", COLORS.MANA);
            AudioMgr.playSound('mana');
            this.completeCurrentNode();
            this.renderMap();
        } else if (action === 'tinker') {
            const available = Object.keys(DICE_UPGRADES).filter(k => !this.player.hasDiceUpgrade(k));
            
            if (available.length > 0) {
                document.getElementById('screen-rest').classList.remove('active');
                document.getElementById('screen-rest').classList.add('hidden');
                const up = available[Math.floor(Math.random() * available.length)];
                this.player.diceUpgrades.push(up);
                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, `UPGRADE: ${up}`, COLORS.GOLD);
                AudioMgr.playSound('mana');
                this.completeCurrentNode();
                this.renderMap();
            } else {
                // NEW: All skills upgraded -> Access Shop Logic
                // Hide rest screen
                document.getElementById('screen-rest').classList.remove('active');
                document.getElementById('screen-rest').classList.add('hidden');
                
                // Go to shop
                this.generateShop();
                this.changeState(STATE.SHOP);
                // Note: Node completion happens in leaveShop()
            }
        }
    },

    saveGame() {
        if (!this.map.currentIdx) this.map.currentIdx = 'start';

        const data = {
            fragments: this.techFragments,
            meta: this.metaUpgrades,
            encrypted: this.encryptedFiles,
            lore: this.unlockedLore,
            sector: this.sector,
            map: this.map, 
            currentIdx: this.map.currentIdx, 
            bossDefeated: this.bossDefeated,
            player: {
                classId: this.player.classId, 
                hp: this.player.currentHp,
                maxHp: this.player.maxHp,
                mana: this.player.baseMana,
                relics: this.player.relics,
                upgrades: this.player.diceUpgrades
            }
        };
        localStorage.setItem('mvm_save_v1', JSON.stringify(data));
    },

    loadGame() {
        const json = localStorage.getItem('mvm_save_v1');
        if (!json) return;
        
        try {
            const data = JSON.parse(json);
            
            this.sector = data.sector || 1;
            this.map = data.map;
            this.map.currentIdx = data.currentIdx || 'start'; 
            this.bossDefeated = data.bossDefeated || false;
            
            const classConfig = PLAYER_CLASSES.find(c => c.id === data.player.classId) || PLAYER_CLASSES[0];
            this.player = new Player(classConfig);
            
            this.player.currentHp = data.player.hp;
            this.player.maxHp = data.player.maxHp;
            this.player.baseMana = data.player.mana;
            this.player.relics = data.player.relics || [];
            this.player.diceUpgrades = data.player.upgrades || [];
            this.player.classId = data.player.classId;
            
            this.player.minions = []; 

            AudioMgr.startMusic();
            this.renderRelics();
            
            this.changeState(STATE.MAP);
            this.renderMap();
            
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, "SYSTEM RESTORED", COLORS.GOLD);
        } catch (e) {
            console.error("Save file corrupted", e);
            localStorage.removeItem('mvm_save_v1');
            alert("Save file corrupted. Starting new run.");
            this.goToCharSelect();
        }
    },

    startEvent() {
        const event = EVENTS_DB[Math.floor(Math.random() * EVENTS_DB.length)];
        this.changeState(STATE.EVENT);
        document.getElementById('event-title').innerText = event.title;
        document.getElementById('event-desc').innerText = event.desc;
        
        const opts = document.getElementById('event-options');
        opts.innerHTML = '';
        
        event.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn secondary';
            btn.innerText = opt.text;
            btn.onclick = () => {
                const msg = opt.effect(this);
                
                // NEW: If the event triggered combat, stop here.
                // The combat system will handle completion and state changes.
                if (msg === "COMBAT_STARTED") return;

                // Standard Text Event Outcome
                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, msg, COLORS.GOLD);
                
                // Mark node as completed and Save (replaces the manual logic)
                this.completeCurrentNode();
                
                // Return to map
                setTimeout(() => this.changeState(STATE.MAP), 1000);
            };
            opts.appendChild(btn);
        });
    },

    generateShop() {
        this.shopInventory = [];
        
        // 1. Generate Consumables/Relics
        let items = [
            { 
                id: 'repair', type: 'item', name: "Nano-Repair", cost: 15, icon: "💚", 
                desc: "Restores 25 HP.", 
                action: () => { this.player.heal(25); } 
            },
            { 
                id: 'hp_up', type: 'item', name: "Power Cell", cost: 30, icon: "⚙️", 
                desc: "Max HP +10.", 
                action: () => { this.player.maxHp += 10; this.player.currentHp += 10; } 
            },
            { 
                id: 'mana_up', type: 'item', name: "Mana Core", cost: 50, icon: "💠", 
                desc: "Base Mana +1.", 
                action: () => { this.player.baseMana += 1; } 
            },
            { 
                id: 'nano_shield', type: 'item', name: "Shield Matrix", cost: 40, icon: "🛡️", 
                desc: "Start combat with +5 Block. (Stacks)",
                action: () => { 
                    this.player.addRelic({ id: 'nano_shield', name: "Nano-Shield", desc: "Start combat with 5 Block.", icon: "🛡️" }); 
                } 
            },
            { 
                id: 'crit_lens', type: 'item', name: "Luck Drive", cost: 45, icon: "🎯", 
                desc: "+15% Double Damage Chance. (Stacks)",
                action: () => { 
                    this.player.addRelic({ id: 'crit_lens', name: "Crit Lens", desc: "15% chance to deal Double Damage.", icon: "🎯" }); 
                } 
            },
            { 
                id: 'spike_armor', type: 'item', name: "Thorn Plating", cost: 45, icon: "🌵", 
                desc: "Deal 3 DMG when hit. (Stacks)",
                action: () => { 
                    this.player.addRelic({ id: 'spike_armor', name: "Spike Armor", desc: "Deal 3 DMG when hit.", icon: "🌵" }); 
                } 
            },
            { 
                id: 'minion_core', type: 'item', name: "Minion Core", cost: 60, icon: "🌱", 
                desc: "Start combat with 1 Wisp.",
                action: () => { 
                    this.player.addRelic({ id: 'minion_core', name: "Minion Core", desc: "Start combat with 1 Wisp.", icon: "🌱" }); 
                } 
            }
        ];

        // Filter Maxed Items
        const coreCount = this.player.relics.filter(r => r.id === 'minion_core').length;
        if(coreCount >= 2) items = items.filter(i => i.id !== 'minion_core');

        const titanCount = this.player.relics.filter(r => r.id === 'titan_module').length;
        if(titanCount >= 3) items = items.filter(i => i.name !== "Titan Module");

	// NEW: Filter Crit Lens (Max 5) - Checking by ID since we added IDs to shop items previously
        const lensCount = this.player.relics.filter(r => r.id === 'crit_lens').length;
        if(lensCount >= 5) items = items.filter(i => i.id !== 'crit_lens');

	const holoCount = this.player.relics.filter(r => r.id === 'hologram').length;
        if(holoCount >= 3) items = items.filter(i => i.id !== 'hologram');

        // NEW: Firewall Limit (Max 3)
        const fireCount = this.player.relics.filter(r => r.id === 'firewall').length;
        if(fireCount >= 3) items = items.filter(i => i.id !== 'firewall');

        // Shuffle
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        
        // Limit to 3 items
        const selectedItems = items.slice(0, 3);

        // Update descriptions for selected items based on current stacks
        selectedItems.forEach(item => {
            const currentCount = this.player.relics.filter(r => r.id === item.id).length;
            item.desc = this.getRelicDescription(item, currentCount + 1);
        });

        this.shopInventory.push(...selectedItems);

        // 2. Generate Dice Upgrades
        // Filter out upgrades for locked skills the player doesn't have
        const availableUpgrades = Object.keys(DICE_UPGRADES).filter(key => {
            // If already upgraded, hide
            if (this.player.hasDiceUpgrade(key)) return false;

            // Check if base die is available/unlocked
            const baseDie = DICE_TYPES[key];
            if (!baseDie.locked) return true; 

            // If locked, check for specific relic
            if (key === 'VOODOO' && this.player.hasRelic('voodoo_doll')) return true;
            if (key === 'OVERCHARGE' && this.player.hasRelic('overcharge_chip')) return true;
            
            // NEW: Check for Reckless Charge unlock
            if (key === 'RECKLESS_CHARGE' && this.player.hasRelic('reckless_drive')) return true;

            return false;
        });

        for (let i = availableUpgrades.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableUpgrades[i], availableUpgrades[j]] = [availableUpgrades[j], availableUpgrades[i]];
        }
        
        // Limit to 3 upgrades
        const shopUpgrades = availableUpgrades.slice(0, 3);
        let discountIndex = shopUpgrades.length > 0 ? Math.floor(Math.random() * shopUpgrades.length) : -1;

        shopUpgrades.forEach((key, idx) => {
            const up = DICE_UPGRADES[key];
            let cost = up.cost;
            let isDiscount = false;
            if (idx === discountIndex) {
                cost = Math.floor(cost * 0.6);
                isDiscount = true;
            }
            
            this.shopInventory.push({
                type: 'upgrade',
                key: key,
                name: up.name,
                desc: up.desc,
                icon: up.icon,
                cost: cost,
                isDiscount: isDiscount,
                purchased: false
            });
        });
    },

    renderShop() {
        const shopFragEl = document.getElementById('shop-frag-count');
        if(shopFragEl) shopFragEl.innerText = this.techFragments;

        const grid = document.getElementById('shop-grid');
        grid.innerHTML = '';
        
        if (!this.shopInventory) return;

        this.shopInventory.forEach(item => {
            const div = document.createElement('div');
            
            // 1. Check if already bought
            if (item.purchased) {
                div.className = 'shop-item purchased';
                div.style.opacity = '0.5';
                div.style.pointerEvents = 'none';
                div.style.borderColor = '#333';
                div.innerHTML = `<div style="font-size:2rem; margin:auto;">✅</div><div class="neon-text-green" style="font-size:0.8rem;">ACQUIRED</div>`;
                grid.appendChild(div);
                return;
            }

            // 2. Render Available Items
            // We wrap the text in a 'shop-info' div to allow side-by-side layout
            if (item.type === 'item') {
                div.className = 'shop-item neon-border-gold';
                div.innerHTML = `
                    <div class="shop-icon">${item.icon}</div>
                    <div class="shop-info">
                        <div class="neon-text-blue shop-title">${item.name}</div>
                        <div class="shop-desc">${item.desc}</div>
                        <div class="cost-tag">${item.cost} Frags</div>
                    </div>`;
                
                div.onclick = () => {
                    if(this.techFragments >= item.cost) {
                        this.techFragments -= item.cost;
                        try { localStorage.setItem('mvm_fragments', this.techFragments); } catch(e) {}
                        item.action(); 
                        item.purchased = true; 
                        AudioMgr.playSound('buy');
                        this.saveGame();
                        this.renderShop(); 
                    } else {
                        div.style.borderColor = 'red';
                        setTimeout(() => div.style.borderColor = '', 200);
                    }
                };
            } else if (item.type === 'upgrade') {
                div.className = 'shop-item neon-border-pink'; 
                div.innerHTML = `
                    <div class="shop-icon" style="position:relative;">
                        ${item.icon}
                        ${item.isDiscount ? '<span style="position:absolute; top:-5px; right:-5px; font-size:0.8rem;">🏷️</span>' : ''}
                    </div>
                    <div class="shop-info">
                        <div class="neon-text-gold shop-title">${item.name}</div>
                        <div style="font-size: 0.65rem; color: #888; margin-bottom: 2px;">Upgrades: <span style="color:#fff">${item.key}</span></div>
                        <div class="shop-desc">${item.desc}</div>
                        <div class="cost-tag">${item.cost} Frags</div>
                    </div>`;
                
                div.onclick = () => {
                    if(this.techFragments >= item.cost) {
                        this.techFragments -= item.cost;
                        try { localStorage.setItem('mvm_fragments', this.techFragments); } catch(e) {}
                        this.player.diceUpgrades.push(item.key);
                        item.purchased = true; 
                        AudioMgr.playSound('upgrade');
                        this.saveGame();
                        this.renderShop();
                    } else {
                        div.style.borderColor = 'red';
                        setTimeout(() => div.style.borderColor = '', 200);
                    }
                };
            }
            grid.appendChild(div);
        });
    },

    leaveShop() {
        AudioMgr.playSound('click');
        this.shopInventory = null; 
        this.completeCurrentNode(); // ADD THIS
        this.changeState(STATE.MAP);
    },

    // --- INTEL & HEX BREACH SYSTEM ---

    renderIntel() {
        document.getElementById('encrypted-count').innerText = this.encryptedFiles;
        const grid = document.getElementById('lore-grid');
        grid.innerHTML = '';

        LORE_DATABASE.forEach((entry, index) => {
            const isUnlocked = this.unlockedLore.includes(index);
            const el = document.createElement('div');
            el.className = `lore-node ${isUnlocked ? 'unlocked' : 'locked'}`;
            el.innerText = index + 1;
            
            if (isUnlocked) {
                el.onclick = (e) => {
                    AudioMgr.playSound('click');
                    TooltipMgr.show(entry, e.clientX, e.clientY);
                };
            }
            grid.appendChild(el);
        });

        const btnDecrypt = document.getElementById('btn-decrypt');
        if (this.encryptedFiles > 0) {
            btnDecrypt.disabled = false;
            btnDecrypt.style.opacity = 1;
            btnDecrypt.innerText = "DECRYPT (START BREACH)";
        } else {
            btnDecrypt.disabled = true;
            btnDecrypt.style.opacity = 0.5;
            btnDecrypt.innerText = "NO FILES";
        }
    },

    startHexBreach() {
        if (this.encryptedFiles <= 0) return;
        
        this.changeState(STATE.HEX);
        this.hex = {
            round: 1,
            maxRounds: Math.floor(Math.random() * 3) + 3, 
            sequence: [],
            playerInput: [],
            acceptingInput: false
        };
        
        this.renderHexGrid();
        setTimeout(() => this.nextHexRound(), 1000);
    },

    renderHexGrid() {
        const grid = document.getElementById('hex-grid');
        grid.innerHTML = '';
        document.getElementById('hex-round').innerText = this.hex.round;
        document.getElementById('hex-max-round').innerText = this.hex.maxRounds;

        for(let i=0; i<9; i++) {
            const btn = document.createElement('div');
            btn.className = 'hex-btn';
            btn.id = `hex-${i}`;
            btn.innerText = "⬡"; 
            btn.onclick = () => this.handleHexInput(i);
            grid.appendChild(btn);
        }
    },

    async nextHexRound() {
        this.hex.playerInput = [];
        this.hex.acceptingInput = false;
        document.getElementById('hex-status').innerText = "OBSERVE PATTERN";
        document.getElementById('hex-status').className = "neon-text-blue";
        
        this.hex.sequence.push(Math.floor(Math.random() * 9));
        document.getElementById('hex-round').innerText = this.hex.sequence.length;

        for (let i = 0; i < this.hex.sequence.length; i++) {
            await this.sleep(600);
            const id = this.hex.sequence[i];
            const el = document.getElementById(`hex-${id}`);
            el.classList.add('flash');
            AudioMgr.playSound('mana');
            await this.sleep(400);
            el.classList.remove('flash');
        }

        this.hex.acceptingInput = true;
        document.getElementById('hex-status').innerText = "REPEAT PATTERN";
        document.getElementById('hex-status').className = "neon-text-green";
    },

    handleHexInput(index) {
        if (!this.hex.acceptingInput) return;

        const el = document.getElementById(`hex-${index}`);
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 200);
        AudioMgr.playSound('click');

        const currentStep = this.hex.playerInput.length;
        if (index === this.hex.sequence[currentStep]) {
            this.hex.playerInput.push(index);
            
            if (this.hex.playerInput.length === this.hex.sequence.length) {
                if (this.hex.sequence.length >= this.hex.maxRounds) {
                    this.winHexBreach();
                } else {
                    this.hex.round++;
                    this.hex.acceptingInput = false;
                    setTimeout(() => this.nextHexRound(), 1000);
                }
            }
        } else {
            this.failHexBreach(el);
        }
    },

    winHexBreach() {
        this.hex.acceptingInput = false;
        document.getElementById('hex-status').innerText = "DECRYPTION SUCCESSFUL";
        AudioMgr.playSound('upgrade');
        
        this.encryptedFiles--;
        this.techFragments += 300;
        
        const available = LORE_DATABASE.map((_, i) => i).filter(i => !this.unlockedLore.includes(i));
        let msg = "300 Fragments Acquired.";
        
        if (available.length > 0) {
            const unlockId = available[Math.floor(Math.random() * available.length)];
            this.unlockedLore.push(unlockId);
            msg += "\nNEW DATABASE ENTRY UNLOCKED.";
        } else {
            msg += "\n(Database Complete)";
        }

        this.saveData(); 
        
        setTimeout(() => {
            alert(msg); 
            this.changeState(STATE.INTEL);
        }, 1000);
    },

    failHexBreach(el) {
        this.hex.acceptingInput = false;
        el.classList.add('error');
        AudioMgr.playSound('explosion');
        document.getElementById('hex-status').innerText = "BREACH DETECTED - FILE PURGED";
        document.getElementById('hex-status').className = "neon-text-pink";
        
        this.encryptedFiles--;
        this.saveData();

        setTimeout(() => {
            this.changeState(STATE.INTEL);
        }, 1500);
    },

    saveData() {
        try {
            localStorage.setItem('mvm_fragments', this.techFragments);
            localStorage.setItem('mvm_encrypted', this.encryptedFiles);
            localStorage.setItem('mvm_lore', JSON.stringify(this.unlockedLore));
        } catch(e) {}
    },

    startCombat(type) {
        this.turnCount = 0;
        this.deadMinionsThisTurn = 0; 
	this.player.emergencyKitUsed = false; // NEW
	this.player.firewallTriggered = false; // NEW: Reset Firewall
        const isBoss = type === 'boss';
        const isElite = type === 'elite';
        
        // Sector Specific Enemies
        let pool = ENEMIES.filter(e => e.sector === this.sector);
        // Fallback to Sector 3 enemies if we are in Sector 4+ and no specific enemies exist yet
        if (pool.length === 0) pool = ENEMIES.filter(e => e.sector === 3); 
        if (pool.length === 0) pool = ENEMIES.filter(e => e.sector === 1); // Ultimate fallback
        
        let template = isBoss ? BOSSES.SECTOR1 : pool[Math.floor(Math.random() * pool.length)];
        
        if (isBoss) {
            if (this.sector === 2) template = BOSSES.SECTOR2;
            if (this.sector >= 3) template = BOSSES.SECTOR3; // Reuse Sector 3 boss for now or add more
        }

        let level = 1; 
        if(isElite) level = 2; 

        // NEW: Progressive Difficulty Scaling
        let sectorMult = 1.0;
        if (this.sector === 2) {
            sectorMult = 1.4; // +40%
        } else if (this.sector === 3) {
            sectorMult = 2.0; // +100%
        } else if (this.sector > 3) {
            // Sector 4 starts at 2.6x (2.0 * 1.3)
            // Each subsequent sector increases by 30% compounding
            sectorMult = 2.0 * Math.pow(1.3, this.sector - 3);
        }

        // Pass isElite to constructor for Affixes
        this.enemy = new Enemy(template, level, isElite);
        
        // Apply Scaling
        this.enemy.maxHp = Math.floor(this.enemy.maxHp * sectorMult);
        this.enemy.currentHp = this.enemy.maxHp;
        this.enemy.baseDmg = Math.floor(this.enemy.baseDmg * sectorMult);

        this.player.mana = this.player.baseMana;
        this.player.minions = [];

        // Minion spawning
        if(this.player.traits.startMinions) {
            for(let i=0; i<this.player.traits.startMinions; i++) {
                const m = new Minion(0, 0, this.player.minions.length + 1, true);
                if(this.player.traits.startShield) m.addShield(10); 
                this.player.minions.push(m);
            }
        }

        const coreStacks = this.player.relics.filter(r => r.id === 'minion_core').length;
        for(let i=0; i<coreStacks; i++) {
            this.player.minions.push(new Minion(0, 0, this.player.minions.length + 1, true));
        }

        if (isElite) {
             const m1 = new Minion(0, 0, 1, false); m1.upgrade();
             const m2 = new Minion(0, 0, 2, false); m2.upgrade();
             
             // Scale Elite Minions too
             m1.maxHp = Math.floor(m1.maxHp * sectorMult); m1.currentHp = m1.maxHp;
             m2.maxHp = Math.floor(m2.maxHp * sectorMult); m2.currentHp = m2.maxHp;
             
             this.enemy.minions.push(m1, m2);
             ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "ELITE PROTOCOL", "#f00");
             
             // Show Affixes
             this.enemy.affixes.forEach((affix, i) => {
                 setTimeout(() => {
                     ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 150 - (i*30), `⚠️ ${affix}`, COLORS.ORANGE);
                 }, i * 500);
             });
        }

        if (isBoss) {
             const m1 = new Minion(0, 0, 1, false);
             m1.maxHp = Math.floor(10 * sectorMult); m1.currentHp = m1.maxHp; m1.dmg = Math.max(1, Math.floor(3 * (sectorMult * 0.7)));
             
             const m2 = new Minion(0, 0, 2, false);
             m2.maxHp = Math.floor(10 * sectorMult); m2.currentHp = m2.maxHp; m2.dmg = Math.max(1, Math.floor(3 * (sectorMult * 0.7)));
             
             this.enemy.minions.push(m1, m2);
             ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "GUARDIANS ACTIVE", "#f00");
        }

        this.enemy.decideTurn();
        this.changeState(STATE.COMBAT);
        this.startTurn();
    },

    startTurn() {
        this.turnCount++;
        this.attacksThisTurn = 0; 
        this.player.shield = 0; 
	// NEW: Reset Charge Multipliers
        this.player.nextAttackMult = 1;
        this.player.incomingDamageMult = 1;
        
        if(this.player.traits.startShield) this.player.addShield(this.player.traits.startShield);
        if(Game.hasMetaUpgrade('m_shield') && this.turnCount === 1) this.player.addShield(10);
        const shieldStacks = this.player.relics.filter(r => r.id === 'nano_shield').length;
        if(shieldStacks > 0 && this.turnCount === 1) this.player.addShield(5 * shieldStacks);
        const shieldGen = this.player.relics.filter(r => r.id === 'shield_gen').length;
        if(shieldGen > 0) this.player.addShield(2 * shieldGen);
        const manaStacks = this.player.relics.filter(r => r.id === 'mana_syphon').length;
        if(manaStacks > 0) this.player.mana += manaStacks;

	// NEW: Static Field Relic
        if (this.player.hasRelic('static_field') && this.enemy) {
             const targets = [this.enemy, ...this.enemy.minions];
             const t = targets[Math.floor(Math.random() * targets.length)];
             if (t) {
                 t.takeDamage(5);
                 ParticleSys.createFloatingText(t.x, t.y - 80, "STATIC", "#00f3ff");
             }
        }

        // Solar Battery Relic
        if (this.player.hasRelic('solar_battery') && this.turnCount % 3 === 0) {
             const stacks = this.player.relics.filter(r => r.id === 'solar_battery').length;
             const manaGain = (stacks * 2) - 1;
             
             this.player.mana += manaGain;
             ParticleSys.createFloatingText(this.player.x, this.player.y - 80, `SOLAR (+${manaGain})`, COLORS.GOLD);
        }
        
        let rerollStacks = this.player.relics.filter(r => r.id === 'reroll_chip').length;
        if(this.hasMetaUpgrade('m_reroll')) rerollStacks++;

        this.player.updateEffects();
        
        if(this.enemy) {
             this.enemy.updateEffects();
             
             // MODIFIED: Shielded Affix Logic
             // Sector 1: 10% HP (approx 5 Shield for Heavy Loader)
             // Sector 2+: 20% HP (approx 10 Shield for Heavy Loader)
             if (this.enemy.affixes && this.enemy.affixes.includes('Shielded')) {
                 const ratio = (this.sector === 1) ? 0.1 : 0.2;
                 const regen = Math.floor(this.enemy.maxHp * ratio);
                 this.enemy.addShield(regen);
                 ParticleSys.createFloatingText(this.enemy.x, this.enemy.y, "SHIELD REGEN", COLORS.SHIELD);
             }
             
             this.enemy.decideTurn();
        }

         this.rerolls = (this.player.traits.noRerolls) ? 0 : (2 + rerollStacks);
        
        // Tactician/Arcanist logic
        if (this.deadMinionsThisTurn > 0) {
            if (this.player.traits.diceCount === 6) { 
                 this.rerolls += this.deadMinionsThisTurn;
                 ParticleSys.createFloatingText(this.player.x, this.player.y, `+${this.deadMinionsThisTurn} REROLLS`, "#00f3ff");
            }
            if (this.player.traits.baseMana === 5) { 
                 this.player.mana += this.deadMinionsThisTurn;
                 ParticleSys.createFloatingText(this.player.x, this.player.y, `+${this.deadMinionsThisTurn} MANA`, "#bc13fe");
            }
        }
        this.deadMinionsThisTurn = 0; 

        // Jammer Affix Logic
        let diceToRoll = this.player.diceCount;
        if (this.enemy && this.enemy.affixes && this.enemy.affixes.includes('Jammer')) {
            diceToRoll = Math.max(3, diceToRoll - 1);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "JAMMED!", "#ff0000");
        }

        this.rollDice(diceToRoll); 
        
        const btnEnd = document.getElementById('btn-end-turn');
        if(btnEnd) {
             btnEnd.disabled = false;
             btnEnd.innerText = "END PHASE";
             btnEnd.style.opacity = 1;
        }

        this.updateHUD();
    },

    calculateCardDamage(baseDmg, type = null, target = null) {
        let dmg = baseDmg;
        
        // --- PLAYER SIDE MODIFIERS (Outgoing) ---
        
        // 1. Meta Upgrades
        if(this.hasMetaUpgrade('m_dmg')) dmg += 1;

        // 2. Class Traits
        const dmgMult = this.player.traits.dmgMultiplier || 1.0;
        dmg = Math.floor(dmg * dmgMult);

        // 3. Relics
        if(this.player.hasRelic('titan_module')) {
            const stacks = this.player.relics.filter(r => r.id === 'titan_module').length;
            dmg = Math.floor(dmg * Math.pow(1.25, stacks));
        }
        
        // 4. Charge Multipliers (Reckless/Vicious)
        if ((type === 'ATTACK' || type === 'METEOR') && this.player.nextAttackMult > 1) {
            dmg = Math.floor(dmg * this.player.nextAttackMult);
        }
        
        // 5. Player Status (Weak)
        if (this.player.hasEffect('weak')) {
            dmg = Math.floor(dmg * 0.5);
        }
        
        // --- TARGET SIDE MODIFIERS (Incoming / Preview) ---
        // We only apply these if a specific target is provided (for UI Tooltips).
        // In actual combat, 'takeDamage()' handles these calculations to avoid double-dipping.
        if (target && (target instanceof Enemy || target instanceof Minion)) {
            
            // Overcharge / Hyper Beam
            const overcharge = target.hasEffect('overcharge');
            if (overcharge) {
                // val > 0 is Hyper Beam (2.0x), else Overcharge (1.5x)
                const modifier = overcharge.val > 0 ? 2.0 : 1.5;
                dmg = Math.floor(dmg * modifier);
            }
            
            // Frail
            if (target.hasEffect('frail')) {
                dmg = Math.floor(dmg * 1.3);
            }
        }
        
        return dmg;
    },

    rollDice(count) {
        this.dicePool = [];
        
        // TUTORIAL RIGGING
        if (this.currentState === STATE.TUTORIAL_COMBAT) {
            if (this.tutorialStep <= 2) {
                // Turn 1: 1 Attack, 1 Defend
                this.dicePool = [
                    { id: 0, type: 'ATTACK', used: false, selected: false },
                    { id: 1, type: 'DEFEND', used: false, selected: false }
                ];
                this.renderDiceUI();
                return;
            } 
            // CHANGED: Step 7 is the Reroll step now
            if (this.tutorialStep === 7) {
                // Turn 2 (Before Reroll): 2 Mana (Useless)
                this.dicePool = [
                    { id: 0, type: 'MANA', used: false, selected: false },
                    { id: 1, type: 'MANA', used: false, selected: false }
                ];
                this.renderDiceUI();
                return;
            }
        }

        // STANDARD LOGIC
        const availableTypes = Object.keys(DICE_TYPES).filter(key => {
            const d = DICE_TYPES[key];
            if (!d.locked) return true;
            if (key === 'VOODOO' && this.player.hasRelic('voodoo_doll')) return true;
            if (key === 'OVERCHARGE' && this.player.hasRelic('overcharge_chip')) return true;
            if (key === 'RECKLESS_CHARGE' && this.player.hasRelic('reckless_drive')) return true;
            return false;
        });

        for(let i=0; i<count; i++) {
            const k = availableTypes[Math.floor(Math.random() * availableTypes.length)];
            this.dicePool.push({
                id: i, type: k, used: false, selected: false
            });
        }
        this.renderDiceUI();
    },

    renderDiceUI() {
        const container = document.getElementById('dice-container');
        container.innerHTML = '';
        this.dicePool.forEach(die => {
            const data = DICE_TYPES[die.type];
            const isUpgraded = this.player.hasDiceUpgrade(die.type);
            const upgradeData = DICE_UPGRADES[die.type];
            
            const el = document.createElement('div');
            el.className = `die ${die.selected ? 'selected' : ''} ${die.used ? 'used' : ''}`;
            
            el.innerHTML = `${isUpgraded ? upgradeData.icon : data.icon}`;
            if(data.cost > 0) el.innerHTML += `<div class="die-cost">${data.cost}⚡</div>`;
            
            el.style.borderColor = data.color;
            el.style.color = data.color;
            
            if (isUpgraded) {
                el.style.borderColor = COLORS.GOLD;
                el.style.boxShadow = `0 0 10px ${COLORS.GOLD}`;
            }
            
            if(data.type === 'ATTACK' && !die.used && this.player && this.player.hasRelic('relentless') && this.attacksThisTurn === 2) {
                 el.style.boxShadow = `0 0 25px ${data.color}`;
                 el.style.borderColor = "#fff";
                 el.style.transform = "scale(1.1)";
            }
            
            if(!die.used) {
                el.onpointerdown = (e) => this.startDrag(e, die, el);

                let desc = isUpgraded 
                    ? `<strong>${upgradeData.name}</strong>\n${upgradeData.desc}`
                    : `<strong>${die.type}</strong>\n${data.desc}`;

                if (['ATTACK', 'EARTHQUAKE', 'METEOR'].includes(die.type)) {
                    let base = 0;
                    if (die.type === 'ATTACK') base = isUpgraded ? 8 : 5;
                    else if (die.type === 'EARTHQUAKE') base = isUpgraded ? 8 : 5;
                    else if (die.type === 'METEOR') base = isUpgraded ? 50 : 30;
                    
                    // FIX: Pass 'this.enemy' to calculate damage against the current boss/target
                    // This ensures Overcharge/Hyper Beam is reflected in the number.
                    const target = (this.currentState === STATE.COMBAT) ? this.enemy : null;
                    const finalDmg = this.calculateCardDamage(base, die.type, target);
                    
                    // Regex to update text like "Deal 15 DMG" -> "Deal 56 DMG"
                    desc = desc.replace(/Deal (\d+) (damage|DMG)/i, `Deal ${finalDmg} $2`);
                }

                el.onmouseenter = (e) => TooltipMgr.show(desc, e.clientX, e.clientY);
                el.onmouseleave = () => TooltipMgr.hide();

                // Mobile Touch
                el.addEventListener('touchstart', (e) => {
                    const touch = e.touches[0];
                    TooltipMgr.show(desc, touch.clientX, touch.clientY - 80);
                }, { passive: true });

                el.oncontextmenu = (e) => {
                    e.preventDefault();
                    if(!this.player.traits.noRerolls) {
                        die.selected = !die.selected;
                        this.renderDiceUI();
                    }
                };
            }
            container.appendChild(el);
        });
        document.getElementById('reroll-badge').innerText = this.rerolls;
    },

    useDie(die, el, target) {
        if(die.used) return;
        const data = DICE_TYPES[die.type];
        const isUpgraded = this.player.hasDiceUpgrade(die.type);

        if (target) {
            const isTargetEnemy = (target instanceof Enemy || (target instanceof Minion && !target.isPlayerSide));
            const isTargetPlayer = (target instanceof Player || (target instanceof Minion && target.isPlayerSide));
            
            if (data.target === 'enemy' && !isTargetEnemy) {
                 ParticleSys.createFloatingText(target.x, target.y - 120, "INVALID TARGET", "#888");
                 return;
            }
            if ((data.target === 'self') && !isTargetPlayer) {
                 ParticleSys.createFloatingText(target.x, target.y - 120, "TARGET SELF/ALLY", "#888");
                 return;
            }
        }

        if(data.cost > 0 && this.player.mana < data.cost) {
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "NO MANA", "#ff0000");
            el.style.transform = 'translateX(5px)';
            setTimeout(() => el.style.transform = 'translateX(-5px)', 50);
            setTimeout(() => el.style.transform = '', 100);
            return;
        }

        if(data.cost > 0) this.player.mana -= data.cost;

        TooltipMgr.hide();
        die.used = true;
        this.renderDiceUI(); 
        
        const type = die.type;
        const finalEnemy = (target instanceof Enemy || (target instanceof Minion && !target.isPlayerSide)) ? target : this.enemy;
        const finalSelf = (target instanceof Player || (target instanceof Minion && target.isPlayerSide)) ? target : this.player;

        const executeAction = (qteMultiplier = 1.0) => {
            // --- TUTORIAL LOGIC ---
            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                // Step 3 (QTE Clicked) -> Step 4 (Shield)
                if (this.tutorialStep === 3) {
                    this.tutorialStep = 4;
                    this.updateTutorialStep();
                }
                // Step 4 (Shield) -> Step 5 (End Turn)
                else if (this.tutorialStep === 4) {
                    this.tutorialStep = 5;
                    this.updateTutorialStep();
                }
                // Step 8 (Summon) -> Step 9 (Finish)
                else if (this.tutorialStep === 8 && type === 'MINION') {
                    this.tutorialStep = 9;
                    this.updateTutorialStep();
                }
                
                // FIX: Victory Check - Only trigger if we are actually ATTACKING
                // This prevents the Shield (Step 4) from ending the tutorial early
                if ((type === 'ATTACK' || type === 'METEOR' || type === 'EARTHQUAKE') && 
                    finalEnemy.currentHp - (5 * qteMultiplier) <= 0) {
                    
                    setTimeout(() => this.openPostTutorial(), 1000);
                    return; 
                }
            }

            this.player.playAnim('lunge');

            // Consume Charge Multiplier for Attacks
            let chargeMult = 1.0;
            if (type === 'ATTACK' || type === 'METEOR' || type === 'EARTHQUAKE') {
                 chargeMult = this.player.nextAttackMult;
                 this.player.nextAttackMult = 1; 
            }
            
            if (type === 'ATTACK' && this.enemy) {
                
                if (type === 'ATTACK') {
                    this.attacksThisTurn++;
                    
                    const rStacks = this.player.relics.filter(r => r.id === 'relentless').length;
                    let triggerRelentless = false;

                    if (rStacks === 1 && this.attacksThisTurn === 3) triggerRelentless = true;
                    else if (rStacks === 2 && this.attacksThisTurn === 2) triggerRelentless = true;
                    else if (rStacks >= 3 && this.attacksThisTurn === 1) triggerRelentless = true;

                    if (triggerRelentless) {
                        qteMultiplier *= 3.0; 
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "RELENTLESS!", COLORS.GOLD);
                    }
                }

                this.performAttackEffect(this.player, finalEnemy);
                AudioMgr.playSound('attack');
                
                let dmg = isUpgraded ? 8 : 5;
                dmg = this.calculateCardDamage(dmg, type); 
                dmg = Math.floor(dmg * qteMultiplier * chargeMult); 

                if(this.player.hasRelic('thorn_mail')) this.player.addShield(1);

                if(this.player.hasRelic('crit_lens')) {
                    const stacks = this.player.relics.filter(r => r.id === 'crit_lens').length;
                    if(Math.random() < (0.15 * stacks)) {
                        dmg *= 2;
                        ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 80, "LENS CRIT!", COLORS.ORANGE);
                    }
                }
                
                if(this.player.traits.lifesteal) {
                    this.player.heal(2);
                }
                
                if (isUpgraded && Math.random() < 0.25) {
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "BLADE STORM", COLORS.GOLD);
                    const targets = [this.enemy, ...this.enemy.minions];
                    let bossDead = false;
                    targets.forEach(t => {
                        this.performAttackEffect(this.player, t);
                        if(t.takeDamage(dmg)) {
                            if(t === this.enemy) bossDead = true;
                            else this.enemy.minions = this.enemy.minions.filter(m => m !== t);
                        }
                    });
                    if(bossDead) { this.winCombat(); return; }
                } else {
                    if (finalEnemy.takeDamage(dmg)) { 
                        if (finalEnemy === this.enemy) {
                             this.winCombat();
                             return;
                        } else {
                            this.enemy.minions = this.enemy.minions.filter(m => m !== finalEnemy);
                            if(this.player.hasRelic('brutalize') && !finalEnemy.isPlayerSide) {
                                 this.triggerBrutalize(finalEnemy);
                            }
                        }
                        return; 
                    }
                }
                
            } else if (type === 'DEFEND') {
                let shieldAmt = isUpgraded ? 8 : 5;
                finalSelf.addShield(shieldAmt);
                AudioMgr.playSound('defend');
                
                if(isUpgraded) {
                    this.player.minions.forEach(m => m.addShield(3));
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "AEGIS FIELD", COLORS.SHIELD);
                }

            } else if (type === 'MANA') {
                this.player.mana += isUpgraded ? 2 : 1;
                if(isUpgraded) this.player.heal(2);
                if(this.player.hasRelic('recycle_bin')) this.player.heal(1);
                AudioMgr.playSound('mana');

            } else if (type === 'MINION') {
                if (target instanceof Minion && target.isPlayerSide) {
                    if (isUpgraded) {
                        target.maxHp += 10; target.currentHp += 10; target.dmg += 5; target.level++;
                        ParticleSys.createFloatingText(target.x, target.y - 80, "ALPHA BOOST!", COLORS.GOLD);
                        target.playAnim('pulse');
                        AudioMgr.playSound('upgrade');
                    } else {
                        target.upgrade();
                    }
                } else {
                    if (this.player.minions.length < this.player.maxMinions) {
                        const m = new Minion(0, 0, this.player.minions.length + 1, true);
                        
                        // Alpha Call Buffs
                        if(isUpgraded) {
                            m.upgrade(); 
                            m.addShield(5); 
                            m.dmg += 5;
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "ALPHA CALL", COLORS.GOLD);
                        }

                        if(this.player.traits.startShield) m.addShield(10); 
                        
                        if(this.player.hasRelic('neural_link')) {
                            m.maxHp += 2; m.currentHp += 2; m.dmg += 1;
                        }
                        
                        this.player.minions.push(m);
                        ParticleSys.createExplosion(this.player.x, this.player.y, 20, COLORS.NATURE_LIGHT);
                        AudioMgr.playSound('mana');
                    } else {
                        if(this.player.minions.length > 0) {
                            const m = this.player.minions[Math.floor(Math.random() * this.player.minions.length)];
                            m.upgrade();
                        }
                    }
                }
            } 
            else if (type === 'EARTHQUAKE') {
                this.performAttackEffect(this.player, this.enemy);
                Game.shake(10);
                AudioMgr.playSound('explosion');
                const targets = [this.enemy, ...this.enemy.minions];
                let deadEnemy = false;
                
                targets.forEach(t => {
                    let dmg = isUpgraded ? 8 : 5;
                    dmg = this.calculateCardDamage(dmg, type); 
                    
                    // FIX: Apply QTE Multiplier and Charge Multiplier
                    dmg = Math.floor(dmg * qteMultiplier * chargeMult);

                    if(isUpgraded) {
                        t.addEffect('weak', 1, 0, '🦠', '50% less Dmg.', 'WEAK');
                    }
                    
                    if (t.takeDamage(dmg)) {
                        if (t === this.enemy) deadEnemy = true;
                        else {
                            this.enemy.minions = this.enemy.minions.filter(m => m !== t);
                            if(this.player.hasRelic('brutalize') && !t.isPlayerSide) {
                                 this.triggerBrutalize(t);
                            }
                        }
                    }
                });
                if(deadEnemy) { this.winCombat(); return; }

            } else if (type === 'METEOR') {
                ParticleSys.createExplosion(finalEnemy.x, finalEnemy.y - 100, 30, COLORS.PURPLE);
                this.performAttackEffect(this.player, finalEnemy);
                let dmg = isUpgraded ? 50 : 30;
                
                dmg = this.calculateCardDamage(dmg, type); 
                dmg = Math.floor(dmg * qteMultiplier * chargeMult); 
                
                AudioMgr.playSound('explosion');

                if (finalEnemy.takeDamage(dmg)) {
                    if (finalEnemy === this.enemy) { 
                        this.winCombat();
                        return;
                    } else {
                        this.enemy.minions = this.enemy.minions.filter(m => m !== finalEnemy);
                        if(this.player.hasRelic('brutalize') && !finalEnemy.isPlayerSide) {
                             this.triggerBrutalize(finalEnemy);
                        }
                    }
                    return; 
                }

            } else if (type === 'CONSTRICT') {
                 const val = isUpgraded ? 0.25 : 0.5;
                 const dur = isUpgraded ? 3 : 2;
                 const name = isUpgraded ? "DIGITAL ROT" : "CONSTRICT";
                 const icon = isUpgraded ? DICE_UPGRADES.CONSTRICT.icon : DICE_TYPES.CONSTRICT.icon;
                 
                 finalEnemy.addEffect('constrict', dur, val, icon, 'Atk/Heal reduced.', name);
                 this.performAttackEffect(this.player, finalEnemy);
                 AudioMgr.playSound('attack');
                 
            } else if (type === 'VOODOO') {
                 let val = 0;
                 if (!isUpgraded) {
                     val = this.calculateCardDamage(100);
                 }

                 const name = isUpgraded ? "VOID CURSE" : "VOODOO";
                 const icon = isUpgraded ? DICE_UPGRADES.VOODOO.icon : DICE_TYPES.VOODOO.icon;

                 finalEnemy.addEffect('voodoo', 3, val, icon, 'Doom incoming.', name);
                 ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 120, "CURSED", "#f00");
                 AudioMgr.playSound('attack');
                 
            } else if (type === 'OVERCHARGE') {
                 const val = isUpgraded ? 1 : 0;
                 const name = isUpgraded ? "HYPER BEAM" : "OVERCHARGE";
                 const icon = isUpgraded ? DICE_UPGRADES.OVERCHARGE.icon : DICE_TYPES.OVERCHARGE.icon;

                 finalEnemy.addEffect('overcharge', 3, val, icon, 'Unstable: Dmg Taken increased.', name);
                 ParticleSys.createExplosion(finalEnemy.x, finalEnemy.y, 20, "#ff4400");
                 AudioMgr.playSound('mana');
                 
            } else if (type === 'RECKLESS_CHARGE') {
                if (isUpgraded) {
                    this.player.nextAttackMult = 3;
                    this.player.incomingDamageMult = 1.5; 
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "VICIOUS CHARGE", "#ff0000");
                } else {
                    this.player.nextAttackMult = 2;
                    this.player.incomingDamageMult = 3; 
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "RECKLESS CHARGE", "#ff4400");
                }
                AudioMgr.playSound('upgrade');
            }

            this.updateHUD();
            this.renderDiceUI();
            if(this.enemy) {
                this.enemy.checkPhase();
                this.enemy.updateIntentValues();
            }
        }; 

        if (type === 'ATTACK' || type === 'METEOR' || type === 'EARTHQUAKE') { 
             // TUTORIAL FIX: Advance to Step 3 (Text) BEFORE starting the QTE
             if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 2) {
                 this.tutorialStep = 3;
                 this.updateTutorialStep();
             }
             
             this.startQTE('ATTACK', finalEnemy.x, finalEnemy.y, executeAction);
             return;
        }

        executeAction();
    },
    
    triggerBrutalize(source) {
        if(!this.player.hasRelic('brutalize')) return;
        
        const stacks = this.player.relics.filter(r => r.id === 'brutalize').length;
        
        // CHANGED: Logic = (Minion DMG + 3) * Stacks
        const sourceDmg = source.dmg || source.baseDmg || 0;
        const dmg = (sourceDmg + 3) * stacks;
        
        const targets = [];
        if (this.enemy && this.enemy !== source && this.enemy.currentHp > 0) targets.push(this.enemy);
        this.enemy.minions.forEach(m => {
            if(m !== source && m.currentHp > 0) targets.push(m);
        });

        if(targets.length > 0) {
            ParticleSys.createFloatingText(source.x, source.y, `BRUTALIZE (${dmg})`, "#ff0000");
            AudioMgr.playSound('hit');
            
            let bossDied = false;
            targets.forEach(t => {
                if(t.takeDamage(dmg)) {
                    if(t === this.enemy) bossDied = true;
                    else this.enemy.minions = this.enemy.minions.filter(min => min !== t);
                }
            });
            
            if(bossDied) this.winCombat();
        }
    },

    rerollDice() {
        // TUTORIAL RIGGING
        if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 7) {
            // Give 1 Minion, 1 Attack
            this.dicePool = [
                { id: 0, type: 'MINION', used: false, selected: false },
                { id: 1, type: 'ATTACK', used: false, selected: false }
            ];
            this.rerolls--; 
            this.renderDiceUI();
            
            // Advance to Summon Step
            this.tutorialStep = 8;
            this.updateTutorialStep();
            return;
        }

        // STANDARD LOGIC
        if(this.rerolls <= 0) return;
        let toReroll = this.dicePool.filter(d => d.selected && !d.used);
        if(toReroll.length === 0) toReroll = this.dicePool.filter(d => !d.used);
        if(toReroll.length === 0) return;

        const diceEls = document.querySelectorAll('.die');
        diceEls.forEach((el, idx) => {
             if(toReroll.includes(this.dicePool[idx])) {
                 el.classList.add('rerolling');
             }
        });

        setTimeout(() => {
            const availableTypes = Object.keys(DICE_TYPES).filter(key => {
                const d = DICE_TYPES[key];
                if (!d.locked) return true;
                if (key === 'VOODOO' && this.player.hasRelic('voodoo_doll')) return true;
                if (key === 'OVERCHARGE' && this.player.hasRelic('overcharge_chip')) return true;
                if (key === 'RECKLESS_CHARGE' && this.player.hasRelic('reckless_drive')) return true;
                return false;
            });

            toReroll.forEach(d => {
                d.type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
                d.selected = false;
            });
            this.rerolls--;
            this.renderDiceUI();
        }, 300);
    },
    
    performAttackEffect(source, target) {
        const color = (source.isPlayerSide || source instanceof Player) ? COLORS.MANA : COLORS.MECH_LIGHT;
        this.effects.push({
            sx: source.x, sy: source.y,
            tx: target.x, ty: target.y,
            color: color,
            life: 15, maxLife: 15
        });
    },

    drawEffects() {
        for(let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.life--;
            if(e.life <= 0) {
                this.effects.splice(i, 1);
                continue;
            }
            
            this.ctx.save();
            this.ctx.strokeStyle = e.color;
            this.ctx.lineWidth = 4;
            this.ctx.shadowColor = e.color;
            this.ctx.shadowBlur = 20;
            this.ctx.globalAlpha = e.life / e.maxLife;
            
            this.ctx.beginPath();
            this.ctx.moveTo(e.sx, e.sy);
            this.ctx.lineTo(e.tx, e.ty);
            this.ctx.stroke();
            this.ctx.restore();
        }
    },
    
    async endTurn() {
        // TUTORIAL LOGIC: Step 5 (End Phase) -> Step 6 (QTE) -> Step 7 (Reroll)
        if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 5) {
            
            // 1. Move to QTE Step (Text updates here)
            this.tutorialStep = 6;
            this.updateTutorialStep(); 
            
            // Wait for player to read "INCOMING ATTACK"
            await this.sleep(2000);

            // 2. Trigger Defend QTE
            // Explicitly reset QTE properties to ensure visibility
            this.qte.radius = 100; 
            const multiplier = await this.startQTE('DEFEND', this.player.x, this.player.y);
            
            // 3. Resolve Damage
            let dmg = 5;
            dmg = Math.floor(dmg * multiplier);
            this.player.takeDamage(dmg);
            
            await this.sleep(1000);

            // 4. Move to Reroll Step
            this.tutorialStep = 7;
            this.updateTutorialStep();
            
            // 5. Deal new cards (Rolls Mana cards for the tutorial)
            this.startTurn();
            return;
        }
        
        if(!this.enemy) return;
        
        const btnEnd = document.getElementById('btn-end-turn');
        if(btnEnd) {
             btnEnd.disabled = true;
             btnEnd.innerText = "ENEMY PHASE";
             btnEnd.style.opacity = 0.5;
        }

        // --- PLAYER MINION PHASE ---
        for (const m of this.player.minions) {
            if(!this.enemy || this.enemy.currentHp <= 0) break;
            
            m.playAnim('lunge');
            await this.sleep(300); 
            
            const targets = [this.enemy, ...this.enemy.minions];
            const t = targets[Math.floor(Math.random() * targets.length)];
            
            if(t && t.currentHp > 0) {
                this.performAttackEffect(m, t);
                AudioMgr.playSound('attack');
                // Pass 'm' as source so spikes/brutalize work correctly
                if (t.takeDamage(m.dmg, m) && t === this.enemy) { this.winCombat(); return; }
                if (t !== this.enemy && t.currentHp <= 0) {
                     if (this.player.traits.lifesteal && !t.isPlayerSide) {
                         this.player.heal(10);
                         ParticleSys.createFloatingText(this.player.x, this.player.y, "FEED", "#ff0000");
                     }

                     this.enemy.minions = this.enemy.minions.filter(min => min !== t);
                     if(this.player.hasRelic('brutalize') && !t.isPlayerSide) {
                         this.triggerBrutalize(t);
                         if(this.enemy.currentHp <= 0) { this.winCombat(); return; }
                     }
                }
            }
            await this.sleep(500);
        }
        
        if(!this.enemy || this.enemy.currentHp <= 0) { this.winCombat(); return; }

        // --- ENEMY INTENT PHASE ---
        const intent = this.enemy.nextIntent;
        this.enemy.playAnim('lunge');
        
        if (intent.secondary) {
            const isImproved = (this.enemy.isElite || this.enemy.isBoss);
            
            if (intent.secondary.type === 'buff') {
                const hpGain = isImproved ? 15 : 5;
                const dmgGain = isImproved ? 5 : 2;
                
                this.enemy.maxHp += hpGain;
                this.enemy.currentHp += hpGain;
                this.enemy.baseDmg += dmgGain;
                
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "EMPOWERED!", "#ff00ff");
                AudioMgr.playSound('upgrade');
                await this.sleep(400);
            } else if (intent.secondary.type === 'debuff') {
                const id = intent.secondary.id;
                const duration = isImproved ? 3 : 2;
                let desc = "";
                
                if (id === 'weak') desc = "Deals 50% less DMG.";
                if (id === 'frail') desc = "Takes 30% more DMG.";
                
                this.player.addEffect(id, duration, 0, '🦠', desc);
                ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "SYSTEM HACKED", "#00ff00");
                AudioMgr.playSound('attack');
                await this.sleep(400);
            }
        }

        if(intent.type === 'attack') {
            const target = intent.target || this.player;
            const validTarget = (target.currentHp > 0) ? target : this.player;
            
            await this.sleep(400); 

            if (validTarget === this.player) {
                const multiplier = await this.startQTE('DEFEND', this.player.x, this.player.y);
                
                this.performAttackEffect(this.enemy, validTarget);
                AudioMgr.playSound('attack');
                
                let dmg = intent.val;
                dmg = Math.floor(dmg * multiplier);
                
                // Pass 'this.enemy' as source
                if (validTarget.takeDamage(dmg, this.enemy) && validTarget === this.player) { this.gameOver(); return; }
            } else {
                // Enemy attacks Player Minion
                this.performAttackEffect(this.enemy, validTarget);
                AudioMgr.playSound('attack');
                // Pass 'this.enemy' as source
                if (validTarget.takeDamage(intent.val, this.enemy)) {
                     // Summoner Revive Check
                     if (this.player.traits.maxMinions === 3 && Math.random() < 0.3) { 
                         validTarget.currentHp = Math.floor(validTarget.maxHp / 2);
                         ParticleSys.createFloatingText(validTarget.x, validTarget.y, "REVIVED!", "#00ff99");
                     } else {
                         // Minion Dies
                         this.player.minions = this.player.minions.filter(m => m !== validTarget);
                         this.deadMinionsThisTurn++; 

                         // Annihilator Bomb Bot Logic
                         if (this.player.traits.minionName === "Bomb Bot") {
                             ParticleSys.createExplosion(validTarget.x, validTarget.y, 30, "#ff8800");
                             ParticleSys.createFloatingText(validTarget.x, validTarget.y, "EXPLOSION!", "#ff8800");
                             AudioMgr.playSound('explosion');
                             
                             if(this.enemy.takeDamage(10) && this.enemy.currentHp <= 0) { this.winCombat(); return; }
                             
                             this.enemy.minions.forEach(m => m.takeDamage(10));
                             this.enemy.minions = this.enemy.minions.filter(m => m.currentHp > 0);
                         }
                     }
                }
            }
            
        } else if (intent.type === 'heal') {
            await this.sleep(300);
            this.enemy.heal(intent.val);
        } else if (intent.type === 'summon') {
            await this.sleep(300);
            if(this.enemy.minions.length < 2) {
                const m = new Minion(this.enemy.x, this.enemy.y, this.enemy.minions.length + 1, false);
                this.enemy.minions.push(m);
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, "REINFORCING", "#fff");
                AudioMgr.playSound('mana');
            }
        }
        
        await this.sleep(800); 

        // --- ENEMY MINION PHASE ---
        for (const min of this.enemy.minions) {
            min.playAnim('lunge');
            await this.sleep(300);

            const targets = [this.player, ...this.player.minions];
            const t = targets[Math.floor(Math.random() * targets.length)];
            if(t) {
                this.performAttackEffect(min, t);
                AudioMgr.playSound('attack');
                // Pass 'min' as source
                if (t.takeDamage(min.dmg, min) && t === this.player) { this.gameOver(); return; }
                if (t !== this.player && t.currentHp <= 0) {
                     // Summoner Revive Check
                     if (this.player.traits.maxMinions === 3 && Math.random() < 0.3) { 
                         t.currentHp = Math.floor(t.maxHp / 2);
                         ParticleSys.createFloatingText(t.x, t.y, "REVIVED!", "#00ff99");
                     } else {
                        // Minion Dies
                        this.player.minions = this.player.minions.filter(m => m !== t);
                        this.deadMinionsThisTurn++; 

                        // Annihilator Bomb Bot Logic
                        if (this.player.traits.minionName === "Bomb Bot") {
                             ParticleSys.createExplosion(t.x, t.y, 30, "#ff8800");
                             ParticleSys.createFloatingText(t.x, t.y, "EXPLOSION!", "#ff8800");
                             AudioMgr.playSound('explosion');
                             
                             if(this.enemy.takeDamage(10) && this.enemy.currentHp <= 0) { this.winCombat(); return; }
                             
                             this.enemy.minions.forEach(m => m.takeDamage(10));
                             this.enemy.minions = this.enemy.minions.filter(m => m.currentHp > 0);
                        }
                     }
                }
            }
            await this.sleep(600);
        }
        
        this.enemy.minions = this.enemy.minions.filter(m => m.currentHp > 0);
        
        this.updateHUD();
        this.startTurn();
    },

    winCombat() {
        // FIX: If in Tutorial, skip standard rewards and go to Debriefing
        if (this.currentState === STATE.TUTORIAL_COMBAT) {
            setTimeout(() => this.openPostTutorial(), 500);
            return;
        }

        let frags = 0;
        
        if (this.enemy.isBoss) {
            this.bossDefeated = true;
        }

        let droppedFile = false;
        if (this.enemy.isBoss) {
            frags = 95;
            droppedFile = true; 
        } else if (this.enemy.isElite) {
            frags = Math.floor(Math.random() * (37 - 21 + 1)) + 21;
            if (Math.random() < 0.10) droppedFile = true; 
        } else {
            frags = Math.floor(Math.random() * (27 - 11 + 1)) + 11;
        }

        if (droppedFile) {
            this.encryptedFiles++;
            try { localStorage.setItem('mvm_encrypted', this.encryptedFiles); } catch(e) {}
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2 + 50, "ENCRYPTED FILE ACQUIRED", COLORS.MANA);
        }
        
        const lootBots = this.player.relics.filter(r => r.id === 'loot_bot').length;
        if (lootBots > 0) {
            frags = Math.floor(frags * Math.pow(1.2, lootBots));
        }
        if(this.hasMetaUpgrade('m_greed')) {
            frags = Math.floor(frags * 1.2);
        }

        // Stim Pack Logic
        const stimStacks = this.player.relics.filter(r => r.id === 'stim_pack').length;
        if (stimStacks > 0) {
            const healAmt = 5 * stimStacks;
            this.player.heal(healAmt);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "STIM PACK", COLORS.NATURE_LIGHT);
        }

        this.techFragments += frags;
        this.saveGame(); 
        
        this.enemy = null;
        this.player.minions = [];
        
        AudioMgr.playSound('mana');

        // Delay change state to prevent ghost clicks
        setTimeout(() => {
            this.changeState(STATE.REWARD);
        }, 400); 
    },

    generateRewards() {
        const container = document.getElementById('reward-options');
        container.innerHTML = '';
        
        let choices = 3;
        if(this.player.hasRelic('manifestor')) choices = 4;
        
        let pool = [...UPGRADES_POOL];
        
        // Filter Unique/One-time items
        if(this.player.hasRelic('second_life')) pool = pool.filter(i => i.id !== 'second_life');
        if(this.player.hasRelic('manifestor')) pool = pool.filter(i => i.id !== 'manifestor');
        if(this.player.hasRelic('voodoo_doll')) pool = pool.filter(i => i.id !== 'voodoo_doll');
        if(this.player.hasRelic('overcharge_chip')) pool = pool.filter(i => i.id !== 'overcharge_chip');
        if(this.player.hasRelic('reckless_drive')) pool = pool.filter(i => i.id !== 'reckless_drive'); // NEW
        
        const coreCount = this.player.relics.filter(r => r.id === 'minion_core').length;
        if(coreCount >= 2) pool = pool.filter(i => i.id !== 'minion_core');

        const titanCount = this.player.relics.filter(r => r.id === 'titan_module').length;
        if(titanCount >= 3) pool = pool.filter(i => i.id !== 'titan_module');

        const relentlessCount = this.player.relics.filter(r => r.id === 'relentless').length;
        if(relentlessCount >= 3) pool = pool.filter(i => i.id !== 'relentless');

	// NEW: Filter Crit Lens (Max 5)
        const lensCount = this.player.relics.filter(r => r.id === 'crit_lens').length;
        if(lensCount >= 5) pool = pool.filter(i => i.id !== 'crit_lens');

	const holoCount = this.player.relics.filter(r => r.id === 'hologram').length;
        if(holoCount >= 3) pool = pool.filter(i => i.id !== 'hologram');

        // NEW: Firewall Limit (Max 3)
        const fireCount = this.player.relics.filter(r => r.id === 'firewall').length;
        if(fireCount >= 3) pool = pool.filter(i => i.id !== 'firewall');

        // Shuffle pool
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        const options = pool.slice(0, choices);
        
        options.forEach(item => {
            const card = document.createElement('div');
            const isGold = item.rarity === 'gold';
            const isRed = item.rarity === 'red';
            
            let borderClass = '';
            if (isGold) borderClass = 'gold-border';
            if (isRed) borderClass = 'red-border';

            card.className = `reward-card ${borderClass}`;
            
            const currentCount = this.player.relics.filter(r => r.id === item.id).length;
            const nextDesc = this.getRelicDescription(item, currentCount + 1);

            card.innerHTML = `
                <div class="reward-icon">${item.icon}</div>
                <div class="reward-name ${isGold ? 'gold-text' : ''} ${isRed ? 'red-text' : ''}">${item.name}</div>
                <div class="reward-desc">${nextDesc}</div>
            `;
            
            // --- CLICK HANDLER START ---
            card.onclick = () => { 
                AudioMgr.playSound('click');
                
                // 1. Apply Reward
                if (item.instant) {
                    if(item.id === 'repair') this.player.heal(25);
                    if(item.id === 'hull_plating') { this.player.maxHp += 15; this.player.currentHp += 15; }
                    if(item.id === 'mana_battery') this.player.baseMana += 1;
                } else {
                    this.player.addRelic(item);
                }

                // 2. Mark Node Complete (The Fix)
                this.completeCurrentNode();

                // 3. Handle Boss/Sector Progression
                if (this.bossDefeated) {
                    this.bossDefeated = false;
                    this.sector++;
                    this.generateMap(); 
                    
                    const sectorDisplay = document.getElementById('sector-display');
                    if(sectorDisplay) sectorDisplay.innerText = `SECTOR ${this.sector}`;
                    
                    ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, `SECTOR ${this.sector} INITIATED`, COLORS.MANA);
                    
                    // Save the new map immediately
                    this.saveGame();
                }

                // 4. Return to Map
                this.changeState(STATE.MAP); 
            };
            // --- CLICK HANDLER END ---

            container.appendChild(card);
        });
    },

    gameOver() { 
        const revive = this.player.relics.findIndex(r => r.id === 'second_life');
        if(revive !== -1) {
            this.player.relics.splice(revive, 1);
            this.player.currentHp = Math.floor(this.player.maxHp * 0.5);
            
            ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "REVIVED!", COLORS.GOLD);
            AudioMgr.playSound('mana');
            this.player.playAnim('pulse');
            this.renderRelics();
            this.updateHUD();

            setTimeout(() => {
                this.startTurn();
            }, 1000);
            
            return;
        }

        localStorage.removeItem('mvm_save_v1');
        // CHANGED: Target new ID
        document.getElementById('btn-load-save').style.display = 'none';
        
        this.changeState(STATE.GAMEOVER); 
    },
    
    quitRun() { 
        this.changeState(STATE.MENU); 
    },
    
    shake(amount) { this.shakeTime = amount; },
    updateHUD() {},

    updateMinionPositions() {
        const spacing = 180;
        if (this.player) {
            if (this.player.minions[0]) {
                this.player.minions[0].x = this.player.x - spacing;
                this.player.minions[0].y = this.player.y;
            }
            if (this.player.minions[1]) {
                this.player.minions[1].x = this.player.x + spacing;
                this.player.minions[1].y = this.player.y;
            }
            if (this.player.minions[2]) {
                this.player.minions[2].x = this.player.x;
                this.player.minions[2].y = this.player.y + spacing; 
            }
        }
        if (this.enemy) {
            if (this.enemy.minions[0]) {
                this.enemy.minions[0].x = this.enemy.x - spacing;
                this.enemy.minions[0].y = this.enemy.y;
            }
            if (this.enemy.minions[1]) {
                this.enemy.minions[1].x = this.enemy.x + spacing;
                this.enemy.minions[1].y = this.enemy.y;
            }
        }
    },

    drawHealthBar(entity) {
        if (!entity) return;

        const ctx = this.ctx;
        const width = (entity instanceof Minion) ? 80 : 160;
        const height = 18;
        const x = entity.x - width/2;
        const y = entity.y - entity.radius - 30;
        
        // Draw Bar Background
        ctx.fillStyle = COLORS.HP_BAR_BG;
        ctx.fillRect(x, y, width, height);
        
        // Calculate & Draw HP Fill
        const pct = Math.max(0, entity.currentHp / entity.maxHp);
        const isPlayerSide = (entity instanceof Player || (entity instanceof Minion && entity.isPlayerSide));

        ctx.fillStyle = isPlayerSide ? COLORS.NATURE_LIGHT : COLORS.MECH_LIGHT;
        
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fillRect(x, y, width * pct, height);
        ctx.shadowBlur = 0;
        
        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);

        // TEXT CONFIGURATION
        // Make font Bold and Larger (18px)
        ctx.font = 'bold 18px "Orbitron"'; 
        ctx.textAlign = 'center';
        
        // COLOR CONFIGURATION
        // Player Side = Black Text
        // Enemy Side = White Text
        if (isPlayerSide) {
            ctx.fillStyle = '#000000'; 
        } else {
            ctx.fillStyle = '#ffffff';
        }
        
        // Draw HP Text
        ctx.fillText(`${entity.currentHp}/${entity.maxHp}`, x + width/2, y + 15);

        // Shield Display
        if (entity.shield > 0) {
            const sx = x + width + 10;
            const sy = y + 15;
            ctx.fillStyle = COLORS.SHIELD;
            ctx.font = '24px Arial';
            ctx.textAlign = 'left';
            ctx.fillText("🛡️", sx, sy);
            
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 20px "Orbitron"';
            ctx.fillText(entity.shield, sx + 30, sy);
        }

        // Mana Display (Player Only)
        if (entity instanceof Player) {
            const my = y + height + 5; 
            const manaHeight = 12;
            ctx.fillStyle = '#050011';
            ctx.fillRect(x, my, width, manaHeight);
            
            const manaPct = Math.min(1, Math.max(0, entity.mana / entity.baseMana));
            ctx.fillStyle = COLORS.MANA;
            ctx.shadowColor = COLORS.MANA;
            ctx.shadowBlur = 10;
            ctx.fillRect(x, my, width * manaPct, manaHeight);
            ctx.shadowBlur = 0;
            
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(x, my, width, manaHeight);
            
            // Mana Text: Black, Bold, Slightly Larger
            ctx.fillStyle = '#000000'; 
            ctx.font = 'bold 14px "Orbitron"'; // Increased from 12/normal to 14/bold
            ctx.textAlign = 'center';
            ctx.fillText(`${entity.mana}`, x + width/2, my + 11);
        }

        // Icons/Effects Display
        if (entity.effects.length > 0) {
            let bx = x;
            entity.effects.forEach(eff => {
                ctx.fillStyle = '#fff';
                ctx.font = '20px Arial';
                ctx.fillText(eff.icon, bx + 10, y - 10);
                bx += 25;
            });
        }
    },

    drawEnvironment(dt) {
        if (this.currentState === STATE.META) {
            this.drawSanctuary(dt);
            return;
        }
        
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const time = Date.now() / 1000;

        // Use Sector Config
        const conf = SECTOR_CONFIG[this.sector] || SECTOR_CONFIG[1];

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, conf.bgTop);
        grad.addColorStop(0.4, conf.bgBot);
        grad.addColorStop(1, conf.bgTop);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#fff';
        for(let i=0; i<30; i++) {
            const sx = (i * 137) % w;
            const sy = (i * 243) % (h * 0.4);
            const flicker = Math.random() > 0.95 ? 0.2 : 0.6;
            ctx.globalAlpha = flicker;
            ctx.beginPath();
            ctx.arc(sx, sy, 1.5, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const cx = w/2;
        const cy = h * 0.35;
        const sunGrad = ctx.createLinearGradient(0, cy - 80, 0, cy + 80);
        sunGrad.addColorStop(0, conf.sun[0]); 
        sunGrad.addColorStop(1, conf.sun[1]); 
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, 80, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = conf.bgTop;
        for(let i=0; i<8; i++) {
            const y = cy + 10 + (i*10);
            const hStrip = 2 + i; 
            ctx.fillRect(cx - 90, y, 180, hStrip);
        }

        const horizon = h * 0.45;
        const gridSpeed = 40;
        const offsetY = (time * gridSpeed) % 40;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, horizon, w, h - horizon);
        ctx.clip();

        const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
        floorGrad.addColorStop(0, conf.grid.substring(0,7) + '1A'); 
        floorGrad.addColorStop(1, conf.grid.substring(0,7) + '00');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, horizon, w, h-horizon);

        ctx.strokeStyle = conf.grid;
        ctx.lineWidth = 2;

        const fov = 3.0;
        for (let i = -10; i <= 10; i++) {
            const x = cx + (i * 120);
            ctx.beginPath();
            ctx.moveTo(cx, horizon - 20); 
            ctx.lineTo(x * fov + (cx * (1-fov)), h);
            ctx.stroke();
        }

        for(let y = horizon; y < h; y += 40) {
            const dist = (y - horizon) / (h - horizon);
            const perspectiveY = horizon + (Math.pow(dist, 0.7)) * (h - horizon);
            
            const moveY = perspectiveY + (offsetY * (1-dist)); 
            if (moveY > h) continue;

            ctx.globalAlpha = 0.1 + (dist * 0.4);
            ctx.beginPath();
            ctx.moveTo(0, moveY);
            ctx.lineTo(w, moveY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    },

    drawIntentLine(enemy) {
        if (!enemy.showIntent || !enemy.nextIntent || !enemy.nextIntent.target) return;
        const target = enemy.nextIntent.target;
        if (target.currentHp <= 0) return;

        const ctx = this.ctx;
        const time = Date.now() / 1000;
        
        ctx.save();
        ctx.lineWidth = 3;
        
        const alpha = 0.6 + Math.sin(time * 5) * 0.4;
        const color = `rgba(255, 50, 50, ${alpha})`;
        ctx.strokeStyle = color;
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        
        const midY = (enemy.y + target.y) / 2;
        const curveOffset = (target.x < enemy.x) ? -100 : 100;

        ctx.bezierCurveTo(
            enemy.x + curveOffset, midY,
            target.x + curveOffset, midY,
            target.x, target.y
        );
        ctx.stroke();
        ctx.restore();
    },

    loop(timestamp) {
        // FIX: Clamp delta time to max 0.1s to prevent "instant" QTEs on lag spikes
        let dt = (timestamp - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.1; 
        
        this.lastTime = timestamp;

        this.drawEnvironment(dt);

        if (this.currentState === STATE.META) {
            this.drawSanctuary(dt);
            requestAnimationFrame(this.loop.bind(this));
            return;
        }

        let shakeX = 0, shakeY = 0;
        if(this.shakeTime > 0) {
            shakeX = (Math.random() - 0.5) * 15;
            shakeY = (Math.random() - 0.5) * 15;
            this.shakeTime--;
        }

        this.ctx.save();
        this.ctx.translate(shakeX, shakeY);
        
        this.updateMinionPositions();

        if ((this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT) && this.player && this.enemy) {
            this.drawEntity(this.player);
            
            if (this.player.minions) {
                this.player.minions.forEach(m => {
                    if (m) this.drawEntity(m);
                });
            }
            
            this.drawEntity(this.enemy);
            
            if (this.enemy.minions) {
                this.enemy.minions.forEach(m => {
                    if (m) this.drawEntity(m);
                });
            }
            
            this.drawIntentLine(this.enemy);
            this.drawEffects();
            
            // QTE Updates
            this.updateQTE(dt);
            this.drawQTE();

            this.drawHealthBar(this.player);
            if (this.player.minions) {
                this.player.minions.forEach(m => {
                    if (m) this.drawHealthBar(m);
                });
            }
            this.drawHealthBar(this.enemy);
            if (this.enemy.minions) {
                this.enemy.minions.forEach(m => {
                    if (m) this.drawHealthBar(m);
                });
            }
        }

        ParticleSys.update(dt);
        ParticleSys.draw(this.ctx);
        this.ctx.restore();
        
        requestAnimationFrame(this.loop.bind(this));
    },

    drawEntity(entity) {
        if (!entity) return;

        const ctx = this.ctx;
        let animX = 0, animY = 0;
        
        if (entity.anim && entity.anim.timer > 0) {
            entity.anim.timer--;
            const t = entity.anim.timer;
            if (entity.anim.type === 'lunge') {
                const dir = (entity instanceof Player || (entity instanceof Minion && entity.isPlayerSide)) ? -1 : 1; 
                animY = Math.sin(t * 0.5) * 40 * dir; 
            } else if (entity.anim.type === 'shake') {
                animX = (Math.random() - 0.5) * 20;
            } else if (entity.anim.type === 'pulse') {
                animY = Math.sin(t) * 10;
            }
        }
        
        const renderX = entity.x + animX;
        const renderY = entity.y + animY;

        const isPlayerSide = (entity instanceof Player) || (entity instanceof Minion && entity.isPlayerSide);
        const isMinion = entity instanceof Minion;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.ellipse(renderX, renderY + 40, entity.radius, entity.radius/3, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.lineWidth = 4;
        
       if (isPlayerSide) {
            let themeColor = COLORS.NATURE_LIGHT;
            if (entity instanceof Player) themeColor = entity.classColor || COLORS.NATURE_LIGHT;
            else if (entity instanceof Minion && Game.player) themeColor = Game.player.classColor || COLORS.NATURE_LIGHT;

            ctx.strokeStyle = themeColor;
            ctx.fillStyle = themeColor;
            ctx.shadowColor = themeColor;
            ctx.shadowBlur = 25;
            
            const pulse = Math.sin(Date.now() / 300) * 5;

            if(entity instanceof Player) {
                ctx.beginPath();
                ctx.moveTo(renderX, renderY - 100 + pulse);
                ctx.lineTo(renderX + 60, renderY + pulse);
                ctx.lineTo(renderX, renderY + 100 + pulse);
                ctx.lineTo(renderX - 60, renderY + pulse);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(renderX, renderY + pulse, 20, 0, Math.PI*2);
                ctx.fill();

                ctx.fillStyle = themeColor;
                ctx.beginPath();
                ctx.arc(renderX, renderY + pulse, 10, 0, Math.PI*2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.arc(renderX, renderY + pulse, 30, 0, Math.PI*2);
                ctx.fill();
                ctx.stroke();
            }

        } else {
            const color = isMinion ? '#333' : '#1a0505';
            ctx.strokeStyle = COLORS.MECH_LIGHT;
            ctx.fillStyle = color;
            ctx.shadowColor = COLORS.MECH_LIGHT;
            ctx.shadowBlur = 25;
            
            const hover = Math.cos(Date.now() / 250) * 5;

            if(entity instanceof Enemy) {
                ctx.beginPath();
                const s = 100;
                for (let i = 0; i < 6; i++) {
                    const angle = (Math.PI / 3) * i;
                    const x = renderX + s * Math.cos(angle);
                    const y = renderY + hover + s * Math.sin(angle);
                    if(i===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = COLORS.MECH_LIGHT;
                ctx.fillRect(renderX - 40, renderY - 10 + hover, 80, 20);

                if(entity.nextIntent) {
                    ctx.fillStyle = '#fff';
                    ctx.font = '50px "Segoe UI Emoji"';
                    ctx.textAlign = 'center';
                    ctx.shadowBlur = 0;
                    let icon = '⚔️';
                    if(entity.nextIntent.type === 'heal') icon = '💚';
                    else if(entity.nextIntent.type === 'summon') icon = '🤖';
                    
                    ctx.fillText(icon, renderX, renderY - 220); 
                    
                    if (entity.nextIntent.secondary) {
                        ctx.font = '24px "Segoe UI Emoji"';
                        const secIcon = entity.nextIntent.secondary.type === 'buff' ? '💪' : '🦠';
                        ctx.fillText(secIcon, renderX + 40, renderY - 215);
                    }
                    
                    if(entity.nextIntent.val > 0) {
                        ctx.font = 'bold 24px "Orbitron"';
                        ctx.fillStyle = COLORS.MECH_LIGHT;
                        ctx.fillText(entity.nextIntent.val, renderX, renderY - 190); 
                    }
                }

            } else {
                ctx.beginPath();
                ctx.moveTo(renderX - 30, renderY + hover - 20);
                ctx.lineTo(renderX + 30, renderY + hover - 20);
                ctx.lineTo(renderX, renderY + hover + 30);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                
                ctx.fillStyle = '#f00';
                ctx.beginPath();
                ctx.arc(renderX, renderY + hover, 8, 0, Math.PI*2);
                ctx.fill();
            }
        }
        ctx.shadowBlur = 0; 
        
        if(entity.shield > 0) {
            ctx.strokeStyle = COLORS.SHIELD;
            ctx.lineWidth = 2;
            ctx.shadowColor = COLORS.SHIELD;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(renderX, renderY, entity.radius + 15, 0, Math.PI*2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }, // END OF DRAWENTITY

    // --- TUTORIAL SYSTEM ---

    startTutorial() {
        this.changeState(STATE.TUTORIAL_COMBAT);
        this.tutorialStep = 0;
        
        // Setup Mock Player & Enemy
        this.player = new Player(PLAYER_CLASSES[0]); 
        this.player.currentHp = 50;
        this.player.maxHp = 50;
        this.player.mana = 3;
        this.player.diceCount = 2; 
        
        this.enemy = new Enemy({ name: "Training Dummy", hp: 10, dmg: 5 }, 1);
        this.enemy.nextIntent = { type: 'attack', val: 5, target: this.player }; 
        this.enemy.showIntent = false; 
        
        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.style.zIndex = "3500"; 
        
        const overlay = document.getElementById('tutorial-overlay');
        overlay.classList.remove('hidden');
        overlay.style.opacity = "1"; 
        
        this.updateTutorialStep();
    },

    updateTutorialStep() {
        const overlay = document.getElementById('tutorial-overlay');
        const text = document.getElementById('tutorial-text');
        const canvas = document.getElementById('gameCanvas');
        
        document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));

        text.classList.remove('hidden');
        overlay.classList.remove('hidden');

        switch(this.tutorialStep) {
            case 0: 
                text.innerHTML = "SIMULATION INITIALIZED.<br>Welcome, Operator.<br>We must verify your interface connection.<br><br><strong>[CLICK ANYWHERE TO CONTINUE]</strong>";
                break;

            case 1: 
                text.innerHTML = "Knowledge is power.<br><strong>CLICK OR HOLD</strong> the Enemy Unit to scan their Status.";
                canvas.classList.add('tutorial-focus'); 
                break;

            case 2: 
                text.innerHTML = "Enemy intent detected.<br><strong>DRAG</strong> the Attack Module onto the target.";
                if (this.enemy) this.enemy.showIntent = true;
                this.rollDice(2); 
                setTimeout(() => {
                    const dice = document.querySelectorAll('.die');
                    if(dice[0]) dice[0].classList.add('tutorial-focus'); 
                    canvas.classList.add('tutorial-focus'); 
                }, 150);
                break;

            case 3: 
                canvas.classList.add('tutorial-focus');
                overlay.classList.add('hidden'); 
                text.innerHTML = "ACTION COMMAND DETECTED.<br><strong>CLICK</strong> inside the inner ring to achieve a Critical Hit!";
                break;

            case 4: 
                overlay.classList.remove('hidden');
                text.innerHTML = `
                    Excellent. Critical Hit registered.<br>
                    <div style="font-size: 0.85rem; color: #ccc; margin: 10px 0; font-family: var(--font-main);">
                        (Note: Enemy Intent is always visible via the icon above them.)
                    </div>
                    Incoming damage predicted.<br>
                    <strong>DRAG</strong> the Shield Module to your avatar.
                `;
                setTimeout(() => {
                    const dice = document.querySelectorAll('.die');
                    if(dice[1]) dice[1].classList.add('tutorial-focus');
                    canvas.classList.add('tutorial-focus');
                }, 100);
                break;

            case 5: 
                text.innerHTML = "Cycle complete.<br><strong>TAP</strong> 'END PHASE' to proceed.";
                document.getElementById('btn-end-turn').classList.add('tutorial-focus');
                break;

            case 6: 
                overlay.classList.add('hidden');
                text.innerHTML = "INCOMING ATTACK.<br><strong>CLICK</strong> the ring on your avatar to BLOCK!";
                break;

            case 7: 
                text.innerHTML = "Modules exhausted.<br><strong>TAP</strong> the Reroll icon to generate new data.";
                document.getElementById('btn-reroll').classList.add('tutorial-focus');
                break;

            case 8: 
                text.innerHTML = "Reinforcements available.<br><strong>DRAG</strong> the Summon Module to empty space.<br><span style='font-size:0.8rem; color:#aaa'>(Minions deal damage and can take hits for you.)</span>";
                setTimeout(() => {
                    const dice = document.querySelectorAll('.die');
                    if(dice[0]) dice[0].classList.add('tutorial-focus');
                    canvas.classList.add('tutorial-focus');
                }, 150);
                break;
                
            case 9: 
                text.innerHTML = "Squad deployed. Target vulnerable.<br><strong>DESTROY</strong> the target.";
                overlay.classList.add('hidden');
                setTimeout(() => {
                    const dice = document.querySelectorAll('.die');
                    if(dice[1]) dice[1].classList.add('tutorial-focus');
                    canvas.classList.add('tutorial-focus');
                }, 150);
                break;
        }
    },

    playStory() {
        this.changeState(STATE.STORY);
        const content = document.getElementById('story-content');
        const btn = document.getElementById('btn-finish-story');
        
        content.innerHTML = `
            SIMULATION COMPLETE.<br><br>
            YEAR 21XX.<br>
            The Silicon Empire has paved the oceans.<br>
            Humanity is deleted.<br>
            Nature is illegal.<br><br>
            You are the <strong>GREEN SPARK</strong>.<br>
            The last avatar of life.<br><br>
            Your mission: Infiltrate the Core.<br>
            PROTOCOL: MAGIC IS ONLINE.
        `;
        
        content.classList.remove('story-crawl');
        void content.offsetWidth; 
        content.classList.add('story-crawl');

        setTimeout(() => {
            btn.classList.remove('hidden');
        }, 8000);
    },

    openPostTutorial() {
        document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
        document.getElementById('hud').style.zIndex = ""; 
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('tutorial-overlay').classList.add('hidden');
        document.getElementById('tutorial-text').classList.add('hidden');

        this.tutorialData = POST_TUTORIAL_PAGES;
        this.tutorialPage = 0; 
        this.changeState(STATE.TUTORIAL);
    }

}; // <--- GAME OBJECT CLOSES HERE

window.onload = () => Game.init();