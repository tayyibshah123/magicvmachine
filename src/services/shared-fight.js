export const SHARED_FIGHT_ID = 'tactician-v1';

// Keep this ruleset available under its original ID when adding another fight.
const fight = Object.freeze({
    id: SHARED_FIGHT_ID,
    playerHp: 24,
    turnLimit: 6,
    enemy: Object.freeze({ name: 'RELAY DRONE', hp: 32, dmg: 9, shape: 'drone', radius: 80 }),
    intents: Object.freeze([
        Object.freeze({ type: 'attack', val: 9, label: 'STRIKE 9' }),
        Object.freeze({ type: 'shield', val: 4, label: 'GUARD 4' }),
        Object.freeze({ type: 'attack', val: 12, label: 'STRIKE 12' })
    ]),
    diceFn: () => ['TAC_ATTACK', 'TAC_ATTACK', 'TAC_DEFEND']
});

export function getSharedFight(id) {
    return id === SHARED_FIGHT_ID ? fight : null;
}

export function sharedFightFromUrl(url) {
    try {
        const ids = new URL(url).searchParams.getAll('fight');
        return ids.length === 1 ? getSharedFight(ids[0]) : null;
    } catch (_) {
        return null;
    }
}

export function campaignUrl(url) {
    const destination = new URL(url);
    destination.searchParams.delete('fight');
    return destination.href;
}

export function sharedFightIntent(intent) {
    if (intent?.type === 'shield') return `The drone gains ${intent.val} shield when you end your turn.`;
    if (intent?.type === 'attack') return `The drone attacks you for ${intent.effectiveVal ?? intent.val} damage when you end your turn.`;
    return '';
}

export function offerFirstFightShare(receipt, share) {
    if (receipt?.sector !== 1 || receipt.encounterType !== 'combat' || !receipt.killName) return;
    const card = document.getElementById('first-fight-share');
    if (!card || card.dataset.offered) return;
    try { if (localStorage.getItem('mvm_share_seen_first_fight')) return; } catch (_) {}
    card.dataset.offered = 'true';
    try { localStorage.setItem('mvm_share_seen_first_fight', '1'); } catch (_) {}
    const heading = document.getElementById('first-fight-share-title');
    const copy = document.getElementById('first-fight-share-copy');
    heading.textContent = `Defeated ${receipt.killName}`;
    copy.onclick = async () => {
        const url = share.buildPlayUrl({ challengeId: SHARED_FIGHT_ID });
        if (await share.copyLink(url)) copy.textContent = 'Fight link copied';
        else if (!card.classList.contains('hidden') && card.closest('.screen.active')) share.showFallback({ url });
    };
    document.getElementById('first-fight-share-dismiss').onclick = () => card.classList.add('hidden');
    card.classList.remove('hidden');
}

export function showSharedFightResult(result, { onShare, onRetry, onCampaign, campaignLabel }) {
    const overlay = document.getElementById('shared-fight-result');
    if (!overlay) return;
    const title = document.getElementById('shared-fight-title');
    const stats = document.getElementById('shared-fight-stats');
    const feedback = document.getElementById('shared-fight-share-feedback');
    const share = document.getElementById('shared-fight-share');
    const retry = document.getElementById('shared-fight-retry');
    const campaign = document.getElementById('shared-fight-campaign');
    title.textContent = { win: 'Drone defeated', loss: 'Drone held the relay', limit: 'Turn limit reached' }[result.outcome];
    stats.textContent = `${result.turns} ${result.turns === 1 ? 'turn' : 'turns'} · ${result.hp}/${result.maxHp} HP`;
    campaign.textContent = campaignLabel;
    feedback.textContent = '';
    share.onclick = async () => {
        share.disabled = true;
        try {
            const status = await onShare();
            if (share.onclick !== send || overlay.classList.contains('hidden')) return;
            if (status === 'copied') feedback.textContent = 'Fight link copied.';
            if (status === 'error') feedback.textContent = 'Could not share the link. Try again.';
        } catch (_) {
            if (share.onclick === send) feedback.textContent = 'Could not share the link. Try again.';
        } finally {
            if (share.onclick === send) share.disabled = false;
        }
    };
    const send = share.onclick;
    const close = action => {
        overlay.classList.add('hidden');
        share.onclick = retry.onclick = campaign.onclick = null;
        action();
    };
    share.disabled = false;
    retry.onclick = () => close(onRetry);
    campaign.onclick = () => close(onCampaign);
    overlay.classList.remove('hidden');
    title.focus();
}
