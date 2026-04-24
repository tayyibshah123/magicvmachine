// Contextual hint system (first-time-see-X tooltips).
// Each hint is shown at most once per install. Call `Hints.trigger(id)` from
// the relevant game code; if the hint hasn't been seen yet it's enqueued and
// a lightweight overlay surfaces on screen. The user dismisses with GOT IT.
//
// Content is data-driven so designers can add/tweak hints without touching
// game code.

import { Analytics } from './analytics.js';

const STORAGE_KEY = 'mvm_hints_seen';

// Hint library. Keep copy under 8 words per the roadmap.
const HINTS = {
    first_reroll:     { title: "REROLL",      body: "Swap unlucky dice. Costs one charge." },
    first_shield:     { title: "SHIELD",      body: "Absorbs damage before HP. Fades each turn." },
    first_minion:     { title: "MINIONS",     body: "Tank hits and deal damage with you." },
    first_elite:      { title: "ELITE",       body: "Stronger enemies with unique affixes." },
    elite_shielded:   { title: "SHIELDED",    body: "Regenerates a barrier every turn." },
    elite_second:     { title: "SECOND WIND", body: "Revives once at 50% HP." },
    elite_jammer:     { title: "JAMMER",      body: "Steals one of your dice each turn." },
    first_relic:      { title: "MODULE",      body: "Passive upgrade. Stacks with others." },
    first_shop:       { title: "SHOP",        body: "Trade Fragments for modules and heals." },
    first_rest:       { title: "REST",        body: "Heal, upgrade skill, or earn rerolls." },
    first_boss:       { title: "BOSS AHEAD",  body: "Check their intents. Prepare shields." },
    first_death:      { title: "DEFEAT",      body: "Fragments carry over. Try a new class." },
    first_ascension:  { title: "ASCENSION",   body: "Harder runs. Better rewards." },
    first_qte:        { title: "CRITICAL",    body: "Tap the gold ring for bonus damage." },
    first_synergy:    { title: "SYNERGY",     body: "Combining modules unlocks bonuses." },
    combo_double:     { title: "COMBO",       body: "Two of a kind grants a bonus." },
    first_heal:       { title: "HEAL",        body: "Restores HP up to your maximum." },
    first_shield_break:{ title: "SHIELD DOWN",body: "Barrier collapsed. Raw damage next." },
    first_crit:       { title: "CRITICAL",    body: "Perfect timing doubles damage." },
    // Sector signature rules — fires once per install on first entry to each
    // affected sector so the player isn't surprised by a silent mechanic.
    sector_rule_2:    { title: "FROST FIELD",      body: "Cryo hostiles carry +6 Shield." },
    sector_rule_3:    { title: "HEAT TILES",       body: "Molten ground burns you 1 HP each turn end." },
    sector_rule_4:    { title: "HIVE RESONANCE",   body: "Enemy minions hit 20% harder." },
    sector_rule_5:    { title: "REALITY GLITCH",   body: "Every attack rolls ±15% damage." },

    // Class-ability tutorial stubs — fire the first time each class's widget
    // becomes actionable so players learn the beat without reading a wiki.
    first_tactic_ready:    { title: "TACTIC READY",   body: "Tap the widget. Pick a bonus." },
    first_overheat_yellow: { title: "YELLOW ZONE",    body: "Tap to vent for ×1.4 damage." },
    first_overheat_red:    { title: "RED ZONE",       body: "Tap to blast 20 DMG + 5 self." },
    first_blood_pool:      { title: "BLOOD POOL",     body: "Tribute blood for a bonus." },
    first_shield_wall:     { title: "SHIELD WALL",    body: "Next enemy attack is nullified." },
    first_grove_bloom:     { title: "GROVE BLOOM",    body: "Tap a bloomed plot for a spirit." },
    first_arcanist_glyph:  { title: "GLYPH CYCLE",    body: "Play a die on the active glyph." },

    // Jargon stubs — first time each mechanic hits the player so the
    // vocabulary is taught at point of use, not via wiki or death.
    // (first_boss + combo_double already exist above — don't duplicate.)
    first_nullified_die:   { title: "NULLIFIED",      body: "The boss analysed your first die. It's gone." },
    first_mana_spent:      { title: "MANA",           body: "Spend it on powerful dice. Refills each turn." },
    first_shield_decay:    { title: "SHIELD DECAYS",  body: "Shield fades each turn. Renew with Defend." }
};

function readSeen() {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
    catch (e) { return new Set(); }
}
function writeSeen(set) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
}

export const Hints = {
    _seen: null,
    _queue: [],
    _active: false,
    _root: null,

    init() {
        this._seen = readSeen();
    },

    // Call this from game code when a condition is first met.
    trigger(id) {
        if (!this._seen) this.init();
        if (this._seen.has(id)) return;
        if (!HINTS[id]) return;
        // Mark seen immediately so re-triggers don't queue duplicates.
        this._seen.add(id);
        writeSeen(this._seen);
        this._queue.push(id);
        Analytics.emit('tooltip_shown', { id });
        if (!this._active) this._showNext();
    },

    // Clear a seen flag (useful for re-tutorial setting).
    reset(id) {
        if (!this._seen) this.init();
        if (id == null) {
            this._seen = new Set();
            writeSeen(this._seen);
        } else {
            this._seen.delete(id);
            writeSeen(this._seen);
        }
    },

    _showNext() {
        if (this._queue.length === 0) { this._active = false; return; }
        this._active = true;
        const id = this._queue.shift();
        const hint = HINTS[id];
        this._render(hint);
    },

    _render(hint) {
        // Lazy-create the overlay root
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.className = 'hint-overlay hidden';
            this._root.innerHTML = `
                <div class="hint-card">
                    <div class="hint-title"></div>
                    <div class="hint-body"></div>
                    <button class="btn primary hint-dismiss">GOT IT</button>
                </div>
            `;
            // Anchor to the game container so the hint card stays inside
            // the 432px mobile-shaped canvas. document.body made the
            // overlay fill the viewport, leaving the card drifting
            // off-canvas on wide devices.
            const parent = document.getElementById('game-container') || document.body;
            parent.appendChild(this._root);
            this._root.addEventListener('click', (e) => {
                if (e.target === this._root || e.target.classList.contains('hint-dismiss')) {
                    this._dismiss();
                }
            });
        }
        this._root.querySelector('.hint-title').textContent = hint.title;
        this._root.querySelector('.hint-body').textContent = hint.body;
        this._root.classList.remove('hidden');
        requestAnimationFrame(() => this._root.classList.add('open'));
    },

    _dismiss() {
        if (!this._root) return;
        this._root.classList.remove('open');
        setTimeout(() => {
            this._root.classList.add('hidden');
            this._showNext();
        }, 180);
    }
};
