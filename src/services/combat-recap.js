// End-of-combat recap card — portrait-vs-portrait header, dealt/taken
// totals, biggest hit, combat-quality bonus tally, and Sparks call-out.
// Fires after the COMBAT_WIN dwell, before the reward screen.
//
// Day 4 — Part 31.2.
// Updated: dismiss is manual-only (Continue button) so the player can
// read the breakdown at their own pace; bonus tally + Spark surfacing
// added so wins feel earned, especially against elites/bosses.
//
// Returns a Promise that resolves only when Continue is tapped.

let host = null;

const IN_MS  = 240;
const OUT_MS = 200;

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
            <div class="combat-recap-fx-burst" aria-hidden="true"></div>
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
            <div class="combat-recap-tally" data-bind="tally"></div>
            <div class="combat-recap-spark" data-bind="spark"></div>
            <div class="combat-recap-file" data-bind="file"></div>
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
    return chips.slice(0, 3);
}

// Render the frag breakdown — base kill payout plus any bonus lines
// supplied by winCombat (full health, flawless, parries, quick kill).
function renderTally(opts) {
    const tier = opts && opts.tier;
    const baseFrag = (opts && opts.baseFrag) || 0;
    const bonuses = (opts && opts.bonuses) || [];
    const totalFrag = (opts && opts.totalFrag) || baseFrag;
    const baseLabel = tier === 'boss'  ? 'BOSS DEFEATED'
                    : tier === 'elite' ? 'ELITE DEFEATED'
                    : 'ENEMY DEFEATED';
    const lines = [];
    if (baseFrag > 0) {
        lines.push(`<div class="recap-tally-line recap-tally-base"><span class="recap-tally-label">${baseLabel}</span><span class="recap-tally-val">+${baseFrag}</span></div>`);
    }
    bonuses.filter(b => b && b.frag > 0).forEach(b => {
        lines.push(`<div class="recap-tally-line recap-tally-bonus"><span class="recap-tally-label">${b.label}</span><span class="recap-tally-val">+${b.frag}</span></div>`);
    });
    if (lines.length) {
        lines.push(`<div class="recap-tally-total"><span class="recap-tally-label">TOTAL FRAG</span><span class="recap-tally-val">+${totalFrag}</span></div>`);
    }
    return lines.join('');
}

// Spark call-out — high-value reward earned from skilled play (boss kills,
// flawless elites). Rendered as a separate pulsing gold panel so the
// player can't miss the moment they earn one.
function renderSpark(opts) {
    const sparks = (opts && opts.bonusSparks) || 0;
    if (sparks <= 0) return '';
    const reason = (opts && opts.sparkReason) || 'BONUS';
    const plural = sparks === 1 ? 'SPARK' : 'SPARKS';
    return `
        <div class="combat-recap-spark-inner">
            <span class="recap-spark-icon">✦</span>
            <span class="recap-spark-amt">+${sparks} ${plural}</span>
            <span class="recap-spark-reason">${reason}</span>
        </div>
    `;
}

// Encrypted-file pill — fires when the kill dropped an intel file.
// Mirrors the spark pill so file drops feel like an event of equal
// weight (they unlock lore + sparks via Hex Breach). Magenta palette
// to read distinctly from the gold spark pill.
function renderEncryptedFile(opts) {
    if (!opts || !opts.droppedFile) return '';
    const reason = (opts.droppedFileReason || 'LUCKY DROP').toUpperCase();
    return `
        <div class="combat-recap-file-inner">
            <span class="recap-file-icon">⌬</span>
            <span class="recap-file-amt">+1 ENCRYPTED FILE</span>
            <span class="recap-file-reason">${reason}</span>
        </div>
    `;
}

export const CombatRecap = {
    show(snap, opts) {
        if (!snap) return Promise.resolve();
        const playerName = (opts && opts.playerName) || 'YOU';
        const enemyName  = (opts && opts.enemyName)  || 'ENEMY';
        const tier       = (opts && opts.tier)       || 'normal';
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

        const tallyEl = el.querySelector('[data-bind="tally"]');
        if (tallyEl) {
            tallyEl.innerHTML = renderTally(opts);
            tallyEl.classList.toggle('hidden', !tallyEl.innerHTML);
        }

        const sparkEl = el.querySelector('[data-bind="spark"]');
        if (sparkEl) {
            const sparkHtml = renderSpark(opts);
            sparkEl.innerHTML = sparkHtml;
            sparkEl.classList.toggle('hidden', !sparkHtml);
        }
        const fileEl = el.querySelector('[data-bind="file"]');
        if (fileEl) {
            const fileHtml = renderEncryptedFile(opts);
            fileEl.innerHTML = fileHtml;
            fileEl.classList.toggle('hidden', !fileHtml);
        }

        // Tier-aware glow class — bosses get the gold treatment, elites
        // a violet shimmer, normal mooks the default cyan.
        const card = el.querySelector('.combat-recap-card');
        if (card) {
            card.classList.remove('tier-normal', 'tier-elite', 'tier-boss');
            card.classList.add('tier-' + tier);
        }

        return new Promise(resolve => {
            let settled = false;
            let outTimer = 0;
            const dismiss = () => {
                if (settled) return;
                settled = true;
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
            // No tap-anywhere or auto-dismiss — the player must tap
            // Continue. Lets them read the bonus breakdown at their own
            // pace and prevents accidental skips on touch input.

            el.classList.remove('hidden', 'leaving');
            // eslint-disable-next-line no-unused-expressions
            void el.offsetHeight;
            el.classList.add('active');
            if (reducedMotion()) el.classList.add('reduced-motion');
            else el.classList.remove('reduced-motion');
        });
    }
};
