// Achievements service — 40+ launch achievements across combat, exploration,
// mastery, and oddball categories. Tracks unlocked set in localStorage and
// fires a screen-corner toast on unlock.

const KEY_UNLOCKED = 'mvm_achievements_v1';

// Achievement data — `sparks` field replaces the prior `frag` reward.
// Sparks are the only persistent currency now; fragments wipe at run
// end so awarding them on achievement unlock didn't actually reward
// the player. Amounts are deliberately small (1-15) — first-step
// achievements give 1, marquee feats give up to 15, so the total
// achievement payout for the full set is ~150 ✦ instead of the prior
// 20k+ fragments.
export const ACHIEVEMENTS = [
    // ---- Onboarding / first steps
    { id: 'FIRST_KILL',          name: 'First Blood',         desc: 'Defeat your first enemy.',           cat: 'first', sparks: 1 },
    { id: 'FIRST_BOSS',          name: 'Boss Slayer',         desc: 'Defeat your first sector boss.',     cat: 'first', sparks: 3 },
    { id: 'FIRST_RELIC',         name: 'Module Online',       desc: 'Acquire your first relic.',          cat: 'first', sparks: 1 },
    { id: 'TUTORIAL_DONE',       name: 'Boot Sequence',       desc: 'Complete the tutorial.',             cat: 'first', sparks: 1 },
    { id: 'FIRST_RUN_COMPLETE',  name: 'System Restored',     desc: 'Clear all 5 sectors in one run.',    cat: 'first', sparks: 10 },

    // ---- Combat mastery
    { id: 'BIG_HIT_50',          name: 'Heavy Strike',        desc: 'Deal 50 damage in one hit.',         cat: 'combat', sparks: 1 },
    { id: 'BIG_HIT_100',         name: 'Devastator',          desc: 'Deal 100 damage in one hit.',        cat: 'combat', sparks: 2 },
    { id: 'BIG_HIT_250',         name: 'Annihilator',         desc: 'Deal 250 damage in one hit.',        cat: 'combat', sparks: 4 },
    { id: 'PERFECT_BLOCK_5',     name: 'Bulwark',             desc: 'Land 5 perfect blocks in one run.',  cat: 'combat', sparks: 2 },
    { id: 'CRIT_10',             name: 'Sharpshooter',        desc: 'Land 10 QTE crits in one run.',      cat: 'combat', sparks: 2 },
    { id: 'NO_HIT_COMBAT',       name: 'Untouchable',         desc: 'Win a combat without taking damage.',cat: 'combat', sparks: 2 },
    { id: 'ONE_TURN_KILL',       name: 'Overkill',            desc: 'Defeat a non-trivial enemy in 1 turn.', cat: 'combat', sparks: 2 },
    { id: 'TURN_30_PLUS',        name: 'Marathon',            desc: 'Survive a 30+ turn combat.',          cat: 'combat', sparks: 2 },

    // ---- Class mastery
    { id: 'CLASS_TACTICIAN',     name: 'Strategist',          desc: 'Clear sector 5 with Tactician.',     cat: 'class', sparks: 5 },
    { id: 'CLASS_ARCANIST',      name: 'Magister',            desc: 'Clear sector 5 with Arcanist.',      cat: 'class', sparks: 5 },
    { id: 'CLASS_BLOODSTALKER',  name: 'Predator',            desc: 'Clear sector 5 with Blood Stalker.', cat: 'class', sparks: 5 },
    { id: 'CLASS_ANNIHILATOR',   name: 'Demolitionist',       desc: 'Clear sector 5 with Annihilator.',   cat: 'class', sparks: 5 },
    { id: 'CLASS_SENTINEL',      name: 'Bulwark',             desc: 'Clear sector 5 with Sentinel.',      cat: 'class', sparks: 5 },
    { id: 'CLASS_SUMMONER',      name: 'Conduit',             desc: 'Clear sector 5 with Summoner.',      cat: 'class', sparks: 5 },
    { id: 'ALL_CLASSES_S5',      name: 'Six-Sided Mastery',   desc: 'Clear sector 5 with every class.',   cat: 'class', sparks: 15 },

    // ---- Ascension
    { id: 'ASC_1',               name: 'Ascending',           desc: 'Unlock Ascension 1.',                cat: 'asc', sparks: 3 },
    { id: 'ASC_5',               name: 'Half-Climbed',        desc: 'Unlock Ascension 5.',                cat: 'asc', sparks: 6 },
    { id: 'ASC_10',              name: 'Apex',                desc: 'Clear the run on Ascension 10.',     cat: 'asc', sparks: 15 },

    // ---- Exploration
    { id: 'VISIT_SHOP_5',        name: 'Power Shopper',       desc: 'Buy 5 shop items in a single run.',  cat: 'expl', sparks: 2 },
    { id: 'VISIT_REST_3',        name: 'Well Rested',         desc: 'Use 3 rest sites in a single run.',  cat: 'expl', sparks: 1 },
    { id: 'EVENT_10',            name: 'Storyteller',         desc: 'Resolve 10 events across runs.',     cat: 'expl', sparks: 2 },
    { id: 'INTEL_10',            name: 'Decoded',             desc: 'Decrypt 10 lore entries.',           cat: 'expl', sparks: 2 },
    { id: 'INTEL_ALL',           name: 'Loremaster',          desc: 'Decrypt every lore entry.',          cat: 'expl', sparks: 8 },

    // ---- Relic / build
    { id: 'RELIC_10',            name: 'Stockpiler',          desc: 'Have 10+ relics at once.',           cat: 'build', sparks: 2 },
    { id: 'SYNERGY_FIRST',       name: 'Pattern Match',       desc: 'Trigger your first synergy.',        cat: 'build', sparks: 2 },
    { id: 'SYNERGY_ALL',         name: 'Tactician of Tactics',desc: 'Trigger every synergy at least once.', cat: 'build', sparks: 8 },
    { id: 'CORRUPTED_3',         name: 'Risk Tolerance',      desc: 'Hold 3 corrupted relics at once.',   cat: 'build', sparks: 3 },
    { id: 'NO_RELIC_BOSS',       name: 'Naked Power',         desc: 'Defeat a boss with 0 relics.',       cat: 'build', sparks: 4 },

    // ---- Challenge / retention (legacy DAILY_* IDs kept for save compat)
    { id: 'DAILY_FINISH',        name: 'Punch Card',          desc: 'Complete a Challenge Run.',          cat: 'daily', sparks: 1 },
    { id: 'DAILY_7',             name: 'Devoted',              desc: 'Complete 7 Challenge Runs.',         cat: 'daily', sparks: 4 },
    { id: 'DAILY_30',            name: 'Always Online',       desc: 'Complete 30 Challenge Runs.',        cat: 'daily', sparks: 12 },
    { id: 'STREAK_3',            name: 'On a Roll',           desc: 'Login streak of 3 days.',            cat: 'daily', sparks: 1 },
    { id: 'STREAK_7',            name: 'Habitual',            desc: 'Login streak of 7 days.',            cat: 'daily', sparks: 2 },
    { id: 'STREAK_30',           name: 'Devotee',             desc: 'Login streak of 30 days.',           cat: 'daily', sparks: 8 },

    // ---- Oddball
    { id: 'NO_REROLL_BOSS',      name: 'Pure Roll',           desc: 'Defeat a boss without rerolling.',    cat: 'odd', sparks: 4 },
    { id: 'FULL_HP_BOSS',        name: 'Pristine',            desc: 'Defeat a boss at full HP.',          cat: 'odd', sparks: 4 },
    { id: 'FRAGMENTS_10K',       name: 'Hoarder',             desc: 'Bank 10,000 fragments in one run.',  cat: 'odd', sparks: 4 },
    { id: 'GAMEOVER_FIRST',      name: 'Walked the Plank',    desc: 'Lose your first run.',               cat: 'odd', sparks: 1 },
    { id: 'METAGAMER',           name: 'Meta-Gamer',          desc: 'Buy every meta upgrade.',            cat: 'odd', sparks: 8 },

    // ---- Build archetypes (§4.2 expansion)
    { id: 'BUILD_PURE_MINION',   name: 'Swarm Lord',          desc: 'Win a combat with only minion damage.',     cat: 'build', sparks: 3 },
    { id: 'BUILD_NO_ATTACK',     name: 'Pacifist Path',       desc: 'Clear a sector without using an ATTACK die.', cat: 'build', sparks: 4 },
    { id: 'BUILD_NO_REROLL_RUN', name: 'Fate Accepted',       desc: 'Finish a run without rerolling.',            cat: 'build', sparks: 8 },
    { id: 'BUILD_SHIELD_1K',     name: 'Unbreakable',         desc: 'Gain 1000 total shield in a run.',          cat: 'build', sparks: 3 },
    { id: 'BUILD_COMBO_ALL',     name: 'Combo Curator',       desc: 'Trigger every combo type in a single run.', cat: 'build', sparks: 4 },

    // ---- Sector / exploration
    { id: 'CLEAR_SECTOR_1',      name: 'Gatekeeper Down',     desc: 'Clear sector 1.',                    cat: 'expl', sparks: 1 },
    { id: 'CLEAR_SECTOR_2',      name: 'Void Escape',         desc: 'Clear sector 2.',                    cat: 'expl', sparks: 2 },
    { id: 'CLEAR_SECTOR_3',      name: 'Forge Ascended',      desc: 'Clear sector 3.',                    cat: 'expl', sparks: 2 },
    { id: 'CLEAR_SECTOR_4',      name: 'Hive Silenced',       desc: 'Clear sector 4.',                    cat: 'expl', sparks: 3 },
    { id: 'NO_SHOP_RUN',         name: 'Frugal Explorer',     desc: 'Finish a run without visiting a shop.', cat: 'expl', sparks: 4 },

    // ---- Feats (hidden / challenge)
    { id: 'FEAT_1HP_BOSS',       name: 'Edge of Oblivion',    desc: 'Defeat a boss while at 1 HP.',       cat: 'feat', sparks: 8 },
    { id: 'FEAT_SPEEDRUN',       name: 'Blink and Miss',      desc: 'Finish a run in under 15 minutes.',  cat: 'feat', sparks: 6, hidden: true },
    { id: 'FEAT_NO_DAMAGE_S1',   name: 'Ghost Run',           desc: 'Clear sector 1 without taking damage.', cat: 'feat', sparks: 5, hidden: true },
    { id: 'FEAT_SKIP_ALL_REWARDS', name: 'Hardcore Minimalist', desc: 'Clear a sector skipping every reward.', cat: 'feat', sparks: 4, hidden: true },
    { id: 'FEAT_COMBO_CATASTROPHE', name: 'Catastrophic',     desc: 'Land a single 200+ damage hit.',     cat: 'feat', sparks: 5 },
    { id: 'FEAT_FULL_HOUSE',     name: 'Full House',          desc: 'Roll 5 of the same die in one hand.', cat: 'feat', sparks: 5 },

    // ---- Relic / craft
    { id: 'RELIC_LEGENDARY',     name: 'Legendary Pull',      desc: 'Acquire a legendary relic.',         cat: 'build', sparks: 3 },
    { id: 'SYNERGY_5',           name: 'Synergy Savant',      desc: 'Trigger 5 synergies total.',         cat: 'build', sparks: 4 },

    // ---- Kill-count tiers (Intel ledger, §5 follow-up)
    { id: 'KILLS_50',            name: 'Veteran',             desc: 'Defeat 50 enemies total.',           cat: 'combat', sparks: 2 },
    { id: 'KILLS_250',           name: 'Exterminator',        desc: 'Defeat 250 enemies total.',          cat: 'combat', sparks: 6 },
    { id: 'KILLS_1000',          name: 'Legend',              desc: 'Defeat 1000 enemies total.',         cat: 'combat', sparks: 15 },

    // ---- Per-boss specialist (3 kills of the same boss)
    { id: 'SPEC_PANOPTICON',     name: 'Panopticon Specialist',desc: 'Defeat THE PANOPTICON 3 times.',    cat: 'class', sparks: 4 },
    { id: 'SPEC_NULL_POINTER',   name: 'Void Specialist',     desc: 'Defeat NULL_POINTER 3 times.',       cat: 'class', sparks: 4 },
    { id: 'SPEC_COMPILER',       name: 'Forge Specialist',    desc: 'Defeat THE COMPILER 3 times.',       cat: 'class', sparks: 4 },
    { id: 'SPEC_HIVE',           name: 'Hive Specialist',     desc: 'Defeat HIVE PROTOCOL 3 times.',      cat: 'class', sparks: 4 },
    { id: 'SPEC_TESSERACT',      name: 'Source Specialist',   desc: 'Defeat TESSERACT PRIME 3 times.',    cat: 'class', sparks: 5 },
    { id: 'SPEC_ARCHIVIST',      name: 'Archive Specialist',  desc: 'Defeat THE ARCHIVIST 3 times.',      cat: 'class', sparks: 6 }
];

