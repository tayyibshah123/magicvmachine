import { Palette } from '../services/palette.js';

// Particle system with object pool + adaptive quality.
// Pool eliminates per-frame allocations (and the GC pauses they cause on
// mid-tier Android). Quality factor (set externally via ParticleSys.quality)
// trims spawn counts on low-end devices.
//
// Visual quality upgrade:
//  • Particles render as a pre-baked radial-gradient sprite (soft edges,
//    real anti-aliased falloff) instead of a flat arc fill.
//  • Glow-tagged particles use `lighter` composite mode so light stacks
//    additively (like real luminance).
//  • Per-particle drag, gravity, rotation, and spin for natural motion.

// Pool size set by Game.init() via ParticleSys.maxParticles based on Perf tier.
const POOL_SIZE = 384;

// One-time pre-baked radial-gradient sprite. White + alpha falloff — the
// runtime multiplies by `color` via globalCompositeOperation = 'source-in'.
let _softSprite = null;
const SOFT_SPRITE_RES = 64;
function _buildSoftSprite() {
    const c = (typeof OffscreenCanvas === 'function')
        ? new OffscreenCanvas(SOFT_SPRITE_RES, SOFT_SPRITE_RES)
        : Object.assign(document.createElement('canvas'), { width: SOFT_SPRITE_RES, height: SOFT_SPRITE_RES });
    const sctx = c.getContext('2d');
    const cx = SOFT_SPRITE_RES / 2, cy = SOFT_SPRITE_RES / 2;
    const g = sctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.85,'rgba(255,255,255,0.12)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, SOFT_SPRITE_RES, SOFT_SPRITE_RES);
    return c;
}

function _newParticle(idx) {
    return {
        _idx: idx,       // pool index — enables O(1) release
        active: false,
        x: 0, y: 0, vx: 0, vy: 0,
        life: 0, maxLife: 0,
        size: 0, color: '#fff',
        alpha: 0, text: null,
        fontSize: 48,
        // Visual-quality additions
        rotation: 0,
        spin: 0,
        drag: 0.985,
        gravity: 0,
        glow: false      // additive blending when true
    };
}

