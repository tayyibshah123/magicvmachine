// Intel Codex modal. Replaces the tooltip that the Cipher grid
// previously used (TooltipMgr.show) with a dedicated reading
// experience. Reads the structured entries from
// src/data/intel-codex.js and renders them with format-specific
// styling (cipher fragments get redacted blocks, audio transcripts
// get monospace + timestamp highlighting, schematics get a parts
// list, etc.).
//
// Entry points:
//   IntelModal.init()         once on boot. Wires DOM listeners.
//   IntelModal.open(id)       open by 1-based file number.
//   IntelModal.close()        close.
//   IntelModal.next() / prev  step through unlocked entries.
//
// Hash routing: a URL fragment of the form #/intel/<id> opens that
// entry on page load. Closing the modal strips the fragment so the
// back button returns the player to wherever they were.

import { INTEL_ENTRIES, INTEL_FORMATS, getIntelEntry } from '../data/intel-codex.js';
import { AudioMgr } from '../audio.js';

let host = null;
let card = null;
let currentId = null;
let unlockedSet = new Set(); // ids of entries the player has decrypted
let touchStartX = 0;
let touchStartY = 0;
let touchActive = false;

// Unlocked-set is rebuilt every time the modal opens, so the prev/next
// nav reflects the latest player state without needing a subscription
// on Game state changes.
function refreshUnlockedSet() {
    const G = (typeof window !== 'undefined') ? window.Game : null;
    unlockedSet = new Set();
    if (!G) return;
    // Standard breach unlocks. Stored as 0-based indices into the
    // legacy LORE_DATABASE; entry ids are 1-based, so add 1.
    if (Array.isArray(G.unlockedLore)) {
        G.unlockedLore.forEach(idx => unlockedSet.add(idx + 1));
    }
    // Hidden entries unlock through Game.unlockedHiddenLore (added by
    // C7.6). Until that lands, hidden ids are simply absent from the
    // set so prev/next skips them in the navigation order.
    if (Array.isArray(G.unlockedHiddenLore)) {
        G.unlockedHiddenLore.forEach(id => unlockedSet.add(id));
    }
}

function navigableIds() {
    // Entries the player can step through with prev/next. Ordered by
    // chapter then by id so the read flow matches the cipher grid.
    return INTEL_ENTRIES
        .filter(e => unlockedSet.has(e.id))
        .map(e => e.id);
}

function setText(selector, value) {
    const el = card && card.querySelector(selector);
    if (el) el.textContent = value;
}

function renderRedactedText(text) {
    // Replace [REDACTED] tokens with span elements so CSS can style
    // them as solid blocks. Other escapes pass through untouched.
    // The token can also carry an optional line count, e.g.
    // [REDACTED:3] means three lines of redaction. The renderer
    // ignores the count for now and renders a single block; the
    // count is preserved as a data attribute for any future polish.
    const out = document.createDocumentFragment();
    const re = /\[REDACTED(?::(\d+))?\]/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
            out.appendChild(document.createTextNode(text.slice(last, m.index)));
        }
        const span = document.createElement('span');
        span.className = 'intel-redacted';
        if (m[1]) span.dataset.lines = m[1];
        out.appendChild(span);
        last = m.index + m[0].length;
    }
    if (last < text.length) {
        out.appendChild(document.createTextNode(text.slice(last)));
    }
    return out;
}

