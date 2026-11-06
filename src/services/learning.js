import { DICE_TYPES, PLAYER_CLASSES, SECTOR_MECHANICS } from '../constants.js';

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
// Existing v1 snapshots retain their original ten-node route and rules.
export const GUIDED_ROUTE_V2 = Object.freeze([
    { type: 'combat', lesson: 'basics', title: 'Read, strike, guard' },
    { type: 'combat', lesson: 'reroll', title: 'Keep useful dice', features: ['hpCosts'] },
    { type: 'rest', lesson: 'rest', title: 'One recovery choice' },
    { type: 'combat', lesson: 'resources', title: 'Pay for a skill', features: ['mana', 'skills', 'hpCosts'] },
    { type: 'shop', lesson: 'shop', title: 'Spend run Fragments' },
    { type: 'combat', lesson: 'allies', title: 'Your class and its ally', features: ['minion', 'classAbility'] },
    { type: 'combat', lesson: 'allyTiming', title: 'One optional ally boost', features: ['allyTiming'] },
    { type: 'combat', lesson: 'status', title: 'Read an active effect', features: ['status'] },
    { type: 'combat', lesson: 'hostile', title: 'Choose a hostile target', features: ['hostileMinions'] },
    { type: 'combat', lesson: 'multiwave', title: 'Read a two-hit attack', features: ['multiwave'] },
    { type: 'combat', lesson: 'signature', title: 'Your signature rhythm', features: ['signature'] },
    { type: 'elite', lesson: 'elite', title: 'Read a stronger defender' },
    { type: 'rest', lesson: 'boss', title: 'Prepare for the gatekeeper' },
    { type: 'boss', lesson: 'boss', title: 'Clear Sector 1' }
]);
const KIND_LESSONS = {
    frost: ['Area pressure', 'Frost reaches you and your allies and can apply Weak. Read which targets and effects the intent names.'],
    armored: ['Shielding target', 'This enemy alternates a heavier attack with gaining shield. Read its next intent and current shield before spending a heavy hit.'],
    burrow: ['Burrowing target', 'An otherwise lethal hit can leave this enemy burrowed at 1 HP. Plan a follow-up hit and read the warning before its heavy resurge.'],
    clone: ['Cloning target', 'The first damaging hit creates two hostile Echo Shards. Read the added health bars and choose your next target.'],
    shielder: ['Shield support', 'This enemy can protect its allies. Target the support or break the displayed shields before spending a heavy hit.'],
    immolate: ['Charging attack', 'A charge announces a later strike. Use the preparation turn to defend or finish the enemy.'],
    healer: ['Healing support', 'A living healer restores enemy HP. Consider removing the support before committing a long damage sequence.'],
    buffer: ['Buffing support', 'This support improves other enemies. Read the changed intent values and choose a priority target.'],
    detonator: ['Self-destruct', 'Low HP can arm Self Destruct. Read its countdown: finish the enemy or prepare for the actual queued explosion.'],
    phase_shift: ['Phasing target', 'Some hits can pass through this enemy. A phase dodge is shown explicitly; keep enough defence for its next heavier strike.'],
    mirror: ['Reflected damage', 'A mirror attack uses your recent damage against you. Read the preview before committing a large burst.'],
    shield_break: ['Shield-breaking attack', 'This enemy can remove shield before its strike. Read the order of its intent and keep HP in reserve.'],
    chaotic: ['Changing buffs', 'The enemy changes its buffs. Read its current effects and intent values each turn.'],
    observer: ['Watch, then strike', 'The observer spends a turn watching before a stronger strike. Use the warning turn to prepare.'],
    aoe_sweep: ['Area attack', 'A sweep can reach multiple allies. Read every target marker before ending the turn.']
};
const SECTOR_KINDS = { 2: ['frost', 'armored', 'burrow', 'clone', 'shielder'],
    3: ['immolate', 'healer', 'buffer', 'aoe_sweep'], 4: ['detonator', 'phase_shift'],
    5: ['mirror', 'shield_break', 'chaotic', 'observer'] };
