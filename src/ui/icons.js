// Unified SVG icon library — every emoji in the game is replaced with one of these
// so visuals are identical across Windows, macOS, iOS, Android, and Linux. Each icon
// uses currentColor so callers control tint via CSS, and `class="game-icon"` so the
// shared CSS applies sizing (1em × 1em) and contextual glow.
//
// All icons use a 24×24 viewBox. Use `ICONS.<name>` to get an HTML SVG string ready
// to drop into innerHTML, button text, or data fields like PLAYER_CLASSES[i].icon.

const _wrap = (paths, opts = {}) => {
    const stroke = opts.stroke || 'currentColor';
    const fill = opts.fill || 'none';
    const sw = opts.sw != null ? opts.sw : 2;
    return `<svg viewBox="0 0 24 24" class="game-icon" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
};

export const ICONS = {

    // -------- COMBAT / DAMAGE DICE --------
    attack: _wrap(`<path d="M4 4 L11 11 M20 4 L13 11" stroke-width="2.4"/><path d="M11 13 L4 20 M13 13 L20 20" stroke-width="2.4"/><path d="M2 2 L6 2 L6 6 M18 2 L22 2 L22 6 M2 22 L2 18 L6 18 M22 22 L22 18 L18 18" stroke-width="1.2"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`, { sw: 1.8 }),
    meteor: _wrap(`<circle cx="17" cy="7" r="3" fill="currentColor" fill-opacity="0.4"/><path d="M14 10 L4 20"/><path d="M16 13 L7 22"/><path d="M11 8 L3 16"/>`),
    earthquake: _wrap(`<path d="M3 10 L7 14 L11 10 L15 14 L19 10 L21 12"/><path d="M5 17 L9 17 L11 20 L13 17 L15 20 L17 17 L19 17"/>`),
    constrict: _wrap(`<circle cx="8" cy="8" r="3.5"/><circle cx="16" cy="16" r="3.5"/><path d="M10.5 10.5 L13.5 13.5"/>`, { sw: 1.8 }),
    voodoo: _wrap(`<path d="M7 4 L17 4 L19 11 L17 14 L17 17 L14 17 L14 20 L10 20 L10 17 L7 17 L7 14 L5 11 Z" fill="currentColor" fill-opacity="0.18"/><circle cx="10" cy="11" r="1.4" fill="currentColor"/><circle cx="14" cy="11" r="1.4" fill="currentColor"/><path d="M11 15 L13 15"/>`),
    overcharge: _wrap(`<path d="M13 2 L5 14 L11 14 L9 22 L19 9 L13 9 Z" fill="currentColor" fill-opacity="0.3"/>`),
    recklessCharge: _wrap(`<path d="M5 11 Q5 5 12 5 Q19 5 19 11 L19 14 Q19 19 14 19 L10 19 Q5 19 5 14 Z" fill="currentColor" fill-opacity="0.18"/><path d="M3 9 L5 11 M21 9 L19 11"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/><circle cx="15" cy="11" r="1.2" fill="currentColor"/><path d="M9 15 L15 15"/>`),
    minion: _wrap(`<path d="M12 22 L12 14"/><path d="M12 14 Q6 14 6 8 Q12 8 12 14"/><path d="M12 14 Q18 14 18 8 Q12 8 12 14" fill="currentColor" fill-opacity="0.25"/><circle cx="12" cy="6" r="2" fill="currentColor"/>`),

    // -------- DEFENSE / SUPPORT DICE --------
    defend: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.18"/><path d="M9 12 L11 14 L15 9" stroke-width="2.2"/>`),
    mana: _wrap(`<path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" fill-opacity="0.3"/><path d="M12 7 L17 12 L12 17 L7 12 Z" stroke-width="1.4"/>`),

    // -------- CLASS ICONS --------
    classTactician: _wrap(`<path d="M12 3 Q9 3 9 6 Q9 8 11 9 L9 14 L7 14 L7 17 L17 17 L17 14 L15 14 L13 9 Q15 8 15 6 Q15 3 12 3 Z" fill="currentColor" fill-opacity="0.22"/><path d="M5 21 L19 21" stroke-width="2.4"/><circle cx="12" cy="6" r="0.9" fill="currentColor"/>`),
    classArcanist: _wrap(`<circle cx="12" cy="11" r="6" fill="currentColor" fill-opacity="0.22"/><path d="M6 17 L18 17 L17 20 L7 20 Z" fill="currentColor" fill-opacity="0.4"/><circle cx="10" cy="9" r="1.2" fill="currentColor"/><path d="M14 6 L15 7 M16 9 L17 8" stroke-width="1.4"/>`),
    classBloodstalker: _wrap(`<path d="M12 8 Q4 8 3 14 Q5 13 6 14 Q5 16 7 17 Q9 14 12 16 Q15 14 17 17 Q19 16 18 14 Q19 13 21 14 Q20 8 12 8 Z" fill="currentColor" fill-opacity="0.3"/><circle cx="10" cy="11" r="0.9" fill="currentColor"/><circle cx="14" cy="11" r="0.9" fill="currentColor"/><path d="M11 13 L12 15 L13 13" stroke-width="1.4"/>`),
    classAnnihilator: _wrap(`<path d="M12 2 L14 8 L20 6 L17 12 L22 14 L16 15 L17 21 L12 17 L7 21 L8 15 L2 14 L7 12 L4 6 L10 8 Z" fill="currentColor" fill-opacity="0.22"/><circle cx="12" cy="13" r="2" fill="currentColor"/>`),
    classSentinel: _wrap(`<path d="M12 2 L20 5 L20 12 Q20 18 12 22 Q4 18 4 12 L4 5 Z" fill="currentColor" fill-opacity="0.18"/><path d="M12 7 L12 17 M8 12 L16 12" stroke-width="2.2"/>`),
    classSummoner: _wrap(`<path d="M12 22 L12 12"/><path d="M12 12 Q6 12 5 6 Q11 6 12 12 Z" fill="currentColor" fill-opacity="0.3"/><path d="M12 12 Q18 12 19 6 Q13 6 12 12 Z" fill="currentColor" fill-opacity="0.3"/><path d="M12 12 Q9 9 9 5" stroke-width="1.4"/><path d="M12 12 Q15 9 15 5" stroke-width="1.4"/>`),

    // -------- CLASS-BAR FLOURISHES (rich per-class glyph-bar decorations) --------
    // Tactician — HUD targeting reticle rendered behind the command pips.
    tacticianReticle: _wrap(`
        <circle cx="12" cy="12" r="10" stroke-dasharray="3 2" opacity="0.65"/>
        <circle cx="12" cy="12" r="6" opacity="0.4"/>
        <path d="M2 12 L6 12 M18 12 L22 12 M12 2 L12 6 M12 18 L12 22" stroke-width="1.2"/>
        <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
    `),
    // Arcanist — runic seal for the center of the orbital glyph wheel.
    arcanistSeal: _wrap(`
        <circle cx="12" cy="12" r="9" stroke-dasharray="1 2"/>
        <polygon points="12,3 20.7,8 20.7,16 12,21 3.3,16 3.3,8" fill="currentColor" fill-opacity="0.12"/>
        <path d="M12 7 L16 14 L8 14 Z" fill="currentColor" fill-opacity="0.35"/>
        <circle cx="12" cy="12" r="1.6" fill="#ffffff"/>
    `),
    // Bloodstalker — anatomical heart-vial silhouette with 3 chambers.
    bloodstalkerHeart: _wrap(`
        <path d="M12 22 C 6 17 3 13 3 9 C 3 5 6 3 9 3 C 10.5 3 12 4 12 5.5 C 12 4 13.5 3 15 3 C 18 3 21 5 21 9 C 21 13 18 17 12 22 Z" fill="currentColor" fill-opacity="0.22"/>
        <path d="M12 22 C 6 17 3 13 3 9 C 3 5 6 3 9 3 C 10.5 3 12 4 12 5.5 C 12 4 13.5 3 15 3 C 18 3 21 5 21 9 C 21 13 18 17 12 22 Z"/>
        <path d="M7 9 L12 11 L17 9" stroke-width="1.2" opacity="0.55"/>
        <path d="M9 13 L15 13" stroke-width="1.2" opacity="0.55"/>
        <circle cx="12" cy="11" r="0.8" fill="currentColor"/>
    `),
    // Annihilator — reactor core silhouette, drawn behind the heat bar.
    annihilatorReactor: _wrap(`
        <path d="M4 7 L8 4 L16 4 L20 7 L20 17 L16 20 L8 20 L4 17 Z" fill="currentColor" fill-opacity="0.1"/>
        <circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.4"/>
        <circle cx="12" cy="12" r="1.3" fill="#ffffff"/>
        <path d="M12 8 L12 4 M12 20 L12 16 M8 12 L4 12 M20 12 L16 12" stroke-width="1.2" opacity="0.7"/>
    `),
    // Sentinel — crested aegis sigil; lights when all 3 plates ready.
    sentinelSigil: _wrap(`
        <path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.18"/>
        <path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z"/>
        <path d="M8 11 L12 7 L16 11 L12 17 Z" fill="currentColor" fill-opacity="0.5"/>
        <path d="M12 7 L12 17 M8 11 L16 11" stroke-width="1.1" opacity="0.55"/>
        <circle cx="12" cy="11" r="1.2" fill="#ffffff"/>
    `),
    // Summoner — ancient tree silhouette growing with the grove.
    summonerTree: _wrap(`
        <path d="M11 22 L11 14 M13 22 L13 14" stroke-width="1.6"/>
        <path d="M12 14 L8 10 L6 11" stroke-width="1.2" opacity="0.75"/>
        <path d="M12 14 L16 10 L18 11" stroke-width="1.2" opacity="0.75"/>
        <path d="M12 13 L12 8" stroke-width="1.4"/>
        <path d="M12 8 Q8 7 6 4 Q10 4 12 8 Z" fill="currentColor" fill-opacity="0.45"/>
        <path d="M12 8 Q16 7 18 4 Q14 4 12 8 Z" fill="currentColor" fill-opacity="0.45"/>
        <path d="M12 8 Q11 5 12 2 Q13 5 12 8 Z" fill="currentColor" fill-opacity="0.55"/>
        <circle cx="12" cy="5" r="0.8" fill="#ffee88"/>
    `),

    // -------- SUMMONER GROVE PLOTS --------
    // Seed stage — dark soil mound with a tiny seed core.
    grovePlotSeed: _wrap(`
        <path d="M4 18 Q12 14 20 18 L20 21 L4 21 Z" fill="currentColor" fill-opacity="0.25"/>
        <ellipse cx="12" cy="18" rx="1.6" ry="2.2" fill="currentColor" fill-opacity="0.7"/>
        <path d="M12 16 L12 14" stroke-width="1" opacity="0.5"/>
    `),
    // Sprout stage — curved green stem with a pair of small leaves.
    grovePlotSprout: _wrap(`
        <path d="M4 20 Q12 18 20 20 L20 22 L4 22 Z" fill="currentColor" fill-opacity="0.2"/>
        <path d="M12 20 Q12 15 11 11 Q10 7 13 5" stroke-width="1.8" fill="none"/>
        <path d="M12 14 Q8 13 7 10 Q9 10 11 13 Z" fill="currentColor" fill-opacity="0.55"/>
        <path d="M12 11 Q16 10 17 7 Q15 7 13 10 Z" fill="currentColor" fill-opacity="0.55"/>
    `),
    // Bloom stage — full flower with 6 petals + bright core + aura ring.
    grovePlotBloom: _wrap(`
        <circle cx="12" cy="12" r="10" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.5"/>
        <path d="M12 4 Q13.5 8 12 11 Q10.5 8 12 4 Z" fill="currentColor" fill-opacity="0.65"/>
        <path d="M20 12 Q16 13.5 13 12 Q16 10.5 20 12 Z" fill="currentColor" fill-opacity="0.65"/>
        <path d="M12 20 Q10.5 16 12 13 Q13.5 16 12 20 Z" fill="currentColor" fill-opacity="0.65"/>
        <path d="M4 12 Q8 10.5 11 12 Q8 13.5 4 12 Z" fill="currentColor" fill-opacity="0.65"/>
        <path d="M6 6 Q10 8 11 10.5 Q8.5 9.5 6 6 Z" fill="currentColor" fill-opacity="0.55"/>
        <path d="M18 6 Q14 8 13 10.5 Q15.5 9.5 18 6 Z" fill="currentColor" fill-opacity="0.55"/>
        <circle cx="12" cy="12" r="2.3" fill="#ffffff"/>
        <circle cx="12" cy="12" r="1.1" fill="#ffee88"/>
    `),

    // -------- ARCANIST GLYPHS --------
    // Fire — triple-tongue flame with an inner ember core + swirling wisps.
    glyphFire: _wrap(`
        <path d="M12 3 Q14 7 12 10 Q9 8 9 13 Q9 18 12 21 Q15 18 15 13 Q14 11 13 9 Q12 5 12 3 Z" fill="currentColor" fill-opacity="0.45"/>
        <path d="M12 9 Q11 12 12 16 Q13 14 13 12 Q12.5 10 12 9 Z" fill="#ffee88" fill-opacity="0.85"/>
        <circle cx="12" cy="14" r="1.3" fill="#ffffff"/>
        <path d="M8 18 Q9 20 10 19" stroke-width="1" opacity="0.7"/>
        <path d="M16 18 Q15 20 14 19" stroke-width="1" opacity="0.7"/>
    `),
    // Ice — hexagonal snowflake with branching crystal arms + inner gem.
    glyphIce: _wrap(`
        <path d="M12 2 L12 22" stroke-width="1.6"/>
        <path d="M3.5 7 L20.5 17" stroke-width="1.6"/>
        <path d="M3.5 17 L20.5 7" stroke-width="1.6"/>
        <path d="M12 2 L10.5 4 M12 2 L13.5 4" stroke-width="1.3"/>
        <path d="M12 22 L10.5 20 M12 22 L13.5 20" stroke-width="1.3"/>
        <path d="M3.5 7 L5.5 7.5 M3.5 7 L5 8.8" stroke-width="1.3"/>
        <path d="M20.5 7 L18.5 7.5 M20.5 7 L19 8.8" stroke-width="1.3"/>
        <path d="M3.5 17 L5 15.2 M3.5 17 L5.5 16.5" stroke-width="1.3"/>
        <path d="M20.5 17 L19 15.2 M20.5 17 L18.5 16.5" stroke-width="1.3"/>
        <path d="M12 8.5 L15 10.5 L15 13.5 L12 15.5 L9 13.5 L9 10.5 Z" fill="currentColor" fill-opacity="0.35"/>
        <circle cx="12" cy="12" r="1.3" fill="#ffffff"/>
    `),
    // Lightning — bolt with trailing sparks + a crackle halo ring.
    glyphLightning: _wrap(`
        <circle cx="12" cy="12" r="10" stroke-dasharray="2 3" opacity="0.35"/>
        <path d="M13 2 L5 13 L11 13 L9 22 L19 10 L13 10 Z" fill="currentColor" fill-opacity="0.55"/>
        <path d="M13 2 L5 13 L11 13 L9 22 L19 10 L13 10 Z" fill="#ffffff" fill-opacity="0.15"/>
        <circle cx="4" cy="7" r="0.9" fill="currentColor" opacity="0.7"/>
        <circle cx="20" cy="16" r="0.9" fill="currentColor" opacity="0.7"/>
        <circle cx="21" cy="5" r="0.7" fill="currentColor" opacity="0.55"/>
        <circle cx="3" cy="18" r="0.7" fill="currentColor" opacity="0.55"/>
    `),

    // -------- STATUS EFFECTS --------
    weak: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.15"/><path d="M12 7 L12 14 M12 17 L12 17.01" stroke-width="2.4"/><path d="M8 16 L16 8" stroke-width="1.5" opacity="0.6"/>`),
    frail: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.15"/><path d="M9 7 L12 11 L8 14 L13 17 L11 21" stroke-width="1.6"/>`),
    vulnerable: _wrap(`<path d="M12 3 L22 20 L2 20 Z" fill="currentColor" fill-opacity="0.15"/><path d="M12 10 L12 15 M12 17 L12 17.01" stroke-width="2.2"/>`),
    overcharged: _wrap(`<circle cx="12" cy="12" r="9" stroke-dasharray="3 2" fill="currentColor" fill-opacity="0.1"/><path d="M13 5 L7 13 L11 13 L9 19 L17 11 L13 11 Z" fill="currentColor" fill-opacity="0.6"/>`),
    constricted: _wrap(`<circle cx="6" cy="6" r="2.5"/><circle cx="12" cy="12" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M7.7 7.7 L10.3 10.3 M13.7 13.7 L16.3 16.3"/>`, { sw: 1.6 }),
    voodooEffect: _wrap(`<path d="M7 5 L17 5 L18 12 L16 14 L16 17 L13 17 L13 19 L11 19 L11 17 L8 17 L8 14 L6 12 Z" fill="currentColor" fill-opacity="0.22"/><circle cx="10" cy="11" r="1.2" fill="currentColor"/><circle cx="14" cy="11" r="1.2" fill="currentColor"/>`),
    regen: _wrap(`<path d="M12 21 L4 13 Q1 10 4 7 Q7 4 12 9 Q17 4 20 7 Q23 10 20 13 Z" fill="currentColor" fill-opacity="0.2"/><path d="M9 11 L15 11 M12 8 L12 14" stroke="#fff" stroke-width="1.6"/>`),
    thorns: _wrap(`<circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity="0.18"/><path d="M12 3 L12 7 M12 17 L12 21 M3 12 L7 12 M17 12 L21 12 M5 5 L8 8 M16 16 L19 19 M19 5 L16 8 M5 19 L8 16"/>`, { sw: 1.6 }),
    dodge: _wrap(`<path d="M5 16 Q5 8 12 8 Q19 8 19 16 L19 20 L17 18 L15 20 L13 18 L11 20 L9 18 L7 20 L5 18 Z" fill="currentColor" fill-opacity="0.22"/><circle cx="10" cy="12" r="0.9" fill="currentColor"/><circle cx="14" cy="12" r="0.9" fill="currentColor"/>`),
    volatileMod: _wrap(`<circle cx="12" cy="14" r="6" fill="currentColor" fill-opacity="0.25"/><path d="M14 8 Q15 5 17 5 Q19 5 19 7" stroke-width="1.6"/><path d="M19 5 L21 3 M17 3 L19 5 M19 7 L21 7" stroke-width="1.4"/>`),
    armor: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.18"/><path d="M8 8 L16 8 M8 12 L16 12 M8 16 L16 16"/>`),
    charged: _wrap(`<circle cx="12" cy="12" r="8" stroke-dasharray="2 2" fill="currentColor" fill-opacity="0.1"/><path d="M13 4 L6 13 L11 13 L9 20 L18 10 L13 10 Z" fill="currentColor" fill-opacity="0.5"/>`),

    // -------- BOSS INTENT ICONS --------
    intentAttack: _wrap(`<path d="M5 19 L15 9"/><path d="M13 5 L19 5 L19 11"/><path d="M15 9 L19 5"/>`),
    intentMultiAttack: _wrap(`<path d="M3 17 L9 11 M5 19 L11 13 M7 21 L13 15"/><path d="M11 5 L19 5 L19 13"/>`, { sw: 1.6 }),
    intentPurge: _wrap(`<path d="M12 2 L13 9 L20 6 L15 12 L20 18 L13 15 L12 22 L11 15 L4 18 L9 12 L4 6 L11 9 Z" fill="currentColor" fill-opacity="0.3"/>`),
    intentHeal: _wrap(`<path d="M12 21 L4 13 Q1 10 4 7 Q7 4 12 9 Q17 4 20 7 Q23 10 20 13 Z" fill="currentColor" fill-opacity="0.25"/><path d="M9 11 L15 11 M12 8 L12 14" stroke="#fff" stroke-width="1.8"/>`),
    intentShield: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.22"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`),
    intentBuff: _wrap(`<path d="M12 4 L20 12 L15 12 L15 20 L9 20 L9 12 L4 12 Z" fill="currentColor" fill-opacity="0.3"/>`),
    intentDebuff: _wrap(`<circle cx="12" cy="12" r="6" fill="currentColor" fill-opacity="0.18"/><circle cx="9" cy="11" r="1" fill="currentColor"/><circle cx="15" cy="11" r="1" fill="currentColor"/><path d="M5 8 L3 6 M19 8 L21 6 M5 16 L3 18 M19 16 L21 18 M12 5 L12 3 M12 19 L12 21" stroke-width="1.4"/>`),
    intentSummon: _wrap(`<rect x="6" y="6" width="12" height="14" rx="2" fill="currentColor" fill-opacity="0.18"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M9 14 L15 14 M12 4 L12 6 M8 4 L9 6 M16 4 L15 6"/>`, { sw: 1.6 }),
    intentConsume: _wrap(`<path d="M5 8 Q5 5 8 5 L16 5 Q19 5 19 8 L19 12 Q19 19 12 19 Q5 19 5 12 Z" fill="currentColor" fill-opacity="0.22"/><path d="M9 11 L15 11 M9 14 L15 14"/>`),
    intentCharge: _wrap(`<path d="M12 3 L22 20 L2 20 Z" fill="currentColor" fill-opacity="0.25"/><path d="M12 10 L12 15 M12 17 L12 17.01" stroke-width="2.4"/>`),
    intentDispel: _wrap(`<path d="M12 3 L13.5 9 L20 9 L14.8 13 L17 19 L12 15 L7 19 L9.2 13 L4 9 L10.5 9 Z" fill="currentColor" fill-opacity="0.35"/>`),
    intentReality: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.1"/><path d="M5 12 Q8 5 15 7 Q22 9 19 16 Q16 23 9 21 Q2 19 5 12 Z" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`),
    intentGlitch: _wrap(`<rect x="4" y="6" width="4" height="4" fill="currentColor"/><rect x="10" y="4" width="3" height="3" fill="currentColor"/><rect x="14" y="9" width="5" height="3" fill="currentColor"/><rect x="6" y="14" width="6" height="3" fill="currentColor"/><rect x="14" y="16" width="4" height="4" fill="currentColor"/>`, { sw: 0 }),

    // -------- HUD / UI CONTROLS --------
    settings: _wrap(`<path d="M12 2.5 L20 7 L20 17 L12 21.5 L4 17 L4 7 Z" fill="currentColor" fill-opacity="0.14"/><circle cx="12" cy="12" r="4.5" fill="none"/><path d="M12 5.5 L12 7.5 M12 16.5 L12 18.5 M5.5 12 L7.5 12 M16.5 12 L18.5 12 M7.6 7.6 L9 9 M15 15 L16.4 16.4 M16.4 7.6 L15 9 M7.6 16.4 L9 15" stroke-width="1.4"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>`, { sw: 1.5 }),
    reroll: _wrap(`<path d="M4 12 A8 8 0 0 1 12 4 L16 4"/><path d="M14 1 L17 4 L14 7"/><path d="M20 12 A8 8 0 0 1 12 20 L8 20"/><path d="M10 23 L7 20 L10 17"/>`, { sw: 2.2 }),
    endTurn: _wrap(`<path d="M5 5 L11 12 L5 19 Z" fill="currentColor" fill-opacity="0.3"/><path d="M12 5 L18 12 L12 19 Z" fill="currentColor" fill-opacity="0.3"/><path d="M19 5 L19 19" stroke-width="2.2"/>`),
    viewWorld: _wrap(`<path d="M2 12 Q7 4 12 4 Q17 4 22 12 Q17 20 12 20 Q7 20 2 12 Z" fill="currentColor" fill-opacity="0.18"/><circle cx="12" cy="12" r="3.5" fill="currentColor" fill-opacity="0.5"/>`),
    chevronUp: _wrap(`<path d="M5 15 L12 8 L19 15"/>`, { sw: 2.4 }),
    chevronDown: _wrap(`<path d="M5 9 L12 16 L19 9"/>`, { sw: 2.4 }),
    close: _wrap(`<path d="M6 6 L18 18 M18 6 L6 18"/>`, { sw: 2.4 }),
    check: _wrap(`<path d="M5 12 L10 17 L19 7"/>`, { sw: 2.4 }),

    // -------- META / SANCTUARY UPGRADES --------
    metaLife: _wrap(`<path d="M12 21 L4 13 Q1 10 4 7 Q7 4 12 9 Q17 4 20 7 Q23 10 20 13 Z" fill="currentColor" fill-opacity="0.3"/>`),
    metaMana: _wrap(`<path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" fill-opacity="0.3"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`),
    metaRecycler: _wrap(`<path d="M5 8 L9 4 L13 8"/><path d="M19 16 L15 20 L11 16"/><path d="M9 4 L9 12 Q9 16 13 16"/><path d="M15 20 L15 12 Q15 8 11 8"/>`, { sw: 1.8 }),
    metaMerchant: _wrap(`<path d="M5 8 L19 8 L17 20 L7 20 Z" fill="currentColor" fill-opacity="0.18"/><path d="M9 8 L9 5 Q9 3 12 3 Q15 3 15 5 L15 8" stroke-width="1.6"/><path d="M9 12 L15 12"/>`),
    metaSolar: _wrap(`<circle cx="12" cy="12" r="4" fill="currentColor" fill-opacity="0.5"/><path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M5 5 L7 7 M17 17 L19 19 M19 5 L17 7 M5 19 L7 17"/>`, { sw: 1.8 }),
    metaReroll: _wrap(`<rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor" fill-opacity="0.18"/><rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" fill-opacity="0.18"/><circle cx="7.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="16.5" cy="16.5" r="1.1" fill="currentColor"/>`, { sw: 1.6 }),
    metaSwarm: _wrap(`<circle cx="8" cy="9" r="3" fill="currentColor" fill-opacity="0.18"/><circle cx="16" cy="9" r="3" fill="currentColor" fill-opacity="0.18"/><circle cx="12" cy="16" r="3" fill="currentColor" fill-opacity="0.18"/><circle cx="8" cy="9" r="0.8" fill="currentColor"/><circle cx="16" cy="9" r="0.8" fill="currentColor"/><circle cx="12" cy="16" r="0.8" fill="currentColor"/>`),
    metaDataCache: _wrap(`<rect x="4" y="6" width="16" height="13" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M4 11 L20 11 M9 6 L9 19 M15 6 L15 19" stroke-width="1.4"/><circle cx="6.5" cy="9" r="0.6" fill="currentColor"/>`),

    // -------- COMBAT RELICS --------
    relicShield: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.22"/>`),
    relicDoubleEdge: _wrap(`<path d="M12 2 L14 6 L18 4 L16 8 L20 10 L15 12 L20 14 L16 16 L18 20 L14 18 L12 22 L10 18 L6 20 L8 16 L4 14 L9 12 L4 10 L8 8 L6 4 L10 6 Z" fill="currentColor" fill-opacity="0.22"/><path d="M4 4 L11 11 M20 4 L13 11 M4 20 L11 13 M20 20 L13 13" stroke-width="1.6"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`, { sw: 1.4 }),
    relicTitan: _wrap(`<rect x="3" y="9" width="3" height="6" rx="0.5" fill="currentColor" fill-opacity="0.4"/><rect x="18" y="9" width="3" height="6" rx="0.5" fill="currentColor" fill-opacity="0.4"/><rect x="6" y="11" width="2" height="2" fill="currentColor"/><rect x="16" y="11" width="2" height="2" fill="currentColor"/><rect x="8" y="10" width="8" height="4" rx="0.5" fill="currentColor" fill-opacity="0.6"/>`),
    relicHull: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/><path d="M12 3 L12 6 M12 18 L12 21 M3 12 L6 12 M18 12 L21 12" stroke-width="1.4"/>`),
    relicCrit: _wrap(`<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity="0.12"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12" stroke-width="1.4"/>`),
    relicLoot: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.2"/><path d="M9 9 Q9 6 12 6 Q15 6 15 9 Q15 11 12 12 L12 14 M12 17 L12 17.01" stroke-width="1.8"/>`),
    relicStim: _wrap(`<path d="M3 21 L7 17"/><path d="M6 18 L18 6 L20 8 L8 20 Z" fill="currentColor" fill-opacity="0.22"/><path d="M14 4 L20 10"/><path d="M11 9 L15 13" stroke-width="1.6"/>`, { sw: 1.6 }),
    relicBattery: _wrap(`<rect x="8" y="3" width="8" height="18" rx="1.5" fill="currentColor" fill-opacity="0.18"/><rect x="10" y="2" width="4" height="2" fill="currentColor"/><path d="M12 8 L9 13 L12 13 L11 18" stroke="#fff" stroke-width="1.6"/>`),
    relicPowerCell: _wrap(`<path d="M12 21 L4 13 Q1 10 4 7 Q7 4 12 9 Q17 4 20 7 Q23 10 20 13 Z" fill="currentColor" fill-opacity="0.22"/><rect x="9" y="11" width="6" height="4" rx="0.6" fill="currentColor" fill-opacity="0.6"/><path d="M10 12.5 L11 12.5 M13 12.5 L14 12.5 M11.5 13.5 L12.5 13.5" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`, { sw: 1.6 }),
    relicShieldGen: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.18"/><path d="M12 7 L12 11 M9 9 L12 11 L15 9 M9 14 L15 14 M9 17 L15 17"/>`, { sw: 1.6 }),
    relicWispVit: _wrap(`<path d="M12 18 L7 13 Q5 11 7 9 Q9 7 12 10 Q15 7 17 9 Q19 11 17 13 Z" fill="currentColor" fill-opacity="0.3"/><path d="M10 12 L14 12" stroke="#fff" stroke-width="1.4"/>`),
    relicSecondLife: _wrap(`<path d="M12 21 Q12 12 18 12 Q12 12 12 4 Q12 12 6 12 Q12 12 12 21 Z" fill="currentColor" fill-opacity="0.3"/>`),
    relicVoodoo: _wrap(`<path d="M12 4 Q9 4 9 7 L9 9 Q7 10 7 13 L7 18 Q7 21 12 21 Q17 21 17 18 L17 13 Q17 10 15 9 L15 7 Q15 4 12 4 Z" fill="currentColor" fill-opacity="0.18"/><path d="M10 11 L11 12 M14 11 L13 12" stroke-width="1.4"/><path d="M11 16 L13 16"/>`),
    relicManifest: _wrap(`<path d="M5 5 L19 5 L19 19 L7 19 L5 17 Z" fill="currentColor" fill-opacity="0.18"/><path d="M8 9 L16 9 M8 12 L16 12 M8 15 L13 15"/>`, { sw: 1.6 }),
    relicBrutalize: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.18"/><path d="M8 14 L10 12 L8 10 M16 10 L14 12 L16 14" stroke-width="1.6"/><path d="M9 17 Q12 15 15 17"/>`),
    relicRelentless: _wrap(`<path d="M12 3 Q14 7 12 10 Q9 8 9 13 Q9 18 12 21 Q15 18 15 13 Q14 11 13 9 Q12 5 12 3 Z" fill="currentColor" fill-opacity="0.3"/>`),
    relicEmergency: _wrap(`<rect x="4" y="7" width="16" height="13" rx="2" fill="currentColor" fill-opacity="0.18"/><path d="M9 7 L9 5 L15 5 L15 7"/><path d="M10 13 L14 13 M12 11 L12 15" stroke="#fff" stroke-width="2"/>`),
    relicGambler: _wrap(`<rect x="4" y="4" width="9" height="9" rx="1.5" fill="currentColor" fill-opacity="0.18"/><rect x="11" y="11" width="9" height="9" rx="1.5" fill="currentColor" fill-opacity="0.18"/><circle cx="6.5" cy="6.5" r="0.8" fill="currentColor"/><circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/><circle cx="6.5" cy="10.5" r="0.8" fill="currentColor"/><circle cx="13.5" cy="15.5" r="0.8" fill="currentColor"/><circle cx="17.5" cy="13.5" r="0.8" fill="currentColor"/>`, { sw: 1.4 }),
    relicHologram: _wrap(`<path d="M5 16 Q5 8 12 8 Q19 8 19 16 L19 20 L17 18 L15 20 L13 18 L11 20 L9 18 L7 20 L5 18 Z" fill="currentColor" fill-opacity="0.2" stroke-dasharray="2 2"/><circle cx="10" cy="13" r="0.9" fill="currentColor"/><circle cx="14" cy="13" r="0.9" fill="currentColor"/>`),
    relicMiner: _wrap(`<path d="M5 19 L11 13"/><path d="M5 5 Q9 1 13 5 Q15 7 13 9 L11 13 L9 11 Z" fill="currentColor" fill-opacity="0.3"/>`, { sw: 1.6 }),
    relicCoolant: _wrap(`<path d="M12 2 L12 22 M5 7 L19 17 M5 17 L19 7" stroke-width="1.6"/><path d="M12 2 L9 5 L12 5 L15 5 L12 2 M12 22 L9 19 L12 19 L15 19 L12 22"/>`),

    // -------- CORRUPTED RELICS --------
    corBlood: _wrap(`<path d="M12 3 Q5 12 5 16 Q5 21 12 21 Q19 21 19 16 Q19 12 12 3 Z" fill="currentColor" fill-opacity="0.4"/>`),
    corUnstable: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.2"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 3 L14 8 L12 8 Z M3 12 L8 14 L8 12 Z M21 12 L16 14 L16 12 Z M12 21 L10 16 L12 16 Z" fill="currentColor"/>`, { sw: 0 }),
    corVoid: _wrap(`<rect x="4" y="4" width="16" height="16" rx="1" fill="currentColor" fill-opacity="0.5"/><rect x="8" y="8" width="8" height="8" stroke-width="1.4"/>`),
    corGlitch: _wrap(`<rect x="3" y="6" width="4" height="3" fill="currentColor"/><rect x="9" y="4" width="3" height="4" fill="currentColor"/><rect x="14" y="9" width="6" height="3" fill="currentColor"/><rect x="5" y="13" width="6" height="3" fill="currentColor"/><rect x="13" y="16" width="5" height="4" fill="currentColor"/>`, { sw: 0 }),
    corEntropy: _wrap(`<path d="M3 6 L9 12 L13 8 L21 18" stroke-width="1.8"/><path d="M21 18 L21 14 L17 14"/>`),
    corQuantum: _wrap(`<path d="M5 12 Q5 6 12 6 Q19 6 19 12 Q19 18 12 18 Q5 18 5 12 Z" fill="currentColor" fill-opacity="0.18"/><path d="M8 12 Q8 9 12 9 Q16 9 16 12 Q16 15 12 15 Q8 15 8 12 Z"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>`, { sw: 1.6 }),
    corOverclock: _wrap(`<path d="M12 3 Q14 7 12 10 Q9 8 9 13 Q9 18 12 21 Q15 18 15 13 Q14 11 13 9 Q12 5 12 3 Z" fill="currentColor" fill-opacity="0.4"/>`),
    corParadox: _wrap(`<path d="M5 12 C5 7 12 7 12 12 C12 17 19 17 19 12 C19 7 12 7 12 12 C12 17 5 17 5 12 Z" fill="currentColor" fill-opacity="0.18"/>`, { sw: 1.6 }),

    // -------- GLITCH MODIFIERS --------
    glitchVolatile: _wrap(`<circle cx="12" cy="14" r="6" fill="currentColor" fill-opacity="0.3"/><path d="M14 8 L17 5 M16 4 L18 4 L18 6"/>`, { sw: 1.6 }),
    glitchEvasive: _wrap(`<path d="M3 14 Q5 10 9 11 Q12 8 15 11 Q19 10 21 14 Q19 18 15 17 Q12 20 9 17 Q5 18 3 14 Z" fill="currentColor" fill-opacity="0.18"/>`, { sw: 1.6 }),
    glitchRegen: _wrap(`<path d="M12 21 L4 13 Q1 10 4 7 Q7 4 12 9 Q17 4 20 7 Q23 10 20 13 Z" fill="currentColor" fill-opacity="0.3"/><path d="M9 11 L15 11 M12 8 L12 14" stroke="#fff" stroke-width="1.4"/>`),
    glitchThorns: _wrap(`<circle cx="12" cy="12" r="5" fill="currentColor" fill-opacity="0.18"/><path d="M12 3 L12 7 M12 17 L12 21 M3 12 L7 12 M17 12 L21 12 M5 5 L8 8 M16 16 L19 19 M19 5 L16 8 M5 19 L8 16"/>`, { sw: 1.6 }),

    // -------- DICE UPGRADE SKILLS --------
    upgAegis: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.22"/><path d="M12 7 L13.5 11 L17.5 11 L14 13.5 L15 17.5 L12 15 L9 17.5 L10 13.5 L6.5 11 L10.5 11 Z"/>`),
    upgAlpha: _wrap(`<path d="M12 22 L12 14"/><path d="M5 14 Q5 8 12 6 Q19 8 19 14 Z" fill="currentColor" fill-opacity="0.3"/><path d="M12 6 L10 3 L12 4 L14 3 L12 6"/>`, { sw: 1.6 }),
    upgCataclysm: _wrap(`<path d="M3 20 L8 8 L12 14 L16 8 L21 20 Z" fill="currentColor" fill-opacity="0.3"/><path d="M10 5 L9 8 M14 5 L15 8 M12 2 L12 6"/>`),
    upgStarfall: _wrap(`<circle cx="17" cy="6" r="3" fill="currentColor" fill-opacity="0.5"/><path d="M14 9 L4 19"/><path d="M16 12 L7 21"/><path d="M11 7 L3 15"/><path d="M3 21 L4 19"/>`),
    upgDigitalRot: _wrap(`<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity="0.1"/><path d="M3 12 L21 12 M12 3 L12 21 M6 6 L18 18 M6 18 L18 6" stroke-width="1.2"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>`),
    upgVoid: _wrap(`<circle cx="12" cy="12" r="9" fill="#000"/><circle cx="12" cy="12" r="9" stroke-dasharray="3 2" stroke-opacity="0.6"/><circle cx="12" cy="12" r="3" fill="currentColor"/>`),
    upgVicious: _wrap(`<path d="M5 11 Q5 5 12 5 Q19 5 19 11 L19 14 Q19 19 14 19 L10 19 Q5 19 5 14 Z" fill="currentColor" fill-opacity="0.25"/><path d="M3 9 L5 11 M21 9 L19 11"/><circle cx="9" cy="11" r="1.2" fill="currentColor"/><circle cx="15" cy="11" r="1.2" fill="currentColor"/><path d="M9 16 L11 14 L13 16 L15 14"/>`),
    upgHyperBeam: _wrap(`<path d="M3 12 L21 12" stroke-width="3"/><path d="M3 9 L21 9 M3 15 L21 15" stroke-opacity="0.5" stroke-width="1.2"/><circle cx="20" cy="12" r="2" fill="currentColor"/>`),

    // -------- REST OPTIONS --------
    sleep: _wrap(`<path d="M22 14 A8 8 0 1 1 14 4 A6 6 0 0 0 22 14 Z" fill="currentColor" fill-opacity="0.25"/><path d="M3 5 L9 5 L3 11 L9 11" stroke-width="1.6"/>`),
    meditate: _wrap(`<circle cx="12" cy="9" r="3" fill="currentColor" fill-opacity="0.4"/><path d="M5 19 Q8 14 12 14 Q16 14 19 19" stroke-width="1.8"/><path d="M9 17 L7 20 M15 17 L17 20"/>`, { sw: 1.6 }),
    tinker: _wrap(`<path d="M5 19 L11 13"/><path d="M11 13 L13 11 L15 13 L17 11 Q19 9 17 7 Q15 5 13 7 L11 9 L13 11 Z" fill="currentColor" fill-opacity="0.22"/>`, { sw: 1.6 }),

    // -------- MISC --------
    flag: _wrap(`<path d="M6 21 L6 4"/><path d="M6 4 L18 6 L15 10 L18 14 L6 12 Z" fill="currentColor" fill-opacity="0.3"/>`),
    skull: _wrap(`<path d="M6 11 Q6 5 12 5 Q18 5 18 11 L18 16 Q18 17 17 17 L15 17 L15 20 L9 20 L9 17 L7 17 Q6 17 6 16 Z" fill="currentColor" fill-opacity="0.2"/><circle cx="9.5" cy="12" r="1.5" fill="currentColor"/><circle cx="14.5" cy="12" r="1.5" fill="currentColor"/><path d="M10 16 L11 18 L12 16 L13 18 L14 16"/>`),
    robot: _wrap(`<rect x="6" y="8" width="12" height="11" rx="2" fill="currentColor" fill-opacity="0.18"/><circle cx="9.5" cy="13" r="1.2" fill="currentColor"/><circle cx="14.5" cy="13" r="1.2" fill="currentColor"/><path d="M9 16 L15 16"/><path d="M12 4 L12 8 M9 5 L9 7 M15 5 L15 7" stroke-width="1.4"/>`),
    fragmentShard: _wrap(`<path d="M12 2 L18 8 L14 22 L10 22 L6 8 Z" fill="currentColor" fill-opacity="0.25"/><path d="M9 8 L12 12 L15 8 L12 16" stroke-width="1.4"/>`),

    // -------- SUMMONER GROVE STAGES --------
    growSeed: _wrap(`<circle cx="12" cy="14" r="3" fill="currentColor" fill-opacity="0.3"/><path d="M12 11 L12 7 Q12 5 14 5"/>`),
    growSprout: _wrap(`<path d="M12 21 L12 12"/><path d="M12 12 Q7 12 7 8 Q12 8 12 12 Z" fill="currentColor" fill-opacity="0.4"/><path d="M12 12 Q17 12 17 8 Q12 8 12 12 Z" fill="currentColor" fill-opacity="0.4"/>`),
    growBloom: _wrap(`<circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 5 Q15 8 12 11 Q9 8 12 5 M19 12 Q16 15 13 12 Q16 9 19 12 M12 19 Q9 16 12 13 Q15 16 12 19 M5 12 Q8 9 11 12 Q8 15 5 12" fill="currentColor" fill-opacity="0.3"/>`),

    // -------- TACTICIAN CLASS DICE (cyan/tech geometric) --------
    tacAttack: _wrap(`<circle cx="12" cy="12" r="8" stroke-dasharray="2 2"/><path d="M12 4 L12 8 M12 16 L12 20 M4 12 L8 12 M16 12 L20 12"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M7 7 L10 10 M17 7 L14 10 M7 17 L10 14 M17 17 L14 14" stroke-width="1.4"/>`, { sw: 1.6 }),
    tacDefend: _wrap(`<path d="M12 3 L20 7.5 L20 13 L12 21 L4 13 L4 7.5 Z" fill="currentColor" fill-opacity="0.18"/><path d="M8 9 L16 9 M7 12 L17 12 M8 15 L16 15" stroke-width="1" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="2.5" stroke-width="1.4"/>`, { sw: 1.6 }),
    tacMana: _wrap(`<path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" fill-opacity="0.2"/><circle cx="8" cy="12" r="1.2" fill="currentColor"/><circle cx="16" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/><path d="M8 12 L12 8 L16 12 L12 16 Z" stroke-width="1"/>`, { sw: 1.6 }),
    tacMinion: _wrap(`<path d="M12 3 Q9 3 9 6 Q9 8 11 9 L9 14 L7 14 L7 17 L17 17 L17 14 L15 14 L13 9 Q15 8 15 6 Q15 3 12 3 Z" fill="currentColor" fill-opacity="0.22"/><path d="M5 21 L19 21" stroke-width="2"/><path d="M9 6 L7 4 M15 6 L17 4" stroke-width="1.2"/><path d="M10 15 L14 15" stroke-width="1" stroke-dasharray="1 1"/>`, { sw: 1.6 }),

    // -------- ARCANIST CLASS DICE (purple/arcane mystical) --------
    arcAttack: _wrap(`<circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.5"/><path d="M12 2 L13 9 M12 22 L11 15 M2 12 L9 11 M22 12 L15 13" stroke-width="1.8"/><path d="M6 6 L9 9 M18 6 L15 9 M6 18 L9 15 M18 18 L15 15" stroke-width="1.2"/><circle cx="12" cy="12" r="7" stroke-dasharray="2 3"/>`, { sw: 1.4 }),
    arcDefend: _wrap(`<path d="M12 2 L18 8 L18 16 L12 22 L6 16 L6 8 Z" fill="currentColor" fill-opacity="0.2"/><path d="M12 6 L15 10 L15 14 L12 18 L9 14 L9 10 Z" stroke-width="1.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>`, { sw: 1.6 }),
    arcMana: _wrap(`<path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" fill-opacity="0.25"/><path d="M12 6 L16 12 L12 18 L8 12 Z" stroke-width="1.2"/><circle cx="12" cy="12" r="2" fill="currentColor" fill-opacity="0.6"/><path d="M12 2 L12 6 M21 12 L16 12 M12 22 L12 18 M3 12 L8 12" stroke-width="1"/>`, { sw: 1.6 }),
    arcMinion: _wrap(`<circle cx="12" cy="8" r="3" fill="currentColor" fill-opacity="0.4"/><path d="M12 11 Q10 16 8 20" stroke-width="1.8"/><path d="M12 11 Q14 16 16 20" stroke-width="1.8"/><path d="M9 6 L7 4 M15 6 L17 4" stroke-width="1.2"/><circle cx="12" cy="8" r="1" fill="currentColor"/>`, { sw: 1.6 }),

    // -------- BLOODSTALKER CLASS DICE (red/organic sharp) --------
    bldAttack: _wrap(`<path d="M18 4 Q14 4 10 10 Q8 14 6 18" stroke-width="2.2"/><path d="M4 20 L6 18 L8 20" fill="currentColor"/><circle cx="14" cy="10" r="1.2" fill="currentColor"/><circle cx="11" cy="14" r="1" fill="currentColor"/><circle cx="16" cy="7" r="0.8" fill="currentColor"/><path d="M18 4 L20 3 M18 4 L20 6" stroke-width="1.4"/>`, { sw: 1.6 }),
    bldDefend: _wrap(`<path d="M12 21 L4 13 Q1 10 4 7 Q7 4 12 9 Q17 4 20 7 Q23 10 20 13 Z" fill="currentColor" fill-opacity="0.3"/><path d="M8 12 L16 12" stroke-width="2"/><path d="M12 9 L12 15" stroke-width="1.2" stroke-dasharray="1 2"/>`, { sw: 1.6 }),
    bldMana: _wrap(`<path d="M12 3 Q7 10 7 14 Q7 20 12 20 Q17 20 17 14 Q17 10 12 3 Z" fill="currentColor" fill-opacity="0.35"/><path d="M12 8 L15 12 L12 16 L9 12 Z" stroke-width="1.2"/>`, { sw: 1.6 }),
    bldMinion: _wrap(`<path d="M6 11 Q6 5 12 5 Q18 5 18 11 L18 14 L15 14 L15 18 L9 18 L9 14 L6 14 Z" fill="currentColor" fill-opacity="0.22"/><circle cx="9" cy="10" r="1.4" fill="currentColor"/><circle cx="15" cy="10" r="1.4" fill="currentColor"/><path d="M10 14 L11 16 M14 14 L13 16" stroke-width="1.4"/>`, { sw: 1.6 }),

    // -------- ANNIHILATOR CLASS DICE (orange/explosive industrial) --------
    anhAttack: _wrap(`<path d="M13 2 L6 12 L11 12 L9 22 L18 10 L13 10 Z" fill="currentColor" fill-opacity="0.35"/><circle cx="12" cy="12" r="8" stroke-width="1.2" stroke-dasharray="3 2"/><circle cx="18" cy="6" r="2" fill="currentColor" fill-opacity="0.4"/>`, { sw: 1.6 }),
    anhDefend: _wrap(`<path d="M4 16 L8 12 L12 16 L16 12 L20 16" stroke-width="2"/><path d="M8 12 L4 8" stroke-width="1.6"/><path d="M16 12 L20 8" stroke-width="1.6"/><path d="M12 16 L12 20" stroke-width="1.4"/><circle cx="12" cy="8" r="2" stroke-width="1.4"/>`, { sw: 1.6 }),
    anhMana: _wrap(`<path d="M12 3 L18.5 7 L18.5 15 L12 19 L5.5 15 L5.5 7 Z" fill="currentColor" fill-opacity="0.25"/><path d="M12 7 L15 9 L15 13 L12 15 L9 13 L9 9 Z" stroke-width="1.4"/><circle cx="12" cy="11" r="1.5" fill="currentColor"/>`, { sw: 1.6 }),
    anhMinion: _wrap(`<circle cx="12" cy="13" r="6" fill="currentColor" fill-opacity="0.25"/><path d="M12 7 L12 4" stroke-width="1.8"/><path d="M10 3 L12 4 L14 3" stroke-width="1.4"/><circle cx="10" cy="12" r="0.8" fill="currentColor"/><circle cx="14" cy="12" r="0.8" fill="currentColor"/><path d="M14 4 L16 2" stroke-width="1.2"/><path d="M15 3 L17 3" stroke-width="1"/>`, { sw: 1.6 }),

    // -------- SENTINEL CLASS DICE (white/silver metallic) --------
    senAttack: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.18"/><path d="M12 6 L12 18" stroke-width="2.2"/><path d="M9 9 L12 6 L15 9" stroke-width="1.8"/><path d="M8 14 L16 14" stroke-width="1.4"/>`, { sw: 1.6 }),
    senDefend: _wrap(`<path d="M12 2 L20 6 L20 12 Q20 18 12 22 Q4 18 4 12 L4 6 Z" fill="currentColor" fill-opacity="0.12"/><path d="M12 4 L18 7 L18 12 Q18 17 12 20 Q6 17 6 12 L6 7 Z" fill="currentColor" fill-opacity="0.12"/><path d="M12 7 L16 9 L16 12 Q16 16 12 18 Q8 16 8 12 L8 9 Z" fill="currentColor" fill-opacity="0.15"/>`, { sw: 1.6 }),
    senMana: _wrap(`<path d="M12 2 L21 12 L12 22 L3 12 Z" fill="currentColor" fill-opacity="0.18"/><path d="M12 5 L18 12 L12 19 L6 12 Z" stroke-width="1.2"/><path d="M12 3 L19.5 12 L12 21 L4.5 12 Z" stroke-width="0.8" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="2" fill="currentColor"/>`, { sw: 1.6 }),
    senMinion: _wrap(`<path d="M8 6 L16 6 L18 10 L18 18 L6 18 L6 10 Z" fill="currentColor" fill-opacity="0.2"/><path d="M10 6 L10 3 L14 3 L14 6" stroke-width="1.4"/><circle cx="10" cy="12" r="1.2" fill="currentColor"/><circle cx="14" cy="12" r="1.2" fill="currentColor"/><path d="M8 15 L16 15" stroke-width="1.4"/><path d="M6 18 L4 20 M18 18 L20 20" stroke-width="1.2"/>`, { sw: 1.6 }),

    // -------- SUMMONER CLASS DICE (green/organic flowing) --------
    sumAttack: _wrap(`<path d="M12 20 Q8 18 6 14 Q4 10 6 7" stroke-width="2"/><path d="M6 7 L4 5 M6 7 L8 5" stroke-width="1.4"/><path d="M10 14 Q9 11 11 9" stroke-width="1.4"/><path d="M16 16 Q18 12 16 9" stroke-width="1.4"/><circle cx="8" cy="12" r="1" fill="currentColor"/><circle cx="14" cy="10" r="1" fill="currentColor"/><circle cx="17" cy="14" r="0.8" fill="currentColor"/>`, { sw: 1.6 }),
    sumDefend: _wrap(`<rect x="4" y="10" width="16" height="10" rx="1" fill="currentColor" fill-opacity="0.2"/><path d="M4 14 L20 14" stroke-width="1.2"/><path d="M6 10 L6 7 M10 10 L10 8 M14 10 L14 8 M18 10 L18 7" stroke-width="1.8"/><circle cx="8" cy="8" r="1" fill="currentColor" fill-opacity="0.5"/><circle cx="16" cy="7" r="0.8" fill="currentColor" fill-opacity="0.5"/>`, { sw: 1.6 }),
    sumMana: _wrap(`<circle cx="12" cy="12" r="3" fill="currentColor" fill-opacity="0.4"/><path d="M12 4 Q14 8 12 9 Q10 8 12 4 Z" fill="currentColor" fill-opacity="0.3"/><path d="M19 9 Q15 10 14 12 Q16 13 19 9 Z" fill="currentColor" fill-opacity="0.3"/><path d="M18 17 Q14 15 13 13 Q15 12 18 17 Z" fill="currentColor" fill-opacity="0.3"/><path d="M6 17 Q10 15 11 13 Q9 12 6 17 Z" fill="currentColor" fill-opacity="0.3"/><path d="M5 9 Q9 10 10 12 Q8 13 5 9 Z" fill="currentColor" fill-opacity="0.3"/>`, { sw: 1.2 }),
    sumMinion: _wrap(`<circle cx="12" cy="7" r="3.5" fill="currentColor" fill-opacity="0.35"/><path d="M12 10 Q10 15 8 20" stroke-width="1.6"/><path d="M12 10 Q14 15 16 20" stroke-width="1.6"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="8" cy="13" r="0.8" fill="currentColor" fill-opacity="0.4"/><circle cx="16" cy="13" r="0.8" fill="currentColor" fill-opacity="0.4"/>`, { sw: 1.4 }),

    // Fallback / unknown
    unknown: _wrap(`<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M9 9 Q9 6 12 6 Q15 6 15 9 Q15 11 12 12 L12 14 M12 17 L12 17.01"/>`, { sw: 1.6 }),
};

