import { DICE_TYPES, PLAYER_CLASSES } from '../constants.js';

const KEY = 'mvm_learning_v1';
export const GUIDED_ROUTE = Object.freeze([
    { type: 'combat', lesson: 'basics', title: 'Read, strike, guard' },
    { type: 'combat', lesson: 'reroll', title: 'Keep useful dice' },
    { type: 'rest', lesson: 'rest', title: 'One recovery choice' },
    { type: 'combat', lesson: 'resources', title: 'Pay for a skill' },
    { type: 'shop', lesson: 'shop', title: 'Spend run Fragments' },
    { type: 'combat', lesson: 'allies', title: 'Your class and its ally' },
    { type: 'combat', lesson: 'status', title: 'Read an active effect' },
    { type: 'elite', lesson: 'signature', title: 'Prepare for a stronger enemy' },
    { type: 'rest', lesson: 'boss', title: 'Prepare for the gatekeeper' },
    { type: 'boss', lesson: 'boss', title: 'Clear Sector 1' }
]);
const FEATURES = ['attack', 'defend', 'timing', 'endTurn', 'reroll', 'mana', 'skills', 'minion',
    'classAbility', 'status', 'signature', 'allyTiming', 'advanced', 'events', 'shopHack', 'fusions', 'corrupted', 'sectorMechanics'];
const CLASS_FEATURES = new Set(['classAbility', 'signature', 'minion', 'allies']);
const LESSONS = [
    { id: 'basics', title: 'Attack and defend', description: 'Read intent, attack, guard and end a turn.', room: 0 },
    { id: 'timing', title: 'Timing practice', description: 'Practise an attack and a defensive response. Perfect timing is optional.', room: 1 },
    { id: 'resources', title: 'Resources and skills', description: 'Gain Mana, then pay its actual cost to use a skill.', room: 2 },
    { id: 'allies', title: 'Class and allies', description: 'Practise this operator and its ally.', room: 3 },
    { id: 'boss', title: 'Boss preparation', description: 'Read the rules and finish a longer training encounter.', room: 4 }
];
const simple = new Set(['repair', 'hull_plating', 'reinforced_shell', 'nano_shield', 'titan_module', 'thorn_mail',
    'hp_up', 'mana_up', 'mana_battery', 'mana_syphon', 'minion_core', 'wisp_hp', 'iron_lung']);
const emptyBucket = () => ({ available: [], introduced: [], practised: [], skipped: [] });
const copy = value => JSON.parse(JSON.stringify(value));
const unique = values => [...new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : [])];
const push = (values, id) => { if (!values.includes(id)) values.push(id); };
const isClass = id => PLAYER_CLASSES.some(cls => cls.id === id);

