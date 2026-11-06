// Direct canvas icon drawing — no Image loading, no data-URLs, no decoding.
// Every icon is rendered using ctx primitives, guaranteed to paint immediately
// on the first frame with identical appearance across all devices.
//
// API:
//   drawIntentIcon(ctx, type, cx, cy, size, color)   — 12 intent variants
//   drawEffectIcon(ctx, effectId, cx, cy, size, color) — 6 status effects
//   drawBadgeIcon(ctx, name, cx, cy, size, color)     — fallback registry

// Internal helper — sets up the drawing state, restores on completion.
function _wrap(ctx, cx, cy, size, color, fn) {
    ctx.save();
    ctx.translate(cx, cy);
    // All icons are designed in a 24×24 box centered at origin.
    const s = size / 24;
    ctx.scale(s, s);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    fn(ctx);
    ctx.restore();
}

// ============================================================
// INTENT ICONS — drawn at (cx, cy), fits inside a `size` × `size` box
// ============================================================
export function drawIntentIcon(ctx, type, cx, cy, size, color) {
    switch (type) {
        case 'attack':
        case 'intentAttack':
            _wrap(ctx, cx, cy, size, color, c => {
                // Diagonal sword with arrow hilt: blade from bottom-left to upper-right
                c.beginPath();
                c.moveTo(-7, 7);
                c.lineTo(3, -3);
                c.stroke();
                // Tip triangle
                c.beginPath();
                c.moveTo(1, -7); c.lineTo(7, -7); c.lineTo(7, -1);
                c.stroke();
                c.beginPath();
                c.moveTo(3, -3); c.lineTo(7, -7);
                c.stroke();
                // Pommel dot
                c.beginPath();
                c.arc(-7, 7, 1.6, 0, Math.PI * 2);
                c.fill();
            });
            break;

        case 'multi_attack':
        case 'intentMultiAttack':
            _wrap(ctx, cx, cy, size, color, c => {
                c.lineWidth = 1.8;
                // Three parallel slashes
                c.beginPath();
                c.moveTo(-9, 5);  c.lineTo(-3, -1);
                c.moveTo(-7, 7);  c.lineTo(-1, 1);
                c.moveTo(-5, 9);  c.lineTo(1, 3);
                c.stroke();
                // Arrow tip
                c.beginPath();
                c.moveTo(-1, -7); c.lineTo(7, -7); c.lineTo(7, 1);
                c.stroke();
            });
            break;

        case 'self_destruct':
            // v1.8.3 — concentric circles with a danger-cross hatch
            // through them. Detonator-armed enemies (Parasite Carrier
            // etc) display this on their intent next turn.
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.35;
                c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.6;
                c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.stroke();
                // Danger cross + spark dots
                c.beginPath();
                c.moveTo(-9, -9); c.lineTo(9, 9);
                c.moveTo(-9, 9); c.lineTo(9, -9);
                c.stroke();
                c.beginPath();
                c.arc(0, -10, 1.4, 0, Math.PI * 2);
                c.arc(0, 10, 1.4, 0, Math.PI * 2);
                c.arc(-10, 0, 1.4, 0, Math.PI * 2);
                c.arc(10, 0, 1.4, 0, Math.PI * 2);
                c.fill();
            });
            break;

        case 'purge_attack':
        case 'intentPurge':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.35;
                c.beginPath();
                for (let i = 0; i < 12; i++) {
                    const a = (i * Math.PI * 2) / 12;
                    const r = i % 2 === 0 ? 9 : 4;
                    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                c.closePath();
                c.fill();
                c.globalAlpha = 1;
                c.beginPath();
                for (let i = 0; i < 12; i++) {
                    const a = (i * Math.PI * 2) / 12;
                    const r = i % 2 === 0 ? 9 : 4;
                    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                c.closePath();
                c.stroke();
            });
            break;

        case 'shield':
        case 'intentShield':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.35;
                c.beginPath();
                c.moveTo(0, -9);
                c.lineTo(8, -5); c.lineTo(8, 1);
                c.quadraticCurveTo(8, 8, 0, 10);
                c.quadraticCurveTo(-8, 8, -8, 1);
                c.lineTo(-8, -5);
                c.closePath();
                c.fill();
                c.globalAlpha = 1;
                c.stroke();
                c.beginPath();
                c.arc(0, 0, 2, 0, Math.PI * 2);
                c.fill();
            });
            break;

        case 'buff':
        case 'intentBuff':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.4;
                c.beginPath();
                c.moveTo(0, -8);
                c.lineTo(8, 0);  c.lineTo(3, 0);
                c.lineTo(3, 8);  c.lineTo(-3, 8);
                c.lineTo(-3, 0); c.lineTo(-8, 0);
                c.closePath();
                c.fill();
            });
            break;

        case 'debuff':
        case 'intentDebuff':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.25;
                c.beginPath();
                c.arc(0, 0, 7, 0, Math.PI * 2);
                c.fill();
                c.globalAlpha = 1;
                // Eyes
                c.beginPath();
                c.arc(-3, -1, 1, 0, Math.PI * 2);
                c.arc(3, -1, 1, 0, Math.PI * 2);
                c.fill();
                // Antennas / spikes
                c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(-6, -5); c.lineTo(-9, -8);
                c.moveTo(6, -5);  c.lineTo(9, -8);
                c.moveTo(-6, 5);  c.lineTo(-9, 8);
                c.moveTo(6, 5);   c.lineTo(9, 8);
                c.moveTo(0, -7);  c.lineTo(0, -10);
                c.moveTo(0, 7);   c.lineTo(0, 10);
                c.stroke();
            });
            break;

        case 'heal':
        case 'intentHeal':
            _wrap(ctx, cx, cy, size, color, c => {
                // Heart
                c.globalAlpha = 0.35;
                c.beginPath();
                c.moveTo(0, 9);
                c.bezierCurveTo(-10, 2, -10, -7, -4, -7);
                c.bezierCurveTo(-1, -7, 0, -4, 0, -2);
                c.bezierCurveTo(0, -4, 1, -7, 4, -7);
                c.bezierCurveTo(10, -7, 10, 2, 0, 9);
                c.closePath();
                c.fill();
                c.globalAlpha = 1;
                c.stroke();
                // Plus inside
                c.strokeStyle = '#fff';
                c.lineWidth = 1.8;
                c.beginPath();
                c.moveTo(-3, 0); c.lineTo(3, 0);
                c.moveTo(0, -3); c.lineTo(0, 3);
                c.stroke();
            });
            break;

        case 'consume':
        case 'intentConsume':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.3;
                c.beginPath();
                c.moveTo(-8, -4);
                c.quadraticCurveTo(-8, -9, 0, -9);
                c.quadraticCurveTo(8, -9, 8, -4);
                c.lineTo(8, 2);
                c.quadraticCurveTo(8, 9, 0, 9);
                c.quadraticCurveTo(-8, 9, -8, 2);
                c.closePath();
                c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.5;
                c.beginPath();
                c.moveTo(-5, 0);  c.lineTo(5, 0);
                c.moveTo(-5, 3);  c.lineTo(5, 3);
                c.stroke();
            });
            break;

        case 'charge':
        case 'purge_attack_charge':
        case 'intentCharge':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.28;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(9, 8); c.lineTo(-9, 8);
                c.closePath();
                c.fill();
                c.globalAlpha = 1;
                c.stroke();
                // !
                c.lineWidth = 2.4;
                c.beginPath();
                c.moveTo(0, -3); c.lineTo(0, 3);
                c.stroke();
                c.beginPath();
                c.arc(0, 6, 1.2, 0, Math.PI * 2);
                c.fill();
            });
            break;

        case 'dispel':
        case 'intentDispel':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.4;
                c.beginPath();
                c.moveTo(0, -10);
                c.lineTo(2.2, -2.2); c.lineTo(10, 0);
                c.lineTo(2.2, 2.2);  c.lineTo(0, 10);
                c.lineTo(-2.2, 2.2); c.lineTo(-10, 0);
                c.lineTo(-2.2, -2.2);
                c.closePath();
                c.fill();
            });
            break;

        case 'reality_overwrite':
        case 'intentReality':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.15;
                c.beginPath();
                c.arc(0, 0, 9, 0, Math.PI * 2);
                c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.6;
                // Spiral
                c.beginPath();
                for (let t = 0; t <= 1; t += 0.03) {
                    const a = t * Math.PI * 3;
                    const r = t * 8;
                    const x = Math.cos(a) * r;
                    const y = Math.sin(a) * r;
                    if (t === 0) c.moveTo(x, y); else c.lineTo(x, y);
                }
                c.stroke();
                c.beginPath();
                c.arc(0, 0, 1.5, 0, Math.PI * 2);
                c.fill();
            });
            break;

        case 'summon':
        case 'summon_glitch':
        case 'summon_void':
        case 'buff_voidlings':
        case 'intentSummon':
        case 'intentGlitch':
            _wrap(ctx, cx, cy, size, color, c => {
                // Robot head
                c.globalAlpha = 0.3;
                c.beginPath();
                c.rect(-7, -4, 14, 11);
                c.fill();
                c.globalAlpha = 1;
                c.stroke();
                // Eyes
                c.beginPath();
                c.arc(-3, 1, 1.1, 0, Math.PI * 2);
                c.arc(3, 1, 1.1, 0, Math.PI * 2);
                c.fill();
                // Antenna
                c.lineWidth = 1.4;
                c.beginPath();
                c.moveTo(0, -4); c.lineTo(0, -9);
                c.moveTo(-3, -9); c.lineTo(3, -9);
                c.stroke();
            });
            break;

        default:
            // Unknown — hollow circle with question mark
            _wrap(ctx, cx, cy, size, color, c => {
                c.beginPath();
                c.arc(0, 0, 8, 0, Math.PI * 2);
                c.stroke();
                c.lineWidth = 1.8;
                c.beginPath();
                c.moveTo(-3, -3);
                c.quadraticCurveTo(-3, -6, 0, -6);
                c.quadraticCurveTo(3, -6, 3, -3);
                c.quadraticCurveTo(3, 0, 0, 1);
                c.lineTo(0, 3);
                c.stroke();
                c.beginPath();
                c.arc(0, 6, 1, 0, Math.PI * 2);
                c.fill();
            });
    }
}