// Convenience function — returns an SVG string for the given icon name.
export function icon(name) {
    return ICONS[name] || ICONS.unknown;
}

// Canvas helper: returns a cached HTMLImageElement built from the named icon's SVG,
// with `currentColor` substituted for the requested colour. Use ctx.drawImage(img, x, y, w, h)
// to paint it. The image loads asynchronously; first paint of a never-seen
// (name,colour) combo may be empty for one frame, then renders normally.
const _imageCache = new Map();
export function iconImage(name, color) {
    const c = color || '#ffffff';
    const key = name + '|' + c;
    let img = _imageCache.get(key);
    if (img) return img;
    let svg = (ICONS[name] || ICONS.unknown).replaceAll('currentColor', c);
    // Canvas-bound Image needs explicit width/height on the <svg> root — some
    // browsers report naturalWidth=0 for SVGs that only carry viewBox. Inject
    // width/height attributes before the viewBox to guarantee decoded dimensions.
    if (!/<svg[^>]*\swidth=/.test(svg)) {
        svg = svg.replace('<svg ', '<svg width="24" height="24" ');
    }
    img = new Image();
    img.width = 24; img.height = 24;
    // Use the standard data-URL form. `;utf8` is non-standard and rejected by
    // some browsers — `;charset=utf-8` works everywhere.
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    _imageCache.set(key, img);
    return img;
}

