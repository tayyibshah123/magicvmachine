import { META_UPGRADES } from '../constants.js';

// Presentation only. Learning policy and persistence stay with the caller.
let closeLibrary = null;
let closeRules = null;
let closeReturn = null;

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

// Keep the first visit small without duplicating purchase or toggle logic.
// These beginner upgrades have active gameplay consumers. Progression unlocks
// and the wider catalogue remain available through Browse All.
const STARTER_UPGRADES = ['m_life', 'm_shield', 'm_mana', 'm_reroll', 'm_cache_primer', 'm_discount', 'm_greed'];

export function hideSanctuaryGuidance() {
    document.getElementById('learning-sanctuary-intro')?.remove();
    document.getElementById('upgrade-list')?.classList.remove('learning-sanctuary-focused');
}

export function decorateSanctuary(game, { mode, introductory = false,
    classId = game?.player?.classId } = {}) {
    hideSanctuaryGuidance();
    const list = document.getElementById('upgrade-list');
    if (!list || mode !== 'guided' || !introductory) return null;
    const wallet = Math.max(0, Number(game?.sparks) || 0);
    const owned = id => typeof game?.isMetaOwned === 'function'
        ? game.isMetaOwned(id) : !!game?.metaUpgrades?.includes(id);
    const cards = [...list.querySelectorAll('.upgrade-card:not(.cosmetic-card)')];
    const cardFor = upgrade => cards.find(card => card.dataset.upgradeId === upgrade.id
        || card.querySelector('.upgrade-name')?.textContent.trim() === upgrade.name);
    const classUpgrade = META_UPGRADES.find(upgrade => upgrade.appliesToClass === classId);
    const ids = [...(classUpgrade ? [classUpgrade.id] : []), ...STARTER_UPGRADES];
    const candidates = ids.map(id => META_UPGRADES.find(upgrade => upgrade.id === id))
        .filter(upgrade => upgrade && !owned(upgrade.id) && cardFor(upgrade));
    const affordable = candidates.filter(upgrade => upgrade.cost <= wallet).slice(0, 3);
    const section = element('section', 'learning-sanctuary-intro');
    section.id = 'learning-sanctuary-intro';
    section.setAttribute('aria-label', 'Suggested permanent upgrades');
    section.appendChild(element('h3', '', 'A FEW PLACES TO START'));
    section.appendChild(element('p', '', 'Spend banked Sparks on permanent upgrades for future runs. Buying is optional; you can switch owned upgrades off in the full catalogue.'));
    const recommendations = element('div', 'learning-sanctuary-picks');
    for (const upgrade of affordable) {
        const original = cardFor(upgrade);
        const button = element('button', 'learning-sanctuary-card');
        button.type = 'button';
        button.dataset.upgradeId = upgrade.id;
        if (upgrade.appliesToClass === classId) button.appendChild(element('span', 'learning-sanctuary-class', 'YOUR OPERATOR'));
        button.appendChild(element('strong', '', upgrade.name));
        button.appendChild(element('span', '', original.querySelector('.upgrade-desc')?.textContent || upgrade.desc));
        button.appendChild(element('span', 'learning-sanctuary-cost', `BUY FOR ${upgrade.cost} SPARKS`));
        button.onclick = () => {
            // Re-check the live wallet and ownership. The existing card owns
            // the transaction and renderMeta must redecorate after a purchase.
            if (original.isConnected && !owned(upgrade.id) && (Number(game?.sparks) || 0) >= upgrade.cost) original.click();
        };
        recommendations.appendChild(button);
    }
    if (affordable.length) section.appendChild(recommendations);
    else section.appendChild(element('p', 'learning-sanctuary-empty', candidates.length
        ? 'No suggested upgrade is affordable yet. You can keep your Sparks and return after another run.'
        : 'You already own the suggested starter upgrades. Browse All to review your upgrades and their toggles.'));
    if (classUpgrade && !owned(classUpgrade.id) && classUpgrade.cost > wallet && cardFor(classUpgrade)) {
        section.appendChild(element('p', 'learning-sanctuary-goal', `Your operator upgrade, ${classUpgrade.name}, costs ${classUpgrade.cost} Sparks. Save ${classUpgrade.cost - wallet} more Sparks to buy it.`));
    }
    let expanded = !!(game?._learningSanctuaryBrowseAll);
    const browse = element('button', 'btn secondary learning-sanctuary-browse');
    browse.type = 'button';
    browse.setAttribute('aria-controls', 'upgrade-list');
    const apply = () => {
        list.classList.toggle('learning-sanctuary-focused', !expanded);
        browse.setAttribute('aria-expanded', String(expanded));
        browse.textContent = expanded ? 'SHOW SUGGESTIONS' : 'BROWSE ALL UPGRADES';
    };
    browse.onclick = () => {
        expanded = !expanded;
        if (game) game._learningSanctuaryBrowseAll = expanded;
        apply();
    };
    section.appendChild(browse);
    list.prepend(section);
    apply();
    return section;
}

