// End-of-combat recap card — 3s glass dialog with portrait-vs-portrait
// header, total damage dealt vs taken, biggest hit, and three highlight
// chips (combos triggered, parries, lifesteal). Plays before the reward
// screen so the player gets a moment to appreciate the win.
//
// Day 4 — Part 31.2.
//
// Returns a Promise that resolves when the card auto-dismisses or the
// player taps it. Hands off cleanly to the reward screen.

let host = null;

const HOLD_MS = 2800;
const IN_MS   = 240;
const OUT_MS  = 200;
const REDUCE_HOLD_MS = 2000;

function reducedMotion() {
    return typeof matchMedia === 'function'
        && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureHost() {
    if (host) return host;
    const el = document.createElement('div');
    el.className = 'combat-recap hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Combat recap');
    el.innerHTML = `
        <div class="combat-recap-card">
            <div class="combat-recap-portraits">
                <div class="combat-recap-portrait combat-recap-player">
                    <span class="combat-recap-pname" data-bind="player">YOU</span>
                </div>
                <div class="combat-recap-vs">VS</div>
                <div class="combat-recap-portrait combat-recap-enemy">
                    <span class="combat-recap-pname" data-bind="enemy">ENEMY</span>
                </div>
            </div>
            <div class="combat-recap-row combat-recap-row-totals">
                <div class="combat-recap-stat combat-recap-dealt">
                    <span class="combat-recap-stat-label">DEALT</span>
                    <span class="combat-recap-stat-val" data-bind="dealt">0</span>
                </div>
                <div class="combat-recap-stat combat-recap-taken">
                    <span class="combat-recap-stat-label">TAKEN</span>
                    <span class="combat-recap-stat-val" data-bind="taken">0</span>
                </div>
            </div>
            <div class="combat-recap-row combat-recap-row-highlight">
                <span class="combat-recap-highlight-label">BIGGEST HIT</span>
                <span class="combat-recap-highlight-val" data-bind="biggestHit">0</span>
            </div>
            <div class="combat-recap-chips" data-bind="chips"></div>
            <button class="combat-recap-skip" type="button" data-action="skip">CONTINUE</button>
        </div>
    `;
    document.body.appendChild(el);
    host = el;
    return el;
}

function buildChips(snap) {
    const chips = [];
    if (snap.combos && snap.combos.length) {
        // Group identical combos by name with ×N tail. Keeps card narrow.
        const counts = new Map();
        snap.combos.forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
        const top = Array.from(counts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);
        top.forEach(([name, n]) => {
            chips.push({
                cls: 'recap-chip-combo',
                label: n > 1 ? `${name} ×${n}` : name
            });
        });
    }
    if (snap.parries > 0) {
        chips.push({
            cls: 'recap-chip-parry',
            label: snap.parries === 1 ? 'PERFECT PARRY' : `${snap.parries}× PARRIES`
        });
    }
    if (snap.lifesteal > 0) {
        chips.push({
            cls: 'recap-chip-life',
            label: `LIFESTEAL +${snap.lifesteal}`
        });
    }
    // Cap at 3 chips so the card height stays predictable on narrow phones.
    return chips.slice(0, 3);
}

export const CombatRecap = {
    show(snap, opts) {
        if (!snap) return Promise.resolve();
        const playerName = (opts && opts.playerName) || 'YOU';
        const enemyName  = (opts && opts.enemyName)  || 'ENEMY';
        const el = ensureHost();
        const setText = (key, txt) => {
            const n = el.querySelector(`[data-bind="${key}"]`);
            if (n) n.textContent = txt;
        };
        setText('player', playerName.toUpperCase());
        setText('enemy', enemyName.toUpperCase());
        setText('dealt', String(snap.dealt || 0));
        setText('taken', String(snap.taken || 0));
        setText('biggestHit', String(snap.biggestHit || 0));

        const chipsEl = el.querySelector('[data-bind="chips"]');
        if (chipsEl) {
            const chips = buildChips(snap);
            chipsEl.innerHTML = chips.map(c =>
                `<span class="combat-recap-chip ${c.cls}">${c.label}</span>`
            ).join('');
            chipsEl.classList.toggle('hidden', chips.length === 0);
        }

        return new Promise(resolve => {
            let settled = false;
            let holdTimer = 0;
            let outTimer = 0;
            const dismiss = () => {
                if (settled) return;
                settled = true;
                if (holdTimer) clearTimeout(holdTimer);
                el.classList.remove('active');
                el.classList.add('leaving');
                outTimer = setTimeout(() => {
                    el.classList.add('hidden');
                    el.classList.remove('leaving');
                    resolve();
                }, OUT_MS);
            };

            const skipBtn = el.querySelector('[data-action="skip"]');
            if (skipBtn) {
                skipBtn.onclick = (e) => { e.stopPropagation(); dismiss(); };
            }
            // Tap-anywhere-to-dismiss as a backstop. Skip button is the
            // visible CTA; the wider tap area is muscle-memory insurance.
            const onTap = (e) => {
                if (e.target && e.target.tagName === 'BUTTON') return;
                dismiss();
            };
            el.addEventListener('click', onTap, { once: true });

            el.classList.remove('hidden', 'leaving');
            // eslint-disable-next-line no-unused-expressions
            void el.offsetHeight;
            el.classList.add('active');
            if (reducedMotion()) el.classList.add('reduced-motion');
            else el.classList.remove('reduced-motion');

            const hold = reducedMotion() ? REDUCE_HOLD_MS : HOLD_MS;
            holdTimer = setTimeout(dismiss, hold);
        });
    }
};