// Safe drawImage wrapper — silently no-ops if the image is not yet decoded
// or is in a broken state. Use this everywhere on canvas to avoid crashing
// the render loop when an icon fails to load.
export function drawIcon(ctx, name, color, x, y, w, h) {
    const img = iconImage(name, color);
    // Only require `complete`; SVG data-URLs can report naturalWidth 0 even
    // when fully decoded on some browsers, but drawImage still paints them.
    if (!img.complete) return;
    try { ctx.drawImage(img, x, y, w, h); } catch (e) { /* image broken — skip silently */ }
}

// Pre-warm common icons used during combat so they're ready before the first frame.
export function preloadCombatIcons(colorList) {
    const names = [
        'intentAttack', 'intentMultiAttack', 'intentPurge', 'intentHeal', 'intentShield',
        'intentBuff', 'intentDebuff', 'intentSummon', 'intentConsume', 'intentCharge',
        'intentDispel', 'intentReality', 'intentGlitch',
        'weak', 'frail', 'vulnerable', 'overcharged', 'constricted', 'voodooEffect',
        'regen', 'thorns', 'volatileMod', 'armor', 'charged'
    ];
    const colors = colorList || ['#ffffff', '#00ff99', '#ff3355', '#ffd76a'];
    names.forEach(n => colors.forEach(c => iconImage(n, c)));
}
