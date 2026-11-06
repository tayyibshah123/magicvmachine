/**
 * Vfx — non-combat ambient particle / beam / spark layer.
 *
 * Mount model: each non-combat screen gets its own vfx-host injected
 * as its first child on first activation. Per-screen mounts mean the
 * VFX paints ABOVE the screen's solid CSS background (so it's
 * visible) but BEHIND the screen content (which paints later in DOM
 * order). The host is position: absolute + inset: 0 so it fills the
 * screen's bounding box without escaping into other screens.
 *
 * Combat screens (STATE.COMBAT, TUTORIAL_COMBAT, BREAKOUT) never get
 * a vfx-host — they have their own canvas-driven VFX and the screen-
 * level layer would compete for paint budget.
 *
 * Lifecycle
 *   - Game.init() calls `Vfx.init()` once. Currently a no-op (kept
 *     for parity with other services).
 *   - Game.changeState's activate() helper calls
 *     `Vfx.setPresetForScreen(screenId)` which lazily injects the
 *     host into the screen on first activation and retints it on
 *     subsequent activations.
 *   - Combat states explicitly skip activate(), so no host is built.
 *
 * Each screen's host is built once and reused — repeat activations
 * are O(1) (data-preset attribute change). DOM never gets garbage-
 * collected mid-session.
 */
