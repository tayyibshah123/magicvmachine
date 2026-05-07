// End-of-turn digest — top-centre 2s glass floater showing what just
// happened on this turn. Triggered after the enemy phase completes so
// the player has a clean readback before the next turn starts.
//
// Day 4 — Part 31.1.
//
// Pure DOM, single host element reused per fire. Tap-to-skip. Respects
// `prefers-reduced-motion`: the slide is replaced with a hold-only fade.

let host = null;
let dismissTimer = 0;
let removeTimer = 0;

const HOLD_MS    = 2000;   // visible window
const FADE_MS    = 220;    // in/out fade
const REDUCE_MS  = 1600;   // shorter hold under prefers-reduced-motion (no
                           // slide animation, so total airtime drops)

function reducedMotion() {
    return typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Audit 2026-05: gate the digest on perf-low devices. The full panel
// build + slide-in animation costs 8-12ms per turn on Snapdragon-7
// class hardware. On perf-low we either skip it entirely or render a
// stripped one-line variant, depending on the OPT_LOW_BEHAVIOR flag.
function perfLow() {
    return typeof document !== 'undefined'
        && document.body
        && document.body.classList.contains('perf-low');
}

function ensureHost() {
    if (host) return host;
    const el = document.createElement('div');
    el.className = 'turn-digest hidden';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
        <span class="turn-digest-pip" data-bind="turn">T --</span>
        <span class="turn-digest-stat turn-digest-dealt"   data-bind="dealt">DEALT 0</span>
        <span class="turn-digest-stat turn-digest-taken"   data-bind="taken">TAKEN 0</span>
        <span class="turn-digest-stat turn-digest-dice"    data-bind="dice">DICE 0</span>
        <span class="turn-digest-stat turn-digest-extra"   data-bind="extra"></span>
    `;
    // Tap anywhere on the floater to skip out early.
    el.addEventListener('click', () => TurnDigest.dismiss());
    document.body.appendChild(el);
    host = el;
    return el;
}

export const TurnDigest = {
    show(stats, opts) {
        if (!stats) return;
        // Audit 2026-05 — perf-low devices skip the turn digest entirely
        // since the panel build + slide costs ~8-12ms/turn. Players on
        // low tier already opted into a stripped experience via the
        // perf-low class; consistency wins over a stat readback.
        if (perfLow()) return;
        // Skip on the very first turn (turn === 1) — there's no "what
        // happened" worth surfacing if nothing's dealt or taken yet,
        // and the sector intro is already a competing top-centre card.
        if (stats.turn <= 1 && !stats.dealt && !stats.taken) return;
        const el = ensureHost();
        // Re-arm — clear any pending teardown from a prior fire.
        if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = 0; }
        if (removeTimer)  { clearTimeout(removeTimer);  removeTimer  = 0; }

        const setText = (key, txt) => {
            const n = el.querySelector(`[data-bind="${key}"]`);
            if (n) n.textContent = txt;
        };
        setText('turn',  `T${stats.turn}`);
        setText('dealt', `DEALT ${stats.dealt}`);
        setText('taken', `TAKEN ${stats.taken}`);
        setText('dice',  `DICE ${stats.diceUsed}`);
        const extraEl = el.querySelector('[data-bind="extra"]');
        if (extraEl) {
            // Optional class-metric tag (e.g. "+3 BLOOD POOL"). Hidden when
            // empty so the floater stays compact.
            const extra = (opts && opts.extra) ? String(opts.extra) : '';
            extraEl.textContent = extra;
            extraEl.classList.toggle('hidden', !extra);
        }
        // Dim "TAKEN 0" so a clean turn doesn't visually claim equal
        // weight as a hit-heavy one. Same for dealt.
        el.querySelector('.turn-digest-dealt').classList.toggle('faded', stats.dealt === 0);
        el.querySelector('.turn-digest-taken').classList.toggle('faded', stats.taken === 0);

        el.classList.remove('hidden', 'leaving');
        // Force reflow so the entry transition fires every time.
        // eslint-disable-next-line no-unused-expressions
        void el.offsetHeight;
        el.classList.add('active');
        if (reducedMotion()) el.classList.add('reduced-motion');
        else el.classList.remove('reduced-motion');

        const hold = reducedMotion() ? REDUCE_MS : HOLD_MS;
        dismissTimer = setTimeout(() => this.dismiss(), hold);
    },
    dismiss() {
        if (!host) return;
        if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = 0; }
        host.classList.remove('active');
        host.classList.add('leaving');
        removeTimer = setTimeout(() => {
            if (!host) return;
            host.classList.add('hidden');
            host.classList.remove('leaving');
        }, FADE_MS);
    }
};