function renderAudioLine(line) {
    // Audio transcripts use [HH:MM] and [STATIC]/[BOOM] tokens. The
    // timestamp gets its own class so it can be coloured. Speaker
    // labels (e.g. "Speaker A:") get bolded by capturing them at the
    // start of the line. Anything inside [SQUARE BRACKETS] that
    // isn't a timestamp is treated as an environment descriptor.
    const div = document.createElement('p');
    div.className = 'intel-audio-line';
    const tsRe = /^\[(\d{1,2}:\d{2})\]\s*/;
    const tsMatch = line.match(tsRe);
    if (tsMatch) {
        const tsSpan = document.createElement('span');
        tsSpan.className = 'intel-audio-ts';
        tsSpan.textContent = '[' + tsMatch[1] + ']';
        div.appendChild(tsSpan);
        div.appendChild(document.createTextNode(' '));
        line = line.slice(tsMatch[0].length);
    }
    // Speaker label "X:" at start, single capital word.
    const spkRe = /^([A-Z][A-Z\s]{0,20}):\s*/;
    const spkMatch = line.match(spkRe);
    if (spkMatch) {
        const spkSpan = document.createElement('span');
        spkSpan.className = 'intel-audio-speaker';
        spkSpan.textContent = spkMatch[1] + ':';
        div.appendChild(spkSpan);
        div.appendChild(document.createTextNode(' '));
        line = line.slice(spkMatch[0].length);
    }
    // Inline environment descriptors like [STATIC].
    const envRe = /\[([A-Z][A-Z\s]+)\]/g;
    let last = 0;
    let m;
    while ((m = envRe.exec(line)) !== null) {
        if (m.index > last) {
            div.appendChild(document.createTextNode(line.slice(last, m.index)));
        }
        const env = document.createElement('span');
        env.className = 'intel-audio-env';
        env.textContent = '[' + m[1] + ']';
        div.appendChild(env);
        last = m.index + m[0].length;
    }
    if (last < line.length) {
        div.appendChild(document.createTextNode(line.slice(last)));
    }
    return div;
}