export const Learning = {
    _enabled: false,
    _profile: null,
    init({ enabled = true, practice = false } = {}) {
        this._enabled = enabled;
        if (!enabled || practice) return null;
        let raw;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
        if (raw?.v === 1 && ['guided', 'full'].includes(raw.mode)) {
            this._profile = { v: 1, mode: raw.mode, coreComplete: !!raw.coreComplete,
                shared: this._bucket(raw.shared), classes: {}, queue: unique(raw.queue) };
            for (const cls of PLAYER_CLASSES) this._profile.classes[cls.id] = this._bucket(raw.classes?.[cls.id]);
        } else {
            let meaningful = false;
            try {
                meaningful = Number(localStorage.getItem('mvm_runs_started') || 0) > 0
                    || localStorage.getItem('mvm_first_run_done') === '1'
                    || ['mvm_save_v1', ...['A', 'B', 'C'].map(slot => 'mvm_save_v1__' + slot)]
                        .some(key => !!localStorage.getItem(key));
            } catch (_) {}
            this._profile = { v: 1, mode: meaningful ? 'full' : 'guided', coreComplete: meaningful,
                shared: emptyBucket(), classes: Object.fromEntries(PLAYER_CLASSES.map(cls => [cls.id, emptyBucket()])), queue: [] };
            this._profile.shared.available = LESSONS.map(item => item.id);
            // A default is written only when no deliberate difficulty exists.
            try { if (!meaningful && !localStorage.getItem('mvm_difficulty')) localStorage.setItem('mvm_difficulty', 'initiate'); } catch (_) {}
            this._save();
        }
        return copy(this._profile);
    },
    _bucket(value) {
        return Object.fromEntries(['available', 'introduced', 'practised', 'skipped'].map(key => [key, unique(value?.[key])]));
    },
    _save({ practice = false } = {}) {
        if (!this._enabled || practice || !this._profile) return false;
        try { localStorage.setItem(KEY, JSON.stringify(this._profile)); return true; } catch (_) { return false; }
    },
    profile() { return this._profile ? copy(this._profile) : null; },
    getMode() { return this._profile?.mode || 'full'; },
    setMode(mode, options = {}) {
        if (options.practice || !['guided', 'full'].includes(mode) || !this._enabled) return false;
        if (!this._profile) this.init();
        this._profile.mode = mode;
        return this._save(options);
    },
    coreComplete() { return !!this._profile?.coreComplete; },
    introduce(id, classId, options = {}) {
        if (!this._enabled || options.practice || !this._profile) return;
        const bucket = CLASS_FEATURES.has(id) && isClass(classId) ? this._profile.classes[classId] : this._profile.shared;
        push(bucket.available, id);
        push(bucket.introduced, id);
        this._save(options);
    },
    skip(id, classId, options = {}) {
        if (!this._enabled || options.practice || !this._profile) return;
        const bucket = CLASS_FEATURES.has(id) && isClass(classId) ? this._profile.classes[classId] : this._profile.shared;
        push(bucket.available, id);
        push(bucket.skipped, id);
        this._save(options);
    },
    recordCore(classId, options = {}) {
        if (!this._enabled || options.practice || !this._profile) return;
        this._profile.coreComplete = true;
        for (const id of ['basics', 'attack', 'defend', 'endTurn', 'timing']) {
            push(this._profile.shared.introduced, id);
            push(this._profile.shared.practised, id);
        }
        if (classId === 'summoner') {
            push(this._profile.classes[classId].introduced, 'minion');
            push(this._profile.classes[classId].practised, 'minion');
        }
        this._save(options);
    },
    recordAction(action, { classId, cost = 0, skill = false, signature = false, practice = false } = {}) {
        if (!this._enabled || practice || !this._profile) return;
        const ids = [action];
        if (action === 'minion') ids.push('allies');
        if (skill && cost > 0) ids.push('skills', 'resources');
        if (signature) ids.push('signature');
        for (const id of ids) {
            const bucket = CLASS_FEATURES.has(id) && isClass(classId) ? this._profile.classes[classId] : this._profile.shared;
            // Actions prove practice only. They never pretend a hidden hint
            // was displayed or make its introduction depend on a Perfect.
            push(bucket.available, id);
            push(bucket.practised, id);
        }
        if (action === 'minion') push(this._profile.queue, 'allyTiming');
        this._save({ practice });
    },
    createRun(classId) {
        const introduced = [...(this._profile?.shared.introduced || []), ...(this._profile?.classes[classId]?.introduced || [])]
            .filter(id => FEATURES.includes(id));
        return { v: 1, route: 'first-sector-v1', classId, stage: 0, combats: 0, completed: [],
            features: unique(['attack', 'defend', 'timing', 'endTurn', 'reroll', ...introduced,
                ...(classId === 'summoner' ? ['minion', 'classAbility'] : [])]), core: null, finished: false };
    },
    restoreRun(value) {
        if (value === null || value === undefined) return null;
        if (value.v !== 1 || value.route !== 'first-sector-v1' || !isClass(value.classId)
            || !Number.isInteger(value.stage) || value.stage < 0 || value.stage >= GUIDED_ROUTE.length
            || !Number.isSafeInteger(value.combats) || value.combats < 0
            || typeof value.finished !== 'boolean'
            || !Array.isArray(value.features) || !value.features.every(id => FEATURES.includes(id))
            || !Array.isArray(value.completed) || !value.completed.every(id => typeof id === 'string')
            || (value.core && (!Number.isInteger(value.core.roomIndex) || value.core.roomIndex < 0 || value.core.roomIndex > 1
                || !Array.isArray(value.core.actions) || !value.core.actions.every(id => typeof id === 'string')))) return null;
        return copy(value);
    },
    boundary(run, stage, { practice = false } = {}) {
        if (!run || practice || run.finished) return;
        run.stage = Math.max(run.stage, Math.min(GUIDED_ROUTE.length - 1, stage));
        const introduce = [];
        if (run.stage >= 3) introduce.push('mana', 'skills');
        if (run.stage >= 5) introduce.push('minion', 'classAbility');
        if (run.stage >= 6) introduce.push('status');
        if (run.stage >= 7) introduce.push('signature');
        for (const id of this._profile?.queue || []) if (run.stage >= 6 && FEATURES.includes(id)) introduce.push(id);
        if (this._profile && run.stage >= 6) this._profile.queue = [];
        for (const id of introduce) {
            push(run.features, id);
            this.introduce(id, run.classId, { practice });
        }
        this._save({ practice });
    },
    recordWin(run, nodeId, { boss = false, practice = false } = {}) {
        if (!run || practice || run.completed.includes(nodeId)) return;
        run.completed.push(nodeId);
        run.combats++;
        this.recordAction('combatWin', { classId: run.classId, practice });
        if (boss) {
            run.finished = true;
            for (const feature of FEATURES) { push(run.features, feature); this.introduce(feature, run.classId); }
            this.recordAction('boss', { classId: run.classId });
        }
    },
    canFeature(feature, run) { return !run || run.finished || run.features.includes(feature); },
    route() {
        const nodes = [{ id: 'start', layer: 0, lane: 0, x: 50, y: 94, type: 'start', status: 'completed', connections: ['guide-0'] }];
        GUIDED_ROUTE.forEach((step, stage) => nodes.push({ id: 'guide-' + stage, layer: stage + 1, lane: 0,
            x: stage % 2 ? 64 : 36, y: 86 - stage * 8, type: step.type, guideStage: stage,
            lesson: step.lesson, label: step.title, shifting: false, status: stage === 0 ? 'available' : 'locked',
            connections: stage === GUIDED_ROUTE.length - 1 ? [] : ['guide-' + (stage + 1)] }));
        return { nodes, currentIdx: 'start' };
    },
    handPlan(run, classId) {
        if (!run || run.finished || this.canFeature('advanced', run)) return null;
        const cd = PLAYER_CLASSES.find(cls => cls.id === classId)?.classDice;
        if (!cd) return null;
        const resources = this.canFeature('mana', run) && this.canFeature('skills', run);
        const allies = this.canFeature('minion', run);
        const count = resources ? (allies ? 5 : 4) : 3;
        const hand = [cd.attack, cd.defend];
        if (classId === 'summoner') hand.push(cd.minion);
        if (resources) hand.push(cd.mana, this.canFeature('status', run) ? 'CONSTRICT' : 'EARTHQUAKE');
        if (allies && !hand.includes(cd.minion)) hand.push(cd.minion);
        // The guaranteed resource skill stays present; signature takes a
        // later slot, never the player's attack or defence safety floor.
        if (this.canFeature('signature', run)) hand[hand.length - 1] = 'SIGNATURE';
        while (hand.length < count) hand.push(cd.attack);
        return hand.slice(0, count);
    },
    allowDie(type, run) {
        if (!run || run.finished) return true;
        const data = DICE_TYPES[type];
        if (!data) return false;
        if (type === 'SIGNATURE') return this.canFeature('signature', run);
        if (data.isSkill) return this.canFeature('skills', run)
            && (type === 'EARTHQUAKE' || (this.canFeature('status', run) && type === 'CONSTRICT'));
        if (data.slot === 'mana') return this.canFeature('mana', run);
        if (data.slot === 'minion') return this.canFeature('minion', run);
        return true;
    },
    filterPool(items, kind, run) {
        if (!run || run.finished || this.canFeature('advanced', run)) return items;
        if (kind === 'events') return items.filter(item => ['medbay', 'supply-cache'].includes(item.id));
        return items.filter(item => simple.has(item.id)
            && (!['mana_up', 'mana_battery', 'mana_syphon'].includes(item.id) || this.canFeature('mana', run))
            && (!['minion_core', 'wisp_hp'].includes(item.id) || this.canFeature('minion', run)));
    },
    firstRewards(pool) { return ['hull_plating', 'nano_shield', 'titan_module'].map(id => pool.find(item => item.id === id)).filter(Boolean); },
    objective(run, classId) {
        if (!run || run.finished) return null;
        const step = GUIDED_ROUTE[run.stage];
        const texts = {
            basics: 'Read the intent. Attack the enemy, defend yourself, then End Turn. Timing bonuses are optional.',
            reroll: 'Keep a useful die selected, then reroll the others. You can still win without using every tool.',
            rest: 'Choose one recovery option. Fragments belong to this run; Sparks survive it.',
            resources: classId === 'bloodstalker' ? 'Blood Price trades HP for Mana. Earthquake costs 2 Mana; the cost is paid only when used.'
                : 'Your resource die gains Mana. Earthquake costs 2 Mana and damages every enemy.',
            shop: 'Spend Fragments on a concrete benefit, or leave and keep them for later.',
            allies: classId === 'annihilator' ? 'Deploy a Bomb Bot. It is a one-shot ally, detonated by its real command.'
                : 'Summon your class ally. It acts after your actions; inspect your class control when ready.',
            status: 'Constrict costs 3 Mana. Read its effect duration and the next enemy intent.',
            signature: 'Your Signature is now available. Read its cost and effect before choosing to use it.',
            boss: 'Inspect the boss rules and prepare your defence. This is the Guided Sector 1 route.'
        };
        return { title: step.title, text: texts[step.lesson], progress: `${run.stage + 1} / ${GUIDED_ROUTE.length}` };
    },
    lessons(classId) {
        return LESSONS.map(item => ({ ...item, available: true,
            complete: !!this._profile?.shared.practised.includes(item.id)
                || !!this._profile?.classes[classId]?.practised.includes(item.id) }));
    }
};
