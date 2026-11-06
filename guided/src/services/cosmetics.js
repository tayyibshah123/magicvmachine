// Earned menu cosmetics (Roadmap Part 4.6).
//
// Owns a small catalog of cosmetic items (title frames, title tints,
// banner glyphs) and tracks which the player has unlocked + which is
// currently equipped. Cosmetics are PURE VISUAL — no gameplay effect.
//
// Streak milestones unlock the optional frame and title tint. Glitch
// Overlay and Drift Echo are now standard menu effects, with no purchase.
//
// Equipped cosmetic surfaces as a `cosmetic-<id>` body class so CSS
// can layer the visual treatment without touching DOM. Frames from
// the Ascension band (asc-frame-bronze / silver / gold / obsidian)
// stack BEHIND a cosmetic frame — different layer, different earn.

const KEY_OWNED    = 'mvm_cosmetics_owned';
const KEY_EQUIPPED = 'mvm_cosmetic_equipped';

// Catalog. `cost` in Sparks (0 = grant-only via streak / achievement).
// `bodyClass` is the CSS hook applied to <body> when equipped. `kind`
// is purely organisational so the UI can group rows.
const COSMETICS = [
    { id: 'default',     name: 'STANDARD ISSUE',  desc: 'No frame applied.',                                    cost: 0,  kind: 'frame', bodyClass: null },
    { id: 'frame_d30',   name: 'CIRCUIT FRAME',   desc: 'Earned at a 30-day login streak. Soft cyan brackets.', cost: 0,  kind: 'frame', bodyClass: 'cosmetic-frame-circuit', requires: 'streak30' },
    { id: 'skin_d100',   name: 'CENTURION TITLE', desc: 'Earned at a 100-day login streak. Gold-overprint.',    cost: 0,  kind: 'tint',  bodyClass: 'cosmetic-title-centurion', requires: 'streak100' }
];

const LEGACY_MENU_CLASSES = ['cosmetic-title-glitch', 'cosmetic-title-drift'];

const _read = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : raw; }
    catch (_) { return fallback; }
};
const _write = (key, val) => { try { localStorage.setItem(key, val); } catch (_) {} };
const _readOwned = () => {
    try {
        const saved = JSON.parse(_read(KEY_OWNED, '["default"]'));
        const known = Array.isArray(saved) ? saved.filter(id => COSMETICS.some(c => c.id === id)) : [];
        return [...new Set(['default', ...known])];
    }
    catch (_) { return ['default']; }
};
const _writeOwned = (arr) => _write(KEY_OWNED, JSON.stringify(arr));

export const Cosmetics = {
    all() {
        return COSMETICS.slice();
    },
    catalog(kind) {
        return kind ? COSMETICS.filter(c => c.kind === kind) : COSMETICS.slice();
    },
    isOwned(id) {
        return _readOwned().includes(id);
    },
    owned() {
        return _readOwned().slice();
    },
    equipped() {
        const id = _read(KEY_EQUIPPED, 'default');
        return COSMETICS.some(c => c.id === id) ? id : 'default';
    },
    grant(id) {
        if (!COSMETICS.find(c => c.id === id)) return false;
        const owned = _readOwned();
        if (owned.includes(id)) return false;
        owned.push(id);
        _writeOwned(owned);
        return true;
    },
    // Compatibility for old callers. Menu cosmetics never spend Sparks.
    purchase(id) {
        const item = COSMETICS.find(c => c.id === id);
        if (!item) return false;
        if (this.isOwned(id)) return true;
        if (item.requires) {
            // Streak / achievement gated — only grantable via the dedicated
            // path (Streak.tick / Achievements.unlock). Refuse direct
            // purchase to keep the lock meaningful.
            return false;
        }
        this.grant(id);
        return true;
    },
    equip(id) {
        if (!this.isOwned(id)) return false;
        _write(KEY_EQUIPPED, id);
        this.applyToBody();
        return true;
    },
    applyToBody() {
        if (typeof document === 'undefined' || !document.body) return;
        const cl = document.body.classList;
        // Remove every known cosmetic body class first so equipping
        // overwrites cleanly.
        COSMETICS.forEach(c => { if (c.bodyClass) cl.remove(c.bodyClass); });
        LEGACY_MENU_CLASSES.forEach(name => cl.remove(name));
        const equipped = this.equipped();
        const item = COSMETICS.find(c => c.id === equipped);
        if (item && item.bodyClass) cl.add(item.bodyClass);
    },

    // Streak hook — call this whenever Streak.tick reports a milestone
    // that has a cosmetic id attached. Idempotent grant.
    grantFromStreak(streakDays) {
        if (streakDays >= 100) this.grant('skin_d100');
        if (streakDays >= 30)  this.grant('frame_d30');
    }
};