const growthRoute = sector => [
    { type: 'combat', lesson: 'sectorMechanics', title: 'Read this sector rule', features: ['sectorMechanics'] },
    { type: 'combat', lesson: 'combos', title: 'Use a useful pair', features: ['combos'] },
    { type: 'rest', lesson: 'rest', title: 'Prepare your build' },
    { type: 'combat', lesson: 'momentum', title: 'Build momentum', features: ['momentum'] },
    { type: 'shop', lesson: 'shop', title: 'Choose a useful purchase' },
    { type: 'combat', lesson: 'synergies', title: 'Build a module combination', features: ['synergies'] },
    ...(SECTOR_KINDS[sector] || []).map(kind => ({ type: 'combat', lesson: 'enemy_' + kind,
        title: KIND_LESSONS[kind][0], features: ['enemy_' + kind] })),
    { type: 'combat', lesson: sector >= 3 ? 'specialSkills' : 'review', title: 'Apply what you know',
        features: sector >= 3 ? ['specialSkills'] : [] },
    { type: 'event', lesson: 'events', title: 'Read a choice and its consequence', features: ['events'] },
    { type: 'elite', lesson: 'elite', title: 'Read an elite modifier' },
    { type: 'rest', lesson: 'boss', title: 'Prepare for the boss' },
    { type: 'boss', lesson: 'boss', title: 'Clear the sector' }
];
const V1_FEATURES = ['attack', 'defend', 'timing', 'endTurn', 'reroll', 'mana', 'skills', 'minion',
    'classAbility', 'status', 'signature', 'allyTiming', 'advanced', 'events', 'shopHack', 'fusions', 'corrupted', 'sectorMechanics'];
const FEATURES = [...V1_FEATURES,
    'hpCosts', 'hostileMinions', 'multiwave', 'combos', 'momentum', 'synergies', 'specialSkills', 'eventVariety',
    ...Object.keys(KIND_LESSONS).map(kind => 'enemy_' + kind)];
const CLASS_FEATURES = new Set(['classAbility', 'signature', 'minion', 'allies', 'timing', 'hpCosts']);
const LESSONS = [
    { id: 'basics', title: 'Attack and defend', description: 'Read intent, attack, guard and end a turn.', room: 0 },
    { id: 'timing', title: 'Timing practice', description: 'Practise an attack and a defensive response. Perfect timing is optional.', room: 1 },
    { id: 'resources', title: 'Resources and skills', description: 'Gain Mana, then pay its actual cost to use a skill.', practiceLesson: 'resources' },
    { id: 'allies', title: 'Class and allies', description: 'Practise this operator and its ally.', practiceLesson: 'allies' },
    { id: 'status', title: 'One status effect', description: 'Apply a status and read its active duration.', practiceLesson: 'status' },
    { id: 'hostile', title: 'Hostile target priority', description: 'Choose an enemy support unit as a target.', practiceLesson: 'hostile' },
    { id: 'multiwave', title: 'A two-hit attack', description: 'Read and respond to two incoming hits. No Perfect is required.', practiceLesson: 'multiwave' },
    { id: 'boss', title: 'Boss preparation', description: 'Read the rules and finish a longer training encounter.', practiceLesson: 'boss' }
];
const simple = new Set(['repair', 'hull_plating', 'reinforced_shell', 'nano_shield', 'titan_module', 'thorn_mail',
    'hp_up', 'mana_up', 'mana_battery', 'mana_syphon', 'minion_core', 'wisp_hp', 'iron_lung']);
