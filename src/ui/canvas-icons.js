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