const ParticleSys = {
    pool: Array.from({ length: POOL_SIZE }, (_, i) => _newParticle(i)),
    // Stack of free pool indices. O(1) acquire = pop; O(1) release = push.
    // Replaces a linear scan that was showing up on burst spawns (shockwaves,
    // class bursts) as 380+ iterations per call on mid-tier mobile.
    _freeList: (function() {
        const a = new Array(POOL_SIZE);
        for (let i = 0; i < POOL_SIZE; i++) a[i] = POOL_SIZE - 1 - i;
        return a;
    })(),
    activeCount: 0,
    quality: 1.0, // 0.4 = low, 0.7 = medium, 1.0 = high; trims spawn counts
    maxParticles: POOL_SIZE,

    // Cached --text-scale-multiplier so createDamageText doesn't force
    // a getComputedStyle reflow per damage hit. Refreshed via
    // refreshTextScaleCache() when the setting slider fires.
    _textScaleCache: undefined,
    _refreshTextScaleCache() {
        let scale = 1;
        try {
            if (typeof document !== 'undefined' && document.documentElement) {
                const raw = getComputedStyle(document.documentElement).getPropertyValue('--text-scale-multiplier');
                const parsed = parseFloat(raw);
                if (!isNaN(parsed) && parsed > 0) scale = Math.max(0.5, Math.min(2.5, parsed));
            }
        } catch (_) { /* canvas-only env — leave scale at 1 */ }
        this._textScaleCache = scale;
    },

    // Flush the per-color tint cache. Called when Palette.setMode flips
    // so stale adapted-color canvases don't linger in memory forever.
    clearTintCache() {
        this._tintCache = {};
    },

    // Backwards-compat: code that iterates `particles` still works (returns active subset).
    // Also supports `ParticleSys.particles = []` (legacy "clear everything") by
    // releasing all pool slots — avoids "property has only a getter" errors.
    get particles() {
        return this.pool.filter(p => p.active);
    },
    set particles(_) {
        // Legacy reset — any assignment to .particles is treated as "clear all"
        this.clear();
    },

    // Release every pool slot — called on combat start / restart
    clear() {
        const fl = this._freeList;
        fl.length = 0;
        for (let i = this.pool.length - 1; i >= 0; i--) {
            this.pool[i].active = false;
            this.pool[i].text = null;
            fl.push(i);
        }
        this.activeCount = 0;
    },

    _acquire() {
        const fl = this._freeList;
        if (fl.length > 0) {
            const idx = fl.pop();
            const p = this.pool[idx];
            p.active = true;
            p.text = null;
            this.activeCount++;
            return p;
        }
        // Pool exhausted — recycle the oldest active particle (smallest life remaining).
        // Rare path; the linear scan only runs when we're already at capacity.
        let oldest = this.pool[0];
        for (let i = 1; i < this.pool.length; i++) {
            if (this.pool[i].life < oldest.life) oldest = this.pool[i];
        }
        oldest.text = null;
        return oldest;
    },

    _release(p) {
        if (p.active) {
            p.active = false;
            this.activeCount--;
            this._freeList.push(p._idx);
        }
    },

    update(dt) {
        for (let i = 0; i < this.pool.length; i++) {
            const p = this.pool[i];
            if (!p.active) continue;
            p.life -= dt;
            // Physics: apply gravity, integrate velocity with drag, update
            // position + rotation. Values are gentle so the existing scenes
            // still look recognisable — but motion now has arcs + settle.
            if (p.gravity) p.vy += p.gravity * dt * 60;
            p.vx *= p.drag;
            p.vy *= p.drag;
            p.x += p.vx;
            p.y += p.vy;
            if (p.spin) p.rotation += p.spin * dt;
            // Cubic ease-out on alpha so particles linger visually then fade fast
            const t = Math.max(0, p.life / p.maxLife);
            p.alpha = t * t * (3 - 2 * t);
            if (p.life <= 0) this._release(p);
        }
    },

    draw(ctx) {
        if (!_softSprite) _softSprite = _buildSoftSprite();

        ctx.save();
        // Two-pass render: glow particles first in additive mode (light stacks),
        // then the rest in normal compositing on top. Text particles always last
        // so they stay legible.
        let lastColor = null;

        // Pass 1 — additive glow particles (skipped when quality < 0.5 for FPS)
        if (this.quality >= 0.5) {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < this.pool.length; i++) {
                const p = this.pool[i];
                if (!p.active || p.text || !p.glow) continue;
                ctx.globalAlpha = p.alpha;
                // Adapt at draw time so CB mode changes mid-combat are
                // respected without having to re-spawn particles.
                const c = Palette.adapt(p.color);
                if (c !== lastColor) {
                    ctx.fillStyle = c;
                    lastColor = c;
                }
                this._drawSoftDot(ctx, p, c);
            }
        }

        // Pass 2 — normal particles (solid dots, sharp pixels — used for
        // ground debris, small rain, etc.)
        ctx.globalCompositeOperation = 'source-over';
        lastColor = null;
        for (let i = 0; i < this.pool.length; i++) {
            const p = this.pool[i];
            if (!p.active || p.text || p.glow) continue;
            ctx.globalAlpha = p.alpha;
            const c = Palette.adapt(p.color);
            if (c !== lastColor) {
                ctx.fillStyle = c;
                lastColor = c;
            }
            // Still use the soft sprite — even non-glow particles look better
            // with anti-aliased falloff than a hard arc.
            this._drawSoftDot(ctx, p, c);
        }

        // Pass 3 — text particles. Shared state (textAlign, strokeStyle,
        // lineJoin) is set once outside the loop. shadowBlur reset is deferred
        // to a single ctx.restore() after the loop, so we don't churn shadow
        // state when there are no text particles at all.
        ctx.globalCompositeOperation = 'source-over';
        let wroteTextState = false;
        let lastFont = null;
        let lastLineWidth = -1;
        const useShadow = this.quality >= 0.5;
        // Font-string cache: `900 ${fs}px 'Orbitron'` was being allocated
        // per text particle per frame. With 5-10 floaters active, that's
        // 300+ string allocations/sec on top of the GC pressure from
        // damage burst combat. The fontSize space is small (mostly
        // 36/40/48/56/64), so a cache hits ~100% after warmup.
        const fontCache = ParticleSys._fontCache || (ParticleSys._fontCache = {});
        for (let i = 0; i < this.pool.length; i++) {
            const p = this.pool[i];
            if (!p.active || !p.text) continue;
            if (!wroteTextState) {
                ctx.textAlign = 'center';
                ctx.strokeStyle = '#000000';
                ctx.lineJoin = 'round';
                wroteTextState = true;
            }
            ctx.globalAlpha = p.alpha;
            const fs = p.fontSize || 48;
            const font = fontCache[fs] || (fontCache[fs] = `900 ${fs}px 'Orbitron'`);
            if (font !== lastFont) { ctx.font = font; lastFont = font; }
            const lw = Math.max(4, fs / 6);
            if (lw !== lastLineWidth) { ctx.lineWidth = lw; lastLineWidth = lw; }
            ctx.strokeText(p.text, p.x, p.y);
            const adapted = Palette.adapt(p.color);
            ctx.fillStyle = adapted;
            if (useShadow) {
                ctx.shadowColor = adapted;
                ctx.shadowBlur = fs >= 56 ? 18 : fs >= 40 ? 12 : 8;
            }
            ctx.fillText(p.text, p.x, p.y);
        }
        ctx.restore();
    },

    // Soft-edge dot via the pre-baked sprite, tinted to the (possibly
    // CB-adapted) color. Callers may pass the adapted color as the 3rd arg
    // so we don't redo the Palette.adapt lookup per-particle in draw().
    _drawSoftDot(ctx, p, adaptedColor) {
        const tint = this._getTintedSprite(adaptedColor || Palette.adapt(p.color));
        const s = p.size * 4; // sprite is the "soft halo"; size ≈ dot radius
        if (p.rotation) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.drawImage(tint, -s / 2, -s / 2, s, s);
            ctx.restore();
        } else {
            ctx.drawImage(tint, p.x - s / 2, p.y - s / 2, s, s);
        }
    },

    _tintCache: {},
    _getTintedSprite(color) {
        if (this._tintCache[color]) return this._tintCache[color];
        if (!_softSprite) _softSprite = _buildSoftSprite();
        const c = document.createElement('canvas');
        c.width = SOFT_SPRITE_RES; c.height = SOFT_SPRITE_RES;
        const cc = c.getContext('2d');
        cc.drawImage(_softSprite, 0, 0);
        cc.globalCompositeOperation = 'source-in';
        cc.fillStyle = color;
        cc.fillRect(0, 0, SOFT_SPRITE_RES, SOFT_SPRITE_RES);
        this._tintCache[color] = c;
        return c;
    },

    createExplosion(x, y, count, color) {
        // Quality scales spawn count down on low-end devices
        const c = Math.max(2, Math.round(count * this.quality));
        for (let i = 0; i < c; i++) {
            const p = this._acquire();
            p.x = x; p.y = y;
            p.glow = true;
            p.drag = 0.93 + Math.random() * 0.04;
            p.gravity = 0.08;
            p.rotation = Math.random() * Math.PI * 2;
            p.spin = (Math.random() - 0.5) * 8;
            p.vx = (Math.random() - 0.5) * 12;
            p.vy = (Math.random() - 0.5) * 12;
            p.life = 0.6; p.maxLife = 0.6;
            p.size = Math.random() * 5 + 2;
            p.color = color; p.alpha = 1;
        }
    },

    // Nearby recent floating texts get staggered by a longer gap so a burst
    // of simultaneous status labels (OVERFLOW, BLOOD TIER UP, COMBO, …)
    // cascades one at a time instead of piling into an unreadable stack.
    // Only labels landing in the same region (~220 px) and within a short
    // window (~2000 ms) are delayed — labels on opposite sides of the screen
    // still fire instantly. Damage numbers pass `immediate: true` since
    // they must sync with the impact beat; the stagger is for status text.
    // Queued texts also receive a small vertical offset per stack-index so
    // they don't visually overlap while the earlier one is still floating up.
    _recentFloatingTexts: [],
    _FT_NEAR: 220,        // px radius for "same region"
    _FT_STAGGER: 420,     // ms gap between successive nearby texts
    _FT_WINDOW: 2000,     // ms before a recent entry is pruned
    _FT_Y_STEP: 36,       // px downward offset per stack index
    createFloatingText(x, y, text, color, opts) {
        if (opts && opts.immediate) {
            this._spawnFloatingText(x, y, text, color, opts);
            return;
        }
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        // Prune stale entries so the list stays tiny.
        const fresh = [];
        for (let i = 0; i < this._recentFloatingTexts.length; i++) {
            if (now - this._recentFloatingTexts[i].time < this._FT_WINDOW) {
                fresh.push(this._recentFloatingTexts[i]);
            }
        }
        this._recentFloatingTexts = fresh;
        // Count how many nearby recent entries we already have so the new one
        // knows its stack index (for vertical offset + staggered fire time).
        let latest = 0;
        let stackIndex = 0;
        const nearSq = this._FT_NEAR * this._FT_NEAR;
        for (let i = 0; i < fresh.length; i++) {
            const r = fresh[i];
            const dx = r.x - x, dy = r.y - y;
            if (dx * dx + dy * dy < nearSq) {
                stackIndex++;
                if (r.time > latest) latest = r.time;
            }
        }
        const delay = latest > 0 ? Math.max(0, latest + this._FT_STAGGER - now) : 0;
        const fireAt = now + delay;
        const stackY = y + stackIndex * this._FT_Y_STEP;
        this._recentFloatingTexts.push({ x, y: stackY, time: fireAt });
        if (delay === 0) {
            this._spawnFloatingText(x, stackY, text, color, opts);
        } else {
            setTimeout(() => this._spawnFloatingText(x, stackY, text, color, opts), delay);
        }
    },
    _spawnFloatingText(x, y, text, color, opts) {
        const p = this._acquire();
        p.x = x; p.y = y;
        p.vx = 0; p.vy = (opts && opts.vy != null) ? opts.vy : -1.5;
        p.life = (opts && opts.life) || 1.5;
        p.maxLife = p.life;
        p.size = 0;
        p.color = color;
        p.text = text;
        p.alpha = 1;
        p.fontSize = (opts && opts.fontSize) || 48;
    },

    // Tiered damage text. Picks font size by damage magnitude and color by
    // source attribution. `sourceKind` is one of 'player' | 'minion' | 'enemy'
    // (undefined falls back to the legacy tier palette).
    // Returns the tier key so callers can pair it with shake/haptic/sound.
    createDamageText(x, y, amount, isPlayerTarget, sourceKind) {
        let tier = 'solid';
        let color = '#ff3333';
        let fontSize = 48;
        let vy = -1.5;
        if (amount <= 0) return 'zero';
        if (amount < 10)      { tier = 'chip';         color = '#e6e6e6'; fontSize = 30; }
        else if (amount < 30) { tier = 'solid';        color = '#ff3333'; fontSize = 44; }
        else if (amount < 100){ tier = 'heavy';        color = '#ff1100'; fontSize = 64; vy = -2.0; }
        else                  { tier = 'catastrophic'; color = '#ffdd33'; fontSize = 84; vy = -2.4; }
        if (isPlayerTarget && tier === 'solid') color = '#ff5566';

        // Source attribution — legibility in 3-enemy combat. Catastrophic
        // keeps its gold flash because that's a readable "big moment"
        // regardless of source.
        if (sourceKind && tier !== 'catastrophic') {
            if (sourceKind === 'player') color = '#ffffff';        // your hits: neutral white
            else if (sourceKind === 'minion') color = '#6fe8ff';    // ally hits: cyan
            else if (sourceKind === 'enemy') color = tier === 'chip' ? '#ff7777' : '#ff3333';
        }
        // Respect the Accessibility text-scale slider so players with
        // larger-text preference also get larger damage numbers. The
        // multiplier is cached on ParticleSys (refreshed by the setting
        // hook) so burst combat doesn't force a getComputedStyle reflow
        // per hit — that was showing up as 15–50ms hitches on 3-hit multis
        // and Blade Storm AoEs.
        let scale = this._textScaleCache;
        if (scale === undefined) {
            this._refreshTextScaleCache();
            scale = this._textScaleCache;
        }
        // Per-setting damage-text size override (small / medium / large) —
        // lets players tune damage floaters independently of the global UI
        // text scale (e.g. big UI + small damage numbers for cleaner feel).
        if (typeof window !== 'undefined' && window.Game) {
            const size = window.Game.damageNumberSize;
            if (size === 'small')      scale *= 0.72;
            else if (size === 'large') scale *= 1.3;
        }
        fontSize = Math.round(fontSize * scale);
        // Damage numbers must land on the same frame as the hit VFX —
        // bypass the status-text stagger queue so they stay tied to impact.
        this.createFloatingText(x, y - 60, "-" + amount, color, { fontSize, vy, life: 1.6, immediate: true });
        return tier;
    },

    createShockwave(x, y, color, count = 40) {
        const c = Math.max(8, Math.round(count * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = (Math.PI * 2 / c) * i;
            const speed = 9 + Math.random() * 3;
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = 0.8; p.maxLife = 0.8;
            p.size = 3 + Math.random() * 2;
            p.color = color; p.alpha = 1;
            p.glow = true;
            p.drag = 0.92;
            p.gravity = 0;
            p.rotation = angle;
            p.spin = 0;
        }
    },

    createTrail(x, y, color, ttl = 0.35) {
        // Suppressed during isolated preview renders (character-select detail
        // overlay) — drawEntity emits ambient trails using world coordinates,
        // which would otherwise pollute the main combat pool.
        if (this.suppress) return;
        // Trails are skipped under heavy load
        if (this.quality < 0.5 && this.activeCount > POOL_SIZE * 0.7) return;
        const p = this._acquire();
        p.x = x + (Math.random() - 0.5) * 6;
        p.y = y + (Math.random() - 0.5) * 6;
        p.vx = (Math.random() - 0.5) * 0.4;
        p.vy = -0.2 + Math.random() * -0.4;
        p.life = ttl; p.maxLife = ttl;
        p.size = 2 + Math.random() * 2;
        p.color = color; p.alpha = 1;
        p.glow = true;
        p.drag = 0.95;
        p.gravity = 0;
        p.rotation = 0;
        p.spin = 0;
    },

    // Tapered-line SPARK burst — for sword-hit feel. Uses a separate effect
    // type so callers can opt in. Particles streak linearly then fade.
    createSparks(x, y, color, count = 8) {
        const c = Math.max(3, Math.round(count * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 6 + Math.random() * 6;
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = 0.35 + Math.random() * 0.2;
            p.maxLife = p.life;
            p.size = 1.5 + Math.random() * 1.2;
            p.color = color;
            p.alpha = 1;
            p.glow = true;
            p.drag = 0.87;
            p.gravity = 0.12;
            p.rotation = angle;
            p.spin = 0;
        }
    },

    // ─── CLASS-SPECIFIC DICE VFX ─── Each has a distinct visual signature.

    // Tactician: geometric cyan shards radiating in a precise ring
    createTacticianBurst(x, y) {
        const c = Math.max(4, Math.round(12 * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = (Math.PI * 2 / c) * i;
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * 7;
            p.vy = Math.sin(angle) * 7;
            p.life = 0.5; p.maxLife = 0.5;
            p.size = 3; p.color = '#00f3ff'; p.alpha = 1;
            p.glow = true; p.drag = 0.90; p.gravity = 0;
            p.rotation = angle; p.spin = 0;
        }
        // Central data-pulse ring
        for (let i = 0; i < 3; i++) {
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = 0; p.vy = 0;
            p.life = 0.35 + i * 0.12; p.maxLife = p.life;
            p.size = 8 + i * 5; p.color = '#00d4e6'; p.alpha = 0.7;
            p.glow = true; p.drag = 1; p.gravity = 0;
            p.rotation = 0; p.spin = 2;
        }
    },

    // Arcanist: purple arcane spirals with sparkle trail
    createArcanistBurst(x, y) {
        const c = Math.max(6, Math.round(16 * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = (Math.PI * 2 / c) * i + Math.sin(i * 0.8) * 0.4;
            const speed = 5 + Math.random() * 4;
            const p = this._acquire();
            p.x = x + Math.cos(angle) * 8; p.y = y + Math.sin(angle) * 8;
            p.vx = Math.cos(angle + 0.6) * speed;
            p.vy = Math.sin(angle + 0.6) * speed;
            p.life = 0.7; p.maxLife = 0.7;
            p.size = 2 + Math.random() * 3;
            p.color = i % 3 === 0 ? '#d070ff' : '#bc13fe'; p.alpha = 1;
            p.glow = true; p.drag = 0.92; p.gravity = -0.03;
            p.rotation = Math.random() * 6; p.spin = (Math.random() - 0.5) * 10;
        }
    },

    // Bloodstalker: red droplets with downward drip + splatter
    createBloodstalkerBurst(x, y) {
        const c = Math.max(5, Math.round(14 * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
            const speed = 4 + Math.random() * 6;
            const p = this._acquire();
            p.x = x + (Math.random() - 0.5) * 10; p.y = y;
            p.vx = Math.cos(angle) * speed * 0.5;
            p.vy = Math.sin(angle) * speed;
            p.life = 0.6; p.maxLife = 0.6;
            p.size = 2 + Math.random() * 3;
            p.color = i % 4 === 0 ? '#cc0000' : '#ff0000'; p.alpha = 1;
            p.glow = true; p.drag = 0.94; p.gravity = 0.25;
            p.rotation = 0; p.spin = 0;
        }
    },

    // Annihilator: explosive orange sparks flying outward with heat shimmer
    createAnnihilatorBurst(x, y) {
        const c = Math.max(6, Math.round(18 * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 8 + Math.random() * 8;
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = 0.4 + Math.random() * 0.3; p.maxLife = p.life;
            p.size = 2 + Math.random() * 4;
            p.color = ['#ff8800', '#ff6600', '#ff4400', '#ffcc00'][i % 4]; p.alpha = 1;
            p.glow = true; p.drag = 0.88; p.gravity = 0.15;
            p.rotation = angle; p.spin = (Math.random() - 0.5) * 12;
        }
        // Central flash
        const flash = this._acquire();
        flash.x = x; flash.y = y; flash.vx = 0; flash.vy = 0;
        flash.life = 0.2; flash.maxLife = 0.2;
        flash.size = 14; flash.color = '#ffffff'; flash.alpha = 1;
        flash.glow = true; flash.drag = 1; flash.gravity = 0;
        flash.rotation = 0; flash.spin = 0;
    },

    // Sentinel: white/silver metallic flashes — sharp, angular
    createSentinelBurst(x, y) {
        const c = Math.max(5, Math.round(10 * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = (Math.PI * 2 / c) * i;
            const speed = 5 + Math.random() * 3;
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed;
            p.life = 0.45; p.maxLife = 0.45;
            p.size = 3 + Math.random() * 2;
            p.color = i % 2 === 0 ? '#ffffff' : '#c0c0c0'; p.alpha = 1;
            p.glow = true; p.drag = 0.91; p.gravity = 0;
            p.rotation = angle; p.spin = 0;
        }
        // Shield shimmer ring
        for (let i = 0; i < 6; i++) {
            const ang = (Math.PI * 2 / 6) * i;
            const p = this._acquire();
            p.x = x + Math.cos(ang) * 20; p.y = y + Math.sin(ang) * 20;
            p.vx = Math.cos(ang) * 2; p.vy = Math.sin(ang) * 2;
            p.life = 0.6; p.maxLife = 0.6;
            p.size = 2; p.color = '#e0e0e0'; p.alpha = 0.8;
            p.glow = true; p.drag = 0.96; p.gravity = 0;
            p.rotation = 0; p.spin = 3;
        }
    },

    // Summoner: green nature leaves spiraling outward + pollen dust
    createSummonerBurst(x, y) {
        const c = Math.max(5, Math.round(12 * this.quality));
        for (let i = 0; i < c; i++) {
            const angle = (Math.PI * 2 / c) * i + Math.random() * 0.3;
            const speed = 3 + Math.random() * 4;
            const p = this._acquire();
            p.x = x; p.y = y;
            p.vx = Math.cos(angle) * speed;
            p.vy = Math.sin(angle) * speed - 1;
            p.life = 0.8; p.maxLife = 0.8;
            p.size = 3 + Math.random() * 3;
            p.color = i % 3 === 0 ? '#00ff66' : '#00ff99'; p.alpha = 1;
            p.glow = true; p.drag = 0.93; p.gravity = -0.05;
            p.rotation = Math.random() * 6; p.spin = (Math.random() - 0.5) * 6;
        }
        // Pollen dust
        for (let i = 0; i < 5; i++) {
            const p = this._acquire();
            p.x = x + (Math.random() - 0.5) * 30; p.y = y + (Math.random() - 0.5) * 20;
            p.vx = (Math.random() - 0.5) * 1; p.vy = -0.5 - Math.random();
            p.life = 1.0; p.maxLife = 1.0;
            p.size = 1.5; p.color = '#ffd700'; p.alpha = 0.6;
            p.glow = true; p.drag = 0.98; p.gravity = -0.02;
            p.rotation = 0; p.spin = 0;
        }
    },

    // Dispatch: call the right class burst by classId
    createClassBurst(x, y, classId) {
        const fn = {
            tactician:    'createTacticianBurst',
            arcanist:     'createArcanistBurst',
            bloodstalker: 'createBloodstalkerBurst',
            annihilator:  'createAnnihilatorBurst',
            sentinel:     'createSentinelBurst',
            summoner:     'createSummonerBurst'
        }[classId];
        if (fn && this[fn]) this[fn](x, y);
    }
};

export { ParticleSys };