const emptyBucket = () => ({ available: [], introduced: [], practised: [], skipped: [] });
const copy = value => JSON.parse(JSON.stringify(value));
const unique = values => [...new Set(Array.isArray(values) ? values.filter(value => typeof value === 'string') : [])];
const push = (values, id) => { if (!values.includes(id)) values.push(id); };
const isClass = id => PLAYER_CLASSES.some(cls => cls.id === id);
const readJSON = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (_) { return fallback; }
};

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
                legacy: raw.legacy === undefined ? raw.mode === 'full' && !!raw.coreComplete
                    && !(raw.shared?.introduced?.length || raw.shared?.practised?.length) : !!raw.legacy,
                acknowledged: unique(raw.acknowledged), shared: this._bucket(raw.shared), classes: {}, queue: unique(raw.queue) };
            for (const cls of PLAYER_CLASSES) this._profile.classes[cls.id] = this._bucket(raw.classes?.[cls.id]);
        } else {
            let meaningful = false;
            try {
                const owned = readJSON('mvm_upgrades', []);
                const unlocks = readJSON('mvm_unlocks_v1', {});
                meaningful = Number(localStorage.getItem('mvm_runs_started') || 0) > 0
                    || localStorage.getItem('mvm_first_run_done') === '1'
                    || Number(localStorage.getItem('mvm_sparks_lifetime') || 0) > 0
                    || Array.isArray(owned) && owned.length > 0
                    || ['daily', 'ascension', 'intel', 'saves', 'corrupted'].some(id => unlocks?.[id] === true)
                    || ['mvm_save_v1', ...['A', 'B', 'C'].map(slot => 'mvm_save_v1__' + slot)]
                        .some(key => !!localStorage.getItem(key));
            } catch (_) {}
            this._profile = { v: 1, mode: meaningful ? 'full' : 'guided', coreComplete: meaningful, legacy: meaningful, acknowledged: [],
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
    isIntroductory() { return !!this._profile && !this._profile.legacy && this.getMode() === 'guided'; },
    acknowledge(id, options = {}) {
        if (!this._enabled || options.practice || !this._profile || typeof id !== 'string') return false;
        push(this._profile.acknowledged, id);
        return this._save(options);
    },
    isAcknowledged(id) { return !!this._profile?.acknowledged.includes(id); },
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
        if (isClass(classId)) push(this._profile.classes[classId].practised, 'timing');
        if (classId === 'summoner') {
            push(this._profile.classes[classId].introduced, 'minion');
            push(this._profile.classes[classId].practised, 'minion');
        }
        this._save(options);
    },
    recordPractice(lesson, classId) {
        if (!this._enabled || !this._profile || !LESSONS.some(item => item.id === lesson) || !isClass(classId)) return false;
        const bucket = ['allies', 'timing'].includes(lesson) ? this._profile.classes[classId] : this._profile.shared;
        // Practice credit is evidence of a completed drill. It does not
        // introduce tools, advance a route, enqueue content or earn rewards.
        push(bucket.practised, lesson);
        return this._save();
    },
    recordAction(action, { classId, cost = 0, skill = false, signature = false, practice = false } = {}) {
        if (!this._enabled || practice || !this._profile) return;
        const ids = [action];
        if (action === 'minion') ids.push('allies');
        if (action === 'hostileMinions') ids.push('hostile');
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
        return { v: 2, route: 'guided-v2', classId, sector: 1, stage: 0, lesson: 'basics', combats: 0,
            completed: [], entered: [], foundationComplete: false,
            features: unique(['attack', 'defend', 'timing', 'endTurn', 'reroll', ...introduced,
                ...(classId === 'summoner' ? ['minion', 'classAbility'] : [])]), core: null, finished: false };
    },
    restoreRun(value) {
        if (value === null || value === undefined) return null;
        const routeV1 = value.v === 1 && value.route === 'first-sector-v1';
        const routeV2 = value.v === 2 && value.route === 'guided-v2';
        const steps = routeV2 ? this.steps(value.sector) : GUIDED_ROUTE;
        if ((!routeV1 && !routeV2) || !isClass(value.classId)
            || !Number.isInteger(value.stage) || value.stage < 0 || value.stage >= steps.length
            || !Number.isSafeInteger(value.combats) || value.combats < 0
            || typeof value.finished !== 'boolean'
            || !Array.isArray(value.features) || !value.features.every(id => FEATURES.includes(id))
            || !Array.isArray(value.completed) || !value.completed.every(id => typeof id === 'string')
            || (value.core && (!Number.isInteger(value.core.roomIndex) || value.core.roomIndex < 0 || value.core.roomIndex > 1
                || !Array.isArray(value.core.actions) || !value.core.actions.every(id => typeof id === 'string')))
            || (routeV2 && (!Number.isSafeInteger(value.sector) || value.sector < 1 || typeof value.foundationComplete !== 'boolean'
                || !Array.isArray(value.entered) || !value.entered.every(id => typeof id === 'string')
                || typeof value.lesson !== 'string'))) return null;
        return copy(value);
    },
    boundary(run, stage, { practice = false, sector = run?.sector || 1, nodeId } = {}) {
        if (run?.v === 2) return this.enter(run, stage, { practice, sector, nodeId });
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
    recordWin(run, nodeId, { boss = false, practice = false, sector = run?.sector || 1 } = {}) {
        const key = run?.v === 2 ? `${sector}:${nodeId}` : nodeId;
        if (!run || practice || run.completed.includes(key)) return;
        run.completed.push(key);
        run.combats++;
        this.recordAction('combatWin', { classId: run.classId, practice });
        if (run.v === 2) {
            if (boss && sector === 1) run.foundationComplete = true;
            if (boss) this.recordAction('boss', { classId: run.classId });
            if (boss && sector >= 5) run.finished = true;
            return;
        }
        if (boss) {
            run.finished = true;
            for (const feature of V1_FEATURES) { push(run.features, feature); this.introduce(feature, run.classId); }
            this.recordAction('boss', { classId: run.classId });
        }
    },
    canFeature(feature, run) { return !run || run.finished || run.v === 1 && !V1_FEATURES.includes(feature) || run.features.includes(feature); },
    steps(sector = 1) { return sector === 1 ? GUIDED_ROUTE_V2 : growthRoute(sector); },
    queue(id, { practice = false } = {}) {
        if (!this._enabled || practice || !this._profile || !FEATURES.includes(id)) return;
        push(this._profile.shared.available, id);
        push(this._profile.queue, id);
        this._save({ practice });
    },
    enter(run, stage, { practice = false, sector = run?.sector || 1, nodeId } = {}) {
        if (!run || practice) return;
        const steps = this.steps(sector);
        const index = Math.max(0, Math.min(steps.length - 1, stage));
        const step = steps[index];
        run.sector = sector;
        run.stage = index;
        const key = `${sector}:${nodeId || 'guide-' + index}`;
        if (run.entered.includes(key)) return;
        run.entered.push(key);
        run.lesson = step.lesson;
        const newlyIntroduced = (step.features || []).filter(id => !run.features.includes(id));
        for (const feature of step.features || []) {
            push(run.features, feature);
            this.introduce(feature, run.classId, { practice });
        }
        // Existing lessons leave one safe boundary for a contextual queue
        // item. Never introduce it halfway through a QTE or a paid action.
        const queue = this._profile?.queue || [];
        if (sector >= 2 && newlyIntroduced.length === 0 && step.type !== 'boss') {
            const feature = queue.find(id => !run.features.includes(id)
                && (id === 'shopHack' ? step.type === 'shop'
                    : ['fusions', 'corrupted', 'eventVariety'].includes(id) && step.type === 'combat'));
            if (feature) {
                push(run.features, feature);
                this.introduce(feature, run.classId, { practice });
                run.lesson = feature;
            }
        }
        if (this._profile) this._profile.queue = queue.filter(id => !run.features.includes(id));
        // A new sector always has its own explanation even after the common
        // sector-mechanics feature was introduced on a previous sector.
        if (step.lesson === 'sectorMechanics') this.introduce('sector_' + sector, run.classId, { practice });
        this._save({ practice });
    },
    route(run, sector = 1) {
        const steps = run?.v === 2 ? this.steps(sector) : GUIDED_ROUTE;
        if (run?.v === 2) { run.sector = sector; run.stage = 0; run.lesson = steps[0].lesson; }
        const nodes = [{ id: 'start', layer: 0, lane: 0, x: 50, y: 94, type: 'start', status: 'completed', connections: ['guide-0'] }];
        steps.forEach((step, stage) => nodes.push({ id: 'guide-' + stage, layer: stage + 1, lane: 0,
            x: stage % 2 ? 64 : 36, y: 86 - stage * (76 / Math.max(1, steps.length - 1)), type: step.type, guideStage: stage,
            lesson: step.lesson, label: step.title, shifting: false, status: stage === 0 ? 'available' : 'locked',
            connections: stage === steps.length - 1 ? [] : ['guide-' + (stage + 1)] }));
        return { nodes, currentIdx: 'start' };
    },
    handPlan(run, classId) {
        if (!run || run.finished || this.canFeature('advanced', run)) return null;
        const cd = PLAYER_CLASSES.find(cls => cls.id === classId)?.classDice;
        if (!cd) return null;
        if (run.v === 2 && run.sector >= 2) {
            if (['combos', 'momentum'].includes(run.lesson)) return [cd.attack, cd.attack, cd.defend, cd.mana, cd.minion, 'EARTHQUAKE'];
            return null;
        }
        const resources = this.canFeature('mana', run) && this.canFeature('skills', run);
        const allies = this.canFeature('minion', run);
        const fullKit = run.v === 2 && resources && allies && this.canFeature('signature', run);
        const count = fullKit ? 6 : resources ? (allies ? 5 : 4) : 3;
        const hand = [cd.attack, cd.defend];
        if (classId === 'summoner') hand.push(cd.minion);
        if (resources) hand.push(cd.mana, this.canFeature('status', run) ? 'CONSTRICT' : 'EARTHQUAKE');
        if (allies && !hand.includes(cd.minion)) hand.push(cd.minion);
        // Keep the ally and paid skill the player has already learned,
        // then add its newly introduced tool in the final introductory hand.
        if (fullKit) hand.push('SIGNATURE');
        else if (this.canFeature('signature', run)) hand[hand.length - 1] = 'SIGNATURE';
        while (hand.length < count) hand.push(cd.attack);
        return hand.slice(0, count);
    },
    allowDie(type, run) {
        if (!run || run.finished) return true;
        const data = DICE_TYPES[type];
        if (!data) return false;
        if (type === 'SIGNATURE') return this.canFeature('signature', run);
        if (data.isSkill) return this.canFeature('skills', run)
            && (run.v === 2 && this.canFeature('specialSkills', run) || type === 'EARTHQUAKE' || (this.canFeature('status', run) && type === 'CONSTRICT'));
        if (data.slot === 'mana') return this.canFeature('mana', run);
        if (data.slot === 'minion') return this.canFeature('minion', run);
        return true;
    },
    filterPool(items, kind, run) {
        if (!run || run.finished || this.canFeature('advanced', run)) return items;
        if (kind === 'events') {
            const safe = new Set(['ABANDONED CACHE', 'AUTOMATED MEDBAY']);
            return items.filter(item => safe.has(item.title) || this.canFeature('eventVariety', run)
                && (!/CORRUPT|GLITCH|HEX-BREACHED/.test(item.title) || this.canFeature('corrupted', run))
                && (item.title !== 'DETONATION DRILL' || this.canFeature('enemy_detonator', run)));
        }
        return items.filter(item => (simple.has(item.id) || run.v === 2 && this.canFeature('synergies', run))
            && (!['voodoo_doll', 'overcharge_chip', 'reckless_drive', 'gamblers_chip'].includes(item.id) || run.v === 2 && this.canFeature('specialSkills', run))
            && (!['mana_up', 'mana_battery', 'mana_syphon'].includes(item.id) || this.canFeature('mana', run))
            && (!['minion_core', 'wisp_hp'].includes(item.id) || this.canFeature('minion', run)));
    },
    enemyPool(items, run) {
        if (!run || run.finished || run.v === 1 && run.finished) return items;
        if (run.sector === 1 || run.v === 1) return items.filter(item =>
            (run.stage < 5 ? ['Sentry Drone'] : ['Sentry Drone', 'Heavy Loader']).includes(item.name));
        const kind = run.lesson?.startsWith('enemy_') ? run.lesson.slice(6) : null;
        if (kind && items.some(item => item.kind === kind)) return items.filter(item => item.kind === kind);
        return items.filter(item => !item.kind || item.kind === 'swarm' && this.canFeature('hostileMinions', run)
            || this.canFeature('enemy_' + item.kind, run));
    },
    firstRewards(pool) { return ['hull_plating', 'nano_shield', 'titan_module'].map(id => pool.find(item => item.id === id)).filter(Boolean); },
    objective(run, classId) {
        if (!run || run.finished) return null;
        if (run.v === 2) return this.objectiveV2(run, classId);
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
    objectiveV2(run, classId) {
        const steps = this.steps(run.sector);
        const step = steps[run.stage] || steps[0];
        const lesson = run.lesson || step.lesson;
        const texts = {
            basics: 'Read the intent. Attack the enemy, use your class defence, then End Turn. Timing bonuses are optional.',
            reroll: classId === 'annihilator'
                ? 'Select useful dice to keep them. After free rerolls and earned tokens run out, another reroll costs 20% of Max HP. Read the cost before paying.'
                : 'Select a useful die to keep it, then reroll the others. You can still progress without using every tool.',
            rest: 'Choose one preparation benefit. Fragments belong to this run. Sparks and permanent purchases survive a loss.',
            resources: classId === 'bloodstalker'
                ? 'Blood Price spends HP to gain Mana. Read that HP cost first. Earthquake is a separate skill that costs 2 Mana.'
                : 'Use your resource die to gain Mana. Earthquake costs 2 Mana and damages every enemy. Its paid cost is visible on the die.',
            shop: 'Spend run Fragments on a concrete benefit, or leave and keep them. Ordinary purchasing comes before optional hacking.',
            allies: ({ tactician: 'Deploy a Pawn. Attacks build Command pips; when the control is ready, spend them on a visible class benefit.',
                annihilator: 'Deploy a Bomb Bot. Dice build Heat; read the lit Vent control and its self-damage warning before venting.',
                bloodstalker: 'Raise a Thrall. Actual HP loss fills Blood Pool; read a Tribute cost and payoff before spending it.',
                sentinel: 'Deploy a Guardian. Shield gains fill Aegis plates; three ready plates cancel the next enemy attack.',
                arcanist: 'Deploy your Glyph. Read the rotating element and activate its lit class control for that element\'s payoff.',
                summoner: 'Call a Spirit and let it act. Summons grow the Grove; a ready plot can produce another Spirit.' })[classId],
            allyTiming: classId === 'annihilator'
                ? 'Bomb Bots act automatically and spend a charge for 10 raw area damage. Their fixed blast has no boost prompt.'
                : 'A friendly volley now offers one optional boost. Read its integer bonus. Missing keeps base ally damage and every strike still animates.',
            status: 'Constrict costs 3 Mana. Apply it, read its remaining duration, and compare the changed enemy intent before ending a turn.',
            hostile: 'One hostile Bot has its own HP and intent. Try targeting it before the main enemy. Removing a support changes how many threats remain.',
            multiwave: 'This enemy previews two hits. Read both waves and prepare defence. A missed timing input still resolves the ordinary incoming attack.',
            signature: 'Your free class Signature is now available. Practise its real timing rhythm; it does not demonstrate paying Mana.',
            elite: `Read the elite rule${run.eliteAffix ? ': ' + run.eliteAffix : ''} before committing attacks. Hostile targets and repeated hits were introduced separately.`,
            boss: 'Inspect the pinned boss rule and counter, then prepare your defence. Sparks remain after the run; Fragments stay with this run.',
            sectorMechanics: `SECTOR ${run.sector}: ${SECTOR_MECHANICS[run.sector]?.desc || 'Read the current sector rule before taking the next fight.'}`,
            combos: 'Two attack dice form Double Strike. Play the highlighted attack pair and read the real damage payoff. Perfect timing is optional.',
            momentum: 'Fully played combos build Momentum without requiring Perfect timing. Read the meter and its next threshold as you play.',
            synergies: 'Some modules work as a named combination. The offer card shows missing parts. Choose a useful component; a completed combination grants its actual listed benefit.',
            fusions: 'You own both source modules of a Fusion. The next eligible reward can offer it; choosing it consumes one copy of each source and installs the displayed replacement.',
            shopHack: 'You have made an ordinary purchase and can afford this optional hack. Success reduces unbought prices; failure doubles them. You may keep shopping without hacking.',
            corrupted: 'This run has selected Ascension rules. Corrupted offers have a benefit and a real drawback. Read both before choosing one; they are optional.',
            specialSkills: 'More paid skill types can now enter your offers. Read their Mana or HP cost, target and duration before unlocking one.',
            events: 'Read each written consequence before choosing. This first event uses familiar healing and Fragment benefits.',
            eventVariety: 'Later events can trade HP, resources or a build change. Read the full cost and consequence; unlocked mechanics still follow this run\'s rules.',
            review: 'Use the tools you have introduced. Nothing here requires a Perfect result or a particular build choice.'
        };
        const enemyLesson = lesson.startsWith('enemy_') ? KIND_LESSONS[lesson.slice(6)] : null;
        return { title: lesson === 'allyTiming' && classId === 'annihilator' ? 'Bomb Bot charges'
            : enemyLesson?.[0] || (lesson === step.lesson ? step.title : lesson === 'shopHack' ? 'Optional shop hack' : lesson === 'fusions' ? 'A fusion opportunity' : 'A new build option'),
            text: enemyLesson?.[1] || texts[lesson] || texts.review, progress: `${run.stage + 1} / ${steps.length}` };
    },
    lessons(classId) {
        return LESSONS.map(item => ({ ...item, available: true,
            complete: !['allies', 'timing'].includes(item.id) && !!this._profile?.shared.practised.includes(item.id)
                || !!this._profile?.classes[classId]?.practised.includes(item.id) }));
    }
};
