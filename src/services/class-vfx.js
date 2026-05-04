// Per-class fantasy VFX dispatcher (Roadmap Part 26.2 + 26.3).
//
// Attack VFX (Part 26.1) are already implemented inline in game.js
// (`attack_pawn_volley`, `attack_glyph_weave`, etc.) — this module
// extends the same per-class fantasy to:
//
//   - playSummon(player, minion)  — fires when a player-side minion spawns
//   - playDeath(player)            — fires when the player dies (game-over)
//
// All branches reuse the existing particle pool (createExplosion,
// createSparks, createShockwave, createTrail, createFloatingText) plus
// the existing AudioMgr stings — no new sprite assets required.
//
// Tier-gated: low-tier players get a single shockwave + sparks fallback
// so the FPS budget from Day 1 doesn't blow up. High-tier gets the full
// layered presentation with timed setTimeout chains for "ritual" feel.

import { ParticleSys } from '../effects/particles.js';
import { AudioMgr } from '../audio.js';
import { Perf } from './perf.js';

// Per-class palette — mirrors PLAYER_CLASSES.color so summon/death
// reads in the class's signature hue. Brand colour first, accent
// second for layering.
const CLASS_PALETTE = {
    tactician:    { brand: '#00f3ff', accent: '#88eaff' },
    arcanist:     { brand: '#bc13fe', accent: '#e0b0ff' },
    bloodstalker: { brand: '#ff0044', accent: '#ff88a0' },
    annihilator:  { brand: '#ff8800', accent: '#ffd76a' },
    sentinel:     { brand: '#ffffff', accent: '#cfeaff' },
    summoner:     { brand: '#00ff99', accent: '#7affc2' }
};

function paletteFor(classId) {
    return CLASS_PALETTE[classId] || { brand: '#00f3ff', accent: '#ffffff' };
}

function isLowTier() {
    return (typeof Perf !== 'undefined' && Perf.tier === 'low');
}

// ─────────────────────────────────────────────────────────────────
// SUMMON (Part 26.2) — fires once per minion spawn. Layered timing
// reads as a deliberate "incantation" rather than a flat poof.
// ─────────────────────────────────────────────────────────────────
function summonTactician(x, y, p) {
    // Hex grid pulse + cyan beacon flash. Three concentric shockwaves
    // staggered 60ms — sells "deployment grid coming online".
    ParticleSys.createShockwave(x, y, p.brand, 28);
    setTimeout(() => ParticleSys.createShockwave(x, y, p.brand, 38), 60);
    setTimeout(() => ParticleSys.createShockwave(x, y, p.accent, 22), 120);
    ParticleSys.createSparks(x, y, p.brand, 14);
    try { AudioMgr.playSound('print', { volume: 0.7 }); } catch (_) {}
}

function summonArcanist(x, y, p) {
    // Mana fold — purple radial sparks + a centred floating glyph text.
    ParticleSys.createShockwave(x, y, p.brand, 32);
    ParticleSys.createSparks(x, y, p.brand, 18);
    ParticleSys.createSparks(x, y, p.accent, 10);
    // Centred sigil text reads as a glyph etched into the air.
    ParticleSys.createFloatingText(x, y - 30, '◉', p.brand, { fontSize: 56, vy: -0.4, life: 1.4 });
    try { AudioMgr.playSound('zap', { playbackRate: 1.3, volume: 0.7 }); } catch (_) {}
}

function summonBloodstalker(x, y, p) {
    // Blood ritual — crimson sigil floats up, blood droplets rain.
    ParticleSys.createShockwave(x, y, p.brand, 26);
    ParticleSys.createExplosion(x, y, 22, p.brand);
    ParticleSys.createSparks(x, y - 8, p.accent, 16);
    // Droplets — short trails falling outward from the centre.
    for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 14 + Math.random() * 12;
        ParticleSys.createTrail && ParticleSys.createTrail(
            x + Math.cos(ang) * r,
            y + Math.sin(ang) * r,
            p.brand, 0.5
        );
    }
    try { AudioMgr.playSound('hit', { playbackRate: 0.7, volume: 0.7 }); } catch (_) {}
}

function summonAnnihilator(x, y, p) {
    // Assemble bot — orange sparks cluster inward then a single bolt
    // flash. Reads as "chassis snapping together".
    ParticleSys.createSparks(x, y, p.brand, 18);
    ParticleSys.createSparks(x, y, p.accent, 10);
    setTimeout(() => {
        ParticleSys.createExplosion(x, y, 18, p.brand);
        ParticleSys.createShockwave(x, y, p.accent, 26);
    }, 140);
    try { AudioMgr.playSound('upgrade', { playbackRate: 0.85, volume: 0.7 }); } catch (_) {}
}

