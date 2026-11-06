// Fixed v1.9.55 prices, independent of future catalog or balance changes.
export const RETIRED_UPGRADE_PRICES = Object.freeze({
    s_archive: 5, s_corrupt_pool: 8, s_event_pool: 8, s_extra_choice: 10,
    s_skill_seed: 10, s_dice_seed: 12, s_class_unlock: 12, s_relic_pick: 15
});
const KEY = 'mvm_retired_upgrades_refund_v1';

export const RetiredUpgrades = {
    recoverAndRefund() {
        let raw;
        try { raw = localStorage.getItem(KEY); }
        catch (_) { return { ok: true, refunded: 0 }; }
        try {
            let journal = JSON.parse(raw || 'null');
            if (journal?.v === 1 && journal.status === 'complete') return { ok: true, refunded: 0 };
            if (!journal) {
                const owned = JSON.parse(localStorage.getItem('mvm_upgrades') || '[]');
                const disabled = JSON.parse(localStorage.getItem('mvm_meta_disabled') || '[]');
                if (!Array.isArray(owned) || !Array.isArray(disabled)) throw new Error('Invalid upgrade ownership');
                const ids = [...new Set(owned)].filter(id => Object.hasOwn(RETIRED_UPGRADE_PRICES, id));
                const total = ids.reduce((sum, id) => sum + RETIRED_UPGRADE_PRICES[id], 0);
                if (!total) return { ok: true, refunded: 0 };
                const wallet = Number(localStorage.getItem('mvm_sparks') || 0);
                if (!Number.isSafeInteger(wallet) || wallet < 0 || !Number.isSafeInteger(wallet + total)) throw new Error('Invalid Spark balance');
                journal = { v: 1, status: 'prepared', ids, total, walletBefore: wallet, walletAfter: wallet + total,
                    ownedAfter: owned.filter(id => !ids.includes(id)), disabledAfter: disabled.filter(id => !ids.includes(id)) };
                // Persist the fixed destination before any balance changes.
                // A partial write replays these destinations, never adds twice.
                localStorage.setItem(KEY, JSON.stringify(journal));
            }
            if (journal.v !== 1 || journal.status !== 'prepared' || !Number.isSafeInteger(journal.walletAfter)
                || journal.walletAfter < 0 || !Number.isSafeInteger(journal.walletBefore) || journal.walletBefore < 0
                || !Array.isArray(journal.ids) || !journal.ids.length || new Set(journal.ids).size !== journal.ids.length
                || !journal.ids.every(id => Object.hasOwn(RETIRED_UPGRADE_PRICES, id))
                || journal.total !== journal.ids.reduce((sum, id) => sum + RETIRED_UPGRADE_PRICES[id], 0)
                || journal.walletAfter !== journal.walletBefore + journal.total
                || !Array.isArray(journal.ownedAfter) || !Array.isArray(journal.disabledAfter)
                || [...journal.ownedAfter, ...journal.disabledAfter].some(id => typeof id !== 'string' || journal.ids.includes(id))) throw new Error('Invalid refund journal');
            localStorage.setItem('mvm_sparks', String(journal.walletAfter));
            localStorage.setItem('mvm_upgrades', JSON.stringify(journal.ownedAfter));
            localStorage.setItem('mvm_meta_disabled', JSON.stringify(journal.disabledAfter));
            localStorage.setItem(KEY, JSON.stringify({ ...journal, status: 'complete' }));
            // This restores spending power. It is not an earning event and
            // does not touch lifetime Sparks, catch-up bonuses or achievements.
            return { ok: true, refunded: journal.total };
        } catch (_) {
            return { ok: false, refunded: 0, error: 'Upgrade refund recovery is pending. Free storage and reload before continuing.' };
        }
    }
};
