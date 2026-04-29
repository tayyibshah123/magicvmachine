// Dynamic difficulty assist (§3.3).
// After 3 consecutive losses to the Sector-1 boss, gently lower boss HP by
// 10% on the next attempt. The nudge is VISIBLE (an "adaptive" icon on the
// boss HP bar) — never silent, because invisible difficulty changes erode
// hardcore players' trust. Disabled entirely on any Ascension > 0.
//
// State lives in localStorage so it survives reloads.

const KEY_LOSSES = 'mvm_assist_losses_sector';
const KEY_ACTIVE = 'mvm_assist_active';

// localStorage helpers — Safari Private mode + Capacitor edge cases
// can throw on read OR write. Default to "no assist active" on failure.
const _read = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
const _write = (key, val) => { try { localStorage.setItem(key, val); } catch (_) {} };
const _remove = (key) => { try { localStorage.removeItem(key); } catch (_) {} };

export const Assist = {
    recordLoss(sector) {
        const key = KEY_LOSSES + sector;
        const v = (parseInt(_read(key), 10) || 0) + 1;
        _write(key, String(v));
        const wasActive = _read(KEY_ACTIVE + sector) === '1';
        if (v >= 3) {
            _write(KEY_ACTIVE + sector, '1');
            if (!wasActive) this._showActivationToast(sector);
        }
        return v;
    },

    // Transparency toast shown the moment adaptive mode turns on. The user
    // must know it's active — hidden difficulty changes erode trust.
    _showActivationToast(sector) {
        try {
            let host = document.getElementById('assist-toast');
            if (!host) {
                host = document.createElement('div');
                host.id = 'assist-toast';
                host.className = 'assist-toast hidden';
                document.body.appendChild(host);
            }
            host.innerHTML = `
                <div class="assist-toast-title">ADAPTIVE MODE ENABLED</div>
                <div class="assist-toast-body">
                    Sector ${sector} boss HP reduced by 10% on your next attempt.<br>
                    <span class="assist-toast-hint">Disable in Settings → Gameplay.</span>
                </div>
                <button class="assist-toast-dismiss" aria-label="Dismiss">×</button>
            `;
            host.classList.remove('hidden');
            requestAnimationFrame(() => host.classList.add('active'));
            const close = () => {
                host.classList.remove('active');
                setTimeout(() => host.classList.add('hidden'), 320);
            };
            host.querySelector('.assist-toast-dismiss').addEventListener('click', close);
            setTimeout(close, 9000);
        } catch (e) { /* swallow */ }
    },

    recordWin(sector) {
        _remove(KEY_LOSSES + sector);
        _remove(KEY_ACTIVE + sector);
    },

    // Returns the HP multiplier to apply to bosses for the given sector, or
    // 1.0 if no assist is active.
    hpMultiplier(sector, ascension) {
        if (ascension && ascension > 0) return 1.0;
        if (_read(KEY_ACTIVE + sector) === '1') return 0.9;
        return 1.0;
    },

    isActive(sector, ascension) {
        if (ascension && ascension > 0) return false;
        return _read(KEY_ACTIVE + sector) === '1';
    }
};