function summonSentinel(x, y, p) {
    // Raise guardian — white aegis ring expands, four cardinal pips
    // pulse outward like shield plates locking into position.
    ParticleSys.createShockwave(x, y, p.brand, 36);
    ParticleSys.createShockwave(x, y, p.accent, 24);
    // Cardinal pips — short bursts at N/E/S/W.
    [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach(ang => {
        ParticleSys.createSparks(x + Math.cos(ang) * 22, y + Math.sin(ang) * 22, p.accent, 6);
    });
    try { AudioMgr.playSound('defend', { volume: 0.7 }); } catch (_) {}
}

function summonSummoner(x, y, p) {
    // Sacred grove bloom — green spiral of leaves, root coil expands
    // out of the ground. Two staggered shockwaves at +30 / -10 y to
    // imply "rising from below".
    ParticleSys.createShockwave(x, y + 18, p.brand, 30);
    setTimeout(() => ParticleSys.createShockwave(x, y, p.accent, 28), 80);
    ParticleSys.createSparks(x, y, p.brand, 16);
    // Three short trails curling upward — leaves catching the wind.
    for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 14;
        ParticleSys.createTrail && ParticleSys.createTrail(x + off, y - 10, p.accent, 0.6);
    }
    try { AudioMgr.playSound('mana', { playbackRate: 1.2, volume: 0.7 }); } catch (_) {}
}

const SUMMON_HANDLERS = {
    tactician:    summonTactician,
    arcanist:     summonArcanist,
    bloodstalker: summonBloodstalker,
    annihilator:  summonAnnihilator,
    sentinel:     summonSentinel,
    summoner:     summonSummoner
};

// ─────────────────────────────────────────────────────────────────
// DEATH (Part 26.3) — player-side death cinematic that runs into
// the existing scanline + cause-of-death pill from Day 5. Each branch
// is a 600–900ms layered burst at the player's last x/y.
// ─────────────────────────────────────────────────────────────────
function deathTactician(x, y, p) {
    // Cyan grid collapse — three rapid shockwaves shrink inward,
    // tactical-feed-disconnecting feel.
    ParticleSys.createShockwave(x, y, p.brand, 60);
    setTimeout(() => ParticleSys.createShockwave(x, y, p.brand, 42), 120);
    setTimeout(() => ParticleSys.createShockwave(x, y, p.accent, 26), 240);
    ParticleSys.createExplosion(x, y, 36, p.brand);
    ParticleSys.createSparks(x, y, p.brand, 22);
    try { AudioMgr.playSound('grid_fracture', { playbackRate: 0.9, volume: 0.85 }); } catch (_) {}
}

function deathArcanist(x, y, p) {
    // Mana wisps escape — purple implosion then a fan of trails
    // drifting upward like spirits leaving the body.
    ParticleSys.createShockwave(x, y, p.brand, 50);
    ParticleSys.createExplosion(x, y, 42, p.brand);
    ParticleSys.createSparks(x, y, p.accent, 20);
    for (let i = 0; i < 6; i++) {
        const off = (i - 2.5) * 12;
        setTimeout(() => {
            ParticleSys.createTrail && ParticleSys.createTrail(x + off, y - 30, p.accent, 0.9);
        }, 80 + i * 50);
    }
    try { AudioMgr.playSound('zap', { playbackRate: 0.65, volume: 0.85 }); } catch (_) {}
}

function deathBloodstalker(x, y, p) {
    // Crimson dissolve — wide low shockwave (blood spreading) +
    // splatter sparks. No upward motion; gravity-heavy.
    ParticleSys.createShockwave(x, y + 10, p.brand, 70);
    ParticleSys.createExplosion(x, y, 44, p.brand);
    ParticleSys.createExplosion(x, y, 24, p.accent);
    // Floor splatter — sparks fanning outward at ground level.
    for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI; // upper half only — drips down after
        const r = 18 + Math.random() * 18;
        ParticleSys.createSparks(x + Math.cos(ang) * r, y + 10 + Math.sin(ang) * r * 0.4, p.brand, 3);
    }
    try { AudioMgr.playSound('chains', { playbackRate: 0.75, volume: 0.8 }); } catch (_) {}
}