const Vfx = {
    _initialized: false,
    _hosts: new Map(), // screenId → host element

    /** Screen → preset map. Combat screens absent (no mount). */
    PRESET_BY_SCREEN: {
        'screen-start':        'purple',
        'screen-meta':         'purple',
        'screen-intel':        'purple',
        'screen-achievements': 'purple',
        'screen-char-select':  'blue',
        'screen-tutorial':     'blue',
        'screen-codex':        'blue',
        'screen-map':          'blue',
        'screen-event':        'blue',
        'screen-story':        'blue',
        'screen-ending':       'blue',
        'screen-shop':         'gold',
        'screen-reward':       'gold',
        'screen-victory':      'gold',
        'screen-combat-win':   'gold',
        'screen-rest':         'green',
        'screen-gameover':     'pink',
        'screen-hex':          'pink',
        'screen-pact':         'pink'
    },

    /** Idempotent boot hook. */
    init() {
        if (this._initialized) return;
        this._initialized = true;
    },

    /**
     * Apply the VFX preset for `screenId`.
     *   - If the screen is a non-combat preset target, lazily mount
     *     the host into the screen and set its data-preset.
     *   - If the screen is unknown / combat, do nothing (no host
     *     exists for combat screens).
     */
    setPresetForScreen(screenId) {
        const preset = this.PRESET_BY_SCREEN[screenId];
        if (!preset) return;

        const screen = document.getElementById(screenId);
        if (!screen) return;

        let host = this._hosts.get(screenId);
        // Defensive: if the screen was rebuilt (story flow rerenders
        // its content) the cached host may be detached. Re-mount.
        if (!host || !screen.contains(host)) {
            host = this._buildHost(preset);
            // First child so it paints above the bg but below content.
            screen.insertBefore(host, screen.firstChild);
            this._hosts.set(screenId, host);
            // Defer the enter-fade so the initial paint commits
            // opacity: 0 first; otherwise the transition is coalesced
            // and the layer appears instantly.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                host.classList.add('vfx-host--enter');
            }));
        } else {
            // Already mounted — just retint.
            if (host.dataset.preset !== preset) host.dataset.preset = preset;
        }
    },

    /** Tear down all hosts (rare: shutdown / hot-reload). */
    detach() {
        this._hosts.forEach(host => {
            if (host && host.parentNode) host.parentNode.removeChild(host);
        });
        this._hosts.clear();
        this._initialized = false;
    },

    /* ── factory ────────────────────────────────────────────── */

    _buildHost(preset) {
        const host = document.createElement('div');
        host.className = 'vfx-host';
        host.setAttribute('aria-hidden', 'true');
        host.dataset.preset = preset;

        host.appendChild(this._makeAurora());
        host.appendChild(this._makeGrid());
        host.appendChild(this._makeRunes(7));
        host.appendChild(this._makeParticles(28));
        host.appendChild(this._makeEmbers(14));
        host.appendChild(this._makeBeams(3));
        host.appendChild(this._makeRain(6));
        host.appendChild(this._makeScanline());
        host.appendChild(this._makeCorners());
        return host;
    },

    _makeAurora() {
        const el = document.createElement('div');
        el.className = 'vfx-aurora';
        return el;
    },

    _makeGrid() {
        const el = document.createElement('div');
        el.className = 'vfx-grid';
        return el;
    },

    _makeScanline() {
        const el = document.createElement('div');
        el.className = 'vfx-scanline';
        return el;
    },

    _makeParticles(n) {
        const wrap = document.createElement('div');
        wrap.className = 'vfx-particles';
        const tones = [
            'var(--vfx-accent)',
            'var(--vfx-accent-2)',
            '#ffffff'
        ];
        for (let i = 0; i < n; i++) {
            const sp = document.createElement('span');
            sp.className = 'vfx-particle';
            const x      = (Math.random() * 100).toFixed(1) + '%';
            const drift  = (Math.random() * 80 - 40).toFixed(0) + 'px';
            const dur    = (10 + Math.random() * 14).toFixed(1) + 's';
            const delay  = (-Math.random() * 18).toFixed(1) + 's';
            const size   = (2 + Math.random() * 5).toFixed(1) + 'px';
            const alpha  = (0.55 + Math.random() * 0.4).toFixed(2);
            const tone   = tones[i % tones.length];
            sp.style.cssText =
                `--vfx-x:${x};--vfx-drift:${drift};--vfx-dur:${dur};` +
                `--vfx-delay:${delay};--vfx-size:${size};` +
                `--vfx-alpha:${alpha};--vfx-tone:${tone};`;
            wrap.appendChild(sp);
        }
        return wrap;
    },

    _makeEmbers(n) {
        const wrap = document.createElement('div');
        wrap.className = 'vfx-embers';
        for (let i = 0; i < n; i++) {
            const sp = document.createElement('span');
            sp.className = 'vfx-ember';
            const ex     = (Math.random() * 100).toFixed(1) + '%';
            const drift  = (Math.random() * 100 - 50).toFixed(0) + 'px';
            const dur    = (8 + Math.random() * 9).toFixed(1) + 's';
            const delay  = (-Math.random() * 12).toFixed(1) + 's';
            sp.style.cssText =
                `--vfx-ex:${ex};--vfx-edrift:${drift};` +
                `--vfx-edur:${dur};--vfx-edelay:${delay};`;
            wrap.appendChild(sp);
        }
        return wrap;
    },

    _makeBeams(n) {
        const wrap = document.createElement('div');
        wrap.className = 'vfx-beams';
        for (let i = 0; i < n; i++) {
            const sp = document.createElement('span');
            sp.className = 'vfx-beam';
            const bx     = (Math.random() * 80 + 10).toFixed(1) + '%';
            const bw     = (140 + Math.random() * 160).toFixed(0) + 'px';
            const dur    = (7 + Math.random() * 6).toFixed(1) + 's';
            const delay  = (-Math.random() * 8).toFixed(1) + 's';
            sp.style.cssText =
                `--vfx-bx:${bx};--vfx-bw:${bw};` +
                `--vfx-bdur:${dur};--vfx-bdelay:${delay};`;
            wrap.appendChild(sp);
        }
        return wrap;
    },

    _makeRain(n) {
        const wrap = document.createElement('div');
        wrap.className = 'vfx-rain';
        // Two columns of falling glyphs, one near each edge.
        const xs = [];
        for (let i = 0; i < Math.ceil(n / 2); i++) xs.push((1 + i * 4).toFixed(1) + '%');
        for (let i = 0; i < Math.floor(n / 2); i++) xs.push((96 - i * 4).toFixed(1) + '%');
        const glyphs = [
            '0\n1\n0\n1\n0\nx',
            'F\nE\n4\nD\nC\nA',
            'A\nB\nC\nD\nE\nF',
            '7\n3\n9\n1\nB\n2',
            '0\n0\n1\nF\nA\n5',
            'C\n0\nD\nE\n5\n0'
        ];
        xs.forEach((rx, i) => {
            const sp = document.createElement('span');
            const dur    = (10 + Math.random() * 8).toFixed(1) + 's';
            const delay  = (-Math.random() * 12).toFixed(1) + 's';
            sp.textContent = glyphs[i % glyphs.length];
            sp.style.cssText =
                `--vfx-rx:${rx};--vfx-rdur:${dur};--vfx-rdelay:${delay};`;
            wrap.appendChild(sp);
        });
        return wrap;
    },

    _makeRunes(n) {
        const wrap = document.createElement('div');
        wrap.className = 'vfx-runes';
        const symbols = ['⌬', '⌖', '⏣', '◇', '◈', '⬢', '✦', '✧'];
        for (let i = 0; i < n; i++) {
            const sp = document.createElement('span');
            sp.textContent = symbols[i % symbols.length];
            const gx     = (15 + Math.random() * 70).toFixed(1) + '%';
            const gy     = (15 + Math.random() * 70).toFixed(1) + '%';
            const gr     = (Math.random() * 60 - 30).toFixed(0) + 'deg';
            const dur    = (16 + Math.random() * 10).toFixed(1) + 's';
            const delay  = (-Math.random() * 18).toFixed(1) + 's';
            sp.style.cssText =
                `--vfx-gx:${gx};--vfx-gy:${gy};--vfx-gr:${gr};` +
                `--vfx-gdur:${dur};--vfx-gdelay:${delay};`;
            wrap.appendChild(sp);
        }
        return wrap;
    },

    _makeCorners() {
        const wrap = document.createElement('div');
        wrap.className = 'vfx-corners';
        ['tl', 'tr', 'bl', 'br'].forEach(pos => {
            const sp = document.createElement('span');
            sp.className = `vfx-corner vfx-corner--${pos}`;
            wrap.appendChild(sp);
        });
        return wrap;
    }
};

export { Vfx };
export default Vfx;
