// Presentation only. Learning policy and persistence stay with the caller.
let closeLibrary = null;
let closeRules = null;

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
}

export function decorateClassSelection(game, profile = {}) {
    const grid = document.getElementById('char-grid');
    if (!grid) return;
    const guided = profile.mode === 'guided';
    const introductory = guided && !profile.coreComplete;
    let expanded = !!(profile.showAllOperators || game && game._showAllLearningOperators);
    const cards = [...grid.querySelectorAll('.char-card')];
    const recommended = new Set(['tactician', 'sentinel']);
    for (const card of cards) {
        card.querySelector('.learning-recommended-badge')?.remove();
        const recommendedHere = introductory && recommended.has(card.dataset.classId);
        card.classList.toggle('learning-recommended', recommendedHere);
        if (recommendedHere) card.appendChild(element('span', 'learning-recommended-badge', 'RECOMMENDED'));
    }
    document.getElementById('btn-more-operators')?.remove();
    const apply = () => {
        for (const card of cards) {
            card.classList.toggle('learning-advanced-hidden', introductory && !expanded && !recommended.has(card.dataset.classId));
        }
    };
    apply();
    if (!introductory) return;
    const more = element('button', 'btn secondary learning-more-operators');
    more.id = 'btn-more-operators';
    more.type = 'button';
    more.setAttribute('aria-controls', 'char-grid');
    const label = () => {
        more.textContent = expanded ? 'SHOW RECOMMENDED' : 'MORE OPERATORS (4)';
        more.setAttribute('aria-expanded', String(expanded));
    };
    more.onclick = () => {
        expanded = !expanded;
        if (game) game._showAllLearningOperators = expanded;
        apply();
        label();
    };
    label();
    grid.after(more);
}

export function hideObjective() {
    document.getElementById('learning-objective')?.remove();
}

export function showObjective({ title = 'NEXT STEP', text = '', progress = '', onHelp,
    helpLabel = 'HELP', host, kind = 'objective' } = {}) {
    hideObjective();
    let parent = typeof host === 'string' ? document.querySelector(host) : host;
    parent ||= document.querySelector('#hud:not(.hidden) .bottom-controls')
        || document.querySelector('#screen-map.active');
    if (!parent) return null;
    const combat = parent.classList.contains('bottom-controls');
    const card = element('aside', 'learning-objective ' + (combat ? 'learning-objective--combat' : 'learning-objective--flow'));
    card.id = 'learning-objective';
    card.dataset.kind = kind;
    card.setAttribute('aria-label', 'Current objective');
    const copy = element('div', 'learning-objective-copy');
    copy.appendChild(element('div', 'learning-objective-title', title));
    copy.appendChild(element('div', 'learning-objective-text', text));
    if (progress) copy.appendChild(element('div', 'learning-objective-progress', progress));
    card.appendChild(copy);
    if (typeof onHelp === 'function') {
        const help = element('button', 'learning-objective-help', helpLabel);
        help.type = 'button';
        help.onclick = onHelp;
        card.appendChild(help);
    }
    if (combat) parent.appendChild(card);
    else {
        const navigation = parent.querySelector('.map-navigation');
        if (navigation) navigation.after(card);
        else parent.prepend(card);
    }
    return card;
}

function modal({ id, title, onClose }) {
    const overlay = element('div', 'learning-modal');
    overlay.id = id;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', id + '-title');
    const panel = element('section', 'learning-modal-panel');
    panel.appendChild(element('h2', 'learning-modal-title', title));
    panel.firstChild.id = id + '-title';
    const previousFocus = document.activeElement;
    let closed = false;
    const close = (notify = true) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (previousFocus && previousFocus.isConnected && previousFocus.focus) previousFocus.focus();
        if (notify && typeof onClose === 'function') onClose();
    };
    const button = element('button', 'btn secondary learning-modal-close', 'CLOSE');
    button.type = 'button';
    button.onclick = () => close();
    const onKey = event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopImmediatePropagation();
            close();
        } else if (event.key === 'Tab') {
            const focusable = [...overlay.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    };
    panel.appendChild(button);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    button.focus();
    return { panel, close, button };
}

export function showPracticeLibrary({ lessons = [], onSelect, onClose } = {}) {
    closeLibrary?.(false);
    const view = modal({ id: 'learning-practice-library', title: 'PRACTICE DRILLS', onClose });
    closeLibrary = view.close;
    const intro = element('p', 'learning-modal-intro', 'Practise one skill at a time. Drills do not spend a checkpoint or award currency, modules or progression.');
    const list = element('div', 'learning-practice-list');
    for (const lesson of lessons) {
        const button = element('button', 'learning-practice-lesson');
        button.type = 'button';
        button.disabled = lesson.available === false;
        button.dataset.lessonId = String(lesson.id);
        button.appendChild(element('strong', '', lesson.title));
        button.appendChild(element('span', '', lesson.description || ''));
        if (lesson.complete) button.appendChild(element('span', 'learning-practice-status', 'PRACTISED'));
        button.onclick = () => {
            view.close(false);
            if (typeof onSelect === 'function') onSelect(lesson);
        };
        list.appendChild(button);
    }
    view.button.before(intro, list);
    return view.close;
}

export function hidePracticeLibrary() { closeLibrary?.(); closeLibrary = null; }

export function showBossRules({ title = 'BOSS RULES', rules = [], onInspect, onOpen, onClose, canInspect, host } = {}) {
    const entries = (Array.isArray(rules) ? rules : [rules]).map(rule => typeof rule === 'object' && rule
        ? { title: rule.title || '', text: rule.text || '', tone: rule.tone || 'info' }
        : { title: '', text: String(rule), tone: 'info' });
    return showObjective({ title, text: entries[0]?.text || 'Inspect the boss before choosing an action.',
        helpLabel: 'RULES', host, kind: 'boss', onHelp: () => {
            if (canInspect && !canInspect()) return;
            if (onInspect) { onInspect(); return; }
            closeRules?.();
            onOpen?.();
            const view = modal({ id: 'learning-boss-rules', title, onClose: () => { closeRules = null; onClose?.(); } });
            closeRules = view.close;
            const list = element('ul', 'learning-boss-rule-list');
            for (const entry of entries) {
                const row = element('li', 'learning-rule-' + entry.tone);
                if (entry.title) row.appendChild(element('strong', '', entry.title));
                row.appendChild(element('p', '', entry.text));
                list.appendChild(row);
            }
            view.button.before(list);
        } });
}

export function hideBossRules() {
    if (document.getElementById('learning-objective')?.dataset.kind === 'boss') hideObjective();
    closeRules?.();
    closeRules = null;
}

export function dismissLearningOverlay() {
    if (document.getElementById('learning-boss-rules')) { closeRules?.(); return true; }
    if (document.getElementById('learning-practice-library')) { hidePracticeLibrary(); return true; }
    return false;
}
