// Combat log service.
// Captures structured combat events, exposes a bounded ring buffer, and
// renders a drop-down panel that the player can open mid-combat to verify
// what just happened. Essential for theorycraft trust.

const MAX_ENTRIES = 30;

function formatEntry(e) {
    switch (e.type) {
        case 'damage': {
            const who = e.targetName || 'Target';
            const by  = e.sourceName ? ` (from ${e.sourceName})` : '';
            const tier = e.tier && e.tier !== 'solid' ? ` [${e.tier.toUpperCase()}]` : '';
            return `${who} took <b class="log-dmg">${e.amount}</b>${tier}${by}`;
        }
        case 'heal':
            return `${e.targetName || 'Target'} healed <b class="log-heal">${e.amount}</b>`;
        case 'shield':
            return `${e.targetName || 'Target'} gained <b class="log-shield">${e.amount}</b> shield`;
        case 'effect_applied':
            return `${e.targetName || 'Target'} → <b class="log-effect">${e.effect}</b>${e.val ? ` (${e.val})` : ''}`;
        case 'death':
            return `<b class="log-death">${e.name}</b> defeated`;
        case 'phase':
            return `<b class="log-phase">${e.text}</b>`;
        case 'note':
            return `<i class="log-note">${e.text}</i>`;
        default:
            return `<span class="log-unknown">${JSON.stringify(e)}</span>`;
    }
}

export const CombatLog = {
    _entries: [],
    _filter: 'all',
    _root: null,

    push(e) {
        this._entries.push({ ...e, t: Date.now() });
        if (this._entries.length > MAX_ENTRIES) this._entries.shift();
        if (this._root && !this._root.classList.contains('hidden')) this._render();
    },

    clear() {
        this._entries = [];
        if (this._root) this._render();
    },

    _matchesFilter(e) {
        if (this._filter === 'all') return true;
        if (this._filter === 'damage') return e.type === 'damage';
        if (this._filter === 'heals')  return e.type === 'heal' || e.type === 'shield';
        if (this._filter === 'effects')return e.type === 'effect_applied';
        if (this._filter === 'deaths') return e.type === 'death';
        return true;
    },

    open() {
        this._ensureRoot();
        this._root.classList.remove('hidden');
        requestAnimationFrame(() => this._root.classList.add('open'));
        this._render();
    },

    close() {
        if (!this._root) return;
        this._root.classList.remove('open');
        setTimeout(() => this._root.classList.add('hidden'), 180);
    },

    toggle() {
        this._ensureRoot();
        if (this._root.classList.contains('hidden')) this.open();
        else this.close();
    },

    _ensureRoot() {
        if (this._root) return;
        const host = document.getElementById('game-container') || document.body;
        const el = document.createElement('div');
        el.className = 'combat-log-overlay hidden';
        el.innerHTML = `
            <div class="combat-log-panel">
                <div class="combat-log-header">
                    <div class="combat-log-title">COMBAT LOG</div>
                    <button class="combat-log-close" aria-label="Close">×</button>
                </div>
                <div class="combat-log-filters">
                    <button data-filter="all" class="active">ALL</button>
                    <button data-filter="damage">DMG</button>
                    <button data-filter="heals">HEAL</button>
                    <button data-filter="effects">FX</button>
                    <button data-filter="deaths">DEATHS</button>
                </div>
                <div class="combat-log-list"></div>
            </div>
        `;
        host.appendChild(el);
        el.addEventListener('click', (evt) => {
            if (evt.target === el) this.close();
            else if (evt.target.classList.contains('combat-log-close')) this.close();
            else if (evt.target.dataset.filter) {
                this._filter = evt.target.dataset.filter;
                el.querySelectorAll('.combat-log-filters button')
                    .forEach(b => b.classList.toggle('active', b.dataset.filter === this._filter));
                this._render();
            }
        });
        this._root = el;
    },

    _render() {
        const list = this._root.querySelector('.combat-log-list');
        if (!list) return;
        const filtered = this._entries.filter(e => this._matchesFilter(e));
        if (filtered.length === 0) {
            list.innerHTML = '<div class="combat-log-empty">No events yet.</div>';
            return;
        }
        // Most-recent first so the player sees what just happened.
        list.innerHTML = filtered.slice().reverse().map(e => `<div class="combat-log-entry">${formatEntry(e)}</div>`).join('');
    }
};