function deathAnnihilator(x, y, p) {
    // Chain-explosion across body. Three offset bursts at staggered
    // delays + a final big white flash. Reads as "self-detonate".
    ParticleSys.createSparks(x, y, p.brand, 16);
    [[-22, -10, 0], [24, -4, 100], [-12, 18, 200]].forEach(([dx, dy, t]) => {
        setTimeout(() => {
            ParticleSys.createExplosion(x + dx, y + dy, 26, p.brand);
            ParticleSys.createShockwave(x + dx, y + dy, p.accent, 22);
        }, t);
    });
    setTimeout(() => {
        ParticleSys.createExplosion(x, y, 50, '#ffffff');
        ParticleSys.createShockwave(x, y, '#ffffff', 56);
    }, 320);
    try { AudioMgr.playSound('explosion', { playbackRate: 0.85, volume: 1.0 }); } catch (_) {}
}

function deathSentinel(x, y, p) {
    // Aegis shatter — white shockwave + a second ring of sparkly
    // shards. The shield giving way as the wearer falls.
    ParticleSys.createShockwave(x, y, p.brand, 64);
    ParticleSys.createSparks(x, y, p.brand, 26);
    setTimeout(() => {
        // Ring of secondary sparks at +radius — the broken plates.
        for (let i = 0; i < 10; i++) {
            const ang = (Math.PI * 2 / 10) * i;
            const r = 38;
            ParticleSys.createSparks(x + Math.cos(ang) * r, y + Math.sin(ang) * r, p.accent, 4);
        }
    }, 120);
    ParticleSys.createExplosion(x, y, 32, p.accent);
    try { AudioMgr.playSound('snap', { playbackRate: 0.8, volume: 0.9 }); } catch (_) {}
}

function deathSummoner(x, y, p) {
    // Spirits ascend — three trails curl upward in green/mint, leaves
    // wither at the base. Reads as "passing into the grove".
    ParticleSys.createShockwave(x, y, p.brand, 50);
    ParticleSys.createExplosion(x, y, 32, p.brand);
    ParticleSys.createSparks(x, y, p.accent, 18);
    for (let i = 0; i < 4; i++) {
        const off = (i - 1.5) * 14;
        setTimeout(() => {
            ParticleSys.createTrail && ParticleSys.createTrail(x + off, y - 20, p.brand, 0.9);
            ParticleSys.createTrail && ParticleSys.createTrail(x + off, y - 30, p.accent, 0.7);
        }, 90 + i * 70);
    }
    try { AudioMgr.playSound('mana', { playbackRate: 0.75, volume: 0.85 }); } catch (_) {}
}

const DEATH_HANDLERS = {
    tactician:    deathTactician,
    arcanist:     deathArcanist,
    bloodstalker: deathBloodstalker,
    annihilator:  deathAnnihilator,
    sentinel:     deathSentinel,
    summoner:     deathSummoner
};

// ─────────────────────────────────────────────────────────────────
// Public API — both methods are no-op safe (player can be null at
// boot, classId can be missing in tutorial, particle pool may not
// have initialised yet on the very first frame).
// ─────────────────────────────────────────────────────────────────
export const ClassVfx = {
    /** Fire a class-fantasy summon burst at (x, y). */
    playSummon(classId, x, y) {
        if (!classId || x == null || y == null) return;
        const p = paletteFor(classId);
        // Low-tier fallback — single shockwave + sparks at brand colour,
        // skip the timed layering that drives the per-class flavour.
        if (isLowTier()) {
            ParticleSys.createShockwave && ParticleSys.createShockwave(x, y, p.brand, 24);
            ParticleSys.createSparks    && ParticleSys.createSparks(x, y, p.brand, 10);
            return;
        }
        const handler = SUMMON_HANDLERS[classId];
        if (handler) handler(x, y, p);
        else {
            // Unknown class — generic brand burst.
            ParticleSys.createShockwave && ParticleSys.createShockwave(x, y, p.brand, 28);
            ParticleSys.createSparks    && ParticleSys.createSparks(x, y, p.brand, 12);
        }
    },

    /** Fire a class-fantasy death cinematic at (x, y). */
    playDeath(classId, x, y) {
        if (!classId || x == null || y == null) return;
        const p = paletteFor(classId);
        if (isLowTier()) {
            // Low-tier: one big shockwave + explosion in brand colour.
            // Still distinct per class via colour, just no layered timing.
            ParticleSys.createShockwave && ParticleSys.createShockwave(x, y, p.brand, 50);
            ParticleSys.createExplosion && ParticleSys.createExplosion(x, y, 32, p.brand);
            return;
        }
        const handler = DEATH_HANDLERS[classId];
        if (handler) handler(x, y, p);
        else {
            // Unknown class — bigger generic burst.
            ParticleSys.createShockwave && ParticleSys.createShockwave(x, y, p.brand, 56);
            ParticleSys.createExplosion && ParticleSys.createExplosion(x, y, 40, p.brand);
            ParticleSys.createSparks    && ParticleSys.createSparks(x, y, p.brand, 20);
        }
    }
};