// ============================================================
// EFFECT (STATUS) ICONS — under the HP bar
// ============================================================
export function drawEffectIcon(ctx, effectId, cx, cy, size, color) {
    switch (effectId) {
        case 'weak':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.2;
                c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2.2;
                c.beginPath();
                c.moveTo(0, -5); c.lineTo(0, 3);
                c.stroke();
                c.beginPath(); c.arc(0, 6, 1.1, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 0.6;
                c.lineWidth = 1.4;
                c.beginPath();
                c.moveTo(-5, 5); c.lineTo(5, -5);
                c.stroke();
            });
            break;
        case 'frail':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.25;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(8, -5); c.lineTo(8, 2);
                c.quadraticCurveTo(8, 8, 0, 10);
                c.quadraticCurveTo(-8, 8, -8, 2); c.lineTo(-8, -5);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.8;
                c.beginPath();
                c.moveTo(-3, -5); c.lineTo(0, -2);
                c.lineTo(-4, 1); c.lineTo(2, 4);
                c.lineTo(-1, 7);
                c.stroke();
            });
            break;
        case 'vulnerable':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.22;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(9, 8); c.lineTo(-9, 8);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2.2;
                c.beginPath();
                c.moveTo(0, -3); c.lineTo(0, 3);
                c.stroke();
                c.beginPath(); c.arc(0, 6, 1.2, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'overcharge':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.15;
                c.setLineDash([3, 2]);
                c.beginPath(); c.arc(0, 0, 9, 0, Math.PI * 2); c.stroke();
                c.setLineDash([]);
                c.globalAlpha = 0.6;
                c.beginPath();
                c.moveTo(1, -8); c.lineTo(-4, 1); c.lineTo(1, 1);
                c.lineTo(-1, 8); c.lineTo(5, -1); c.lineTo(1, -1);
                c.closePath();
                c.fill();
            });
            break;
        case 'constrict':
            _wrap(ctx, cx, cy, size, color, c => {
                c.lineWidth = 1.8;
                c.beginPath(); c.arc(-5, -5, 3, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.arc(5, 5, 3, 0, Math.PI * 2); c.stroke();
                c.lineWidth = 1.2;
                c.beginPath();
                c.moveTo(-3, -3); c.lineTo(-2, -2);
                c.moveTo(3, 3); c.lineTo(2, 2);
                c.stroke();
            });
            break;
        case 'voodoo':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.2;
                c.beginPath();
                c.moveTo(-7, -3);
                c.quadraticCurveTo(-7, -9, 0, -9);
                c.quadraticCurveTo(7, -9, 7, -3);
                c.lineTo(7, 3); c.lineTo(5, 3); c.lineTo(5, 7);
                c.lineTo(-5, 7); c.lineTo(-5, 3); c.lineTo(-7, 3);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.beginPath();
                c.arc(-2.5, -1, 1.2, 0, Math.PI * 2);
                c.arc(2.5, -1, 1.2, 0, Math.PI * 2);
                c.fill();
                c.lineWidth = 1.2;
                c.beginPath();
                c.moveTo(-2, 3); c.lineTo(2, 3);
                c.stroke();
            });
            break;
        case 'bleed':
        case 'poison':
            _wrap(ctx, cx, cy, size, color, c => {
                // Teardrop / droplet — pointy top, round bottom.
                c.globalAlpha = 0.25;
                c.beginPath();
                c.moveTo(0, -8);
                c.quadraticCurveTo(7, -1, 6, 4);
                c.quadraticCurveTo(4, 9, 0, 9);
                c.quadraticCurveTo(-4, 9, -6, 4);
                c.quadraticCurveTo(-7, -1, 0, -8);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.6;
                c.beginPath();
                c.moveTo(0, -8);
                c.quadraticCurveTo(7, -1, 6, 4);
                c.quadraticCurveTo(4, 9, 0, 9);
                c.quadraticCurveTo(-4, 9, -6, 4);
                c.quadraticCurveTo(-7, -1, 0, -8);
                c.stroke();
                // Inner highlight
                c.globalAlpha = 0.7;
                c.beginPath();
                c.arc(-2, 2, 1.4, 0, Math.PI * 2);
                c.fill();
            });
            break;

        // ---- Enemy elite affixes (persistent, no duration) ----
        case 'brittle':
            _wrap(ctx, cx, cy, size, color, c => {
                // Cracked shard — lightning-bolt fracture through a triangle.
                c.globalAlpha = 0.22;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(8, 8); c.lineTo(-8, 8);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2.2;
                c.beginPath();
                c.moveTo(-3, -6); c.lineTo(1, 0); c.lineTo(-2, 1); c.lineTo(3, 7);
                c.stroke();
            });
            break;
        case 'shielded':
            _wrap(ctx, cx, cy, size, color, c => {
                c.globalAlpha = 0.3;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(8, -5); c.lineTo(8, 2);
                c.quadraticCurveTo(8, 8, 0, 10);
                c.quadraticCurveTo(-8, 8, -8, 2); c.lineTo(-8, -5);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2;
                c.stroke();
                c.beginPath(); c.arc(0, 0, 2, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'second_wind':
            _wrap(ctx, cx, cy, size, color, c => {
                // Upward chevron over a heart — "revive" vibe.
                c.globalAlpha = 0.3;
                c.beginPath();
                c.moveTo(0, 9);
                c.bezierCurveTo(-9, 2, -9, -5, -4, -5);
                c.bezierCurveTo(-1, -5, 0, -3, 0, -1);
                c.bezierCurveTo(0, -3, 1, -5, 4, -5);
                c.bezierCurveTo(9, -5, 9, 2, 0, 9);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2;
                c.beginPath();
                c.moveTo(-4, -7); c.lineTo(0, -10); c.lineTo(4, -7);
                c.stroke();
            });
            break;
        case 'jammer':
            _wrap(ctx, cx, cy, size, color, c => {
                // Broken signal bars.
                c.lineWidth = 2;
                for (let k = 0; k < 4; k++) {
                    c.beginPath();
                    c.moveTo(-6 + k * 4, 7);
                    c.lineTo(-6 + k * 4, 7 - (k + 1) * 3.5);
                    c.stroke();
                }
                c.lineWidth = 1.8;
                c.globalAlpha = 0.8;
                c.beginPath();
                c.moveTo(-8, -8); c.lineTo(8, 8);
                c.stroke();
            });
            break;
        case 'reflector':
            _wrap(ctx, cx, cy, size, color, c => {
                // Bouncing arrow — incoming arrow reflects off a mirror line.
                c.lineWidth = 2;
                c.beginPath();
                c.moveTo(-8, 6); c.lineTo(0, -2); c.lineTo(8, 6);
                c.stroke();
                // Mirror line
                c.globalAlpha = 0.6;
                c.beginPath();
                c.moveTo(-9, -2); c.lineTo(9, -2);
                c.stroke();
                // Arrow head tips
                c.globalAlpha = 1;
                c.beginPath();
                c.moveTo(6, 4); c.lineTo(8, 6); c.lineTo(6, 8);
                c.stroke();
            });
            break;
        case 'phase':
            _wrap(ctx, cx, cy, size, color, c => {
                // Two overlapping circles — phase variants.
                c.lineWidth = 2;
                c.globalAlpha = 0.5;
                c.beginPath(); c.arc(-3, 0, 6, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.arc(3, 0, 6, 0, Math.PI * 2); c.stroke();
                c.globalAlpha = 1;
                c.beginPath(); c.arc(0, 0, 1.5, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'multiplier':
            _wrap(ctx, cx, cy, size, color, c => {
                // ×2 sigil.
                c.lineWidth = 2.2;
                c.beginPath();
                c.moveTo(-6, -5); c.lineTo(0, 1);
                c.moveTo(0, -5); c.lineTo(-6, 1);
                c.stroke();
                c.font = 'bold 10px Orbitron';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText('2', 4, 3);
            });
            break;
        case 'anchor':
            _wrap(ctx, cx, cy, size, color, c => {
                // Anchor silhouette.
                c.lineWidth = 2;
                c.beginPath();
                c.moveTo(0, -8); c.lineTo(0, 7);
                c.stroke();
                c.beginPath();
                c.moveTo(-4, -5); c.lineTo(4, -5);
                c.stroke();
                c.beginPath();
                c.arc(0, -8, 2, 0, Math.PI * 2);
                c.stroke();
                c.beginPath();
                c.moveTo(-6, 3);
                c.quadraticCurveTo(0, 10, 6, 3);
                c.stroke();
            });
            break;
        case 'vampiric':
            _wrap(ctx, cx, cy, size, color, c => {
                // Heart with droplet — lifesteal.
                c.globalAlpha = 0.28;
                c.beginPath();
                c.moveTo(0, 5);
                c.bezierCurveTo(-8, 0, -8, -6, -3, -6);
                c.bezierCurveTo(-1, -6, 0, -4, 0, -3);
                c.bezierCurveTo(0, -4, 1, -6, 3, -6);
                c.bezierCurveTo(8, -6, 8, 0, 0, 5);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.6;
                c.stroke();
                // Droplet
                c.beginPath();
                c.moveTo(0, 5);
                c.quadraticCurveTo(3, 7, 1.5, 9);
                c.quadraticCurveTo(0, 10, -1.5, 9);
                c.quadraticCurveTo(-3, 7, 0, 5);
                c.closePath(); c.fill();
            });
            break;

        // ---- Player derived states ----
        case 'charged':
            _wrap(ctx, cx, cy, size, color, c => {
                // Up-arrow with spark.
                c.lineWidth = 2;
                c.beginPath();
                c.moveTo(0, 7); c.lineTo(0, -5);
                c.moveTo(-5, 0); c.lineTo(0, -5); c.lineTo(5, 0);
                c.stroke();
                // Crackling dots
                c.globalAlpha = 0.7;
                c.beginPath(); c.arc(-5, -6, 1, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(5, -6, 1, 0, Math.PI * 2); c.fill();
                c.beginPath(); c.arc(0, -9, 1.2, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'armor':
            _wrap(ctx, cx, cy, size, color, c => {
                // Hex plate with inner center.
                c.globalAlpha = 0.28;
                c.beginPath();
                for (let k = 0; k < 6; k++) {
                    const a = (Math.PI / 3) * k + Math.PI / 6;
                    const x = Math.cos(a) * 8;
                    const y = Math.sin(a) * 8;
                    if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
                }
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2;
                c.stroke();
                c.beginPath(); c.arc(0, 0, 1.8, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'overclock':
            _wrap(ctx, cx, cy, size, color, c => {
                // Radiation-style reactor glyph.
                c.globalAlpha = 0.3;
                c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
                for (let k = 0; k < 3; k++) {
                    c.save();
                    c.rotate((k * Math.PI * 2) / 3);
                    c.beginPath();
                    c.moveTo(0, -3);
                    c.lineTo(-4, -8); c.lineTo(4, -8);
                    c.closePath(); c.fill();
                    c.restore();
                }
                c.beginPath(); c.arc(0, 0, 1.8, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'sig_thorns':
            _wrap(ctx, cx, cy, size, color, c => {
                // Spiked ring — thorns.
                c.lineWidth = 2;
                c.beginPath(); c.arc(0, 0, 5, 0, Math.PI * 2); c.stroke();
                for (let k = 0; k < 8; k++) {
                    const a = (k * Math.PI * 2) / 8;
                    c.beginPath();
                    c.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
                    c.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
                    c.stroke();
                }
            });
            break;
        case 'firewall':
            _wrap(ctx, cx, cy, size, color, c => {
                // Shield with circuit lines — firewall ready.
                c.globalAlpha = 0.25;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(8, -5); c.lineTo(8, 2);
                c.quadraticCurveTo(8, 8, 0, 10);
                c.quadraticCurveTo(-8, 8, -8, 2); c.lineTo(-8, -5);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 2;
                c.stroke();
                c.lineWidth = 1.4;
                c.beginPath();
                c.moveTo(-4, 0); c.lineTo(0, 0);
                c.moveTo(0, -3); c.lineTo(0, 0); c.lineTo(3, 0); c.lineTo(3, 4);
                c.stroke();
            });
            break;
        case 'blood_tier':
            _wrap(ctx, cx, cy, size, color, c => {
                // Blood droplet with notch.
                c.globalAlpha = 0.3;
                c.beginPath();
                c.moveTo(0, -9);
                c.quadraticCurveTo(7, -1, 6, 5);
                c.quadraticCurveTo(3, 10, 0, 10);
                c.quadraticCurveTo(-3, 10, -6, 5);
                c.quadraticCurveTo(-7, -1, 0, -9);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.6;
                c.stroke();
                c.globalAlpha = 0.85;
                c.beginPath(); c.arc(-1.5, 2, 1.5, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'exposed':
            _wrap(ctx, cx, cy, size, color, c => {
                // Inward arrows — taking more damage.
                c.lineWidth = 2;
                c.beginPath();
                c.moveTo(-9, 0); c.lineTo(-3, 0);
                c.moveTo(-6, -3); c.lineTo(-3, 0); c.lineTo(-6, 3);
                c.moveTo(9, 0); c.lineTo(3, 0);
                c.moveTo(6, -3); c.lineTo(3, 0); c.lineTo(6, 3);
                c.stroke();
                // Central burst
                c.globalAlpha = 0.7;
                c.beginPath(); c.arc(0, 0, 1.8, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'tact_primed':
            _wrap(ctx, cx, cy, size, color, c => {
                // Crosshair + sword tip — primed strike.
                c.globalAlpha = 0.22;
                c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.6;
                c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.stroke();
                c.beginPath();
                c.moveTo(-9, 0); c.lineTo(-5, 0);
                c.moveTo(9, 0); c.lineTo(5, 0);
                c.moveTo(0, -9); c.lineTo(0, -5);
                c.moveTo(0, 9); c.lineTo(0, 5);
                c.stroke();
                // Centre pip — locked target
                c.beginPath(); c.arc(0, 0, 1.6, 0, Math.PI * 2); c.fill();
            });
            break;
        case 'aegis_primed':
            _wrap(ctx, cx, cy, size, color, c => {
                // Shield with star spark — block primed.
                c.globalAlpha = 0.28;
                c.beginPath();
                c.moveTo(0, -9); c.lineTo(8, -5); c.lineTo(8, 2);
                c.quadraticCurveTo(8, 8, 0, 10);
                c.quadraticCurveTo(-8, 8, -8, 2); c.lineTo(-8, -5);
                c.closePath(); c.fill();
                c.globalAlpha = 1;
                c.lineWidth = 1.8;
                c.stroke();
                // Spark inside — four-point star
                c.lineWidth = 1.4;
                c.beginPath();
                c.moveTo(0, -4); c.lineTo(0, 4);
                c.moveTo(-4, 0); c.lineTo(4, 0);
                c.stroke();
                c.beginPath(); c.arc(0, 0, 1.4, 0, Math.PI * 2); c.fill();
            });
            break;

        default:
            _wrap(ctx, cx, cy, size, color, c => {
                c.lineWidth = 1.5;
                c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.stroke();
                c.beginPath(); c.arc(0, 0, 1.5, 0, Math.PI * 2); c.fill();
            });
    }
}

// Convenience combined dispatcher
export function drawBadgeIcon(ctx, name, cx, cy, size, color) {
    // Try intent first (most called), then effect, otherwise default
    if (/^intent/i.test(name) || [
        'attack','multi_attack','purge_attack','shield','buff','debuff',
        'heal','consume','charge','dispel','reality_overwrite','summon','summon_glitch'
    ].includes(name)) {
        return drawIntentIcon(ctx, name, cx, cy, size, color);
    }
    if (['weak','frail','vulnerable','overcharge','constrict','voodoo','bleed','poison'].includes(name)) {
        return drawEffectIcon(ctx, name, cx, cy, size, color);
    }
    return drawIntentIcon(ctx, name, cx, cy, size, color); // falls to default branch
}

// Sprite atlas for effect icons (perf audit P5). drawHealthBar fires the
// status loop ~10 entities × 3-5 effects per frame; baking each (id, color)
// pair to an offscreen canvas at first sight lets the hot path blit via
// drawImage instead of replaying the wrapped path commands every frame.
//
// Sprites are sized so the natural shadow halo (blur 4 inside the wrapped
// 22-px icon) doesn't clip — 32×32 backed at the device pixel ratio for
// crispness on retina mobile.
const _spriteAtlas = new Map();
const _SPR_SIZE = 32;
const _SPR_HALF = _SPR_SIZE / 2;

// 2-3 char abbreviations layered on top of effect icons for colourblind
// affordance (audit F6). Caller turns this on by passing a non-empty
// `labelMode` to getEffectSprite — when set, the sprite is baked with the
// short label burned in, so the per-frame draw path stays a single blit.
const _EFFECT_LABEL = {
    weak:        'WK',
    frail:       'FR',
    vulnerable:  'VL',
    overcharge:  'OC',
    constrict:   'CN',
    voodoo:      'VD',
    bleed:       'BL',
    poison:      'PO',
    brittle:     'BR',
    shielded:    'SH',
    second_wind: '2W',
    jammer:      'JM',
    reflector:   'RF',
    phase:       'PH',
    multiplier:  'X',
    anchor:      'AN',
    vampiric:    'VP',
    charged:     'CH',
    armor:       'AR',
    overclock:   'OV',
    sig_thorns:  'TH',
    firewall:    'FW',
    blood_tier:  'BT',
    tact_primed: 'TC',
    aegis_primed:'AG',
    exposed:     'EX'
};

function _buildEffectSprite(id, color, labelMode) {
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const c = (typeof OffscreenCanvas === 'function')
        ? (() => { try { return new OffscreenCanvas(_SPR_SIZE * dpr, _SPR_SIZE * dpr); } catch (e) { return null; } })()
        : null;
    const canvas = c || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!canvas) return null;
    if (!c) { canvas.width = _SPR_SIZE * dpr; canvas.height = _SPR_SIZE * dpr; }
    const sctx = canvas.getContext('2d');
    sctx.scale(dpr, dpr);
    drawEffectIcon(sctx, id, _SPR_HALF, _SPR_HALF, 22, color);
    // Abbreviation overlay — only painted when a colourblind palette is
    // active, so the default look is unchanged. Drawn at the bottom-right
    // of the icon with a black halo for readability against any tint.
    if (labelMode && _EFFECT_LABEL[id]) {
        const abbr = _EFFECT_LABEL[id];
        sctx.save();
        sctx.font = '700 9px "Orbitron", "Inter", system-ui, sans-serif';
        sctx.textAlign = 'right';
        sctx.textBaseline = 'bottom';
        const tx = _SPR_SIZE - 2;
        const ty = _SPR_SIZE - 1;
        // 4-pass black halo for high contrast against any tint.
        sctx.fillStyle = '#000';
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            sctx.fillText(abbr, tx + ox, ty + oy);
        }
        sctx.fillStyle = '#fff';
        sctx.fillText(abbr, tx, ty);
        sctx.restore();
    }
    return canvas;
}

export function getEffectSprite(id, color, labelMode) {
    const key = id + '|' + color + (labelMode ? '|' + labelMode : '');
    let spr = _spriteAtlas.get(key);
    if (!spr) {
        spr = _buildEffectSprite(id, color, labelMode);
        if (spr) _spriteAtlas.set(key, spr);
    }
    return spr;
}

export function clearEffectSpriteAtlas() {
    _spriteAtlas.clear();
}

// Blit-equivalent of drawEffectIcon — same call signature, but pulls from
// the cached sprite atlas instead of replaying the path commands each frame.
// Falls back to direct drawing if sprite generation isn't supported (very
// old browsers without OffscreenCanvas + missing document).
//
// `labelMode` (audit F6) — pass any truthy string when a colourblind palette
// is active so the sprite is baked with the abbreviated label overlay. The
// cache key includes the mode, so the un-labelled variant is still reused
// for default-palette players.
export function blitEffectIcon(ctx, id, cx, cy, color, labelMode) {
    const spr = getEffectSprite(id, color, labelMode);
    if (!spr) return drawEffectIcon(ctx, id, cx, cy, 22, color);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    // Source canvas is _SPR_SIZE × dpr; draw it back at logical _SPR_SIZE px,
    // centred on (cx, cy). drawImage with the explicit src/dst args avoids
    // accidental upscaling on retina screens.
    ctx.drawImage(spr, 0, 0, _SPR_SIZE * dpr, _SPR_SIZE * dpr,
                  cx - _SPR_HALF, cy - _SPR_HALF, _SPR_SIZE, _SPR_SIZE);
}