export function hideOutcomeGuidance() {
    document.getElementById('learning-outcome-note')?.remove();
}

export function decorateOutcome(game, { mode, introductory = false, kind = 'loss', host,
    onPractice, practiceLabel = 'OPTIONAL PRACTICE', onDismiss } = {}) {
    hideOutcomeGuidance();
    const parent = typeof host === 'string' ? document.querySelector(host) : host
        || document.getElementById('screen-gameover');
    if (!parent || mode !== 'guided' || !introductory) return null;
    const card = element('aside', 'learning-outcome-note');
    card.id = 'learning-outcome-note';
    card.setAttribute('aria-label', 'What carries between runs');
    card.appendChild(element('h3', '', kind === 'loss' ? 'YOUR NEXT RUN' : 'WHAT YOU KEEP'));
    card.appendChild(element('p', '', 'Sparks stay banked between runs and buy permanent Sanctuary upgrades. Fragments and augmentations belong to one run.'));
    card.appendChild(element('p', '', kind === 'loss'
        ? 'When a run ends, its Fragments and augmentations reset. You can retry with the same operator or practise one skill first.'
        : 'Save and Return keeps your current run and its Fragments. Starting a new run replaces that checkpoint.'));
    const actions = element('div', 'learning-note-actions');
    let settled = false;
    if (typeof onPractice === 'function') {
        const practice = element('button', 'btn secondary learning-outcome-practice', practiceLabel);
        practice.type = 'button';
        practice.onclick = () => {
            if (settled) return;
            settled = true;
            hideOutcomeGuidance();
            onPractice();
        };
        actions.appendChild(practice);
    }
    const dismiss = element('button', 'btn secondary learning-note-dismiss', 'GOT IT');
    dismiss.type = 'button';
    dismiss.onclick = () => {
        if (settled) return;
        settled = true;
        hideOutcomeGuidance();
        onDismiss?.();
    };
    actions.appendChild(dismiss);
    card.appendChild(actions);
    const retry = parent.querySelector('#btn-retry-class');
    if (retry) retry.before(card);
    else parent.appendChild(card);
    return card;
}

export function decorateReward(game, { mode, host } = {}) {
    document.getElementById('learning-reward-scope')?.remove();
    const parent = typeof host === 'string' ? document.querySelector(host) : host
        || document.getElementById('screen-reward');
    if (!parent || mode !== 'guided') return null;
    const note = element('p', 'learning-reward-scope', 'Choose one augmentation for this run. Instant effects apply now.');
    note.id = 'learning-reward-scope';
    const options = parent.querySelector('#reward-options');
    if (options) options.before(note);
    else parent.appendChild(note);
    return note;
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

export function showReturnGuidance(game, { onPractice, practiceLabel = 'OPTIONAL PRACTICE', onDismiss } = {}) {
    hideReturnGuidance();
    const view = modal({ id: 'learning-return-guidance', title: 'WHAT YOU KEEP', onClose: () => { closeReturn = null; } });
    closeReturn = view.close;
    const note = decorateOutcome(game, { mode: 'guided', introductory: true, kind: 'return', host: view.panel,
        practiceLabel, onPractice: typeof onPractice === 'function' ? () => {
            hideReturnGuidance();
            onPractice();
        } : undefined });
    note.classList.add('learning-return-content');
    note.querySelector('h3')?.remove();
    note.querySelector('.learning-note-dismiss')?.remove();
    if (!onPractice) note.querySelector('.learning-note-actions')?.remove();
    view.button.before(note);
    let acknowledged = false;
    view.button.textContent = 'GOT IT';
    view.button.onclick = () => {
        if (acknowledged) return;
        acknowledged = true;
        hideReturnGuidance();
        onDismiss?.();
    };
    return view.close;
}

export function hideReturnGuidance() {
    closeReturn?.(false);
    closeReturn = null;
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
    if (document.getElementById('learning-return-guidance')) { hideReturnGuidance(); return true; }
    if (document.getElementById('learning-boss-rules')) { closeRules?.(); return true; }
    if (document.getElementById('learning-practice-library')) { hidePracticeLibrary(); return true; }
    return false;
}
