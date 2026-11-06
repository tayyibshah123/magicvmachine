// Contextual hint system (first-time-see-X tooltips).
// Each hint is shown at most once per install. Call `Hints.trigger(id)` from
// the relevant game code; if the hint hasn't been seen yet it's enqueued and
// a lightweight overlay surfaces on screen. The user dismisses with GOT IT.
//
// Content is data-driven so designers can add/tweak hints without touching
// game code.

import { Analytics } from './analytics.js';

const STORAGE_KEY = 'mvm_hints_seen';
const PENDING_KEY = 'mvm_hints_pending_v1';

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
    first_reward:     { title: "REWARD",      body: "Pick one module for this run. Check its effect and synergies." },
    first_event:      { title: "EVENT",       body: "Read each choice and its cost before committing." },
    first_rest:       { title: "REST",        body: "Choose healing, rerolls, a skill upgrade or a run module." },
    first_boss:       { title: "BOSS AHEAD",  body: "Check their intents. Prepare shields." },
    first_death:      { title: "DEFEAT",      body: "Fragments reset. Sparks and permanent upgrades stay banked." },
    first_ascension:  { title: "ASCENSION",   body: "Harder runs. Better rewards." },
    first_qte:        { title: "CRITICAL",    body: "Tap anywhere as the ring reaches the inner timing band." },
    first_synergy:    { title: "SYNERGY",     body: "Combining modules unlocks bonuses." },
    combo_double:     { title: "COMBO",       body: "Two of a kind grants a bonus." },
    first_heal:       { title: "HEAL",        body: "Restores HP up to your maximum." },
    first_shield_break:{ title: "SHIELD DOWN",body: "Barrier collapsed. Raw damage next." },
    first_crit:       { title: "CRITICAL",    body: "Perfect attack timing adds 60% damage." },
    // Sector signature rules — fires once per install on first entry to each
    // affected sector so the player isn't surprised by a silent mechanic.
    sector_rule_2:    { title: "FROST FIELD",      body: "Cryo hostiles carry +6 Shield." },
    sector_rule_3:    { title: "HEAT TILES",       body: "Molten ground burns you and every minion 1 HP each turn end." },
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
    first_arcanist_glyph:  { title: "GLYPH CYCLE",    body: "Tap the widget when your chosen glyph is lit." },

    // Jargon stubs — first time each mechanic hits the player so the
    // vocabulary is taught at point of use, not via wiki or death.
    // (first_boss + combo_double already exist above — don't duplicate.)
    first_nullified_die:   { title: "NULLIFIED",      body: "The boss analysed your first die. It's gone." },
    first_mana_spent:      { title: "MANA",           body: "Paid skills spend mana. You gain more each turn." },
    first_shield_decay:    { title: "SHIELD DECAYS",  body: "Shield fades each turn. Renew with Defend." },

    // Endgame-mode discoverability (audit feedback F2/F3).
    first_pact_available:  { title: "PACTS AVAILABLE", body: "Sign for power. Stays for the run." },
    first_archive_unlock:  { title: "ARCHIVE UNLOCKED",body: "Sector X. Solo prestige fight." },

    // Sparks meta-currency. first_sparks fires the first time a Spark is
    // ever granted (typically on first boss kill). first_sanctuary_spend
    // fires when the player lands on the Sanctuary screen with Sparks
    // banked but no upgrades purchased yet.
    first_sparks:           { title: "✦ SPARKS",         body: "Permanent currency. Spend in Sanctuary." },
    first_sanctuary_spend:  { title: "SANCTUARY",        body: "Tap a node to install. Costs Sparks." },
    // Combat depth onboarding — fires once for each new mechanic.
    first_chain:            { title: "CHAIN HIT",        body: "Each wave matters. Worst tap caps the chain." },
    first_momentum:         { title: "MOMENTUM",         body: "Combos and parries fill it. Apex gives your next attack x1.5." },
    // Module Fusions (Hades-style Duos). Fires on the FIRST reward
    // screen that surfaces a fusion offer — owning both source
    // modules unlocks a prismatic-bordered combined relic. Audit
    // 2026-05 flagged that this system was launching silent.
    first_fusion:           { title: "FUSION OFFERED",   body: "Combine two modules into one stronger relic." },
    // 30Hz / low-refresh device detection (Roadmap Bucket 6). Fires once
    // when a sustained 60-frame sample after combat start averages well
    // below 60fps, suggesting a 30Hz panel or browser throttle. Players
    // should know visuals are running at half-rate so they don't read
    // motion stutter as a game bug.
    low_refresh:            { title: "LOW REFRESH",       body: "30Hz display detected. Visuals run at half-rate." }
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
        try {
            const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
            this._queue = [...new Set(Array.isArray(pending) ? pending : [])]
                .filter(id => HINTS[id] && !this._seen.has(id));
        } catch (_) { this._queue = []; }
        if (!this._visibilityHandler) {
            this._visibilityHandler = () => this.resume();
            document.addEventListener('visibilitychange', this._visibilityHandler);
        }
    },

    _persistPending() {
        const pending = [...new Set([this._activeId, ...this._queue].filter(Boolean))];
        try { localStorage.setItem(PENDING_KEY, JSON.stringify(pending)); } catch (_) {}
    },

    _canShow() {
        const game = typeof window !== 'undefined' && window.Game;
        return !document.hidden && !(game && game.tutorialHintsEnabled === false)
            && !document.body.classList.contains('breakout-active')
            && !document.getElementById('intro-overlay')
            && !document.getElementById('onboarding-overlay');
    },

    resume() {
        if (this._active && !this._closing && !this._canShow()) this._dismiss(false);
        else if (!this._active && this._canShow()) this._showNext();
    },

    suspend() {
        clearTimeout(this._dismissTimer);
        clearTimeout(this._fadeTimer);
        this._dismissTimer = null;
        this._fadeTimer = null;
        if (this._activeId && !this._queue.includes(this._activeId)) this._queue.unshift(this._activeId);
        this._activeId = null;
        this._active = false;
        this._closing = false;
        this._root?.classList.remove('open');
        this._root?.classList.add('hidden');
        this._persistPending();
    },

    // Call this from game code when a condition is first met.
    trigger(id) {
        if (!this._seen) this.init();
        if (this._seen.has(id)) return;
        if (!HINTS[id]) return;
        // Suppressed teaching stays eligible for the next relevant action;
        // do not drain a backlog of obsolete combat tips onto the first map.
        if (!this._canShow()) return;
        if (this._activeId !== id && !this._queue.includes(id)) this._queue.push(id);
        this._persistPending();
        this.resume();
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
        if (!this._canShow()) return;
        if (this._queue.length === 0) { this._active = false; return; }
        this._active = true;
        const id = this._queue.shift();
        this._activeId = id;
        this._persistPending();
        const hint = HINTS[id];
        Analytics.emit('tooltip_shown', { id });
        this._render(hint);
    },

    _render(hint) {
        // Lazy-create the overlay root. Compact toast-style: title +
        // single-line body in a small chip, top-anchored, auto-dismissing
        // after a few seconds. Tap to dismiss early. The previous design
        // was a centred full-width modal with a GOT IT button which
        // commandeered half the screen the moment a player ran into a
        // new mechanic mid-combat — too disruptive.
        if (!this._root) {
            this._root = document.createElement('div');
            this._root.className = 'hint-toast hidden';
            this._root.innerHTML = `
                <div class="hint-toast-icon">!</div>
                <div class="hint-toast-text">
                    <div class="hint-toast-title"></div>
                    <div class="hint-toast-body"></div>
                </div>
            `;
            // Anchor to the game container so the toast stays inside
            // the mobile-shaped canvas frame.
            const parent = document.getElementById('game-container') || document.body;
            parent.appendChild(this._root);
            this._root.addEventListener('click', () => this._dismiss(true));
        }
        this._root.querySelector('.hint-toast-title').textContent = hint.title;
        this._root.querySelector('.hint-toast-body').textContent = hint.body;
        this._root.classList.remove('hidden');
        requestAnimationFrame(() => this._root.classList.add('open'));
        // Auto-dismiss after a generous reading window. Body copy is
        // ~8 words so 4 seconds is comfortable.
        if (this._dismissTimer) clearTimeout(this._dismissTimer);
        this._dismissTimer = setTimeout(() => this._dismiss(this._canShow()), 4000);
    },

    _dismiss(acknowledged = true) {
        if (!this._root || this._closing) return;
        this._closing = true;
        if (this._dismissTimer) {
            clearTimeout(this._dismissTimer);
            this._dismissTimer = null;
        }
        const id = this._activeId;
        if (id && acknowledged) {
            this._seen.add(id);
            writeSeen(this._seen);
        } else if (id && !this._queue.includes(id)) this._queue.unshift(id);
        this._activeId = null;
        this._persistPending();
        this._root.classList.remove('open');
        this._fadeTimer = setTimeout(() => {
            this._root.classList.add('hidden');
            this._closing = false;
            this._active = false;
            this.resume();
        }, 180);
    }
};