function renderBody(entry, isFirstOpen) {
    const bodyEl = card.querySelector('[data-bind="body"]');
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    let className = 'intel-modal-body intel-body-' + entry.format;
    // v1.9.7 polish: typewriter cascade on first open of an entry.
    // Each paragraph fades and slides in with a stagger so the body
    // reads like a teletype rolling out a recovered file. Skipped
    // on subsequent opens (the player has already read this) and
    // when the user has prefers-reduced-motion enabled.
    const reduced = (typeof document !== 'undefined' && document.body && document.body.classList.contains('reduced-motion'))
        || (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const animate = isFirstOpen && !reduced;
    if (animate) className += ' intel-typewriter';
    bodyEl.className = className;
    if (!Array.isArray(entry.body) || entry.body.length === 0) {
        const p = document.createElement('p');
        p.className = 'intel-body-pending';
        p.textContent = 'Body pending. Decryption ongoing.';
        bodyEl.appendChild(p);
        return;
    }
    entry.body.forEach((para, i) => {
        let p;
        if (entry.format === 'audio_transcript') {
            p = renderAudioLine(para);
        } else if (entry.format === 'cipher_fragment') {
            p = document.createElement('p');
            p.appendChild(renderRedactedText(para));
        } else {
            p = document.createElement('p');
            p.textContent = para;
        }
        if (animate) {
            // Stagger by paragraph index. Cap delay so a long body
            // doesn't take forever to start; the tail still cascades
            // once the early paragraphs land.
            const delay = Math.min(i * 80, 1600);
            p.style.animationDelay = delay + 'ms';
        }
        bodyEl.appendChild(p);
    });
    if (!bodyEl.dataset.shownAt) {
        bodyEl.dataset.shownAt = String(Date.now());
    }
}

function markRead(id) {
    // v1.9.7. First open of an entry marks it as read and persists
    // the new read-set to localStorage. Subsequent opens are silent.
    // Returns true on the first open (used to gate the typewriter
    // animation).
    const G = (typeof window !== 'undefined') ? window.Game : null;
    if (!G) return true;
    if (!Array.isArray(G.readLore)) G.readLore = [];
    if (G.readLore.includes(id)) return false;
    G.readLore.push(id);
    try { localStorage.setItem('mvm_read_lore', JSON.stringify(G.readLore)); } catch (_) {}
    // Refresh the unread badge if the cipher screen is currently
    // mounted. The render call is idempotent and cheap.
    if (typeof G._renderIntelCipher === 'function') {
        try { G._renderIntelCipher(); } catch (_) {}
    }
    return true;
}

function renderEntry(id) {
    const entry = getIntelEntry(id);
    if (!entry || !card) return false;
    const fileNum = String(entry.id).padStart(2, '0');
    setText('[data-bind="filenum"]', '// FILE ' + fileNum);
    setText('[data-bind="state"]', unlockedSet.has(entry.id) ? 'DECRYPTED' : 'LOCKED');
    setText('[data-bind="classification"]', entry.classification);
    setText('[data-bind="decryptDate"]', entry.decryptDate);
    const formatLabel = (INTEL_FORMATS[entry.format] && INTEL_FORMATS[entry.format].label) || entry.format;
    setText('[data-bind="format"]', formatLabel);
    setText('[data-bind="title"]', entry.shortTitle);
    setText('[data-bind="legacyEpigram"]', entry.legacyEpigram);
    const isFirstOpen = markRead(entry.id);
    renderBody(entry, isFirstOpen);
    // Progress label, e.g. "3 of 18".
    const ids = navigableIds();
    const pos = ids.indexOf(entry.id);
    setText('[data-bind="progress"]', (pos + 1) + ' of ' + ids.length);
    // Chapter accent on the card so the modal feels chapter-coloured.
    card.dataset.chapter = entry.chapter;
    card.dataset.format = entry.format;
    // Toggle prev/next buttons based on position.
    const prevBtn = card.querySelector('.intel-modal-prev');
    const nextBtn = card.querySelector('.intel-modal-next');
    if (prevBtn) prevBtn.disabled = pos <= 0;
    if (nextBtn) nextBtn.disabled = pos >= ids.length - 1;
    currentId = entry.id;
    return true;
}

function syncHash(id) {
    if (typeof history === 'undefined' || !history.replaceState) return;
    const newHash = id ? '#/intel/' + id : '';
    if (newHash !== window.location.hash) {
        try {
            history.replaceState(null, '', window.location.pathname + window.location.search + newHash);
        } catch (_) { /* ignore environments where replaceState throws */ }
    }
}

function onKey(e) {
    if (!host || host.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
}

function onTouchStart(e) {
    if (!host || host.classList.contains('hidden')) return;
    if (!e.touches || e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchActive = true;
}

function onTouchEnd(e) {
    if (!touchActive) return;
    touchActive = false;
    if (!e.changedTouches || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    // Horizontal swipe with at least 60px and dominantly horizontal.
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        if (dx < 0) next();
        else        prev();
    }
}

export function open(id) {
    refreshUnlockedSet();
    host = host || document.getElementById('intel-modal');
    card = card || (host && host.querySelector('.intel-modal-card'));
    if (!host || !card) return;
    if (!renderEntry(id)) return;
    host.classList.remove('hidden');
    host.setAttribute('aria-hidden', 'false');
    syncHash(id);
    AudioMgr && AudioMgr.playSound && AudioMgr.playSound('click', { volume: 0.6 });
}

export function close() {
    if (!host) return;
    host.classList.add('hidden');
    host.setAttribute('aria-hidden', 'true');
    currentId = null;
    syncHash(null);
}

export function next() {
    const ids = navigableIds();
    if (!ids.length) return;
    const i = ids.indexOf(currentId);
    if (i < 0 || i >= ids.length - 1) return;
    open(ids[i + 1]);
}

export function prev() {
    const ids = navigableIds();
    if (!ids.length) return;
    const i = ids.indexOf(currentId);
    if (i <= 0) return;
    open(ids[i - 1]);
}

function onClick(e) {
    const action = e.target && e.target.dataset && e.target.dataset.action;
    if (!action) return;
    if (action === 'close') close();
    else if (action === 'prev') prev();
    else if (action === 'next') next();
    else if (action === 'extract') {
        // Polish target for C7.6. For now, copy the legacy epigram to
        // clipboard as a one-line shareable extract.
        const entry = getIntelEntry(currentId);
        if (entry && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(entry.legacyEpigram).catch(() => {});
            // Lightweight feedback: temporarily relabel the button.
            const btn = card.querySelector('[data-action="extract"]');
            if (btn) {
                const prevText = btn.textContent;
                btn.textContent = '★ COPIED';
                setTimeout(() => { if (btn) btn.textContent = prevText; }, 1200);
            }
        }
    }
}

export function init() {
    if (typeof document === 'undefined') return;
    host = document.getElementById('intel-modal');
    if (!host) return;
    card = host.querySelector('.intel-modal-card');
    if (!card) return;
    host.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    card.addEventListener('touchstart', onTouchStart, { passive: true });
    card.addEventListener('touchend', onTouchEnd, { passive: true });
    // Hash route on first load.
    if (typeof window !== 'undefined' && window.location && window.location.hash) {
        const m = window.location.hash.match(/^#\/intel\/(\d+)$/);
        if (m) {
            const id = parseInt(m[1], 10);
            // Defer one tick so Game.unlockedLore is restored from
            // localStorage before we check unlock state.
            setTimeout(() => open(id), 0);
        }
    }
}

export const IntelModal = { init, open, close, next, prev };