let _toastQueue = [];
let _toastBusy = false;

function _showToast(name, desc) {
    let host = document.getElementById('achievement-toast');
    if (!host) {
        host = document.createElement('div');
        host.id = 'achievement-toast';
        host.className = 'achievement-toast hidden';
        // Anchor to the game container so the toast stays inside the
        // 432px mobile-shaped canvas. Appending to document.body made the
        // toast fly in from the viewport's top-right edge, which lands
        // off-canvas on tablets/desktops where the game container is
        // narrower than the window.
        const parent = document.getElementById('game-container') || document.body;
        parent.appendChild(host);
    }
    host.innerHTML = `
        <div class="ach-toast-line">ACHIEVEMENT UNLOCKED</div>
        <div class="ach-toast-name">${name}</div>
        <div class="ach-toast-desc">${desc}</div>
    `;
    host.classList.remove('hidden');
    requestAnimationFrame(() => host.classList.add('active'));
    setTimeout(() => {
        host.classList.remove('active');
        setTimeout(() => {
            host.classList.add('hidden');
            _toastBusy = false;
            _processQueue();
        }, 350);
    }, 2400);
}

function _processQueue() {
    if (_toastBusy || _toastQueue.length === 0) return;
    const next = _toastQueue.shift();
    _toastBusy = true;
    _showToast(next.name, next.desc);
}

