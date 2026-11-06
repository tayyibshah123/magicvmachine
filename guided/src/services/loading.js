// Lightweight loading overlay. Attach to any async transition >300ms so the
// player never sees a frozen-blank screen.
//
//    Loading.show('Preparing Sector 3');
//    doBigWork().finally(() => Loading.hide());

let _root = null;
let _visibleSince = 0;
let _timeoutTimer = 0;
const MIN_VISIBLE_MS = 300;
const STALL_TIMEOUT_MS = 10000;   // Surface a retry option if we're still loading 10s later.

function _ensureRoot() {
    if (_root) return _root;
    const host = document.getElementById('game-container') || document.body;
    const el = document.createElement('div');
    el.className = 'loading-overlay';
    el.innerHTML = `
        <div class="loading-spinner" aria-hidden="true"></div>
        <div class="loading-label">// LOADING</div>
        <button class="loading-retry btn secondary" type="button" hidden>RETRY</button>
    `;
    host.appendChild(el);
    _root = el;
    return el;
}

function _clearTimeoutTimer() {
    if (_timeoutTimer) {
        clearTimeout(_timeoutTimer);
        _timeoutTimer = 0;
    }
}

export const Loading = {
    show(label, opts) {
        const root = _ensureRoot();
        if (label) {
            const lbl = root.querySelector('.loading-label');
            if (lbl) lbl.textContent = '// ' + String(label).toUpperCase();
        }
        // Reset retry UI from any prior stall.
        const retryBtn = root.querySelector('.loading-retry');
        if (retryBtn) {
            retryBtn.hidden = true;
            retryBtn.onclick = null;
        }
        _visibleSince = performance.now();
        root.classList.add('active');
        root.classList.remove('stalled');

        _clearTimeoutTimer();
        const onTimeout = (opts && typeof opts.onTimeout === 'function') ? opts.onTimeout : null;
        const timeoutMs = (opts && typeof opts.timeoutMs === 'number') ? opts.timeoutMs : STALL_TIMEOUT_MS;
        _timeoutTimer = setTimeout(() => {
            if (!_root || !_root.classList.contains('active')) return;
            _root.classList.add('stalled');
            const lbl = _root.querySelector('.loading-label');
            if (lbl) lbl.textContent = '// STILL WORKING. TAP RETRY IF STUCK';
            const btn = _root.querySelector('.loading-retry');
            if (btn) {
                btn.hidden = false;
                btn.onclick = () => {
                    // Default behavior: hide + reload page, unless caller handled it.
                    if (onTimeout) onTimeout();
                    else { Loading.hide(); try { window.location.reload(); } catch (e) {} }
                };
            }
        }, timeoutMs);
    },

    hide() {
        _clearTimeoutTimer();
        if (!_root) return;
        const elapsed = performance.now() - _visibleSince;
        const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
        setTimeout(() => {
            if (_root) {
                _root.classList.remove('active');
                _root.classList.remove('stalled');
                const btn = _root.querySelector('.loading-retry');
                if (btn) { btn.hidden = true; btn.onclick = null; }
            }
        }, wait);
    },

    wrap(label, promise, opts) {
        this.show(label, opts);
        return Promise.resolve(promise).finally(() => this.hide());
    }
};
