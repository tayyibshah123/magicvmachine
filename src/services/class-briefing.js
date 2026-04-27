// Per-class briefing overlay.
//
// Fires on the FIRST REAL COMBAT after tutorial for each class. Explains the
// class's unique identity: what ability widget they have, what their
// signature die does, why it's different from other classes. Seen-flag
// is stored per class so a player who tries all six gets a briefing for
// each, but never sees the same one twice.
//
// Content is data-driven; each class entry has its own headline + body.

import { Analytics } from './analytics.js';

// Bumped to _v3 alongside the post-class-update copy rewrite so existing
// players who already dismissed the old briefings see the corrected
// ability + signature descriptions on their next combat with each class.
const KEY_SEEN = 'mvm_class_briefing_seen_v3';

// Per-class copy. `ability` describes the class ability widget; `signature`
// describes the signature die. Matches the text in constants.js PLAYER_CLASSES
// without quoting it directly so designers can edit in one place.
// Short, punchy, scannable. Player wants to get into combat — give them
// the hook, not a manual.
const COPY = {
    tactician: {
        headline: 'TACTICIAN',
        pillars: 'Patient utility. Adapts every turn.',
        ability: 'COMMAND TRACK fills 1 pip per die used. Spend 3 pips for +1 reroll, +8 shield, or +5 damage on your next ATTACK.',
        signature: 'Volley: 7 damage plus a bonus reroll next turn.'
    },
    arcanist: {
        headline: 'ARCANIST',
        pillars: 'Big mana economy. Timing-driven payoff.',
        ability: 'GLYPH WHEEL cycles Fire, Ice, Lightning. Tap when your pick is lit. Once per turn.',
        signature: 'Spark: 6 damage and +1 mana.'
    },
    bloodstalker: {
        headline: 'BLOODSTALKER',
        pillars: 'HP as resource. Lifesteal sustain.',
        ability: 'BLOOD POOL fills from damage taken. At full, spend HP for Minor (reroll), Major (20 damage + Bleed), or Grand Tribute (40 damage + Bleed + mana + rerolls).',
        signature: 'Bite: 8 damage and heal 3 HP.'
    },
    annihilator: {
        headline: 'ANNIHILATOR',
        pillars: 'Glass cannon. Heat or pay HP for rerolls.',
        ability: 'OVERHEAT CORE builds heat per die used. Vent yellow for x1.4 next attack. Vent red for 20 AoE and 5 self damage.',
        signature: 'Blast: 12 damage that ignores shield.'
    },
    sentinel: {
        headline: 'SENTINEL',
        pillars: 'Wall, absorb, retaliate.',
        ability: 'AEGIS PLATES bank 1 plate per 6 shield gained, across turns. At 3 plates the next enemy attack is fully nullified.',
        signature: 'Bash: 10 shield and 4 damage.'
    },
    summoner: {
        headline: 'SUMMONER',
        pillars: 'Swarm scaling. Free Spirits while minions live.',
        ability: 'SACRED GROVE plots tick Seed, Sprout, Bloom while a minion lives. Tap a Bloomed plot for a free Spirit, or APEX x2 every minion when the grove is full and 4 minions are out.',
        signature: 'Call: summon a Spirit and 4 damage.'
    }
};

function readSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY_SEEN) || '[]')); }
    catch (e) { return new Set(); }
}
function writeSeen(set) {
    try { localStorage.setItem(KEY_SEEN, JSON.stringify(Array.from(set))); } catch (e) {}
}

export const ClassBriefing = {
    hasSeen(classId) {
        return readSeen().has(classId);
    },

    markSeen(classId) {
        const s = readSeen();
        s.add(classId);
        writeSeen(s);
    },

    reset(classId) {
        const s = readSeen();
        if (classId == null) { writeSeen(new Set()); return; }
        s.delete(classId);
        writeSeen(s);
    },

    // Show the briefing for the given class. Returns a Promise that resolves
    // when the player dismisses. Safe to call on every combat start — it's a
    // no-op if the player has already seen this class's briefing.
    show(classId) {
        return new Promise((resolve) => {
            if (!classId || !COPY[classId]) return resolve();
            if (this.hasSeen(classId)) return resolve();

            const copy = COPY[classId];
            const root = document.createElement('div');
            root.className = 'class-briefing-overlay';
            root.innerHTML = `
                <div class="cb-card">
                    <div class="cb-header">// CLASS BRIEFING</div>
                    <h2 class="cb-title">${copy.headline}</h2>
                    <div class="cb-pillars">${copy.pillars}</div>
                    <div class="cb-section">
                        <div class="cb-section-label">Ability</div>
                        <div class="cb-section-body">${copy.ability}</div>
                    </div>
                    <div class="cb-section">
                        <div class="cb-section-label">Signature Die</div>
                        <div class="cb-section-body">${copy.signature}</div>
                    </div>
                    <button class="btn primary cb-dismiss" id="cb-dismiss">FIGHT</button>
                </div>
            `;
            document.body.appendChild(root);
            requestAnimationFrame(() => root.classList.add('active'));

            const close = () => {
                this.markSeen(classId);
                Analytics.emit('tooltip_shown', { id: 'class_briefing_' + classId });
                root.classList.remove('active');
                setTimeout(() => { root.remove(); resolve(); }, 280);
            };
            root.querySelector('#cb-dismiss').addEventListener('click', close);
            // Dismiss on backdrop click too so players can't get stuck.
            root.addEventListener('click', (e) => { if (e.target === root) close(); });
        });
    }
};