export const Achievements = {
    catalog: ACHIEVEMENTS,

    getUnlocked() {
        try { return JSON.parse(localStorage.getItem(KEY_UNLOCKED) || '[]'); }
        catch { return []; }
    },

    isUnlocked(id) {
        return this.getUnlocked().includes(id);
    },

    unlock(id) {
        if (this.isUnlocked(id)) return false;
        const ach = ACHIEVEMENTS.find(a => a.id === id);
        if (!ach) return false;
        const list = this.getUnlocked();
        list.push(id);
        localStorage.setItem(KEY_UNLOCKED, JSON.stringify(list));
        // Achievements pay SPARKS only now — fragments wipe at run end so
        // awarding them here did nothing. The amount is the per-entry
        // `sparks` field (1-15), small numbers scaled to the achievement
        // difficulty. Silent grant so the achievement toast carries the
        // moment instead of stacking a floater on top.
        if (typeof window !== 'undefined' && window.Game && window.Game.grantSparks) {
            try { window.Game.grantSparks(ach.sparks || 1, 'achievement_' + id, { silent: true }); } catch (_) {}
        }
        _toastQueue.push(ach);
        _processQueue();
        // Spark floater on the player entity so the reward feels tactile.
        try {
            if (typeof window !== 'undefined' && window.Game && window.Game.player) {
                const p = window.Game.player;
                const mod = window.Game._particleModule;
                const sys = (mod && mod.ParticleSys) || window.ParticleSys;
                if (sys && sys.createFloatingText) {
                    const award = ach.sparks || 1;
                    sys.createFloatingText(p.x, p.y - 200, `+${award} ✦ SPARK${award > 1 ? 'S' : ''}`, '#ffd76a');
                    sys.createFloatingText(p.x, p.y - 160, `✦ ${ach.name}`, '#ffd76a');
                }
            }
        } catch (e) {}
        return true;
    },

    // Aggregate counts (for compound achievements)
    incrementCounter(key, amount = 1) {
        const k = 'mvm_ach_ctr_' + key;
        const v = (parseInt(localStorage.getItem(k), 10) || 0) + amount;
        localStorage.setItem(k, String(v));
        return v;
    },
    getCounter(key) {
        return parseInt(localStorage.getItem('mvm_ach_ctr_' + key), 10) || 0;
    }
};

// Expose globally so non-module event hooks can fire unlocks safely.
if (typeof window !== 'undefined') window.Achievements = Achievements;
