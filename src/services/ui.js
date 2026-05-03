/* UI v2 — interaction helpers
 *
 * Tiny runtime layer for the v2 component library. Pure CSS handles
 * the visual states; this file handles the few cases CSS can't reach:
 *
 *   1. Slider fill — sets `--_val` on .ui-slider so the gradient
 *      progress matches the input value.
 *   2. Tab indicator — measures the active tab's offset/width and
 *      writes `--_indicator-x` / `--_indicator-w` on the .ui-tabs
 *      container so the underline animates between tabs.
 *   3. Button press ripple — captures the press point in CSS
 *      custom properties so the radial gradient on .ui-btn::after
 *      radiates from the actual contact point.
 *
 * Auto-attaches to existing `.ui-*` markup on init() and uses event
 * delegation so nodes added later (rerenders) get the same behaviour
 * for free. Re-entrant; calling init() twice is a no-op after the
 * first attach.
 */

const UI = {
    _initialised: false,

    init() {
        if (this._initialised) return;
        this._initialised = true;

        // Slider fill — listen at the document level for input events
        // on .ui-slider input elements. Sets --_val on the parent so
        // the CSS gradient updates immediately. Also wires existing
        // inputs on first paint.
        document.addEventListener('input', (e) => {
            const el = e.target;
            if (!el || !el.matches || !el.matches('.ui-slider input[type="range"]')) return;
            this._writeSliderValue(el);
        }, true);
        // First-paint sweep so inputs already in the DOM have their
        // fill rendered before the user touches them.
        document.querySelectorAll('.ui-slider input[type="range"]').forEach(el => {
            this._writeSliderValue(el);
        });

        // Button press ripple — capture the press point so the
        // .ui-btn::after radial gradient radiates from the actual
        // touch position. Listens at capture phase so we beat any
        // child handler that calls stopPropagation.
        document.addEventListener('pointerdown', (e) => {
            const btn = e.target && e.target.closest && e.target.closest('.ui-btn');
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width)  * 100;
            const py = ((e.clientY - r.top)  / r.height) * 100;
            btn.style.setProperty('--_press-x', `${px.toFixed(1)}%`);
            btn.style.setProperty('--_press-y', `${py.toFixed(1)}%`);
        }, true);
    },

    /* Compute and write the slider's --_val (0-100). The CSS
     * `linear-gradient(... calc(var(--_val) * 1%), ...)` reads this
     * to position the brand-coloured fill against the dim track. */
    _writeSliderValue(input) {
        const min = parseFloat(input.min || '0');
        const max = parseFloat(input.max || '100');
        const val = parseFloat(input.value || '0');
        const span = max - min;
        const pct = span > 0 ? ((val - min) / span) * 100 : 0;
        const slider = input.closest('.ui-slider');
        if (slider) slider.style.setProperty('--_val', pct.toFixed(2));
        // Update the value chip if present (next sibling of input).
        const chip = slider && slider.querySelector('.ui-slider-value');
        if (chip) chip.textContent = String(val);
    },

    /* Tabs — wire keyboard + click navigation and the sliding
     * indicator. Call this after the tab DOM is rendered. Idempotent;
     * calling on the same container multiple times is safe. */
    initTabs(container, opts = {}) {
        if (!container) return;
        if (container._uiTabsBound) {
            this.refreshTabIndicator(container);
            return;
        }
        container._uiTabsBound = true;
        const onClick = opts.onChange || null;
        container.addEventListener('click', (e) => {
            const tab = e.target && e.target.closest && e.target.closest('.ui-tab');
            if (!tab || !container.contains(tab)) return;
            this.setActiveTab(container, tab);
            if (onClick) onClick(tab.dataset.tab || tab.textContent.trim(), tab);
        });
        // Initial indicator positioning.
        this.refreshTabIndicator(container);
        // Re-measure on resize so the indicator stays aligned at
        // breakpoints / orientation changes.
        const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(() => this.refreshTabIndicator(container)) : null;
        if (ro) ro.observe(container);
    },

    /* Set a specific tab as active. */
    setActiveTab(container, tabEl) {
        if (!container || !tabEl) return;
        container.querySelectorAll('.ui-tab').forEach(t => t.classList.toggle('is-active', t === tabEl));
        this.refreshTabIndicator(container);
    },

    /* Recompute the indicator position from the currently-active tab. */
    refreshTabIndicator(container) {
        if (!container) return;
        const active = container.querySelector('.ui-tab.is-active');
        if (!active) {
            container.style.setProperty('--_indicator-w', '0px');
            return;
        }
        const cRect = container.getBoundingClientRect();
        const aRect = active.getBoundingClientRect();
        container.style.setProperty('--_indicator-x', `${aRect.left - cRect.left}px`);
        container.style.setProperty('--_indicator-w', `${aRect.width}px`);
    },

    /* Modal helpers — manage the .is-open class with a forced reflow
     * so the entry transition fires cleanly even on rapid open/close. */
    openModal(backdropEl) {
        if (!backdropEl) return;
        backdropEl.classList.remove('is-open');
        // eslint-disable-next-line no-unused-expressions
        backdropEl.offsetHeight;  // force reflow
        requestAnimationFrame(() => backdropEl.classList.add('is-open'));
    },
    closeModal(backdropEl) {
        if (!backdropEl) return;
        backdropEl.classList.remove('is-open');
    },

    /* Tooltip helpers — show/hide at coordinates. */
    showTooltip(tooltipEl, x, y) {
        if (!tooltipEl) return;
        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
        tooltipEl.classList.add('is-open');
    },
    hideTooltip(tooltipEl) {
        if (!tooltipEl) return;
        tooltipEl.classList.remove('is-open');
    }
};

export { UI };
