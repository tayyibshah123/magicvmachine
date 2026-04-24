// Canvas-palette adaptor for colorblind modes.
//
// The CSS already swaps `--neon-pink`, `--neon-green`, `--neon-blue` under
// `body.cb-{deuteranopia|protanopia|tritanopia}`, which covers DOM UI. Canvas
// particles (ParticleSys, class bursts, boss VFX) use hardcoded hex strings
// from COLORS or inline literals, so they were bypassing the accessibility
// swap — which left the very pairs the CB modes were trying to disambiguate
// (pink vs. red, green vs. red) fighting each other in combat VFX.
//
// This module applies a runtime color remap. Callers don't need to branch on
// the mode — ParticleSys wraps color assignments through `Palette.adapt()`.
// Unknown / off-palette hex values pass through unchanged.
//
// Keyed on lowercased hex ONLY (e.g. '#ff3355'). Three-digit shorthand
// (`#f3f`) and rgb() strings are passed through unchanged — mostly because
// the game's particle call sites consistently use 6-hex. Extend later if
// needed.

const MAPS = {
    // Red/green confusion — remap pinks/reds toward orange, greens toward blue.
    deuteranopia: {
        '#ff0055': '#ff8800',
        '#ff3355': '#ff9a22',
        '#ff0066': '#ff8800',
        '#ff00aa': '#ff8800',
        '#ff6677': '#ffb266',
        '#ff2244': '#ff8a22',
        '#ff2266': '#ff8a22',
        '#ff1100': '#ff7722',
        '#ff3333': '#ff8844',
        '#ff6b6b': '#ffb366',
        '#00ff99': '#00bfff',
        '#7fff00': '#33bfff',
        '#6aff6a': '#66bfff',
        '#ff6600': '#ffaa22',
    },
    // Red weakness — similar to deuter, push pinks toward yellow-orange and
    // greens toward cyan so they don't collapse together.
    protanopia: {
        '#ff0055': '#ffaa00',
        '#ff3355': '#ffbb22',
        '#ff00aa': '#ffaa00',
        '#ff6677': '#ffcc66',
        '#ff2244': '#ffab22',
        '#ff2266': '#ffab22',
        '#ff1100': '#ff9900',
        '#ff3333': '#ffa844',
        '#ff6b6b': '#ffc866',
        '#00ff99': '#00e5ff',
        '#6aff6a': '#66e5ff',
        '#7fff00': '#33c5ff',
    },
    // Blue/yellow confusion — shift cyans toward pink and greens toward
    // yellow so they don't bleed into each other.
    tritanopia: {
        '#ff00ff': '#ff2244',
        '#bc13fe': '#ff2266',
        '#d97bff': '#ff7799',
        '#00f3ff': '#ff77aa',
        '#88eaff': '#ffaacc',
        '#00ff99': '#d2ff33',
        '#6aff6a': '#d2ff66',
        '#7fff00': '#b2ff33',
    },
};

export const Palette = {
    mode: 'none',

    setMode(mode) {
        this.mode = (mode && MAPS[mode]) ? mode : 'none';
    },

    // Initialise from the already-applied body class. Safe to call before
    // setMode — picks up whatever the settings loader painted on <body>.
    syncFromBody() {
        if (typeof document === 'undefined' || !document.body) return;
        const cl = document.body.classList;
        if (cl.contains('cb-deuteranopia')) this.mode = 'deuteranopia';
        else if (cl.contains('cb-protanopia')) this.mode = 'protanopia';
        else if (cl.contains('cb-tritanopia')) this.mode = 'tritanopia';
        else this.mode = 'none';
    },

    // Transform a single color. Non-strings and unmapped hex values pass
    // through; only documented game palette colors get swapped.
    adapt(color) {
        if (this.mode === 'none' || !color) return color;
        if (typeof color !== 'string') return color;
        const map = MAPS[this.mode];
        if (!map) return color;
        return map[color.toLowerCase()] || color;
    },
};
