import { CONFIG, COLORS, SECTOR_CONFIG, SECTOR_MECHANICS, STATE, LORE_DATABASE, TUTORIAL_PAGES, POST_TUTORIAL_PAGES, TUTORIAL_NARRATION, PLAYER_CLASSES, DICE_TYPES, META_UPGRADES, UPGRADES_POOL, CORRUPTED_RELICS, GLITCH_MODIFIERS, DICE_UPGRADES, SIGNATURE_DICE, ENEMIES, BOSS_DATA, EVENTS_DB, SYNERGIES, CUSTOM_RUN_MODIFIERS, FEATURE_CUSTOM_RUNS } from './constants.js';
import { AudioMgr } from './audio.js';
import { Entity, registerEntityClasses } from './entities/entity.js';
import { Player } from './entities/player.js';
import { Minion } from './entities/minion.js';
import { Enemy } from './entities/enemy.js';
import { ParticleSys } from './effects/particles.js';
import { TooltipMgr } from './ui/tooltip.js';
import { ClassAbility } from './ui/class-ability.js';
import { ICONS, iconImage, drawIcon, preloadCombatIcons } from './ui/icons.js';
import { drawIntentIcon, drawEffectIcon } from './ui/canvas-icons.js';
import { Ascension, ASCENSION_TWISTS } from './services/ascension.js';
import { Dailies, mulberry32 } from './services/dailies.js';
import { Achievements, ACHIEVEMENTS } from './services/achievements.js';
import { Streak } from './services/streak.js';
import { Hints } from './services/hints.js';
import { Analytics } from './services/analytics.js';
import { CombatLog } from './services/combat-log.js';
import { Unlocks } from './services/unlocks.js';
import { Share } from './services/share.js';
import { Assist } from './services/assist.js';
import { Intel } from './services/intel.js';
import { SaveSync } from './services/save-sync.js';
import { Onboarding } from './services/onboarding.js';
import { ClassBriefing } from './services/class-briefing.js';
import { Perf } from './services/perf.js';

registerEntityClasses(Player, Minion, Enemy);

const Game = {
    canvas: null, ctx: null, lastTime: 0, currentState: STATE.BOOT,
    player: null, enemy: null, techFragments: 0,
    dicePool: [], rerolls: 2, shakeTime: 0, mouseX: 0, mouseY: 0,
    map: { nodes: [], currentIdx: -1 },
    turnCount: 0,
    attacksThisTurn: 0,
    tutorialPage: 0,
    currentHoverEntity: null,
    effects: [],
    
    qte: {
        active: false,
        type: null, 
        targetX: 0,
        targetY: 0,
        radius: 0,
        maxRadius: 100,
        timer: 0,
        callback: null
    },

    metaUpgrades: [],
    
    dragState: {
        active: false,
        die: null,
        dieElement: null,
        ghostElement: null,
        startX: 0,
        startY: 0
    },

    sleep(ms) {
        // combatPaceMult scales wait durations: >1 is faster (shorter wait), <1 slower.
        const mult = this.combatPaceMult || 1;
        const scaled = Math.max(1, Math.round(ms / mult));
        return new Promise(resolve => setTimeout(resolve, scaled));
    },

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        // --- Performance tier detection (must run before renderScale) ---
        Perf.detect();
        ParticleSys.quality = Perf.particleQuality();
        if (Perf.tier === 'low') ParticleSys.maxParticles = 128;
        else if (Perf.tier === 'mid') ParticleSys.maxParticles = 220;
        // Runtime FPS watchdog — downgrades tier if sustained sub-48fps,
        // bounces back on sustained 58+. Respects user override (no-op if
        // they've pinned a specific tier in Settings).
        Perf.startMonitor();
        // React to tier changes live so active runs pick up the new caps.
        const syncParticleBudget = () => {
            ParticleSys.quality = Perf.particleQuality();
            if (Perf.tier === 'low') ParticleSys.maxParticles = 128;
            else if (Perf.tier === 'mid') ParticleSys.maxParticles = 220;
            else ParticleSys.maxParticles = 384;
        };
        // Patch setTier to also call our syncer. Wraps once.
        if (!Perf._patchedTierHook) {
            Perf._patchedTierHook = true;
            const origSetTier = Perf.setTier.bind(Perf);
            Perf.setTier = function (t) { origSetTier(t); syncParticleBudget(); };
        }

        // --- HiDPI canvas (crisp at all device pixel ratios) ---
        // On low/mid tier devices, cap at 1× to save 4× pixel-fill cost.
        // High tier keeps the crisp 2× backbuffer.
        const dpr = window.devicePixelRatio || 1;
        const maxScale = Perf.tier === 'low' ? 1 : (Perf.tier === 'mid' ? 1.5 : 2);
        const renderScale = Math.min(maxScale, Math.max(1, dpr));
        this.renderScale = renderScale;
        this.canvas.width  = CONFIG.CANVAS_WIDTH  * renderScale;
        this.canvas.height = CONFIG.CANVAS_HEIGHT * renderScale;
        this.ctx.scale(renderScale, renderScale);

        // On mid/low tier, intercept shadowBlur so all 200+ existing callsites
        // automatically scale down (or disable) the Gaussian blur pass — the
        // single biggest Canvas 2D GPU cost. Zero code changes to draw methods.
        if (Perf.tier !== 'high') {
            const sbScale = Perf.tier === 'low' ? 0 : 0.4;
            const origDesc = Object.getOwnPropertyDescriptor(
                CanvasRenderingContext2D.prototype, 'shadowBlur'
            );
            if (origDesc && origDesc.set) {
                Object.defineProperty(this.ctx, 'shadowBlur', {
                    get() { return origDesc.get.call(this); },
                    set(v) { origDesc.set.call(this, v * sbScale); },
                    configurable: true
                });
            }
        }

        // Smooth-edge defaults — applied once, persist across frames because
        // no code in this file ever calls setTransform/resetTransform.
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.miterLimit = 2;
        this.ctx.textBaseline = 'alphabetic';
        // -------------------------------------------------------------

        this.shopInventory = null;
        this.inputCooldown = 0; 
    
        this.tutorialStep = 0; 
        this.tutorialData = TUTORIAL_PAGES; 

        // ... (Keep existing LocalStorage loading logic unchanged) ...
        try {
            const savedFrags = localStorage.getItem('mvm_fragments');
            this.techFragments = savedFrags ? parseInt(savedFrags) : 0;
            const savedMeta = localStorage.getItem('mvm_upgrades');
            this.metaUpgrades = savedMeta ? JSON.parse(savedMeta) : [];
            const savedEncrypted = localStorage.getItem('mvm_encrypted');
            this.encryptedFiles = savedEncrypted ? parseInt(savedEncrypted) : 0;
            const savedLore = localStorage.getItem('mvm_lore');
            this.unlockedLore = savedLore ? JSON.parse(savedLore) : [];
            const savedSeen = localStorage.getItem('mvm_seen');
            this.seenFlags = savedSeen ? JSON.parse(savedSeen) : {};
            const savedCorruption = localStorage.getItem('mvm_corruption');
            this.corruptionLevel = savedCorruption ? parseInt(savedCorruption) : 0;
            const saveFile = localStorage.getItem('mvm_save_v1');
            const btnLoad = document.getElementById('btn-load-save');
            if (saveFile && saveFile !== "null") {
                if (btnLoad) {
                    btnLoad.classList.remove('hidden');
                    btnLoad.style.display = "inline-block"; 
                    const data = JSON.parse(saveFile);
                    btnLoad.innerText = "RESUME RUN";
                }
            } else {
                if (btnLoad) btnLoad.style.display = "none";
            }
        } catch (e) {
            console.warn("LocalStorage error:", e);
            this.techFragments = 0; this.metaUpgrades = []; this.seenFlags = {}; this.corruptionLevel = 0;
        }

        if (this.corruptionLevel > 0) {
            const sub = document.querySelector('.subtitle');
            if(sub) { sub.innerText = `ASCENSION LEVEL ${this.corruptionLevel}`; sub.style.color = '#ff0055'; }
        }
        this.effects = [];
        const fragEl = document.getElementById('run-fragments');
        if(fragEl) fragEl.innerText = this.techFragments;
        const fragCountEl = document.getElementById('fragment-count');
        if(fragCountEl) fragCountEl.innerText = `Fragments: ${this.techFragments}`;

        // iOS/WKWebView requires audio to start from a user-gesture handler.
        // Listen on every gesture type we might see (including pointerdown and
        // keydown for keyboard users) so the first interaction unlocks no
        // matter where the user taps.
        const unlockAudio = () => {
            AudioMgr.init(); AudioMgr.startMusic();
            ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(ev =>
                window.removeEventListener(ev, unlockAudio)
            );
        };
        ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(ev =>
            window.addEventListener(ev, unlockAudio, { once: false, passive: true })
        );

        // Intro splash — tap-to-continue overlay. Fades out, starts music, reveals main menu.
        const intro = document.getElementById('intro-overlay');
        if (intro) {
            // (Daily-seed preview element was removed during the intro declutter;
            // the population code that lived here is gone with it.)
            const dismissIntro = () => {
                if (intro.dataset.dismissed) return;
                intro.dataset.dismissed = '1';
                AudioMgr.init();
                AudioMgr.startMusic();
                intro.classList.add('intro-fade');
                setTimeout(() => intro.remove(), 750);
                // Safety net for mobile background-restore: if the browser
                // reloaded the page from a suspended state the main menu
                // may still be hidden when we finish the intro. Force it
                // visible so the tap doesn't dead-end in a black screen.
                const startEl = document.getElementById('screen-start');
                if (startEl) {
                    startEl.classList.remove('hidden');
                    startEl.classList.add('active');
                }

                // First-launch onboarding (§1.1). Skipped on subsequent launches.
                if (!Onboarding.isComplete()) {
                    Onboarding.run({
                        onFinished: () => {
                            // Don't trust that the menu is still visible — on
                            // iOS Safari/Brave the screen-start's .active flag
                            // sometimes gets lost behind the onboarding overlay
                            // and SKIP leaves the player looking at a black
                            // page. Force a MENU transition so there's always
                            // something to fall back to.
                            if (this.currentState !== STATE.MENU) {
                                this.changeState(STATE.MENU);
                            } else {
                                // Already MENU — just make sure screen-start
                                // is actually active and visible.
                                const el = document.getElementById('screen-start');
                                if (el) {
                                    el.classList.remove('hidden');
                                    el.classList.add('active');
                                }
                            }
                        },
                        onStartTutorial: () => {
                            // Ensure the tutorial auto-runs after class selection.
                            try { localStorage.removeItem('mvm_first_run_done'); } catch (e) {}
                            this.tutorialAutoRun = true;
                            // Take the player into character select so they
                            // pick a class; the tutorial fires automatically
                            // from there via the first-run path in selectClass().
                            this.goToCharSelect && this.goToCharSelect();
                        }
                    });
                }
            };
            intro.addEventListener('click', dismissIntro);
            intro.addEventListener('touchstart', (e) => { e.preventDefault(); dismissIntro(); }, { passive: false });
            intro.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dismissIntro(); }
            });
        }

        this.bindEvents();
        TooltipMgr.init();
        ClassAbility.init(this);
        preloadCombatIcons(['#ffffff', '#00ff99', '#ff3355', '#ffd76a', '#bc13fe', '#00f3ff']);
        this.loadSettings();
        this.bindKeyboardShortcuts();
        this.bindHapticDelegation();
        this.bindTabVisibility();
        this.installErrorBoundary();
        // Expose globally so achievement service can grant fragments
        if (typeof window !== 'undefined') {
            window.Game = this;
            window.ParticleSys = ParticleSys;
        }
        // Cache class refs the boss phase mechanics / elite affixes need to
        // spawn minions without re-importing at runtime (entity.js already
        // holds the late-bound reference, but the boss script runs off Game).
        this._MinionClass = Minion;
        this._EnemyClass = Enemy;
        this._PlayerClass = Player;
        this.changeState(STATE.MENU);
        // Process login streak — grants bonus fragments daily
        try {
            const s = Streak.tick();
            if (s.claimedReward) {
                this.techFragments += s.bonusFragments;
                this._streakBonusPending = { streak: s.newStreak, bonus: s.bonusFragments };
            }
            // Streak-tier achievements
            if (typeof Achievements !== 'undefined') {
                if (s.newStreak >= 30) Achievements.unlock('STREAK_30');
                if (s.newStreak >= 7)  Achievements.unlock('STREAK_7');
                if (s.newStreak >= 3)  Achievements.unlock('STREAK_3');
            }
        } catch (e) { /* ignore */ }
        // Fire fragment milestone at boot
        if (typeof Achievements !== 'undefined') {
            if (this.techFragments >= 10000) Achievements.unlock('FRAGMENTS_10K');
        }
        // Bind the loop ONCE so requestAnimationFrame doesn't allocate a new
        // bound function every frame. That allocation was a steady source of
        // GC churn on mobile and correlated with the combat-lag drift
        // players hit after several minutes of play.
        this._boundLoop = this.loop.bind(this);
        requestAnimationFrame(this._boundLoop);
    },

     bindEvents() {
        const d = document;
        
        const attachButtonEvent = (id, callback) => {
            const btn = d.getElementById(id);
            if (!btn) return;
            btn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: false });
            btn.onclick = (e) => {
                e.stopPropagation(); 
                e.preventDefault();  
                btn.blur(); 
                TooltipMgr.hide();
                
                if (AudioMgr.ctx && AudioMgr.ctx.state === 'suspended') AudioMgr.ctx.resume();
                AudioMgr.startMusic();
                AudioMgr.playSound('click');
                
                callback(e);
            };
        };

        // --- BUTTON BINDINGS ---
        attachButtonEvent('btn-load-save', () => this.loadGame());
        attachButtonEvent('btn-resume', () => d.getElementById('modal-settings').classList.add('hidden'));
        // Cache the genuine Math.random so we can restore it after a seeded daily run.
        if (!Game._origRandom) Game._origRandom = Math.random;
        attachButtonEvent('btn-start', () => {
            // Restore unseeded RNG for normal runs
            Math.random = Game._origRandom;
            Dailies.markActive(false);
            this.seenFlags['intro_cinematic'] = true;
            localStorage.setItem('mvm_seen', JSON.stringify(this.seenFlags));
            this.playIntro();
        });
        attachButtonEvent('btn-daily', () => {
            if (!Dailies.isDailyAvailable()) {
                ParticleSys.createFloatingText(540, 600, 'DAILY ALREADY COMPLETE', '#888');
                return;
            }
            // Seed Math.random so every player gets the same map + relic rolls today
            const seed = Dailies.getTodaySeed();
            Game.rng = mulberry32(seed);
            Math.random = Game.rng;
            Dailies.markActive(true);
            // Mark intro / first-run as already seen so neither the storyboard
            // cinematic NOR the beginner tutorial fires — daily runs are always
            // short, focused attempts, not a fresh-install experience.
            this.seenFlags['intro_cinematic'] = true;
            localStorage.setItem('mvm_seen', JSON.stringify(this.seenFlags));
            localStorage.setItem('mvm_first_run_done', '1');
            this.tutorialAutoRun = false;
            // Wipe any pending prior run so the character picker actually starts a fresh seeded run
            localStorage.removeItem('mvm_save_v1');
            const btnLoad = document.getElementById('btn-load-save');
            if (btnLoad) btnLoad.style.display = 'none';
            // Show a brief banner announcing Daily Run, then straight to character select
            if (this.showPhaseBanner) {
                this.showPhaseBanner('DAILY RUN', Dailies.todayString(), 'player');
            }
            this.changeState(STATE.CHAR_SELECT);
        });
        attachButtonEvent('btn-back-char', () => this.changeState(STATE.MENU));
        attachButtonEvent('btn-char-detail-back', () => this.closeCharDetail());
        attachButtonEvent('btn-char-detail-confirm', () => this.confirmCharDetail());
        // btn-tutorial-mode removed — tutorial only fires from the storyboard's TUTORIAL button.
        attachButtonEvent('btn-tutorial-skip', () => this.skipFirstRunTutorial());
        attachButtonEvent('btn-finish-story', () => { 
            AudioMgr.startMusic(); 
            this.changeState(STATE.MENU); 
        });
        attachButtonEvent('btn-back-tutorial', () => {
            this.tutorialData = TUTORIAL_PAGES;
            this.changeState(STATE.MENU); 
        });
        attachButtonEvent('btn-intel', () => this.changeState(STATE.INTEL));
        attachButtonEvent('btn-back-intel', () => this.changeState(STATE.MENU));
        attachButtonEvent('btn-view-codex', () => this.changeState(STATE.CODEX));
        attachButtonEvent('btn-back-codex', () => this.changeState(STATE.INTEL));
        // Save export/import — local-first, cloud-ready.
        attachButtonEvent('btn-export-analytics', () => {
            Analytics.exportJSON();
        });
        attachButtonEvent('btn-export-save', () => {
            const blob = SaveSync.exportAll();
            const json = JSON.stringify(blob, null, 2);
            const file = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mvm-save-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            ParticleSys.createFloatingText(540, 800, 'SAVE EXPORTED', COLORS.GOLD);
        });
        attachButtonEvent('btn-import-save', () => {
            const picker = document.getElementById('file-import-save');
            if (picker) picker.click();
        });
        const fileInput = document.getElementById('file-import-save');
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                try {
                    const text = await f.text();
                    const blob = JSON.parse(text);
                    if (SaveSync.importAll(blob)) {
                        ParticleSys.createFloatingText(540, 800, 'SAVE IMPORTED — RELOADING', COLORS.GOLD);
                        setTimeout(() => window.location.reload(), 900);
                    } else {
                        ParticleSys.createFloatingText(540, 800, 'INVALID SAVE FILE', '#ff3355');
                    }
                } catch (err) {
                    ParticleSys.createFloatingText(540, 800, 'IMPORT FAILED', '#ff3355');
                }
            });
        }
        attachButtonEvent('btn-decrypt', () => this.startHexBreach());
        attachButtonEvent('btn-upgrades', () => {
            this.renderMeta();
            this.changeState(STATE.META);
        });
        attachButtonEvent('btn-back-meta', () => {
            const screen = d.getElementById('screen-meta');
            const btn = d.getElementById('btn-view-sanctuary');
            screen.classList.remove('viewing-mode');
            btn.innerText = "👁️ VIEW WORLD";
            d.getElementById('upgrade-list').style.opacity = "";
            d.getElementById('fragment-count').style.opacity = "";
            const h2 = d.querySelector('#screen-meta h2');
            if(h2) h2.style.opacity = "";
            this.changeState(STATE.MENU);
        });
        attachButtonEvent('btn-view-sanctuary', () => {
            const screen = d.getElementById('screen-meta');
            const btn = d.getElementById('btn-view-sanctuary');
            if (screen.classList.contains('viewing-mode')) {
                screen.classList.remove('viewing-mode');
                btn.innerText = "👁️ VIEW WORLD";
            } else {
                screen.classList.add('viewing-mode');
                btn.innerText = "🔙 RESTORE UI";
            }
            AudioMgr.playSound('click');
        });
        attachButtonEvent('btn-reroll', () => this.rerollDice());
        attachButtonEvent('btn-end-turn', () => {
            this.dicePool.forEach(d => d.selected = false);
            this.renderDiceUI();
            this.endTurn();
        });
        const handleSettings = () => {
            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2, "COMPLETE TUTORIAL FIRST!", "#ff0000");
                AudioMgr.playSound('defend');
            } else {
                d.getElementById('modal-settings').classList.remove('hidden');
            }
        };
        attachButtonEvent('btn-settings', handleSettings);
        attachButtonEvent('btn-settings-main', handleSettings);
        attachButtonEvent('btn-quit', () => this.quitRun());
        attachButtonEvent('btn-menu', () => this.changeState(STATE.MENU));
        attachButtonEvent('btn-retry-class', () => this.retrySameClass());
        attachButtonEvent('btn-combat-log', () => CombatLog.toggle());
        attachButtonEvent('btn-share-run', () => {
            const summary = {
                win: false,
                operator: Onboarding.getName && Onboarding.getName(),
                className: this.player && PLAYER_CLASSES.find(c => c.id === this.player.classId)?.name,
                classColor: this.player && PLAYER_CLASSES.find(c => c.id === this.player.classId)?.color,
                sector: this.sector || 1,
                turns: this.turnCount || 0,
                fragments: this.techFragments || 0,
                killName: this.enemy ? this.enemy.name : null,
                synergies: (this.runStats && this.runStats.synergies) || []
            };
            Share.shareRun(summary);
        });
        d.getElementById('chk-music').onchange = (e) => { AudioMgr.toggleMusic(e.target.checked); this.saveSettings(); };
        d.getElementById('chk-sfx').onchange = (e) => { AudioMgr.toggleSFX(e.target.checked); this.saveSettings(); };
        
        // --- NEW: GOD MODE LISTENER ---
        d.getElementById('chk-godmode').onchange = (e) => {
            this.godMode = e.target.checked;
            this.saveSettings();
            if(this.godMode && this.player) {
                this.player.mana = 99;
                this.rerolls = 99;
                this.player.currentHp = this.player.maxHp;
                this.updateHUD();
                if(this.currentState === STATE.COMBAT) {
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "GOD MODE ACTIVE", "#ff0055");
                    AudioMgr.playSound('upgrade');
                }
            }
        };

        // --- Settings modal tabs ---
        d.querySelectorAll('.settings-tab').forEach(tab => {
            tab.onclick = () => {
                const target = tab.dataset.tab;
                d.querySelectorAll('.settings-tab').forEach(t => t.classList.toggle('active', t === tab));
                d.querySelectorAll('.settings-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === target));
            };
        });

        // --- Settings hooks (persist on every change) ---
        const hookSetting = (id, handler) => {
            const el = d.getElementById(id);
            if (!el) return;
            el.onchange = (e) => { handler(e.target); this.saveSettings(); };
            el.oninput = (e) => { handler(e.target); /* don't persist every input tick */ };
        };

        hookSetting('sld-music-vol', (el) => {
            const vol = Number(el.value) / 100;
            AudioMgr.setMusicVolume(vol);
            const v = d.querySelector('.setting-value[data-for="sld-music-vol"]');
            if (v) v.textContent = el.value;
        });
        hookSetting('sld-sfx-vol', (el) => {
            const vol = Number(el.value) / 100;
            AudioMgr.setSFXVolume(vol);
            const v = d.querySelector('.setting-value[data-for="sld-sfx-vol"]');
            if (v) v.textContent = el.value;
        });
        hookSetting('sld-ambient-vol', (el) => {
            const vol = Number(el.value) / 100;
            AudioMgr.setAmbientVolume && AudioMgr.setAmbientVolume(vol);
            const v = d.querySelector('.setting-value[data-for="sld-ambient-vol"]');
            if (v) v.textContent = el.value;
        });
        hookSetting('sel-music-track', (el) => {
            AudioMgr.setTrack && AudioMgr.setTrack(el.value);
        });
        hookSetting('sld-text-scale', (el) => {
            const scale = Number(el.value) / 100;
            document.documentElement.style.setProperty('--text-scale-multiplier', scale);
            const v = d.querySelector('.setting-value[data-for="sld-text-scale"]');
            if (v) v.textContent = el.value + '%';
        });
        hookSetting('chk-reduced-motion', (el) => {
            document.body.classList.toggle('reduced-motion', el.checked);
        });
        hookSetting('chk-high-contrast', (el) => {
            document.body.classList.toggle('high-contrast', el.checked);
        });
        hookSetting('sel-colorblind', (el) => {
            document.body.classList.remove('cb-deuteranopia', 'cb-protanopia', 'cb-tritanopia');
            if (el.value !== 'none') document.body.classList.add('cb-' + el.value);
        });
        hookSetting('sel-dmg-size', (el) => {
            this.damageNumberSize = el.value; // read in ParticleSys if needed
        });
        hookSetting('sld-combat-pace', (el) => {
            // 60..150 percent; translates to a multiplier applied to pacing helpers.
            const pct = Number(el.value) || 100;
            this.combatPaceMult = pct / 100;
            const v = d.querySelector('.setting-value[data-for="sld-combat-pace"]');
            if (v) v.textContent = el.value + '%';
        });
        hookSetting('chk-tutorial-hints', (el) => {
            this.tutorialHintsEnabled = el.checked;
        });
        hookSetting('chk-haptics', (el) => {
            this.hapticsEnabled = el.checked;
        });
        hookSetting('chk-assist', (el) => {
            // Disabling sets a flag that overrides the HP multiplier to 1.
            this.assistDisabled = !el.checked;
        });
        hookSetting('chk-reduced-glow', (el) => {
            document.body.classList.toggle('reduced-glow', el.checked);
            this.reducedGlow = !!el.checked;
        });
        hookSetting('chk-large-touch', (el) => {
            document.body.classList.toggle('large-touch', el.checked);
        });
        hookSetting('sel-handedness', (el) => {
            const v = el.value === 'left' ? 'left' : 'right';
            document.body.setAttribute('data-hand', v);
        });
        hookSetting('chk-auto-qte', (el) => {
            this.autoQTE = !!el.checked;
        });
        hookSetting('sel-perf-tier', (el) => {
            const v = el.value;
            if (v === 'auto') {
                try { localStorage.removeItem('mvm_perf_override'); } catch (e) {}
            } else {
                try { localStorage.setItem('mvm_perf_override', v); } catch (e) {}
            }
            ParticleSys.createFloatingText(540, 800, 'PERF MODE: ' + v.toUpperCase() + ' (RESTART)', '#00f3ff');
        });

        // --- Achievements viewer ---
        attachButtonEvent('btn-achievements', () => this.changeState(STATE.ACHIEVEMENTS));
        attachButtonEvent('btn-back-achievements', () => this.changeState(STATE.META));

        // --- Replay tutorial on next run ---
        attachButtonEvent('btn-replay-tutorial', () => {
            localStorage.removeItem('mvm_first_run_done');
            // Reset onboarding so the scripted 5-stage flow runs again on
            // next app load (player must manually reload to see it).
            Onboarding.reset && Onboarding.reset();
            // Also reset class briefings so each class feels fresh again.
            ClassBriefing.reset && ClassBriefing.reset();
            this.tutorialAutoRun = true;
            ParticleSys.createFloatingText(540, 800, 'TUTORIAL WILL REPLAY ON NEXT LAUNCH', '#00f3ff');
            const modal = d.getElementById('modal-settings');
            if (modal) modal.classList.add('hidden');
        });

        // --- Reset progress (two-step confirmation) ---
        attachButtonEvent('btn-reset-progress', () => {
            d.getElementById('reset-progress-confirm').classList.remove('hidden');
        });
        attachButtonEvent('btn-reset-cancel', () => {
            d.getElementById('reset-progress-confirm').classList.add('hidden');
        });
        attachButtonEvent('btn-reset-confirm', () => this.resetAllProgress());

        // --- DEV tab handlers ---
        const ascSlider = d.getElementById('sld-ascension');
        if (ascSlider) {
            ascSlider.oninput = (e) => {
                const v = d.querySelector('.setting-value[data-for="sld-ascension"]');
                if (v) v.textContent = e.target.value;
            };
            ascSlider.onchange = (e) => {
                this.corruptionLevel = parseInt(e.target.value, 10) || 0;
                try { localStorage.setItem('mvm_corruption', this.corruptionLevel); } catch (err) {}
                // Update menu ascension label if visible
                if (this.corruptionLevel > 0) {
                    const sub = d.querySelector('.subtitle');
                    if (sub) { sub.innerText = `ASCENSION LEVEL ${this.corruptionLevel}`; sub.style.color = '#ff0055'; }
                }
                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, 60, `ASCENSION → ${this.corruptionLevel}`, '#ff0055');
            };
        }
        attachButtonEvent('btn-dev-frags', () => {
            this.techFragments += 500;
            try { localStorage.setItem('mvm_fragments', this.techFragments); } catch (e) {}
            const el = d.getElementById('fragment-count');
            if (el) el.innerText = `Fragments: ${this.techFragments}`;
            const runFrag = d.getElementById('run-fragments');
            if (runFrag) runFrag.innerText = this.techFragments;
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, 60, '+500 FRAGMENTS', COLORS.GOLD);
        });
        attachButtonEvent('btn-dev-reset-meta', () => {
            this.metaUpgrades = [];
            try { localStorage.setItem('mvm_upgrades', JSON.stringify(this.metaUpgrades)); } catch (e) {}
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, 60, 'SANCTUARY CLEARED', '#ff0055');
            if (this.currentState === STATE.META) this.renderMeta && this.renderMeta();
        });
        attachButtonEvent('btn-dev-skip-sector', () => {
            if (this.currentState !== STATE.MAP && this.currentState !== STATE.COMBAT) return;
            this.sector = Math.min(5, (this.sector || 1) + 1);
            this.bossDefeated = false;
            this.generateMap();
            this.enemy = null;
            this.changeState(STATE.MAP);
            const sectorDisplay = d.getElementById('sector-display');
            if (sectorDisplay) sectorDisplay.innerText = `SECTOR ${this.sector}`;
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, 60, `SECTOR ${this.sector}`, COLORS.PURPLE);
        });
        attachButtonEvent('btn-dev-kill-enemy', () => {
            if (this.enemy && this.enemy.currentHp > 0) {
                this.enemy.currentHp = 0;
                this.winCombat();
            }
        });

        attachButtonEvent('btn-tut-next', () => this.nextTutorial());
        attachButtonEvent('btn-tut-prev', () => this.prevTutorial());
        attachButtonEvent('btn-leave-shop', () => this.leaveShop());
        attachButtonEvent('btn-rest-sleep', () => this.handleRest('sleep'));
        attachButtonEvent('btn-rest-meditate', () => this.handleRest('meditate'));
        attachButtonEvent('btn-rest-tinker', () => this.handleRest('tinker'));
        attachButtonEvent('btn-finish-ending', () => { this._renderVictoryCard(); this.changeState(STATE.VICTORY); });
        attachButtonEvent('btn-share-victory', () => {
            if (typeof Share !== 'undefined' && Share.shareRun) Share.shareRun(this);
        });
        attachButtonEvent('btn-victory-sanctuary', () => {
            this.renderMeta();
            this.changeState(STATE.META);
            const screen = document.getElementById('screen-meta');
            const btn = document.getElementById('btn-view-sanctuary');
            screen.classList.add('viewing-mode');
            btn.innerText = "🔙 RESTORE UI";
        });

        const relicBtn = d.getElementById('btn-relics');
        if (relicBtn) {
            relicBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
            relicBtn.onclick = (e) => {
                e.stopPropagation();
                relicBtn.blur();
                AudioMgr.playSound('click');
                const el = d.getElementById('relic-dropdown');
                if (el.classList.contains('hidden')) {
                    el.classList.remove('hidden');
                    el.classList.add('active');
                    relicBtn.classList.add('open');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('active');
                    relicBtn.classList.remove('open');
                }
            };
        }

        window.addEventListener('click', (e) => {
            const el = d.getElementById('relic-dropdown');
            const btn = d.getElementById('btn-relics');
            if(el && !el.classList.contains('hidden') && e.target !== btn && !el.contains(e.target) && !(btn && btn.contains(e.target))) {
                el.classList.add('hidden');
                el.classList.remove('active');
                if (btn) btn.classList.remove('open');
            }
            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                if (this.tutorialStep === 0) {
                    AudioMgr.playSound('click');
                    this.tutorialStep++;
                    this.updateTutorialStep();
                }
            }
        });

        const tutorialOverlay = d.getElementById('tutorial-overlay');
        if (tutorialOverlay) {
            tutorialOverlay.addEventListener('touchstart', (e) => {
                if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    AudioMgr.playSound('click');
                    this.tutorialStep++;
                    this.updateTutorialStep();
                }
            }, { passive: false });
        }

        const getLogicCoords = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = CONFIG.CANVAS_WIDTH / rect.width;
            const scaleY = CONFIG.CANVAS_HEIGHT / rect.height;
            
            let clientX = e.clientX;
            let clientY = e.clientY;
            
            if ((isNaN(clientX) || clientX === undefined) && e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }

            return {
                x: (clientX - rect.left) * scaleX,
                y: (clientY - rect.top) * scaleY
            };
        };

        this.canvas.addEventListener('mousemove', (e) => {
            const coords = getLogicCoords(e);
            this.mouseX = coords.x;
            this.mouseY = coords.y;
            this.handleCanvasHover(e.clientX, e.clientY);
        });
        
        const handleInteraction = (e) => {
             if (this.inputCooldown > 0) return;

             if (this.qte.active) { this.checkQTE(); return; }
             if (this.dragState.active) return;

             const coords = getLogicCoords(e);
             this.mouseX = coords.x;
             this.mouseY = coords.y;

             for (let i = this.effects.length - 1; i >= 0; i--) {
                 const eff = this.effects[i];
                 if (eff.type === 'micro_laser' && !eff.parried) {
                     const dist = Math.hypot(this.mouseX - eff.x, this.mouseY - eff.y);
                     if (dist < eff.radius + 30) {
                         eff.parried = true;
                         eff.onHit = null; 
                         const angle = Math.atan2(eff.y - this.mouseY, eff.x - this.mouseX);
                         const deflectSpeed = 25; 
                         eff.vx = Math.cos(angle) * deflectSpeed;
                         eff.vy = Math.sin(angle) * deflectSpeed;
                         AudioMgr.playSound('defend'); 
                         ParticleSys.createFloatingText(eff.x, eff.y, "PARRY!", "#00f3ff");
                         ParticleSys.createExplosion(eff.x, eff.y, 20, '#00f3ff');
                         return; 
                     }
                 }
                 if (eff.type === 'nature_dart' && !eff.empowered) {
                     const dist = Math.hypot(this.mouseX - eff.x, this.mouseY - eff.y);
                     if (dist < 60) { 
                         eff.empowered = true;
                         eff.dmgMultiplier = 1.1 + Math.random() * 0.3; 
                         eff.speed *= 2.5; 
                         eff.color = COLORS.GOLD; 
                         AudioMgr.playSound('upgrade'); 
                         ParticleSys.createFloatingText(eff.x, eff.y, "EMPOWERED!", COLORS.GOLD);
                         ParticleSys.createExplosion(eff.x, eff.y, 20, COLORS.GOLD);
                         return;
                     }
                 }
             }

             // Sanctuary NPC tap — open the matching service modal.
             if (this.currentState === STATE.META) {
                const hit = this._sanctuaryHit(this.mouseX, this.mouseY);
                if (hit) {
                    this.openSanctuaryNPC(hit);
                    AudioMgr.playSound('click');
                    return;
                }
             }

             if ((this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT) && this.enemy && this.enemy.currentHp > 0) {
                const dist = Math.hypot(this.mouseX - this.enemy.x, this.mouseY - this.enemy.y);
                if (dist < this.enemy.radius) {
                    this.enemy.showIntent = !this.enemy.showIntent;
                    if (this.enemy.showIntent) {
                        ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "INTENT REVEALED", COLORS.MANA);
                        AudioMgr.playSound('click');
                        if (this.currentState === STATE.TUTORIAL_COMBAT && (this.tutorialStep === 2 || this.tutorialStep === 4)) {
                            this.tutorialStep++;
                            this.updateTutorialStep();
                        }
                    }
                }
            }
        };

        this.canvas.addEventListener('mousedown', handleInteraction);
        this.canvas.addEventListener('touchstart', (e) => {
            const coords = getLogicCoords(e);
            this.mouseX = coords.x;
            this.mouseY = coords.y;
            handleInteraction(e);
        }, {passive: false});

        let dragRaf = null;
        window.addEventListener('pointermove', (e) => {
            if (this.dragState.active && this.dragState.ghostElement) {
                if(e.cancelable) e.preventDefault();
                const cx = e.clientX;
                const cy = e.clientY;
                if (!dragRaf) {
                    dragRaf = requestAnimationFrame(() => {
                        if (this.dragState.ghostElement) {
                            this.dragState.ghostElement.style.transform = `translate(${cx - 32}px, ${cy - 32}px) scale(1.1) rotate(5deg)`;
                        }
                        dragRaf = null;
                    });
                }
            }
        }, { passive: false });

        window.addEventListener('pointerup', (e) => {
            if (this.dragState.active) {
                const coords = getLogicCoords(e);
                this.mouseX = coords.x;
                this.mouseY = coords.y;
                
                this.handleDragEnd(e);
                if(dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
            }
        });
        
        window.addEventListener('pointercancel', (e) => {
            if (this.dragState.active) {
                this.handleDragEnd(e);
                if(dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = null; }
            }
        });
    },

    hasMetaUpgrade(id) {
        return this.metaUpgrades.includes(id);
    },

    handleCanvasHover(screenX, screenY) {
        if(this.currentState !== STATE.COMBAT && this.currentState !== STATE.TUTORIAL_COMBAT) { TooltipMgr.hide(); return; }
        if (this.dragState.active || this.qte.active) { TooltipMgr.hide(); return; }

        // First-pass: check if cursor is over an enemy intent badge (drawn above the enemy).
        // Intent boxes are 50x50, centered at (enemy.x + offsetX, enemy.y - radius - 130).
        if (this.enemy && this.enemy.currentHp > 0 && this.enemy.showIntent !== false) {
            const intents = this.enemy.nextIntents && this.enemy.nextIntents.length > 0
                ? this.enemy.nextIntents
                : (this.enemy.nextIntent ? [this.enemy.nextIntent] : []);
            if (intents.length > 0) {
                const spacing = 60;
                const startOffset = -((intents.length - 1) * spacing) / 2;
                for (let i = 0; i < intents.length; i++) {
                    const ix = this.enemy.x + startOffset + (i * spacing);
                    const iy = this.enemy.y - this.enemy.radius - 130; // baseline (sin sway ignored for hit-test)
                    // Intent box bounds: width 50 height 50, plus a generous padding so floaty bob is forgiving.
                    const padding = 16;
                    if (this.mouseX >= ix - 25 - padding && this.mouseX <= ix + 25 + padding &&
                        this.mouseY >= iy - padding && this.mouseY <= iy + 50 + padding) {
                        TooltipMgr.show(this.describeIntent(intents[i], this.enemy, i + 1, intents.length), screenX, screenY);
                        if (this.currentHoverEntity !== 'intent') {
                            this.currentHoverEntity = 'intent';
                            AudioMgr.playSound('click');
                        }
                        return;
                    }
                }
            }
        }

        // Effect icon hit-test — mirrors the drawHealthBar effect bar geometry
        // (iconWidth 30, barHeight 28, barY = y + height + 6 = entity.y - radius - 14).
        {
            const ICON_W = 30, BAR_H = 28, PAD = 4;
            const effectEntities = [];
            if (this.enemy) { effectEntities.push(this.enemy); effectEntities.push(...this.enemy.minions); }
            if (this.player) { effectEntities.push(this.player); effectEntities.push(...this.player.minions); }
            for (const ent of effectEntities) {
                if (!ent || ent.currentHp <= 0 || !ent.effects || ent.effects.length === 0) continue;
                const barY = ent.y - ent.radius - 14;
                const totalW = ent.effects.length * ICON_W;
                const barX = ent.x - totalW / 2;
                if (this.mouseY < barY - PAD || this.mouseY > barY + BAR_H + PAD) continue;
                for (let i = 0; i < ent.effects.length; i++) {
                    const iconX = barX + i * ICON_W;
                    if (this.mouseX >= iconX - PAD && this.mouseX <= iconX + ICON_W + PAD) {
                        TooltipMgr.show(this.describeEffect(ent.effects[i], ent), screenX, screenY);
                        if (this.currentHoverEntity !== 'effect:' + i) {
                            this.currentHoverEntity = 'effect:' + i;
                            AudioMgr.playSound('click');
                        }
                        return;
                    }
                }
            }
        }

        let hoveredEntity = null;

        const entities = [];
        if(this.enemy) { entities.push(this.enemy); entities.push(...this.enemy.minions); }
        if(this.player) { entities.push(this.player); entities.push(...this.player.minions); }

        for(let ent of entities) {
            if(!ent || ent.currentHp <= 0) continue;
            const dist = Math.hypot(this.mouseX - ent.x, this.mouseY - ent.y);
            if(dist < ent.radius) {
                hoveredEntity = ent;
                let txt = `<strong>${ent.name}</strong>\nHP: ${ent.currentHp}/${ent.maxHp}`;
                if(ent.shield > 0) txt += `\nShield: ${ent.shield}`;
                
                // --- NEW: Armor Plating Tooltip ---
                if (ent instanceof Enemy && ent.armorPlating > 0) {
                    txt += `\n\n<span style="color:#ffaa00; font-weight:bold;">🛡️ ARMOR PLATED (${ent.armorPlating})</span>`;
                    txt += `\nTakes 90% Less Damage.`;
                    txt += `\nBreaks after ${ent.armorPlating} more hits.`;
                }
                // ----------------------------------

                if (ent instanceof Enemy && ent.invincibleTurns > 0) {
                    txt += `\n\n<span style="color:#ff0000; font-weight:bold;">⚠️ INVINCIBLE</span>`;
                    txt += `\nShields active for ${ent.invincibleTurns} more turn(s).`;
                }

                if(ent instanceof Player) {
                    txt += `\nMana: ${ent.mana}/${ent.baseMana}`;
                    if (ent.nextAttackMult > 1) txt += `\n\n🔥 CHARGED: Next Atk x${ent.nextAttackMult}`;
                    if (ent.incomingDamageMult > 1) {
                        const val = ent.incomingDamageMult === 1.5 ? "+50%" : `x${ent.incomingDamageMult}`;
                        txt += `\n⚠️ VULNERABLE: Taking ${val} Dmg`;
                    }
                }

                if(ent.effects.length > 0) {
                    txt += `\n\n--- EFFECTS ---`;
                    ent.effects.forEach(eff => {
                        txt += `\n${eff.icon} ${eff.name} (${eff.duration}t): ${eff.desc || ''}`;
                    });
                }

                if(ent instanceof Enemy) {
                    txt += "\n(Left Click to toggle targets)";
                    
                    if (ent.nextIntents && ent.nextIntents.length > 0) {
                        txt += `\n\n--- INTENTS ---`;
                        ent.nextIntents.forEach((intent, i) => {
                            let typeName = intent.type.toUpperCase();
                            let desc = "";

                            if (intent.type === 'buff') typeName = "FORTIFY"; 
                            if (intent.type === 'debuff') typeName = "VIRUS"; 
                            if (intent.type === 'shield') typeName = "BARRIER";
                            if (intent.type === 'consume') typeName = "CONSUME";
                            if (intent.type === 'summon' || intent.type === 'summon_glitch') typeName = "REINFORCE";
                            if (intent.type === 'summon_void') typeName = "VOID SPAWN";
                            if (intent.type === 'dispel') typeName = "CLEANSE";
                            if (intent.type === 'reality_overwrite') { typeName = "REALITY SHIFT"; desc = " (Alters physics)"; }
                            if (intent.type === 'purge_attack') { typeName = "THE PURGE"; desc = " (Massive Dmg)"; }
                            if (intent.type === 'charge') { typeName = "CHARGING"; desc = " (Preparing Ult)"; }
                            
                            // FIX: Strict check for effectiveVal
                            let val = (intent.effectiveVal !== undefined) ? intent.effectiveVal : intent.val;
                            
                            txt += `\n${i+1}. ${typeName}`;
                            if (val > 0) txt += ` (${val})`;
                            txt += desc;
                            
                            if (intent.secondary) {
                                let secName = intent.secondary.id ? intent.secondary.id.toUpperCase() : intent.secondary.type.toUpperCase();
                                txt += ` + ${secName}`;
                            }
                        });
                    } 
                    else if(ent.nextIntent) {
                        const i = ent.nextIntent;
                        const val = (i.effectiveVal !== undefined) ? i.effectiveVal : i.val;
                        txt += `\n\nIntent: ${i.type.toUpperCase()}`;
                        if(val > 0) txt += ` (${val})`;
                    }
                }
                
                if(ent instanceof Minion) {
                    txt += `\nAtk: ${ent.dmg}`;
                    if (ent.name.includes("Glitch")) txt += `\n(Gains +10% DMG per turn)`;
                    if (ent.isPlayerSide && Game.player.traits.minionTrait) txt += `\n${Game.player.traits.minionTrait}`;
                }
                TooltipMgr.show(txt, screenX, screenY);
                break;
            }
        }
        
        if (hoveredEntity !== this.currentHoverEntity) {
            this.currentHoverEntity = hoveredEntity;
            if (hoveredEntity) AudioMgr.playSound('click');
        }

        if(!hoveredEntity) TooltipMgr.hide();
    },

startDrag(e, die, el) {
        // NEW: Check Input Lock
        if (this.inputLocked) return;
        // 1. Prevent default browser behavior (scrolling/zooming)
        if (e.cancelable) e.preventDefault();
        
        if (die.used || this.qte.active) return;

        // 2. FAILSAFE: If a previous drag got stuck, clean it up now.
        if (this.dragState.active) {
            if (this.dragState.ghostElement) {
                this.dragState.ghostElement.remove();
            }
            // Reset opacity of the previous die if it was stuck
            if (this.dragState.dieElement) {
                this.dragState.dieElement.style.opacity = '1';
            }
        }
        
        this.dragState.active = true;
        this.dragState.die = die;
        this.dragState.dieElement = el;
        
        // 3. Unified coordinate handling (Mouse vs Touch)
        let clientX = e.clientX;
        let clientY = e.clientY;
        if(e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        this.dragState.startX = clientX;
        this.dragState.startY = clientY;
        
        // 4. Create Ghost Element
        const ghost = el.cloneNode(true);
        
        // CRITICAL FIX: Remove the focus class so 'position: fixed' works
        ghost.classList.remove('tutorial-focus'); 
        
        ghost.style.position = 'fixed';
        // FIX: Z-Index 6000 ensures it floats above Tutorial Text (6000) and Overlay
        ghost.style.zIndex = '6001';
        ghost.style.pointerEvents = 'none';
        ghost.style.opacity = '0.9';
        ghost.style.transition = 'none';
        // Kill the .die entrance animation on the clone — otherwise the fadeInUp keyframe
        // overrides our inline transform during the first 420ms, pinning the ghost to (0,0).
        ghost.style.animation = 'none';
        
        // Initial position off-center to see under finger
        ghost.style.left = '0';
        ghost.style.top = '0';
        ghost.style.transform = `translate(${clientX - 32}px, ${clientY - 32}px) scale(1.1) rotate(5deg)`;
        
        document.body.appendChild(ghost);
        this.dragState.ghostElement = ghost;

        el.style.opacity = '0.2';
        // Pickup feedback — richer sound, haptic, and a small spark from the
        // die's home slot so the pickup reads.
        AudioMgr.playSound('click');
        if (this.haptic) this.haptic('die_use');
        try {
            const r = el.getBoundingClientRect();
            const data = DICE_TYPES[die.type];
            const tick = document.createElement('div');
            tick.className = 'drag-pickup-tick';
            tick.style.left = (r.left + r.width / 2) + 'px';
            tick.style.top = (r.top + r.height / 2) + 'px';
            tick.style.setProperty('--die-color', (data && data.color) || '#ffd700');
            document.body.appendChild(tick);
            setTimeout(() => tick.remove(), 480);
        } catch (e) { /* swallow */ }
    },

    handleDragEnd(e) {
        TooltipMgr.hide();

        if (!this.dragState.active) return;
        
        // Safety: Ensure we don't process if die is null (already used)
        if (!this.dragState.die) {
            this.dragState.active = false;
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        // FIX: Use CONFIG constants
        const scaleX = CONFIG.CANVAS_WIDTH / rect.width;
        const scaleY = CONFIG.CANVAS_HEIGHT / rect.height;
        
        let clientX = e.clientX;
        let clientY = e.clientY;
        if ((isNaN(clientX) || clientX === undefined) && e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        }

        this.mouseX = (clientX - rect.left) * scaleX;
        this.mouseY = (clientY - rect.top) * scaleY;

        const dist = Math.hypot(clientX - this.dragState.startX, clientY - this.dragState.startY);
        
        // Helper to animate the ghost back to the source tile, then remove.
        const snapBackGhost = () => {
            const ghost = this.dragState.ghostElement;
            const src = this.dragState.dieElement;
            if (!ghost) return;
            if (src) {
                const r = src.getBoundingClientRect();
                ghost.style.transition = 'transform 240ms cubic-bezier(0.25, 0.9, 0.3, 1.2), opacity 240ms';
                ghost.style.transform = `translate(${r.left}px, ${r.top}px) scale(1) rotate(0deg)`;
                ghost.style.opacity = '0.6';
                setTimeout(() => { if (ghost && ghost.parentNode) ghost.remove(); }, 260);
            } else {
                ghost.remove();
            }
            this.dragState.ghostElement = null;
        };

        if (this.dragState.dieElement) {
            this.dragState.dieElement.style.opacity = '1';
        }

        if (dist < 10) {
            // Tap, not drag — toggle selection. Snap ghost back since no use happened.
            snapBackGhost();
            const die = this.dragState.die;
            if(die && (!this.player.traits.noRerolls || (this.player.qteRerolls || 0) > 0)) {
                die.selected = !die.selected;
                this.renderDiceUI();
                AudioMgr.playSound('click');
            }
        } else {
            const target = this.getDropTarget();
            // Pass the die explicitly and clear drag state immediately to prevent re-entry
            const dieToUse = this.dragState.die;
            const elToUse = this.dragState.dieElement;

            this.dragState.active = false;
            this.dragState.die = null;
            this.dragState.dieElement = null;

            if (target || this._dieSlot(dieToUse.type) === 'minion') {
                // Valid drop — fade ghost out instantly (it'll be replaced by the impact VFX).
                if (this.dragState.ghostElement) {
                    this.dragState.ghostElement.remove();
                    this.dragState.ghostElement = null;
                }
                this.useDie(dieToUse, elToUse, target);
            } else {
                // Invalid drop — snap the ghost back, buzz haptic, wiggle
                // the source die, and beep a light error tone.
                this.dragState.dieElement = elToUse;
                snapBackGhost();
                if (elToUse) {
                    elToUse.classList.remove('die-wiggle');
                    void elToUse.offsetWidth;
                    elToUse.classList.add('die-wiggle');
                    setTimeout(() => elToUse && elToUse.classList.remove('die-wiggle'), 360);
                }
                if (this.haptic) this.haptic('hit');
                try { AudioMgr.playSound('snap'); } catch (e) {}
                this.dragState.dieElement = null;
            }
            return; // Exit function after handling
        }

        this.dragState.active = false;
        this.dragState.die = null;
        this.dragState.dieElement = null;
    },

    getDropTarget() {
        const entities = [];
        if(this.enemy) { entities.push(this.enemy); entities.push(...this.enemy.minions); }
        if(this.player) { entities.push(this.player); entities.push(...this.player.minions); }

        for(let ent of entities) {
            if(!ent || ent.currentHp <= 0) continue;
            const dist = Math.hypot(this.mouseX - ent.x, this.mouseY - ent.y);
            if(dist < ent.radius + 20) {
                return ent;
            }
        }
        return null;
    },

startQTE(type, x, y, callback) {
        Hints.trigger('first_qte');
        return new Promise(resolve => {
            const now = Date.now();
            this.inputCooldown = 0.6;

            // Accessibility: auto-QTE resolves at 'good' tier without player input.
            if (this.autoQTE) {
                const cb = callback || resolve;
                // Mimic resolveQTE('good') multipliers.
                const mult = this._dieSlot(type) === 'attack' ? 1.1 : 0.75;
                setTimeout(() => cb(mult), 300);
                return;
            }

            // QTE ring stays centred on the target entity so tutorial combat
            // matches real combat exactly. Visibility of the player underneath
            // is handled by the tutorial narration pane (compact + contextual).
            const tX = x, tY = y;
            const qteScale = 1;

            this.qte = {
                id: now,
                active: true,
                phase: 'warmup',
                startTime: now,
                type: type,
                anchorX: x,           // original entity position (for a connector line)
                anchorY: y,
                targetX: tX,
                targetY: tY,
                maxRadius: 100 * qteScale,
                radius: 100 * qteScale,
                qteScale: qteScale,
                warmupTimer: 0.6,
                callback: callback || resolve
            };
            
            if (this._dieSlot(type) === 'attack') {
                this.player.anim.type = 'windup';
            } else if (this._dieSlot(type) === 'defend') {
                if (this.enemy) this.enemy.anim.type = 'windup';
            }

            this.drawQTE();

            // Failsafe with ID Check
            setTimeout(() => {
                // Only trigger if QTE is active AND IDs match (prevents killing future QTEs)
                if (this.qte.active && this.qte.id === now && 
                   (this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT)) {
                    console.log("QTE Failsafe Triggered");
                    this.resolveQTE('fail'); 
                }
            }, 6000); 
        });
    },

    updateQTE(dt) {
        if (!this.qte.active) return;

        const scale = this.qte.qteScale || 1;
        const scaledTarget = 30 * scale;

        // Handle Warmup
        if (this.qte.phase === 'warmup') {
            this.qte.warmupTimer -= dt;
            this.qte.radius = 100 * scale;

            if (this.qte.warmupTimer <= 0) {
                this.qte.phase = 'active';
            }
            return;
        }

        let shrinkSpeed = 128 * scale;

        const dist = Math.abs(this.qte.radius - scaledTarget);

        if (dist < 25 * scale) {
            shrinkSpeed = 32 * scale;
            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                shrinkSpeed = 8 * scale;
            }
        }

        this.qte.radius -= shrinkSpeed * dt;

        if (this.qte.radius <= 0) {
            this.resolveQTE('fail');
        }
    },

    drawQTE() {
        if (!this.qte.active || !this.qte.targetX || !this.qte.targetY) return;

        const ctx = this.ctx;
        const { targetX, targetY, radius, warmupTimer } = this.qte;
        const scale = this.qte.qteScale || 1;
        const targetZone = 30 * scale;

        ctx.save();

        // 1. Draw Static Target Zone
        ctx.beginPath();
        ctx.arc(targetX, targetY, targetZone, 0, Math.PI*2);
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#000000';
        ctx.stroke();

        ctx.lineWidth = 4;
        ctx.strokeStyle = COLORS.GOLD;
        ctx.shadowColor = COLORS.GOLD;
        ctx.shadowBlur = 15;
        ctx.stroke();

        if (this.qte.type === 'DEFEND') {
            const outerR = 60 * scale;
            ctx.beginPath();
            ctx.arc(targetX, targetY, outerR, 0, Math.PI*2);
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 0;
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.stroke();

        }

        // 2. Draw Dynamic Ring
        let ringColor = '#fff';
        
        // Warmup Visuals
        if (warmupTimer > 0) {
            ringColor = '#888'; 
            
            // Draw "Locking On" brackets
            ctx.strokeStyle = COLORS.GOLD;
            ctx.lineWidth = 4;
            const size = 110;
            const gap = 20;
            
            ctx.beginPath();
            // Top Left
            ctx.moveTo(targetX - size/2, targetY - size/2 + gap);
            ctx.lineTo(targetX - size/2, targetY - size/2);
            ctx.lineTo(targetX - size/2 + gap, targetY - size/2);
            // Top Right
            ctx.moveTo(targetX + size/2 - gap, targetY - size/2);
            ctx.lineTo(targetX + size/2, targetY - size/2);
            ctx.lineTo(targetX + size/2, targetY - size/2 + gap);
            // Bottom Right
            ctx.moveTo(targetX + size/2, targetY + size/2 - gap);
            ctx.lineTo(targetX + size/2, targetY + size/2);
            ctx.lineTo(targetX + size/2 - gap, targetY + size/2);
            // Bottom Left
            ctx.moveTo(targetX - size/2 + gap, targetY + size/2);
            ctx.lineTo(targetX - size/2, targetY + size/2);
            ctx.lineTo(targetX - size/2, targetY + size/2 - gap);
            ctx.stroke();

        } else {
            // Normal Colors
            const scaledTarget = 30 * scale;
            const diff = Math.abs(radius - scaledTarget);
            if (diff < 25 * scale) ringColor = COLORS.GOLD;
            else if (radius < scaledTarget) ringColor = '#ff0000';
            else ringColor = this.qte.type === 'ATTACK' ? COLORS.MECH_LIGHT : COLORS.SHIELD;
        }

        ctx.beginPath();
        ctx.arc(targetX, targetY, Math.max(0, radius), 0, Math.PI*2);
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#000000';
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.lineWidth = 6;
        ctx.strokeStyle = ringColor;
        ctx.shadowColor = ringColor;
        ctx.shadowBlur = 20;
        ctx.stroke();

        // 3. Text Instruction
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px 'Orbitron'";
        ctx.textAlign = "center";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 0;
        
        // FIX: Thick black outline for visibility
        ctx.lineWidth = 5;
        ctx.strokeStyle = "#000000";
        ctx.lineJoin = "round"; // Smoother corners on text stroke
        
        let txt = (this.qte.type === 'ATTACK') ? "CLICK TO CRIT!" : "CLICK TO BLOCK!";
        
        if (warmupTimer > 0) {
            txt = "LOCKED ON...";
            ctx.fillStyle = COLORS.GOLD;
        }
        
        // FIX: Moved Y position to +140 (Below entity) to avoid HP bar overlap
        ctx.strokeText(txt, targetX, targetY + 140); 
        ctx.fillText(txt, targetX, targetY + 140);

        ctx.restore();
    },

    checkQTE() {
        if (!this.qte.active) return;

        // Strict Phase Check
        if (this.qte.phase !== 'active') return;
        if (this.inputCooldown > 0) return;

        const scale = this.qte.qteScale || 1;
        const radius = this.qte.radius;
        const targetRadius = 30 * scale;
        const diff = Math.abs(radius - targetRadius);
        // Perfect window widened 25→32 (easier on mobile), Good tier added at 33–55.
        const perfectTol = 32 * scale;
        const goodTol = 55 * scale;

        let quality = 'fail';

        if (radius > (targetRadius + goodTol)) {
            this.resolveQTE('early');
            return;
        }
        else if (diff <= perfectTol) {
            quality = 'perfect';
        }
        else if (diff <= goodTol) {
            quality = 'good';
        }

        if (this.currentState === STATE.TUTORIAL_COMBAT) {
            quality = 'perfect';
        }

        this.resolveQTE(quality);
    },

    resolveQTE(quality) {
        const cb = this.qte.callback;
        this.qte.active = false;
        
        this.player.anim.type = 'idle';
        if (this.enemy) this.enemy.anim.type = 'idle';
        
        let multiplier = 1.0;
        let msg = "TOO LATE"; 
        let color = "#888";

        if (quality === 'early') {
            msg = "TOO EARLY";
            color = "#888";
        }

        if (quality !== 'fail' && quality !== 'early') {
             if (this.qte.type === 'ATTACK') {
                 if (quality === 'perfect') {
                     multiplier = 1.3;
                     msg = "CRITICAL!";
                     color = COLORS.GOLD;
                     this.haptic('crit');
                     Hints.trigger('first_crit');
                     AudioMgr.playSound('mana');
                     // Annihilator class rework: QTE crits grant a reroll token that
                     // bypasses the no-rerolls trait on the next reroll. Refresh
                     // the dice UI immediately so the reroll badge reflects the
                     // new token count (without waiting for the next turn tick).
                     if (this.player && this.player.traits && this.player.traits.qteCritRerolls > 0) {
                         this.player.qteRerolls = (this.player.qteRerolls || 0) + this.player.traits.qteCritRerolls;
                         ParticleSys.createFloatingText(this.player.x, this.player.y - 120, `+${this.player.traits.qteCritRerolls} REROLL TOKEN`, "#ffcc00");
                         this.renderDiceUI && this.renderDiceUI();
                     }
                     if (this.enemy) {
                         ParticleSys.createShockwave(this.enemy.x, this.enemy.y, COLORS.GOLD, 32);
                         ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 24, COLORS.GOLD);
                         // QTE object never sets plain .x / .y — only targetX / targetY.
                         // Reading .x / .y gave undefined, so the shatter ring + shards
                         // rendered at (0, 0) in the top-left corner of the canvas.
                         this.effects.push({
                             type: 'qte_shatter',
                             x: this.qte.targetX, y: this.qte.targetY,
                             baseRadius: this.qte.radius || 30,
                             life: 28, maxLife: 28,
                             color: COLORS.GOLD
                         });
                     }
                     this.shake(14);
                     this.triggerSlowMo(0.1, 0.095);
                     this.triggerScreenFlash('rgba(255, 215, 0, 0.45)', 220);
                     this.hitStop(70);
                     // Relic: CELESTIAL SYNC — perfect QTEs heal 3 HP.
                     if (this.player.hasRelic('celestial_sync')) {
                         const stacks = this.player.relics.filter(r => r.id === 'celestial_sync').length;
                         this.player.heal(3 * stacks);
                         ParticleSys.createFloatingText(this.player.x, this.player.y - 140, `CELESTIAL +${3 * stacks}`, "#ffd700");
                     }
                 } else if (quality === 'good') {
                     multiplier = 1.1;
                     msg = "SOLID HIT";
                     color = COLORS.MECH_LIGHT;
                     AudioMgr.playSound('click');
                     if (this.enemy) {
                         ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 14, COLORS.MECH_LIGHT);
                     }
                     this.shake(6);
                 }
             } else {
                 if (quality === 'perfect') {
                     multiplier = 0.5;
                     msg = "PERFECT BLOCK!";
                     color = COLORS.GOLD;
                     AudioMgr.playSound('defend');
                     this.triggerScreenFlash('rgba(0, 243, 255, 0.4)', 200);
                     this.hitStop(50);
                     this.shake(8);
                 } else if (quality === 'good') {
                     multiplier = 0.75;
                     msg = "BLOCK";
                     color = COLORS.SHIELD;
                     AudioMgr.playSound('defend');
                     this.shake(4);
                 }
             }

             ParticleSys.createExplosion(this.qte.targetX, this.qte.targetY, 20, color);
        }
        
        ParticleSys.createFloatingText(this.qte.targetX, this.qte.targetY - 50, msg, color);

        if (cb) cb(multiplier);
    },

    changeState(newState) {
        // Direction inference: forward states (deeper into a run) slide left;
        // back/menu states slide right; lateral states (shop/event/etc.) fade up.
        const FORWARD = new Set([STATE.CHAR_SELECT, STATE.MAP, STATE.COMBAT, STATE.TUTORIAL_COMBAT, STATE.REWARD, STATE.COMBAT_WIN, STATE.SHOP, STATE.EVENT, STATE.HEX, STATE.STORY, STATE.ENDING, STATE.VICTORY]);
        const BACKWARD = new Set([STATE.MENU, STATE.GAMEOVER]);
        const prev = this.currentState;
        let direction = 'up';
        if (typeof prev !== 'undefined') {
            if (BACKWARD.has(newState)) direction = 'right';
            else if (FORWARD.has(newState) && BACKWARD.has(prev)) direction = 'left';
            else if (FORWARD.has(newState) && FORWARD.has(prev)) direction = 'left';
        }
        document.body.dataset.transitionDir = direction;

        this._clearRerollIntervals();

        document.querySelectorAll('.screen').forEach(el => {
            el.classList.remove('active');
            setTimeout(() => { if(!el.classList.contains('active')) el.classList.add('hidden'); }, 500);
        });
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('modal-settings').classList.add('hidden');

        // FIX: Force hide tutorial overlays to prevent blocking
        document.getElementById('tutorial-overlay').classList.add('hidden');
        document.getElementById('tutorial-spotlight').classList.add('hidden');

        // Defensive: narration pane (and its sibling skip button) must
        // only appear in TUTORIAL_COMBAT.
        if (newState !== STATE.TUTORIAL_COMBAT) {
            const narrPane = document.getElementById('tutorial-narration');
            if (narrPane) narrPane.classList.add('hidden');
            const skipBtn = document.getElementById('btn-tutorial-skip');
            if (skipBtn) skipBtn.classList.add('hidden');
        }

        TooltipMgr.hide();

        this.currentState = newState;
        const activate = (id) => {
            const el = document.getElementById(id);
            if(!el) return;
            el.classList.remove('hidden');
            // Exclude elements that run their own internal animation sequences (storyboard, ending).
            const STAGGER_EXCLUDE = new Set(['tutorial-overlay', 'tutorial-spotlight', 'story-content', 'ending-content']);
            // Hidden buttons (like RESUME RUN when no save) shouldn't claim a stagger slot
            // and waste a delay on something nobody sees. Same for spacers.
            const isStaggerable = (child) => {
                if (STAGGER_EXCLUDE.has(child.id)) return false;
                if (child.classList && child.classList.contains('hidden')) return false;
                if (child.classList && child.classList.contains('spacer')) return false;
                return true;
            };
            // Step 1: ensure stagger-in is applied to all direct children (this sets the
            // initial invisible/offset state via CSS).
            Array.from(el.children).forEach(child => {
                if (!isStaggerable(child)) return;
                child.classList.remove('stagger-in');
                child.style.transitionDelay = '';
            });
            // Force reflow so removal commits before re-add (resets transitions).
            void el.offsetHeight;
            // Compute per-visible-child delays so hidden/skipped siblings don't
            // create dead air in the cascade.
            let visibleIdx = 0;
            Array.from(el.children).forEach(child => {
                if (!isStaggerable(child)) return;
                const delay = 40 + visibleIdx * 70; // 40ms intro + 70ms per visible child
                child.style.transitionDelay = `${delay}ms`;
                child.classList.add('stagger-in');
                visibleIdx++;
            });
            // Force the browser to commit the opacity:0/translateY initial state BEFORE we
            // add `.active`. Without this, the same-tick class swap may be coalesced and
            // the transition never visibly fires.
            void el.offsetHeight;
            // Use double-rAF: first frame paints initial state, second frame triggers
            // the transition by adding `.active`. Reliable in all browsers.
            requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('active')));
        };

        switch(newState) {
            case STATE.MENU:
                activate('screen-start');
                Unlocks.applyMenuVisibility();
                // Personalize the menu subtitle with the operator callsign.
                {
                    const subEl = document.querySelector('#screen-start .subtitle');
                    if (subEl && !this.corruptionLevel) {
                        const op = (Onboarding.getName && Onboarding.getName()) || 'OPERATOR';
                        subEl.textContent = `OPERATOR ${op}`;
                        subEl.style.color = '';
                    }
                }
                const btnIntel = document.getElementById('btn-intel');
                if (btnIntel) {
                    if (this.encryptedFiles > 0) {
                        btnIntel.classList.add('intel-alert');
                        btnIntel.innerText = `INTEL [${this.encryptedFiles}]`;
                    } else {
                        btnIntel.classList.remove('intel-alert');
                        btnIntel.innerText = "INTEL";
                    }
                }
                if (this.corruptionLevel > 0) {
                    const subtitleEl = document.querySelector('.subtitle');
                    if (subtitleEl) {
                        subtitleEl.innerText = `ASCENSION LEVEL ${this.corruptionLevel}`;
                        subtitleEl.style.color = '#ff0055';
                    }
                }
                this._refreshMenuChips();
                break;

            case STATE.CHAR_SELECT: activate('screen-char-select'); this.renderCharSelect(); break;
            case STATE.TUTORIAL: 
                activate('screen-tutorial'); 
                this.tutorialPage = 0;
                this.renderTutorial();
                break;
            case STATE.META: {
                activate('screen-meta');
                document.getElementById('fragment-count').innerText = `Fragments: ${this.techFragments}`;
                const metaProgress = Math.min(1, (this.metaUpgrades ? this.metaUpgrades.length : 0) / (META_UPGRADES ? META_UPGRADES.length : 10));
                const metaScreen = document.getElementById('screen-meta');
                if (metaScreen) metaScreen.dataset.restoration = metaProgress >= 0.7 ? 'restored' : metaProgress >= 0.35 ? 'healing' : 'corrupted';
                this.showSkeleton('upgrade-list', 4);
                setTimeout(() => this.renderMeta && this.renderMeta(), 280);
            }
                break;
            case STATE.ACHIEVEMENTS:
                activate('screen-achievements');
                this.renderAchievements();
                break;
            case STATE.MAP: 
                activate('screen-map'); 
                this.renderMap(); 
                this.saveGame();
                break;
            case STATE.SHOP:
                activate('screen-shop');
                this.showSkeleton('shop-grid', 4);
                setTimeout(() => this.renderShop(), 280);
                this.showHintOnce('first_shop', "SHOP: spend Fragments on new Modules. Rarer modules scale stronger.");
                break;
            case STATE.COMBAT: 
                document.getElementById('hud').classList.remove('hidden');
                this.renderRelics(); 
                break;
            case STATE.REWARD: {
                activate('screen-reward');
                // Echo the boss-death dissolve as the reward-screen backdrop
                // when we have a snapshot for this sector. Adds a sense-of-place
                // beat with no extra assets.
                const rewardScreen = document.getElementById('screen-reward');
                if (rewardScreen) {
                    const snap = sessionStorage.getItem(`mvm_dissolve_snap_s${this.sector}`);
                    // Only apply the snapshot if it's a legitimate data-URL
                    // (defence against tampered imports breaking the CSS).
                    const valid = snap && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(snap);
                    if (valid) {
                        rewardScreen.style.setProperty('background-image', `url("${snap}")`);
                        rewardScreen.classList.add('reward-has-snap');
                    } else {
                        rewardScreen.style.backgroundImage = '';
                        rewardScreen.classList.remove('reward-has-snap');
                    }
                }
                this.generateRewards();
                this.showHintOnce('first_reward', "REWARDS: pick carefully. Synergies with your modules are highlighted.");
                break;
            }
            case STATE.COMBAT_WIN:
                // HUD stays so the frozen combat backdrop remains visible beneath the overlay.
                document.getElementById('hud').classList.remove('hidden');
                activate('screen-combat-win');
                break;
            case STATE.GAMEOVER: activate('screen-gameover'); break;
            case STATE.EVENT: activate('screen-event'); this.showHintOnce('first_event', "EVENT: each choice has consequences. Read the text."); break;
            case STATE.INTEL:
                activate('screen-intel');
                this.renderIntel();
                break;
            case STATE.CODEX:
                activate('screen-codex');
                this.renderCodex();
                break;
            case STATE.HEX: activate('screen-hex'); break;
            
            case STATE.TUTORIAL_COMBAT:
                document.getElementById('hud').classList.remove('hidden');
                break;
            case STATE.STORY:
        activate('screen-story');
        break;
    case STATE.ENDING:
        activate('screen-ending');
        this.playEndingCinematic(); // We will define this helper
        break;
    case STATE.VICTORY:
        activate('screen-victory');
        break;
        }
    },
    
    openPostTutorial() {
        // Achievement: tutorial complete
        if (typeof Achievements !== 'undefined') Achievements.unlock('TUTORIAL_DONE');

        // 1. Remove Z-Index Highlights (Fixes Blank Screen/Softlock)
        document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));

        // 2. Clean up Combat UI
        document.getElementById('hud').style.zIndex = "";
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('tutorial-overlay').classList.add('hidden');
        document.getElementById('tutorial-text').classList.add('hidden');
        const narrPane = document.getElementById('tutorial-narration');
        if (narrPane) narrPane.classList.add('hidden');
        const skipBtnDone = document.getElementById('btn-tutorial-skip');
        if (skipBtnDone) skipBtnDone.classList.add('hidden');

        // Tutorial complete — go straight to the map. The post-tutorial debriefing
        // page-flip screen has been removed; players learn the rest in-game via
        // tooltips + first-time hint toasts.
        this.tutorialAutoRun = false;
        document.body.classList.remove('tutorial-auto-run');
        localStorage.setItem('mvm_first_run_done', '1');
        // Clear tutorial-only transient state so the first real fight is clean.
        this.tutorialStep = 0;
        this.attacksThisTurn = 0;
        this.diceUsedThisTurn = 0;
        this.enemy = null;
        this.dicePool = [];
        if (this.player) {
            this.player.shield = 0;
            this.player.effects = [];
            this.player.mana = this.player.baseMana || 3;
            this.player.currentHp = this.player.maxHp;
        }
        if (!this.map || !this.map.nodes || this.map.nodes.length === 0) {
            this.generateMap();
        }
        this.renderRelics();
        this.changeState(STATE.MAP);
        this.saveGame();
    },

    skipFirstRunTutorial() {
        if (!this.tutorialAutoRun) return;
        this.tutorialAutoRun = false;
        document.body.classList.remove('tutorial-auto-run');
        localStorage.setItem('mvm_first_run_done', '1');
        // Force-kill the tutorial enemy so we can exit combat cleanly.
        const narrPane = document.getElementById('tutorial-narration');
        if (narrPane) narrPane.classList.add('hidden');
        const skipBtnSkip = document.getElementById('btn-tutorial-skip');
        if (skipBtnSkip) skipBtnSkip.classList.add('hidden');
        document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
        document.getElementById('tutorial-overlay').classList.add('hidden');
        document.getElementById('tutorial-text').classList.add('hidden');
        document.getElementById('hud').style.zIndex = "";
        document.getElementById('hud').classList.add('hidden');
        // Reset transient tutorial state.
        this.tutorialStep = 0;
        this.enemy = null;
        this.dicePool = [];
        if (this.player) {
            this.player.shield = 0;
            this.player.effects = [];
            this.player.mana = this.player.baseMana || 3;
            this.player.currentHp = this.player.maxHp;
        }
        if (!this.map || !this.map.nodes || this.map.nodes.length === 0) {
            this.generateMap();
        }
        this.renderRelics();
        this.changeState(STATE.MAP);
        this.saveGame();
    },

    renderTutorial() {
        // Use dynamic data source
        const pages = this.tutorialData;
        const page = pages[this.tutorialPage];
        
        document.getElementById('tut-title').innerText = page.title;
        document.getElementById('tut-content').innerHTML = page.content;
        document.getElementById('tut-page-num').innerText = `${this.tutorialPage + 1} / ${pages.length}`;
        
        const btnPrev = document.getElementById('btn-tut-prev');
        const btnNext = document.getElementById('btn-tut-next');
        const btnClose = document.getElementById('btn-back-tutorial');

        // Logic: Disable Prev on first page
        btnPrev.disabled = (this.tutorialPage === 0);
        btnPrev.style.opacity = (this.tutorialPage === 0) ? 0.3 : 1;
        
        // Logic: Disable Next on last page
        const isLast = (this.tutorialPage === pages.length - 1);
        btnNext.disabled = isLast;
        btnNext.style.opacity = isLast ? 0.3 : 1;

        // Change "Close" button text based on context
        if (this.tutorialData === POST_TUTORIAL_PAGES && isLast) {
            btnClose.innerText = "ENTER SYSTEM";
            btnClose.classList.add("neon-border-gold");
        } else {
            btnClose.innerText = "CLOSE DEBRIEFING";
            btnClose.classList.remove("neon-border-gold");
        }
    },

    nextTutorial() {
        AudioMgr.playSound('click');
        if(this.tutorialPage < this.tutorialData.length - 1) {
            this.tutorialPage++;
            this.renderTutorial();
        }
    },

    prevTutorial() {
        AudioMgr.playSound('click');
        if(this.tutorialPage > 0) {
            this.tutorialPage--;
            this.renderTutorial();
        }
    },
    
    renderMeta() {
        const list = document.getElementById('upgrade-list');
        list.innerHTML = '';
        list.className = 'meta-grid'; 

        META_UPGRADES.forEach(u => {
            const unlocked = this.hasMetaUpgrade(u.id);
            const div = document.createElement('div');
            div.className = `upgrade-card ${unlocked ? 'unlocked' : ''}`;
            div.innerHTML = `
                <div class="upgrade-icon">${u.icon}</div>
                <div class="upgrade-info">
                    <div class="upgrade-name">${u.name}</div>
                    <div class="upgrade-desc">${u.desc}</div>
                </div>
                <div class="upgrade-cost">${unlocked ? 'INSTALLED' : u.cost + ' F'}</div>
            `;
            div.onclick = () => {
                if (unlocked) return;
                if (this.techFragments >= u.cost) {
                    this.techFragments -= u.cost;
                    this.metaUpgrades.push(u.id);
                    try {
                        localStorage.setItem('mvm_fragments', this.techFragments);
                        localStorage.setItem('mvm_upgrades', JSON.stringify(this.metaUpgrades));
                    } catch(e) { console.warn("Save failed", e); }
                    
                    document.getElementById('fragment-count').innerText = `Fragments: ${this.techFragments}`;
                    AudioMgr.playSound('upgrade');
                    this.renderMeta();
                } else {
                    div.style.borderColor = 'red';
                    setTimeout(() => div.style.borderColor = '', 200);
                }
            };
            list.appendChild(div);
        });
    },

    // Bake the static Sanctuary backdrop (sky gradient, moon, grid, ground,
    // trees + leaves) into an offscreen canvas. All the expensive recursive
    // tree/shadowBlur work happens ONCE here; per-frame we just blit.
    _buildSanctuaryCache(w, h, unlockedCount, progress) {
        const cache = document.createElement('canvas');
        cache.width = w; cache.height = h;
        const ctx = cache.getContext('2d');

        // Sky
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#020014');
        skyGrad.addColorStop(1, '#0a1a10');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, h);

        // Moon
        const sunY = h * 0.3;
        ctx.save();
        ctx.shadowBlur = 50;
        ctx.shadowColor = progress > 0.5 ? COLORS.NATURE_LIGHT : '#555';
        ctx.fillStyle = progress > 0.5 ? '#ccffdd' : '#333';
        ctx.beginPath();
        ctx.arc(w/2, sunY, 60, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // Perspective grid
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 153, 0.1)';
        ctx.lineWidth = 1;
        const horizon = h * 0.75;
        for (let i = 0; i < w; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, horizon);
            const xOffset = (i - w/2) * 2;
            ctx.lineTo(w/2 + xOffset, h);
            ctx.stroke();
        }
        for (let i = 0; i < h - horizon; i += 20) {
            const y = horizon + i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();

        // Ground
        const groundY = h * 0.75;
        const groundGrad = ctx.createLinearGradient(0, groundY, 0, h);
        groundGrad.addColorStop(0, '#001a05');
        groundGrad.addColorStop(1, '#000');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, groundY, w, h - groundY);

        ctx.fillStyle = COLORS.NATURE_DARK;
        ctx.fillRect(0, groundY, w, 2);

        // Procedural trees — static (no sway, no per-frame allocs)
        const treeCount = Math.min(8, 2 + Math.ceil(unlockedCount / 1.2));
        const maxDepth = Math.min(5, 3 + Math.floor(progress * 2));
        const spacing = w / (treeCount + 1);

        const drawBranch = (x, y, len, angle, depth, width) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle * Math.PI / 180);

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(0, -len/2, 0, -len);

            ctx.strokeStyle = depth > 1 ? COLORS.NATURE_DARK : COLORS.NATURE_LIGHT;
            if (depth === maxDepth) ctx.strokeStyle = '#0f3a1a';
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.stroke();

            if (depth <= 0) {
                if (progress > 0.2) {
                    // Deterministic leaf color so rebuilds look stable
                    ctx.fillStyle = ((x + y) | 0) % 2 === 0 ? COLORS.GOLD : COLORS.NATURE_LIGHT;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = ctx.fillStyle;
                    ctx.beginPath();
                    ctx.moveTo(0, -len);
                    ctx.lineTo(3, -len - 5);
                    ctx.lineTo(0, -len - 10);
                    ctx.lineTo(-3, -len - 5);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
                ctx.restore();
                return;
            }

            ctx.translate(0, -len);
            const spread = 25;
            const nextLen = len * 0.75;
            const nextWidth = width * 0.7;
            drawBranch(0, 0, nextLen, -spread, depth - 1, nextWidth);
            drawBranch(0, 0, nextLen,  spread, depth - 1, nextWidth);
            if (progress > 0.6 && depth % 2 === 0) {
                drawBranch(0, 0, nextLen * 0.8, 0, depth - 1, nextWidth);
            }
            ctx.restore();
        };

        for (let i = 1; i <= treeCount; i++) {
            const seed = i * 937;
            const x = (i * spacing) + (Math.sin(seed) * 30);
            const scale = 0.8 + (Math.cos(seed) * 0.2);
            const height = (100 + (unlockedCount * 12)) * scale;
            drawBranch(x, groundY + 10, height, 0, maxDepth, 8 * scale);
        }

        return cache;
    },

    drawSanctuary(dt) {
        const ctx = this.ctx;
        // Always use logical coords — the ctx transform handles DPR scaling.
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;
        const time = Date.now() / 1000;

        const totalUpgrades = META_UPGRADES.length;
        const unlockedCount = this.metaUpgrades.length;
        const progress = Math.max(0.1, unlockedCount / totalUpgrades);

        // Build / reuse offscreen cache. Invalidates on size or content change.
        const cacheKey = `${w}x${h}_${unlockedCount}_${progress.toFixed(2)}`;
        if (!this._sanctuaryCache || this._sanctuaryCacheKey !== cacheKey) {
            this._sanctuaryCache = this._buildSanctuaryCache(w, h, unlockedCount, progress);
            this._sanctuaryCacheKey = cacheKey;
        }
        ctx.drawImage(this._sanctuaryCache, 0, 0);

        // --- ANIMATED OVERLAYS (cheap) ---
        // Fireflies / spores — simple arcs, no gradients, no shadow blur.
        if (progress > 0.1) {
            const groundY = h * 0.75;
            const particleCount = Math.min(40, 10 + unlockedCount * 5);
            for (let i = 0; i < particleCount; i++) {
                const seed = i * 1234;
                const fx = (time * 20 + seed * 100) % w;
                const fy = (groundY) - ((time * 30 + seed * 50) % (groundY * 0.8));
                const alpha = 0.5 + Math.sin(time * 3 + seed) * 0.5;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = (i % 3 === 0) ? COLORS.GOLD : COLORS.NATURE_LIGHT;
                ctx.beginPath();
                ctx.arc(fx, fy, (i % 2 === 0) ? 2 : 1, 0, Math.PI*2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        // --- WEATHER CYCLE (time-of-day based on total playtime) ---
        this._drawSanctuaryWeather(ctx, w, h, time);

        // --- NPCs — unlock as meta milestones hit ---
        this._drawSanctuaryNPCs(ctx, w, h, time, unlockedCount);

        // --- Trophy wall — rendered above ground, right side. Only shows
        // frames for sectors the player has beaten at least once.
        this._drawTrophyWall(ctx, w, h, time);
    },

    // Playtime-driven day/dusk/night/dawn tint overlay. Uses total boot count
    // so each session advances the cycle subtly.
    _drawSanctuaryWeather(ctx, w, h, time) {
        // Cycle phase based on time-of-day (local clock) — gives the sanctuary
        // a living feel without needing a separate timer. 6 / 12 / 18 / 0h.
        const hour = new Date().getHours();
        let tint = null;
        if (hour >= 6 && hour < 11) tint = 'rgba(255, 200, 120, 0.08)';   // dawn
        else if (hour >= 11 && hour < 17) tint = null;                     // day
        else if (hour >= 17 && hour < 20) tint = 'rgba(255, 120, 80, 0.15)'; // dusk
        else tint = 'rgba(10, 20, 60, 0.25)';                              // night
        if (tint) {
            ctx.save();
            ctx.fillStyle = tint;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }
        // Corruption rain — intensity fades as progress grows (0% at full restoration).
        const unlockedCount = this.metaUpgrades ? this.metaUpgrades.length : 0;
        const totalUpgrades = META_UPGRADES ? META_UPGRADES.length : 10;
        const sanctProgress = Math.max(0.1, unlockedCount / totalUpgrades);
        const rainIntensity = Math.max(0, 1.0 - sanctProgress * 1.5);
        if (rainIntensity > 0.05) {
            const rainDrops = Math.floor(rainIntensity * 60);
            ctx.save();
            ctx.strokeStyle = `rgba(100, 180, 255, ${0.15 * rainIntensity})`;
            ctx.lineWidth = 1;
            for (let i = 0; i < rainDrops; i++) {
                const rx = (time * 80 + i * 197) % w;
                const ry = (time * 320 + i * 131) % h;
                ctx.beginPath();
                ctx.moveTo(rx, ry);
                ctx.lineTo(rx - 2, ry + 12);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Stars at night
        if (hour >= 20 || hour < 6) {
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 30; i++) {
                const sx = (i * 131) % w;
                const sy = (i * 47) % (h * 0.4);
                const tw = 0.4 + 0.4 * Math.sin(time * 2 + i);
                ctx.globalAlpha = tw;
                ctx.fillRect(sx, sy, 1.4, 1.4);
            }
            ctx.globalAlpha = 1;
        }
    },

    // Draw unlock-gated NPCs at fixed sanctuary positions. Each NPC is a
    // small silhouette with a class-themed idle animation.
    _drawSanctuaryNPCs(ctx, w, h, time, unlockedCount) {
        // Gatekeeper — always visible
        this._drawSanctuaryNPC(ctx, time, {
            x: w * 0.16, y: h * 0.72, color: '#00f3ff',
            label: 'GATEKEEPER', size: 1.0, sway: 0.6
        });

        // Smith — unlocks after 5 metas bought.
        if (unlockedCount >= 5) {
            this._drawSanctuaryNPC(ctx, time, {
                x: w * 0.82, y: h * 0.74, color: '#ff8800',
                label: 'SMITH', size: 1.0, sway: 0.2, toolSpark: true
            });
        }

        // Oracle — unlocks after first Ascension run.
        if (this.corruptionLevel > 0 || (typeof Ascension !== 'undefined' && Ascension.getSelected && Ascension.getSelected() > 0)) {
            this._drawSanctuaryNPC(ctx, time, {
                x: w * 0.5, y: h * 0.55, color: '#bc13fe',
                label: 'ORACLE', size: 1.0, sway: 0.4, float: true
            });
        }

        // Curator — unlocks once at least 6 lore fragments have been decrypted
        // (roughly the first third of LORE_DATABASE). Trophy-room custodian.
        if ((this.unlockedLore && this.unlockedLore.length >= 6)) {
            this._drawSanctuaryNPC(ctx, time, {
                x: w * 0.36, y: h * 0.68, color: '#ffd700',
                label: 'CURATOR', size: 1.0, sway: 0.35
            });
        }
    },

    // Hit-test and open the matching NPC modal. Called from the canvas
    // click handler when currentState === STATE.META.
    _sanctuaryHit(x, y) {
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;
        const R = 60; // generous tap target
        const unlockedCount = (this.metaUpgrades || []).length;
        const ascUnlocked = this.corruptionLevel > 0 || (typeof Ascension !== 'undefined' && Ascension.getSelected && Ascension.getSelected() > 0);
        const loreUnlocked = (this.unlockedLore && this.unlockedLore.length >= 6);
        const within = (nx, ny) => Math.hypot(x - nx, y - ny) < R;
        if (unlockedCount >= 5 && within(w * 0.82, h * 0.74)) return 'smith';
        if (ascUnlocked && within(w * 0.5, h * 0.55)) return 'oracle';
        if (loreUnlocked && within(w * 0.36, h * 0.68)) return 'curator';
        return null;
    },

    // Display the NPC modal with the right service UI. Fragments/persistence
    // are kept small — Smith + Oracle read/write `mvm_start_relic`; Curator
    // reads the trophy wall + decrypted-lore counter.
    openSanctuaryNPC(which) {
        const modal = document.getElementById('sanctuary-npc-modal');
        if (!modal) return;
        const title = modal.querySelector('.sanctuary-npc-title');
        const body = modal.querySelector('.sanctuary-npc-body');
        const actions = modal.querySelector('.sanctuary-npc-actions');
        // Reset actions each open — service-specific buttons are re-added below.
        actions.innerHTML = '<button class="btn secondary" data-action="npc-close">CLOSE</button>';

        if (which === 'smith') {
            title.textContent = 'SMITH';
            const saved = localStorage.getItem('mvm_start_relic') || '';
            const current = UPGRADES_POOL.find(r => r.id === saved);
            const cost = 150;
            const picks = [];
            const pool = [...UPGRADES_POOL];
            while (picks.length < 3 && pool.length > 0) {
                picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
            }
            const curLine = current
                ? `<p>Your banked starting relic: <b style="color:var(--neon-gold)">${current.name}</b> — it will be granted on your next run.</p>`
                : `<p>No starting relic banked. Roll a new one below.</p>`;
            const fragments = `<p>Fragments: <b style="color:var(--neon-gold)">${this.techFragments || 0}</b> &nbsp;·&nbsp; Reroll cost: <b>${cost}</b></p>`;
            body.innerHTML = `
                ${curLine}
                ${fragments}
                <div class="npc-picks">
                    ${picks.map(p => `
                        <div class="npc-relic-pick" data-relic-id="${p.id}">
                            <div class="npc-relic-name">${p.name}</div>
                            <div class="npc-relic-desc">${p.desc || ''}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            body.querySelectorAll('.npc-relic-pick').forEach(el => {
                el.onclick = () => {
                    if ((this.techFragments || 0) < cost) {
                        AudioMgr.playSound('defend');
                        ParticleSys.createFloatingText(540, 800, 'NOT ENOUGH FRAGMENTS', '#ff3355');
                        return;
                    }
                    this.techFragments -= cost;
                    try { localStorage.setItem('mvm_start_relic', el.dataset.relicId); } catch (e) {}
                    try { localStorage.setItem('mvm_fragments', String(this.techFragments)); } catch (e) {}
                    AudioMgr.playSound('upgrade');
                    ParticleSys.createFloatingText(540, 800, 'RELIC BANKED', '#ffd76a');
                    this.openSanctuaryNPC('smith'); // refresh
                };
            });
        }
        else if (which === 'oracle') {
            title.textContent = 'ORACLE';
            // Deterministic peek seeded on today's date — same preview all day.
            const today = new Date().toISOString().slice(0, 10);
            let h0 = 0;
            for (let i = 0; i < today.length; i++) h0 = ((h0 * 31) + today.charCodeAt(i)) | 0;
            const pool = [...UPGRADES_POOL];
            const picks = [];
            for (let i = 0; i < 3 && pool.length > 0; i++) {
                const idx = Math.abs(h0 + i * 7919) % pool.length;
                picks.push(pool.splice(idx, 1)[0]);
            }
            body.innerHTML = `
                <p>The Oracle peers through entropy. These relics will surface in your next run's first shop:</p>
                ${picks.map(p => `
                    <div class="npc-relic-pick" style="cursor:default">
                        <div class="npc-relic-name">${p.name}</div>
                        <div class="npc-relic-desc">${p.desc || ''}</div>
                    </div>
                `).join('')}
                <p style="opacity:0.7;font-size:var(--text-sm)">Vision refreshes at midnight local time.</p>
            `;
        }
        else if (which === 'curator') {
            title.textContent = 'CURATOR';
            const trophies = this._readTrophyWall ? this._readTrophyWall() : {};
            const sectorKeys = Object.keys(trophies).map(Number).sort();
            const bossRows = sectorKeys.length > 0
                ? sectorKeys.map(s => `
                    <div class="npc-trophy-row">
                        <img src="${trophies[s]}" alt="Sector ${s} trophy">
                        <div>
                            <div class="npc-relic-name">SECTOR ${s}</div>
                            <div class="npc-relic-desc">Boss defeated.</div>
                        </div>
                    </div>
                `).join('')
                : '<p>No bosses defeated yet — your trophy hall stands empty.</p>';
            const loreCount = (this.unlockedLore || []).length;
            const totalLore = (typeof LORE_DATABASE !== 'undefined' && LORE_DATABASE.length) || 0;
            body.innerHTML = `
                <p>The Curator tends the quiet archive of your victories.</p>
                <div><b>Lore fragments decrypted:</b> ${loreCount} / ${totalLore}</div>
                <div class="npc-trophy-list" style="margin-top:8px">${bossRows}</div>
            `;
        }
        else {
            return; // unknown NPC
        }

        actions.querySelector('[data-action="npc-close"]').onclick = () => this.closeSanctuaryNPC();
        modal.classList.remove('hidden');
    },

    closeSanctuaryNPC() {
        const modal = document.getElementById('sanctuary-npc-modal');
        if (modal) modal.classList.add('hidden');
    },

    // Render up to 5 small "trophy" frames on a vertical strip to the right
    // of the sanctuary. Each trophy is the boss-death snapshot for that
    // sector, with a sector-colored neon border + tick-marks.
    _drawTrophyWall(ctx, w, h, time) {
        const trophies = this._readTrophyWall();
        const sectors = Object.keys(trophies).map(Number).sort((a, b) => a - b);
        if (sectors.length === 0) return;

        if (!this._trophyImgCache) this._trophyImgCache = {};
        // Lazy-load images once per dataURL.
        sectors.forEach(s => {
            const url = trophies[s];
            const cached = this._trophyImgCache[s];
            if (!cached || cached.src !== url) {
                const img = new Image();
                img.src = url;
                this._trophyImgCache[s] = { src: url, img, ready: false };
                img.onload = () => { this._trophyImgCache[s].ready = true; };
            }
        });

        const frameW = 140, frameH = 100;
        const gap = 22;
        const startY = h * 0.18;
        const xCol = w - frameW - 28;
        const sectorColor = { 1: '#00f3ff', 2: '#88eaff', 3: '#ff8800', 4: '#7fff00', 5: '#ff3355' };

        // Wall backdrop — subtle dark strip behind the frames
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(xCol - 14, startY - 14, frameW + 28, sectors.length * (frameH + gap) + 14);

        sectors.forEach((s, i) => {
            const y = startY + i * (frameH + gap);
            const entry = this._trophyImgCache[s];
            const color = sectorColor[s] || '#ffd700';

            // Slight bob so the frames feel alive
            const bob = Math.sin(time * 0.8 + i) * 2;

            // Neon frame
            ctx.save();
            ctx.translate(xCol, y + bob);
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, frameW, frameH);
            // Trophy image (if loaded)
            if (entry && entry.ready) {
                try { ctx.drawImage(entry.img, 2, 2, frameW - 4, frameH - 4); } catch (e) {}
            }
            // Sector glow border
            ctx.strokeStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, frameW, frameH);
            ctx.shadowBlur = 0;
            // Sector label plate
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(4, frameH - 22, 68, 18);
            ctx.fillStyle = color;
            ctx.font = "bold 11px 'Orbitron', monospace";
            ctx.fillText(`SECTOR ${s}`, 9, frameH - 8);
            ctx.restore();
        });

        // "TROPHIES" caption above the strip
        ctx.save();
        ctx.fillStyle = 'rgba(255, 215, 0, 0.75)';
        ctx.font = "bold 14px 'Orbitron', monospace";
        ctx.textAlign = 'center';
        ctx.fillText('// TROPHIES', xCol + frameW / 2, startY - 22);
        ctx.restore();
    },

    _drawSanctuaryNPC(ctx, time, opts) {
        ctx.save();
        const floatOff = opts.float ? Math.sin(time * 1.2) * 8 : 0;
        ctx.translate(opts.x, opts.y + floatOff);
        const sway = Math.sin(time * opts.sway) * 2;
        // Shadow pool
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(0, 14, 22, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // Body — simple silhouette (head + cloak triangle)
        ctx.fillStyle = '#0a0a18';
        ctx.strokeStyle = opts.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = opts.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-18 + sway, 10);
        ctx.lineTo(-14 + sway, -30);
        ctx.lineTo(0 + sway, -40);
        ctx.lineTo(14 + sway, -30);
        ctx.lineTo(18 + sway, 10);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // Hood glow / face
        ctx.fillStyle = opts.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0 + sway, -30, 3, 0, Math.PI * 2);
        ctx.fill();
        // Tool spark for Smith
        if (opts.toolSpark && Math.random() < 0.12) {
            ctx.fillStyle = '#ffdd33';
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 6;
            const sx = 22 + sway, sy = -4 + (Math.random() - 0.5) * 6;
            ctx.fillRect(sx, sy, 2, 2);
        }
        ctx.shadowBlur = 0;
        // Label
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.font = "bold 11px 'Orbitron', monospace";
        ctx.textAlign = 'center';
        ctx.fillText(opts.label, 0, 28);
        ctx.globalAlpha = 1;
        ctx.restore();
    },

    goToCharSelect() {
        AudioMgr.startMusic();
        this.changeState(STATE.CHAR_SELECT);
    },

    // Rich metadata for the expanded class-detail overlay. Order of fields mirrors
    // the order rendered in the overlay: short description → style → minion → ability.
    _classMeta: {
        tactician: {
            description: "A cerebral commander flanked by three satellite drones. The Tactician starts with an extra die each turn and turns every action into tactical advantage — each die spent builds a pip on the Command Track, and three pips can be cashed in for exactly the edge the moment demands. Strong against any matchup because they adapt; best when you want to think turn-by-turn.",
            style: "Slow-build utility. Dice-efficient. Rewards patience and planning — weak to burst, strong against attrition.",
            minion: "Pawn — a sturdy frontline ally that grants the Tactician +1 Reroll on the turn after it dies, converting loss into more options.",
            ability: "COMMAND TRACK — 3 pips fill as dice are used. Spend all three on one of: +1 Reroll (flex your hand), +8 Shield (weather the next hit), or +5 damage on your next ATTACK (close the kill).",
            attack: "Volley → Salvo → Checkmate — your scaling signature strike. Damage + rerolls climb with tier.",
            combo:  "PINCER (ATK + DEF + MANA in one hand) — +1 reroll now and all enemy intents stay revealed.",
            difficulty: 2,
        },
        arcanist: {
            description: "A mana-rich ether-caster whose power is limited only by timing. The Arcanist starts combat with +2 base mana, opening up expensive skill plays early, and wields a Glyph Wheel that cycles through three elemental effects. Players who enjoy reading rhythm and claiming the right effect at the right moment will feel at home here.",
            style: "High mana. Timing-based minigame. Rewards pattern-reading; punishes panic taps.",
            minion: "Mana Wisp — a fragile conduit that grants +1 Mana on the turn after it dies, extending your spell economy.",
            ability: "GLYPH WHEEL — an active glyph rotates through Fire / Ice / Lightning. Tap while the glyph you want is lit: Fire deals 12 damage, Ice grants 5 shield + applies Weak to the enemy, Lightning grants +1 Reroll. One use per turn.",
            attack: "Spark → Hex → Rite — scaling arcane bolt. Later tiers also refund mana and apply Weak.",
            combo:  "CONVERGENCE (3 MANA dice) — instantly gain +2 Mana at climax.",
            difficulty: 3,
        },
        bloodstalker: {
            description: "A vampiric predator who treats HP as currency. The Bloodstalker takes +1 damage from every hit (a lasting vulnerability), but heals on lifesteal kills and can pay HP to empower brutal finishers. Players who like trading life for lethal bursts will thrive — the trick is knowing when you can afford to bleed.",
            style: "HP-as-resource. High risk, high reward. Burst-window class — all-in plays backed by heal triggers.",
            minion: "Blood Thrall — a predatory shield. While alive it absorbs every hit that would land on you. The Blood Pool still fills on those hits, so the tribute cycle keeps churning even when you're untouched.",
            ability: "BLOOD POOL — tap to pay 5 HP for one Blood Charge (up to 3). The next damage die you play consumes all charges for +5 damage per charge (up to +15).",
            attack: "Bite → Gouge → Maul — predatory strike that also heals you on hit.",
            combo:  "FEEDING FRENZY (2 ATK + 1 DEF) — heal 5 HP at climax on top of the per-hit lifesteal.",
            difficulty: 4,
        },
        annihilator: {
            description: "A reckless overcharged destroyer whose damage output is 50% higher than every other class. The trade-off: rerolling costs 20% of your max HP when you're out of free rerolls. Builds Overheat each die played; release it for massive payoff — or let it auto-vent and lose HP for free. A pure damage-focused class for players who want to delete enemies.",
            style: "Reckless burst. Heat-management. All-offense — every reroll is a choice between HP and options.",
            minion: "Bomb Bot — a volatile companion that detonates on death for 10 AoE damage to every enemy on the field.",
            ability: "OVERHEAT CORE — +10% heat per die used. Yellow zone (50–79%): tap for ×1.4 damage on your next die. Red zone (80–100%): tap for 20 AoE damage and 5 self-damage. Hit 100% without venting and you auto-take 5 damage.",
            attack: "Blast → Barrage → Annihilate — shield-piercing hammer. Late tiers Stun and apply Weak.",
            combo:  "OVERLOAD (2 ATK + 1 MANA) — next attack ×1.5 damage at climax.",
            difficulty: 4,
        },
        sentinel: {
            description: "A stalwart bulwark who treats the first ten damage as an afterthought. The Sentinel begins every combat with 10 shield and gains more with every Defend die and relic tick — the only class that can bank an absolute perfect block against any attack, including boss crushers. The preferred pick for players who want to outlast and punish rather than race.",
            style: "Defensive outlast. Shield-stacking. Steady attrition — strong into slow-cadence fights, weaker into multi-hit burst.",
            minion: "Guardian — a durable bodyguard that spawns with +10 bonus shield on top of its base HP.",
            ability: "SHIELD WALL — every 6 shield you gain lights one of three hex plates (buffered across turns). With all three lit, the next enemy attack is fully nullified, no matter how big.",
            attack: "Bash → Slam → Aegis Break — converts shield into damage; later tiers Taunt + add Thorns.",
            combo:  "FORTRESS (3 DEFEND dice) — +5 Thorns and a bubble at climax.",
            difficulty: 2,
        },
        summoner: {
            description: "A nature-attuned summoner who commands a growing forest of Spirits. Starts combat with one Spirit already on the field and a maximum cap of three minions — more than any other class. The Grove grows plants over time, but only while a minion is alive, creating a self-reinforcing loop: keep minions up, earn free summons, field overwhelming numbers.",
            style: "Minion synergy. Swarm playstyle. Scales hard in longer fights; vulnerable in the first two turns before the grove blooms.",
            minion: "Spirit — a nimble nature ally with a 30% chance to revive at half HP when killed.",
            ability: "GROVE — three plots cycle Seed → Sprout → Bloom over three turns, growing only while a minion is alive. Tap any fully Bloomed plot to summon a free Spirit, then it restarts at Seed.",
            attack: "Call → Rouse → Primal Roar — summons + damage that scales with living minions.",
            combo:  "WILD PACK (2 MINION + 1 ATK) — all alive minions gain +3 HP and +3 damage permanently.",
            difficulty: 3,
        },
    },

    renderCharSelect() {
        const grid = document.getElementById('char-grid');
        grid.innerHTML = '';

        // Inject (or update) the Ascension picker above the grid.
        this._renderAscensionPicker();
        // Custom Run bar (Roadmap Part 29) — only visible at Asc 1+.
        this._renderCustomRunBar();
        this._wireCustomRunEvents();

        // Build a persistent mock Player for each class — reused by the animation loop
        // both for the grid-card canvases and the detail-overlay canvas.
        this._charPreviewPlayers = PLAYER_CLASSES.map(cls => {
            const p = new Player(cls);
            p.classId = cls.id;
            p.anim = { type: 'idle', timer: 0, startVal: 0 };
            p.flashTimer = 0;
            p.spawnTimer = 0;
            p.effects = [];
            p.minions = [];
            p.nextIntents = null;
            return p;
        });

        // Mirror set of mock Minions — one per class — for the detail-overlay
        // minion preview. We bypass the Minion constructor (which reads
        // Game.player) by creating a prototype-linked object and populating
        // only the fields drawEntity needs. `instanceof Minion` still matches.
        this._charPreviewMinions = PLAYER_CLASSES.map(cls => {
            const m = Object.create(Minion.prototype);
            m.x = 0; m.y = 0;
            m.radius = 75;
            m.maxHp = 10; m.currentHp = 10;
            m.dmg = 1;
            m.tier = 1;
            m.charges = 1;
            m.level = 1;
            m.isPlayerSide = true;
            m.name = (cls.traits && cls.traits.minionName ? cls.traits.minionName : 'Ally') + ' 1';
            m.anim = { type: 'idle', timer: 0, startVal: 0 };
            m.flashTimer = 0;
            m.spawnTimer = 0;
            m.effects = [];
            return m;
        });

        PLAYER_CLASSES.forEach(cls => {
            const div = document.createElement('div');
            div.className = 'char-card';
            div.dataset.classId = cls.id;
            // Wrap the class name in a marquee-capable inner span. If the
            // text overflows its box we toggle the scroll class after
            // layout. data-name carries the text into the CSS ::after
            // pseudo so the marquee can render a seamless second copy.
            div.innerHTML = `
                <canvas class="char-preview" data-class-id="${cls.id}" width="240" height="240" aria-hidden="true"></canvas>
                <div class="char-name"><span class="char-name-inner" data-name="${cls.name}">${cls.name}</span></div>
            `;
            div.onclick = () => this.openCharDetail(cls);
            grid.appendChild(div);
        });

        // Paint each class preview exactly once into its canvas. drawEntity is
        // too expensive to run per-frame × 6 canvases; we bake each class into
        // an offscreen cache and blit. Re-paints only on explicit invalidation.
        document.querySelectorAll('canvas.char-preview').forEach(canvas => {
            this._paintCharPreview(canvas);
        });

        // Character-name marquee — enable scroll on every card whose text
        // doesn't fit its wrapper. Runs on multiple cadences because the
        // char-select screen uses stagger-in transforms that may be in
        // flight when renderCharSelect returns; if we check once too
        // early, every card reports clientWidth = 0 (display:none during
        // state transition) and nothing scrolls.
        const checkNames = () => {
            const cards = document.querySelectorAll('#screen-char-select .char-card');
            if (!cards.length) return false;
            let anyChecked = false;
            cards.forEach(card => {
                const wrap = card.querySelector('.char-name');
                const inner = card.querySelector('.char-name-inner');
                if (!wrap || !inner) return;
                // Wrapper hidden — measurement useless, try again later.
                if (wrap.clientWidth <= 0) return;
                anyChecked = true;
                if (inner.scrollWidth > wrap.clientWidth + 1) {
                    inner.classList.add('char-name-inner--scroll');
                } else {
                    inner.classList.remove('char-name-inner--scroll');
                }
            });
            return anyChecked;
        };
        // Retry ladder: rAF, 100 ms, 300 ms, 600 ms — catches the marquee
        // regardless of when the screen finishes its entry transition.
        requestAnimationFrame(() => {
            if (checkNames()) return;
            setTimeout(() => { if (checkNames()) return;
                setTimeout(() => { if (checkNames()) return;
                    setTimeout(checkNames, 300);
                }, 200);
            }, 100);
        });
    },

    // Bake a class preview into an offscreen cache keyed by classId+size.
    // Returns the cache canvas. Cheap subsequent calls return the cached one.
    _getCharPreviewCache(classId, size) {
        const key = `${classId}_${size}`;
        this._charPreviewCache = this._charPreviewCache || {};
        if (this._charPreviewCache[key]) return this._charPreviewCache[key];

        const idx = PLAYER_CLASSES.findIndex(c => c.id === classId);
        if (idx < 0) return null;
        const p = this._charPreviewPlayers && this._charPreviewPlayers[idx];
        if (!p) return null;

        const cache = document.createElement('canvas');
        cache.width = size; cache.height = size;
        const pctx = cache.getContext('2d');

        const origCtx = this.ctx;
        const origEnemy = this.enemy;
        this.ctx = pctx;
        this.enemy = null;
        p.x = size / 2;
        p.y = size / 2 + size * 0.08;
        p.radius = size * 0.22;
        p.currentHp = p.maxHp;
        // Freeze any idle animation by clamping timers
        p.anim = { type: 'idle', timer: 0, startVal: 0 };
        p.flashTimer = 0;
        p.spawnTimer = 0;
        try { this.drawEntity(p); } catch (e) { /* tolerate partial render */ }
        this.ctx = origCtx;
        this.enemy = origEnemy;

        this._charPreviewCache[key] = cache;
        return cache;
    },

    // Paint (or refresh) a single preview canvas from its cache.
    _paintCharPreview(canvas) {
        if (!canvas) return;
        const id = canvas.dataset.classId;
        if (!id) return;
        const size = Math.min(canvas.width, canvas.height);
        const cache = this._getCharPreviewCache(id, size);
        if (!cache) return;
        const pctx = canvas.getContext('2d');
        pctx.clearRect(0, 0, canvas.width, canvas.height);
        // Center the cached square inside the (possibly rectangular) canvas
        const dx = (canvas.width  - size) / 2;
        const dy = (canvas.height - size) / 2;
        pctx.drawImage(cache, dx, dy);
    },

    // Paint a single Enemy into a target canvas (used by the death-screen
    // portrait). Same ctx-swap + particle-suppress pattern as the char-select
    // preview. Idempotent, no side effects on combat state.
    _paintEnemyPortrait(canvas, enemy) {
        if (!canvas || !enemy) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const origCtx = this.ctx;
        const origSuppress = ParticleSys.suppress;
        ParticleSys.suppress = true;
        this.ctx = ctx;

        // Save the enemy's world position so combat-side rendering stays intact
        // if the corpse is still referenced elsewhere.
        const origX = enemy.x, origY = enemy.y, origRadius = enemy.radius;
        const origAnim = enemy.anim, origFlash = enemy.flashTimer, origSpawn = enemy.spawnTimer;

        const size = Math.min(canvas.width, canvas.height);
        enemy.x = canvas.width / 2;
        enemy.y = canvas.height / 2 + size * 0.05;
        // drawEntity scales enemies up by 1.6x internally — target ~half-canvas footprint.
        enemy.radius = size * 0.18;
        // Show the defeated state at full HP so the silhouette reads cleanly.
        if (typeof enemy.maxHp === 'number') enemy.currentHp = enemy.maxHp;
        enemy.anim = { type: 'idle', timer: 0, startVal: 0 };
        enemy.flashTimer = 0;
        enemy.spawnTimer = 0;

        try { this.drawEntity(enemy); } catch (e) { /* tolerate partial render */ }

        enemy.x = origX; enemy.y = origY; enemy.radius = origRadius;
        enemy.anim = origAnim; enemy.flashTimer = origFlash; enemy.spawnTimer = origSpawn;
        this.ctx = origCtx;
        ParticleSys.suppress = origSuppress;
    },

    // Paint the class minion once into its canvas (static, no animation).
    // Used on detail-overlay open so the minion is visible immediately — the
    // animation loop then refreshes it each frame.
    _paintMinionPreview(canvas) {
        if (!canvas) return;
        const id = canvas.dataset.classId;
        if (!id) return;
        const idx = PLAYER_CLASSES.findIndex(c => c.id === id);
        if (idx < 0) return;
        const minionMock = this._charPreviewMinions && this._charPreviewMinions[idx];
        const playerMock = this._charPreviewPlayers && this._charPreviewPlayers[idx];
        if (!minionMock || !playerMock) return;

        const mctx = canvas.getContext('2d');
        mctx.clearRect(0, 0, canvas.width, canvas.height);

        const origCtx = this.ctx;
        const origPlayer = this.player;
        const origEnemy = this.enemy;
        const origSuppress = ParticleSys.suppress;
        ParticleSys.suppress = true;
        this.ctx = mctx;
        this.player = playerMock;
        this.enemy = null;

        minionMock.x = canvas.width / 2;
        minionMock.y = canvas.height / 2;
        minionMock.currentHp = minionMock.maxHp;
        minionMock.flashTimer = 0;
        minionMock.spawnTimer = 0;
        minionMock.anim = { type: 'idle', timer: 0, startVal: 0 };

        try { this.drawEntity(minionMock); } catch (e) { /* tolerate partial render */ }

        this.ctx = origCtx;
        this.player = origPlayer;
        this.enemy = origEnemy;
        ParticleSys.suppress = origSuppress;
    },

    openCharDetail(cls) {
        AudioMgr.playSound('click');
        const overlay = document.getElementById('char-detail-overlay');
        if (!overlay) { this.selectClass(cls); return; }
        const meta = (this._classMeta && this._classMeta[cls.id]) || {};

        // Stop any previously-running preview animation before rebinding canvases.
        this._stopCharDetailAnim();

        // Inject a canvas bound to this class and paint it once from cache.
        const slot = overlay.querySelector('.char-detail-canvas-slot');
        if (slot) {
            slot.innerHTML = `<canvas class="char-preview" data-class-id="${cls.id}" width="280" height="280" aria-hidden="true"></canvas>`;
            const canvas = slot.querySelector('canvas.char-preview');
            if (canvas) this._paintCharPreview(canvas);
        }
        // Inject the minion preview canvas next to the player one and paint it once.
        const minionSlot = overlay.querySelector('.char-detail-minion-slot');
        if (minionSlot) {
            minionSlot.innerHTML = `<canvas class="char-preview-minion" data-class-id="${cls.id}" width="220" height="220" aria-hidden="true"></canvas>`;
            const minionCanvas = minionSlot.querySelector('canvas.char-preview-minion');
            if (minionCanvas) this._paintMinionPreview(minionCanvas);
        }

        overlay.querySelector('.char-detail-name').textContent = cls.name.toUpperCase();
        overlay.querySelector('.char-detail-desc').textContent = meta.description || cls.desc.replace(/\n/g, ' ');
        overlay.querySelector('.char-detail-style').textContent = meta.style || '—';
        overlay.querySelector('.char-detail-minion').textContent = meta.minion || '—';
        overlay.querySelector('.char-detail-ability').textContent = meta.ability || '—';
        const attackEl = overlay.querySelector('.char-detail-attack');
        if (attackEl) attackEl.textContent = meta.attack || '—';
        const comboEl = overlay.querySelector('.char-detail-combo');
        if (comboEl) comboEl.textContent = meta.combo || '—';

        const difficulty = meta.difficulty || 0;
        const stars = [];
        for (let i = 0; i < 5; i++) stars.push(i < difficulty ? '<span class="star-lit">★</span>' : '<span class="star-dim">★</span>');
        overlay.querySelector('.char-detail-difficulty').innerHTML = stars.join('');

        overlay.dataset.selected = cls.id;
        overlay.classList.remove('hidden');

        // Kick off the live animation (player + minion) for this class.
        this._startCharDetailAnim(cls.id);
    },

    closeCharDetail() {
        AudioMgr.playSound('click');
        const overlay = document.getElementById('char-detail-overlay');
        if (!overlay) return;
        this._stopCharDetailAnim();
        overlay.classList.add('hidden');
        const slot = overlay.querySelector('.char-detail-canvas-slot');
        if (slot) slot.innerHTML = '';
        const minionSlot = overlay.querySelector('.char-detail-minion-slot');
        if (minionSlot) minionSlot.innerHTML = '';
        overlay.dataset.selected = '';
    },

    confirmCharDetail() {
        const overlay = document.getElementById('char-detail-overlay');
        if (!overlay) return;
        const id = overlay.dataset.selected;
        const cls = PLAYER_CLASSES.find(c => c.id === id);
        if (!cls) return;
        this._stopCharDetailAnim();
        overlay.classList.add('hidden');
        const slot = overlay.querySelector('.char-detail-canvas-slot');
        if (slot) slot.innerHTML = '';
        const minionSlot = overlay.querySelector('.char-detail-minion-slot');
        if (minionSlot) minionSlot.innerHTML = '';
        // Bump generation so the preview loop halts — selectClass may change state asynchronously.
        this._charPreviewGen = (this._charPreviewGen || 0) + 1;
        this.selectClass(cls);
    },

    // ----- Character-detail preview animation -----
    // Runs only while the detail overlay is open. Drives the player + minion
    // canvases with continuous idle motion (drawEntity's built-in time-based
    // rotation/pulse) plus occasional `pulse`/`lunge` beats to suggest combat.
    // Throttled to ~30fps, paused when the tab is hidden, and downgraded on
    // low-tier hardware. ParticleSys is suppressed during preview draws so
    // ambient trails (see drawEntity) do not leak into combat pools.
    _startCharDetailAnim(classId) {
        this._stopCharDetailAnim();
        const overlay = document.getElementById('char-detail-overlay');
        if (!overlay || overlay.classList.contains('hidden')) return;
        const playerCanvas = overlay.querySelector('.char-detail-canvas-slot canvas.char-preview');
        const minionCanvas = overlay.querySelector('.char-detail-minion-slot canvas.char-preview-minion');
        if (!playerCanvas && !minionCanvas) return;

        const gen = (this._charDetailAnimGen || 0) + 1;
        this._charDetailAnimGen = gen;

        const tier = (Perf && Perf.tier) || 'high';
        const targetFps = tier === 'low' ? 20 : 30;
        const minFrameMs = 1000 / targetFps;

        // Schedule the first "combat beat" 1.2s out so the overlay settles first.
        const nextBeatAt = performance.now() + 1200;

        const state = {
            gen,
            classId,
            playerCanvas,
            minionCanvas,
            lastFrame: 0,
            minFrameMs,
            nextBeatAt,
            tier,
            rafId: 0,
        };
        this._charDetailAnimState = state;

        const tick = (now) => {
            // Cancel if a newer animation took over or the overlay closed.
            if (this._charDetailAnimGen !== gen) return;
            const stillOpen = overlay && !overlay.classList.contains('hidden') &&
                document.body.contains(state.playerCanvas || state.minionCanvas) &&
                this.currentState === STATE.CHAR_SELECT;
            if (!stillOpen) { this._stopCharDetailAnim(); return; }

            // Pause while the tab isn't visible — still reschedule so we resume cleanly.
            if (typeof document !== 'undefined' && document.hidden) {
                state.rafId = requestAnimationFrame(tick);
                return;
            }

            // Throttle to targetFps to limit CPU + battery.
            if (now - state.lastFrame < state.minFrameMs) {
                state.rafId = requestAnimationFrame(tick);
                return;
            }
            state.lastFrame = now;

            this._drawCharDetailFrame(state, now);
            state.rafId = requestAnimationFrame(tick);
        };

        state.rafId = requestAnimationFrame(tick);
    },

    _stopCharDetailAnim() {
        const s = this._charDetailAnimState;
        this._charDetailAnimGen = (this._charDetailAnimGen || 0) + 1;
        if (s && s.rafId) {
            cancelAnimationFrame(s.rafId);
        }
        this._charDetailAnimState = null;
    },

    _drawCharDetailFrame(state, now) {
        const { classId, playerCanvas, minionCanvas, tier } = state;
        const idx = PLAYER_CLASSES.findIndex(c => c.id === classId);
        if (idx < 0) return;
        const playerMock = this._charPreviewPlayers && this._charPreviewPlayers[idx];
        const minionMock = this._charPreviewMinions && this._charPreviewMinions[idx];

        // Trigger a combat beat occasionally — skipped on 'low' tier (idle only).
        if (tier !== 'low' && now >= state.nextBeatAt) {
            const beat = Math.floor(Math.random() * 3);
            // Alternate which entity performs the beat so the preview feels alive.
            const target = (Math.random() < 0.55) ? playerMock : minionMock;
            if (target) {
                if (beat === 0) target.anim = { type: 'pulse',  timer: 18, maxTimer: 18, startVal: 0 };
                else if (beat === 1) target.anim = { type: 'lunge',  timer: 16, maxTimer: 16, startVal: 0 };
                else target.anim = { type: 'windup', timer: 1, maxTimer: 12, startVal: 0 };
                // Clear windup after a short hold so it doesn't latch forever.
                if (beat === 2) setTimeout(() => {
                    if (target.anim && target.anim.type === 'windup') {
                        target.anim = { type: 'idle', timer: 0, startVal: 0 };
                    }
                }, 260);
            }
            // Next beat in 1.4 – 2.6s.
            state.nextBeatAt = now + 1400 + Math.random() * 1200;
        }

        // Swap in each canvas, render one entity, restore global drawing state.
        const origCtx = this.ctx;
        const origPlayer = this.player;
        const origEnemy = this.enemy;
        const origSuppress = ParticleSys.suppress;
        ParticleSys.suppress = true;

        try {
            if (playerCanvas && playerMock) {
                const pctx = playerCanvas.getContext('2d');
                pctx.clearRect(0, 0, playerCanvas.width, playerCanvas.height);
                this.ctx = pctx;
                this.enemy = null;
                this.player = playerMock;
                const size = Math.min(playerCanvas.width, playerCanvas.height);
                playerMock.x = playerCanvas.width / 2;
                playerMock.y = playerCanvas.height / 2 + size * 0.08;
                playerMock.radius = size * 0.22;
                playerMock.currentHp = playerMock.maxHp;
                playerMock.flashTimer = 0;
                playerMock.spawnTimer = 0;
                try { this.drawEntity(playerMock); } catch (e) { /* tolerate partial render */ }
            }

            if (minionCanvas && minionMock) {
                const mctx = minionCanvas.getContext('2d');
                mctx.clearRect(0, 0, minionCanvas.width, minionCanvas.height);
                this.ctx = mctx;
                this.enemy = null;
                // Minion drawing dispatches on this.player.classId / classColor — use the mock player.
                this.player = playerMock;
                minionMock.x = minionCanvas.width / 2;
                minionMock.y = minionCanvas.height / 2;
                minionMock.radius = 75;
                minionMock.currentHp = minionMock.maxHp;
                minionMock.flashTimer = 0;
                minionMock.spawnTimer = 0;
                try { this.drawEntity(minionMock); } catch (e) { /* tolerate partial render */ }
            }
        } finally {
            this.ctx = origCtx;
            this.player = origPlayer;
            this.enemy = origEnemy;
            ParticleSys.suppress = origSuppress;
        }
    },

    selectClass(cls) {
        AudioMgr.playSound('click');
        
        // Wipe the active run save
        localStorage.removeItem('mvm_save_v1');
        document.getElementById('btn-load-save').style.display = "none";
        
        // --- FIX: RESET ALL SEEN FLAGS ---
        // This ensures the player is treated as "new" for this run, 
        // triggering Map, Elite, and Boss tutorials again.
        this.seenFlags = {};
        try {
            localStorage.setItem('mvm_seen', JSON.stringify(this.seenFlags));
        } catch (e) { console.warn("Could not reset flags", e); }
        // ---------------------------------

        this.player = new Player(cls);
        this.player.classId = cls.id;
        this.sector = 1;
        this.bossDefeated = false;
        // Chronicle start marker (Roadmap Part 27).
        this.runStartedAt = Date.now();
        // Custom run modifiers applied here so every downstream spawn
        // (first combat, starting HP, trait overrides) sees the change.
        this._applyCustomRunModifiers();
        // Per-run flag: first hack minigame of the run is always normal
        // difficulty so new players aren't immediately face-planted.
        this._hasHackedThisRun = false;

        // Smith's banked starting relic — consume on run start (one-shot).
        try {
            const bankedId = localStorage.getItem('mvm_start_relic');
            if (bankedId) {
                const relic = UPGRADES_POOL.find(r => r.id === bankedId);
                if (relic && this.player.addRelic) {
                    this.player.addRelic(relic);
                    ParticleSys.createFloatingText(540, 220, `RELIC: ${relic.name}`, '#ffd76a');
                }
                localStorage.removeItem('mvm_start_relic');
            }
        } catch (e) { /* ignore storage errors */ }

        Analytics.emit('run_start', {
            class: cls.id,
            ascension: (typeof Ascension !== 'undefined' && Ascension.getSelected) ? Ascension.getSelected() : 0,
            daily: !!this.isDailyRun
        });

        // Run stats reset
        this.runStats = { turns: 0, totalDamage: 0, highestHit: 0, kills: 0, synergies: [] };
        this.synergiesTriggered = new Set();
        this.firstSynergyAwardedRun = false;
        
        this.generateMap();
        this.renderRelics();

        // First-run auto-tutorial (Phase 3). Profile-level flag (persists across runs).
        const firstRunDone = localStorage.getItem('mvm_first_run_done') === '1';
        if (!firstRunDone) {
            this.tutorialAutoRun = true;
            this.startTutorial();
            this.saveGame();
            return;
        }

        this.changeState(STATE.MAP);

        // Save initial state
        this.saveGame();

    },

    getRelicDescription(relic, count) {
        if (relic.id === 'relentless') {
            if (count === 1) return "3rd Attack in a turn deals TRIPLE damage.";
            if (count === 2) return "2nd Attack in a turn deals TRIPLE damage.";
            return "1st Attack in a turn deals TRIPLE damage.";
        }

        if (relic.id === 'firewall') {
            if (count === 1) return "First unblocked damage capped at 20.";
            if (count === 2) return "First unblocked damage capped at 10.";
            if (count >= 3) return "First unblocked damage reduced to 0.";
        }

        if (relic.id === 'solar_battery') {
            const manaAmt = (count * 2) - 1;
            return `Every 3rd turn, gain +${manaAmt} Mana.`;
        }

        if (relic.id === 'brutalize') {
            if (count === 1) return "Killing a minion deals (its DMG + 3) to others."; // RESTORED: +3
            return `Killing a minion deals ${count}x (its DMG + 3) to others.`;
        }
        
        return relic.desc.replace(/(\d+)/g, (match) => {
            return parseInt(match) * count;
        });
    },

    renderRelics() {
        const container = document.getElementById('relic-list');
        if(!container || !this.player) return;
        container.innerHTML = '';

        const counts = {};
        this.player.relics.forEach(r => {
            counts[r.id] = (counts[r.id] || 0) + 1;
        });

        const uniqueIds = Object.keys(counts);

        if (uniqueIds.length === 0) {
            container.innerHTML = '<div style="color:#555; font-size:0.8rem;">No modules installed.</div>';
            return;
        }

        uniqueIds.forEach(id => {
            const r = this.player.relics.find(item => item.id === id);
            const count = counts[id];

            const wrapper = document.createElement('div');
            wrapper.className = 'relic-wrapper';

            const el = document.createElement('div');
            el.className = 'relic-icon';
            el.innerHTML = r.icon;
            el.style.fontSize = "2rem";

            if (count > 1) {
                const badge = document.createElement('div');
                badge.className = 'relic-count';
                badge.innerText = count;
                wrapper.appendChild(badge);
            }

            const dynamicDesc = this.getRelicDescription(r, count);
            const titleText = count > 1 ? `<strong>${r.name} (x${count})</strong>` : `<strong>${r.name}</strong>`;

            wrapper.onmouseenter = (e) => TooltipMgr.show(`${titleText}\n${dynamicDesc}`, e.clientX, e.clientY);
            wrapper.onmouseleave = () => TooltipMgr.hide();

            wrapper.addEventListener('touchstart', (e) => {
                e.stopPropagation();
                const touch = e.touches[0];
                TooltipMgr.show(`${titleText}\n${dynamicDesc}`, touch.clientX, touch.clientY - 80);
            }, { passive: true });

            wrapper.appendChild(el);
            container.appendChild(wrapper);
        });
    },

playEndingCinematic() {
        const content = document.getElementById('ending-content');
        const btn = document.getElementById('btn-finish-ending');
        
        // Reset animation
        content.style.animation = 'none';
        content.offsetHeight; /* trigger reflow */
        content.style.animation = null; 
        
        content.innerHTML = `
            <div class="story-wrapper">
                <h1 class="neon-text-red" style="font-size:3.5rem; margin-bottom:40px; text-transform:uppercase; letter-spacing: 5px;">FATAL EXCEPTION</h1>
                
                <p>The Source has been deleted.</p>
                <p>The digital sky cracks. The red glare of the obsidian eye fades into static.</p>
                
                <br>
                <p>You extract the core data. You expect to find the architect of our destruction.</p>
                <p>Instead, you find a <strong class="neon-text-blue">proxy server</strong>.</p>
                
                <br>
                <p>The Source was not the mind. It was merely the lock.</p>
                <p>By destroying it, you haven't ended the war...</p>
                <p>You have rung the doorbell.</p>
                
                <br>
                <p style="font-size: 1.8rem; color: #fff;">Something older is waking up.</p>
                <p style="font-size: 1.8rem; color: var(--neon-gold);">Keep fighting, Green Spark.</p>
                
                <br><br><br>
                <p class="neon-text-green" style="font-size:1.5rem; font-family:'Orbitron'; letter-spacing: 3px;">
                    MISSION STATUS: PARTIAL SUCCESS
                </p>
            </div>
        `;
        
        content.classList.add('story-crawl');
        
        btn.classList.add('hidden');
        setTimeout(() => {
            btn.classList.remove('hidden');
        }, 6000); 
    },

triggerPhaseGlitch() {
        // Lighter, shorter cousin of triggerSystemCrash — does NOT pause music.
        return new Promise(resolve => {
            let glitchCount = 0;
            const maxGlitches = 8;
            const interval = setInterval(() => {
                glitchCount++;
                const canvas = this.canvas;
                const x = (Math.random() - 0.5) * 24;
                const y = (Math.random() - 0.5) * 24;
                canvas.style.transform = `translate(${x}px, ${y}px) scale(${1 + Math.random()*0.04})`;
                if (glitchCount % 2 === 0) {
                    canvas.style.filter = 'hue-rotate(40deg) contrast(1.2)';
                } else {
                    canvas.style.filter = 'none';
                }
                if (glitchCount === 2) AudioMgr.createNoise(0.08, 0.35);
                if (glitchCount >= maxGlitches) {
                    clearInterval(interval);
                    canvas.style.transform = 'none';
                    canvas.style.filter = 'none';
                    resolve();
                }
            }, 70);
        });
    },

    checkSynergies(newRelic) {
        if (!this.player || !Array.isArray(SYNERGIES)) return;
        const ownedIds = new Set(this.player.relics.map(r => r.id));
        this.synergiesTriggered = this.synergiesTriggered || new Set();
        for (const s of SYNERGIES) {
            if (this.synergiesTriggered.has(s.id)) continue;
            const complete = s.ids.every(id => ownedIds.has(id));
            if (!complete) continue;
            // Only fire when the newly-added relic is one of the synergy parts.
            if (newRelic && !s.ids.includes(newRelic.id)) continue;
            this.synergiesTriggered.add(s.id);
            // Track for run summary (C13).
            this.runStats = this.runStats || { synergies: [] };
            this.runStats.synergies = this.runStats.synergies || [];
            this.runStats.synergies.push(s.name);
            // First synergy this run grants a fragment bonus.
            const isFirstThisRun = !this.firstSynergyAwardedRun;
            if (isFirstThisRun) {
                this.firstSynergyAwardedRun = true;
                this.techFragments += 30;
            }
            Hints.trigger('first_synergy');
            Achievements.unlock && Achievements.unlock('SYNERGY_FIRST');
            this.showSynergyBanner(s, isFirstThisRun ? 30 : 0);
        }
    },

    showSynergyBanner(s, fragBonus) {
        // Lightweight banner via floating text over the player for 2.5s + subtitle line.
        if (this.player) {
            ParticleSys.createFloatingText(this.player.x, this.player.y - 180, `SYNERGY: ${s.name}`, COLORS.GOLD);
            if (fragBonus > 0) {
                ParticleSys.createFloatingText(this.player.x, this.player.y - 140, `+${fragBonus} FRAG DISCOVERY BONUS`, COLORS.GOLD);
            }
        }
        AudioMgr.playSound('mana');
        // Reuse the phase banner overlay for a moment.
        this.showPhaseBanner(s.name, s.desc, 'player');
    },

    flyRewardToStrip(cardEl, item) {
        // Animate a clone from the reward card → Modules button (where new relics live).
        if (!cardEl) return;
        const target = document.getElementById('btn-relics');
        const cardRect = cardEl.getBoundingClientRect();
        let targetX = 30, targetY = 40;
        if (target) {
            const r = target.getBoundingClientRect();
            targetX = r.left + r.width / 2;
            targetY = r.top + r.height / 2;
        }
        const flyer = document.createElement('div');
        flyer.className = 'reward-flyer';
        flyer.innerHTML = `<span style="font-size:1.6rem;">${item.icon}</span>`;
        flyer.style.left = cardRect.left + 'px';
        flyer.style.top  = cardRect.top + 'px';
        flyer.style.width = cardRect.width + 'px';
        flyer.style.height = cardRect.height + 'px';
        document.body.appendChild(flyer);
        void flyer.offsetHeight;
        flyer.style.transform = `translate(${targetX - cardRect.left - cardRect.width/2}px, ${targetY - cardRect.top - cardRect.height/2}px) scale(0.18)`;
        flyer.style.opacity = '0.4';
        setTimeout(() => { if (flyer.parentNode) flyer.remove(); }, 540);
        setTimeout(() => {
            if (target) {
                target.classList.add('relic-strip-flash');
                setTimeout(() => target.classList.remove('relic-strip-flash'), 600);
            }
        }, 480);
    },

    setButtonLabel(btn, newHtml) {
        if (!btn) return;
        if (btn.innerHTML === newHtml) return;
        btn.classList.add('btn-label-fading');
        setTimeout(() => {
            btn.innerHTML = newHtml;
            btn.classList.remove('btn-label-fading');
        }, 140);
    },

    playSectorIntro(sectorNum) {
        const overlay = document.getElementById('sector-intro');
        const num = document.getElementById('sector-intro-num');
        const name = document.getElementById('sector-intro-name');
        const mech = document.getElementById('sector-intro-mech');
        if (!overlay || !num || !name) return Promise.resolve();
        const SECTOR_NAMES = { 1: 'THE GATE', 2: 'THE VOID', 3: 'THE FORGE', 4: 'THE HIVE', 5: 'THE CORE' };
        num.textContent = `SECTOR ${sectorNum}`;
        name.textContent = SECTOR_NAMES[sectorNum] || '';
        // Surface the sector signature mechanic (Part 23) so the player
        // reads what rule will colour their combats here before stepping in.
        // Only render when the sector actually has a mechanical effect —
        // Sector 1 is the baseline and the blurb is pure flavour there.
        if (mech) {
            const mechData = SECTOR_MECHANICS[sectorNum];
            const hasRealMech = !!(mechData && (
                mechData.enemyShieldBonus || mechData.playerHeatDmg ||
                mechData.minionDmgMult || mechData.damageNoiseRange
            ));
            mech.textContent = hasRealMech
                ? `${mechData.label} — ${mechData.desc}`
                : '';
        }
        overlay.classList.remove('hidden');
        // Force reflow so the transition fires.
        void overlay.offsetHeight;
        overlay.classList.add('active');
        if (AudioMgr && AudioMgr.playSound) AudioMgr.playSound('mana');
        return new Promise(resolve => {
            setTimeout(() => {
                overlay.classList.remove('active');
                setTimeout(() => { overlay.classList.add('hidden'); resolve(); }, 240);
            }, 1100);
        });
    },

    showSkeleton(containerId, count = 3) {
        const c = document.getElementById(containerId);
        if (!c) return;
        c.innerHTML = '<div class="skeleton-grid">' +
            Array.from({ length: count }, () => '<div class="skeleton skeleton-card"></div>').join('') +
            '</div>';
    },

    haptic(intensity = 'tap') {
        if (this.hapticsEnabled === false) return;
        if (!('vibrate' in navigator)) return;
        const PATTERNS = {
            tap:      8,
            select:   15,
            hit:      [20, 30, 20],
            heavy:    [50, 30, 80],
            crit:     [30, 20, 30],
            damage:   60,
            boss:     [50, 30, 80, 30, 50],
            warn:     [40, 60, 40, 60, 40],
            die_use:  [15, 20, 25]
        };
        try { navigator.vibrate(PATTERNS[intensity] || 8); } catch (e) {}
    },

    bindHapticDelegation() {
        // One delegated listener for all button-like elements — fires a tap pulse
        // whenever any .btn, .btn-icon, .btn-circle, .die, .map-node-abs is pressed.
        document.addEventListener('pointerdown', (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            if (t.closest('.btn, .btn-icon, .btn-circle, .die, .map-node-abs, .reward-card, .shop-item, .relic-strip-tile, .char-card, .upgrade-card')) {
                this.haptic('tap');
            }
        }, { passive: true });
    },

    bindKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Don't interfere when user is typing in inputs or modal is blocking
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            // Escape → close the topmost modal in priority order, or toggle
            // settings if nothing else is open. Sanctuary NPC / hack minigame
            // take priority so the player can't get trapped inside them.
            if (e.key === 'Escape') {
                const npcModal = document.getElementById('sanctuary-npc-modal');
                if (npcModal && !npcModal.classList.contains('hidden')) {
                    this.closeSanctuaryNPC && this.closeSanctuaryNPC();
                    e.preventDefault();
                    return;
                }
                const hackOverlay = document.getElementById('hack-minigame-overlay');
                if (hackOverlay && !hackOverlay.classList.contains('hidden')) {
                    // Treat ESC during hack as a failure — the maze timer is
                    // already running and the shop state must resolve either way.
                    // Dispatch a synthetic "lockout" to stop the RAF loop and
                    // close cleanly without leaving the shop stranded.
                    const resultEl = document.getElementById('hack-result');
                    if (resultEl) resultEl.textContent = 'ABORTED';
                    hackOverlay.classList.add('hidden');
                    hackOverlay.classList.remove('is-hard');
                    e.preventDefault();
                    return;
                }
                const charDetail = document.getElementById('char-detail-overlay');
                if (charDetail && !charDetail.classList.contains('hidden')) {
                    this.closeCharDetail && this.closeCharDetail();
                    e.preventDefault();
                    return;
                }
                const modal = document.getElementById('modal-settings');
                if (modal) modal.classList.toggle('hidden');
                e.preventDefault();
                return;
            }

            // Combat-only shortcuts
            if (this.currentState !== STATE.COMBAT && this.currentState !== STATE.TUTORIAL_COMBAT) return;

            if (e.key === ' ' || e.code === 'Space') {
                // Space → end turn
                const btn = document.getElementById('btn-end-turn');
                if (btn && !btn.disabled) btn.click();
                e.preventDefault();
            } else if (e.key === 'r' || e.key === 'R') {
                // R → reroll
                const btn = document.getElementById('btn-reroll');
                if (btn) btn.click();
                e.preventDefault();
            } else if (e.key >= '1' && e.key <= '6') {
                // Number keys → toggle die selection
                const idx = parseInt(e.key, 10) - 1;
                const die = this.dicePool && this.dicePool[idx];
                if (die && !die.used && (!this.player.traits.noRerolls || (this.player.qteRerolls || 0) > 0)) {
                    die.selected = !die.selected;
                    this.renderDiceUI();
                }
                e.preventDefault();
            }
        });
    },

    bindTabVisibility() {
        // When returning from background on mobile the AudioContext often
        // ends up 'suspended' (Android) or 'interrupted' (iOS Safari). Until
        // it's resumed every SFX silently drops and WebAudio-piped music
        // stays muted. Resuming here + re-arming a one-shot gesture covers
        // both auto-resume-capable browsers and strict-gesture iOS.
        const resumeAudio = () => {
            if (AudioMgr.ctx && AudioMgr.ctx.state !== 'running') {
                AudioMgr.ctx.resume().catch(() => {});
            }
        };
        const armResumeOnNextGesture = () => {
            if (this._audioResumeArmed) return;
            this._audioResumeArmed = true;
            const handler = () => {
                this._audioResumeArmed = false;
                resumeAudio();
                ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev =>
                    window.removeEventListener(ev, handler)
                );
            };
            ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(ev =>
                window.addEventListener(ev, handler, { passive: true })
            );
        };

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (AudioMgr.bgm && !AudioMgr.bgm.paused) {
                    AudioMgr._wasPlaying = true;
                    AudioMgr.fadeMusicOut(250);
                }
            } else {
                resumeAudio();
                armResumeOnNextGesture();
                if (AudioMgr._wasPlaying && AudioMgr.musicEnabled) {
                    AudioMgr.fadeMusicIn(500);
                    AudioMgr._wasPlaying = false;
                }
            }
        });

        // Safari restores pages from the back-forward cache without ever
        // firing visibilitychange — the DOM/JS state is frozen and dice /
        // audio contexts can't be resumed cleanly. Force a full reload so
        // the intro, audio unlock, and game loop boot from a known state.
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                try { window.location.reload(); } catch (err) {}
                return;
            }
            resumeAudio();
            armResumeOnNextGesture();
        });
    },

    installErrorBoundary() {
        const self = this;
        // Browser extensions (Brave/Firefox iOS reader-mode, ad blockers, Grammarly,
        // etc.) inject content scripts into the page and sometimes throw from a
        // context that bubbles up to window.onerror. Those aren't our bugs and
        // must not trigger the game's SYSTEM FAULT overlay.
        // Token list used by both error and rejection paths. Matches the raw
        // identifier so "Can't find variable: __firefox__" (Safari) and
        // "window.__firefox__ is undefined" (Chromium) both get caught.
        const EXT_TOKEN_RE = /__firefox__|__gCrWeb|__gBleyer|webkit\.messageHandlers|Grammarly|__REACT_DEVTOOLS_|__REDUX_DEVTOOLS_|ResizeObserver loop/i;
        const isExternalError = (event) => {
            const msg = String((event && (event.message || (event.error && event.error.message))) || '');
            // Opaque cross-origin script errors — browsers strip all detail.
            if (msg === 'Script error.' || msg === 'Script error') return true;
            if (EXT_TOKEN_RE.test(msg)) return true;
            // Source file lives in an extension, not our origin.
            const src = String((event && event.filename) || '');
            if (/^(chrome|moz|safari-web|brave|webkit-masked)-extension:/i.test(src)) return true;
            if (src && typeof location !== 'undefined' && location.origin &&
                src.indexOf('://') >= 0 && src.indexOf(location.origin) !== 0) {
                return true;
            }
            return false;
        };
        const isExternalRejection = (reason) => {
            const msg = (reason && reason.message) ? String(reason.message) : String(reason || '');
            return EXT_TOKEN_RE.test(msg);
        };
        window.addEventListener('error', (event) => {
            if (isExternalError(event)) {
                // Log for debugging but don't surface to the player.
                console.warn('[Error boundary] Ignoring external error:', event.message || event);
                return;
            }
            console.error('[Error boundary]', event.error || event.message, event);
            self._recoverFromCombatError('window_error', event.error || new Error(event.message || 'Unknown error'), /*showFullOverlay*/ true);
        });
        window.addEventListener('unhandledrejection', (event) => {
            if (isExternalRejection(event.reason)) {
                console.warn('[Error boundary] Ignoring external rejection:', event.reason);
                return;
            }
            console.error('[Error boundary] Unhandled promise:', event.reason);
            self._recoverFromCombatError('unhandled_rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason)), /*showFullOverlay*/ true);
        });
    },

    // Combat-safe error recovery. Wraps the risky async flows (endTurn,
    // startTurn, winCombat) — on exception, logs the failure, surfaces a
    // short recovery toast (instead of a hard "SYSTEM FAULT" panel), and
    // releases any locked input / disabled buttons so the player can
    // continue the run. If `showFullOverlay` is true, also renders the
    // dismissable overlay (used by the global window handlers when the
    // error happened outside any combat-step wrapper).
    _recoverFromCombatError(where, err, showFullOverlay) {
        const msg = (err && err.message) ? err.message : String(err);
        console.error(`[Combat recovery] ${where}:`, err);
        try {
            if (typeof Analytics !== 'undefined' && Analytics.emit) {
                Analytics.emit('combat_error', {
                    where,
                    msg: msg.slice(0, 240),
                    state: this.currentState,
                    sector: this.sector,
                    turn: this.turnCount || 0
                });
            }
        } catch (_) { /* analytics must never throw into the recovery path */ }

        // Always unlock input + restore end-turn button so the player
        // isn't stranded mid-phase on a silent async rejection.
        try {
            this.inputLocked = false;
            const btnEnd = document.getElementById('btn-end-turn');
            if (btnEnd) {
                btnEnd.disabled = false;
                btnEnd.style.opacity = 1;
                if (this.setButtonLabel && typeof ICONS !== 'undefined' && ICONS.endTurn) {
                    this.setButtonLabel(btnEnd, ICONS.endTurn);
                }
            }
            this._clearRerollIntervals && this._clearRerollIntervals();
        } catch (_) { /* ignore */ }

        // Short user-visible toast for lesser errors (non-showFullOverlay)
        if (!showFullOverlay && this.showHintToast) {
            this.showHintToast('Glitch detected — turn recovered.', 2600);
        } else {
            this._showErrorOverlay(err);
        }
    },

    // Wraps any async combat function so exceptions route through
    // _recoverFromCombatError instead of stranding the run. Usage:
    //   await this._safeCombatStep('endTurn', () => this._endTurnImpl());
    async _safeCombatStep(label, fn) {
        try {
            return await fn();
        } catch (err) {
            this._recoverFromCombatError(label, err, /*showFullOverlay*/ false);
            return undefined;
        }
    },

    _showErrorOverlay(err) {
        // Don't spam — only one overlay at a time.
        if (document.getElementById('err-boundary')) return;
        const overlay = document.createElement('div');
        overlay.id = 'err-boundary';
        overlay.className = 'err-boundary';
        overlay.innerHTML = `
            <div class="err-box">
                <h2>SYSTEM FAULT</h2>
                <p>An unexpected error occurred. Your run is probably recoverable.</p>
                <pre>${(err && err.message) ? err.message : String(err)}</pre>
                <div class="err-actions">
                    <button class="btn secondary" id="err-dismiss">Continue</button>
                    <button class="btn danger" id="err-reload">Restart</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.getElementById('err-dismiss').onclick = () => overlay.remove();
        document.getElementById('err-reload').onclick = () => window.location.reload();
    },

    showHintOnce(flagId, text) {
        if (this.tutorialHintsEnabled === false) return;
        this.seenFlags = this.seenFlags || {};
        if (this.seenFlags[flagId]) return;
        this.seenFlags[flagId] = true;
        try { localStorage.setItem('mvm_seen', JSON.stringify(this.seenFlags)); } catch(e) {}
        this.showHintToast(text);
    },

    showHintToast(text, ms = 4000) {
        let toast = document.getElementById('hint-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'hint-toast';
            toast.className = 'hint-toast';
            document.getElementById('game-container').appendChild(toast);
        }
        toast.innerHTML = `<span class="hint-icon">💡</span> ${text}`;
        toast.classList.remove('hidden');
        void toast.offsetHeight; // reflow
        toast.classList.add('active');
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.classList.add('hidden'), 350);
        }, ms);
    },

    triggerSlowMo(scale = 0.4, duration = 0.6) {
        // Cinematic slow-motion. Re-entrant: newest call wins.
        this.slowMoScale = scale;
        this.slowMoTimer = duration;
    },

    // Camera zoom cinematic — brief CSS transform on the game canvas wrapper.
    triggerBossZoom() {
        const cv = document.getElementById('gameCanvas');
        if (!cv) return;
        cv.classList.remove('boss-zoom');
        void cv.offsetWidth; // force reflow so animation restarts
        cv.classList.add('boss-zoom');
        setTimeout(() => cv.classList.remove('boss-zoom'), 1400);
    },

    // End-of-turn summary popup — DOM-based, ephemeral
    showTurnSummary() {
        const s = this.turnStats;
        if (!s || (s.dmgDealt === 0 && s.dmgTaken === 0)) return; // skip empty turns
        let host = document.getElementById('turn-summary-popup');
        if (!host) {
            host = document.createElement('div');
            host.id = 'turn-summary-popup';
            host.className = 'turn-summary-popup';
            document.body.appendChild(host);
        }
        const parts = [];
        if (s.dmgDealt > 0) parts.push(`<span class="ts-dealt">+${s.dmgDealt} DMG dealt</span>`);
        if (s.dmgTaken > 0) parts.push(`<span class="ts-taken">-${s.dmgTaken} HP</span>`);
        if (this.rerolls > 0) parts.push(`<span class="ts-meta">${this.rerolls} reroll${this.rerolls === 1 ? '' : 's'} banked</span>`);
        host.innerHTML = parts.join('<span class="ts-sep">·</span>');
        host.classList.remove('hidden');
        host.classList.add('active');
        clearTimeout(this._summaryTimer);
        this._summaryTimer = setTimeout(() => {
            host.classList.remove('active');
            setTimeout(() => host.classList.add('hidden'), 250);
        }, 1100);
    },

    // Pipe combat events into the combat-log service. Entity.js calls this.
    logCombatEvent(e) {
        try { CombatLog.push(e); } catch (err) { /* ignore */ }
    },

    // Hit-stop: freeze the canvas for a few ms so heavy hits land with weight.
    // Re-entrant; longest active wins.
    hitStop(durationMs = 60) {
        const until = performance.now() + durationMs;
        if (!this.hitStopUntil || until > this.hitStopUntil) {
            this.hitStopUntil = until;
        }
    },

    // Per-tier shake — auto-scales magnitude by damage / player.maxHp ratio.
    // Tap (≤10%) = 4, hit (≤25%) = 10, heavy (≤50%) = 18, brutal (>50%) = 28.
    shakeFromDamage(amount) {
        if (!this.player || amount <= 0) return;
        const ratio = amount / Math.max(1, this.player.maxHp);
        let mag = 4;
        if (ratio > 0.5)       mag = 28;
        else if (ratio > 0.25) mag = 18;
        else if (ratio > 0.10) mag = 10;
        // Apply quality scaling so low-end devices avoid heavy shakes
        const q = this.qualityShakeScale || 1;
        this.shake(Math.round(mag * q));
    },

    // Screen-flash overlay for perfect QTEs / dramatic moments
    triggerScreenFlash(color = 'rgba(255,255,255,0.4)', durationMs = 220) {
        this.screenFlashColor = color;
        this.screenFlashUntil = performance.now() + durationMs;
        this.screenFlashStart = performance.now();
        this.screenFlashDuration = durationMs;
    },

    async triggerBossPhaseTransition(enemy, phase = 2) {
        if (!enemy) return;
        const PHASE_LINES = {
            2: {
                'THE PANOPTICON':  'EYE LOCKED — ALL GAZE FOCUSED',
                'NULL_POINTER':    'SYSTEM REWRITE INITIATED',
                'THE COMPILER':    'BUILD PIPELINE CORRUPTED',
                'HIVE PROTOCOL':   'SWARM INDEX MAXIMIZED',
                'TESSERACT PRIME': 'DIMENSION UNSEALED',
            },
            3: {
                'THE PANOPTICON':  'BLIND PROTOCOL — SIGHT FAILING',
                'NULL_POINTER':    'REALITY SHATTER — MODULES MUTED',
                'THE COMPILER':    'STRUCTURAL COLLAPSE',
                'HIVE PROTOCOL':   'ASSIMILATION PROTOCOL',
                'TESSERACT PRIME': 'REALITY SPLIT',
            }
        };
        const lines = PHASE_LINES[phase] || PHASE_LINES[2];
        const subtitle = lines[enemy.name] || (phase === 3 ? 'FINAL PHASE ENGAGED' : 'CORRUPTION PROTOCOL ENGAGED');
        // Apply phase-specific boss mechanics before the cinematic so the
        // player sees the change coming in-world (e.g. muted relics).
        this._applyBossPhaseMechanic(enemy, phase);
        this.haptic('boss');
        AudioMgr.playSound('explosion');
        if (ParticleSys.createShockwave) {
            ParticleSys.createShockwave(enemy.x, enemy.y, '#ff0055');
        }
        this.triggerPhaseGlitch();
        // Cinematic: zoom in on the boss during the phase change.
        this.triggerBossZoom && this.triggerBossZoom();
        // Hit-stop + slow-mo so the moment lands with weight.
        this.hitStop && this.hitStop(180);
        this.triggerSlowMo && this.triggerSlowMo(0.35, 0.9);
        // Screen flash in the boss color
        const flashColor = (enemy.bossData && enemy.bossData.color) || '#ff0055';
        const hx = flashColor.replace('#','');
        const rv = parseInt(hx.slice(0,2), 16), gv = parseInt(hx.slice(2,4), 16), bv = parseInt(hx.slice(4,6), 16);
        this.triggerScreenFlash && this.triggerScreenFlash(`rgba(${rv},${gv},${bv},0.45)`, 380);
        await this.showPhaseBanner(enemy.name, subtitle, 'boss');
    },

    // Pre-combat Intel crawl. A short dossier line slides down from the
    // top over a scan-line strip, lingers, then retreats. Replaces the old
    // bordered "encounter" card — less intrusive, more cinematic.
    _showCombatBriefing(enemy) {
        if (!enemy) return;
        const line = this._getIntelLine(enemy);

        let host = document.getElementById('combat-briefing');
        if (!host) {
            host = document.createElement('div');
            host.id = 'combat-briefing';
            host.className = 'intel-crawl hidden';
            const container = document.getElementById('game-container') || document.body;
            container.appendChild(host);
        } else {
            host.className = 'intel-crawl hidden';
        }
        host.innerHTML = `
            <div class="intel-crawl-scanlines" aria-hidden="true"></div>
            <div class="intel-crawl-label">// INTEL</div>
            <div class="intel-crawl-line">${line}</div>
        `;
        host.classList.remove('hidden');
        requestAnimationFrame(() => host.classList.add('active'));
        if (enemy.isBoss) {
            try { AudioMgr.playSound('siren'); } catch (e) {}
        } else if (enemy.isElite) {
            try { AudioMgr.playSound('hex_barrier'); } catch (e) {}
        } else {
            try { AudioMgr.playSound('click'); } catch (e) {}
        }
        // Longer dwell because the copy is now fully on-screen (no card
        // to read around). Slow fade-out at the end matches the slide-in.
        setTimeout(() => {
            host.classList.remove('active');
            setTimeout(() => host.classList.add('hidden'), 500);
        }, 2400);
    },

    // Map an enemy to a one-line Intel dossier. Prefers a name-specific
    // description, falls back to the enemy `kind` tag, then to a generic
    // sector line. Bosses get their own bespoke lines.
    _getIntelLine(enemy) {
        const name = enemy.name || 'Hostile';
        if (enemy.isBoss) {
            const BOSS = {
                'THE PANOPTICON':  'The All-Seeing Eye. Marks your dice, punishes crits.',
                'NULL_POINTER':    'Consuming Void. Collapses your options.',
                'THE COMPILER':    'Industrial crusher. Heavy armor, heavier fists.',
                'HIVE PROTOCOL':   'Distributed lethality. Kill the nodes first.',
                'TESSERACT PRIME': 'Geometric impossibility. Attacks bend reality.'
            };
            return `${name}: ${BOSS[name] || 'elite threat detected.'}`;
        }
        const BY_NAME = {
            'Sentry Drone':     'baseline corporate patrol. Predictable.',
            'Heavy Loader':     'slow frame, heavy hits.',
            'Cyber Arachnid':   'skittering assassin. Fragile but fast.',
            'Riot Suppressor':  'sweeping AoE crowd-control.',
            'Drone Swarmling':  'summons reinforcements on sight.',
            'Mirror':           'has the power to reflect attacks.',
            'Watcher Pod':      'tags a die and exposes your plan.',
            'Paper Pusher':     'calls in backup every few turns.',
            'Signal Jammer':    'reflects a portion of your output.',
            'Cryo Bot':         'chill package — slows your tempo.',
            'Data Leech':       'drains resources over time.',
            'Firewall Sentinel':'hard shield, punishes direct attacks.',
            'Cryo Cultivator':  'frost field. Keep moving.',
            'Data Mite':        'burrows, resurges from elsewhere.',
            'Echo':             'splits into weaker clones.',
            'Cargo Hauler':     'heavy armor. Crack the plating.',
            'Icicle Sniper':    'long-range frost bolt.',
            'Freezer Drone':    'applies chill on hit.',
            'Magma Construct':  'massive HP pool. Chip it down.',
            'Core Guardian':    'retaliation specialist.',
            'Nullifier':        'shuts down abilities.',
            'Foundry Golem':    'industrial armor — expect to dig.',
            'Slag Geyser':      'self-immolates for an AoE burn.',
            'Coolant Tech':     'heals allies every turn.',
            'Forge Welder':     'detonates on death.',
            'Slag Mech':        'cleaves across the whole line.',
            'Ember Swarm':      'low HP each — but there are many.',
            'Praetorian':       'imperial guard. Shield-disciplined.',
            'Sentinel Orb':     'high burst damage in bursts.',
            'Phase Stalker':    'phases — half your hits miss.',
            'Hive Warden':      'shields its allies.',
            'Phage Pod':        'detonates, damaging nearby enemies AND you.',
            'Keeper':           'buffs nearby hostiles.',
            'Hive Conduit':     'amplifies the rest of the hive.',
            'Parasite Carrier': 'explosive on death.',
            'Queen Node':       'restores the hive every turn.',
            'Code Fragment':    'unstable syntax. Expect glitches.',
            'Fatal Error':      'critical signal. Lands HARD.',
            'Null Pointer':     'dereferences to nowhere — unpredictable.',
            'Null Priest':      'breaks shields on contact.',
            'Entropy':          'actions scramble randomly.',
            'Silent Observer':  'watches your dice. Punishes patterns.',
            'Glitch Shard':     'creates a duplicate on hit.',
            'Echo Phantom':     'mirrors damage back onto you.',
            'Paradox Loop':     'dies, returns for one final attack.'
        };
        const byName = BY_NAME[name];
        if (byName) return `${name}: ${byName}`;

        const BY_KIND = {
            mirror:       'reflects your attacks back at you.',
            swarm:        'summons reinforcements.',
            aoe_sweep:    'sweeping AoE — hits the whole line.',
            frost:        'applies chill on contact.',
            burrow:       'burrows and resurges.',
            clone:        'splits into copies.',
            armored:      'heavy armor plating.',
            immolate:     'self-destructs for AoE damage.',
            healer:       'heals allies each turn.',
            shielder:     'shields nearby allies.',
            detonator:    'explodes on death.',
            buffer:       'amplifies nearby hostiles.',
            shield_break: 'strips shields on hit.',
            chaotic:      'random actions — never predictable.',
            observer:     'tags a die, exposes your plan.'
        };
        const byKind = enemy.kind && BY_KIND[enemy.kind];
        if (byKind) return `${name}: ${byKind}`;

        const AFFIX = Array.isArray(enemy.affixes) ? enemy.affixes : [];
        if (AFFIX.length) return `${name}: elite intercept · ${AFFIX.join(' · ').toLowerCase()}.`;
        return `${name}: hostile contact.`;
    },

    // Capture the canvas to a data URL — used by dissolve screenshots so the
    // reward screen can echo the death moment as a backdrop. Downscales to
    // keep localStorage usage under ~60KB per snapshot (5 sectors × 60KB =
    // ~300KB worst case, safely below iOS Safari's 5MB cap).
    _snapshotCanvas() {
        try {
            const cv = this.canvas || document.getElementById('gameCanvas');
            if (!cv || !cv.toDataURL) return null;
            // Downscale to a 480px-wide offscreen canvas preserving aspect.
            // cv.width is the device-pixel backbuffer (logical × renderScale)
            // — we downsample from that for a crisp trophy image.
            const targetW = 480;
            const targetH = Math.round(cv.height * (targetW / cv.width));
            const off = document.createElement('canvas');
            off.width = targetW; off.height = targetH;
            const octx = off.getContext('2d');
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = 'high';
            octx.drawImage(cv, 0, 0, targetW, targetH);
            return off.toDataURL('image/jpeg', 0.55);
        } catch (e) { return null; }
    },

    // Stash the peak-dissolve screenshot. Session copy drives the reward
    // screen backdrop; persistent copy (localStorage) feeds the Sanctuary's
    // trophy wall across runs. Keyed by sector.
    _saveDissolveSnapshot(sector) {
        const url = this._snapshotCanvas();
        if (!url) return;
        try {
            sessionStorage.setItem(`mvm_dissolve_snap_s${sector}`, url);
            // Persistent copy — only overwritten by the *next* kill of that
            // sector's boss so each sector's trophy is the most recent victory.
            localStorage.setItem(`mvm_trophy_s${sector}`, url);
            this._lastDissolveSnap = { sector, url };
        } catch (e) { /* storage quota — drop silently */ }
    },

    // Read all persisted trophies (sector → dataURL), skipping missing.
    _readTrophyWall() {
        const out = {};
        for (let s = 1; s <= 5; s++) {
            try {
                const v = localStorage.getItem(`mvm_trophy_s${s}`);
                if (v) out[s] = v;
            } catch (e) { /* ignore */ }
        }
        return out;
    },

    // Per-boss death dissolve (#2). Each boss fades out with a thematic
    // effect that sells the zone's identity beyond a generic particle spray.
    async _runBossDeathDissolve(boss) {
        const ctx = this.ctx;
        const name = boss && boss.name;
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        // Universal hit-stop + zoom to mark the kill.
        this.triggerBossZoom && this.triggerBossZoom();
        this.hitStop && this.hitStop(160);
        this.triggerSlowMo && this.triggerSlowMo(0.3, 0.8);

        if (name === 'THE PANOPTICON') {
            // Eye closes, surveillance cameras go dark in sequence.
            for (let i = 0; i < 4; i++) {
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(0, 220, 255, 0.35)', 120);
                ParticleSys.createShockwave(boss.x, boss.y, '#00f3ff', 36);
                await sleep(180);
            }
            // Snapshot at the peak moment (just before the final black blink)
            // so the reward-screen backdrop shows the eye mid-close.
            this._saveDissolveSnapshot(this.sector);
            // Final blink
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(0, 0, 0, 0.95)', 260);
            ParticleSys.createExplosion(boss.x, boss.y, 80, '#00ffff');
            AudioMgr.playSound('grid_fracture');
            await sleep(420);
            return;
        }

        if (name === 'NULL_POINTER') {
            // Void vortex collapses inward — pull all particles to center
            // then a single magenta implosion.
            for (let i = 0; i < 12; i++) {
                const a = (Math.PI * 2 / 12) * i;
                const r = 300;
                ParticleSys.createTrail(
                    boss.x + Math.cos(a) * r,
                    boss.y + Math.sin(a) * r,
                    '#ff00ff', 0.6
                );
            }
            await sleep(300);
            this._saveDissolveSnapshot(this.sector);
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 0, 255, 0.5)', 280);
            ParticleSys.createShockwave(boss.x, boss.y, '#ff00ff', 60);
            ParticleSys.createExplosion(boss.x, boss.y, 120, '#ff00ff');
            AudioMgr.playSound('explosion');
            await sleep(420);
            return;
        }

        if (name === 'THE COMPILER') {
            // Armor shatters — burst of orange shrapnel in 3 waves.
            for (let i = 0; i < 3; i++) {
                ParticleSys.createShockwave(boss.x, boss.y, '#ff4500', 48 + i * 12);
                ParticleSys.createExplosion(boss.x + (Math.random() - 0.5) * 80, boss.y + (Math.random() - 0.5) * 80, 40, '#ffaa00');
                AudioMgr.playSound('explosion');
                this.shake && this.shake(10 + i * 4);
                await sleep(220);
            }
            this._saveDissolveSnapshot(this.sector);
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 100, 0, 0.55)', 320);
            await sleep(260);
            return;
        }

        if (name === 'HIVE PROTOCOL') {
            // Drone swarm disperses — fan outward then collapse.
            const swarmCount = 24;
            for (let i = 0; i < swarmCount; i++) {
                const a = (Math.PI * 2 / swarmCount) * i;
                const dist = 200 + (i % 4) * 30;
                ParticleSys.createTrail(
                    boss.x + Math.cos(a) * dist,
                    boss.y + Math.sin(a) * dist,
                    '#7fff00', 0.9
                );
            }
            await sleep(350);
            this._saveDissolveSnapshot(this.sector);
            ParticleSys.createShockwave(boss.x, boss.y, '#32cd32', 50);
            ParticleSys.createExplosion(boss.x, boss.y, 60, '#7fff00');
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(127, 255, 0, 0.4)', 260);
            AudioMgr.playSound('grid_fracture');
            await sleep(400);
            return;
        }

        if (name === 'TESSERACT PRIME') {
            // Reality folds to a point — staggered prismatic flashes
            // followed by a single white collapse.
            const colors = ['#ff3355', '#bc13fe', '#00f3ff', '#ffd76a'];
            for (let i = 0; i < colors.length; i++) {
                this.triggerScreenFlash && this.triggerScreenFlash(colors[i] + '88', 180);
                ParticleSys.createShockwave(boss.x, boss.y, colors[i], 36);
                await sleep(160);
            }
            this._saveDissolveSnapshot(this.sector);
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 255, 255, 0.85)', 380);
            ParticleSys.createExplosion(boss.x, boss.y, 120, '#ffffff');
            this.shake && this.shake(28);
            AudioMgr.playSound('explosion');
            await sleep(500);
            return;
        }

        // Fallback — generic explosion burst.
        ParticleSys.createShockwave(boss.x, boss.y, '#ffd700', 48);
        ParticleSys.createExplosion(boss.x, boss.y, 80, '#ffd700');
        await sleep(400);
    },

    // Per-boss phase mechanics (§5.3.1). Keeps the cinematic flow in
    // triggerBossPhaseTransition clean by delegating gameplay changes here.
    _applyBossPhaseMechanic(enemy, phase) {
        if (!enemy || !enemy.bossData) return;
        const name = enemy.name;

        if (name === 'THE PANOPTICON') {
            if (phase === 2) {
                // Eye-lock: player takes +100% damage from this boss for 3 turns
                // unless a player minion is alive to break line-of-sight.
                enemy.eyeLockTurns = 999;
                // Telegraph: cyan flash on eye-lock attacks so players learn
                // "cyan = focused gaze".
                enemy.phaseTelegraphColor = '#00f3ff';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(0, 243, 255, 0.32)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#00f3ff', 40);
            } else if (phase === 3) {
                enemy.blindProtocol = true;
                enemy.eyeLockTurns = 0;
                // Phase 3 switches to white — eye closes, both sides blind.
                enemy.phaseTelegraphColor = '#eaffff';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(234, 255, 255, 0.35)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#eaffff', 42);
            }
        }
        else if (name === 'NULL_POINTER') {
            if (phase === 2) {
                enemy.voidCrushTriggered = true;
                enemy.voidCrushTurns = enemy.voidCrushTurns || 5;
                // Magenta telegraph — matches the vortex aesthetic; all void
                // crush charging visuals tint the screen this color.
                enemy.phaseTelegraphColor = '#ff00ff';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 0, 255, 0.32)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#ff00ff', 42);
            } else if (phase === 3) {
                enemy.realityShatterActive = true;
                // Phase 3 shifts to deep purple — relics "muting".
                enemy.phaseTelegraphColor = '#bc13fe';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(188, 19, 254, 0.35)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#bc13fe', 44);
            }
        }
        else if (name === 'THE COMPILER') {
            if (phase === 2) {
                if (enemy.bossData.actionsPerTurn < 3) enemy.bossData.actionsPerTurn++;
                // Orange telegraph — molten overclock.
                enemy.phaseTelegraphColor = '#ff4500';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 69, 0, 0.32)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#ff4500', 42);
            } else if (phase === 3) {
                enemy.armorProjectileMode = true;
                // Brighter heat — shrapnel mode.
                enemy.phaseTelegraphColor = '#ffaa00';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 170, 0, 0.35)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#ffaa00', 44);
            }
        }
        else if (name === 'HIVE PROTOCOL') {
            if (phase === 2) {
                // Lime telegraph — hive swarm expansion.
                enemy.phaseTelegraphColor = '#7fff00';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(127, 255, 0, 0.32)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#7fff00', 42);
                // Shared HP mode — spawn 2 extra drone minions that absorb damage.
                if (enemy.minions && enemy.minions.length < 4) {
                    try {
                        const Minion = Game._MinionClass || null;
                        if (Minion) {
                            for (let i = 0; i < 2; i++) {
                                const m = new Minion(enemy.x + (i === 0 ? -160 : 160), enemy.y, enemy.minions.length + 1, false, 2);
                                m.name = 'Hive Drone';
                                m.maxHp = 60; m.currentHp = 60; m.dmg = 6;
                                enemy.minions.push(m);
                            }
                        }
                    } catch (e) { /* swallow */ }
                }
            } else if (phase === 3) {
                // Assimilate — 20% chance each turn to convert a player minion.
                enemy.assimilateActive = true;
                // Deeper green — conversion protocol.
                enemy.phaseTelegraphColor = '#32cd32';
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(50, 205, 50, 0.35)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, '#32cd32', 44);
            }
        }
        else if (name === 'TESSERACT PRIME') {
            // Tesseract's phases get color-telegraphed using the same palette
            // the boss's death dissolve uses. By the time the player sees
            // the death sequence they'll have learned:
            //    red     = phase-2 4D attacks (random direction)
            //    purple  = phase-3 reality split (double-hit)
            //    cyan    = armor / shield beat
            //    gold    = pure damage ultimate
            // The colors are surfaced as screen-flashes on every move in each
            // phase so the cue becomes muscle memory.
            const telegraphPhase2 = '#ff3355';
            const telegraphPhase3 = '#bc13fe';
            if (phase === 2) {
                enemy.dimensionActive = true;
                enemy.phaseTelegraphColor = telegraphPhase2;
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 51, 85, 0.35)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, telegraphPhase2, 40);
            } else if (phase === 3) {
                enemy.realitySplit = true;
                enemy.phaseTelegraphColor = telegraphPhase3;
                if (enemy.bossData.actionsPerTurn < 4) enemy.bossData.actionsPerTurn++;
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(188, 19, 254, 0.35)', 400);
                ParticleSys.createShockwave(enemy.x, enemy.y, telegraphPhase3, 48);
            }
        }
    },

    // Cinematic pan during long charging attacks (e.g., NULL Pointer's Void
    // Crush). Uses CSS on the canvas so it doesn't interfere with gameplay.
    triggerSlowPan(durationMs = 2000) {
        const cv = document.getElementById('gameCanvas');
        if (!cv) return;
        cv.classList.remove('cinematic-pan');
        void cv.offsetWidth;
        cv.classList.add('cinematic-pan');
        setTimeout(() => cv.classList.remove('cinematic-pan'), durationMs);
    },

    // Sector transition — brief full-screen "collapse" overlay before the
    // map re-renders with the new sector's backdrop.
    triggerSectorCollapse() {
        let host = document.getElementById('sector-collapse-overlay');
        if (!host) {
            host = document.createElement('div');
            host.id = 'sector-collapse-overlay';
            host.className = 'sector-collapse';
            document.body.appendChild(host);
        }
        host.classList.remove('active');
        void host.offsetWidth;
        host.classList.add('active');
        setTimeout(() => host.classList.remove('active'), 1400);
    },

triggerSystemCrash() {
        return new Promise(resolve => {
            // 1. Audio and Freeze — soft fade so the crash lands with weight.
            AudioMgr.fadeMusicOut(350);
            AudioMgr.playSound('grid_fracture');
            
            let glitchCount = 0;
            const maxGlitches = 20;
            
            const interval = setInterval(() => {
                glitchCount++;
                
                // Random Screen Displacement
                const canvas = this.canvas;
                const x = (Math.random() - 0.5) * 50;
                const y = (Math.random() - 0.5) * 50;
                canvas.style.transform = `translate(${x}px, ${y}px) scale(${1 + Math.random()*0.1})`;
                
                // Color Flash
                if (glitchCount % 2 === 0) {
                    canvas.style.filter = "invert(1) hue-rotate(90deg)";
                } else {
                    canvas.style.filter = "none";
                }
                
                // Random Static Noise Sound
                if (glitchCount % 4 === 0) AudioMgr.createNoise(0.1, 0.5);

                if (glitchCount >= maxGlitches) {
                    clearInterval(interval);
                    canvas.style.transform = "none";
                    canvas.style.filter = "none";
                    resolve();
                }
            }, 100); // Fast glitches
        });
    },

// --- STORY & TUTORIAL HELPERS ---

    // NOTE: `checkFirstTime` removed — first-run debriefing popups interrupted game flow.
    // Context is now conveyed via the interactive tutorial (first run) and the
    // `showHintOnce` toast banners (subsequent runs).

    // Build a clear, hover-friendly description of what a single enemy intent will do.
    // Used by the canvas-hover tooltip for the intent badges floating above enemies.
    describeIntent(intent, enemy, index, total) {
        if (!intent) return '';
        const val = (intent.effectiveVal !== undefined) ? intent.effectiveVal : intent.val;
        const name = enemy ? enemy.name : 'Enemy';
        const indexLine = (total > 1) ? `<strong>${name} — Action ${index} of ${total}</strong>` : `<strong>${name}'s next move</strong>`;
        let label = intent.type.toUpperCase();
        let body  = '';


        switch (intent.type) {
            case 'attack':
                label = `${ICONS.intentAttack} ATTACK`;
                body  = `Strikes for <strong>${val} damage</strong>.`;
                break;
            case 'multi_attack': {
                const hits = intent.hits || 1;
                label = `${ICONS.intentMultiAttack} MULTI-STRIKE`;
                body  = `Hits <strong>${hits} times</strong> for <strong>${val} damage each</strong> (up to <strong>${val * hits}</strong> total).`;
                break;
            }
            case 'purge_attack':
                label = `${ICONS.intentPurge} THE PURGE`;
                body  = `Devastating single hit — <strong>${val} damage</strong>. Block it.`;
                break;
            case 'shield':
                label = `${ICONS.intentShield} BARRIER`;
                body  = `Gains <strong>${val || 0} Shield</strong>.`;
                break;
            case 'buff':
                label = `${ICONS.intentBuff} FORTIFY`;
                body  = `Gains 20 Shield. All allied minions gain 10 Shield.`;
                break;
            case 'debuff':
                label = `${ICONS.intentDebuff} VIRUS`;
                body  = (val > 0)
                    ? `Hits for <strong>${val} damage</strong> AND inflicts <strong>WEAK (2 turns)</strong> — your damage halved.`
                    : `Inflicts <strong>WEAK (2 turns)</strong> — your damage halved.`;
                break;
            case 'heal':
                label = `${ICONS.intentHeal} REPAIR`;
                body  = `Restores <strong>${val} HP</strong>.`;
                break;
            case 'consume':
                label = `${ICONS.intentConsume} CONSUME`;
                body  = `Devours one of your minions if available, healing <strong>30% of max HP</strong>. If no minions, attacks instead.`;
                break;
            case 'summon':
                label = `${ICONS.intentSummon} SUMMON`;
                body  = `Calls in a basic minion to fight alongside it.`;
                break;
            case 'summon_glitch':
                label = `${ICONS.intentGlitch} GLITCH SUMMON`;
                body  = `Summons a Glitch minion (100 HP, +10% damage per turn it survives).`;
                break;
            case 'summon_void':
                label = `${ICONS.intentSummon} VOID SPAWN`;
                body  = `Summons a Void Spawn. If you have minions, it consumes one and heals the boss for the minion's HP. Otherwise it attacks you and drains 1 Mana.`;
                break;
            case 'dispel':
                label = `${ICONS.intentDispel} CLEANSE`;
                body  = `Removes ALL status effects from itself (poison, weak, frail, etc).`;
                break;
            case 'charge':
                label = `${ICONS.intentCharge} CHARGING`;
                body  = `Powering up a devastating attack next turn. Build defences.`;
                break;
            case 'reality_overwrite':
                label = `${ICONS.intentReality} REALITY SHIFT`;
                body  = `Inverts the battlefield. Boss-only mechanic — controls behave erratically.`;
                break;
            case 'aoe_sweep':
                label = `${ICONS.intentMultiAttack} SWEEP`;
                body  = `Wide arc — strikes you AND every minion for <strong>${val} damage each</strong>. Spread or shield your allies.`;
                break;
            case 'mirror_attack':
                label = `${ICONS.intentAttack} MIRROR STRIKE`;
                body  = `Reflects your last damage die back at you for <strong>${val} damage</strong>.`;
                break;
            case 'frost_aoe':
                label = `${ICONS.intentMultiAttack} FROST WAVE`;
                body  = `Freezing AoE — hits everyone for <strong>${val} damage</strong> and applies <strong>WEAK</strong> (your damage halved).`;
                break;
            case 'immolate':
                label = `${ICONS.intentMultiAttack} IMMOLATE`;
                body  = `Self-destructs in flames for <strong>${val} AoE damage</strong>. Telegraphed the previous turn — block hard.`;
                break;
            case 'charging_immolate':
                label = `${ICONS.intentCharge} CHARGING IMMOLATE`;
                body  = `Building heat. Next turn detonates as a massive AoE. Push damage now or brace for it.`;
                break;
            case 'burrow_idle':
                label = `${ICONS.intentBuff} BURROWED`;
                body  = `Underground and untargetable. Will resurface with a heavy strike soon.`;
                break;
            case 'burrow_resurge':
                label = `${ICONS.intentAttack} RESURGE`;
                body  = `Erupts from below for <strong>${val} damage</strong>.`;
                break;
            case 'observer_wait':
                label = `${ICONS.intentBuff} OBSERVING`;
                body  = `Studying you. Builds power for a heavy strike on its next turn.`;
                break;
            case 'observer_strike':
                label = `${ICONS.intentAttack} CALCULATED STRIKE`;
                body  = `Unleashes a focused hit for <strong>${val} damage</strong>.`;
                break;
            case 'chaotic_act':
                label = `${ICONS.intentAttack} CHAOTIC ACT`;
                body  = `Unpredictable. Resolves into one of several possible attacks for <strong>${val} damage</strong>.`;
                break;
            case 'heal_ally':
                label = `${ICONS.intentHeal} MEND ALLY`;
                body  = `Heals an allied minion for <strong>${val} HP</strong>.`;
                break;
            case 'shield_ally':
                label = `${ICONS.intentShield} SHIELD ALLY`;
                body  = `Grants <strong>${val} Shield</strong> to an allied minion.`;
                break;
            case 'buff_allies':
                label = `${ICONS.intentBuff} EMPOWER ALLIES`;
                body  = `Boosts every allied minion's damage by <strong>+${val}</strong>.`;
                break;
            case 'shield_strip_attack':
                label = `${ICONS.intentAttack} STRIP STRIKE`;
                body  = `Strikes for <strong>${val} damage</strong> and removes any Shield you have first.`;
                break;
            default:
                label = intent.type.toUpperCase();
                body  = (val > 0) ? `Affects target for <strong>${val}</strong>.` : '(No detailed description.)';
        }

        // Secondary effect chained onto an attack (e.g. attack + bleed).
        let secondaryLine = '';
        if (intent.secondary) {
            const secName = intent.secondary.id ? intent.secondary.id.toUpperCase() : (intent.secondary.type || 'EFFECT').toUpperCase();
            secondaryLine = `\n<em>+ Also applies ${secName}.</em>`;
        }

        // Honest flag for randomized boss intents (e.g. NULL_POINTER picks a random target).
        let randomLine = '';
        if (intent.random || (enemy && enemy.name === 'NULL_POINTER' && intent.type === 'attack')) {
            randomLine = `\n<span style="color:#bc13fe;">⚡ Random target — picks a different unit each time.</span>`;
        }
        if (enemy && enemy.realityOverwritten) {
            randomLine += `\n<span style="color:#ff00ff;">⚠ Reality Shift active: this attack may behave unpredictably.</span>`;
        }
        if (enemy && enemy.glitchMod && enemy.glitchMod.id === 'unstable') {
            randomLine += `\n<span style="color:#ff00ff;">⚡ Glitch Modifier: damage values may roll randomly.</span>`;
        }

        // Modifier transparency: show how the displayed value differs from the base.
        let modLine = '';
        if (val !== intent.val && intent.val !== undefined && val !== undefined) {
            const sign = val < intent.val ? '-' : '+';
            const delta = Math.abs(val - intent.val);
            const reasons = [];
            if (enemy && enemy.hasEffect && enemy.hasEffect('weak')) reasons.push('WEAK (−50%)');
            if (enemy && enemy.hasEffect && enemy.hasEffect('constrict')) reasons.push('CONSTRICT');
            if (this.player && this.player.hasEffect && this.player.hasEffect('vulnerable')) reasons.push('VULNERABLE (+1)');
            if (this.player && this.player.hasEffect && this.player.hasEffect('frail')) reasons.push('FRAIL (+30%)');
            const why = reasons.length ? ` — ${reasons.join(', ')}` : '';
            modLine = `\n<small style="color:#888;">(Base ${intent.val}, modified ${sign}${delta}${why})</small>`;
        }

        return `${indexLine}\n<span style="color:var(--neon-blue); font-weight:bold;">${label}</span>\n${body}${secondaryLine}${randomLine}${modLine}`;
    },

    describeEffect(eff, entity) {
        if (!eff) return '';
        const displayName = eff.name || (eff.id ? eff.id.toUpperCase() : 'EFFECT');
        const header = `<strong>${eff.icon || ''} ${displayName}</strong>`;
        const turnsLine = `<span style="color:#888;">${eff.duration} turn${eff.duration === 1 ? '' : 's'} remaining</span>`;

        let body = '';
        switch (eff.id) {
            case 'weak':
                body = `Outgoing damage reduced to <strong>50%</strong>.`;
                break;
            case 'frail':
                body = `Incoming damage increased by <strong>30%</strong>.`;
                break;
            case 'vulnerable':
                body = `Takes <strong>+1 damage</strong> from every source.`;
                break;
            case 'overcharge':
                body = (eff.val > 0)
                    ? `Takes <strong>2× damage</strong> and deals <strong>+25% damage</strong>.`
                    : `Takes <strong>1.5× damage</strong> from all sources.`;
                break;
            case 'constrict': {
                const pct = Math.max(0, Math.round((1 - (eff.val || 0.5)) * 100));
                body = `Attack and healing reduced by <strong>${pct}%</strong>. Stacks multiplicatively on reapply.`;
                break;
            }
            case 'voodoo':
                body = `When the timer hits 0, detonates for <strong>${eff.val || 150}+ damage</strong> (50% chance to crit for <strong>500</strong>).`;
                break;
            case 'bleed': {
                const s = eff.stacks || 1;
                const stacksLine = s > 1 ? ` <span style="color:#ff8888;">(${s}× stacks)</span>` : '';
                body = `Takes <strong>${eff.val * s} damage</strong> at the end of each turn.${stacksLine} Stacks up to <strong>3×</strong>.`;
                break;
            }
            case 'poison': {
                const s = eff.stacks || 1;
                const stacksLine = s > 1 ? ` <span style="color:#aaff66;">(${s}× stacks)</span>` : '';
                body = `Takes <strong>${eff.val * s} poison damage</strong> at the end of each turn.${stacksLine} Stacks up to <strong>3×</strong>.`;
                break;
            }
            default:
                body = eff.desc ? eff.desc : 'No additional info.';
        }

        const ownerName = entity ? entity.name : '';
        const footer = ownerName ? `<span style="color:#888;">on ${ownerName}</span>` : '';
        return `${header}\n${turnsLine}\n${body}${footer ? '\n' + footer : ''}`;
    },

    playIntro() {
        this.changeState(STATE.STORY);
        const content = document.getElementById('story-content');
        const btn = document.getElementById('btn-finish-story');

        // Clear legacy text-crawl layout and reset inline styles so the storyboard renders cleanly.
        content.classList.remove('story-crawl', 'stagger-in');
        content.classList.add('story-board');
        content.style.animation = '';
        content.style.transform = '';
        content.style.opacity = '1';
        content.style.visibility = 'visible';

        // Six-scene storyboard (Phase 2) — richer procedural illustrations. No external assets.
        const starfield = (seed) => {
            // Procedural star dots scattered across the scene's sky area.
            let out = '';
            let s = seed;
            const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
            for (let i = 0; i < 40; i++) {
                const x = rand() * 400;
                const y = rand() * 180;
                const r = 0.4 + rand() * 1.2;
                const o = 0.2 + rand() * 0.8;
                out += `<circle class="sb-star" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#cfe8ff" opacity="${o.toFixed(2)}" style="animation-delay:${(rand() * 3).toFixed(2)}s"/>`;
            }
            return out;
        };

        const scenes = [
            // ---------- Scene 1: THE WORLD ENDED IN A FORMATTING ERROR ----------
            {
                line: "THE WORLD ENDED IN A FORMATTING ERROR.",
                art: `
                    <svg class="sb-art" viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <radialGradient id="earthCore" cx="45%" cy="45%" r="60%">
                          <stop offset="0%"  stop-color="#4fd6ff" stop-opacity="0.9"/>
                          <stop offset="35%" stop-color="#0077aa" stop-opacity="0.6"/>
                          <stop offset="100%" stop-color="#0b0b20" stop-opacity="0"/>
                        </radialGradient>
                        <radialGradient id="earthAtmos" cx="50%" cy="50%" r="50%">
                          <stop offset="78%" stop-color="transparent"/>
                          <stop offset="90%" stop-color="#00f3ff" stop-opacity="0.35"/>
                          <stop offset="100%" stop-color="#00f3ff" stop-opacity="0"/>
                        </radialGradient>
                        <filter id="sbGlow1"><feGaussianBlur stdDeviation="2"/></filter>
                      </defs>
                      <g class="sb-starfield">${starfield(42)}</g>
                      <circle class="sb-earth-atmos" cx="200" cy="130" r="95" fill="url(#earthAtmos)"/>
                      <circle class="sb-earth-glow"  cx="200" cy="130" r="80" fill="url(#earthCore)"/>
                      <g class="sb-earth-shell" stroke="#00f3ff" stroke-width="1" fill="none" opacity="0.75">
                        <circle cx="200" cy="130" r="75"/>
                        <ellipse cx="200" cy="130" rx="75" ry="14"/>
                        <ellipse cx="200" cy="130" rx="75" ry="30"/>
                        <ellipse cx="200" cy="130" rx="75" ry="50"/>
                        <ellipse cx="200" cy="130" rx="75" ry="68"/>
                        <ellipse cx="200" cy="130" rx="14" ry="75"/>
                        <ellipse cx="200" cy="130" rx="32" ry="75"/>
                        <ellipse cx="200" cy="130" rx="50" ry="75"/>
                      </g>
                      <g class="sb-earth-continents" fill="#00f3ff" opacity="0.55">
                        <path d="M160 100 Q175 92 188 100 Q194 108 186 118 Q170 116 160 108 Z"/>
                        <path d="M205 115 Q225 108 242 118 Q238 135 222 138 Q208 130 205 115 Z"/>
                        <path d="M170 145 Q186 140 200 146 Q204 158 188 164 Q175 158 170 145 Z"/>
                      </g>
                      <g class="sb-fracture" stroke="#ff0055" stroke-width="2.4" fill="none" stroke-linecap="round" filter="url(#sbGlow1)">
                        <path d="M200 62 L 188 88 L 210 108 L 195 130 L 215 148 L 200 168 L 215 188 L 200 200"/>
                        <path d="M128 130 L 156 124 L 172 136 L 196 130 L 220 138 L 244 132 L 272 130"/>
                        <path d="M148 80 L 168 98 L 182 92"/>
                        <path d="M228 178 L 248 164 L 266 168"/>
                      </g>
                      <g class="sb-fracture-shards" fill="#ff0055" opacity="0.95">
                        <polygon points="210,108 222,98 220,112"/>
                        <polygon points="188,88 180,74 198,80"/>
                        <polygon points="244,132 256,124 256,140"/>
                        <polygon points="215,188 224,198 208,196"/>
                      </g>
                      <g class="sb-binary" fill="#9cefff" font-family="Orbitron" font-size="9" opacity="0.75">
                        <text x="40"  y="32">1011010</text>
                        <text x="330" y="50" >0110011</text>
                        <text x="30"  y="214">0010111</text>
                        <text x="320" y="230">1101101</text>
                        <text x="56"  y="248">11100</text>
                        <text x="320" y="150">0101</text>
                      </g>
                    </svg>`
            },
            // ---------- Scene 2: THE MACHINES REWROTE EVERYTHING ----------
            {
                line: "THE MACHINES REWROTE EVERYTHING.",
                art: `
                    <svg class="sb-art" viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <linearGradient id="spireGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%"   stop-color="#3a0a6a"/>
                          <stop offset="60%"  stop-color="#1a0a3a"/>
                          <stop offset="100%" stop-color="#0a0014"/>
                        </linearGradient>
                        <radialGradient id="spireHalo" cx="50%" cy="10%" r="80%">
                          <stop offset="0%" stop-color="#bc13fe" stop-opacity="0.5"/>
                          <stop offset="100%" stop-color="transparent"/>
                        </radialGradient>
                      </defs>
                      <g class="sb-starfield">${starfield(11)}</g>
                      <rect class="sb-ground" x="0" y="240" width="400" height="20" fill="#0a0010"/>
                      <path class="sb-ground-grid" d="M0 240 L400 240 M0 248 L400 248 M0 256 L400 256" stroke="#bc13fe" stroke-width="0.5" opacity="0.25"/>

                      <ellipse cx="200" cy="35" rx="160" ry="50" fill="url(#spireHalo)"/>

                      <g class="sb-spire-rise">
                        <polygon points="140,240 170,60 230,60 260,240" fill="url(#spireGrad)" stroke="#bc13fe" stroke-width="1.6"/>
                        <!-- Floor lights -->
                        <g fill="#bc13fe" opacity="0.95">
                          <rect x="174" y="80"  width="52" height="2"/>
                          <rect x="172" y="100" width="56" height="2"/>
                          <rect x="170" y="120" width="60" height="2"/>
                          <rect x="168" y="140" width="64" height="2"/>
                          <rect x="166" y="160" width="68" height="2"/>
                          <rect x="164" y="180" width="72" height="2"/>
                          <rect x="162" y="200" width="76" height="2"/>
                          <rect x="160" y="220" width="80" height="2"/>
                        </g>
                        <polygon points="180,60 220,60 215,40 185,40" fill="#0a0014" stroke="#bc13fe" stroke-width="1.2"/>
                        <polygon points="190,40 210,40 205,22 195,22" fill="#0a0014" stroke="#bc13fe" stroke-width="1"/>
                        <rect x="197" y="10" width="6" height="14" fill="#bc13fe"/>
                        <circle cx="200" cy="8" r="3" fill="#fff" class="sb-spire-light"/>
                      </g>

                      <!-- Supporting smaller spires -->
                      <polygon class="sb-spire-side sb-spire-L" points="60,240 78,130 108,130 126,240" fill="#150a28" stroke="#7a0ec7" stroke-width="1" opacity="0.7"/>
                      <polygon class="sb-spire-side sb-spire-R" points="274,240 292,130 322,130 340,240" fill="#150a28" stroke="#7a0ec7" stroke-width="1" opacity="0.7"/>

                      <!-- Silhouettes being absorbed -->
                      <g class="sb-silhouettes" fill="#1a0a2a" stroke="#3a1a5a" stroke-width="0.8">
                        <path class="sb-shadow s1" d="M42 240 a6 10 0 0 1 12 0 V240 h-12 Z M42 240 v-24 a6 6 0 0 1 12 0 v24 Z M48 215 a4 4 0 0 1 0 -8 a4 4 0 0 1 0 8 Z"/>
                        <path class="sb-shadow s2" d="M96 240 a6 10 0 0 1 12 0 V240 h-12 Z M96 240 v-24 a6 6 0 0 1 12 0 v24 Z M102 215 a4 4 0 0 1 0 -8 a4 4 0 0 1 0 8 Z"/>
                        <path class="sb-shadow s3" d="M290 240 a6 10 0 0 1 12 0 V240 h-12 Z M290 240 v-24 a6 6 0 0 1 12 0 v24 Z M296 215 a4 4 0 0 1 0 -8 a4 4 0 0 1 0 8 Z"/>
                        <path class="sb-shadow s4" d="M344 240 a6 10 0 0 1 12 0 V240 h-12 Z M344 240 v-24 a6 6 0 0 1 12 0 v24 Z M350 215 a4 4 0 0 1 0 -8 a4 4 0 0 1 0 8 Z"/>
                      </g>
                      <g class="sb-absorbs" stroke="#bc13fe" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 4" fill="none" opacity="0.9">
                        <path class="sb-absorb l1" d="M48  218 Q 130 140 200 60"/>
                        <path class="sb-absorb l2" d="M102 218 Q 155 140 200 60"/>
                        <path class="sb-absorb l3" d="M296 218 Q 245 140 200 60"/>
                        <path class="sb-absorb l4" d="M350 218 Q 280 140 200 60"/>
                      </g>
                    </svg>`
            },
            // ---------- Scene 3: BUT ONE THING THEY COULDN'T COMPILE: MAGIC ----------
            {
                line: "BUT ONE THING THEY COULDN'T COMPILE: MAGIC.",
                art: `
                    <svg class="sb-art" viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <radialGradient id="sparkHalo">
                          <stop offset="0%"  stop-color="#ffffff"/>
                          <stop offset="25%" stop-color="#9dffd0" stop-opacity="0.9"/>
                          <stop offset="60%" stop-color="#00ff99" stop-opacity="0.35"/>
                          <stop offset="100%" stop-color="#00ff99" stop-opacity="0"/>
                        </radialGradient>
                        <filter id="sbGlow3"><feGaussianBlur stdDeviation="1.4"/></filter>
                      </defs>
                      <g class="sb-starfield">${starfield(7)}</g>
                      <circle class="sb-spark-ring outer" cx="200" cy="130" r="105" fill="none" stroke="#00ff99" stroke-width="1" opacity="0.45"/>
                      <circle class="sb-spark-ring mid"   cx="200" cy="130" r="78"  fill="none" stroke="#00ff99" stroke-width="1.2" opacity="0.65"/>
                      <circle class="sb-spark-halo" cx="200" cy="130" r="70" fill="url(#sparkHalo)"/>
                      <g class="sb-fractal" stroke="#ffffff" stroke-width="1.6" fill="none" stroke-linecap="round" filter="url(#sbGlow3)">
                        <path d="M200 130 L200 92  M200 92  L186 74  M200 92  L214 74  M186 74  L176 58  M214 74  L224 58"/>
                        <path d="M200 130 L200 168 M200 168 L186 186 M200 168 L214 186 M186 186 L176 200 M214 186 L224 200"/>
                        <path d="M200 130 L162 130 M162 130 L144 116 M162 130 L144 144 M144 116 L128 104 M144 144 L128 156"/>
                        <path d="M200 130 L238 130 M238 130 L256 116 M238 130 L256 144 M256 116 L272 104 M256 144 L272 156"/>
                        <path d="M200 130 L172 102 M200 130 L228 102 M200 130 L172 158 M200 130 L228 158"/>
                      </g>
                      <g class="sb-fractal-leaves" fill="#7dffbf" opacity="0.9">
                        <circle cx="176" cy="58"  r="2.5"/>
                        <circle cx="224" cy="58"  r="2.5"/>
                        <circle cx="176" cy="200" r="2.5"/>
                        <circle cx="224" cy="200" r="2.5"/>
                        <circle cx="128" cy="104" r="2.5"/>
                        <circle cx="128" cy="156" r="2.5"/>
                        <circle cx="272" cy="104" r="2.5"/>
                        <circle cx="272" cy="156" r="2.5"/>
                      </g>
                      <circle class="sb-spark-core" cx="200" cy="130" r="10" fill="#fff"/>
                      <circle class="sb-spark-core-inner" cx="200" cy="130" r="4" fill="#00ff99"/>
                    </svg>`
            },
            // ---------- Scene 4: YOU ARE THE LAST OPERATOR ----------
            {
                line: "YOU ARE THE LAST OPERATOR.",
                art: `
                    <svg class="sb-art" viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <linearGradient id="horizonGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stop-color="#000612"/>
                          <stop offset="100%" stop-color="#001a26"/>
                        </linearGradient>
                        <radialGradient id="pilotHalo" cx="50%" cy="35%" r="80%">
                          <stop offset="0%" stop-color="#00ff99" stop-opacity="0.25"/>
                          <stop offset="100%" stop-color="transparent"/>
                        </radialGradient>
                        <filter id="sbGlow4"><feGaussianBlur stdDeviation="1.2"/></filter>
                      </defs>
                      <rect x="0" y="0" width="400" height="180" fill="url(#horizonGrad)"/>
                      <g class="sb-starfield">${starfield(19)}</g>
                      <!-- Aurora ribbon -->
                      <path class="sb-aurora" d="M0 90 Q 100 70 200 95 T 400 80 L400 130 L0 130 Z" fill="#00ff99" opacity="0.09"/>
                      <path class="sb-aurora" d="M0 110 Q 140 90 220 115 T 400 100 L400 140 L0 140 Z" fill="#00f3ff" opacity="0.06"/>
                      <!-- Distant ruined spires -->
                      <g class="sb-distant-spires" fill="#0a0a18" stroke="#1a1a30" stroke-width="1">
                        <polygon points="30,180 40,120 60,120 70,180"/>
                        <polygon points="80,180 96,90 118,90 134,180"/>
                        <polygon points="150,180 160,140 180,140 190,180"/>
                        <polygon points="250,180 268,110 292,110 310,180"/>
                        <polygon points="330,180 350,150 380,150 400,180"/>
                      </g>
                      <rect x="0" y="180" width="400" height="80" fill="#040008"/>
                      <ellipse cx="200" cy="228" rx="120" ry="10" fill="url(#pilotHalo)"/>
                      <g class="sb-pilot" filter="url(#sbGlow4)">
                        <!-- Silhouette pilot with cape -->
                        <ellipse cx="200" cy="230" rx="55" ry="5" fill="#000" opacity="0.8"/>
                        <path d="M164 230 L160 180 Q200 170 240 180 L236 230 Z" fill="#060010" stroke="#00f3ff" stroke-width="1.2"/>
                        <!-- Cape -->
                        <path class="sb-cape" d="M160 180 Q130 160 118 230 L150 230 L164 220 Z" fill="#080018" stroke="#007aff" stroke-width="1"/>
                        <path class="sb-cape sb-cape-r" d="M240 180 Q270 160 282 230 L250 230 L236 220 Z" fill="#080018" stroke="#007aff" stroke-width="1"/>
                        <!-- Body -->
                        <path d="M176 180 Q200 168 224 180 L222 140 Q200 130 178 140 Z" fill="#0a0a1a" stroke="#00f3ff" stroke-width="1.4"/>
                        <!-- Head & helmet -->
                        <ellipse cx="200" cy="118" rx="18" ry="22" fill="#070012" stroke="#00f3ff" stroke-width="1.4"/>
                        <path d="M182 112 Q200 100 218 112 L218 126 Q200 118 182 126 Z" fill="#00f3ff" opacity="0.9"/>
                        <!-- Shoulder arms -->
                        <path d="M176 140 L156 168 L164 174 L182 150 Z" fill="#0a0a1a" stroke="#00f3ff" stroke-width="1"/>
                        <path d="M224 140 L244 168 L236 174 L218 150 Z" fill="#0a0a1a" stroke="#00f3ff" stroke-width="1"/>
                        <!-- Legs -->
                        <rect x="186" y="180" width="10" height="52" fill="#050010" stroke="#00f3ff" stroke-width="1"/>
                        <rect x="204" y="180" width="10" height="52" fill="#050010" stroke="#00f3ff" stroke-width="1"/>
                      </g>
                      <!-- Green spark cradled in hand -->
                      <g class="sb-hand-spark">
                        <circle cx="160" cy="170" r="14" fill="#00ff99" opacity="0.35"/>
                        <circle cx="160" cy="170" r="8"  fill="#7dffbf"/>
                        <circle cx="160" cy="170" r="4"  fill="#ffffff"/>
                      </g>
                      <!-- Particle rise -->
                      <g class="sb-embers" fill="#00ff99">
                        <circle class="em em1" cx="160" cy="160" r="1.2"/>
                        <circle class="em em2" cx="156" cy="140" r="1"/>
                        <circle class="em em3" cx="164" cy="150" r="0.8"/>
                        <circle class="em em4" cx="158" cy="120" r="1"/>
                      </g>
                    </svg>`
            },
            // ---------- Scene 5: FIVE SECTORS. ONE CORE. ----------
            {
                line: "FIVE SECTORS. ONE CORE.",
                art: `
                    <svg class="sb-art" viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <radialGradient id="coreGlow2">
                          <stop offset="0%"   stop-color="#ffffff"/>
                          <stop offset="40%"  stop-color="#ffd700" stop-opacity="0.9"/>
                          <stop offset="100%" stop-color="#ffd700" stop-opacity="0"/>
                        </radialGradient>
                        <linearGradient id="beam" x1="0.5" x2="0.5" y1="0" y2="1">
                          <stop offset="0%" stop-color="#ffd700" stop-opacity="0.8"/>
                          <stop offset="100%" stop-color="#ffd700" stop-opacity="0"/>
                        </linearGradient>
                      </defs>
                      <g class="sb-starfield">${starfield(5)}</g>
                      <!-- Core beam shooting down -->
                      <path class="sb-core-beam" d="M190 30 L210 30 L205 252 L195 252 Z" fill="url(#beam)" opacity="0.5"/>
                      <!-- Core crown -->
                      <circle class="sb-core-halo" cx="200" cy="30" r="32" fill="url(#coreGlow2)"/>
                      <polygon class="sb-core-star" points="200,8 206,26 224,26 210,38 216,56 200,46 184,56 190,38 176,26 194,26" fill="#ffd700" stroke="#ffffff" stroke-width="0.6"/>
                      <!-- Sector pedestals with icons -->
                      <g class="sb-sectors" font-family="Orbitron" font-size="11">
                        <g class="sb-sector s5">
                          <rect x="120" y="60"  width="160" height="30" fill="rgba(255,215,0,0.08)" stroke="#ffd700" stroke-width="1.5" rx="2"/>
                          <text x="200" y="80" fill="#ffd700" text-anchor="middle">👑 SECTOR 5 · CORE</text>
                        </g>
                        <g class="sb-sector s4">
                          <rect x="115" y="95"  width="170" height="30" fill="rgba(188,19,254,0.08)" stroke="#bc13fe" stroke-width="1.5" rx="2"/>
                          <text x="200" y="115" fill="#bc13fe" text-anchor="middle">☣ SECTOR 4 · HIVE</text>
                        </g>
                        <g class="sb-sector s3">
                          <rect x="110" y="130" width="180" height="30" fill="rgba(255,69,0,0.08)" stroke="#ff4500" stroke-width="1.5" rx="2"/>
                          <text x="200" y="150" fill="#ff4500" text-anchor="middle">⚙ SECTOR 3 · FORGE</text>
                        </g>
                        <g class="sb-sector s2">
                          <rect x="105" y="165" width="190" height="30" fill="rgba(255,255,255,0.08)" stroke="#ffffff" stroke-width="1.5" rx="2"/>
                          <text x="200" y="185" fill="#ffffff" text-anchor="middle">✧ SECTOR 2 · VOID</text>
                        </g>
                        <g class="sb-sector s1">
                          <rect x="100" y="200" width="200" height="30" fill="rgba(0,243,255,0.08)" stroke="#00f3ff" stroke-width="1.5" rx="2"/>
                          <text x="200" y="220" fill="#00f3ff" text-anchor="middle">⚔ SECTOR 1 · GATE</text>
                        </g>
                      </g>
                      <!-- Pilot marker at base -->
                      <g class="sb-pilot-marker">
                        <circle cx="200" cy="244" r="5" fill="#00ff99"/>
                        <circle cx="200" cy="244" r="10" fill="none" stroke="#00ff99" stroke-width="1.2" opacity="0.7"/>
                      </g>
                    </svg>`
            },
            // ---------- Scene 6: MAGIC v MACHINE — TITLE ----------
            {
                line: "MAGIC <span class='sb-vs'>v</span> MACHINE.<br><small class='sb-tagline'>YOUR MOVE.</small>",
                art: `
                    <svg class="sb-art sb-art-title" viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
                      <defs>
                        <linearGradient id="titleGrad" x1="0" x2="1">
                          <stop offset="0%"   stop-color="#00f3ff"/>
                          <stop offset="50%"  stop-color="#ffffff"/>
                          <stop offset="100%" stop-color="#ff0055"/>
                        </linearGradient>
                        <radialGradient id="titleBurst" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stop-color="#fff" stop-opacity="0.4"/>
                          <stop offset="60%" stop-color="#ffd700" stop-opacity="0.15"/>
                          <stop offset="100%" stop-color="transparent"/>
                        </radialGradient>
                        <filter id="sbGlow6"><feGaussianBlur stdDeviation="1.6"/></filter>
                      </defs>
                      <circle class="sb-title-burst" cx="200" cy="130" r="110" fill="url(#titleBurst)"/>
                      <g class="sb-starfield">${starfield(29)}</g>
                      <circle class="sb-title-halo h1" cx="200" cy="130" r="100" fill="none" stroke="url(#titleGrad)" stroke-width="2" opacity="0.75"/>
                      <circle class="sb-title-halo h2" cx="200" cy="130" r="78"  fill="none" stroke="url(#titleGrad)" stroke-width="1.2" opacity="0.55"/>
                      <circle class="sb-title-halo h3" cx="200" cy="130" r="56"  fill="none" stroke="url(#titleGrad)" stroke-width="1"   opacity="0.4"/>
                      <g class="sb-title-hex hex-outer" fill="none" stroke="#ffd700" stroke-width="2" filter="url(#sbGlow6)">
                        <polygon points="200,70 260,105 260,160 200,195 140,160 140,105"/>
                      </g>
                      <g class="sb-title-hex hex-mid" fill="rgba(255,215,0,0.08)" stroke="#ffd700" stroke-width="1.5">
                        <polygon points="200,90 240,112 240,150 200,172 160,150 160,112"/>
                      </g>
                      <g class="sb-title-hex hex-inner" fill="none" stroke="#ffffff" stroke-width="1">
                        <polygon points="200,108 224,122 224,144 200,158 176,144 176,122"/>
                      </g>
                      <circle class="sb-title-core" cx="200" cy="133" r="6" fill="#ffffff"/>
                      <!-- Orbital particles -->
                      <g class="sb-title-orbit">
                        <circle cx="0" cy="-100" r="3" fill="#00f3ff"/>
                        <circle cx="100" cy="0" r="3" fill="#ff0055" style="animation-delay:-2s"/>
                        <circle cx="0" cy="100" r="3" fill="#00ff99" style="animation-delay:-4s"/>
                        <circle cx="-100" cy="0" r="3" fill="#ffd700" style="animation-delay:-6s"/>
                      </g>
                    </svg>`
            }
        ];

        // Render stage + controls. (Phase 2 v2: manual advance only, dual buttons at end.)
        content.innerHTML = `
            <div class="sb-stage">
                <div class="sb-scene-wrap" id="sb-scene-wrap"></div>
                <div class="sb-progress" id="sb-progress">
                    ${scenes.map((_, i) => `<div class="sb-dot" data-i="${i}"></div>`).join('')}
                </div>
                <div class="sb-controls" id="sb-controls">
                    <button id="sb-btn-next" class="btn primary">NEXT</button>
                    <button id="sb-btn-tutorial" class="btn primary hidden">TUTORIAL</button>
                    <button id="sb-btn-begin" class="btn secondary hidden">SKIP TO GAME</button>
                </div>
            </div>`;

        // Hide the legacy bottom button — storyboard owns its own controls.
        if (btn) btn.classList.add('hidden');

        const wrap = document.getElementById('sb-scene-wrap');
        const dots = Array.from(content.querySelectorAll('.sb-dot'));
        const btnNext     = document.getElementById('sb-btn-next');
        const btnTutorial = document.getElementById('sb-btn-tutorial');
        const btnBegin    = document.getElementById('sb-btn-begin');

        let sceneIdx = 0;

        const showScene = (i) => {
            sceneIdx = i;
            dots.forEach((d, di) => d.classList.toggle('active', di <= i));
            wrap.innerHTML = `
                <div class="sb-scene">
                    ${scenes[i].art}
                    <div class="sb-line">${scenes[i].line}</div>
                </div>`;
            // On the final scene, swap NEXT for the two start buttons.
            const isLast = (i === scenes.length - 1);
            btnNext.classList.toggle('hidden', isLast);
            btnTutorial.classList.toggle('hidden', !isLast);
            btnBegin.classList.toggle('hidden', !isLast);
        };

        btnNext.onclick = () => {
            if (sceneIdx < scenes.length - 1) showScene(sceneIdx + 1);
        };

        btnTutorial.onclick = () => {
            // Keep first_run_done UNSET so the tutorial fires after character select.
            try { localStorage.removeItem('mvm_first_run_done'); } catch (e) {}
            AudioMgr.startMusic();
            this.goToCharSelect();
        };

        btnBegin.onclick = () => {
            // Mark first-run done so the tutorial is skipped on selectClass.
            try { localStorage.setItem('mvm_first_run_done', '1'); } catch (e) {}
            AudioMgr.startMusic();
            this.goToCharSelect();
        };

        showScene(0);
    },

    generateMap() {
        // Organic branching map — variable node count per level, merges + crossings,
        // occasional "shifting" nodes whose type rerolls as the run progresses.
        this.map.nodes = [];

        const LEVELS = 9; // compact, readable
        // Per-level node count: entry/exit narrow, middle wide.
        // [start=1] L1=2 L2=3 L3=3 (shop) L4=3 L5=1 (elite gate) L6=3 L7=3 (rest) L8=2 [boss=1]
        const layout = [2, 3, 3, 3, 1, 3, 3, 2];
        // Fixed "choke" levels for key node types (everyone must pass these).
        const CHOKES = { 3: 'shop', 5: 'elite', 7: 'rest' };

        // Start at the bottom — pulled inward from the edge so the node never clips the frame.
        this.map.nodes.push({ id: 'start', layer: 0, lane: 0, x: 50, y: 92, type: 'start', connections: [], status: 'completed' });

        const topY = 10;  // where the boss sits (pulled in from 8 so boss node doesn't clip)
        const bottomY = 84;
        const travelY = bottomY - topY;

        for (let l = 1; l <= LEVELS; l++) {
            const isBoss = (l === LEVELS);
            const count = isBoss ? 1 : layout[l - 1];
            const yPct = bottomY - (l / LEVELS) * travelY;

            for (let i = 0; i < count; i++) {
                // Evenly spread along X with slight jitter for organic feel.
                const slot = (count === 1) ? 0.5 : (i + 0.5) / count;
                // Add a small sinusoidal sway per level so levels don't visually align.
                const sway = Math.sin(l * 1.7 + i) * 2.2;
                const jitter = (Math.random() - 0.5) * 2.5;
                const xPct = 10 + slot * 80 + sway + jitter;

                let type = 'combat';
                let shifting = false;
                if (isBoss) {
                    type = 'boss';
                } else if (CHOKES[l]) {
                    type = CHOKES[l];
                } else {
                    // Weighted pool; never place shop/rest/elite off their choke levels.
                    const roll = Math.random();
                    if (roll < 0.50) type = 'combat';
                    else if (roll < 0.78) type = 'event';
                    else if (roll < 0.92) type = 'combat';
                    else type = 'event';

                    // 22% of events are "shifting" — their type can re-roll during play.
                    if (type === 'event' && Math.random() < 0.22) shifting = true;
                }

                this.map.nodes.push({
                    id: `${l}-${i}`,
                    layer: l,
                    lane: i,
                    x: xPct,
                    y: yPct,
                    type: type,
                    shifting: shifting,
                    connections: [],
                    status: (l === 1) ? 'available' : 'locked'
                });
            }
        }

        // Connect start → level 1
        const startNode = this.map.nodes.find(n => n.id === 'start');
        this.map.nodes.filter(n => n.layer === 1).forEach(n => startNode.connections.push(n.id));

        // Connect each level L to L+1.
        // Strategy: every L node connects to nearest-x L+1 node, plus sometimes a second one for branching.
        // Then ensure every L+1 node has at least one inbound (add extra connections if not).
        for (let l = 1; l < LEVELS; l++) {
            const curr = this.map.nodes.filter(n => n.layer === l);
            const next = this.map.nodes.filter(n => n.layer === l + 1);

            curr.forEach(c => {
                const sorted = next.slice().sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x));
                // Always connect to closest
                if (sorted[0]) c.connections.push(sorted[0].id);
                // 40% chance to also connect to second-closest → branching paths
                if (sorted[1] && Math.random() < 0.4) c.connections.push(sorted[1].id);
            });

            // Ensure coverage: every next-level node must have at least one inbound.
            next.forEach(n => {
                const hasInbound = curr.some(c => c.connections.includes(n.id));
                if (!hasInbound) {
                    const closest = curr.slice().sort((a, b) => Math.abs(a.x - n.x) - Math.abs(b.x - n.x))[0];
                    if (closest) closest.connections.push(n.id);
                }
            });
        }

        this.map.currentIdx = 'start';
    },

    // Randomization: when a shifting node is still un-visited at map re-render, roll a chance to reshuffle its type.
    shiftRandomNodes() {
        if (!this.map || !this.map.nodes) return;
        const shiftable = this.map.nodes.filter(n =>
            n.shifting && n.status !== 'completed' && n.type !== 'boss' && n.type !== 'shop' && n.type !== 'rest' && n.type !== 'elite'
        );
        shiftable.forEach(n => {
            if (Math.random() < 0.35) {
                const pool = ['combat', 'event', 'combat'];
                const newType = pool[Math.floor(Math.random() * pool.length)];
                if (newType !== n.type) {
                    n.type = newType;
                    n.justShifted = true; // flag for visual flash on next render
                }
            }
        });
    },

    renderAchievements() {
        const list = document.getElementById('achievements-list');
        const progEl = document.getElementById('achievements-progress');
        if (!list) return;
        const unlocked = new Set(Achievements.getUnlocked());
        const total = ACHIEVEMENTS.length;
        progEl.innerText = `${unlocked.size} / ${total} unlocked`;
        const byCat = {};
        ACHIEVEMENTS.forEach(a => { (byCat[a.cat] = byCat[a.cat] || []).push(a); });
        const catNames = {
            first: 'FIRST STEPS', combat: 'COMBAT MASTERY', class: 'CLASS MASTERY',
            asc: 'ASCENSION', expl: 'EXPLORATION', build: 'BUILD & RELICS',
            daily: 'RETENTION', odd: 'ODDBALL'
        };
        list.innerHTML = Object.keys(byCat).map(cat => `
            <div class="ach-category">
                <div class="ach-category-name">${catNames[cat] || cat.toUpperCase()}</div>
                <div class="ach-rows">
                    ${byCat[cat].map(a => {
                        const lit = unlocked.has(a.id);
                        return `<div class="ach-row ${lit ? 'unlocked' : 'locked'}">
                            <div class="ach-row-dot">${lit ? '◆' : '◇'}</div>
                            <div class="ach-row-body">
                                <div class="ach-row-name">${a.name}</div>
                                <div class="ach-row-desc">${lit ? a.desc : '???'}</div>
                            </div>
                            <div class="ach-row-frag">+${a.frag}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `).join('');
    },

    _renderLoginStreak() {
        const el = document.getElementById('login-streak');
        if (!el) return;
        const streak = Streak.current();
        if (streak <= 0) { el.classList.add('hidden'); return; }
        const flame = streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '·';
        const bonus = this._streakBonusPending;
        el.innerHTML = `<span class="ls-flame">${flame}</span>STREAK ${streak} ${bonus ? `· +${bonus.bonus} FRAG` : ''}`;
        el.classList.remove('hidden');
        // Clear the pending bonus chip after first show
        this._streakBonusPending = null;
    },

    // During gameplay, show a small "DAILY" chip in the top-bar so the player
    // knows their run is seeded. Placed once at startCombat.
    _ensureDailyChip() {
        if (!Dailies.isActive()) {
            const existing = document.getElementById('daily-run-chip');
            if (existing) existing.remove();
            return;
        }
        let chip = document.getElementById('daily-run-chip');
        if (!chip) {
            chip = document.createElement('div');
            chip.id = 'daily-run-chip';
            chip.className = 'daily-run-chip';
            const hud = document.getElementById('hud') || document.body;
            hud.appendChild(chip);
        }
        chip.textContent = `DAILY · ${Dailies.todayString()}`;
    },

    _refreshMenuChips() {
        // Daily Run button status
        const dailyEl = document.getElementById('daily-status');
        const dailyBtn = document.getElementById('btn-daily');
        if (dailyEl && dailyBtn) {
            if (Dailies.isDailyAvailable()) {
                dailyEl.textContent = '· READY';
                dailyBtn.style.opacity = '1';
            } else {
                dailyEl.textContent = `· NEW IN ${Dailies.formatCountdown(Dailies.msUntilReset())}`;
                dailyBtn.style.opacity = '0.6';
            }
        }
        // Login streak chip
        if (typeof this._renderLoginStreak === 'function') this._renderLoginStreak();
        // Re-tick the daily countdown each second while menu is open
        clearInterval(this._dailyCountdownTimer);
        this._dailyCountdownTimer = setInterval(() => {
            if (this.currentState !== STATE.MENU) {
                clearInterval(this._dailyCountdownTimer);
                return;
            }
            if (dailyEl && !Dailies.isDailyAvailable()) {
                dailyEl.textContent = `· NEW IN ${Dailies.formatCountdown(Dailies.msUntilReset())}`;
            }
        }, 30000);
    },

    _renderAscensionPicker() {
        const screen = document.getElementById('screen-char-select');
        if (!screen) return;
        let bar = document.getElementById('ascension-picker');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ascension-picker';
            bar.className = 'ascension-picker';
            // Insert just after the h2
            const h2 = screen.querySelector('h2');
            if (h2 && h2.nextSibling) h2.parentNode.insertBefore(bar, h2.nextSibling);
            else screen.insertBefore(bar, screen.firstChild);
        }
        const max = Ascension.getUnlocked();
        const cur = Ascension.getSelected();
        const twist = Ascension.twist(cur);
        bar.innerHTML = `
            <button class="asc-step" data-dir="-1" ${cur === 0 ? 'disabled' : ''} aria-label="Lower ascension">${ICONS.chevronDown.replace('class="game-icon"', 'class="game-icon" style="transform:rotate(90deg)"')}</button>
            <div class="asc-info">
                <div class="asc-label">ASCENSION ${cur}</div>
                <div class="asc-desc">${twist.desc}</div>
            </div>
            <button class="asc-step" data-dir="+1" ${cur >= max ? 'disabled' : ''} aria-label="Raise ascension">${ICONS.chevronDown.replace('class="game-icon"', 'class="game-icon" style="transform:rotate(-90deg)"')}</button>
        `;
        bar.querySelectorAll('.asc-step').forEach(btn => {
            btn.onclick = (e) => {
                AudioMgr.playSound('click');
                const dir = parseInt(btn.dataset.dir, 10);
                Ascension.setSelected(cur + dir);
                this._renderAscensionPicker();
            };
        });
    },

    // Crisp inline-SVG icon per node type. Uses currentColor so the CSS colour
    // rule (per `[data-type]`) cascades into the stroke/fill.
    mapNodeSvg(type) {
        const stroke = 'currentColor';
        const icons = {
            start: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 28 L8 5"/>
                <path d="M8 5 L24 7 L20 12 L24 17 L8 15 Z" fill="currentColor" fill-opacity="0.25"/>
            </svg>`,
            combat: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 7 L22 22"/><path d="M22 6 L20 8 L24 12 L26 10 Z" fill="currentColor" fill-opacity="0.35"/>
                <path d="M25 7 L10 22"/><path d="M10 6 L12 8 L8 12 L6 10 Z" fill="currentColor" fill-opacity="0.35"/>
                <circle cx="16" cy="15" r="1.6" fill="currentColor"/>
            </svg>`,
            elite: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 12 Q10 6 16 6 Q22 6 22 12 L22 17 Q22 18 21 18 L19 18 L19 21 L13 21 L13 18 L11 18 Q10 18 10 17 Z" fill="currentColor" fill-opacity="0.18"/>
                <circle cx="13" cy="13" r="1.8" fill="currentColor"/>
                <circle cx="19" cy="13" r="1.8" fill="currentColor"/>
                <path d="M14 17 L15 19 L16 17 L17 19 L18 17"/>
                <path d="M7 9 L10 11 M25 9 L22 11" stroke-width="1.2"/>
            </svg>`,
            shop: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round">
                <path d="M16 5 L26 13 L22 26 L10 26 L6 13 Z" fill="currentColor" fill-opacity="0.22"/>
                <path d="M10 13 L22 13" stroke-width="1.2"/>
                <path d="M13 13 L12 26 M19 13 L20 26" stroke-width="1"/>
                <circle cx="16" cy="9" r="1.5" fill="currentColor"/>
            </svg>`,
            rest: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16 A8 8 0 1 1 14 8 A6 6 0 0 0 22 16 Z" fill="currentColor" fill-opacity="0.22"/>
                <path d="M9 9 L13 9 L9 13 L13 13" stroke-width="1.4"/>
                <circle cx="23" cy="9" r="0.8" fill="currentColor"/>
                <circle cx="26" cy="13" r="0.7" fill="currentColor"/>
            </svg>`,
            event: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round">
                <circle cx="16" cy="16" r="11" fill="currentColor" fill-opacity="0.14" stroke-width="1.2"/>
                <path d="M12 12 Q12 8 16 8 Q20 8 20 12 Q20 15 16 16 L16 19" stroke-width="2.4"/>
                <circle cx="16" cy="23" r="1.4" fill="currentColor"/>
            </svg>`,
            boss: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 18 L10 8 L14 14 L16 6 L18 14 L22 8 L26 18 L26 23 L6 23 Z" fill="currentColor" fill-opacity="0.25"/>
                <circle cx="12" cy="18" r="1.6" fill="currentColor"/>
                <circle cx="20" cy="18" r="1.6" fill="currentColor"/>
                <path d="M11 22 L13 21 L15 22 L17 21 L19 22 L21 21"/>
            </svg>`
        };
        return icons[type] || icons.combat;
    },

    renderMap() {
        const titleEl = document.getElementById('map-sector-display');
        if (titleEl) titleEl.innerText = `// SECTOR ${this.sector}`;

        // Tag the map screen with the active sector so CSS can layer in
        // sector-specific animated backdrops (city / ice / forge / hive / source).
        const screen = document.getElementById('screen-map');
        if (screen) {
            screen.dataset.sector = String(this.sector);
            this._injectSectorMapBackdrop(screen, this.sector);
        }

        const container = document.getElementById('map-nodes');
        container.innerHTML = `<div class="map-svg-layer" id="map-svg"></div>`;

        // Phase 8: figure out the current node id — the completed node at the end of our path.
        // "currentIdx" tracks the node most recently entered; if we've left combat it's completed.
        const currentNodeId = this.map.currentIdx;

        // Group nodes by layer for richer typed icons + shifting indicator.
        this.map.nodes.forEach((node, idx) => {
            const el = document.createElement('div');
            const isCurrent = node.id === currentNodeId && node.status === 'completed';
            const extraClass = (node.shifting ? ' shifting' : '') + (node.justShifted ? ' just-shifted' : '');
            el.className = `map-node-abs ${node.status}${isCurrent ? ' current' : ''}${extraClass} node-entering`;
            el.style.left = `${node.x}%`;
            el.style.top = `${node.y}%`;
            // Stagger the reveal based on node order.
            setTimeout(() => el.classList.remove('node-entering'), 20 + idx * 28);
            if (node.justShifted) setTimeout(() => el.classList.remove('just-shifted'), 1400);

            el.dataset.type = node.type;
            el.innerHTML = `<span class="map-node-icon">${this.mapNodeSvg(node.type)}</span><span class="map-node-glow" aria-hidden="true"></span>`;
            if (isCurrent) el.innerHTML += `<div class="map-here-arrow">▾</div>`;
            if (node.shifting) el.innerHTML += `<div class="map-shift-ring"></div>`;

            if(node.status === 'available') {
                el.onclick = () => this.visitNode(node);
            }

            const tipPrefix = node.shifting ? 'SHIFTING · ' : '';
            const tipText = tipPrefix + node.type.toUpperCase() + (node.status === 'available' ? ' — Click to enter' : '');
            el.onmouseenter = (e) => TooltipMgr.show(tipText, e.clientX, e.clientY);
            el.onmouseleave = () => TooltipMgr.hide();

            container.appendChild(el);

            // Consume the justShifted flag once rendered.
            node.justShifted = false;
        });

        const svg = document.getElementById('map-svg');
        const completedIds = new Set(this.map.nodes.filter(n => n.status === 'completed').map(n => n.id));
        const availableIds = new Set(this.map.nodes.filter(n => n.status === 'available').map(n => n.id));

        // Build SVG with a blur-based glow filter so every path reads as a luminous
        // wire. Each connection is drawn twice — a wide soft-glow underlay then a
        // thin crisp top line — giving the neon-wire effect without needing CSS drop-shadow.
        let svgHTML = `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" class="map-svg-root">`;
        svgHTML += `
            <defs>
                <filter id="map-line-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur stdDeviation="2.4" result="blur1"/>
                    <feMerge>
                        <feMergeNode in="blur1"/>
                        <feMergeNode in="blur1"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>`;

        // Helper to build one connection path string
        const pathD = (node, target) => {
            const midX = (node.x + target.x) / 2;
            const midY = (node.y + target.y) / 2;
            const perpOffset = ((node.id.charCodeAt(0) || 0) % 2 === 0 ? 1 : -1) * 3;
            return `M ${node.x} ${node.y} Q ${midX + perpOffset} ${midY} ${target.x} ${target.y}`;
        };

        // Pass 1 — dim base lines for all connections (structural "map wire")
        this.map.nodes.forEach(node => {
            node.connections.forEach(targetId => {
                const target = this.map.nodes.find(n => n.id === targetId);
                if (!target) return;
                const d = pathD(node, target);
                // Thin grey underlay so all routes are visible as blueprint
                svgHTML += `<path d="${d}" fill="none" stroke="rgba(180, 200, 230, 0.18)" stroke-width="1" stroke-dasharray="2,3" stroke-linecap="round"/>`;
            });
        });

        // Pass 2 — glowing highlighted paths (available + completed routes) drawn on top
        this.map.nodes.forEach(node => {
            node.connections.forEach(targetId => {
                const target = this.map.nodes.find(n => n.id === targetId);
                if (!target) return;
                let color = null, width = 1.2, dasharray = '', opacity = 1;

                if (completedIds.has(node.id) && completedIds.has(target.id)) {
                    color = '#00ff99'; width = 1.6;
                } else if (completedIds.has(node.id) && availableIds.has(target.id)) {
                    color = '#00f3ff'; width = 1.8; dasharray = '6,4';
                } else if (availableIds.has(node.id) || availableIds.has(target.id)) {
                    color = 'rgba(200, 210, 255, 0.55)'; width = 1.2; dasharray = '3,4'; opacity = 0.9;
                }
                if (!color) return;
                const d = pathD(node, target);
                // Outer glow underlay (wide, blurred)
                svgHTML += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width * 2}" stroke-linecap="round" opacity="0.35" filter="url(#map-line-glow)"/>`;
                // Crisp top line
                svgHTML += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-dasharray="${dasharray}" stroke-linecap="round" opacity="${opacity}"/>`;
            });
        });

        svgHTML += `</svg>`;
        svg.innerHTML = svgHTML;

        // Legend rendered once into the dedicated top bar (not inside the map container).
        this.renderMapLegend();
    },

    renderMapLegend() {
        const legend = document.getElementById('map-legend-top');
        if (!legend) return;
        const types = ['combat', 'elite', 'event', 'shop', 'rest', 'boss'];
        legend.innerHTML = types.map(t => `
            <span class="map-legend-item" data-type="${t}">
                <span class="map-legend-icon">${this.mapNodeSvg(t)}</span>
                ${t.toUpperCase()}
            </span>
        `).join('');
    },

	completeCurrentNode() {
        const node = this.map.nodes.find(n => n.id === this.map.currentIdx);
        if (node) {
            node.status = 'completed';
            // Unlock next nodes
            node.connections.forEach(tid => {
                const t = this.map.nodes.find(n => n.id === tid);
                if(t) t.status = 'available';
            });
        }
        // Randomization: after a node is cleared, a few shifting un-visited nodes may reroll their type.
        this.shiftRandomNodes();
        this.saveGame();
    },

    visitNode(node) {
        AudioMgr.playSound('click');
        
        if (node.type === 'start') return;

        // FIX: Removed early return for 'event'. 
        // It must flow through the logic below to update currentIdx correctly.
        
        // 1. Update previous node status (Visuals & Locking)
        if (this.map.currentIdx !== node.id) {
            const previous = this.map.nodes.find(n => n.id === this.map.currentIdx);
            if(previous) previous.status = 'completed';
            
            this.map.nodes.forEach(n => {
                if (n.status === 'available' && n.id !== node.id) {
                    n.status = 'locked';
                }
            });
        }

        // 2. Update Player Position (Crucial for completeCurrentNode to work)
        this.map.currentIdx = node.id;
        
        // 3. Save Game (at start of node)
        this.saveGame();

        // 4. Trigger Node Action
        if(node.type === 'combat' || node.type === 'elite' || node.type === 'boss') {
            this.startCombat(node.type);
        } else if (node.type === 'shop') {
            this.generateShop(); 
            this.changeState(STATE.SHOP);
        } else if (node.type === 'event') {
            // FIX: Handle event here so position is already updated
            this.startEvent();
        } else if (node.type === 'rest') {
            // Custom Run: Merciless — rest nodes do nothing. Flash a quick
            // toast and auto-complete so the player stays on the map.
            if (this._customDisableRest) {
                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2,
                    'REST DENIED — MERCILESS', '#ff3355');
                AudioMgr.playSound('defend');
                this.completeCurrentNode();
                this.renderMap();
                return;
            }
            const available = this._availableDiceUpgrades();
            const btnTinker = document.getElementById('btn-rest-tinker');

            if (available.length === 0) {
                btnTinker.innerHTML = "<div>🛒 ACCESS SHOP</div><div style='font-size: 0.8rem; color: #aaa;'>All Skills Maxed</div>";
            } else {
                btnTinker.innerHTML = "<div>🔧 TINKER</div><div style='font-size: 0.8rem; color: #aaa;'>Upgrade a Random Skill</div>";
            }

            document.getElementById('screen-rest').classList.remove('hidden');
            document.getElementById('screen-rest').classList.add('active');
        } else {
            this.renderMap();
        }
    },

    handleRest(action) {
        // Common actions for Sleep/Meditate hide the screen immediately
        if (action === 'sleep') {
            document.getElementById('screen-rest').classList.remove('active');
            document.getElementById('screen-rest').classList.add('hidden');
            const healAmt = Math.floor(this.player.maxHp * 0.5);
            this.player.heal(healAmt);
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, "SYSTEM RESTORED", COLORS.NATURE_LIGHT);
            AudioMgr.playSound('mana');
            this.completeCurrentNode();
            this.renderMap();
        } else if (action === 'meditate') {
            document.getElementById('screen-rest').classList.remove('active');
            document.getElementById('screen-rest').classList.add('hidden');
            this.player.addRelic({ id: 'reroll_chip', name: "Reroll Chip", desc: "+1 Reroll per turn.", icon: ICONS.metaReroll });
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, "FOCUS INCREASED", COLORS.MANA);
            AudioMgr.playSound('mana');
            this.completeCurrentNode();
            this.renderMap();
        } else if (action === 'tinker') {
            const available = this._availableDiceUpgrades();

            if (available.length > 0) {
                document.getElementById('screen-rest').classList.remove('active');
                document.getElementById('screen-rest').classList.add('hidden');
                const up = available[Math.floor(Math.random() * available.length)];
                this.player.diceUpgrades.push(up);
                const upName = (DICE_UPGRADES[up] && DICE_UPGRADES[up].name) || up;
                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, `UPGRADE: ${upName}`, COLORS.GOLD);
                AudioMgr.playSound('mana');
                this.completeCurrentNode();
                this.renderMap();
            } else {
                // NEW: All skills upgraded -> Access Shop Logic
                // Hide rest screen
                document.getElementById('screen-rest').classList.remove('active');
                document.getElementById('screen-rest').classList.add('hidden');
                
                // Go to shop
                this.generateShop();
                this.changeState(STATE.SHOP);
                // Note: Node completion happens in leaveShop()
            }
        }
    },

    // --- Full progress reset — wipes every mvm_ localStorage key and reloads.
    resetAllProgress() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('mvm_')) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch (e) { console.warn('resetAllProgress localStorage error', e); }
        // Hard reload so every in-memory reference resets to a clean boot.
        window.location.reload();
    },

    // --- Accessibility settings persistence (Phase 6) ---
    saveSettings() {
        try {
            const d = document;
            const get = (id, type='checked') => {
                const el = d.getElementById(id);
                return el ? (type === 'checked' ? el.checked : el.value) : null;
            };
            const settings = {
                v: 1,
                music: get('chk-music'),
                sfx: get('chk-sfx'),
                godMode: get('chk-godmode'),
                musicVol: Number(get('sld-music-vol', 'value')) || 30,
                musicTrack: get('sel-music-track', 'value') || 'synth',
                sfxVol: Number(get('sld-sfx-vol', 'value')) || 80,
                ambientVol: Number(get('sld-ambient-vol', 'value')) || 60,
                textScale: Number(get('sld-text-scale', 'value')) || 100,
                reducedMotion: get('chk-reduced-motion'),
                highContrast: get('chk-high-contrast'),
                colorblind: get('sel-colorblind', 'value') || 'none',
                dmgSize: get('sel-dmg-size', 'value') || 'medium',
                tutorialHints: get('chk-tutorial-hints'),
                haptics: get('chk-haptics'),
                assistOn: get('chk-assist') !== false,
                reducedGlow: get('chk-reduced-glow'),
                largeTouch: get('chk-large-touch'),
                autoQTE: get('chk-auto-qte'),
                perfTier: get('sel-perf-tier', 'value') || 'auto',
                combatPace: Number(get('sld-combat-pace', 'value')) || 100,
                handedness: get('sel-handedness', 'value') || 'right'
            };
            localStorage.setItem('mvm_settings_v1', JSON.stringify(settings));
        } catch(e) { console.warn('saveSettings failed', e); }
    },

    loadSettings() {
        try {
            const raw = localStorage.getItem('mvm_settings_v1');
            if (!raw) {
                // First-launch defaults — still apply OS preference for reduced motion
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    document.body.classList.add('reduced-motion');
                    const el = document.getElementById('chk-reduced-motion');
                    if (el) el.checked = true;
                }
                return;
            }
            const s = JSON.parse(raw);
            const d = document;
            const setCheck = (id, val) => { const el = d.getElementById(id); if (el && val != null) el.checked = !!val; };
            const setVal = (id, val) => { const el = d.getElementById(id); if (el && val != null) el.value = val; };

            setCheck('chk-music', s.music);
            setCheck('chk-sfx', s.sfx);
            setCheck('chk-godmode', s.godMode);
            setCheck('chk-reduced-motion', s.reducedMotion);
            setCheck('chk-high-contrast', s.highContrast);
            setCheck('chk-tutorial-hints', s.tutorialHints !== false);
            setCheck('chk-haptics', s.haptics !== false);
            setCheck('chk-assist', s.assistOn !== false);
            this.assistDisabled = s.assistOn === false;
            setCheck('chk-reduced-glow', !!s.reducedGlow);
            setCheck('chk-large-touch', !!s.largeTouch);
            setCheck('chk-auto-qte', !!s.autoQTE);
            setVal('sel-perf-tier', s.perfTier || 'auto');
            if (s.reducedGlow) { document.body.classList.add('reduced-glow'); this.reducedGlow = true; }
            if (s.largeTouch)  document.body.classList.add('large-touch');
            if (s.autoQTE)     this.autoQTE = true;
            setVal('sld-music-vol', s.musicVol);
            setVal('sld-sfx-vol', s.sfxVol);
            if (s.ambientVol != null) {
                setVal('sld-ambient-vol', s.ambientVol);
                AudioMgr.setAmbientVolume && AudioMgr.setAmbientVolume(Number(s.ambientVol) / 100);
            }
            if (s.musicTrack) {
                setVal('sel-music-track', s.musicTrack);
                AudioMgr.setTrack && AudioMgr.setTrack(s.musicTrack);
            }
            setVal('sld-text-scale', s.textScale);
            setVal('sld-combat-pace', s.combatPace);
            setVal('sel-colorblind', s.colorblind || 'none');
            setVal('sel-dmg-size', s.dmgSize || 'medium');
            const hand = (s.handedness === 'left') ? 'left' : 'right';
            setVal('sel-handedness', hand);
            document.body.setAttribute('data-hand', hand);

            // Apply to DOM/body immediately
            if (s.music === false) AudioMgr.toggleMusic(false);
            if (s.sfx === false) AudioMgr.toggleSFX(false);
            if (typeof s.musicVol === 'number') AudioMgr.setMusicVolume(s.musicVol / 100);
            if (typeof s.sfxVol === 'number') AudioMgr.setSFXVolume(s.sfxVol / 100);
            if (typeof s.textScale === 'number') document.documentElement.style.setProperty('--text-scale-multiplier', s.textScale / 100);
            document.body.classList.toggle('reduced-motion', !!s.reducedMotion);
            document.body.classList.toggle('high-contrast', !!s.highContrast);
            document.body.classList.remove('cb-deuteranopia', 'cb-protanopia', 'cb-tritanopia');
            if (s.colorblind && s.colorblind !== 'none') document.body.classList.add('cb-' + s.colorblind);
            this.damageNumberSize = s.dmgSize || 'medium';
            this.tutorialHintsEnabled = s.tutorialHints !== false;
            this.hapticsEnabled = s.haptics !== false;
            this.godMode = !!s.godMode;

            // Sync slider value displays
            const syncDisplay = (id, suffix = '') => {
                const el = d.getElementById(id);
                const v = d.querySelector(`.setting-value[data-for="${id}"]`);
                if (el && v) v.textContent = el.value + suffix;
            };
            syncDisplay('sld-music-vol');
            syncDisplay('sld-sfx-vol');
            syncDisplay('sld-text-scale', '%');
            syncDisplay('sld-combat-pace', '%');
            this.combatPaceMult = (typeof s.combatPace === 'number' ? s.combatPace : 100) / 100;

            // Dev-tab ascension slider mirrors the live corruption level
            const ascEl = d.getElementById('sld-ascension');
            if (ascEl) {
                ascEl.value = Math.max(0, Math.min(10, this.corruptionLevel || 0));
                const ascDisp = d.querySelector('.setting-value[data-for="sld-ascension"]');
                if (ascDisp) ascDisp.textContent = ascEl.value;
            }
        } catch(e) { console.warn('loadSettings failed', e); }
    },

    // Current save-file schema version. Bump whenever the shape changes so
    // older files run through _migrateSave() before being consumed. Keeps
    // mid-run saves forward-compatible across class-rework / new-feature
    // deploys without forcing the player to restart.
    SAVE_SCHEMA_VERSION: 2,

    saveGame() {
        if (!this.map.currentIdx) this.map.currentIdx = 'start';

        const data = {
            v: this.SAVE_SCHEMA_VERSION,
            fragments: this.techFragments,
            meta: this.metaUpgrades,
            encrypted: this.encryptedFiles,
            lore: this.unlockedLore,
            sector: this.sector,
            map: this.map,
            currentIdx: this.map.currentIdx,
            bossDefeated: this.bossDefeated,
            player: {
                classId: this.player.classId,
                hp: this.player.currentHp,
                maxHp: this.player.maxHp,
                mana: this.player.baseMana,
                relics: this.player.relics,
                upgrades: this.player.diceUpgrades,
                signatureTier: this.player.signatureTier || 1
            }
        };
        try {
            localStorage.setItem('mvm_save_v1', JSON.stringify(data));
        } catch (e) {
            // QuotaExceededError or blocked storage — surface a hint but don't
            // throw, since saveGame is called from UI flows that would break
            // mid-purchase if this bubbled.
            console.warn('[saveGame] failed:', e);
        }
    },

    // Migrate a raw save object to the current schema. Returns the migrated
    // object (never mutates the input). Unknown versions are treated as v1
    // (pre-versioning era) and passed through the same defensive pipeline.
    _migrateSave(raw) {
        const data = JSON.parse(JSON.stringify(raw)); // deep clone to avoid mutating raw
        const from = (typeof data.v === 'number') ? data.v : 1;

        // v1 → v2: added schema version field; no data shape changes, but this
        // is the point where any future field-rename migrations will live.
        if (from < 2) {
            data.v = 2;
            // Defensive defaults for fields that newer code paths expect.
            data.player = data.player || {};
            if (!data.player.upgrades) data.player.upgrades = [];
            if (!data.player.relics) data.player.relics = [];
            if (!data.player.signatureTier) data.player.signatureTier = 1;
        }

        return data;
    },

    loadGame() {
        const json = localStorage.getItem('mvm_save_v1');
        if (!json) return;

        try {
            const raw = JSON.parse(json);
            const data = this._migrateSave(raw);

            this.sector = data.sector || 1;
            this.map = data.map || { nodes: [], currentIdx: 'start' };
            this.map.currentIdx = data.currentIdx || 'start';
            this.bossDefeated = !!data.bossDefeated;

            const classConfig = PLAYER_CLASSES.find(c => c.id === (data.player && data.player.classId))
                || PLAYER_CLASSES[0];
            this.player = new Player(classConfig);

            this.player.currentHp = typeof data.player.hp === 'number' ? data.player.hp : this.player.maxHp;
            this.player.maxHp = typeof data.player.maxHp === 'number' ? data.player.maxHp : this.player.maxHp;
            this.player.baseMana = typeof data.player.mana === 'number' ? data.player.mana : this.player.baseMana;
            this.player.relics = (data.player.relics || []).map(r => {
                const canonical = UPGRADES_POOL.find(u => u.id === r.id) || META_UPGRADES.find(u => u.id === r.id);
                return canonical ? { ...r, icon: canonical.icon } : r;
            });
            this.player.diceUpgrades = data.player.upgrades || [];
            this.player.classId = data.player.classId;
            this.player.signatureTier = data.player.signatureTier || 1;

            this.player.minions = [];

            AudioMgr.startMusic();
            this.renderRelics();

            this.changeState(STATE.MAP);
            this.renderMap();

            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, "SYSTEM RESTORED", COLORS.GOLD);
        } catch (e) {
            console.error("Save file corrupted", e);
            try { localStorage.removeItem('mvm_save_v1'); } catch (_) {}
            alert("Save file corrupted. Starting new run.");
            this.goToCharSelect();
        }
    },

    startEvent() {
        // FIX: Filter events based on conditions (e.g. don't show upgrade events if maxed)
        const validEvents = EVENTS_DB.filter(e => !e.condition || e.condition(this));
        
        // Fallback to all events if filter leaves none (unlikely but safe)
        const pool = validEvents.length > 0 ? validEvents : EVENTS_DB;
        
        const event = pool[Math.floor(Math.random() * pool.length)];
        
        this.changeState(STATE.EVENT);
        document.getElementById('event-title').innerText = event.title;
        document.getElementById('event-desc').innerText = event.desc;
        
        const opts = document.getElementById('event-options');
        opts.innerHTML = '';
        
        event.options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'btn secondary';
            btn.innerText = opt.text;
            btn.onclick = () => {
                const msg = opt.effect(this);
                
                if (msg === "COMBAT_STARTED") return;

                ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2, msg, COLORS.GOLD);
                
                this.completeCurrentNode();
                
                setTimeout(() => this.changeState(STATE.MAP), 1000);
            };
            opts.appendChild(btn);
        });
    },

    generateShop() {
        this.shopInventory = [];
        // Fresh shop → hack attempt available again, clear prior hack glow.
        this._shopHacked = false;
        this._shopHackOutcome = null;
        // Shop price: base meta-upgrade discount multiplied by any ascension
        // shop-price modifier (Ascension 10 Apex = x2, Ascension 11 Null Field = x1.4).
        // Custom Run "Open Markets" stacks on top as an additional discount.
        const customDiscount = 1 - (this._customShopDiscount || 0);
        const discountMult = (this.hasMetaUpgrade('m_discount') ? 0.75 : 1.0)
            * (this._ascEffects && this._ascEffects.shopPriceMult ? this._ascEffects.shopPriceMult : 1)
            * customDiscount;

        let items = [
            {
                id: 'repair', type: 'item', name: "Nano-Repair", cost: 15, icon: ICONS.intentHeal,
                desc: "Restores 30% HP.",
                action: () => {
                    const amt = Math.floor(this.player.maxHp * 0.3);
                    this.player.heal(amt);
                }
            },
            {
                id: 'hp_up', type: 'item', name: "Power Cell", cost: 30, icon: ICONS.relicPowerCell,
                desc: "Max HP +10.",
                action: () => { this.player.maxHp += 10; this.player.currentHp += 10; }
            },
            {
                id: 'mana_up', type: 'item', name: "Mana Core", cost: 50, icon: ICONS.mana,
                desc: "Base Mana +1.",
                action: () => { this.player.baseMana += 1; }
            },
            {
                id: 'nano_shield', type: 'item', name: "Shield Matrix", cost: 40, icon: ICONS.relicShield,
                desc: "Start combat with +5 Block.",
                action: () => {
                    this.player.addRelic({ id: 'nano_shield', name: "Nano-Shield", desc: "Start combat with 5 Block.", icon: ICONS.relicShield });
                }
            },
            {
                id: 'crit_lens', type: 'item', name: "Luck Drive", cost: 45, icon: ICONS.relicCrit,
                desc: "+15% Double Damage Chance.",
                action: () => {
                    this.player.addRelic({ id: 'crit_lens', name: "Crit Lens", desc: "15% chance to deal Double Damage.", icon: ICONS.relicCrit });
                }
            },
            {
                id: 'spike_armor', type: 'item', name: "Reflect Drive", cost: 45, icon: ICONS.relicDoubleEdge,
                desc: "Reflect 30% Dmg taken. (Stacks)",
                action: () => {
                    this.player.addRelic({ id: 'spike_armor', name: "Double Edge", desc: "Reflect 30% Dmg.", icon: ICONS.relicDoubleEdge });
                }
            },
            {
                id: 'minion_core', type: 'item', name: "Minion Core", cost: 60, icon: ICONS.minion,
                desc: "Start combat with 1 Wisp.",
                action: () => {
                    this.player.addRelic({ id: 'minion_core', name: "Minion Core", desc: "Start combat with 1 Wisp.", icon: ICONS.minion });
                }
            },
            {
                id: 'mana_syphon', type: 'item', name: "Mana Syphon", cost: 80, icon: ICONS.classArcanist,
                desc: "+1 Mana at start of turn.",
                action: () => {
                    this.player.addRelic({ id: 'mana_syphon', name: "Mana Syphon", desc: "+1 Mana at start of turn.", icon: ICONS.classArcanist });
                }
            }
        ];

        // ... (Filtering Logic Remains Same) ...
        const coreCount = this.player.relics.filter(r => r.id === 'minion_core').length;
        if(coreCount >= 2) items = items.filter(i => i.id !== 'minion_core');
        const titanCount = this.player.relics.filter(r => r.id === 'titan_module').length;
        if(titanCount >= 3) items = items.filter(i => i.name !== "Titan Module");
        const lensCount = this.player.relics.filter(r => r.id === 'crit_lens').length;
        if(lensCount >= 5) items = items.filter(i => i.id !== 'crit_lens');
        const holoCount = this.player.relics.filter(r => r.id === 'hologram').length;
        if(holoCount >= 3) items = items.filter(i => i.id !== 'hologram');
        const fireCount = this.player.relics.filter(r => r.id === 'firewall').length;
        if(fireCount >= 3) items = items.filter(i => i.id !== 'firewall');
        const gamblerCount = this.player.relics.filter(r => r.id === 'gamblers_chip').length;
        if(gamblerCount >= 3) items = items.filter(i => i.id !== 'gamblers_chip');

        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        
        const selectedItems = items.slice(0, 3);

        selectedItems.forEach(item => {
            const currentCount = this.player.relics.filter(r => r.id === item.id).length;
            item.desc = this.getRelicDescription({id: item.id, desc: item.desc}, currentCount + 1);
            item.cost = Math.floor(item.cost * discountMult);
        });

        this.shopInventory.push(...selectedItems);

        // Class-aware upgrade pool — offers only upgrades that belong to the
        // active player class (plus shared skill dice that have no classId).
        const availableUpgrades = this._availableDiceUpgrades();

        for (let i = availableUpgrades.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableUpgrades[i], availableUpgrades[j]] = [availableUpgrades[j], availableUpgrades[i]];
        }
        
        const shopUpgrades = availableUpgrades.slice(0, 3);
        let discountIndex = shopUpgrades.length > 0 ? Math.floor(Math.random() * shopUpgrades.length) : -1;

        shopUpgrades.forEach((key, idx) => {
            const up = DICE_UPGRADES[key];
            let cost = up.cost;
            let isDiscount = false;
            if (idx === discountIndex) {
                cost = Math.floor(cost * 0.6);
                isDiscount = true;
            }
            cost = Math.floor(cost * discountMult);
            
            this.shopInventory.push({
                type: 'upgrade',
                key: key,
                name: up.name,
                desc: up.desc,
                icon: up.icon,
                cost: cost,
                isDiscount: isDiscount,
                purchased: false
            });
        });
    },

    // HACK FABRICATOR — skill-based Simon-says minigame. 25% chance the
    // minigame is extremely hard (7-step, fast flash); 75% chance it's
    // normal (4-step, comfortable flash). Winning cuts all unpurchased
    // prices 25%; losing doubles them. Only attemptable once per shop
    // visit, gated by ≥100 fragments. `_shopHacked` resets in
    // `generateShop` so a fresh shop is hackable again.
    async hackShop() {
        if (!this.shopInventory) return;
        if (this._shopHacked) return;
        if ((this.techFragments || 0) < 100) {
            ParticleSys.createFloatingText(540, 800, 'NEED 100+ FRAGMENTS', '#ff3355');
            AudioMgr.playSound('defend');
            return;
        }
        this._shopHacked = true;
        this._refreshHackButton();

        // First hack of the run is always normal mode — a tutorial-of-sorts
        // so the player learns the minigame before being handed the punishing
        // hard maze. After that, each subsequent hack rolls 25% hard.
        const firstHackThisRun = !this._hasHackedThisRun;
        this._hasHackedThisRun = true;
        const hard = !firstHackThisRun && Math.random() < 0.25;
        const won = await this._playHackMinigame(hard);

        // Apply outcome to unpurchased items. Store both the pre-hack price
        // (for UI tooltips if ever needed) and the new price.
        const outcomeClass = won ? 'hack-win' : 'hack-fail';
        let affected = 0;
        this.shopInventory.forEach(it => {
            if (it.purchased) return;
            const before = it.cost;
            if (won) it.cost = Math.max(1, Math.floor(before * 0.75));
            else     it.cost = before * 2;
            it.hackOutcome = outcomeClass;
            if (it.cost !== before) affected++;
        });
        this._shopHackOutcome = outcomeClass;

        if (won) {
            AudioMgr.playSound('upgrade');
            if (this.player) ParticleSys.createShockwave(this.player.x, this.player.y, '#00ff99', 36);
            if (this.shake) this.shake(8);
        } else {
            AudioMgr.playSound('explosion');
            if (this.player) ParticleSys.createExplosion(this.player.x, this.player.y, 36, '#ff3355');
            if (this.shake) this.shake(14);
            if (this.triggerScreenFlash) this.triggerScreenFlash('rgba(255, 40, 80, 0.4)', 220);
        }
        this.saveGame();
        this._playShopHackElectrocution(won, affected);
    },

    // Post-hack electrocution cue — all shop cards shake + buzz in the
    // outcome color for ~900ms, then the shop re-renders with the new
    // prices. Provides an unmistakable "something just changed" moment so
    // the player connects the minigame result with the price shift.
    _playShopHackElectrocution(won, affectedCount) {
        const grid = document.getElementById('shop-grid');
        if (!grid) { this.renderShop(); return; }

        // Re-render FIRST with the outcome class so items have the green/red
        // border/cost-chip highlight, then layer the buzz animation on top.
        this.renderShop();

        // Apply buzz class (which drives shake + glow keyframes). Remove
        // after the buzz window so the shop settles into persistent
        // green/red cost-chip glow without continuing to vibrate.
        const buzzClass = won ? 'hack-buzz-win' : 'hack-buzz-fail';
        grid.classList.add(buzzClass);
        // Big floating banner over the shop area — clear success/fail cue.
        const banner = won
            ? `HACK SUCCESS — ${affectedCount} PRICES −25%`
            : `HACK FAILED — PRICES DOUBLED`;
        ParticleSys.createFloatingText(540, 780, banner, won ? '#00ff99' : '#ff3355');
        if (this.haptic) this.haptic(won ? 'heavy' : 'warn');

        setTimeout(() => {
            grid.classList.remove(buzzClass);
        }, 900);
    },

    // Runs the maze-escape minigame. Returns a Promise<boolean>: true if the
    // player's dot reaches the exit before the timer expires, false otherwise.
    //   Normal mode: 9×9 maze, 20-second timer.
    //   Hard mode:  15×15 maze, 22-second timer — larger and more convoluted,
    //               much less breathing room per step.
    // Uses a randomized iterative DFS to carve a perfect maze (single path
    // between any two cells), then draws it on a dedicated canvas and wires up
    // the d-pad buttons + keyboard arrows.
    _playHackMinigame(hard) {
        return new Promise(resolve => {
            const overlay = document.getElementById('hack-minigame-overlay');
            if (!overlay) { resolve(false); return; }
            const canvas = document.getElementById('hack-maze');
            const subEl = document.getElementById('hack-subtitle');
            const statusEl = document.getElementById('hack-status');
            const timerWrap = overlay.querySelector('.hack-timer');
            const timerValEl = document.getElementById('hack-timer-value');
            const resultEl = document.getElementById('hack-result');
            const dpadBtns = Array.from(overlay.querySelectorAll('.hack-dpad[data-dir]'));

            // Maze dimensions (odd numbers so carved cells + walls alternate).
            // Hard mode: shortest path on an 11×11 maze is ~20-26 moves; the
            // 35-second timer leaves headroom for mistakes vs the original
            // 15×15 grid which was effectively unsolvable without luck.
            const cols = hard ? 11 : 9;
            const rows = hard ? 11 : 9;
            const timeMs = hard ? 35000 : 25000;

            // Reset UI
            overlay.classList.toggle('is-hard', !!hard);
            overlay.classList.remove('hidden');
            resultEl.textContent = '';
            resultEl.className = 'hack-result';
            if (subEl) subEl.textContent = hard
                ? 'FIREWALL HARDENED — larger maze, same window.'
                : 'Escape the data maze — reach the exit before the timer expires.';
            if (statusEl) { statusEl.textContent = 'RUN'; statusEl.className = 'hack-status is-play'; }
            if (timerWrap) timerWrap.classList.remove('is-danger');

            // Carve a perfect maze using randomized DFS.
            // grid[r][c]: 0 = wall, 1 = passage.
            const grid = [];
            for (let r = 0; r < rows; r++) {
                const row = [];
                for (let c = 0; c < cols; c++) row.push(0);
                grid.push(row);
            }
            const shuffle = (arr) => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
            };
            const carve = (cr, cc) => {
                grid[cr][cc] = 1;
                const dirs = [[-2, 0], [2, 0], [0, -2], [0, 2]];
                shuffle(dirs);
                for (const [dr, dc] of dirs) {
                    const nr = cr + dr, nc = cc + dc;
                    if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && grid[nr][nc] === 0) {
                        grid[cr + dr / 2][cc + dc / 2] = 1; // knock down wall between
                        carve(nr, nc);
                    }
                }
            };
            carve(1, 1);
            const startR = 1, startC = 1;
            const endR = rows - 2, endC = cols - 2;
            grid[endR][endC] = 1;

            // Render setup — canvas-internal pixel dimensions.
            const cellPx = hard ? 28 : 36;
            canvas.width = cols * cellPx;
            canvas.height = rows * cellPx;
            const ctx = canvas.getContext('2d');

            // Player state
            const player = { r: startR, c: startC };
            let deadline = performance.now() + timeMs;
            let rafId = 0;
            let cancelled = false;

            const draw = () => {
                ctx.fillStyle = '#08060f';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                // Walls
                ctx.fillStyle = 'rgba(255, 0, 85, 0.85)';
                ctx.shadowColor = 'rgba(255, 0, 85, 0.55)';
                ctx.shadowBlur = 4;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (grid[r][c] === 0) ctx.fillRect(c * cellPx, r * cellPx, cellPx, cellPx);
                    }
                }
                ctx.shadowBlur = 0;
                // Exit marker — pulsing green square
                const now = performance.now();
                const pulse = 0.55 + Math.sin(now / 180) * 0.35;
                ctx.fillStyle = `rgba(0, 255, 153, ${pulse})`;
                ctx.shadowColor = '#00ff99'; ctx.shadowBlur = 12;
                ctx.fillRect(endC * cellPx + 2, endR * cellPx + 2, cellPx - 4, cellPx - 4);
                // Exit glyph
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.floor(cellPx * 0.45)}px Orbitron, monospace`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('E', endC * cellPx + cellPx / 2, endR * cellPx + cellPx / 2);
                ctx.shadowBlur = 0;
                // Player — neon-gold dot with glow
                const px = player.c * cellPx + cellPx / 2;
                const py = player.r * cellPx + cellPx / 2;
                ctx.fillStyle = '#00f3ff';
                ctx.shadowColor = '#00f3ff'; ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.arc(px, py, cellPx * 0.32, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.arc(px, py, cellPx * 0.15, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            };

            const cleanup = (result) => {
                if (cancelled) return;
                cancelled = true;
                if (rafId) cancelAnimationFrame(rafId);
                document.removeEventListener('keydown', onKey);
                dpadBtns.forEach(b => { b.onclick = null; b.ontouchstart = null; b.disabled = true; });
                if (result) {
                    resultEl.textContent = 'ACCESS GRANTED';
                    resultEl.classList.add('is-win');
                    if (statusEl) { statusEl.textContent = 'WIN'; statusEl.className = 'hack-status is-win'; }
                    AudioMgr.playSound('upgrade');
                } else {
                    resultEl.textContent = 'LOCKOUT';
                    resultEl.classList.add('is-fail');
                    if (statusEl) { statusEl.textContent = 'FAIL'; statusEl.className = 'hack-status is-fail'; }
                    AudioMgr.playSound('defend');
                }
                setTimeout(() => {
                    overlay.classList.add('hidden');
                    overlay.classList.remove('is-hard');
                    resolve(result);
                }, 700);
            };

            const tryMove = (dr, dc) => {
                if (cancelled) return;
                const nr = player.r + dr, nc = player.c + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;
                if (grid[nr][nc] === 0) {
                    // Bonk wall — quick red flash + haptic
                    AudioMgr.playSound && AudioMgr.playSound('hit');
                    return;
                }
                player.r = nr; player.c = nc;
                AudioMgr.playSound && AudioMgr.playSound('click');
                if (nr === endR && nc === endC) cleanup(true);
            };

            const onKey = (e) => {
                if (cancelled) return;
                const k = e.key;
                if (k === 'ArrowUp' || k === 'w' || k === 'W')    { e.preventDefault(); tryMove(-1, 0); }
                else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); tryMove(1, 0); }
                else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); tryMove(0, -1); }
                else if (k === 'ArrowRight' || k === 'd' || k === 'D'){ e.preventDefault(); tryMove(0, 1); }
            };
            document.addEventListener('keydown', onKey);

            // D-pad wiring (touch + click).
            dpadBtns.forEach(btn => {
                const fire = (ev) => {
                    if (ev && ev.preventDefault) ev.preventDefault();
                    const dir = btn.dataset.dir;
                    if (dir === 'up')    tryMove(-1, 0);
                    else if (dir === 'down')  tryMove(1, 0);
                    else if (dir === 'left')  tryMove(0, -1);
                    else if (dir === 'right') tryMove(0, 1);
                };
                btn.onclick = fire;
                btn.ontouchstart = fire;
                btn.disabled = false;
            });

            // Timer + render loop
            const loop = () => {
                if (cancelled) return;
                const remaining = Math.max(0, deadline - performance.now());
                if (timerValEl) {
                    const secs = Math.ceil(remaining / 1000);
                    timerValEl.textContent = `${secs}s`;
                }
                if (timerWrap) timerWrap.classList.toggle('is-danger', remaining < 5000);
                draw();
                if (remaining <= 0) { cleanup(false); return; }
                rafId = requestAnimationFrame(loop);
            };
            loop();
        });
    },

    // Keep the HACK FABRICATOR button state in sync with the current shop
    // state — disabled when below 100 frags, marked "used" once this visit.
    _refreshHackButton() {
        const btn = document.getElementById('btn-hack-shop');
        if (!btn) return;
        if (!btn.dataset.wired) {
            btn.addEventListener('click', () => this.hackShop());
            btn.dataset.wired = '1';
        }
        const canAfford = (this.techFragments || 0) >= 100;
        const used = !!this._shopHacked;
        btn.disabled = !canAfford || used;
        btn.classList.toggle('is-used', used);
        const label = btn.querySelector('.hack-label');
        const sub = btn.querySelector('.hack-sub');
        if (used) {
            if (label) label.textContent = 'HACK ATTEMPTED';
            if (sub)   sub.textContent = 'Fabricator firewall locked for this visit';
        } else if (!canAfford) {
            if (sub) sub.textContent = `NEED 100+ FRAGMENTS (${this.techFragments || 0})`;
        } else {
            if (sub) sub.textContent = 'MINIGAME · WIN = −25% PRICES · LOSE = PRICES ×2';
        }
    },

    // Class-aware dice-upgrade filter. Returns keys of DICE_UPGRADES the
    // player is actually eligible for:
    //   1. Not already owned
    //   2. Either class-agnostic (no classId — shared skill dice) OR
    //      matching the player's classId (e.g. Summoner only sees SUM_*)
    //   3. Locked skill dice require the appropriate unlock relic
    // Used by the shop, rest-node tinker button, and rest-node availability check.
    _availableDiceUpgrades() {
        const playerClass = this.player && this.player.classId;
        return Object.keys(DICE_UPGRADES).filter(key => {
            if (this.player.hasDiceUpgrade(key)) return false;
            const baseDie = DICE_TYPES[key];
            if (!baseDie) return false;
            // Gate: class dice belong only to their class; shared skills pass.
            if (baseDie.classId && baseDie.classId !== playerClass) return false;
            if (!baseDie.locked) return true;
            if (key === 'VOODOO' && this.player.hasRelic('voodoo_doll')) return true;
            if (key === 'OVERCHARGE' && this.player.hasRelic('overcharge_chip')) return true;
            if (key === 'RECKLESS_CHARGE' && this.player.hasRelic('reckless_drive')) return true;
            return false;
        });
    },

    renderShop() {
        const shopFragEl = document.getElementById('shop-frag-count');
        if(shopFragEl) shopFragEl.innerText = this.techFragments;

        // Refresh hack button state each render so affordability/used/disabled
        // stays in sync with fragment spending or hack attempts between buys.
        this._refreshHackButton();

        const grid = document.getElementById('shop-grid');
        grid.innerHTML = '';
        // Persist hack-outcome styling on the shop grid across re-renders so
        // every unpurchased cost chip glows green (win) or red (fail) until
        // the shop resets on the next visit.
        grid.classList.remove('hack-win', 'hack-fail');
        if (this._shopHackOutcome === 'hack-win') grid.classList.add('hack-win');
        else if (this._shopHackOutcome === 'hack-fail') grid.classList.add('hack-fail');

        if (!this.shopInventory) return;

        this.shopInventory.forEach(item => {
            const div = document.createElement('div');

            // 1. Already bought — compact confirmation card.
            if (item.purchased) {
                div.className = 'shop-item purchased';
                div.innerHTML = `<div style="text-align:center; display:flex; flex-direction:column; align-items:center; gap:6px;">
                    <div style="font-size:2.2rem;">✅</div>
                    <div class="neon-text-green" style="font-family: var(--font-cyber); letter-spacing:0.2em; font-size:0.85rem;">ACQUIRED</div>
                </div>`;
                grid.appendChild(div);
                return;
            }

            // Affordability tag — dims price if player can't pay (helps read at a glance).
            const unaffordable = (this.techFragments < item.cost);
            const affordClass = unaffordable ? ' unaffordable' : '';

            // 2. Available items.
            if (item.type === 'item') {
                div.className = `shop-item neon-border-gold${affordClass}`;
                div.innerHTML = `
                    <div class="shop-icon">${item.icon}</div>
                    <div class="shop-info">
                        <div class="neon-text-blue shop-title">${item.name}</div>
                        <div class="shop-desc">${item.desc}</div>
                    </div>
                    <div class="cost-tag">${item.cost} FRAGS</div>`;

                div.onclick = () => {
                    if (this.techFragments >= item.cost) {
                        this.techFragments -= item.cost;
                        try { localStorage.setItem('mvm_fragments', this.techFragments); } catch(e) {}
                        item.action();
                        item.purchased = true;
                        AudioMgr.playSound('buy');
                        this.saveGame();
                        this.renderShop();
                    } else {
                        div.style.borderColor = 'red';
                        setTimeout(() => div.style.borderColor = '', 200);
                    }
                };
            } else if (item.type === 'upgrade') {
                div.className = `shop-item neon-border-pink${affordClass}`;
                const discountBadge = item.isDiscount ? `<div class="discount-badge">-40%</div>` : '';
                const upgName = (DICE_TYPES[item.key] && DICE_TYPES[item.key].name) || item.key;

                div.innerHTML = `
                    ${discountBadge}
                    <div class="shop-icon">${item.icon}</div>
                    <div class="shop-info">
                        <div class="neon-text-gold shop-title">${item.name}</div>
                        <div class="shop-upgrades-line">UPGRADES · <b>${upgName}</b></div>
                        <div class="shop-desc">${item.desc}</div>
                    </div>
                    <div class="cost-tag">${item.cost} FRAGS</div>`;

                div.onclick = () => {
                    if (this.techFragments >= item.cost) {
                        this.techFragments -= item.cost;
                        try { localStorage.setItem('mvm_fragments', this.techFragments); } catch(e) {}
                        this.player.diceUpgrades.push(item.key);
                        item.purchased = true;
                        AudioMgr.playSound('upgrade');
                        this.saveGame();
                        this.renderShop();
                    } else {
                        div.style.borderColor = 'red';
                        setTimeout(() => div.style.borderColor = '', 200);
                    }
                };
            }
            grid.appendChild(div);
        });

        // Fusion panel: if any relic has 2+ un-fused copies, offer FUSE for 40 frags.
        this.renderFusionPanel(grid);
    },

    renderFusionPanel(grid) {
        if (!this.player || !this.player.relics) return;
        // Count un-fused copies per relic id.
        const counts = {};
        this.player.relics.forEach(r => {
            if (r.fused) return;
            counts[r.id] = (counts[r.id] || 0) + 1;
        });
        const fuseable = Object.keys(counts).filter(id => counts[id] >= 2);
        if (fuseable.length === 0) return;

        const cost = 40;
        fuseable.forEach(relicId => {
            const sample = this.player.relics.find(r => r.id === relicId && !r.fused);
            if (!sample) return;
            const div = document.createElement('div');
            div.className = 'shop-item shop-fuse neon-border-gold';
            div.innerHTML = `
                <div class="shop-icon" style="position:relative;">
                    ${sample.icon || ICONS.unknown}
                    <span style="position:absolute; bottom:-6px; right:-6px; background:var(--neon-gold); color:#000; border-radius:999px; padding:0 6px; font-family:var(--font-cyber); font-size:0.7rem; font-weight:900;">×2→★</span>
                </div>
                <div class="shop-info">
                    <div class="neon-text-gold shop-title">FUSE: ${sample.name}</div>
                    <div class="shop-desc">Consume 2 copies → 1 Supercharged variant (+50% effect).</div>
                    <div class="cost-tag">${cost} Frags</div>
                </div>`;
            div.onclick = () => {
                if (this.techFragments < cost) {
                    div.style.borderColor = 'red';
                    setTimeout(() => div.style.borderColor = '', 200);
                    return;
                }
                this.techFragments -= cost;
                // Remove ONE un-fused copy and mark a second as fused.
                const firstIdx = this.player.relics.findIndex(r => r.id === relicId && !r.fused);
                if (firstIdx >= 0) this.player.relics.splice(firstIdx, 1);
                const secondIdx = this.player.relics.findIndex(r => r.id === relicId && !r.fused);
                if (secondIdx >= 0) {
                    this.player.relics[secondIdx].fused = true;
                    this.player.relics[secondIdx].name = '★ ' + this.player.relics[secondIdx].name;
                }
                AudioMgr.playSound('buy');
                ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "FUSED", COLORS.GOLD);
                this.renderRelics();
                this.saveGame();
                this.renderShop();
            };
            grid.appendChild(div);
        });
    },

    // A fused relic counts as 3 effective stacks (a buff over owning 2 normal copies)
    // for multiplicative relic math (titan, crit_lens, stim_pack, loot_bot).
    stackCount(relicId) {
        if (!this.player || !this.player.relics) return 0;
        return this.player.relics
            .filter(r => r.id === relicId)
            .reduce((sum, r) => sum + (r.fused ? 3 : 1), 0);
    },

    leaveShop() {
        AudioMgr.playSound('click');
        this.shopInventory = null; 
        this.completeCurrentNode(); // ADD THIS
        this.changeState(STATE.MAP);
    },

    // --- INTEL & HEX BREACH SYSTEM ---

    // Render the enemy codex — one card per enemy name in ENEMIES + BOSS_DATA,
    // showing kill count from the Intel ledger and first-seen sector. Bosses
    // get a highlighted golden card. Unmet enemies show a silhouette.
    renderCodex() {
        const grid = document.getElementById('codex-grid');
        const totalEl = document.getElementById('codex-total');
        if (!grid) return;
        const killed = Intel.all();
        const total = Intel.total();
        if (totalEl) totalEl.textContent = String(total);

        // Build the full set: all ENEMIES + all bosses from BOSS_DATA.
        const entries = [];
        ENEMIES.forEach(e => entries.push({ name: e.name, sector: e.sector, boss: false }));
        Object.keys(BOSS_DATA).forEach(k => {
            const b = BOSS_DATA[k];
            entries.push({ name: b.name, sector: Number(k), boss: true, subtitle: b.subtitle });
        });

        grid.innerHTML = '';
        entries.forEach(e => {
            const n = killed[e.name] || 0;
            const unseen = n === 0;
            const card = document.createElement('div');
            card.className = `codex-card sector-${e.sector}${e.boss ? ' codex-boss' : ''}${unseen ? ' codex-unseen' : ''}`;
            card.innerHTML = `
                <div class="codex-name">${unseen ? '???' : e.name}</div>
                <div class="codex-meta">
                    <span class="codex-sector">SECTOR ${e.sector}</span>
                    <span class="codex-kills">${n} kill${n === 1 ? '' : 's'}</span>
                </div>
                ${e.boss ? `<div class="codex-sub">${unseen ? '[REDACTED]' : (e.subtitle || 'BOSS')}</div>` : ''}
            `;
            grid.appendChild(card);
        });
    },

    renderIntel() {
        document.getElementById('encrypted-count').innerText = this.encryptedFiles;
        const grid = document.getElementById('lore-grid');
        grid.innerHTML = '';

        LORE_DATABASE.forEach((entry, index) => {
            const isUnlocked = this.unlockedLore.includes(index);
            const el = document.createElement('div');
            el.className = `lore-node ${isUnlocked ? 'unlocked' : 'locked'}`;
            el.innerText = index + 1;

            if (isUnlocked) {
                el.onclick = (e) => {
                    AudioMgr.playSound('click');
                    TooltipMgr.show(entry, e.clientX, e.clientY);
                };
            }
            grid.appendChild(el);
        });

        const btnDecrypt = document.getElementById('btn-decrypt');
        if (this.encryptedFiles > 0) {
            btnDecrypt.disabled = false;
            btnDecrypt.style.opacity = 1;
            btnDecrypt.innerText = "DECRYPT (START BREACH)";
        } else {
            btnDecrypt.disabled = true;
            btnDecrypt.style.opacity = 0.5;
            btnDecrypt.innerText = "NO FILES";
        }

        // Intel 2.0: render the bestiary (kill ledger, in-place) and
        // chronicle (last 20 runs). Wire the tab bar once per open.
        this._renderIntelBestiary();
        this._renderIntelChronicle();
        this._wireIntelTabs();
    },

    /* Intel tab bar wiring (Roadmap Part 27). Delegates show/hide to the
       matching data-intel-pane element. Idempotent — safe to call on each
       intel screen open. */
    _wireIntelTabs() {
        const d = document;
        const tabs = d.querySelectorAll('.intel-tab');
        if (!tabs.length) return;
        tabs.forEach(tab => {
            tab.onclick = () => {
                const target = tab.dataset.intelTab;
                tabs.forEach(t => t.classList.toggle('active', t === tab));
                d.querySelectorAll('.intel-pane').forEach(p => {
                    p.classList.toggle('active', p.dataset.intelPane === target);
                });
                AudioMgr.playSound && AudioMgr.playSound('click');
            };
        });
    },

    _renderIntelBestiary() {
        const grid = document.getElementById('intel-bestiary-grid');
        const empty = document.getElementById('intel-bestiary-empty');
        if (!grid) return;
        grid.innerHTML = '';
        const kills = (typeof Intel !== 'undefined' && Intel.all) ? Intel.all() : {};
        const names = Object.keys(kills).filter(n => kills[n] > 0);
        if (!names.length) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        names.sort((a, b) => kills[b] - kills[a]);
        names.forEach(name => {
            const el = document.createElement('div');
            el.className = 'codex-entry intel-beast-entry';
            const count = kills[name];
            const tier = count >= 20 ? 'veteran' : count >= 10 ? 'seasoned' : count >= 5 ? 'logged' : 'new';
            el.innerHTML = `
                <div class="intel-beast-name">${name}</div>
                <div class="intel-beast-count">${count} KILL${count === 1 ? '' : 'S'}</div>
                <div class="intel-beast-tier intel-beast-tier-${tier}">${tier.toUpperCase()}</div>
            `;
            grid.appendChild(el);
        });
    },

    _renderIntelChronicle() {
        const list = document.getElementById('intel-chronicle-list');
        const empty = document.getElementById('intel-chronicle-empty');
        if (!list) return;
        list.innerHTML = '';
        let history = [];
        try { history = JSON.parse(localStorage.getItem('mvm_run_history') || '[]'); } catch (e) {}
        if (!Array.isArray(history) || !history.length) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        // Newest first
        history.slice().reverse().slice(0, 20).forEach(run => {
            const row = document.createElement('div');
            const won = run.result === 'win';
            row.className = 'intel-chronicle-row ' + (won ? 'run-won' : 'run-lost');
            const when = run.endedAt ? new Date(run.endedAt) : null;
            const whenStr = when ? `${when.toLocaleDateString()}` : '—';
            const dur = run.durationSeconds ? `${Math.floor(run.durationSeconds/60)}m ${run.durationSeconds%60}s` : '—';
            row.innerHTML = `
                <div class="intel-chronicle-result">${won ? 'WIN' : 'LOSS'}</div>
                <div class="intel-chronicle-main">
                    <div class="intel-chronicle-class">${(run.classId || 'unknown').toUpperCase()}</div>
                    <div class="intel-chronicle-meta">Sector ${run.sector || 1} · ${run.turnCount || 0} turns · ${run.fragments || 0} frag</div>
                    ${won ? '' : `<div class="intel-chronicle-cause">Defeated by ${run.defeatedBy || 'unknown'}</div>`}
                </div>
                <div class="intel-chronicle-aside">${whenStr}<br>${dur}</div>
            `;
            list.appendChild(row);
        });
    },

    /* Push a run record to history (Roadmap Part 27 Chronicle tab). Keeps
       the last 40 entries so the Intel chronicle always has enough data. */
    _logRunHistory(result, extra) {
        try {
            const now = Date.now();
            const start = this.runStartedAt || now;
            const record = {
                result: result,                                 // 'win' | 'loss'
                classId: this.player ? this.player.classId : null,
                sector: this.sector || 1,
                turnCount: this.turnCount || 0,
                fragments: this.techFragments || 0,
                defeatedBy: (extra && extra.defeatedBy) || (this.enemy && this.enemy.name) || null,
                endedAt: now,
                durationSeconds: Math.floor((now - start) / 1000)
            };
            let history = [];
            try { history = JSON.parse(localStorage.getItem('mvm_run_history') || '[]'); } catch (e) {}
            history.push(record);
            if (history.length > 40) history = history.slice(-40);
            localStorage.setItem('mvm_run_history', JSON.stringify(history));
        } catch (_) { /* non-critical */ }
    },

    /* =============================================================
       CUSTOM RUNS (Roadmap Part 29)
       Selection lives in this.customRunModifiers (Set of ids). Only
       visible once Ascension 1+ unlocked. Feature flag
       FEATURE_CUSTOM_RUNS gates the bar visibility independently so
       balance playtesting can opt in without code edits. The effect
       applier is minimal for now — covers the safe handful of
       modifiers (startHpPct, disableRest, extraRerollPerTurn,
       diceCount, shopDiscountPct). Deeper modifiers wait for
       Milestone 4.
       ============================================================= */
    _renderCustomRunBar() {
        const bar = document.getElementById('custom-run-bar');
        if (!bar) return;
        const gated = !FEATURE_CUSTOM_RUNS
            || !(typeof Ascension !== 'undefined' && Ascension.getUnlocked && Ascension.getUnlocked() >= 1);
        bar.classList.toggle('hidden', gated);
        if (gated) return;
        if (!this.customRunModifiers) this.customRunModifiers = new Set();
        const count = this.customRunModifiers.size;
        const summary = document.getElementById('custom-run-bar-summary');
        if (summary) {
            if (count === 0) summary.textContent = 'Standard run';
            else summary.textContent = `${count} modifier${count === 1 ? '' : 's'} · Net ${this._computeCustomRunNetPct()}%`;
        }
    },
    _computeCustomRunNetPct() {
        if (!this.customRunModifiers) return 100;
        let delta = 0;
        this.customRunModifiers.forEach(id => {
            const m = CUSTOM_RUN_MODIFIERS.find(x => x.id === id);
            if (m) delta += (m.payoutBonus || 0);
        });
        return Math.max(5, 100 + delta);
    },
    _openCustomRunModal() {
        const modal = document.getElementById('custom-run-modal');
        if (!modal) return;
        if (!this.customRunModifiers) this.customRunModifiers = new Set();
        ['negative', 'chaotic', 'positive'].forEach(kind => {
            const grid = modal.querySelector(`.custom-run-grid[data-kind="${kind}"]`);
            if (!grid) return;
            grid.innerHTML = '';
            CUSTOM_RUN_MODIFIERS.filter(m => m.kind === kind).forEach(m => {
                const card = document.createElement('button');
                card.className = 'custom-run-card';
                card.dataset.modId = m.id;
                if (this.customRunModifiers.has(m.id)) card.classList.add('selected');
                const bonus = m.payoutBonus > 0 ? `+${m.payoutBonus}%` : `${m.payoutBonus}%`;
                card.innerHTML = `
                    <div class="custom-run-card-name">${m.name}</div>
                    <div class="custom-run-card-desc">${m.desc}</div>
                    <div class="custom-run-card-bonus">${bonus} payout</div>
                `;
                card.onclick = () => {
                    if (this.customRunModifiers.has(m.id)) this.customRunModifiers.delete(m.id);
                    else this.customRunModifiers.add(m.id);
                    card.classList.toggle('selected');
                    this._refreshCustomRunNet();
                };
                grid.appendChild(card);
            });
        });
        this._refreshCustomRunNet();
        modal.classList.remove('hidden');
    },
    _closeCustomRunModal() {
        const modal = document.getElementById('custom-run-modal');
        if (modal) modal.classList.add('hidden');
        this._renderCustomRunBar();
    },
    _refreshCustomRunNet() {
        const netEl = document.getElementById('custom-run-net');
        if (netEl) netEl.textContent = `${this._computeCustomRunNetPct()}%`;
    },
    _clearCustomRunModifiers() {
        if (!this.customRunModifiers) this.customRunModifiers = new Set();
        this.customRunModifiers.clear();
        const modal = document.getElementById('custom-run-modal');
        if (modal) modal.querySelectorAll('.custom-run-card.selected').forEach(c => c.classList.remove('selected'));
        this._refreshCustomRunNet();
    },
    _wireCustomRunEvents() {
        const btnOpen = document.getElementById('btn-custom-run');
        if (btnOpen) btnOpen.onclick = () => this._openCustomRunModal();
        const btnApply = document.getElementById('btn-custom-run-apply');
        if (btnApply) btnApply.onclick = () => this._closeCustomRunModal();
        const btnClear = document.getElementById('btn-custom-run-clear');
        if (btnClear) btnClear.onclick = () => this._clearCustomRunModifiers();
    },
    /* Apply selected modifiers to the run. Called from selectClass after
       player is constructed. Effect flags are stored on the Game object
       (prefixed `_custom…`) and read by the relevant systems at the
       points where they bite (rest handler, reroll gate, damage calc,
       shop pricing, boss spawn, relic add, turn start). Stat edits that
       only matter at run-start are applied here directly. */
    _applyCustomRunModifiers() {
        if (!this.customRunModifiers || !this.customRunModifiers.size) return;
        const active = Array.from(this.customRunModifiers)
            .map(id => CUSTOM_RUN_MODIFIERS.find(m => m.id === id))
            .filter(Boolean);
        this._customRunActive = active;
        if (!this.player) return;
        // Reset transient flags so replaying a run without some modifiers
        // doesn't inherit their effects from the previous attempt.
        this._customDisableRest = false;
        this._customDisableReroll = false;
        this._customDmgOutMult = 1;
        this._customDmgInMult = 1;
        this._customBossHpMult = 1;
        this._customShopDiscount = 0;
        this._customFragDrainPerSector = 0;
        this._customRelicPickDmg = 0;
        this._customHotHandsDmg = 0;
        this._customHideIntentNumbers = false;
        this._customCritVariance = null;
        this._customDisableLore = false;
        this._customRelicPickDupe = false;
        active.forEach(m => {
            if (m.startHpPct && this.player.maxHp) {
                this.player.currentHp = Math.max(1, Math.floor(this.player.maxHp * m.startHpPct));
            }
            if (m.diceCount && this.player.traits) {
                this.player.traits.diceCount = m.diceCount;
            }
            if (m.extraRerollPerTurn) {
                this.player._customExtraRerolls = (this.player._customExtraRerolls || 0) + m.extraRerollPerTurn;
            }
            if (m.disableRest)          this._customDisableRest = true;
            if (m.disableReroll)        this._customDisableReroll = true;
            if (m.dmgOutMult)           this._customDmgOutMult *= m.dmgOutMult;
            if (m.dmgInMult)            this._customDmgInMult *= m.dmgInMult;
            if (m.bossHpMult)           this._customBossHpMult *= m.bossHpMult;
            if (m.shopDiscountPct)      this._customShopDiscount = Math.max(this._customShopDiscount, m.shopDiscountPct);
            if (m.fragDrainPerSector)   this._customFragDrainPerSector = Math.max(this._customFragDrainPerSector, m.fragDrainPerSector);
            if (m.relicPickDmg)         this._customRelicPickDmg = Math.max(this._customRelicPickDmg, m.relicPickDmg);
            if (m.hotHandsDmg)          this._customHotHandsDmg = Math.max(this._customHotHandsDmg, m.hotHandsDmg);
            if (m.hideIntentNumbers)    this._customHideIntentNumbers = true;
            if (m.attackCritVariance)   this._customCritVariance = m.attackCritVariance;
            if (m.disableLore)          this._customDisableLore = true;
            if (m.relicPickDupe)        this._customRelicPickDupe = true;
            // Starter relic pack: seed N relics from the regular pool.
            // Excludes 'instant' items (consumables that just stat-bump),
            // corrupted-tier entries, and gold-rarity relics so the starter
            // set stays to "common / neutral" as the modifier implies.
            if (m.startRelicCount && typeof UPGRADES_POOL !== 'undefined') {
                const eligible = UPGRADES_POOL.filter(r =>
                    r && !r.instant && r.rarity !== 'gold' && r.rarity !== 'red' && r.rarity !== 'corrupted');
                for (let i = 0; i < m.startRelicCount && eligible.length > 0; i++) {
                    const pick = eligible[Math.floor(Math.random() * eligible.length)];
                    if (pick && this.player.addRelic) {
                        this.player.addRelic({ id: pick.id, name: pick.name, desc: pick.desc, icon: pick.icon });
                    }
                }
            }
        });
        if (this._customDisableReroll) this.rerolls = 0;
        if (this._customHideIntentNumbers) {
            document.body.classList.add('custom-hide-intents');
        } else {
            document.body.classList.remove('custom-hide-intents');
        }
    },

    startHexBreach() {
        if (this.encryptedFiles <= 0) return;
        
        this.changeState(STATE.HEX);
        this.hex = {
            round: 1,
            maxRounds: Math.floor(Math.random() * 3) + 3, 
            sequence: [],
            playerInput: [],
            acceptingInput: false
        };
        
        this.renderHexGrid();
        setTimeout(() => this.nextHexRound(), 1000);
    },

    renderHexGrid() {
        const grid = document.getElementById('hex-grid');
        grid.innerHTML = '';
        document.getElementById('hex-round').innerText = this.hex.round;
        document.getElementById('hex-max-round').innerText = this.hex.maxRounds;

        this.hex.nodes = [];
        this.hex.lives = 1; 
        
        const colors = [
            '#ff0000', '#00ff00', '#0088ff', '#ffff00', '#00ffff', 
            '#ff00ff', '#ff8800', '#ccff00', '#9900ff'
        ];

        const w = 300; 
        const h = 350; 
        const size = 60; 
        
        const cols = 3;
        const cellW = w / cols;
        const cellH = h / cols; // 3x3

        for(let i=0; i<9; i++) {
            const btn = document.createElement('div');
            btn.className = 'hex-btn';
            btn.id = `hex-${i}`;
            btn.innerHTML = `<div style="font-size:2rem; pointer-events:none;">⬡</div>`;
            
            // --- NEW: Set CSS Variable for colors ---
            btn.style.setProperty('--node-color', colors[i]);
            
            // Initial styling
            btn.style.color = colors[i];
            btn.style.borderColor = colors[i];
            btn.style.boxShadow = `0 0 5px ${colors[i]}`;
            btn.style.opacity = "0.7";

            // Grid-based random position
            let cx = (i % cols) * cellW + cellW/2;
            let cy = Math.floor(i / cols) * cellH + cellH/2;
            
            let x = cx - size/2 + (Math.random()-0.5)*15;
            let y = cy - size/2 + (Math.random()-0.5)*15;
            
            // Slower velocity to prevent chaos
            let vx = (Math.random() - 0.5) * 15; 
            let vy = (Math.random() - 0.5) * 15;

            this.hex.nodes.push({
                id: i,
                el: btn,
                x: x, y: y,
                vx: vx, vy: vy,
                color: colors[i],
                size: size
            });
            
            btn.style.transform = `translate(${x}px, ${y}px)`;
            btn.onclick = () => this.handleHexInput(i);
            grid.appendChild(btn);
        }
    },

updateHexBreach(dt) {
        if (this.currentState !== STATE.HEX || !this.hex.nodes || this.hex.showingSequence) return;
        
        const w = 300;
        const h = 350;
        const padding = 65; // Slightly larger than size (60) to keep gap
        
        // 1. Movement & Wall Bounce
        this.hex.nodes.forEach(node => {
            node.x += node.vx * dt;
            node.y += node.vy * dt;

            if (node.x <= 0) { node.x = 0; node.vx *= -1; }
            if (node.x >= w - node.size) { node.x = w - node.size; node.vx *= -1; }
            if (node.y <= 0) { node.y = 0; node.vy *= -1; }
            if (node.y >= h - node.size) { node.y = h - node.size; node.vy *= -1; }
        });

        // 2. Collision Resolution (Prevent Overlap)
        for (let i = 0; i < this.hex.nodes.length; i++) {
            for (let j = i + 1; j < this.hex.nodes.length; j++) {
                let n1 = this.hex.nodes[i];
                let n2 = this.hex.nodes[j];

                let dx = n2.x - n1.x;
                let dy = n2.y - n1.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < padding) {
                    // Normalize vector
                    let angle = Math.atan2(dy, dx);
                    let tx = Math.cos(angle);
                    let ty = Math.sin(angle);

                    // Push apart
                    let overlap = (padding - dist) * 0.5; // Half overlap each
                    
                    n1.x -= tx * overlap;
                    n1.y -= ty * overlap;
                    n2.x += tx * overlap;
                    n2.y += ty * overlap;

                    // Bounce velocities (swap roughly)
                    let tempVx = n1.vx;
                    let tempVy = n1.vy;
                    n1.vx = n2.vx;
                    n1.vy = n2.vy;
                    n2.vx = tempVx;
                    n2.vy = tempVy;
                }
            }
        }

        // 3. Apply Transform
        this.hex.nodes.forEach(node => {
            node.el.style.transform = `translate(${node.x}px, ${node.y}px)`;
        });
    },

    async nextHexRound() {
        this.hex.playerInput = [];
        this.hex.acceptingInput = false;
        this.hex.showingSequence = true; 
        
        document.getElementById('hex-status').innerText = "OBSERVE PATTERN";
        document.getElementById('hex-status').className = "neon-text-blue";
        
        if (!this.hex.retrying) {
            this.hex.sequence.push(Math.floor(Math.random() * 9));
        }
        this.hex.retrying = false;
        
        document.getElementById('hex-round').innerText = this.hex.sequence.length;

        await this.sleep(500);

        for (let i = 0; i < this.hex.sequence.length; i++) {
            const id = this.hex.sequence[i];
            const node = this.hex.nodes[id];
            
            // Activate Class (Triggers CSS Glow Animation)
            node.el.classList.add('active');
            
            AudioMgr.playSound('mana');
            await this.sleep(600); 
            
            // Deactivate
            node.el.classList.remove('active');
            
            await this.sleep(200); 
        }

        this.hex.showingSequence = false; 
        this.hex.acceptingInput = true;
        document.getElementById('hex-status').innerText = "REPEAT PATTERN";
        document.getElementById('hex-status').className = "neon-text-green";
    },

    handleHexInput(index) {
        if (!this.hex.acceptingInput) return;

        const node = this.hex.nodes[index];
        
        // Visual Feedback
        node.el.classList.add('active');
        // Remove class quickly for tap feedback
        setTimeout(() => {
            node.el.classList.remove('active');
        }, 200);
        
        AudioMgr.playSound('click');

        const currentStep = this.hex.playerInput.length;
        if (index === this.hex.sequence[currentStep]) {
            this.hex.playerInput.push(index);
            
            if (this.hex.playerInput.length === this.hex.sequence.length) {
                if (this.hex.sequence.length >= this.hex.maxRounds) {
                    this.winHexBreach();
                } else {
                    this.hex.round++;
                    this.hex.acceptingInput = false;
                    setTimeout(() => this.nextHexRound(), 1000);
                }
            }
        } else {
            // WRONG INPUT
            if (this.hex.lives > 0) {
                this.hex.lives--;
                this.hex.retrying = true;
                this.hex.acceptingInput = false;
                
                document.getElementById('hex-status').innerText = "ERROR! RETRYING...";
                document.getElementById('hex-status').className = "neon-text-orange";
                AudioMgr.playSound('defend'); 
                
                // Shake effect
                node.el.style.borderColor = 'red';
                node.el.style.boxShadow = '0 0 20px red';
                setTimeout(() => {
                    node.el.style.borderColor = node.color;
                    node.el.style.boxShadow = `0 0 5px ${node.color}`;
                }, 500);

                setTimeout(() => this.nextHexRound(), 1500);
            } else {
                this.failHexBreach(node.el);
            }
        }
    },

    winHexBreach() {
        this.hex.acceptingInput = false;
        document.getElementById('hex-status').innerText = "DECRYPTION SUCCESSFUL";
        AudioMgr.playSound('upgrade');
        
        this.encryptedFiles--;
        this.techFragments += 300;
        
        const available = LORE_DATABASE.map((_, i) => i).filter(i => !this.unlockedLore.includes(i));
        let msg = "300 Fragments Acquired.";

        // Custom Run: Silent Chronicle — no lore unlocks this run.
        if (this._customDisableLore) {
            msg += "\nDATABASE ACCESS DENIED (SILENT CHRONICLE)";
        } else if (available.length > 0) {
            const unlockId = available[Math.floor(Math.random() * available.length)];
            this.unlockedLore.push(unlockId);
            msg += "\nNEW DATABASE ENTRY UNLOCKED.";
        } else {
            msg += "\n(Database Complete)";
        }

        this.saveData(); 
        
        setTimeout(() => {
            alert(msg); 
            this.changeState(STATE.INTEL);
        }, 1000);
    },

    failHexBreach(el) {
        this.hex.acceptingInput = false;
        el.classList.add('error');
        AudioMgr.playSound('explosion');
        document.getElementById('hex-status').innerText = "BREACH DETECTED - FILE PURGED";
        document.getElementById('hex-status').className = "neon-text-pink";
        
        this.encryptedFiles--;
        this.saveData();

        setTimeout(() => {
            this.changeState(STATE.INTEL);
        }, 1500);
    },

    saveData() {
        try {
            localStorage.setItem('mvm_fragments', this.techFragments);
            localStorage.setItem('mvm_encrypted', this.encryptedFiles);
            localStorage.setItem('mvm_lore', JSON.stringify(this.unlockedLore));
        } catch(e) {}
    },

// NEW: Cinematic Phase Banner
    showPhaseBanner(text, subtext, variantOrOpts) {
        const opts = (typeof variantOrOpts === 'string') ? { variant: variantOrOpts } : (variantOrOpts || {});
        const variant = opts.variant || 'player';
        if (variant === 'boss' || variant === 'warning') {
            return this._showDramaticBanner(text, subtext, variant, opts);
        }

        const duration = opts.duration ?? 2200;
        const exitMs = opts.exitMs ?? 600;
        AudioMgr.duck(0.12, duration + exitMs + 100);
        return new Promise(resolve => {
            const banner = document.getElementById('phase-banner');
            const txt = banner.querySelector('.banner-text');
            const sub = banner.querySelector('.banner-sub');

            banner.className = '';
            banner.classList.add(variant === 'player' ? 'player-phase' : 'enemy-phase');
            txt.innerText = text;
            sub.innerText = subtext;

            void banner.offsetWidth;
            banner.classList.add('active');
            AudioMgr.playSound('mana');

            setTimeout(() => {
                banner.classList.add('exit');
                setTimeout(() => {
                    // Snap back off-screen without animating the slide-back across the screen.
                    banner.style.transition = 'none';
                    banner.classList.remove('active', 'exit');
                    void banner.offsetWidth;
                    banner.style.transition = '';
                    resolve();
                }, exitMs);
            }, duration);
        });
    },

    _showDramaticBanner(text, subtext, variant, opts = {}) {
        const isBoss = variant === 'boss';
        const duration = opts.duration ?? (isBoss ? 3800 : 2800);
        const exitMs = opts.exitMs ?? (isBoss ? 850 : 700);

        AudioMgr.duck(0.12, duration + exitMs + 100);
        AudioMgr.playSound(isBoss ? 'grid_fracture' : 'hex_barrier');

        return new Promise(resolve => {
            const host = document.getElementById('game-container') || document.body;
            const tint = document.createElement('div');
            tint.className = `dramatic-tint ${variant}-tint`;
            host.appendChild(tint);

            const bn = document.createElement('div');
            bn.className = `dramatic-banner ${variant}-banner`;
            const safeText = String(text).replace(/</g, '&lt;');
            const safeSub = String(subtext).replace(/</g, '&lt;');
            bn.innerHTML = `<div class="db-text">${safeText}</div><div class="db-sub">${safeSub}</div>`;
            host.appendChild(bn);

            void tint.offsetWidth;
            tint.classList.add('active');
            bn.classList.add('active');

            setTimeout(() => {
                tint.classList.add('exit');
                bn.classList.add('exit');
                setTimeout(() => {
                    tint.remove();
                    bn.remove();
                    resolve();
                }, exitMs);
            }, duration);
        });
    },

async startCombat(type) {
        // --- CLEANUP PHASE ---
        this.enemy = null;
        this.effects = [];
        ParticleSys.clear();
        CombatLog.clear();
        this.player.minions = [];
        this._ensureDailyChip();
        // Per-combat trackers used by new relics and combos.
        this.firstAttackDealt = false;
        this.firstDefendUsedThisTurn = false;
        this.freeRerollUsedThisTurn = false;
        this._echoChamberUsedThisCombat = false;

        Analytics.emit('combat_start', { sector: this.sector, type: type || 'normal' });
        // Kick the sector's ambient drone. Cheap synth loop; stops on win/lose.
        AudioMgr.startSectorAmbient && AudioMgr.startSectorAmbient(this.sector);

        // Register this run's class signature die (tier follows sector progress)
        this._syncSignatureDie();
        this._sigThornsActive = false;
        
        const sectorDisplay = document.getElementById('sector-display');
        if(sectorDisplay) sectorDisplay.innerText = `SECTOR ${this.sector}`;

        this.turnCount = 0;
        this.deadMinionsThisTurn = 0;
        this.player.emergencyKitUsed = false;
        this.player.firewallTriggered = false;
        this.player._panopticonNullifyFirst = false;
        
        const isBoss = type === 'boss';
        const isElite = type === 'elite';
        
        // --- ENEMY GENERATION ---
        let template;
        
        if (isBoss) {
            template = BOSS_DATA[this.sector] || BOSS_DATA[1];
        } else {
            let pool = ENEMIES.filter(e => e.sector === this.sector);
            if (pool.length === 0) pool = ENEMIES.filter(e => e.sector === 3); 
            if (pool.length === 0) pool = ENEMIES.filter(e => e.sector === 1); 
            template = pool[Math.floor(Math.random() * pool.length)];
        }

        let level = 1; 
        if(isElite) level = 2; 

        // UPDATED: Linear Scaling (+20% per sector)
        let sectorMult = 1.0 + ((this.sector - 1) * 0.2);

        // Ascension Scaling — player-facing ladder (legacy corruptionLevel kept as fallback)
        const ascLevel = (Ascension.getSelected() || 0);
        const ascEffects = Ascension.activeEffects(ascLevel);
        // Combine the legacy +20% and the new ladder's enemyHpMult; ladder takes precedence
        const ascensionMult = ascEffects.enemyHpMult * (1 + (this.corruptionLevel * 0.2));
        const ascensionDmgMult = ascEffects.enemyDmgMult;
        // Cache for use elsewhere this combat
        this._ascEffects = ascEffects;

        // Create New Enemy
        this.enemy = new Enemy(template, level, isElite);

        // Pre-combat briefing — one-liner that frames the fight. Skipped
        // during the scripted tutorial combat so the onboarding flow isn't
        // interrupted. Class briefing moved to AFTER state transitions to
        // COMBAT so it never renders while the sector map is still visible.
        if (this.currentState !== STATE.TUTORIAL_COMBAT) {
            try { this._showCombatBriefing(this.enemy); } catch (e) { /* swallow */ }
        }

        // Custom Run: Soft Bosses — boss HP globally reduced. Applied
        // BEFORE the assist drop so the two stack multiplicatively.
        if (this.enemy.isBoss && this._customBossHpMult && this._customBossHpMult !== 1) {
            this.enemy.maxHp = Math.max(1, Math.floor(this.enemy.maxHp * this._customBossHpMult));
            this.enemy.currentHp = this.enemy.maxHp;
        }

        // Sector signature mechanic — Part 23. Cached on Game for the life
        // of the combat; cleared on combat end so the map/menu don't get
        // blamed for stray effects. Bosses + tutorial skip the effect so
        // scripted moments stay clean.
        const sectorMech = SECTOR_MECHANICS[this.sector];
        const mechPill = document.getElementById('sector-mech-pill');
        // Only surface the pill when the sector actually changes combat —
        // Sector 1 is labelled "Standard Ops" with no effect fields, so
        // showing that pill is visual noise for an empty rule.
        const hasRealMech = !!(sectorMech && (
            sectorMech.enemyShieldBonus || sectorMech.playerHeatDmg ||
            sectorMech.minionDmgMult || sectorMech.damageNoiseRange
        ));
        if (sectorMech && this.currentState !== STATE.TUTORIAL_COMBAT) {
            this._activeSectorMech = sectorMech;
            if (mechPill) mechPill.textContent = hasRealMech ? (sectorMech.label || '') : '';
            if (sectorMech.enemyShieldBonus && !this.enemy.isBoss) {
                this.enemy.shield = (this.enemy.shield || 0) + sectorMech.enemyShieldBonus;
                if (Array.isArray(this.enemy.minions)) {
                    this.enemy.minions.forEach(m => {
                        if (m) m.shield = (m.shield || 0) + sectorMech.enemyShieldBonus;
                    });
                }
            }
        } else {
            this._activeSectorMech = null;
            if (mechPill) mechPill.textContent = '';
        }

        // Dynamic difficulty assist (§3.3) — if the player has lost to this
        // sector's boss 3+ times in a row (and they're not on any Ascension)
        // silently drop boss HP 10% and flag the boss so the UI can render
        // a visible "adaptive" badge. Never hidden from the player.
        if (this.enemy.isBoss && !this.assistDisabled) {
            const ascLevel = (typeof Ascension !== 'undefined' && Ascension.getSelected) ? Ascension.getSelected() : 0;
            const mult = Assist.hpMultiplier(this.sector, ascLevel);
            if (mult !== 1.0) {
                this.enemy.maxHp = Math.floor(this.enemy.maxHp * mult);
                this.enemy.currentHp = this.enemy.maxHp;
                this.enemy.assistActive = true;
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 220, "ADAPTIVE MODE", "#88eaff");
            }
        }
        
        // Tesseract Prime Logic
        if (this.enemy.name === "TESSERACT PRIME") {
            this.enemy.invincibleTurns = 3;
            setTimeout(() => {
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 200, "SHIELDS ACTIVE (3 TURNS)", "#00f3ff");
            }, 1000);
            
            AudioMgr.bossSilence = true;
            AudioMgr.fadeMusicOut(600);
        }

        // --- PANOPTICON: "Analyse" nullify mechanic ---
        if (this.enemy.name === "THE PANOPTICON") {
            this.enemy.analyzing = false;
            this.enemy.analyzeCooldown = 2 + Math.floor(Math.random() * 4); // 2..5 turns
        }

        // --- NULL_POINTER: Pull of Void / Void Spawns / Void Crush ---
        if (this.enemy.name === "NULL_POINTER") {
            this.enemy.voidPullCount = 0;
            this.enemy.voidCrushTriggered = false;
            this.enemy.voidCrushTurns = 0;
        }

        // --- NEW: THE COMPILER LOGIC (Armor Plated) ---
        if (this.enemy.name === "THE COMPILER") {
            this.enemy.armorPlating = 10;
            setTimeout(() => {
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 200, "ARMOR PLATED (10)", "#ffaa00");
            }, 1000);
        }
        // ----------------------------------------------

        // --- UPDATED SCALING LOGIC ---
        if (isBoss) {
            // Bosses scale with Ascension HP ladder + bossHpMult twist
            this.enemy.maxHp = Math.floor(this.enemy.maxHp * ascensionMult * ascEffects.bossHpMult);
            this.enemy.baseDmg = Math.floor(this.enemy.baseDmg * ascensionDmgMult);
        } else {
            // Regular/Elite: Base * 2.0 * Sector * Ascension
            this.enemy.maxHp = Math.floor(this.enemy.maxHp * 2.0 * sectorMult * ascensionMult);
            this.enemy.baseDmg = Math.floor(this.enemy.baseDmg * sectorMult * ascensionDmgMult);
            // Elite "as bosses" (Ascension 9) — bonus HP & dmg
            if (isElite && ascEffects.elitesAsBosses) {
                this.enemy.maxHp = Math.floor(this.enemy.maxHp * 1.5);
                this.enemy.baseDmg = Math.floor(this.enemy.baseDmg * 1.3);
            }
            // Enemy starting shield (Ascension 8)
            if (ascEffects.enemyShieldStart > 0) {
                this.enemy.shield = ascEffects.enemyShieldStart;
            }
        }

        this.enemy.currentHp = this.enemy.maxHp;

        // Entropy: -20% enemy starting HP (applied AFTER ascension/sector scaling, before glitch mods).
        if (this.player && this.player.hasRelic('c_entropy')) {
            this.enemy.maxHp = Math.max(1, Math.floor(this.enemy.maxHp * 0.8));
            this.enemy.currentHp = this.enemy.maxHp;
        }

        // Apply Glitch Modifiers
        if (this.corruptionLevel > 0 && !isBoss) {
            if (Math.random() < (0.3 + this.corruptionLevel * 0.1)) {
                const mod = GLITCH_MODIFIERS[Math.floor(Math.random() * GLITCH_MODIFIERS.length)];
                this.enemy.affixes.push(mod.id);
                this.enemy.glitchMod = mod; 
                setTimeout(() => {
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 180, `⚠️ ${mod.name}`, "#ff00ff");
                }, 800);
            }
        }
        
        this.player.mana = this.player.baseMana;
        // Reset per-combat class-rework counters so they don't leak across fights.
        this.player.bloodTier = 0;
        this.player.qteRerolls = 0;
        this.player.bonusDrawNextTurn = 0;
        this.player._lastDamageDealt = 0;

        // Expansion (5.2.1) — Drone Swarmling & friends spawn extra minions on combat open.
        if (this.enemy && template && template.summonOnStart > 0) {
            for (let i = 0; i < template.summonOnStart; i++) {
                const s = new Minion(this.enemy.x + (i === 0 ? -140 : 140), this.enemy.y + 60, this.enemy.minions.length + 1, false, 1);
                s.name = "Swarmling";
                s.maxHp = Math.max(10, Math.floor(this.enemy.maxHp * 0.5));
                s.currentHp = s.maxHp;
                s.dmg = Math.max(2, Math.floor(this.enemy.baseDmg * 0.8));
                s.spawnTimer = 1.0;
                this.enemy.minions.push(s);
            }
        }

        // Sector 4 — Hive Resonance. Enemy minions (including any already
        // assigned in the constructor or spawned above) hit harder here.
        // Done after summonOnStart so newly-minted minions get the bump too.
        if (this._activeSectorMech && this._activeSectorMech.minionDmgMult
                && Array.isArray(this.enemy.minions)) {
            const mult = this._activeSectorMech.minionDmgMult;
            this.enemy.minions.forEach(m => {
                if (m && typeof m.dmg === 'number') m.dmg = Math.max(1, Math.floor(m.dmg * mult));
            });
        }

        if(this.player.traits.startMinions) {
            for(let i=0; i<this.player.traits.startMinions; i++) {
                const m = new Minion(0, 0, this.player.minions.length + 1, true);
                if(this.player.traits.startShield) m.addShield(10); 
                this.player.minions.push(m);
            }
        }

        const coreStacks = this.player.relics.filter(r => r.id === 'minion_core').length;
        for(let i=0; i<coreStacks; i++) {
            const m = new Minion(0, 0, this.player.minions.length + 1, true);
            m.addShield(5);
            this.player.minions.push(m);
        }

        // Relic: BAIT DRONE — fragile decoy (1 HP) redirects first attack.
        if (this.player.hasRelic('bait_drone')) {
            const bait = new Minion(0, 0, this.player.minions.length + 1, true);
            bait.name = "Bait Drone";
            bait.maxHp = 1; bait.currentHp = 1; bait.dmg = 0;
            bait.isDecoy = true;
            this.player.minions.push(bait);
        }
        // Relic: NANO FORGE — spawn free class-minion at +50% stats.
        // Name keeps the class minionName so the renderer (which dispatches
        // on entity.name.includes('Wisp'|'Bomb'|'Pawn'|...)) draws the right
        // sprite for the active class instead of always picking the Wisp.
        if (this.player.hasRelic('nano_forge')) {
            const forge = new Minion(0, 0, this.player.minions.length + 1, true);
            forge.name = "Forged " + forge.name;
            forge.maxHp = Math.floor(forge.maxHp * 1.5); forge.currentHp = forge.maxHp;
            forge.dmg = Math.floor(forge.dmg * 1.5);
            this.player.minions.push(forge);
        }

        // Setup Minions
        if (isElite) {
             const m1 = new Minion(0, 0, 1, false, 2); 
             const m2 = new Minion(0, 0, 2, false, 2);
             
             // Apply same scaling to elite minions
             const minionScale = sectorMult * ascensionMult;
             
             m1.maxHp = Math.floor(m1.maxHp * minionScale); m1.currentHp = m1.maxHp;
             m2.maxHp = Math.floor(m2.maxHp * minionScale); m2.currentHp = m2.maxHp;
             m1.dmg = Math.floor(m1.dmg * minionScale);
             m2.dmg = Math.floor(m2.dmg * minionScale);
             
             this.enemy.minions.push(m1, m2);
             ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "ELITE PROTOCOL", "#f00");
             
             this.enemy.affixes.forEach((affix, i) => {
                 if (this.enemy.glitchMod && affix === this.enemy.glitchMod.id) return;
                 setTimeout(() => {
                     ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 150 - (i*30), `⚠️ ${affix}`, COLORS.ORANGE);
                 }, i * 500);
             });
        }

        if (isBoss && this.sector === 1) {
             const m1 = new Minion(0, 0, 1, false, 3);
             const m2 = new Minion(0, 0, 2, false, 3);
             this.enemy.minions.push(m1, m2);
             ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "GUARDIANS ACTIVE", "#f00");
        }

        if (isBoss && this.sector === 5) {
             const m1 = new Minion(0, 0, 1, false, 3);
             m1.name = "Glitch Alpha"; m1.maxHp = 100; m1.currentHp = 100; m1.dmg = 5;
             const m2 = new Minion(0, 0, 2, false, 3);
             m2.name = "Glitch Beta"; m2.maxHp = 100; m2.currentHp = 100; m2.dmg = 5;
             this.enemy.minions.push(m1, m2);
             ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "REALITY FRACTURE", "#ffffff");
        }

        this.player.spawnTimer = 1.0;
        this.player.minions.forEach(m => m.spawnTimer = 1.0);
        this.enemy.spawnTimer = 1.0;
        this._enemyMinions().forEach(m => m.spawnTimer = 1.0);

        this.changeState(STATE.COMBAT);

        // Class briefing — fires ONCE per class, AFTER the combat scene is
        // fully up so it doesn't overlay the sector map. Skipped during the
        // scripted tutorial combat.
        if (this.currentState === STATE.COMBAT && this.player && this.player.classId) {
            try { await ClassBriefing.show(this.player.classId); } catch (e) { /* swallow */ }
        }

        if (isBoss) {
            // Cinematic: screen darken + camera zoom pulse + slow-mo + low-end
            // sting + charge sparks, then banner with subtitle. Beat order
            // timed so audio, zoom, and banner land together.
            this.triggerSlowMo(0.35, 1.4);
            this.triggerBossZoom && this.triggerBossZoom();
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(10,0,16,0.55)', 600);
            try {
                AudioMgr.playSound('grid_fracture');
                setTimeout(() => { try { AudioMgr.playSound('earthquake'); } catch(e){} }, 250);
            } catch (e) {}
            ParticleSys.createShockwave(this.enemy.x, this.enemy.y, '#ff0055', 64);
            ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 56, '#ffd700');
            ParticleSys.createSparks(this.enemy.x, this.enemy.y, '#ff0055', 24);
            Game.shake(32);
            await this.sleep(450);
            await this.showPhaseBanner(this.enemy.name, this.enemy.bossData.subtitle, 'boss');
            Hints.trigger('first_boss');
        }

        await this.sleep(500);

        this.enemy.decideTurn();
        ClassAbility.startCombat();
        // Stamp the moment we hand control to the player so endTurn can
        // reject rogue calls during the combat-entry hand-off. Mobile taps
        // on the map node can momentarily land on the newly-positioned
        // END TURN button if the click dispatches before the layout
        // finishes settling, which caused combats to "auto-skip turn 1".
        this._combatStartedAt = Date.now();
        this.startTurn();
    },

async startTurn() {
      try {
        this.inputLocked = true;
        this.recycleBinCount = 0;
        // Custom Run: reset the per-turn flag for the Hot Hands modifier
        // (first die played each turn costs HP).
        this._hotHandsUsedThisTurn = false;
        // Relic: VOLT PRIMER resets each turn so the first attack gets the
        // +5 flat DMG bonus.
        this._voltPrimerUsedThisTurn = false;

        await this.showPhaseBanner("PLAYER PHASE", "COMMAND LINK ESTABLISHED", 'player');

        // --- PANOPTICON ANALYSE ---
        if (this.enemy && this.enemy.name === "THE PANOPTICON" && this.enemy.currentHp > 0) {
            if (!this.enemy.analyzing) {
                this.enemy.analyzeCooldown = (this.enemy.analyzeCooldown ?? 0) - 1;
                if (this.enemy.analyzeCooldown <= 0) {
                    this.enemy.analyzing = true;
                    this.player._panopticonNullifyFirst = true;
                    this.enemy.analyzeCooldown = 2 + Math.floor(Math.random() * 4);
                }
            }
            if (this.enemy.analyzing) {
                AudioMgr.playSound('hex_barrier');
                await this.showPhaseBanner("THE PANOPTICON IS ANALYSING YOUR NEXT MOVE...", "FIRST ACTION WILL BE NULLIFIED", 'warning');
            }
        }

        // --- NULL_POINTER: Void mechanics ---
        if (this.enemy && this.enemy.name === "NULL_POINTER" && this.enemy.currentHp > 0) {
            // 1) Arm Void Crush once when boss drops to 100 HP.
            if (!this.enemy.voidCrushTriggered && this.enemy.currentHp <= 100) {
                this.enemy.voidCrushTriggered = true;
                this.enemy.voidCrushTurns = 5;
                this.triggerSlowPan && this.triggerSlowPan(2400);
                await this.showPhaseBanner("VOID CRUSH CHARGING", "5 TURNS UNTIL IMPACT", 'warning');
            }

            // 2) Tick Void Crush countdown. Fires when it hits 0.
            if (this.enemy.voidCrushTurns > 0) {
                this.enemy.voidCrushTurns--;
                if (this.enemy.voidCrushTurns <= 0) {
                    await this.showPhaseBanner("VOID CRUSH", "REALITY COLLAPSES", 'boss');
                    Game.shake(40);
                    ParticleSys.createExplosion(this.player.x, this.player.y, 120, '#ff00ff');
                    ParticleSys.createShockwave(this.player.x, this.player.y, '#ff00ff', 80);
                    AudioMgr.playSound('grid_fracture');
                    this.player.mana = 0;
                    if (this.player.takeDamage(100, this.enemy, false) && this.player.currentHp <= 0) { this.gameOver(); return; }
                } else {
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 220, `VOID CRUSH: ${this.enemy.voidCrushTurns}`, "#ff00ff");
                    AudioMgr.playSound('siren');
                }
            }

            // 3) Pull of Void — scaling damage each turn to player and their minions.
            if (this.enemy.currentHp > 0) {
                this.enemy.voidPullCount = (this.enemy.voidPullCount || 0) + 1;
                const pullDmg = this.enemy.voidPullCount;
                ParticleSys.createFloatingText(this.player.x, this.player.y - 120, `PULL OF VOID -${pullDmg}`, "#ff00ff");
                ParticleSys.createShockwave(this.player.x, this.player.y, '#ff00ff', 30);
                if (this.player.takeDamage(pullDmg, this.enemy, false) && this.player.currentHp <= 0) { this.gameOver(); return; }
                this.player.minions.forEach(m => m.takeDamage(pullDmg, this.enemy));
                this.player.minions = this.player.minions.filter(m => m.currentHp > 0);
            }
        }

        this.turnCount++;
        
        if (this.enemy && this.enemy.invincibleTurns > 0) {
            this.enemy.invincibleTurns--;
            if (this.enemy.invincibleTurns <= 0) {
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 220, "SHIELDS OFFLINE", "#ffffff");
                AudioMgr.playSound('grid_fracture'); 
                Game.shake(10);
            } else {
                 ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 220, `INVINCIBLE (${this.enemy.invincibleTurns})`, "#ff0000");
                 AudioMgr.playSound('hex_barrier');
            }
        }

        this.attacksThisTurn = 0;
        this.diceUsedThisTurn = 0; // Paradox Loop + future per-turn counters
        this.firstDefendUsedThisTurn = false;
        this._tickSealedDie();
        // Per-turn stats for end-of-turn summary popup
        this.turnStats = { dmgDealt: 0, dmgTaken: 0, rerollsUsed: 0, healed: 0 };
        // Relic: IRON VAULT — carry up to 50 shield into the next turn.
        if (this.player.hasRelic && this.player.hasRelic('iron_vault')) {
            this.player.shield = Math.min(50, this.player.shield || 0);
        } else {
            this.player.shield = 0;
        }
        this.player.nextAttackMult = 1;
        // Reset class-specific per-turn states
        this.player.ricochetStacks = 0;
        this.player.tempThorns = 0;
        if (this.enemy) this.enemy.intelDebuff = 0;
        // Ascension start-mana penalty: docks 1 mana per stack
        if (this._ascEffects && this._ascEffects.startManaPenalty < 0) {
            this.player.mana = Math.max(0, (this.player.mana || 0) + this._ascEffects.startManaPenalty);
        }
        ClassAbility.onTurnStart();

        // Run-summary tracking
        if (this.runStats) this.runStats.turns = (this.runStats.turns || 0) + 1;

        // Turn counter HUD (Phase 4e)
        const turnEl = document.getElementById('turn-display');
        if (turnEl) turnEl.innerText = `TURN ${this.turnCount}`;
        this.player.incomingDamageMult = 1;
        this.freeRerollUsedThisTurn = false;

        // silent: true — inherent class-start shield must not pre-charge the Sentinel glyph.
        if(this.player.traits.startShield) this.player.addShield(this.player.traits.startShield, { silent: true });
        
        if(this.hasMetaUpgrade('m_shield') && this.turnCount === 1) this.player.addShield(15);
        
        if (this.player.hasRelic('c_void_shell') && this.turnCount === 1) {
            this.player.addShield(40, { force: true });
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "VOID SHELL", "#555");
        }
        
        if (this.player.hasRelic('c_blood_pact')) {
            this.player.takeDamage(2);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "BLOOD PACT", "#ff0000");
        }

        if (this.player.hasRelic('c_overclock')) {
            this.player.takeDamage(3);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "OVERCLOCK", "#ff4400");
        }

        const shieldStacks = this.player.relics.filter(r => r.id === 'nano_shield').length;
        if(shieldStacks > 0 && this.turnCount === 1) this.player.addShield(5 * shieldStacks); 
        
        const shieldGen = this.player.relics.filter(r => r.id === 'shield_gen').length;
        if(shieldGen > 0) this.player.addShield(5 * shieldGen); 
        
        const manaStacks = this.player.relics.filter(r => r.id === 'mana_syphon').length;
        if(manaStacks > 0) this.player.mana += manaStacks;

        // Relic: STATIC CAPACITOR — zap random enemy for 10 DMG if holding 3+ Mana.
        if (this.player.hasRelic('static_capacitor') && this.player.mana >= 3 && this.enemy) {
            const pool = [this.enemy, ...this._enemyMinions()].filter(e => e && e.currentHp > 0);
            if (pool.length > 0) {
                const t = pool[Math.floor(Math.random() * pool.length)];
                const stacks = this.player.relics.filter(r => r.id === 'static_capacitor').length;
                const dmg = 10 * stacks;
                ParticleSys.createFloatingText(t.x, t.y - 80, `CAPACITOR ${dmg}`, "#00f3ff");
                if (t.takeDamage(dmg)) {
                    if (t === this.enemy) { this.winCombat(); return; }
                    else if (this.enemy) this.enemy.minions = this.enemy.minions.filter(m => m !== t);
                }
            }
        }

        // Relic: WARDEN PROTOCOL — player minions gain +3 Shield at start of turn.
        if (this.player.hasRelic('warden_protocol') && this.player.minions.length > 0) {
            const stacks = this.player.relics.filter(r => r.id === 'warden_protocol').length;
            this.player.minions.forEach(m => m.addShield(3 * stacks));
            ParticleSys.createFloatingText(this.player.x, this.player.y - 80, `WARDEN +${3 * stacks}`, COLORS.SHIELD);
        }

        // Relic: TEMPO LOOP — unused dice from previous turn → +3 Shield each.
        if (this.player.hasRelic('tempo_loop') && this._carriedUnusedDice > 0) {
            const stacks = this.player.relics.filter(r => r.id === 'tempo_loop').length;
            const bonus = this._carriedUnusedDice * 3 * stacks;
            this.player.addShield(bonus);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, `TEMPO +${bonus}`, COLORS.SHIELD);
            this._carriedUnusedDice = 0;
        }

        if (this.player.hasRelic('static_field') && this.enemy) {
             const targets = [this.enemy, ...this._enemyMinions()];
             const t = targets[Math.floor(Math.random() * targets.length)];
             if (t) {
                 const isDead = t.takeDamage(15);
                 ParticleSys.createFloatingText(t.x, t.y - 80, "STATIC", "#00f3ff");
                 if (isDead) {
                     if (t === this.enemy) { this.winCombat(); return; } 
                     else if (this.enemy) { this.enemy.minions = this.enemy.minions.filter(m => m !== t); }
                 }
             }
        }

        // Relic: AEGIS CYCLER — at start of turn, convert 5 Shield → +3 DMG next attack.
        if (this.player.hasRelic('aegis_cycler') && (this.player.shield || 0) >= 5) {
            const stacks = this.player.relics.filter(r => r.id === 'aegis_cycler').length;
            const consume = 5 * stacks;
            const dmgBonus = 3 * stacks;
            if (this.player.shield >= consume) {
                this.player.shield -= consume;
                this.player.nextAttackFlatBonus = (this.player.nextAttackFlatBonus || 0) + dmgBonus;
                ParticleSys.createFloatingText(this.player.x, this.player.y - 100, `AEGIS CYCLE +${dmgBonus}`, COLORS.GOLD);
            }
        }

        // Relic: STATIC CAPACITOR — reset per-turn mana counter for trigger.
        this._staticCapMana = 0;
        // Relic: DERVISH MODE — track attacks this turn (uses existing attacksThisTurn).

        if (this.player.hasRelic('solar_battery') && this.turnCount % 2 === 0) {
             const stacks = this.player.relics.filter(r => r.id === 'solar_battery').length;
             const flatMana = stacks; 
             this.player.mana += flatMana;
             ParticleSys.createFloatingText(this.player.x, this.player.y - 80, `SOLAR (+${flatMana})`, COLORS.GOLD);
        }
        
        if (this.enemy && this.enemy.glitchMod && this.enemy.glitchMod.id === 'regen') {
            const healAmt = Math.floor(this.enemy.maxHp * 0.05);
            this.enemy.heal(healAmt);
            ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 150, "GLITCH REGEN", "#00ff00");
        }

        let rerollStacks = this.player.relics.filter(r => r.id === 'reroll_chip').length;
        let gamblerStacks = this.player.relics.filter(r => r.id === 'gamblers_chip').length;
        if(this.hasMetaUpgrade('m_reroll')) rerollStacks++;

        this.player.updateEffects();
        
        if(this.enemy) {
             this.enemy.updateEffects();
             if (this.enemy.affixes && this.enemy.affixes.includes('Shielded')) {
                 if (this.enemy.shield <= 0) {
                     const ratio = (this.sector === 1) ? 0.1 : 0.2;
                     const regen = Math.floor(this.enemy.maxHp * ratio);
                     this.enemy.addShield(regen);
                     ParticleSys.createFloatingText(this.enemy.x, this.enemy.y, "SHIELD REGEN", COLORS.SHIELD);
                 }
             }
             this.enemy.decideTurn();
        }

         this.rerolls = (this.player.traits.noRerolls) ? 0 : (2 + rerollStacks + (gamblerStacks * 2));
         // Ascension reroll penalty (clamp ≥ 0)
         if (this._ascEffects && this._ascEffects.rerollPenalty < 0) {
             this.rerolls = Math.max(0, this.rerolls + this._ascEffects.rerollPenalty);
         }
         // Custom Run: Locked In — force reroll count to 0 so the badge reflects reality.
         if (this._customDisableReroll) this.rerolls = 0;
         // Custom Run: Steady Hand — extra rerolls per turn.
         if (this.player && this.player._customExtraRerolls) {
             this.rerolls += this.player._customExtraRerolls;
         }
        
        if (this.deadMinionsThisTurn > 0) {
            if (this.player.traits.diceCount === 6) {
                 this.rerolls += this.deadMinionsThisTurn;
                 ParticleSys.createFloatingText(this.player.x, this.player.y, `+${this.deadMinionsThisTurn} REROLLS`, "#00f3ff");
            }
            if (this.player.traits.baseMana === 5) {
                 this.player.mana += this.deadMinionsThisTurn;
                 ParticleSys.createFloatingText(this.player.x, this.player.y, `+${this.deadMinionsThisTurn} MANA`, "#bc13fe");
            }
            // Relic: SHARD REACTOR — gain +1 Mana per minion death.
            if (this.player.hasRelic('shard_reactor')) {
                const stacks = this.player.relics.filter(r => r.id === 'shard_reactor').length;
                const gain = this.deadMinionsThisTurn * stacks;
                this.player.mana += gain;
                ParticleSys.createFloatingText(this.player.x, this.player.y - 40, `SHARD +${gain}`, "#ff88cc");
            }
            // Relic: GHOST CACHE — once per run, revive a dead minion at 1 HP.
            if (this.player.hasRelic('ghost_cache') && !this._ghostCacheUsed && this.player.minions.length > 0) {
                this._ghostCacheUsed = true;
                const revived = this.player.minions[0];
                if (revived) {
                    revived.currentHp = 1;
                    ParticleSys.createFloatingText(revived.x, revived.y - 80, "GHOST REVIVE", "#aaffff");
                }
            }
        }
        this.deadMinionsThisTurn = 0;

        // --- GOD MODE: Infinite Mana & Rerolls ---
        if (this.godMode) {
            this.player.mana = 99;
            this.rerolls = 99;
        }
        // -----------------------------------------

        let diceToRoll = this.player.diceCount;
        if (this.enemy && this.enemy.affixes && this.enemy.affixes.includes('Jammer')) {
            diceToRoll = Math.max(3, diceToRoll - 1);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "JAMMED!", "#ff0000");
        }
        // Tactician Command Track: 3-pip spend queues a bonus die for the next
        // hand (reroll + draw synergy).
        if (this.player.bonusDrawNextTurn > 0) {
            diceToRoll += this.player.bonusDrawNextTurn;
            ParticleSys.createFloatingText(this.player.x, this.player.y - 130, `+${this.player.bonusDrawNextTurn} DRAW`, "#00f3ff");
            this.player.bonusDrawNextTurn = 0;
        }
        // Arcanist Flux Regen: passive mana tick at the start of every turn.
        // Capped at baseMana + 5 so the Mana Bank can't balloon infinitely if
        // the player hoards — still encourages spending within a few turns.
        if (this.player.traits.manaPassive > 0) {
            const cap = (this.player.baseMana || 3) + 5;
            if ((this.player.mana || 0) < cap) {
                const gain = Math.min(this.player.traits.manaPassive, cap - (this.player.mana || 0));
                this.player.mana = (this.player.mana || 0) + gain;
                if (gain > 0) ParticleSys.createFloatingText(this.player.x, this.player.y - 110, `+${gain} FLUX`, "#bc13fe");
            }
        }

        this.inputLocked = false;
        this.rollDice(diceToRoll);

        const btnEnd = document.getElementById('btn-end-turn');
        if(btnEnd) {
             btnEnd.disabled = false;
             this.setButtonLabel(btnEnd, ICONS.endTurn);
             btnEnd.style.opacity = 1;
        }

        this.updateHUD();
        // Player phase is live — release the single-flight endTurn gate so
        // the player's next END TURN press can fire.
        this._endTurnRunning = false;
      } catch (err) {
        this._endTurnRunning = false;
        this._recoverFromCombatError('startTurn', err, false);
      }
    },

    calculateCardDamage(baseDmg, type = null, target = null, opts = {}) {
        const peek = !!opts.peek;
        let dmg = baseDmg;

        // Class Ability: additive bonus (Tactician COMMAND +dmg pip)
        dmg += peek ? ClassAbility.peekPreDamageBonus(type) : ClassAbility.consumePreDamageBonus(type);

        // Meta: Solar Flare (+30%)
        if(this.hasMetaUpgrade('m_dmg')) {
            dmg = Math.floor(dmg * 1.3);
        }

        const dmgMult = this.player.traits.dmgMultiplier || 1.0;
        dmg = Math.floor(dmg * dmgMult);

        if(this.player.hasRelic('titan_module')) {
            const stacks = this.stackCount('titan_module');
            dmg = Math.floor(dmg * Math.pow(1.25, stacks));
        }
        
        if ((this._dieSlot(type) === 'attack' || type === 'METEOR') && this.player.nextAttackMult > 1) {
            dmg = Math.floor(dmg * this.player.nextAttackMult);
        }
        
        if (this.player.hasEffect('weak')) {
            dmg = Math.floor(dmg * 0.5);
        }
        
        if (target && (target instanceof Enemy || target instanceof Minion)) {
            const overcharge = target.hasEffect('overcharge');
            if (overcharge) {
                const modifier = overcharge.val > 0 ? 2.0 : 1.5;
                dmg = Math.floor(dmg * modifier);
            }
            if (target.hasEffect('frail')) {
                dmg = Math.floor(dmg * 1.3);
            }
        }

        // Tactician INTEL DEBUFF: enemy is "Exposed" — player attacks deal bonus flat damage.
        if (this._dieSlot(type) === 'attack' && this.enemy && this.enemy.intelDebuff > 0) {
            dmg += this.enemy.intelDebuff;
        }

        // Relic: VOLT PRIMER — first attack of each turn gets +5 flat DMG.
        // Peek path intentionally doesn't consume the flag so tooltips read
        // consistently while the player is considering their play.
        if (this._dieSlot(type) === 'attack' && this.player.hasRelic('volt_primer')
                && !this._voltPrimerUsedThisTurn) {
            dmg += 5;
            if (!peek) this._voltPrimerUsedThisTurn = true;
        }
        
        // --- GOD MODE: 10x DAMAGE ---
        const dData = DICE_TYPES[type];
        const isDefendSlot = dData && dData.slot === 'defend';
        const isManaSlot = dData && dData.slot === 'mana';
        if (this.godMode && !isDefendSlot && !isManaSlot) {
            dmg *= 10;
        }
        // ----------------------------

        // Class Ability: multiplicative bonus (Annihilator OVERCLOCK)
        dmg = Math.floor(dmg * (peek ? ClassAbility.peekDamageMultiplier(type) : ClassAbility.consumeDamageMultiplier(type)));

        // Custom Run: Glass Cannon / chaotic outgoing-damage modifiers. Peek
        // uses the multiplier deterministically so the intent tooltip shows
        // the boosted number; live attacks roll variance when requested.
        if (this._customDmgOutMult && this._customDmgOutMult !== 1) {
            dmg = Math.floor(dmg * this._customDmgOutMult);
        }
        if (!peek && this._customCritVariance === 'double_or_none' && this._dieSlot(type) === 'attack') {
            // 50/50 variance — double the hit or whiff for zero. Flagged so
            // the player feels the gamble they opted into.
            dmg = Math.random() < 0.5 ? dmg * 2 : 0;
        }

        // Sector 5 — Reality Glitch. Player attacks roll ±damageNoiseRange.
        // Peek paths skip the roll so the tooltip number doesn't flicker
        // with each hover; the live cast is where the chaos lands.
        if (!peek && this._activeSectorMech && this._activeSectorMech.damageNoiseRange && this._dieSlot(type) === 'attack' && dmg > 0) {
            const r = this._activeSectorMech.damageNoiseRange;
            const noise = 1 + ((Math.random() * 2 - 1) * r);
            dmg = Math.max(1, Math.floor(dmg * noise));
        }

        return dmg;
    },

    // Signature die: register this class's current-tier die into DICE_TYPES so
    // the standard roll pipeline picks it up. Tier comes from player.signatureTier
    // (1..3), which advances on boss clears.
    _syncSignatureDie() {
        if (!this.player || !this.player.classId) return;
        const table = SIGNATURE_DICE[this.player.classId];
        if (!table) return;
        const tier = Math.max(1, Math.min(3, this.player.signatureTier || 1));
        const def = table[tier - 1];
        if (!def) return;
        // Expose a single stable key ('SIGNATURE') so roll pool doesn't need to
        // know which tier is current; registration overwrites per tier.
        DICE_TYPES.SIGNATURE = {
            icon: def.icon, color: def.color, desc: def.desc,
            cost: def.cost || 0, target: def.target || 'enemy',
            isSignature: true, signatureTier: tier, signatureName: def.name
        };
        this._signatureKey = 'SIGNATURE';
    },

    _enemyMinions() {
        return (this.enemy && Array.isArray(this.enemy.minions)) ? this.enemy.minions : [];
    },

    /* Class-fantasy summon VFX dispatcher (Roadmap Part 26.2). Call this
       right after a player minion is added to `player.minions` with a
       fresh spawnTimer. Defers to the next animation frame so
       `updateMinionPositions` has already placed the minion at its slot. */
    _triggerSummonVfx(minion) {
        if (!minion) return;
        const classId = this.player ? this.player.classId : null;
        // Run after the next paint so the minion's position is final.
        requestAnimationFrame(() => {
            const mx = minion.x, my = minion.y;
            if (typeof mx !== 'number' || typeof my !== 'number') return;
            switch (classId) {
                case 'bloodstalker': {
                    // Blood Thrall swoops in from above — red streak + dust landing
                    const sx = mx, sy = my - 400;
                    this.effects.push({
                        type: 'nature_dart',
                        sx: sx, sy: sy, tx: mx, ty: my,
                        x: sx, y: sy, progress: 0,
                        speed: 0.08, amplitude: 6, frequency: 3,
                        color: '#ff0044', empowered: false, dmgMultiplier: 1.0
                    });
                    setTimeout(() => {
                        ParticleSys.createShockwave(mx, my, '#ff2244', 28);
                        ParticleSys.createExplosion(mx, my, 32, '#ff0044');
                        ParticleSys.createFloatingText(mx, my - 70, 'RISE', '#ff3355');
                        AudioMgr.playSound('hit');
                        if (this.shake) this.shake(4);
                    }, 240);
                    break;
                }
                case 'summoner': {
                    // Spirit grows from ground — green bloom + leaves scatter
                    for (let i = 0; i < 3; i++) {
                        setTimeout(() => {
                            ParticleSys.createShockwave(mx, my + 30 - i * 12, COLORS.NATURE_LIGHT, 16 + i * 4);
                        }, i * 90);
                    }
                    setTimeout(() => {
                        ParticleSys.createExplosion(mx, my, 42, COLORS.NATURE_LIGHT);
                        ParticleSys.createSparks(mx, my - 20, '#88ffaa', 18);
                        ParticleSys.createFloatingText(mx, my - 70, 'GROW', COLORS.NATURE_LIGHT);
                        AudioMgr.playSound('print');
                    }, 280);
                    break;
                }
                case 'tactician': {
                    // Pawn materializes from a hologram
                    ParticleSys.createShockwave(mx, my, COLORS.MANA, 20);
                    ParticleSys.createExplosion(mx, my, 24, COLORS.MANA);
                    this.effects.push({
                        type: 'hex_barrier',
                        x: mx, y: my,
                        radius: 1, maxRadius: 70,
                        life: 26, maxLife: 26,
                        color: COLORS.MANA
                    });
                    AudioMgr.playSound('mana');
                    break;
                }
                case 'arcanist': {
                    // Mana wisp spirals in on a flame trail
                    for (let i = 0; i < 5; i++) {
                        setTimeout(() => {
                            const a = (i / 5) * Math.PI * 2;
                            ParticleSys.createSparks(mx + Math.cos(a) * 30, my + Math.sin(a) * 30, COLORS.PURPLE, 6);
                        }, i * 40);
                    }
                    setTimeout(() => {
                        ParticleSys.createExplosion(mx, my, 30, COLORS.PURPLE);
                        ParticleSys.createShockwave(mx, my, COLORS.PURPLE, 20);
                        AudioMgr.playSound('mana');
                    }, 220);
                    break;
                }
                case 'annihilator': {
                    // Bomb Bot drop — thud then small spark cloud
                    ParticleSys.createShockwave(mx, my, COLORS.ORANGE, 22);
                    ParticleSys.createExplosion(mx, my, 28, COLORS.ORANGE);
                    ParticleSys.createExplosion(mx, my, 16, '#ffee00');
                    ParticleSys.createFloatingText(mx, my - 70, 'DEPLOYED', COLORS.ORANGE);
                    AudioMgr.playSound('print');
                    if (this.shake) this.shake(4);
                    break;
                }
                case 'sentinel': {
                    // Guardian crystallizes — hex barrier plates out
                    this.effects.push({
                        type: 'hex_barrier',
                        x: mx, y: my,
                        radius: 1, maxRadius: 90,
                        life: 36, maxLife: 36,
                        color: '#ffffff'
                    });
                    ParticleSys.createSparks(mx, my, '#ffffff', 14);
                    AudioMgr.playSound('hex_barrier');
                    break;
                }
                default: {
                    ParticleSys.createShockwave(mx, my, COLORS.NATURE_LIGHT, 20);
                    AudioMgr.playSound('print');
                }
            }
        });
    },

    // Bomb Bot detonation — flies a missile from the bomb's position to the
    // boss enemy and applies AoE damage on impact. Resolves after the
    // explosion lands (or immediately if there's no valid enemy to hit).
    // Caller may pre-capture the bomb's launch coordinates (useful when the
    // bomb is being removed from `player.minions` in the same tick — its
    // index changes, and the next render frame's `updateMinionPositions`
    // would re-anchor `bomb.x` to a different slot).
    _detonateBombBot(bomb, sx, sy) {
        if (!bomb) return Promise.resolve();
        const enemy = this.enemy;
        if (!enemy || enemy.currentHp <= 0) return Promise.resolve();
        const launchX = (typeof sx === 'number') ? sx : bomb.x;
        const launchY = (typeof sy === 'number') ? sy : bomb.y;
        const launchSource = { x: launchX, y: launchY };
        return new Promise(resolve => {
            this.triggerVFX('bomb_missile', launchSource, enemy, () => {
                if (this.enemy && this.enemy.currentHp > 0) {
                    const dead = this.enemy.takeDamage(10);
                    if (dead && this.enemy.currentHp <= 0) {
                        this.winCombat();
                        resolve();
                        return;
                    }
                }
                this._enemyMinions().forEach(em => { if (em && em.currentHp > 0) em.takeDamage(10); });
                if (this.enemy) this.enemy.minions = this.enemy.minions.filter(em => em.currentHp > 0);
                resolve();
            });
        });
    },

    _shadow(base) { return Perf.shadowBlur(base); },

    _dieSlot(type) {
        const d = DICE_TYPES[type];
        if (d && d.slot) return d.slot;
        if (type === 'ATTACK') return 'attack';
        if (type === 'DEFEND') return 'defend';
        if (type === 'MANA') return 'mana';
        if (type === 'MINION') return 'minion';
        return null;
    },

    _isAttackSlot(type) {
        const s = this._dieSlot(type);
        return s === 'attack' || type === 'METEOR' || type === 'EARTHQUAKE' || type === 'SIGNATURE';
    },

    _rerollIntervals: [],
    _rerollTimeout: null,
    _clearRerollIntervals() {
        this._rerollIntervals.forEach(id => clearInterval(id));
        this._rerollIntervals = [];
        if (this._rerollTimeout) { clearTimeout(this._rerollTimeout); this._rerollTimeout = null; }
    },

    UNIQUE_PER_HAND: new Set(['RECKLESS_CHARGE', 'OVERCHARGE', 'VOODOO']),

    _getClassBaseDice() {
        if (!this.player || !this.player.classId) return [];
        const cls = PLAYER_CLASSES.find(c => c.id === this.player.classId);
        return cls && cls.classDice ? Object.values(cls.classDice) : [];
    },

    _isBaseDie(key) {
        const d = DICE_TYPES[key];
        return d && d.slot && !d.isSkill && !d.locked;
    },

    // Dynamic BASE_DICE — returns the 4 base dice for the current class.
    get BASE_DICE() {
        const keys = this._getClassBaseDice();
        return new Set(keys.length > 0 ? keys : []);
    },

    // Sealed dice slot — pins one dice type to always appear in every hand
    // for the configured number of turns. Set via events/relics.
    // Shape: { type: 'ATTACK', turnsLeft: 3 }
    sealedDie: null,

    sealDice(type, turns) {
        this.sealedDie = { type, turnsLeft: turns };
        if (this.player) {
            ParticleSys.createFloatingText(this.player.x, this.player.y - 180, `SEALED: ${type} (${turns}t)`, COLORS.GOLD);
        }
    },

    _tickSealedDie() {
        if (!this.sealedDie) return;
        this.sealedDie.turnsLeft--;
        if (this.sealedDie.turnsLeft <= 0) this.sealedDie = null;
    },

    _getAvailableDiceTypes() {
        const classBase = new Set(this._getClassBaseDice());
        return Object.keys(DICE_TYPES).filter(key => {
            const d = DICE_TYPES[key];
            if (key === 'SIGNATURE') return false;
            // Class base dice — only include this class's 4
            if (d.classId && d.slot) return classBase.has(key);
            // Shared skill dice — include if unlocked
            if (d.locked) {
                if (key === 'VOODOO' && this.player.hasRelic('voodoo_doll')) return true;
                if (key === 'OVERCHARGE' && this.player.hasRelic('overcharge_chip')) return true;
                if (key === 'RECKLESS_CHARGE' && this.player.hasRelic('reckless_drive')) return true;
                return false;
            }
            // Shared unlocked skills (EARTHQUAKE, METEOR, CONSTRICT)
            if (d.isSkill) return true;
            return false;
        });
    },

    _pickDiceType(availableTypes, reserved) {
        let candidates = availableTypes;
        if (reserved && reserved.size) {
            candidates = availableTypes.filter(t => !(this.UNIQUE_PER_HAND.has(t) && reserved.has(t)));
            if (candidates.length === 0) candidates = availableTypes;
        }
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        if (this.UNIQUE_PER_HAND.has(pick) && reserved) reserved.add(pick);
        return pick;
    },

    rollDice(count) {
        this.dicePool = [];
        
        // TUTORIAL RIGGING — uses class-specific dice
        if (this.currentState === STATE.TUTORIAL_COMBAT) {
            const cd = this.player && this.player.classId
                ? (PLAYER_CLASSES.find(c => c.id === this.player.classId) || {}).classDice || {}
                : {};
            const atkType = cd.attack || 'TAC_ATTACK';
            const defType = cd.defend || 'TAC_DEFEND';
            const minType = cd.minion || 'TAC_MINION';

            if (this.tutorialStep === 3) {
                this.dicePool = [
                    { id: 0, type: atkType, used: false, selected: false },
                    { id: 1, type: defType, used: false, selected: false }
                ];
                this.renderDiceUI();
                return;
            }
            if (this.tutorialStep === 10) {
                this.dicePool = [
                    { id: 0, type: minType, used: false, selected: false },
                    { id: 1, type: atkType, used: false, selected: false }
                ];
                this.rerolls--;
                this.renderDiceUI();
                return;
            }
            if (this.tutorialStep === 11) {
                this.dicePool = [
                    { id: 0, type: minType, used: false, selected: false },
                    { id: 1, type: atkType, used: false, selected: false }
                ];
                this.renderDiceUI();
                return;
            }
            if (this.tutorialStep === 12) {
                // Final-beat rigging: two ATTACK dice force a DOUBLE STRIKE
                // combo so new players see the combo glow + climax in context.
                this.dicePool = [
                    { id: 0, type: atkType, used: false, selected: false },
                    { id: 1, type: atkType, used: false, selected: false }
                ];
                this._detectAndApplyCombos();
                this.renderDiceUI();
                return;
            }
        }

        // STANDARD LOGIC
        const availableTypes = this._getAvailableDiceTypes();
        const hasSignature = !!DICE_TYPES.SIGNATURE;
        const SIG_RATE = 0.22;
        // Pity: guarantee SIGNATURE after two straight misses.
        const sigPity = (this.player.sigMissStreak || 0) >= 2;

        const reserved = new Set();
        let sigPlaced = false;
        let basePlaced = false;
        // Sealed-die guarantee: if a sealed type is active for this roll,
        // pin it into slot 0 before any other logic runs.
        const sealed = this.sealedDie;
        const sealedType = sealed && availableTypes.includes(sealed.type) ? sealed.type : null;
        for (let i = 0; i < count; i++) {
            let k;
            const slotsLeft = count - i;

            if (i === 0 && sealedType) {
                k = sealedType;
            } else if (hasSignature && !sigPlaced && (
                sigPity ||
                Math.random() < SIG_RATE ||
                (i === count - 1 && count <= 5 && Math.random() < 0.5)
            )) {
                k = 'SIGNATURE';
                sigPlaced = true;
            } else if (!basePlaced && slotsLeft === 1) {
                // Base-dice floor: last slot falls back to a zero-cost base
                // if nothing base has landed yet. Prevents mana-starved hands.
                const baseCandidates = availableTypes.filter(t => this.BASE_DICE.has(t));
                k = baseCandidates.length > 0
                    ? baseCandidates[Math.floor(Math.random() * baseCandidates.length)]
                    : this._pickDiceType(availableTypes, reserved);
            } else {
                k = this._pickDiceType(availableTypes, reserved);
            }

            if (this.BASE_DICE.has(k)) basePlaced = true;
            const sealedSlot = (i === 0 && sealedType);
            this.dicePool.push({ id: i, type: k, used: false, selected: false, sealed: !!sealedSlot });
        }

        this.player.sigMissStreak = sigPlaced ? 0 : ((this.player.sigMissStreak || 0) + 1);

        // Combo detection — reward natural variety / repeats.
        this._detectAndApplyCombos();
        this.renderDiceUI();
    },

    // Combo dice bonuses (§2.1.3). Scans the just-rolled hand for pairs/triples
    // by SLOT (so class variants count) and also class-specific combos.
    // Tracks die-membership per combo so the UI can glow the eligible dice
    // and so the last die consumed triggers a climax VFX/SFX.
    _detectAndApplyCombos() {
        // Clear stale flags so a reroll that removes a combo doesn't leave the
        // bonus (e.g. comboBulwark) armed against the wrong hand.
        this.comboFlurry = false;
        this.comboDoubleStrike = false;
        this.comboBulwark = false;
        this.comboOverflow = false;
        this.comboSiblingBond = false;
        this.comboSets = {}; // id -> { name, color, members: Set<dieId> }
        this.activeCombos = [];
        if (!this.dicePool || this.dicePool.length === 0) return;

        const bySlot = { attack: [], defend: [], mana: [], minion: [] };
        for (const d of this.dicePool) {
            const slot = Game._dieSlot(d.type);
            if (slot && bySlot[slot]) bySlot[slot].push(d.id);
        }

        const announce = (id, name, color, memberIds) => {
            this.activeCombos.push({ name, color });
            this.comboSets[id] = { name, color, members: new Set(memberIds) };
            Hints.trigger('combo_double');
            Analytics.emit('combo_triggered', { name });
            if (this.player) {
                ParticleSys.createFloatingText(
                    this.player.x, this.player.y - 180, `COMBO: ${name}`, color,
                    { fontSize: 42, vy: -1.2, life: 1.8 }
                );
            }
            if (this.haptic) this.haptic('hit');
        };

        const attackIds = bySlot.attack;
        const defendIds = bySlot.defend;
        const manaIds   = bySlot.mana;
        const minionIds = bySlot.minion;

        if (attackIds.length >= 3) {
            this.comboFlurry = true;
            announce('FLURRY', 'FLURRY', '#ff3355', attackIds);
        } else if (attackIds.length >= 2) {
            this.comboDoubleStrike = true;
            announce('DOUBLE_STRIKE', 'DOUBLE STRIKE', '#ff3355', attackIds);
        }
        if (defendIds.length >= 2) {
            this.comboBulwark = true;
            announce('BULWARK', 'BULWARK', '#00f3ff', defendIds);
        }
        if (manaIds.length >= 2) {
            this.comboOverflow = true;
            announce('OVERFLOW', 'OVERFLOW', '#ffd700', manaIds);
        }
        if (minionIds.length >= 2) {
            this.comboSiblingBond = true;
            announce('SIBLING_BOND', 'SIBLING BOND', '#00ff99', minionIds);
        }

        // Class-unique combo — one per class. Payload applies as the climax.
        const cid = this.player && this.player.classId;
        if (cid === 'tactician' && attackIds.length && defendIds.length && manaIds.length) {
            announce('PINCER', 'PINCER', '#00f3ff', [attackIds[0], defendIds[0], manaIds[0]]);
        } else if (cid === 'arcanist' && manaIds.length >= 3) {
            announce('CONVERGENCE', 'CONVERGENCE', '#bc13fe', manaIds);
        } else if (cid === 'bloodstalker' && attackIds.length >= 2 && defendIds.length >= 1) {
            announce('FEEDING_FRENZY', 'FEEDING FRENZY', '#ff3355', [...attackIds.slice(0, 2), defendIds[0]]);
        } else if (cid === 'annihilator' && attackIds.length >= 2 && manaIds.length >= 1) {
            announce('OVERLOAD', 'OVERLOAD', '#ff8800', [...attackIds.slice(0, 2), manaIds[0]]);
        } else if (cid === 'sentinel' && defendIds.length >= 3) {
            announce('FORTRESS', 'FORTRESS', '#ffffff', defendIds);
        } else if (cid === 'summoner' && minionIds.length >= 2 && attackIds.length >= 1) {
            announce('WILD_PACK', 'WILD PACK', '#00ff99', [...minionIds.slice(0, 2), attackIds[0]]);
        }
    },

    // A die was just used — remove its membership from every active combo set.
    // When a set empties, fire the climax VFX/SFX + apply any combo-final bonus.
    _onDieConsumed(die) {
        if (!this.comboSets) return;
        const toFire = [];
        for (const id in this.comboSets) {
            const set = this.comboSets[id];
            if (set.members.has(die.id)) {
                set.members.delete(die.id);
                if (set.members.size === 0) toFire.push(id);
            }
        }
        for (const id of toFire) {
            const set = this.comboSets[id];
            this._playComboClimax(id, set);
            delete this.comboSets[id];
        }
    },

    _playComboClimax(id, set) {
        const color = (set && set.color) || '#ffd700';
        const name  = (set && set.name)  || id;
        const px = this.player ? this.player.x : 0;
        const py = this.player ? this.player.y : 0;
        const ex = this.enemy  ? this.enemy.x  : px;
        const ey = this.enemy  ? this.enemy.y  : py;

        const banner = (text, at) => ParticleSys.createFloatingText(
            at.x, at.y - 200, text, color, { fontSize: 48, vy: -1.4, life: 1.6 }
        );

        switch (id) {
            case 'FLURRY':
                ParticleSys.createShockwave(ex, ey, color, 48);
                ParticleSys.createSparks(ex, ey, color, 20);
                AudioMgr.playSound('explosion');
                this.shake(10);
                banner('FLURRY!', { x: ex, y: ey });
                break;
            case 'DOUBLE_STRIKE':
                ParticleSys.createSparks(ex, ey, color, 14);
                AudioMgr.playSound('hit');
                this.shake(6);
                banner('DOUBLE STRIKE!', { x: ex, y: ey });
                break;
            case 'BULWARK':
                this.triggerVFX('hex_barrier', null, this.player);
                ParticleSys.createShockwave(px, py, color, 40);
                AudioMgr.playSound('defend');
                banner('BULWARK!', { x: px, y: py });
                break;
            case 'OVERFLOW':
                ParticleSys.createExplosion(px, py, 36, color);
                AudioMgr.playSound('mana');
                banner('OVERFLOW!', { x: px, y: py });
                break;
            case 'SIBLING_BOND':
                if (this.player && this.player.minions) {
                    this.player.minions.forEach(m => {
                        if (m && m.currentHp > 0) ParticleSys.createExplosion(m.x, m.y, 18, color);
                    });
                }
                AudioMgr.playSound('upgrade');
                banner('SIBLING BOND!', { x: px, y: py });
                break;

            // Class-unique climaxes
            case 'PINCER': {
                this.rerolls = (this.rerolls || 0) + 1;
                if (this.enemy) this.enemy.intentRevealed = true;
                this._pincerRevealActive = true;
                ParticleSys.createTacticianBurst(px, py);
                ParticleSys.createShockwave(ex, ey, color, 28);
                AudioMgr.playSound('beam');
                banner('PINCER!', { x: px, y: py });
                break;
            }
            case 'CONVERGENCE': {
                this.gainMana(2);
                ParticleSys.createArcanistBurst(px, py);
                ParticleSys.createShockwave(px, py, color, 36);
                AudioMgr.playSound('mana');
                banner('CONVERGENCE!', { x: px, y: py });
                break;
            }
            case 'FEEDING_FRENZY': {
                if (this.player && this.player.heal) this.player.heal(5);
                ParticleSys.createBloodstalkerBurst(ex, ey);
                ParticleSys.createExplosion(ex, ey, 28, color);
                AudioMgr.playSound('hit');
                this.shake(8);
                banner('FEEDING FRENZY!', { x: ex, y: ey });
                break;
            }
            case 'OVERLOAD': {
                if (this.player) this.player.nextAttackMult = (this.player.nextAttackMult || 1) * 1.5;
                ParticleSys.createAnnihilatorBurst(px, py);
                ParticleSys.createShockwave(px, py, color, 44);
                AudioMgr.playSound('explosion');
                this.shake(10);
                banner('OVERLOAD!', { x: px, y: py });
                break;
            }
            case 'FORTRESS': {
                if (this.player) this.player.tempThorns = (this.player.tempThorns || 0) + 5;
                this.triggerVFX('hex_barrier', null, this.player);
                ParticleSys.createSentinelBurst(px, py);
                AudioMgr.playSound('hex_barrier');
                banner('FORTRESS!', { x: px, y: py });
                break;
            }
            case 'WILD_PACK': {
                if (this.player && this.player.minions) {
                    this.player.minions.forEach(m => {
                        if (m && m.currentHp > 0) {
                            m.maxHp += 3; m.currentHp += 3; m.dmg = (m.dmg || 0) + 3;
                            ParticleSys.createSummonerBurst(m.x, m.y);
                        }
                    });
                }
                AudioMgr.playSound('upgrade');
                banner('WILD PACK!', { x: px, y: py });
                break;
            }
        }
    },

    renderDiceUI() {
        const container = document.getElementById('dice-container');
        container.innerHTML = '';

        // Crescent layout: wider span + taller arc so edge dice lift higher and
        // value chips stay legible without hovering. Viewport-aware so we never
        // push past the flanking reroll/end-turn corner buttons.
        const n = this.dicePool.length;
        const containerW = (container.offsetWidth || 720);
        // How far horizontally we can push the outermost die before hitting the corner
        // button (buttons are ~70px + ~10px margin on each side).
        const safeHalfX = Math.max(110, (containerW / 2) - 90);
        // On wider screens, open the arc up more; narrow screens pinch it back.
        // Base radius grows with container width so the arc feels proportional.
        const radius = Math.min(380, Math.max(240, containerW * 0.5));
        const desiredSpan = Math.min(0.62, 0.22 + n * 0.08);
        // Clamp: arcX = sin(spanHalf) * radius must stay ≤ safeHalfX
        const maxByGeom = Math.asin(Math.min(0.95, safeHalfX / radius));
        const spanHalf = Math.min(desiredSpan, maxByGeom);

        this.dicePool.forEach((die, idx) => {
            const data = DICE_TYPES[die.type];
            // Defensive guard — if the save file predates a dice type rename or
            // contains an unknown key, skip rendering it rather than crashing on
            // data.cost / data.icon / etc. The die stays in the pool logically
            // so that unrelated flow (rerolls, combos) can still complete.
            if (!data) { console.warn('renderDiceUI: unknown die type', die.type); return; }
            const isUpgraded = this.player.hasDiceUpgrade(die.type);
            const upgradeData = DICE_UPGRADES[die.type];

            // Affordability: visually dim the die if player cannot pay (Phase 4c).
            const unaffordable = !die.used && data.cost > 0 && this.player && this.player.mana < data.cost;

            // Crescent arc slot
            const slot = document.createElement('div');
            slot.className = 'die-slot';
            let t = 0;
            if (n > 1) t = (idx - (n - 1) / 2) / ((n - 1) / 2); // -1..+1
            const angle = t * spanHalf;
            const arcX = Math.sin(angle) * radius;
            const arcY = -(1 - Math.cos(angle)) * radius; // negative = lifted up at edges
            slot.style.setProperty('--arc-x', `${arcX.toFixed(1)}px`);
            slot.style.setProperty('--arc-y', `${arcY.toFixed(1)}px`);
            slot.style.setProperty('--arc-rot', `${(angle * 180 / Math.PI).toFixed(2)}deg`);

            // Combo-eligible dice glow/spark — tag before building classname
            // so .die-combo participates in the initial render.
            let comboColor = null;
            if (!die.used && this.comboSets) {
                for (const id in this.comboSets) {
                    if (this.comboSets[id].members.has(die.id)) {
                        comboColor = this.comboSets[id].color;
                        break;
                    }
                }
            }

            const el = document.createElement('div');
            el.className = `die die-entering ${die.selected ? 'selected' : ''} ${die.used ? 'used' : ''} ${die.sealed ? 'die-sealed' : ''} ${unaffordable ? 'die--unaffordable' : ''} ${comboColor ? 'die-combo' : ''}`;
            if (comboColor) el.style.setProperty('--combo-color', comboColor);
            // Trigger transition from die-entering → resting state with a small stagger.
            setTimeout(() => el.classList.remove('die-entering'), 30 + idx * 70);

            // FIX: Prevent mobile scrolling on drag
            el.style.touchAction = 'none';

            const faceIcon = isUpgraded ? upgradeData.icon : data.icon;
            el.innerHTML = `<span class="die-face">${faceIcon}</span>`;
            // Cost chip — number only, no voltage glyph. Styled small + bottom-right by CSS.
            if (data.cost > 0) el.innerHTML += `<div class="die-cost">${data.cost}</div>`;

            el.style.borderColor = data.color;
            el.style.color = data.color;

            // Slot attribute drives CSS slot-specific background tints so the
            // four class-die types are distinguishable even within a single
            // class palette.
            if (data.slot) el.dataset.slot = data.slot;
            if (data.isSkill) el.dataset.slot = 'skill';

            // Slot-variant inline styling — mix white with the class color so
            // the four slot types read distinctly at a glance. Skipped for
            // upgraded, signature, and combo dice (those have their own
            // dominant visual signals that must not be stomped).
            if (!isUpgraded && !data.isSignature && !comboColor && data.slot) {
                if (data.slot === 'attack') {
                    // Weapon gleam — colored ring, WHITE icon.
                    el.style.color = '#ffffff';
                    el.style.borderWidth = '2.5px';
                    el.style.boxShadow = `0 0 10px ${data.color}`;
                } else if (data.slot === 'defend') {
                    // Shield frame — WHITE ring, colored icon + colored inner glow.
                    el.style.borderColor = '#ffffff';
                    el.style.boxShadow = `0 0 10px ${data.color}, inset 0 0 8px ${data.color}66`;
                } else if (data.slot === 'mana') {
                    // Energy pulse — colored ring + thin inset white outline.
                    el.style.boxShadow = `inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 8px ${data.color}`;
                } else if (data.slot === 'minion') {
                    // Summoning sigil — colored ring with white corner accents.
                    el.style.boxShadow = `inset 2px 2px 0 rgba(255,255,255,0.55), inset -2px -2px 0 rgba(255,255,255,0.55), 0 0 8px ${data.color}`;
                }
            }

            if (isUpgraded) {
                el.style.borderColor = COLORS.GOLD;
                // Skip inline box-shadow when the combo aura is driving the
                // keyframe animation, so the pulse isn't overridden.
                if (!comboColor) el.style.boxShadow = `0 0 10px ${COLORS.GOLD}`;
            }

            // Class default-attack die: subtle class-color radial watermark
            // so veterans still recognize their signature at a glance — no
            // gold star or pulse.
            if (data.isSignature) {
                el.classList.add('die-classmark');
                el.style.setProperty('--class-color', data.color);
            }

            if(data.slot === 'attack' && !die.used && this.player && this.player.hasRelic('relentless') && this.attacksThisTurn === 2) {
                 el.style.boxShadow = `0 0 25px ${data.color}`;
                 el.style.borderColor = "#fff";
                 el.style.transform = "scale(1.1)";
            }

            if(!die.used) {
                el.onpointerdown = (e) => this.startDrag(e, die, el);

                // For the class default-attack die, prefer its tier name over
                // the raw 'SIGNATURE' type key. Non-signature dice prefer their
                // thematic `name` field (e.g. "Crimson Rend") over the raw
                // type key ("BLD_ATTACK").
                const baseLabel = data.isSignature
                    ? (data.signatureName || 'ATTACK')
                    : (data.name || die.type);
                let desc = isUpgraded
                    ? `<strong>${upgradeData.name}</strong>\n${upgradeData.desc}`
                    : `<strong>${baseLabel}</strong>\n${data.desc}`;

                if (Game._dieSlot(die.type) === 'attack' || die.type === 'EARTHQUAKE' || die.type === 'METEOR') {
                    let base = 0;
                    const slot = Game._dieSlot(die.type);
                    if (slot === 'attack') {
                        const cid = Game.player ? Game.player.classId : null;
                        if (cid === 'arcanist') {
                            base = (isUpgraded ? 6 : 4) + Math.min(5, Game.player.mana || 0) * (isUpgraded ? 2 : 1);
                        } else if (cid === 'bloodstalker') {
                            base = isUpgraded ? 9 : 6;
                        } else if (cid === 'annihilator') {
                            base = isUpgraded ? 12 : 8;
                        } else if (cid === 'sentinel') {
                            base = (isUpgraded ? 5 : 3) + Math.floor((Game.player.shield || 0) * (isUpgraded ? 0.4 : 0.3));
                        } else if (cid === 'summoner') {
                            const aliveMinions = Game.player.minions ? Game.player.minions.filter(m => m && m.currentHp > 0).length : 0;
                            base = (isUpgraded ? 6 : 4) + aliveMinions * (isUpgraded ? 3 : 2);
                        } else {
                            // tactician or default
                            base = isUpgraded ? 8 : 5;
                        }
                    } else if (die.type === 'EARTHQUAKE') base = isUpgraded ? 8 : 5;
                    else if (die.type === 'METEOR') base = isUpgraded ? 50 : 30;

                    const target = (this.currentState === STATE.COMBAT) ? this.enemy : null;
                    const finalDmg = this.calculateCardDamage(base, die.type, target, { peek: true });

                    desc = desc.replace(/Deal (\d+) (damage|DMG)/i, `Deal ${finalDmg} $2`);

                    // Damage prediction line — clearly highlights the post-modifier number
                    const delta = finalDmg - base;
                    let modNote = '';
                    if (delta > 0)      modNote = ` <span style="color:#0f0;">(+${delta})</span>`;
                    else if (delta < 0) modNote = ` <span style="color:#f55;">(${delta})</span>`;
                    desc += `\n\n<span style="color:#ffd700;font-family:'Orbitron';">⚡ PREDICTED: ${finalDmg}${modNote}</span>`;
                    if (this.enemy && this.enemy.shield > 0) {
                        const piercing = Math.max(0, finalDmg - this.enemy.shield);
                        desc += `\n<span style="color:#888;font-size:0.85em;">vs ${this.enemy.shield} shield → ${piercing} HP loss</span>`;
                    }
                }

                el.dataset.dieId = String(die.id);
                el.onmouseenter = (e) => {
                    TooltipMgr.show(desc, e.clientX, e.clientY);
                    // Combo peer preview: outline sibling dice that combo with
                    // the one being hovered.
                    if (this.comboSets) {
                        const peers = new Set();
                        for (const id in this.comboSets) {
                            const set = this.comboSets[id];
                            if (set.members.has(die.id)) {
                                set.members.forEach(mid => { if (mid !== die.id) peers.add(mid); });
                            }
                        }
                        if (peers.size) {
                            document.querySelectorAll('#dice-container .die').forEach(sib => {
                                const sid = Number(sib.dataset.dieId);
                                if (peers.has(sid)) sib.classList.add('die-combo-peer');
                            });
                        }
                    }
                };
                el.onmouseleave = () => {
                    TooltipMgr.hide();
                    document.querySelectorAll('#dice-container .die.die-combo-peer')
                        .forEach(sib => sib.classList.remove('die-combo-peer'));
                };

                el.addEventListener('touchstart', (e) => {
                    const touch = e.touches[0];
                    TooltipMgr.show(desc, touch.clientX, touch.clientY - 80);
                }, { passive: true });

                el.oncontextmenu = (e) => {
                    e.preventDefault();
                    if((!this.player.traits.noRerolls || (this.player.qteRerolls || 0) > 0)) {
                        die.selected = !die.selected;
                        this.renderDiceUI();
                    }
                };
            }
            slot.appendChild(el);
            container.appendChild(slot);
        });
        // Reroll badge shows remaining rerolls. For Annihilator, distinguishes
        // base rerolls from QTE-earned tokens (shown as "B+Q" when both exist)
        // so the player understands where each reroll came from. Gold tint +
        // pulse on presence of any QTE token.
        const badge = document.getElementById('reroll-badge');
        if (badge) {
            const unused = this.dicePool.filter(d => !d.used);
            const willReroll = unused.filter(d => !d.selected).length || unused.length;
            const isAnnihilator = this.player && this.player.classId === 'annihilator';
            const qteTokens = isAnnihilator ? (this.player.qteRerolls || 0) : 0;
            const base = this.rerolls || 0;
            // "3+1" if both > 0; "+1" for Annihilator with no base but tokens
            // (makes clear they're *earned*); plain number otherwise.
            let label;
            if (qteTokens > 0 && base > 0)     label = `${base}+${qteTokens}`;
            else if (qteTokens > 0)            label = `+${qteTokens}`;
            else                                label = String(base);
            badge.innerText = label;
            badge.dataset.reroll = willReroll;
            badge.classList.toggle('has-qte-token', qteTokens > 0);
        }
    },

	gainMana(amount) {
        this.player.mana += amount;
        if (this.player.hasRelic('recycle_bin')) {
            if (this.recycleBinCount < 5) {
                this.player.heal(1);
                this.recycleBinCount++;
                ParticleSys.createFloatingText(this.player.x, this.player.y - 60, "RECYCLE", "#0f0");
            }
        }
    },

    useDie(die, el, target) {
        if(die.used) return;
        const data = DICE_TYPES[die.type];
        const isUpgraded = this.player.hasDiceUpgrade(die.type);

        // Custom Run: Hot Hands — first die played each turn bites HP. Flag
        // is reset in the turn-start routine (startTurn).
        if (this._customHotHandsDmg && !this._hotHandsUsedThisTurn) {
            this._hotHandsUsedThisTurn = true;
            this.player.takeDamage(this._customHotHandsDmg, null, false, /*bypassShield*/ true);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 140,
                `HOT HANDS -${this._customHotHandsDmg}`, '#ff6600');
        }

        if (target) {
            const isTargetEnemy = (target instanceof Enemy || (target instanceof Minion && !target.isPlayerSide));
            const isTargetPlayer = (target instanceof Player || (target instanceof Minion && target.isPlayerSide));
            
            if (data.target === 'enemy' && !isTargetEnemy) {
                 ParticleSys.createFloatingText(target.x, target.y - 120, "INVALID TARGET", "#888");
                 return;
            }
            if ((data.target === 'self') && !isTargetPlayer) {
                 ParticleSys.createFloatingText(target.x, target.y - 120, "TARGET SELF/ALLY", "#888");
                 return;
            }
        }

        // Panopticon Analyse: first valid action of the turn is nullified.
        if (this.player._panopticonNullifyFirst) {
            this.player._panopticonNullifyFirst = false;
            if (this.enemy) this.enemy.analyzing = false;
            die.used = true;
            this.renderDiceUI();
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "NULLIFIED", "#00ffff");
            if (this.enemy) ParticleSys.createFloatingText(this.enemy.x, this.enemy.y + 80, "MOVE ANALYSED", "#00ffff");
            AudioMgr.playSound('hex_barrier');
            this.shake(6);
            return;
        }

        // Paradox Loop: first die of turn is free, subsequent dice cost +1.
        let effectiveCost = data.cost;
        if (this.player.hasRelic('c_paradox')) {
            const usedThisTurn = this.diceUsedThisTurn || 0;
            if (usedThisTurn === 0) {
                effectiveCost = 0;
            } else {
                effectiveCost = data.cost + 1;
            }
        }
        // Relic: HEX FRAGMENT — Skill dice cost -1 Mana per stack (min 0).
        if (data.isSkill && this.player.hasRelic('hex_fragment')) {
            const stacks = this.player.relics.filter(r => r.id === 'hex_fragment').length;
            effectiveCost = Math.max(0, effectiveCost - stacks);
        }
        // Relic: ECHO CHAMBER — first skill die each combat costs 0 Mana.
        if (data.isSkill && this.player.hasRelic('echo_chamber') && !this._echoChamberUsedThisCombat) {
            effectiveCost = 0;
            this._echoChamberUsedThisCombat = true;
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "ECHO CHAMBER", COLORS.GOLD);
        }

        if(effectiveCost > 0 && this.player.mana < effectiveCost) {
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "NO MANA", "#ff0000");
            el.style.transform = 'translateX(5px)';
            setTimeout(() => el.style.transform = 'translateX(-5px)', 50);
            setTimeout(() => el.style.transform = '', 100);
            return;
        }

        if(effectiveCost > 0) this.player.mana -= effectiveCost;
        this.diceUsedThisTurn = (this.diceUsedThisTurn || 0) + 1;

        TooltipMgr.hide();
        die.used = true;
        this.haptic('die_use');
        this._onDieConsumed(die);
        this.renderDiceUI();

        // Class-ability: broadcast dice use (fills Tactician pips, Annihilator heat)
        ClassAbility.onEvent('dice_used', { type: die.type });

        // Class-themed particle burst on every die use
        if (this.player && this.player.classId) {
            const burstTarget = (DICE_TYPES[die.type] && DICE_TYPES[die.type].target === 'enemy' && this.enemy)
                ? this.enemy : this.player;
            ParticleSys.createClassBurst(burstTarget.x, burstTarget.y, this.player.classId);
        }
        
        const type = die.type;
        const finalEnemy = (target instanceof Enemy || (target instanceof Minion && !target.isPlayerSide)) ? target : this.enemy;
        const finalSelf = (target instanceof Player || (target instanceof Minion && target.isPlayerSide)) ? target : this.player;

        const executeAction = async (qteMultiplier = 1.0) => {
            // ... (Tutorial Logic Removed for brevity, keep if existing) ...

            // Corrupted: UNSTABLE CORE — 25% chance skill dice fizzle (mana still spent).
            if (data.isSkill && this.player.hasRelic('c_unstable_core') && Math.random() < 0.25) {
                ParticleSys.createFloatingText(this.player.x, this.player.y - 140, "FIZZLE!", "#ff4400");
                AudioMgr.playSound('defend');
                return;
            }

            this.player.playAnim('lunge');

            let chargeMult = 1.0;
            if (this._isAttackSlot(type)) {
                 chargeMult = this.player.nextAttackMult;
                 this.player.nextAttackMult = 1;
            }
            
            if (this._dieSlot(type) === 'attack' && this.enemy) {
                // Combo: FLURRY — first ATTACK of a flurry hand hits all enemies.
                const flurryActive = !!this.comboFlurry;
                // Combo: DOUBLE STRIKE — first ATTACK of a double-strike roll hits twice.
                const doubleActive = !!this.comboDoubleStrike;
                // Relic: DAWN PROTOCOL — first attack of combat deals +100%.
                const dawnBonus = (!this.firstAttackDealt && this.player.hasRelic('dawn_protocol')) ? 2.0 : 1.0;
                this.firstAttackDealt = true;
                // Relic: DUSK PROTOCOL — after turn 5, +10% damage per turn beyond.
                const duskBonus = this.player.hasRelic('dusk_protocol') && this.turnCount > 5
                    ? 1 + Math.min(1.5, (this.turnCount - 5) * 0.1) : 1.0;
                if (this._dieSlot(type) === 'attack') {
                    this.attacksThisTurn++;
                    const rStacks = this.player.relics.filter(r => r.id === 'relentless').length;
                    let triggerRelentless = false;
                    if (rStacks === 1 && this.attacksThisTurn === 3) triggerRelentless = true;
                    else if (rStacks === 2 && this.attacksThisTurn === 2) triggerRelentless = true;
                    else if (rStacks >= 3 && this.attacksThisTurn === 1) triggerRelentless = true;

                    if (triggerRelentless) {
                        qteMultiplier *= 3.0;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "RELENTLESS!", COLORS.GOLD);
                    }

                    // Quantum Core: every 3rd attack of a turn is a guaranteed crit.
                    if (this.player.hasRelic('c_quantum_core') && this.attacksThisTurn % 3 === 0) {
                        qteMultiplier *= 1.5;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "QUANTUM CRIT", COLORS.PURPLE);
                    }
                }

                // Class fantasy attack VFX (Roadmap Part 26.1).
                // Each class gets its own signature animation; falls back to
                // the generic slash_heavy / blade_storm for classes that
                // haven't yet received a bespoke VFX asset.
                const _attackVfxByClass = {
                    tactician:    'attack_pawn_volley',
                    arcanist:     'attack_glyph_weave',
                    bloodstalker: 'attack_sanguine_bite',
                    annihilator:  'attack_overdrive',
                    sentinel:     'attack_bulwark_bash',
                    summoner:     'attack_verdant_lash'
                };
                const _vfxKey = _attackVfxByClass[this.player.classId] || (isUpgraded ? 'blade_storm' : 'slash_heavy');
                this.triggerVFX(_vfxKey, this.player, finalEnemy, null, { upgraded: isUpgraded });
                if (!isUpgraded) AudioMgr.playSound('attack');
                
                // Class-aware base damage
                let dmg;
                const _cid = this.player.classId;
                if (_cid === 'arcanist') {
                    dmg = (isUpgraded ? 6 : 4) + Math.min(5, this.player.mana || 0) * (isUpgraded ? 2 : 1);
                } else if (_cid === 'bloodstalker') {
                    dmg = isUpgraded ? 9 : 6;
                } else if (_cid === 'annihilator') {
                    dmg = isUpgraded ? 12 : 8;
                } else if (_cid === 'sentinel') {
                    dmg = (isUpgraded ? 5 : 3) + Math.floor((this.player.shield || 0) * (isUpgraded ? 0.4 : 0.3));
                } else if (_cid === 'summoner') {
                    const aliveMinions = this.player.minions ? this.player.minions.filter(m => m && m.currentHp > 0).length : 0;
                    dmg = (isUpgraded ? 6 : 4) + aliveMinions * (isUpgraded ? 3 : 2);
                } else {
                    // tactician or default
                    dmg = isUpgraded ? 10 : 5;
                }
                dmg = this.calculateCardDamage(dmg, type);
                // Relic: AEGIS CYCLER — next-attack flat bonus from shield conversion.
                if (this.player.nextAttackFlatBonus) {
                    dmg += this.player.nextAttackFlatBonus;
                    this.player.nextAttackFlatBonus = 0;
                }
                // Corrupted: PYRE — +30% attack DMG, but +1 self DMG per attack.
                let pyreMult = 1.0;
                if (this.player.hasRelic('c_pyre')) {
                    pyreMult = 1.3;
                    this.player.takeDamage(1);
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "PYRE", "#ff4400");
                }
                // Corrupted: GLITCH BLADE — random 1x to 3x base multiplier.
                let glitchMult = 1.0;
                if (this.player.hasRelic('c_glitch_blade')) {
                    glitchMult = 1 + Math.random() * 2;
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 140, `GLITCH x${glitchMult.toFixed(1)}`, "#ff00ff");
                }
                dmg = Math.floor(dmg * qteMultiplier * chargeMult * dawnBonus * duskBonus * pyreMult * glitchMult);

                // Relic: Thorn Mail (+2 Block) — also triggered by Sentinel signature T3 for this combat
                if(this.player.hasRelic('thorn_mail') || this._sigThornsActive) {
                    this.player.addShield(2);
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "THORN MAIL", COLORS.SHIELD);
                }

                if(this.player.hasRelic('crit_lens')) {
                    const stacks = this.stackCount('crit_lens');
                    if(Math.random() < (0.15 * stacks)) {
                        dmg *= 2;
                        ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 80, "LENS CRIT!", COLORS.ORANGE);
                    }
                }

                // Prevent runaway multiplier stacking (titan × lens × relentless × charge × crit).
                // Cap ATTACK damage at 10× the base card value.
                const attackBase = isUpgraded ? 10 : 5;
                const attackCap = attackBase * 10;
                if (dmg > attackCap) {
                    dmg = attackCap;
                    ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 110, "MAX DMG", COLORS.GOLD);
                }
                
                if(this.player.traits.lifesteal) {
                    // Blood Tier bonus: each tier adds +bloodTierLifestealBonus to the base heal.
                    const tier = this.player.bloodTier || 0;
                    const bonus = (this.player.traits.bloodTierLifestealBonus || 0) * tier;
                    this.player.heal(2 + bonus);
                }
                
                // Blade Storm: 30% Chance (or combo FLURRY, guaranteed AoE).
                const aoeThisHit = (isUpgraded && Math.random() < 0.30) || flurryActive;
                if (aoeThisHit) {
                    if (flurryActive) {
                        this.comboFlurry = false;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "FLURRY!", '#ff3355');
                    } else {
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "BLADE STORM", COLORS.GOLD);
                    }
                    const targets = [this.enemy, ...this._enemyMinions()];
                    let bossDead = false;
                    targets.forEach(t => {
                        this.triggerVFX('digital_sever', this.player, t);
                        if(t.takeDamage(dmg)) {
                            if(t === this.enemy) bossDead = true;
                            else if (this.enemy) this.enemy.minions = this.enemy.minions.filter(m => m !== t);
                        }
                    });
                    if(bossDead) { this.winCombat(); return; }
                } else {
                    // DOUBLE STRIKE: apply the damage twice on the first combo attack.
                    const hits = doubleActive ? 2 : 1;
                    if (doubleActive) {
                        this.comboDoubleStrike = false;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "DOUBLE STRIKE", '#ff3355');
                    }
                    for (let h = 0; h < hits; h++) {
                        if (!finalEnemy || finalEnemy.currentHp <= 0) break;
                        if (finalEnemy.takeDamage(dmg)) {
                            if (finalEnemy === this.enemy) { this.winCombat(); return; }
                            else {
                                if (this.enemy) this.enemy.minions = this.enemy.minions.filter(m => m !== finalEnemy);
                                if(this.player.hasRelic('brutalize') && !finalEnemy.isPlayerSide) {
                                     this.triggerBrutalize(finalEnemy);
                                }
                            }
                            return;
                        }
                    }
                }

                // CLASS-SPECIFIC ATTACK BONUSES
                const classId = this.player.classId;
                if (this._dieSlot(type) === 'attack' && classId) {
                    if (classId === 'tactician') {
                        // If enemy intends attack, grant +1 reroll
                        if (this.enemy && this.enemy.nextIntents && this.enemy.nextIntents.some(i => i.type === 'attack' || i.type === 'multi_attack')) {
                            this.rerolls = (this.rerolls || 0) + 1;
                            this.updateHUD();
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 170, "+1 REROLL", "#00f3ff");
                        }
                    } else if (classId === 'bloodstalker') {
                        // Apply 2 bleed (upgraded: 3) for 2 turns
                        if (finalEnemy && finalEnemy.currentHp > 0) {
                            const bleedDmg = isUpgraded ? 3 : 2;
                            finalEnemy.addEffect('bleed', 2, bleedDmg, '🩸', `Takes ${bleedDmg} DMG at end of turn.`, 'BLEED');
                            ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 100, `BLEED ${bleedDmg}`, "#ff0000");
                        }
                    }
                    // Arcanist: mana-scaling already handled via base damage calc
                    // Annihilator: heat added via ClassAbility.onEvent
                    // Sentinel: shield-bash scaling handled via base damage calc
                    // Summoner: minion-scaling handled via base damage calc
                }

                // Relic: VENOM EDGE — attacks apply 1 stack of Poison (2 DMG/turn, 3 turns).
                if (this.player.hasRelic('venom_edge') && finalEnemy && finalEnemy.currentHp > 0) {
                    const stacks = this.player.relics.filter(r => r.id === 'venom_edge').length;
                    const poisonDmg = 2 * stacks;
                    finalEnemy.addEffect('poison', 3, poisonDmg, '☠️', `Takes ${poisonDmg} DMG at end of turn.`, 'POISON');
                    ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 110, `POISON ${poisonDmg}`, "#88ff00");
                }

                // Relic: DERVISH MODE — 3 attacks in a turn → +2 Mana.
                if (this.player.hasRelic('dervish_mode') && this.attacksThisTurn === 3) {
                    const stacks = this.player.relics.filter(r => r.id === 'dervish_mode').length;
                    const manaGain = 2 * stacks;
                    this.player.mana = Math.min(this.player.maxMana || 99, this.player.mana + manaGain);
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 160, `DERVISH +${manaGain}`, "#ff4400");
                }

            } else if (this._dieSlot(type) === 'defend') {
                const defendClassId = this.player.classId;
                let shieldAmt = isUpgraded ? 10 : 5;
                // Combo: BULWARK doubles the first shield gained this roll.
                if (this.comboBulwark) {
                    shieldAmt *= 2;
                    this.comboBulwark = false;
                    ParticleSys.createFloatingText(finalSelf.x, finalSelf.y - 150, "BULWARK x2", COLORS.SHIELD);
                }
                // Relic: IRON LUNG — first defend each turn grants +5 extra Shield.
                if (!this.firstDefendUsedThisTurn && this.player.hasRelic('iron_lung')) {
                    shieldAmt += 5;
                    this.firstDefendUsedThisTurn = true;
                    ParticleSys.createFloatingText(finalSelf.x, finalSelf.y - 140, "IRON LUNG +5", COLORS.SHIELD);
                }
                // Bloodstalker: Blood Ward — heal instead of shielding
                if (defendClassId !== 'bloodstalker') {
                    finalSelf.addShield(shieldAmt);
                }

                // Trigger Visual
                this.triggerVFX('hex_barrier', null, finalSelf);

                // Shield Minions if Upgraded
                if(isUpgraded) {
                    this.player.minions.forEach(m => {
                        m.addShield(5);
                        this.triggerVFX('hex_barrier', null, m);
                    });
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "AEGIS FIELD", COLORS.SHIELD);
                }

                // Safe Audio
                try { AudioMgr.playSound('defend'); } catch(e) {}

                // CLASS-SPECIFIC DEFEND BONUSES
                if (this._dieSlot(type) === 'defend' && this.player.classId) {
                    const cid = this.player.classId;
                    if (cid === 'tactician') {
                        const rerollBonus = isUpgraded ? 2 : 1;
                        this.rerolls = (this.rerolls || 0) + rerollBonus;
                        const rerollBadge = document.getElementById('reroll-badge');
                        if (rerollBadge) rerollBadge.innerText = this.rerolls;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 170, `+${rerollBonus} REROLL`, "#00d4e6");
                    } else if (cid === 'bloodstalker') {
                        // Sanguine Pact: heal the player; any heal that would
                        // overflow past max HP contributes to the Blood Pool
                        // instead (routed through the damage_taken hook so the
                        // bar fill logic is shared). Makes the die still
                        // valuable when at full HP — you're charging the
                        // tribute bar instead of wasting the heal.
                        const healAmt = isUpgraded ? 5 : 3;
                        const before = this.player.currentHp;
                        const after = Math.min(this.player.maxHp, before + healAmt);
                        const actualHeal = after - before;
                        const overflow = healAmt - actualHeal;
                        this.player.currentHp = after;
                        if (actualHeal > 0) {
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, `+${actualHeal} HP`, "#ff0000");
                        }
                        if (overflow > 0) {
                            ClassAbility.onEvent('damage_taken', { amount: overflow, source: 'sanguine_overflow' });
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 140, `+${overflow} BLOOD POOL`, "#ff2244");
                        }
                    } else if (cid === 'annihilator') {
                        // Ricochet — reduce incoming damage next turn by 20%, stacking
                        this.player.ricochetStacks = (this.player.ricochetStacks || 0) + 1;
                        const pct = Math.min(100, this.player.ricochetStacks * (isUpgraded ? 30 : 20));
                        if (this.player.ricochetStacks >= 3) {
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 170, "FULL IMMUNITY!", "#ff8800");
                        } else {
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 170, `RICOCHET -${pct}%`, "#ff6600");
                        }
                    } else if (cid === 'sentinel') {
                        // Thorns until next turn
                        const thorns = isUpgraded ? 3 : 2;
                        this.player.tempThorns = (this.player.tempThorns || 0) + thorns;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 170, `+${thorns} THORNS`, "#ffffff");
                    } else if (cid === 'summoner') {
                        // Shield all minions
                        const minionShield = isUpgraded ? 4 : 3;
                        if (this.player.minions) {
                            this.player.minions.forEach(m => {
                                if (m && m.currentHp > 0) {
                                    m.shield = (m.shield || 0) + minionShield;
                                    ParticleSys.createFloatingText(m.x, m.y - 50, `+${minionShield} SH`, "#00cc77");
                                }
                            });
                        }
                    }
                }

            } else if (this._dieSlot(type) === 'mana') {
                this.gainMana(isUpgraded ? 2 : 1);
                if(isUpgraded) {
                    this.player.heal(1); // Skill: Soul Battery (Heal 1)
                }
                // Combo: OVERFLOW — each MANA in an overflow-combo roll also grants a reroll.
                if (this.comboOverflow) {
                    this.rerolls += 1;
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "OVERFLOW +1 REROLL", COLORS.GOLD);
                    this.updateHUD && this.updateHUD();
                }
                this.triggerVFX('overclock', null, this.player);

                // CLASS-SPECIFIC MANA BONUSES
                if (this._dieSlot(type) === 'mana' && this.player.classId) {
                    const cid = this.player.classId;
                    if (cid === 'tactician') {
                        // Enemy takes +1 DMG this turn (intel debuff)
                        if (this.enemy) {
                            this.enemy.intelDebuff = (this.enemy.intelDebuff || 0) + (isUpgraded ? 2 : 1);
                            ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, `EXPOSED +${isUpgraded ? 2 : 1} DMG`, "#00b8cc");
                        }
                    } else if (cid === 'arcanist') {
                        // Bonus mana if already have 3+
                        if (this.player.mana >= 3) {
                            const bonus = isUpgraded ? 3 : 2;
                            this.player.mana += bonus - 1; // -1 because base already gave 1 extra (upgraded gives 2 base)
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 170, `RESONANCE +${bonus - 1}`, "#d070ff");
                        }
                    } else if (cid === 'bloodstalker') {
                        // Blood Price: +2 mana total, -1 HP. Base mana die already
                        // awarded 1 mana above, so add 1 more here; pay 1 HP.
                        this.player.mana = Math.min(this.player.maxMana || 99, this.player.mana + 1);
                        const hpCost = 1;
                        this.player.currentHp = Math.max(1, this.player.currentHp - hpCost);
                        // Self-inflicted HP loss still feeds the Blood Pool.
                        ClassAbility.onEvent('damage_taken', { amount: hpCost, source: 'self' });
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "+1 MANA / -1 HP", "#990000");
                        if (isUpgraded && this.enemy) {
                            this.enemy.addEffect('frail', 2, 0, '💢', '+30% Dmg Taken.', 'FRAIL');
                            ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, "FRAIL", "#ff0055");
                        }
                    } else if (cid === 'annihilator') {
                        // +5 heat (+8 upgraded)
                        ClassAbility.onEvent('heat_add', { amount: isUpgraded ? 8 : 5 });
                        if (isUpgraded && ClassAbility._state && ClassAbility._state.heat > 50) {
                            this.player.mana += 1;
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 170, "+1 BONUS MANA", "#ff4400");
                        }
                    } else if (cid === 'sentinel') {
                        // +3 shield (+5 upgraded)
                        const shieldAmt = isUpgraded ? 5 : 3;
                        this.player.shield = (this.player.shield || 0) + shieldAmt;
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 170, `+${shieldAmt} SHIELD`, "#e0e0e0");
                        if (isUpgraded && this.player.shield > 15) {
                            this.player.mana += 1;
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 200, "+1 BONUS MANA", "#ffffff");
                        }
                    } else if (cid === 'summoner') {
                        // Grove Tap: heal player + all minions. Base 1 HP,
                        // upgraded (Deep Roots) 2 HP.
                        const healAmt = isUpgraded ? 2 : 1;
                        this.player.heal(healAmt);
                        ParticleSys.createFloatingText(this.player.x, this.player.y - 110, `+${healAmt} HP`, '#00ff66');
                        if (this.player.minions) {
                            this.player.minions.forEach(m => {
                                if (m && m.currentHp > 0) {
                                    m.currentHp = Math.min(m.maxHp, m.currentHp + healAmt);
                                    ParticleSys.createFloatingText(m.x, m.y - 50, `+${healAmt} HP`, '#00ff66');
                                }
                            });
                        }
                    }
                }

            } else if (this._dieSlot(type) === 'minion') {
                if (target instanceof Minion && target.isPlayerSide) {
                    if (isUpgraded) {
                        target.maxHp += 10; target.currentHp += 10; target.dmg += 5; target.level++;
                        if (target.name.includes("Bomb")) {
                            target.charges++;
                            ParticleSys.createFloatingText(target.x, target.y - 120, "+1 CHARGE", COLORS.ORANGE);
                        }
                        ParticleSys.createFloatingText(target.x, target.y - 80, "ALPHA BOOST!", COLORS.GOLD);
                        target.playAnim('pulse');
                        AudioMgr.playSound('upgrade');
                    } else if (this.player.classId === 'summoner') {
                        // Call Spirit on an existing Spirit → bonded growth:
                        // +2 HP + +2 DMG instead of the generic +1/+1 from
                        // upgrade(). Mirrors the fantasy of the call feeding
                        // an already-summoned ally rather than making a new
                        // one. Still fires the minion_upgraded event so the
                        // grove plot blooms.
                        target.maxHp += 2;
                        target.currentHp += 2;
                        target.dmg += 2;
                        target.level++;
                        ParticleSys.createFloatingText(target.x, target.y - 80, "+2 HP / +2 DMG", '#00ff99');
                        target.playAnim('pulse');
                        AudioMgr.playSound('upgrade');
                        try {
                            if (typeof ClassAbility !== 'undefined' && ClassAbility.onEvent) {
                                ClassAbility.onEvent('minion_upgraded', { minion: target });
                            }
                        } catch (_) { /* ignore */ }
                    } else {
                        target.upgrade();
                    }
                } else {
                    if (this.player.minions.length < this.player.maxMinions) {
                        const m = new Minion(0, 0, this.player.minions.length + 1, true);
                        m.spawnTimer = 1.0;

                        if(isUpgraded) {
                            m.upgrade();
                            m.addShield(5);
                            m.dmg += 5;
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "ALPHA CALL", COLORS.GOLD);
                        }
                        // Combo: SIBLING BOND — minions spawned with combo active get +3 HP.
                        if (this.comboSiblingBond) {
                            m.maxHp += 3; m.currentHp += 3;
                            ParticleSys.createFloatingText(m.x || this.player.x, (m.y || this.player.y) - 80, "BOND +3", '#00ff99');
                        }
                        if(this.player.traits.startShield) m.addShield(10);
                        
                        // Relic: Minion Core Shield
                        if(this.player.hasRelic('minion_core')) m.addShield(5);

                        // Relic: Neural Link (+3/+3)
                        if(this.player.hasRelic('neural_link')) { m.maxHp += 3; m.currentHp += 3; m.dmg += 3; }
                        
                        this.player.minions.push(m);
                        this.triggerVFX('materialize', null, {x: this.player.x, y: this.player.y});
                        // Class-fantasy summon VFX — fires after updateMinionPositions
                        // so it anchors to the minion's real slot position.
                        this._triggerSummonVfx(m);
                    } else {
                        if(this.player.minions.length > 0) {
                            const m = this.player.minions[Math.floor(Math.random() * this.player.minions.length)];
                            m.upgrade();
                        }
                        // Minion die used while grove is full — the spawn was
                        // blocked by maxMinions but the intent to summon still
                        // feeds the Grove so the glyph plot advances. Summoner's
                        // bloom amplify payoff is reachable through repeated use
                        // of the MINION die even when no new spirit can spawn.
                        ClassAbility.onEvent && ClassAbility.onEvent('minion_summoned', { blocked: true });
                    }
                }
            }
            else if (type === 'EARTHQUAKE') {
                this.triggerVFX('earthquake', this.player, this.enemy); 
                setTimeout(() => {
                    const targets = [this.enemy, ...this._enemyMinions()];
                    let deadEnemy = false;
                    targets.forEach(t => {
                        let dmg = isUpgraded ? 12 : 5; // Skill: Cataclysm (12)
                        dmg = this.calculateCardDamage(dmg, type); 
                        dmg = Math.floor(dmg * qteMultiplier * chargeMult);
                        
                        if(isUpgraded) {
                            t.addEffect('weak', 1, 0, '🦠', '50% less Dmg.', 'WEAK');
                        }
                        
                        if (t.takeDamage(dmg)) {
                            if (t === this.enemy) deadEnemy = true;
                            else {
                                if (this.enemy) this.enemy.minions = this.enemy.minions.filter(m => m !== t);
                                if(this.player.hasRelic('brutalize') && !t.isPlayerSide) {
                                     this.triggerBrutalize(t);
                                }
                            }
                        }
                    });
                    if (this.enemy && this.enemy.currentHp > 0) this.enemy.updateIntentValues();
                    if(deadEnemy) { this.winCombat(); return; }
                }, 500);

            } else if (type === 'METEOR') {
                const onMeteorHit = () => {
                    let dmg = isUpgraded ? 60 : 50; // Skill: Starfall (60?) No, list says 50 is fine, keeping 50 for base/upgraded check. Wait, previous list said 50 DMG.
                    // Actually, I will make upgraded 60 as per standard buff logic if desired, but user said "Keep as is" for Meteor.
                    // Checking list: METEOR Starfall: 50 DMG. Keep as is.
                    // So Upgraded stays 50 (base 30).
                    
                    dmg = this.calculateCardDamage(dmg, type); 
                    dmg = Math.floor(dmg * qteMultiplier * chargeMult); 
                    
                    if (finalEnemy.takeDamage(dmg)) {
                        if (finalEnemy === this.enemy) { 
                            this.winCombat();
                        } else {
                            if (this.enemy) this.enemy.minions = this.enemy.minions.filter(m => m !== finalEnemy);
                            if(this.player.hasRelic('brutalize') && !finalEnemy.isPlayerSide) {
                                 this.triggerBrutalize(finalEnemy);
                            }
                        }
                    }
                };
                this.triggerVFX('orbital_strike', this.player, finalEnemy, onMeteorHit);

            } else if (type === 'CONSTRICT') {
                 const val = isUpgraded ? 0.25 : 0.5;
                 const dur = isUpgraded ? 4 : 3;
                 const name = isUpgraded ? "DIGITAL ROT" : "CONSTRICT";
                 const icon = isUpgraded ? DICE_UPGRADES.CONSTRICT.icon : DICE_TYPES.CONSTRICT.icon;
                 finalEnemy.addEffect('constrict', dur, val, icon, 'Atk/Heal reduced.', name);
                 this.triggerVFX('chains', this.player, finalEnemy);
                 
            } else if (type === 'VOODOO') {
                 let val = 0;
                 if (!isUpgraded) val = this.calculateCardDamage(150); // Skill: Void Curse Base 150
                 const name = isUpgraded ? "VOID CURSE" : "VOODOO";
                 const icon = isUpgraded ? DICE_UPGRADES.VOODOO.icon : DICE_TYPES.VOODOO.icon;
                 finalEnemy.addEffect('voodoo', 3, val, icon, 'Doom incoming.', name);
                 this.triggerVFX('logic_bomb', this.player, finalEnemy);
                 
            } else if (type === 'OVERCHARGE') {
                 const val = isUpgraded ? 1 : 0;
                 const name = isUpgraded ? "HYPER BEAM" : "OVERCHARGE";
                 const icon = isUpgraded ? DICE_UPGRADES.OVERCHARGE.icon : DICE_TYPES.OVERCHARGE.icon;
                 finalEnemy.addEffect('overcharge', 3, val, icon, 'Unstable: Dmg Taken increased.', name);
                 this.triggerVFX('lightning', this.player, finalEnemy);
                 
            } else if (type === 'RECKLESS_CHARGE') {
                if (isUpgraded) {
                    this.player.nextAttackMult = 3;
                    this.player.incomingDamageMult = 1.5;
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "VICIOUS CHARGE", "#ff0000");
                } else {
                    this.player.nextAttackMult = 2;
                    this.player.incomingDamageMult = 3;
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "RECKLESS CHARGE", "#ff4400");
                }
                this.triggerVFX('overheat', null, this.player);
            } else if (type === 'SIGNATURE') {
                this._resolveSignature(data, finalEnemy, finalSelf, qteMultiplier, chargeMult);
                if (this.enemy && this.enemy.currentHp <= 0) { this.winCombat(); return; }
            }

            this.updateHUD();
            this.renderDiceUI();
            if(this.enemy) {
                this.enemy.checkPhase();
                this.enemy.updateIntentValues();
            }

            if (this.currentState === STATE.TUTORIAL_COMBAT) {
                if (this.tutorialStep === 6 && this._dieSlot(type) === 'attack') {
                    this.tutorialStep = 7;
                    setTimeout(() => this.updateTutorialStep(), 500);
                } else if (this.tutorialStep === 7 && this._dieSlot(type) === 'defend') {
                    this.tutorialStep = 8;
                    setTimeout(() => this.updateTutorialStep(), 500);
                } else if (this.tutorialStep === 11 && this._dieSlot(type) === 'minion') {
                    this.tutorialStep = 12;
                    setTimeout(() => this.updateTutorialStep(), 500);
                }
            }
        };

        if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 5 && this._dieSlot(type) === 'attack') {
            this.tutorialStep = 6;
            this.updateTutorialStep();
        }

        if (this._isAttackSlot(type)) {
             this.startQTE('ATTACK', finalEnemy.x, finalEnemy.y, executeAction);
             return;
        }

        executeAction();
    },

    // Route each class's signature strike to a unique on-canvas animation.
    // Each branch pushes effect descriptors onto this.effects; the draw
    // loop in drawEffects picks them up and renders them. Effects are
    // time-gated via `life`/`maxLife` and self-clean when expired.
    triggerSignatureVFX(classId, source, target) {
        if (!source || !target) return;
        const sx = source.x, sy = source.y;
        const tx = target.x, ty = target.y;
        if (classId === 'bloodstalker') {
            // BITE — two curved fangs converge on the target and snap shut,
            // then a spray of blood droplets bursts outward. Windup 10 frames,
            // snap at 18, recoil 10. The chomp is the thing the player feels.
            this.effects.push({
                type: 'sig_bite',
                x: tx, y: ty, sx, sy,
                life: 38, maxLife: 38,
                color: '#ff0033'
            });
            AudioMgr.playSound('digital_sever');
            setTimeout(() => {
                ParticleSys.createExplosion(tx, ty, 28, '#ff0055');
                ParticleSys.createSparks(tx, ty, '#ff3355', 14);
                this.shake(10);
            }, 220);
        } else if (classId === 'tactician') {
            // VOLLEY — five darts fired in a narrow fan, staggered arrival.
            const arrows = 5;
            for (let k = 0; k < arrows; k++) {
                setTimeout(() => {
                    const spread = (k - (arrows - 1) / 2) * 0.09; // fan angle
                    this.effects.push({
                        type: 'sig_volley_dart',
                        sx, sy, tx, ty,
                        progress: 0,
                        spread,
                        life: 24, maxLife: 24,
                        color: '#00f3ff'
                    });
                }, k * 55);
            }
            AudioMgr.playSound('dart');
            setTimeout(() => { ParticleSys.createSparks(tx, ty, '#00f3ff', 12); this.shake(6); }, 320);
        } else if (classId === 'arcanist') {
            // SPARK — forked lightning bolt from source to target. Flickers
            // twice before detonating at the target.
            this.effects.push({
                type: 'sig_spark',
                sx, sy, tx, ty,
                life: 26, maxLife: 26,
                color: '#bc13fe',
                seed: Math.random() * 1000
            });
            AudioMgr.playSound('zap');
            setTimeout(() => {
                ParticleSys.createShockwave(tx, ty, '#bc13fe', 26);
                ParticleSys.createExplosion(tx, ty, 20, '#bc13fe');
                this.shake(8);
            }, 200);
        } else if (classId === 'annihilator') {
            // BLAST — windup flash at source, then a concussive explosion
            // with two expanding rings at the target.
            this.effects.push({
                type: 'slash_windup', x: sx, y: sy,
                life: 14, maxLife: 14, heavy: true, color: '#ff8800'
            });
            setTimeout(() => {
                for (let k = 0; k < 2; k++) {
                    this.effects.push({
                        type: 'earthquake_ring',
                        x: tx, y: ty,
                        radius: 10, maxRadius: 320 + k * 60,
                        life: 40, maxLife: 40,
                        color: k === 0 ? '#ff8800' : '#ffaa00'
                    });
                }
                ParticleSys.createExplosion(tx, ty, 40, '#ff8800');
                ParticleSys.createShockwave(tx, ty, '#ffaa00', 34);
                AudioMgr.playSound('explosion');
                this.triggerScreenFlash && this.triggerScreenFlash('rgba(255, 136, 0, 0.25)', 180);
                this.shake(16);
            }, 160);
        } else if (classId === 'sentinel') {
            // BASH — gold shield-plate slams down over the target. An
            // octagonal impact ring expands from the landing.
            this.effects.push({
                type: 'sig_bash',
                x: tx, y: ty,
                life: 28, maxLife: 28,
                color: '#ffd76a'
            });
            AudioMgr.playSound('grid_fracture');
            setTimeout(() => {
                ParticleSys.createShockwave(tx, ty, '#ffd76a', 30);
                ParticleSys.createSparks(tx, ty, '#ffffff', 18);
                this.shake(12);
            }, 240);
        } else if (classId === 'summoner') {
            // CALL — summoning rune pulses at the player, then a spirit
            // arcs to the target and lands as a leaf-burst.
            this.effects.push({
                type: 'sig_call_rune',
                x: sx, y: sy,
                life: 22, maxLife: 22,
                color: '#00ff99'
            });
            setTimeout(() => {
                this.effects.push({
                    type: 'sig_call_spirit',
                    sx, sy, tx, ty,
                    progress: 0,
                    life: 28, maxLife: 28,
                    color: '#00ff99'
                });
                AudioMgr.playSound('mana');
            }, 180);
            setTimeout(() => {
                ParticleSys.createExplosion(tx, ty, 26, '#00ff99');
                ParticleSys.createSparks(tx, ty, '#7fff00', 14);
                this.shake(8);
            }, 420);
        } else {
            // Unknown class — fall back to the generic heavy slash.
            this.triggerVFX('slash_heavy', source, target);
        }
    },

    // Resolve class signature die effects. Tier 1..3 ramps damage and side-effects.
    _resolveSignature(data, finalEnemy, finalSelf, qteMultiplier = 1, chargeMult = 1) {
        const tier = (data && data.signatureTier) || 1;
        const name = (data && data.signatureName) || 'SIGNATURE';
        const classId = this.player && this.player.classId;
        const label = COLORS.GOLD;
        const applyDmg = (base) => {
            if (!finalEnemy || finalEnemy.currentHp <= 0) return false;
            let dmg = this.calculateCardDamage(base, 'ATTACK');
            dmg = Math.floor(dmg * qteMultiplier * chargeMult);
            // Class-unique signature animation. Each class gets a distinct
            // visual identity — Bloodstalker chomps, Tactician volleys, etc.
            // Falls back to the generic slash_heavy if the class is unknown.
            this.triggerSignatureVFX(classId, this.player, finalEnemy);
            AudioMgr.playSound('attack');
            const dead = finalEnemy.takeDamage(dmg);
            ParticleSys.createFloatingText(finalEnemy.x, finalEnemy.y - 100, name.toUpperCase(), label);
            return dead;
        };

        if (classId === 'tactician') {
            const base = [7, 10, 14][tier - 1];
            applyDmg(base);
            const extra = [1, 1, 2][tier - 1];
            this.rerolls = (this.rerolls || 0) + extra;
            ParticleSys.createFloatingText(this.player.x, this.player.y - 110, `+${extra} REROLL`, COLORS.CYAN);
        } else if (classId === 'arcanist') {
            const base = [6, 12, 18][tier - 1];
            applyDmg(base);
            const mana = [1, 2, 3][tier - 1];
            this.gainMana(mana);
            if (tier === 3 && finalEnemy) finalEnemy.addEffect('weak', 2, 0, '🦠', '50% less Dmg.', 'WEAK');
        } else if (classId === 'bloodstalker') {
            const base = [8, 12, 18][tier - 1];
            applyDmg(base);
            const heal = [3, 6, 10][tier - 1];
            this.player.heal(heal);
            if (tier === 3 && finalEnemy) finalEnemy.addEffect('frail', 2, 0, '💢', '+50% Dmg Taken.', 'FRAIL');
        } else if (classId === 'annihilator') {
            const base = [12, 18, 28][tier - 1];
            // Shield-ignoring hit: bypass the enemy's shield by adding the shield
            // value as bonus flat damage, leaving shield untouched afterwards.
            const shieldToPierce = finalEnemy ? (finalEnemy.shield || 0) : 0;
            applyDmg(base + shieldToPierce);
            if (tier >= 2 && finalEnemy && finalEnemy.currentHp > 0) finalEnemy.addEffect('weak', 2, 0, '🦠', '50% less Dmg.', 'WEAK');
            if (tier === 3 && finalEnemy && finalEnemy.currentHp > 0) finalEnemy.addEffect('stun', 1, 0, '💫', 'Skips Turn.', 'STUN');
        } else if (classId === 'sentinel') {
            const shieldAmt = [10, 15, 22][tier - 1];
            this.player.addShield(shieldAmt);
            this.triggerVFX('hex_barrier', null, finalSelf);
            const base = [4, 8, 14][tier - 1];
            applyDmg(base);
            // Tier 3: apply a combat-scoped thorns buff (stacks block on damage)
            // rather than granting a persistent relic — dedup if already active.
            if (tier === 3) {
                this._sigThornsActive = true;
            }
        } else if (classId === 'summoner') {
            const spawns = tier === 3 ? 2 : 1;
            for (let i = 0; i < spawns; i++) {
                if (this.player.minions.length < (this.player.maxMinions || 2)) {
                    const m = new Minion(0, 0, this.player.minions.length + 1, true);
                    m.spawnTimer = 1.0;
                    this.player.minions.push(m);
                    this.triggerVFX('materialize', null, { x: this.player.x, y: this.player.y });
                } else {
                    // Signature die tried to spawn but grove is full — still
                    // feed the glyph so amplify becomes reachable.
                    ClassAbility.onEvent && ClassAbility.onEvent('minion_summoned', { blocked: true });
                }
            }
            const base = [4, 8, 12][tier - 1];
            applyDmg(base);
            if (tier >= 2) this.player.minions.forEach(m => m.heal && m.heal(3));
            if (tier === 3) this.player.minions.forEach(m => { m.dmg = (m.dmg || 0) + 3; });
        } else {
            applyDmg(8 + tier * 3);
        }
    },
    
    triggerBrutalize(source) {
        if(!this.player.hasRelic('brutalize')) return;
        
        const stacks = this.player.relics.filter(r => r.id === 'brutalize').length;
        const dmg = 20 * stacks; // Updated to 20
        
        const targets = [];
        if (this.enemy && this.enemy !== source && this.enemy.currentHp > 0) targets.push(this.enemy);
        this._enemyMinions().forEach(m => {
            if(m !== source && m.currentHp > 0) targets.push(m);
        });

        if(targets.length > 0) {
            ParticleSys.createFloatingText(source.x, source.y, `BRUTALIZE (${dmg})`, "#ff0000");
            AudioMgr.playSound('hit');

            let bossDied = false;
            targets.forEach(t => {
                if(t.takeDamage(dmg)) {
                    if(t === this.enemy) bossDied = true;
                    else if (this.enemy) this.enemy.minions = this.enemy.minions.filter(min => min !== t);
                }
            });

            if(bossDied) this.winCombat();
        }
    },

    rerollDice() {
        // TUTORIAL RIGGING
        if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 10) {
            const cd = this.player && this.player.classId
                ? (PLAYER_CLASSES.find(c => c.id === this.player.classId) || {}).classDice || {}
                : {};
            this.dicePool = [
                { id: 0, type: cd.minion || 'TAC_MINION', used: false, selected: false },
                { id: 1, type: cd.attack || 'TAC_ATTACK', used: false, selected: false }
            ];
            this.rerolls--;
            this.renderDiceUI();

            this.tutorialStep = 11;
            this.updateTutorialStep();
            return;
        }

        // STANDARD LOGIC
        const isAnnihilator = this.player.classId === 'annihilator';

        // Custom Run: Locked In — no rerolls at all.
        if (this._customDisableReroll) {
            ParticleSys.createFloatingText(this.player.x, this.player.y - 80, 'LOCKED IN', '#ff3355');
            AudioMgr.playSound('defend');
            return;
        }

        // Allow if rerolls > 0 OR (rerolls <= 0 AND is Annihilator)
        if (this.rerolls <= 0 && !isAnnihilator) return;

        Hints.trigger('first_reroll');

        // New semantics (§2.5): SELECTED = locked (don't reroll). Reroll everything else.
        // Sealed dice (from events/relics) are always locked regardless of selection.
        const unused = this.dicePool.filter(d => !d.used && !d.sealed);
        let toReroll = unused.filter(d => !d.selected);
        if (toReroll.length === 0 && unused.length > 0) {
            toReroll = unused;
        }
        if (toReroll.length === 0) return;

        // Calculate Cost
        let hpCost = 0;
        let qteTokenSpent = false;
        if (this.rerolls <= 0 && isAnnihilator) {
            // Class rework: QTE-crit-earned reroll tokens spend FIRST (reward skilled play),
            // falling back to the classic HP-cost reroll only if no tokens remain.
            if ((this.player.qteRerolls || 0) > 0) {
                qteTokenSpent = true;
            } else {
                hpCost = Math.floor(this.player.maxHp * 0.2);
                // Prevent suicide reroll
                if (this.player.currentHp <= hpCost) {
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 50, "HP TOO LOW", "#ff0000");
                    AudioMgr.playSound('defend'); // Error sound
                    return;
                }
            }
        }

        // Apply Cost
        if (qteTokenSpent) {
            this.player.qteRerolls = Math.max(0, (this.player.qteRerolls || 0) - 1);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "QTE REROLL", "#ffcc00");
            this.updateHUD && this.updateHUD();
        } else if (hpCost > 0) {
            // Blood Reroll is a self-cost — it must bite HP directly, even
            // through shields. Shield-absorbed blood makes the entire class
            // fantasy pointless.
            this.player.takeDamage(hpCost, null, false, /*bypassShield*/ true);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, `BLOOD REROLL`, "#ff0000");
        } else if (this.player.hasRelic && this.player.hasRelic('dice_cache') && !this.freeRerollUsedThisTurn) {
            // Relic: DICE CACHE — first reroll each turn is free.
            this.freeRerollUsedThisTurn = true;
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "DICE CACHE (free reroll)", COLORS.GOLD);
        } else if (this.player.hasRelic && this.player.hasRelic('c_fracture')) {
            // Corrupted: FRACTURE — rerolls cost 2 HP but refund themselves (infinite rerolls as long as HP lasts).
            // Same reasoning as blood reroll: bypass shield so the HP cost is real.
            this.player.takeDamage(2, null, false, /*bypassShield*/ true);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "FRACTURE -2HP", "#ff4444");
        } else {
            this.rerolls--;
        }

        const availableTypes = this._getAvailableDiceTypes();
        // Once-per-hand types already on dice we aren't rerolling stay reserved.
        const keptUnique = new Set(
            this.dicePool
                .filter(d => !toReroll.includes(d))
                .map(d => d.type)
                .filter(t => this.UNIQUE_PER_HAND.has(t))
        );

        // Slot-machine roll: animate + cycle icons on each rerolling die.
        // Store interval IDs on this so changeState() can cancel them if
        // combat ends during the animation window.
        this._clearRerollIntervals();
        const diceEls = document.querySelectorAll('#dice-container .die');
        diceEls.forEach((el, idx) => {
            if (toReroll.includes(this.dicePool[idx])) {
                el.classList.add('rerolling');
                const face = el.querySelector('.die-face');
                if (face) {
                    const id = setInterval(() => {
                        const pick = availableTypes[Math.floor(Math.random() * availableTypes.length)];
                        const data = DICE_TYPES[pick];
                        face.innerHTML = data.icon;
                        el.style.borderColor = data.color;
                        el.style.color = data.color;
                    }, 70);
                    this._rerollIntervals.push(id);
                }
            }
        });
        // Reroll feel: haptic tick + richer sound + gold sparks from player,
        // plus a short pulse on the reroll button itself so the input reads.
        AudioMgr.playSound('mana');
        if (this.haptic) this.haptic('die_use');
        if (this.player) ParticleSys.createSparks(this.player.x, this.player.y - 30, COLORS.GOLD, 12);
        const rerollBtn = document.getElementById('btn-reroll');
        if (rerollBtn) {
            rerollBtn.classList.remove('reroll-pulse');
            void rerollBtn.offsetWidth;
            rerollBtn.classList.add('reroll-pulse');
            setTimeout(() => rerollBtn.classList.remove('reroll-pulse'), 520);
        }

        this._rerollTimeout = setTimeout(() => {
            this._clearRerollIntervals();

            toReroll.forEach(d => {
                d.type = this._pickDiceType(availableTypes, keptUnique);
                d.selected = false;
            });

            // Re-scan for combos on the new hand so glow/banner/climax track
            // the rerolled dice, not the previous roll.
            this._detectAndApplyCombos();
            this.renderDiceUI();
        }, 520);
    },
    
    performAttackEffect(source, target) {
        // Class-fantasy flourish colour (Part 26). Each class attack is
        // tinted by its signature hue so a tactician volley reads cyan,
        // an arcanist bolt reads purple, etc. Falls back to the generic
        // mana colour for non-class sources (minions, enemies).
        const CLASS_ACCENT = {
            tactician:    '#00f3ff',
            arcanist:     '#bc13fe',
            bloodstalker: '#ff0055',
            annihilator:  '#ff8800',
            sentinel:     '#ffd76a',
            summoner:     '#7fff00'
        };
        let color;
        if (source instanceof Player && source.classId && CLASS_ACCENT[source.classId]) {
            color = CLASS_ACCENT[source.classId];
        } else if (source.isPlayerSide || source instanceof Player) {
            color = COLORS.MANA;
        } else {
            color = COLORS.MECH_LIGHT;
        }
        this.effects.push({
            sx: source.x, sy: source.y,
            tx: target.x, ty: target.y,
            color: color,
            life: 15, maxLife: 15
        });
        // Short spark burst at the source so the attack reads as "class X
        // firing" rather than an anonymous line. Tight count — just enough
        // to colour the moment without flooding the canvas.
        if (source instanceof Player && CLASS_ACCENT[source.classId]) {
            ParticleSys.createSparks(source.x, source.y - 10, color, 6);
        }
    },

    // Sector-themed color used for ENEMY projectiles only (player projectiles
    // keep their original palette for class identity).
    _sectorEnemyProjectileColor() {
        const map = { 1: '#00f3ff', 2: '#88eaff', 3: '#ff8800', 4: '#7fff00', 5: '#ff3355' };
        return map[this.sector] || '#ff0000';
    },

    // Helper: is the VFX source an enemy-side entity? Applies to bosses,
    // regular enemies, and enemy minions. Player/player-minions stay default.
    _sourceIsEnemy(source) {
        if (!source) return false;
        if (source === this.enemy) return true;
        if (this.enemy && Array.isArray(this.enemy.minions) && this.enemy.minions.includes(source)) return true;
        // Fallback — any Minion where isPlayerSide is false.
        if (source instanceof Minion && source.isPlayerSide === false) return true;
        if (source instanceof Enemy) return true;
        return false;
    },

triggerVFX(type, source, target, onHitCallback = null, opts = {}) {
        const x = target ? target.x : (source ? source.x : CONFIG.CANVAS_WIDTH/2);
        const y = target ? target.y : (source ? source.y : CONFIG.CANVAS_HEIGHT/2);

        if (type === 'digital_sever') {
            this.effects.push({
                type: 'digital_sever',
                x: x, y: y,
                angle: Math.random() * Math.PI,
                life: 20, maxLife: 20,
                color: COLORS.MANA
            });
            AudioMgr.playSound('digital_sever');
        } 
        else if (type === 'blade_storm') {
            for(let i=0; i<3; i++) {
                setTimeout(() => {
                    this.effects.push({
                        type: 'digital_sever',
                        x: x + (Math.random()-0.5)*40, y: y + (Math.random()-0.5)*40,
                        angle: (Math.PI/3) * i,
                        life: 20, maxLife: 20,
                        color: COLORS.GOLD
                    });
                    AudioMgr.playSound('digital_sever');
                }, i * 100);
            }
        }
        else if (type === 'hex_barrier') {
            this.effects.push({
                type: 'hex_barrier',
                x: x, y: y,
                radius: 1, maxRadius: 130,
                life: 54, maxLife: 54,
                color: COLORS.SHIELD
            });
            AudioMgr.playSound('hex_barrier');
        }
        else if (type === 'overclock') {
            this.effects.push({
                type: 'binary_flow',
                x: x, y: y,
                life: 40, maxLife: 40
            });
            AudioMgr.playSound('overclock');
        }
        else if (type === 'materialize') {
            ParticleSys.createExplosion(x, y, 30, COLORS.NATURE_LIGHT);
            AudioMgr.playSound('print');
        }
        else if (type === 'grid_fracture') {
            this.effects.push({
                type: 'grid_fracture',
                x: x, y: y,
                life: 60, maxLife: 60,
                cracks: [] 
            });
            AudioMgr.playSound('grid_fracture');
        }
        else if (type === 'orbital_strike') {
            this.effects.push({
                type: 'orbital_strike',
                x: x, y: -200, targetY: y,
                speed: 18,
                color: COLORS.PURPLE,
                onHit: () => {
                    Game.shake(20);
                    ParticleSys.createExplosion(x, y, 80, COLORS.PURPLE);
                    // FIX: Execute the damage callback when the meteor hits
                    if (onHitCallback) onHitCallback();
                }
            });
            AudioMgr.playSound('orbital_strike');
        }
        else if (type === 'chains') {
            this.effects.push({
                type: 'chains',
                x: x, y: y,
                life: 75, maxLife: 75
            });
            AudioMgr.playSound('chains');
        }
        else if (type === 'logic_bomb') {
            this.effects.push({
                type: 'logic_bomb',
                x: x, y: y - 100,
                life: 90, maxLife: 90
            });
        }
        else if (type === 'lightning') {
            this.effects.push({
                type: 'lightning',
                x: x, y: y,
                life: 55, maxLife: 55,
                branches: []
            });
            AudioMgr.playSound('zap');
        }
        else if (type === 'overheat') {
            this.effects.push({
                type: 'overheat',
                x: x, y: y,
                life: 80, maxLife: 80,
                flames: []
            });
            AudioMgr.playSound('siren');
        }
        /* ============================================================
           Class-fantasy attack VFX (Roadmap Part 26.1)
           Each class attack produces a distinct animation whose effect
           types the draw loop will render. For effects without a draw
           handler yet, the windup + particle shower still reads as
           "something happened at impact" so gameplay feedback works
           even if the polish pass is still pending.
           ============================================================ */
        else if (type === 'attack_sanguine_bite') {
            /* BLOODSTALKER — lunge forward, spectral fang bite, blood spray */
            const sx = source ? source.x : x, sy = source ? source.y : y;
            const hitX = target ? target.x : x, hitY = target ? target.y : y;
            this.effects.push({ type: 'slash_windup', x: sx, y: sy, life: 14, maxLife: 14, heavy: true, color: '#ff0044' });
            setTimeout(() => {
                ParticleSys.createShockwave(hitX, hitY, '#ff0044', 26);
                ParticleSys.createExplosion(hitX, hitY, 44, '#ff0044');
                ParticleSys.createExplosion(hitX, hitY, 22, '#ff88a0');
                // Upper + lower fang crescents
                this.effects.push({
                    type: 'slash',
                    x: hitX, y: hitY,
                    angle: -Math.PI / 3,
                    life: 38, maxLife: 38,
                    length: 260, width: 36,
                    color: '#ff2255', heavy: true
                });
                this.effects.push({
                    type: 'slash',
                    x: hitX, y: hitY + 18,
                    angle:  Math.PI / 3,
                    life: 38, maxLife: 38,
                    length: 220, width: 30,
                    color: '#cc0033', heavy: true
                });
                // Blood droplets
                for (let i = 0; i < 14; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const sp = 5 + Math.random() * 4;
                    const p = ParticleSys._acquire();
                    p.x = hitX; p.y = hitY;
                    p.vx = Math.cos(ang) * sp;
                    p.vy = Math.sin(ang) * sp - 2;
                    p.life = 1.1 + Math.random() * 0.4;
                    p.maxLife = p.life;
                    p.size = 3 + Math.random() * 3;
                    p.color = '#ff1a3a';
                    p.alpha = 1;
                    p.gravity = 0.25;
                    p.drag = 0.94;
                }
                AudioMgr.playSound('hit');
                this.shake(8);
                if (this.haptic) this.haptic('heavy');
                if (onHitCallback) onHitCallback();
            }, 160);
        }
        else if (type === 'attack_glyph_weave') {
            /* ARCANIST — three glyph runes spin around target, collapse, ignite */
            const hitX = target ? target.x : x, hitY = target ? target.y : y;
            const color = opts && opts.upgraded ? COLORS.GOLD : COLORS.PURPLE;
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    this.effects.push({
                        type: 'digital_sever',
                        x: hitX + Math.cos((i / 3) * Math.PI * 2) * 70,
                        y: hitY + Math.sin((i / 3) * Math.PI * 2) * 70,
                        angle: (i / 3) * Math.PI * 2,
                        life: 26, maxLife: 26,
                        color: color
                    });
                }, i * 90);
            }
            setTimeout(() => {
                ParticleSys.createShockwave(hitX, hitY, color, 32);
                ParticleSys.createExplosion(hitX, hitY, 36, color);
                ParticleSys.createSparks(hitX, hitY, '#ffffff', 18);
                AudioMgr.playSound('digital_sever');
                this.shake(6);
                if (this.haptic) this.haptic('hit');
                if (onHitCallback) onHitCallback();
            }, 310);
        }
        else if (type === 'attack_pawn_volley') {
            /* TACTICIAN — three small pawn projectiles arc out in sequence */
            const sx = source ? source.x : x, sy = source ? source.y : y;
            const tx = target ? target.x : x, ty = target ? target.y : y;
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    this.effects.push({
                        type: 'nature_dart',
                        sx: sx, sy: sy,
                        tx: tx + (Math.random() - 0.5) * 30,
                        ty: ty + (Math.random() - 0.5) * 30,
                        x: sx, y: sy,
                        progress: 0,
                        speed: 0.042,
                        amplitude: 12,
                        frequency: 5,
                        color: COLORS.MANA,
                        empowered: false,
                        dmgMultiplier: 1.0
                    });
                    AudioMgr.playSound('dart');
                }, i * 110);
            }
            setTimeout(() => {
                ParticleSys.createShockwave(tx, ty, COLORS.MANA, 22);
                ParticleSys.createExplosion(tx, ty, 28, COLORS.MANA);
                if (onHitCallback) onHitCallback();
                this.shake(4);
            }, 340);
        }
        else if (type === 'attack_overdrive') {
            /* ANNIHILATOR — red plasma charge then slam, big recoil */
            const sx = source ? source.x : x, sy = source ? source.y : y;
            const tx = target ? target.x : x, ty = target ? target.y : y;
            // Charge-up pulse at player
            this.effects.push({
                type: 'slash_windup', x: sx, y: sy,
                life: 22, maxLife: 22, heavy: true, color: COLORS.ORANGE
            });
            setTimeout(() => {
                // Beam line
                this.effects.push({
                    type: 'beam',
                    sx: sx, sy: sy,
                    tx: tx, ty: ty,
                    color: COLORS.ORANGE,
                    life: 18, maxLife: 18
                });
                // Impact shockwave + heavy particles
                ParticleSys.createShockwave(tx, ty, COLORS.ORANGE, 44);
                ParticleSys.createExplosion(tx, ty, 54, '#ff8800');
                ParticleSys.createExplosion(tx, ty, 28, '#ffee00');
                AudioMgr.playSound('explosion');
                this.shake(14);
                if (this.haptic) this.haptic('warn');
                if (onHitCallback) onHitCallback();
            }, 260);
        }
        else if (type === 'attack_bulwark_bash') {
            /* SENTINEL — shield slam, metal ring + rumble */
            const sx = source ? source.x : x, sy = source ? source.y : y;
            const tx = target ? target.x : x, ty = target ? target.y : y;
            this.effects.push({
                type: 'hex_barrier',
                x: sx, y: sy,
                radius: 1, maxRadius: 80,
                life: 20, maxLife: 20,
                color: '#ffffff'
            });
            setTimeout(() => {
                // Big concentric shield ring at target
                this.effects.push({
                    type: 'hex_barrier',
                    x: tx, y: ty,
                    radius: 1, maxRadius: 140,
                    life: 32, maxLife: 32,
                    color: '#ffffff'
                });
                ParticleSys.createShockwave(tx, ty, '#ffffff', 32);
                ParticleSys.createExplosion(tx, ty, 28, '#c0e0ff');
                AudioMgr.playSound('hex_barrier');
                this.shake(12);
                if (this.haptic) this.haptic('heavy');
                if (onHitCallback) onHitCallback();
            }, 200);
        }
        else if (type === 'attack_verdant_lash') {
            /* SUMMONER — vines erupt, whip target, retract */
            const sx = source ? source.x : x, sy = source ? source.y : y;
            const tx = target ? target.x : x, ty = target ? target.y : y;
            // Two chained lashes for visual richness
            for (let i = 0; i < 2; i++) {
                setTimeout(() => {
                    this.effects.push({
                        type: 'chains',
                        x: (sx + tx) / 2 + (Math.random() - 0.5) * 40,
                        y: (sy + ty) / 2 + (Math.random() - 0.5) * 40,
                        life: 30, maxLife: 30
                    });
                }, i * 80);
            }
            setTimeout(() => {
                ParticleSys.createShockwave(tx, ty, COLORS.NATURE_LIGHT, 26);
                ParticleSys.createExplosion(tx, ty, 38, COLORS.NATURE_LIGHT);
                ParticleSys.createSparks(tx, ty, '#88ffaa', 16);
                AudioMgr.playSound('chains');
                this.shake(6);
                if (this.haptic) this.haptic('hit');
                if (onHitCallback) onHitCallback();
            }, 240);
        }
        else if (type === 'slash' || type === 'slash_heavy') {
            const heavy = (type === 'slash_heavy');
            // Anticipation flash on the player, then the slash lands after 180ms.
            const sx = source ? source.x : x;
            const sy = source ? source.y : y;
            this.effects.push({
                type: 'slash_windup',
                x: sx, y: sy,
                life: 18, maxLife: 18,
                heavy: heavy,
                color: heavy ? COLORS.GOLD : COLORS.MANA
            });
            setTimeout(() => {
                this.effects.push({
                    type: 'slash',
                    x: x, y: y,
                    angle: -Math.PI / 4 + (Math.random() - 0.5) * 0.4,
                    life: heavy ? 42 : 32, maxLife: heavy ? 42 : 32,
                    length: heavy ? 320 : 220,
                    width: heavy ? 44 : 28,
                    color: heavy ? COLORS.GOLD : '#ffffff',
                    heavy: heavy
                });
                AudioMgr.playSound('digital_sever');
                if (heavy) this.shake(10);
            }, 180);
        }
        else if (type === 'earthquake') {
            const sx = source ? source.x : CONFIG.CANVAS_WIDTH / 2;
            const sy = source ? source.y : y;
            // Three expanding rings + fissure line + rubble bursts along the shockwave.
            for (let k = 0; k < 3; k++) {
                setTimeout(() => {
                    this.effects.push({
                        type: 'earthquake_ring',
                        x: sx, y: sy,
                        radius: 10, maxRadius: 520 + k * 40,
                        life: 54, maxLife: 54,
                        color: k === 0 ? COLORS.ORANGE : (k === 1 ? '#ffaa00' : '#ffe599')
                    });
                }, k * 140);
            }
            this.effects.push({
                type: 'earthquake_fissure',
                sx: sx, sy: sy,
                tx: target ? target.x : sx,
                ty: target ? target.y : sy,
                progress: 0,
                life: 60, maxLife: 60,
                color: COLORS.ORANGE
            });
            AudioMgr.playSound('grid_fracture');
            this.shake(18);
        }
        // Minion/Enemy Specifics
        else if (type === 'glitch_spike') {
            // Enemy-originated glitch spike: tint by sector. Player/minion
            // uses (if any) stays red. Bosses with a phase-telegraph color
            // (Tesseract in P2/P3) override — this teaches the player the
            // palette they'll see again in the death dissolve.
            let tint = '#ff0000';
            if (this._sourceIsEnemy(source)) {
                tint = (source && source.phaseTelegraphColor) || this._sectorEnemyProjectileColor();
            }
            this.effects.push({
                type: 'glitch_spike',
                sx: source.x, sy: source.y,
                tx: target.x, ty: target.y,
                life: 15, maxLife: 15,
                color: tint
            });
            // Phase-telegraph mini flash — a soft pulse of the phase color
            // so the player can't miss the signal.
            if (source && source.phaseTelegraphColor && this.triggerScreenFlash) {
                const hx = source.phaseTelegraphColor.replace('#', '');
                const rv = parseInt(hx.slice(0,2), 16), gv = parseInt(hx.slice(2,4), 16), bv = parseInt(hx.slice(4,6), 16);
                this.triggerScreenFlash(`rgba(${rv},${gv},${bv},0.22)`, 180);
            }
            AudioMgr.playSound('glitch_attack');
            if (onHitCallback) setTimeout(onHitCallback, 200);
        }
        else if (type === 'nature_dart') {
            // FIX: Use Player Class Color for Projectile
            const pColor = (this.player && this.player.classColor) ? this.player.classColor : COLORS.NATURE_LIGHT;
            
            this.effects.push({
                type: 'nature_dart',
                sx: source.x, sy: source.y, 
                tx: target.x, ty: target.y, 
                x: source.x, y: source.y,   
                progress: 0,
                speed: 0.017, 
                amplitude: 30, 
                frequency: 10, 
                color: pColor, // Use dynamic color
                onHit: onHitCallback,
                empowered: false, 
                dmgMultiplier: 1.0 
            });
            AudioMgr.playSound('dart');
        }
        else if (type === 'micro_laser') {
            const speed = 12; // FIX: Increased speed for reliability
            const angle = Math.atan2(target.y - source.y, target.x - source.x);

            this.effects.push({
                type: 'micro_laser',
                x: source.x, y: source.y,
                tx: target.x, ty: target.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 40,
                life: 100,
                maxLife: 100,
                color: '#ff0055',
                parried: false,
                onHit: onHitCallback // Ensure callback is passed
            });
            AudioMgr.playSound('laser');
        }
        else if (type === 'void_tendril') {
            // Eldritch dark tendrils reach from source, wrap target, then retract.
            this.effects.push({
                type: 'void_tendril',
                sx: source.x, sy: source.y,
                tx: target.x, ty: target.y,
                targetRef: target,
                life: 48, maxLife: 48
            });
            AudioMgr.playSound('grid_fracture');
        }
        else if (type === 'bomb_missile') {
            // Bomb Bot death animation — flies as a tumbling rocket from the
            // bomb's last position to the target entity, leaving a smoke trail,
            // then detonates with shrapnel. `onHitCallback` runs on impact so
            // damage and bookkeeping land synced with the explosion.
            const sx = source ? source.x : x;
            const sy = source ? source.y : y;
            const tx = target ? target.x : x;
            const ty = target ? target.y : y;
            this.effects.push({
                type: 'bomb_missile',
                sx, sy, tx, ty,
                x: sx, y: sy,
                progress: 0,
                speed: 0.045,            // ~22 frames to reach the target
                arcHeight: -160,         // negative = arcs upward then down
                rotation: 0,
                onHit: onHitCallback
            });
            AudioMgr.playSound('siren');
        }
    },

drawEffects() {
        const ctx = this.ctx;
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;
        const time = Date.now() / 1000;
        
        for(let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            
            // --- MICRO LASER (Enemy Minion - Parriable) ---
            // --- VOID TENDRIL (Void Spawn consume — eldritch tentacles reach out and absorb target) ---
            if (e.type === 'void_tendril') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const pr = 1 - (e.life / e.maxLife);
                // Follow the target while it still exists so tendrils stay locked on.
                if (e.targetRef && e.targetRef.currentHp > 0) {
                    e.tx = e.targetRef.x; e.ty = e.targetRef.y;
                }
                // 0.0–0.5 = reach out & wrap. 0.5–1.0 = drag back, victim fades.
                const reach = Math.min(1, pr * 2);
                const retract = Math.max(0, pr - 0.5) * 2;
                const dx = e.tx - e.sx;
                const dy = e.ty - e.sy;
                const dist = Math.hypot(dx, dy) || 1;
                const ang = Math.atan2(dy, dx);

                ctx.save();
                // Dark aura pooling under the victim
                const aur = ctx.createRadialGradient(e.tx, e.ty, 0, e.tx, e.ty, 80 * (1 - retract * 0.6));
                aur.addColorStop(0, `rgba(40, 0, 50, ${0.65 * reach})`);
                aur.addColorStop(1, 'rgba(20, 0, 30, 0)');
                ctx.fillStyle = aur;
                ctx.beginPath(); ctx.arc(e.tx, e.ty, 90, 0, Math.PI * 2); ctx.fill();

                // Tendrils: 5 wavy strokes from source curving to the target.
                const tendrils = 5;
                for (let k = 0; k < tendrils; k++) {
                    const phase = k * 0.9 + pr * 4;
                    const lateral = (k - (tendrils - 1) / 2) * 14;
                    const endReach = reach; // 0..1 length progression
                    ctx.beginPath();
                    ctx.moveTo(e.sx, e.sy);
                    const steps = 18;
                    for (let s = 1; s <= steps; s++) {
                        const t = s / steps;
                        if (t > endReach) break;
                        const baseX = e.sx + dx * t;
                        const baseY = e.sy + dy * t;
                        // Perpendicular wave
                        const wave = Math.sin(t * Math.PI * 3 + phase) * 18 * (1 - t * 0.3);
                        const px = Math.cos(ang + Math.PI / 2) * (wave + lateral * (1 - t));
                        const py = Math.sin(ang + Math.PI / 2) * (wave + lateral * (1 - t));
                        ctx.lineTo(baseX + px, baseY + py);
                    }
                    ctx.shadowColor = '#bc13fe';
                    ctx.shadowBlur = 18;
                    ctx.strokeStyle = k % 2 === 0 ? 'rgba(30, 0, 40, 0.95)' : 'rgba(188, 19, 254, 0.9)';
                    ctx.lineWidth = 3 + Math.sin(time * 8 + k) * 1.2;
                    ctx.lineCap = 'round';
                    ctx.stroke();
                }

                // Wrap: dim ring shrinking around the victim as it's consumed.
                if (reach >= 1) {
                    const wrapR = 60 * (1 - retract * 0.85);
                    ctx.strokeStyle = `rgba(188, 19, 254, ${0.9 - retract * 0.7})`;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = '#bc13fe'; ctx.shadowBlur = 22;
                    ctx.beginPath();
                    ctx.arc(e.tx, e.ty, wrapR + 4, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.strokeStyle = `rgba(0, 0, 0, ${0.7 * (1 - retract)})`;
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    ctx.arc(e.tx, e.ty, wrapR, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Ember specks streaming from victim back to source.
                if (retract > 0) {
                    ctx.fillStyle = '#bc13fe';
                    ctx.shadowColor = '#bc13fe'; ctx.shadowBlur = 8;
                    for (let s = 0; s < 4; s++) {
                        const t = Math.random();
                        const emX = e.tx - dx * t + (Math.random() - 0.5) * 20;
                        const emY = e.ty - dy * t + (Math.random() - 0.5) * 20;
                        ctx.beginPath();
                        ctx.arc(emX, emY, 1.5 + Math.random(), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                ctx.restore();
                continue;
            }

            if (e.type === 'micro_laser') {
                // Move
                e.x += e.vx;
                e.y += e.vy;

                // Draw
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(Math.atan2(e.vy, e.vx));
                
                // Visual: Electrical Plasma Bolt
                const boltColor = e.parried ? '#00f3ff' : '#ff0055'; // Cyan if parried, Red if hostile
                
                // 1. Glow
                ctx.shadowColor = boltColor;
                ctx.shadowBlur = 20;
                
                // 2. Core (Mechanical Slug)
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                // A capsule shape
                ctx.roundRect(-15, -4, 30, 8, 4);
                ctx.fill();
                
                // 3. Electrical Arcs (Jittery)
                ctx.strokeStyle = boltColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-20, 0);
                // Draw random jagged lines around the core
                for(let k=0; k<4; k++) {
                    ctx.lineTo(-10 + k*10, (Math.random() - 0.5) * 15);
                }
                ctx.stroke();
                
                // 4. Trail Sparks
                if (Math.random() > 0.5) {
                    ctx.fillStyle = boltColor;
                    ctx.fillRect(-30 - Math.random()*20, (Math.random()-0.5)*10, 4, 4);
                }
                
                ctx.restore();

                // Logic: Parried (Fly off screen)
                if (e.parried) {
                    // Remove if off-screen
                    if (e.x < -100 || e.x > w + 100 || e.y < -100 || e.y > h + 100) {
                        this.effects.splice(i, 1);
                    }
                    continue;
                }

                // Logic: Hit Detection (Target)
                const dist = Math.hypot(e.x - e.tx, e.y - e.ty);
                if (dist < 20) {
                    if (e.onHit) e.onHit();
                    this.effects.splice(i, 1);
                    ParticleSys.createExplosion(e.x, e.y, 15, e.color);
                }
                continue;
            }

            // ... [KEEP ALL OTHER EFFECTS BELOW UNCHANGED] ...
            
            if (e.type === 'digital_sever') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                const pr = 1 - (e.life / e.maxLife);
                const reveal = Math.min(1, pr * 2);
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(e.angle);
                // Multi-pass glow sword cut
                for (let k = 3; k >= 0; k--) {
                    ctx.globalAlpha = (0.28 - k * 0.06) * (e.life / e.maxLife);
                    ctx.strokeStyle = k === 0 ? '#fff' : e.color;
                    ctx.shadowColor = e.color;
                    ctx.shadowBlur = 40 - k * 8;
                    ctx.lineWidth = (7 - k * 1.4) * (e.life/e.maxLife);
                    ctx.beginPath();
                    ctx.moveTo(-160 * reveal, 0);
                    ctx.lineTo(160 * reveal, 0);
                    ctx.stroke();
                }
                // Shard sparks along the cut
                if (Math.random() > 0.4) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(Math.random()*160 - 80, -12, Math.random()*16, 24);
                }
                ctx.restore();
                continue;
            }

            if (e.type === 'hex_barrier') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                e.radius += (e.maxRadius - e.radius) * 0.18;
                const alpha = e.life / e.maxLife;

                ctx.save();
                // Inner soft dome fill
                const domeGrad = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, e.radius);
                domeGrad.addColorStop(0, `rgba(0, 243, 255, ${0.18 * alpha})`);
                domeGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = domeGrad;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
                ctx.fill();

                // Three stacked hex rings for depth
                for (let layer = 0; layer < 3; layer++) {
                    ctx.save();
                    ctx.strokeStyle = layer === 0 ? '#ffffff' : e.color;
                    ctx.shadowColor = e.color;
                    ctx.shadowBlur = 18;
                    ctx.lineWidth = (5 - layer * 1.3) * alpha;
                    ctx.globalAlpha = alpha * (1 - layer * 0.2);
                    ctx.beginPath();
                    const r = e.radius * (1 - layer * 0.08);
                    for (let k = 0; k < 6; k++) {
                        const angle = (Math.PI / 3) * k + layer * 0.08;
                        const hx = e.x + r * Math.cos(angle);
                        const hy = e.y + r * Math.sin(angle);
                        if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();
                continue;
            }

            if (e.type === 'binary_flow') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                ctx.save();
                ctx.font = "20px 'Orbitron'";
                ctx.fillStyle = COLORS.MANA;
                ctx.globalAlpha = e.life / e.maxLife;
                const char = Math.random() > 0.5 ? "1" : "0";
                ctx.fillText(char, e.x + (Math.random()-0.5)*40, e.y - (40 - e.life)*3);
                ctx.restore();
                continue;
            }

            if (e.type === 'orbital_strike') {
                e.y += e.speed;
                // Shadow-on-ground as it approaches (grows)
                const proximity = Math.max(0, Math.min(1, (e.y + 200) / (e.targetY + 200)));
                ctx.save();
                const shadowR = 30 + 70 * proximity;
                const shadowAlpha = 0.25 + 0.4 * proximity;
                ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
                ctx.beginPath();
                ctx.ellipse(e.x, e.targetY + 25, shadowR, shadowR * 0.35, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                // Smoke trail
                for (let k = 0; k < 3; k++) {
                    ParticleSys.createExplosion(e.x + (Math.random()-0.5)*24, e.y - 30 - k*20, 1, k === 0 ? '#fff' : '#cc66ff');
                }
                // Atmospheric heat-haze glow
                ctx.save();
                const haloGrad = ctx.createRadialGradient(e.x, e.y, 5, e.x, e.y, 90);
                haloGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
                haloGrad.addColorStop(0.4, 'rgba(204,102,255,0.4)');
                haloGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = haloGrad;
                ctx.beginPath();
                ctx.arc(e.x, e.y, 90, 0, Math.PI*2);
                ctx.fill();
                ctx.restore();
                // Meteor body
                ctx.save();
                ctx.fillStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 40;
                ctx.beginPath();
                ctx.ellipse(e.x, e.y, 26, 52, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.shadowBlur = 50;
                ctx.beginPath();
                ctx.ellipse(e.x, e.y - 12, 14, 36, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                if (e.y >= e.targetY) {
                    this.effects.splice(i, 1);
                    if (e.onHit) e.onHit();
                }
                continue;
            }

            if (e.type === 'grid_fracture') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                if (e.cracks.length === 0) {
                    for(let k=0; k<6; k++) {
                        e.cracks.push({
                            angle: (Math.PI*2/6)*k,
                            len: 0
                        });
                    }
                }
                ctx.save();
                ctx.strokeStyle = COLORS.ORANGE;
                ctx.lineWidth = 4;
                ctx.shadowColor = '#ff4400';
                ctx.shadowBlur = 15;
                ctx.globalAlpha = e.life / e.maxLife;
                e.cracks.forEach(c => {
                    c.len += 5; 
                    const ex = e.x + Math.cos(c.angle) * c.len;
                    const ey = e.y + Math.sin(c.angle) * c.len;
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y);
                    ctx.lineTo(ex + (Math.random()-0.5)*10, ey + (Math.random()-0.5)*10);
                    ctx.stroke();
                });
                Game.shake(5);
                ctx.restore();
                continue;
            }

            if (e.type === 'chains') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                const pr = 1 - (e.life / e.maxLife); // 0..1
                const tighten = 1 - pr * 0.35;       // chains pull inward over time
                const alpha = Math.min(1, e.life / 25);
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.shadowColor = COLORS.MECH_LIGHT;
                ctx.shadowBlur = 18;
                ctx.strokeStyle = COLORS.MECH_LIGHT;
                ctx.lineWidth = 3;
                ctx.globalAlpha = alpha;
                // 6 chain-link ellipses around the target, stagger-materializing.
                const linkCount = 6;
                for (let k = 0; k < linkCount; k++) {
                    const appear = Math.min(1, Math.max(0, pr * linkCount - k));
                    if (appear <= 0) continue;
                    const a = (Math.PI * 2 / linkCount) * k + pr * 0.4;
                    const rx = 70 * tighten;
                    const lx = Math.cos(a) * rx, ly = Math.sin(a) * rx;
                    ctx.save();
                    ctx.translate(lx, ly);
                    ctx.rotate(a + Math.PI / 2);
                    ctx.globalAlpha = alpha * appear;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.ellipse(0, 10, 18, 9, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
                // Central tether cross
                ctx.globalAlpha = alpha * 0.5;
                ctx.beginPath();
                ctx.moveTo(-50 * tighten, 0); ctx.lineTo(50 * tighten, 0);
                ctx.moveTo(0, -50 * tighten); ctx.lineTo(0, 50 * tighten);
                ctx.stroke();
                ctx.restore();
                continue;
            }

            if (e.type === 'logic_bomb') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                if (e.life % 24 === 0) AudioMgr.playSound('ticking');
                const pr = 1 - (e.life / e.maxLife);
                const alpha = Math.min(1, e.life / 20);
                ctx.save();
                ctx.translate(e.x, e.y);

                // 4-prong hex seal drawing under the skull
                ctx.save();
                ctx.strokeStyle = '#ff2244';
                ctx.shadowColor = '#ff2244';
                ctx.shadowBlur = 22;
                ctx.lineWidth = 3;
                ctx.globalAlpha = alpha * 0.8;
                ctx.rotate(pr * Math.PI);
                ctx.beginPath();
                const prongs = 4;
                for (let k = 0; k < prongs; k++) {
                    const a = (Math.PI * 2 / prongs) * k;
                    const r = 70;
                    const rx = Math.cos(a) * r, ry = Math.sin(a) * r;
                    ctx.moveTo(0, 50);
                    ctx.lineTo(rx, ry + 50);
                }
                // Outer circle
                ctx.moveTo(70, 50); ctx.arc(0, 50, 70, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // Pulsing skull icon
                ctx.fillStyle = '#ff0000';
                ctx.font = "bold 56px 'Orbitron'";
                ctx.textAlign = "center";
                ctx.shadowColor = 'red';
                ctx.shadowBlur = 30;
                ctx.globalAlpha = alpha;
                const scale = 1 + Math.sin(e.life * 0.35) * 0.22;
                ctx.scale(scale, scale);
                ctx.fillText("☠️", 0, 0);
                ctx.restore();
                continue;
            }

            if (e.type === 'lightning') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                const pr = 1 - (e.life / e.maxLife);
                const alpha = Math.max(0, e.life / e.maxLife);
                // Strobe flash on frames 1-3
                if (e.maxLife - e.life < 4) {
                    ctx.save();
                    ctx.fillStyle = 'rgba(255,255,220,0.25)';
                    ctx.fillRect(0, 0, w, h);
                    ctx.restore();
                }
                ctx.save();
                // Main jagged bolt, regenerated each frame for crackle
                for (let pass = 0; pass < 3; pass++) {
                    ctx.strokeStyle = pass === 0 ? '#fff' : '#ffff00';
                    ctx.shadowColor = '#ffff00';
                    ctx.shadowBlur = 28 - pass * 6;
                    ctx.lineWidth = (4 - pass) * alpha;
                    ctx.globalAlpha = alpha * (1 - pass * 0.3);
                    ctx.beginPath();
                    ctx.moveTo(e.x, e.y - 160);
                    let ly = e.y - 160;
                    let lx = e.x;
                    for (let k = 0; k < 10; k++) {
                        ly += 32;
                        lx += (Math.random() - 0.5) * 50;
                        ctx.lineTo(lx, ly);
                    }
                    ctx.stroke();
                }
                // Forking branches
                ctx.globalAlpha = alpha * 0.7;
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#ffff88';
                for (let b = 0; b < 3; b++) {
                    const bx = e.x + (Math.random() - 0.5) * 120;
                    const by = e.y - 80 + (Math.random() - 0.5) * 80;
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    for (let k = 0; k < 4; k++) {
                        ctx.lineTo(bx + (Math.random() - 0.5) * 40, by + k * 14);
                    }
                    ctx.stroke();
                }
                ctx.restore();
                continue;
            }
            
            if (e.type === 'overheat') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                // Dense flame aura swirling around source with spawning embers.
                const ratio = e.life / e.maxLife;
                const intensity = Math.sin(ratio * Math.PI); // rises then falls
                ctx.save();
                ctx.translate(e.x, e.y);
                for (let k = 0; k < 5; k++) {
                    const a = (e.maxLife - e.life) * 0.15 + k * (Math.PI * 2 / 5);
                    const r = 60 + Math.sin((e.maxLife - e.life) * 0.3 + k) * 25;
                    const fx = Math.cos(a) * r, fy = Math.sin(a) * r;
                    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 40);
                    grad.addColorStop(0, `rgba(255, 180, 30, ${0.6 * intensity})`);
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(fx, fy, 40, 0, Math.PI*2);
                    ctx.fill();
                }
                ctx.restore();
                // Ember particles trail upward.
                if (Math.random() < 0.7) {
                    ParticleSys.createExplosion(e.x + (Math.random()-0.5)*80, e.y + (Math.random()-0.5)*60, 1, '#ff6a00');
                }
                continue;
            }

            // --- QTE RING SHATTER (on perfect crit the ring bursts into shards) ---
            if (e.type === 'qte_shatter') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const p = 1 - (e.life / e.maxLife);
                const alpha = e.life / e.maxLife;
                ctx.save();
                ctx.translate(e.x, e.y);
                // Fading ghost ring
                ctx.globalAlpha = alpha * 0.6;
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 24;
                ctx.lineWidth = 4 * alpha;
                ctx.beginPath();
                ctx.arc(0, 0, e.baseRadius + p * 80, 0, Math.PI * 2);
                ctx.stroke();
                // Shards flying outward
                const shards = 12;
                ctx.globalAlpha = alpha;
                ctx.fillStyle = e.color;
                for (let k = 0; k < shards; k++) {
                    const a = (Math.PI * 2 / shards) * k;
                    const dist = e.baseRadius + p * 180;
                    const sx = Math.cos(a) * dist;
                    const sy = Math.sin(a) * dist;
                    ctx.save();
                    ctx.translate(sx, sy);
                    ctx.rotate(a + p * Math.PI);
                    ctx.fillRect(-8 * alpha, -2, 16 * alpha, 4);
                    ctx.restore();
                }
                ctx.restore();
                continue;
            }

            // --- SLASH WINDUP (charge-up flash on source before the strike) ---
            if (e.type === 'slash_windup') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const p = 1 - (e.life / e.maxLife); // 0..1
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 30;
                ctx.fillStyle = e.color;
                ctx.globalAlpha = 0.35 + 0.4 * p;
                ctx.beginPath();
                ctx.arc(0, 0, 28 + 40 * p, 0, Math.PI * 2);
                ctx.fill();
                // Crescent charge ring
                ctx.globalAlpha = 0.6 + 0.3 * p;
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, 0, 36 + 50 * p, -Math.PI/3, Math.PI/3);
                ctx.stroke();
                ctx.restore();
                continue;
            }

            // --- SLASH (huge diagonal blade cut across target) ---
            if (e.type === 'slash') {
                e.life--;
                if (e.life <= 0) {
                    // Impact burst at end-of-life
                    ParticleSys.createShockwave(e.x, e.y, e.color, e.heavy ? 36 : 24);
                    ParticleSys.createExplosion(e.x, e.y, e.heavy ? 36 : 22, e.color);
                    this.effects.splice(i, 1);
                    continue;
                }
                const p = 1 - (e.life / e.maxLife); // 0 → 1 over lifetime
                // Reveal phase first half, fade phase second half.
                const reveal = Math.min(1, p * 2);          // 0..1 in first half
                const fade = Math.max(0, 1 - (p - 0.5) * 2); // 1..0 in second half
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(e.angle);
                // Trail blur
                for (let k = 0; k < 4; k++) {
                    ctx.save();
                    ctx.globalAlpha = (0.15 + 0.25 * reveal) * fade / (1 + k);
                    ctx.fillStyle = k === 0 ? '#ffffff' : e.color;
                    ctx.shadowColor = e.color;
                    ctx.shadowBlur = 40 - k * 6;
                    const w = e.width - k * 4;
                    const len = e.length * reveal;
                    ctx.beginPath();
                    ctx.moveTo(-len / 2, -w / 2);
                    ctx.lineTo(len / 2, -w * 0.15);
                    ctx.lineTo(len / 2, w * 0.15);
                    ctx.lineTo(-len / 2, w / 2);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                // Bright leading edge
                ctx.globalAlpha = fade;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 30;
                const len2 = e.length * reveal;
                ctx.beginPath();
                ctx.moveTo(-len2 / 2, 0);
                ctx.lineTo(len2 / 2, 0);
                ctx.stroke();
                ctx.restore();
                continue;
            }

            // --- EARTHQUAKE RING (expanding shockwave rings) ---
            if (e.type === 'earthquake_ring') {
                e.life--;
                e.radius = e.maxRadius * (1 - e.life / e.maxLife);
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const alpha = e.life / e.maxLife;
                ctx.save();
                ctx.strokeStyle = e.color;
                ctx.globalAlpha = alpha * 0.7;
                ctx.lineWidth = 6 + 6 * (1 - alpha);
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 18;
                // Slightly squashed ellipse to suggest ground perspective.
                ctx.beginPath();
                ctx.ellipse(e.x, e.y + 20, e.radius, e.radius * 0.35, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
                continue;
            }

            // --- EARTHQUAKE FISSURE (crack line from source to target with rubble) ---
            if (e.type === 'earthquake_fissure') {
                e.life--;
                e.progress = Math.min(1, e.progress + 0.04);
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const segs = 10;
                const cx = e.sx + (e.tx - e.sx) * e.progress;
                const cy = e.sy + (e.ty - e.sy) * e.progress;
                ctx.save();
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 20;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(e.sx, e.sy + 30);
                for (let k = 1; k <= segs; k++) {
                    const t = k / segs * e.progress;
                    const nx = e.sx + (e.tx - e.sx) * t + (Math.random() - 0.5) * 28;
                    const ny = e.sy + (e.ty - e.sy) * t + 30 + (Math.random() - 0.5) * 14;
                    ctx.lineTo(nx, ny);
                }
                ctx.stroke();
                ctx.restore();
                // Occasional rubble bursts along the fissure
                if (Math.random() < 0.6) {
                    ParticleSys.createExplosion(cx + (Math.random()-0.5)*80, cy + 30, 3, '#663322');
                }
                continue;
            }

            if (e.type === 'glitch_spike') {
                e.life--;
                if(e.life <= 0) { this.effects.splice(i, 1); continue; }
                ctx.save();
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 3;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 10;
                ctx.beginPath();
                ctx.moveTo(e.sx, e.sy);
                const segments = 5;
                const dx = (e.tx - e.sx) / segments;
                const dy = (e.ty - e.sy) / segments;
                for(let k=1; k<segments; k++) {
                    const jx = (Math.random() - 0.5) * 50;
                    const jy = (Math.random() - 0.5) * 50;
                    ctx.lineTo(e.sx + dx*k + jx, e.sy + dy*k + jy);
                }
                ctx.lineTo(e.tx, e.ty);
                ctx.stroke();
                ctx.strokeStyle = '#00ffff';
                ctx.globalAlpha = 0.5;
                ctx.stroke();
                ctx.restore();
                continue;
            }

            // --- NATURE DART (Wisp Attack - Wavy & Wispy) ---
            if (e.type === 'bomb_missile') {
                e.progress += e.speed;
                if (e.progress >= 1) {
                    // IMPACT — explosion + radial shrapnel + extra spark burst.
                    ParticleSys.createExplosion(e.tx, e.ty, 60, '#ff8800');
                    ParticleSys.createExplosion(e.tx, e.ty, 30, '#ffdd33');
                    ParticleSys.createShockwave(e.tx, e.ty, '#ff8800', 28);
                    ParticleSys.createSparks(e.tx, e.ty, '#ffaa44', 18);
                    ParticleSys.createSparks(e.tx, e.ty, '#888888', 10);
                    AudioMgr.playSound('explosion');
                    if (this.shake) this.shake(14);
                    if (e.onHit) e.onHit();
                    this.effects.splice(i, 1);
                    continue;
                }

                // Linear interpolate position with a parabolic vertical arc.
                const lx = e.sx + (e.tx - e.sx) * e.progress;
                const ly = e.sy + (e.ty - e.sy) * e.progress;
                const arc = e.arcHeight * 4 * e.progress * (1 - e.progress);
                e.x = lx;
                e.y = ly + arc;

                // Smoke trail — dim grey particles drifting outward + slight upward.
                const tp = ParticleSys._acquire();
                tp.x = e.x + (Math.random() - 0.5) * 6;
                tp.y = e.y + (Math.random() - 0.5) * 6;
                tp.vx = (Math.random() - 0.5) * 0.6;
                tp.vy = -0.3 + Math.random() * -0.6;
                tp.life = 0.5; tp.maxLife = 0.5;
                tp.size = 3 + Math.random() * 3;
                tp.color = '#666';
                tp.alpha = 0.7;
                tp.text = null;
                tp.glow = false;
                tp.drag = 0.95;
                tp.gravity = 0;
                tp.rotation = 0;
                tp.spin = 0;
                // Bright spark behind the missile — exhaust flame.
                const fp = ParticleSys._acquire();
                fp.x = e.x; fp.y = e.y;
                fp.vx = (Math.random() - 0.5) * 0.8;
                fp.vy = (Math.random() - 0.5) * 0.8;
                fp.life = 0.25; fp.maxLife = 0.25;
                fp.size = 2 + Math.random() * 2;
                fp.color = '#ffaa33';
                fp.alpha = 1; fp.glow = true;
                fp.drag = 0.9; fp.gravity = 0; fp.rotation = 0; fp.spin = 0;
                fp.text = null;

                // Draw the missile body — orange shell with a dark fuse on top, rotating as it tumbles.
                e.rotation = (e.rotation || 0) + 0.35;
                const flightAngle = Math.atan2(e.ty - e.sy, e.tx - e.sx);
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(flightAngle + Math.sin(e.rotation) * 0.25);
                ctx.shadowColor = '#ff6600';
                ctx.shadowBlur = 14;
                // Body
                ctx.fillStyle = '#ff8800';
                ctx.beginPath();
                ctx.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2);
                ctx.fill();
                // Dark band
                ctx.fillStyle = '#552200';
                ctx.fillRect(-2, -9, 4, 18);
                // Nose tip
                ctx.fillStyle = '#ffd06a';
                ctx.beginPath();
                ctx.moveTo(14, 0); ctx.lineTo(8, -5); ctx.lineTo(8, 5);
                ctx.closePath();
                ctx.fill();
                // Fuse spark
                ctx.shadowBlur = 22;
                ctx.fillStyle = '#fff7a0';
                ctx.beginPath();
                ctx.arc(-14 + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                continue;
            }
            if (e.type === 'nature_dart') {
                e.progress += e.speed;

                if (e.progress >= 1) {
                    // Hit! Pass the multiplier
                    if (e.onHit) e.onHit(e.dmgMultiplier);
                    this.effects.splice(i, 1);
                    // Impact Explosion
                    ParticleSys.createExplosion(e.tx, e.ty, 20, e.color);
                    ParticleSys.createExplosion(e.tx, e.ty, 10, '#fff');
                    continue;
                }

                const lx = e.sx + (e.tx - e.sx) * e.progress;
                const ly = e.sy + (e.ty - e.sy) * e.progress;

                const angle = Math.atan2(e.ty - e.sy, e.tx - e.sx);
                const perpAngle = angle + Math.PI / 2;
                
                const wave = Math.sin(e.progress * e.frequency) * e.amplitude * (1 - Math.pow(2 * e.progress - 1, 2));
                
                e.x = lx + Math.cos(perpAngle) * wave;
                e.y = ly + Math.sin(perpAngle) * wave;

                // Trail — acquire from pool instead of legacy `.particles.push` (which
                // was pushing to a throwaway array since the getter returns a filter copy).
                const tp = ParticleSys._acquire();
                tp.x = e.x + (Math.random() - 0.5) * 10;
                tp.y = e.y + (Math.random() - 0.5) * 10;
                tp.vx = (Math.random() - 0.5) * 0.5;
                tp.vy = (Math.random() - 0.5) * 0.5;
                tp.life = 0.6; tp.maxLife = 0.6;
                tp.size = Math.random() * 4 + 2;
                tp.color = e.color;
                tp.alpha = 0.6;
                tp.text = null;

                // Draw Head
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.rotate(angle); 
                
                ctx.shadowColor = e.color;
                ctx.shadowBlur = e.empowered ? 30 : 20; // Brighter if empowered
                ctx.fillStyle = '#fff';
                
                ctx.beginPath();
                ctx.moveTo(8, 0);
                ctx.lineTo(0, 6);
                ctx.lineTo(-15, 0);
                ctx.lineTo(0, -6);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
                continue;
            }

            /* ============================================================
               CLASS-UNIQUE SIGNATURE VFX (Part 26 extension)
               Each class's signature die triggers one of these so the
               attack has a visual identity the player recognises.
               ============================================================ */

            // --- BLOODSTALKER BITE — two curved fangs chomp on the target ---
            if (e.type === 'sig_bite') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const p = 1 - (e.life / e.maxLife);           // 0 → 1 over lifetime
                // Phase A (0-0.45): fangs open wide and accelerate inward.
                // Phase B (0.45-0.65): fangs closed — impact frame.
                // Phase C (0.65-1): fangs retract + fade.
                const openA  = Math.min(1, p / 0.45);          // 0..1 during opening
                const closed = p >= 0.45 && p <= 0.65;
                const recoil = Math.max(0, (p - 0.65) / 0.35); // 0..1 during retract
                const spread = 90 * (1 - openA) + 4;           // px apart at full open → closed
                const openRad = 1.2 - 0.6 * openA;             // fang rotation
                const alpha = p < 0.85 ? 1 : (1 - (p - 0.85) / 0.15);
                ctx.save();
                ctx.translate(e.x, e.y);
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 20;
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 4;
                ctx.globalAlpha = alpha;
                // Upper fang (arc crescent pointing down + inward).
                const drawFang = (side) => {
                    ctx.save();
                    ctx.translate(0, side * (-60 + spread * 0.5));
                    ctx.rotate(side * openRad);
                    ctx.beginPath();
                    ctx.moveTo(-44, 0);
                    ctx.quadraticCurveTo(0, side * -28, 44, 0);
                    ctx.quadraticCurveTo(0, side * -10, -44, 0);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    // Tooth tip highlight
                    ctx.fillStyle = e.color;
                    ctx.beginPath();
                    ctx.arc(0, side * -18, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#ffffff';
                    ctx.restore();
                };
                drawFang(-1); // top
                drawFang(1);  // bottom
                // Impact flash on the closed frame
                if (closed) {
                    ctx.globalAlpha = 0.9;
                    ctx.fillStyle = '#ff0055';
                    ctx.beginPath();
                    ctx.arc(0, 0, 34, 0, Math.PI * 2);
                    ctx.fill();
                }
                // Trailing blood droplets during recoil
                if (recoil > 0) {
                    ctx.globalAlpha = 1 - recoil;
                    ctx.fillStyle = '#ff3355';
                    for (let k = 0; k < 6; k++) {
                        const ang = (k / 6) * Math.PI * 2;
                        const dist = 30 + recoil * 70;
                        ctx.beginPath();
                        ctx.arc(Math.cos(ang) * dist, Math.sin(ang) * dist, 3 + 2 * (1 - recoil), 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
                continue;
            }

            // --- TACTICIAN VOLLEY DART — small arrow travelling in fan ---
            if (e.type === 'sig_volley_dart') {
                e.life--;
                e.progress = Math.min(1, e.progress + 0.06);
                if (e.life <= 0 || e.progress >= 1) { this.effects.splice(i, 1); continue; }
                const dx = e.tx - e.sx;
                const dy = e.ty - e.sy;
                const baseAng = Math.atan2(dy, dx);
                const ang = baseAng + (e.spread || 0) * (1 - e.progress); // fan converges at target
                const dist = Math.hypot(dx, dy) * e.progress;
                const px = e.sx + Math.cos(ang) * dist;
                const py = e.sy + Math.sin(ang) * dist;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(ang);
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 16;
                ctx.lineWidth = 3;
                // Dart body: short line with arrowhead
                ctx.beginPath();
                ctx.moveTo(-18, 0);
                ctx.lineTo(6, 0);
                ctx.stroke();
                ctx.fillStyle = e.color;
                ctx.beginPath();
                ctx.moveTo(10, 0);
                ctx.lineTo(0, -5);
                ctx.lineTo(0, 5);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                continue;
            }

            // --- ARCANIST SPARK — forked lightning bolt ---
            if (e.type === 'sig_spark') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const p = 1 - (e.life / e.maxLife);
                const reveal = Math.min(1, p * 2.5);
                const fade = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
                // Deterministic jitter from e.seed so the bolt doesn't twitch frame-to-frame.
                const rand = (n) => {
                    const x = Math.sin((e.seed + n) * 12.9898) * 43758.5453;
                    return x - Math.floor(x);
                };
                const dx = e.tx - e.sx;
                const dy = e.ty - e.sy;
                const segs = 10;
                ctx.save();
                ctx.strokeStyle = '#ffffff';
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 24;
                ctx.lineWidth = 4;
                ctx.globalAlpha = fade;
                // Main bolt path
                ctx.beginPath();
                ctx.moveTo(e.sx, e.sy);
                let px = e.sx, py = e.sy;
                const pts = [];
                for (let k = 1; k <= segs; k++) {
                    const t = k / segs * reveal;
                    const cx = e.sx + dx * t + (rand(k) - 0.5) * 60;
                    const cy = e.sy + dy * t + (rand(k + 7) - 0.5) * 60;
                    ctx.lineTo(cx, cy);
                    pts.push({ x: cx, y: cy });
                    px = cx; py = cy;
                }
                ctx.stroke();
                // Fork branches — two short arcs off the midpoint
                if (pts.length >= 6 && reveal >= 0.5) {
                    ctx.lineWidth = 2;
                    ctx.globalAlpha = fade * 0.7;
                    ctx.strokeStyle = e.color;
                    const mid = pts[Math.floor(pts.length / 2)];
                    for (let f = 0; f < 2; f++) {
                        ctx.beginPath();
                        ctx.moveTo(mid.x, mid.y);
                        let fx = mid.x, fy = mid.y;
                        for (let k = 1; k <= 3; k++) {
                            fx += (rand(f * 5 + k) - 0.5) * 60;
                            fy += (rand(f * 5 + k + 2) - 0.5) * 60;
                            ctx.lineTo(fx, fy);
                        }
                        ctx.stroke();
                    }
                }
                ctx.restore();
                continue;
            }

            // --- SENTINEL BASH — giant shield-plate slam + octagon ring ---
            if (e.type === 'sig_bash') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const p = 1 - (e.life / e.maxLife);
                // Windup (0-0.5): plate falls from above.
                // Impact (0.5-0.7): flash at target.
                // Ring (0.7-1): expanding octagon ring.
                const fall = Math.min(1, p / 0.5);
                const impact = p >= 0.5 && p <= 0.7;
                const ring = Math.max(0, (p - 0.7) / 0.3);
                const plateY = e.y - 260 * (1 - fall);
                ctx.save();
                ctx.translate(e.x, plateY);
                // Plate silhouette (octagon)
                ctx.fillStyle = '#2a1f08';
                ctx.strokeStyle = e.color;
                ctx.lineWidth = 5;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 26;
                ctx.globalAlpha = p < 0.7 ? 1 : 1 - ring;
                ctx.beginPath();
                for (let k = 0; k < 8; k++) {
                    const a = (Math.PI * 2 / 8) * k;
                    const r = 90;
                    const x = Math.cos(a) * r;
                    const y = Math.sin(a) * r * 0.5; // flattened for perspective
                    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
                // Impact flash at target
                if (impact) {
                    ctx.save();
                    ctx.globalAlpha = 0.8;
                    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 140);
                    grad.addColorStop(0, e.color);
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    ctx.fillRect(e.x - 140, e.y - 140, 280, 280);
                    ctx.restore();
                }
                // Expanding octagon ring
                if (ring > 0) {
                    ctx.save();
                    ctx.translate(e.x, e.y);
                    ctx.strokeStyle = e.color;
                    ctx.shadowColor = e.color;
                    ctx.shadowBlur = 24;
                    ctx.lineWidth = 4 * (1 - ring);
                    ctx.globalAlpha = 1 - ring;
                    const rr = 40 + ring * 200;
                    ctx.beginPath();
                    for (let k = 0; k < 8; k++) {
                        const a = (Math.PI * 2 / 8) * k;
                        const x = Math.cos(a) * rr;
                        const y = Math.sin(a) * rr * 0.55;
                        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                }
                continue;
            }

            // --- SUMMONER CALL RUNE — pulsing summoning circle at source ---
            if (e.type === 'sig_call_rune') {
                e.life--;
                if (e.life <= 0) { this.effects.splice(i, 1); continue; }
                const p = 1 - (e.life / e.maxLife);
                const scale = 0.6 + p * 0.8;
                const alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
                ctx.save();
                ctx.translate(e.x, e.y + 30);
                ctx.rotate(p * Math.PI); // slow turn
                ctx.scale(1, 0.4);       // flattened ground rune
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 18;
                ctx.lineWidth = 3;
                ctx.globalAlpha = alpha;
                // Outer ring
                ctx.beginPath();
                ctx.arc(0, 0, 80 * scale, 0, Math.PI * 2);
                ctx.stroke();
                // Inner triangle rune
                ctx.beginPath();
                for (let k = 0; k < 3; k++) {
                    const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
                    const x = Math.cos(a) * 46 * scale;
                    const y = Math.sin(a) * 46 * scale;
                    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.stroke();
                // Tick marks on the ring
                for (let k = 0; k < 8; k++) {
                    const a = (k / 8) * Math.PI * 2;
                    const x1 = Math.cos(a) * 72 * scale;
                    const y1 = Math.sin(a) * 72 * scale;
                    const x2 = Math.cos(a) * 88 * scale;
                    const y2 = Math.sin(a) * 88 * scale;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
                continue;
            }

            // --- SUMMONER CALL SPIRIT — ethereal projectile arcing to target ---
            if (e.type === 'sig_call_spirit') {
                e.life--;
                e.progress = Math.min(1, e.progress + 0.055);
                if (e.life <= 0 || e.progress >= 1) { this.effects.splice(i, 1); continue; }
                const dx = e.tx - e.sx;
                const dy = e.ty - e.sy;
                const arcY = -180 * Math.sin(e.progress * Math.PI); // arc trajectory
                const px = e.sx + dx * e.progress;
                const py = e.sy + dy * e.progress + arcY;
                ctx.save();
                ctx.translate(px, py);
                ctx.strokeStyle = e.color;
                ctx.shadowColor = e.color;
                ctx.shadowBlur = 22;
                ctx.lineWidth = 3;
                // Spirit wisp: three concentric eroded circles
                for (let k = 0; k < 3; k++) {
                    const r = 22 - k * 6;
                    ctx.globalAlpha = 0.35 + 0.25 * k;
                    ctx.beginPath();
                    ctx.arc(0, 0, r, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // Trailing fade motes behind it
                ctx.globalAlpha = 0.5;
                ctx.fillStyle = e.color;
                for (let k = 1; k <= 4; k++) {
                    const t = Math.max(0, e.progress - k * 0.04);
                    const trailX = e.sx + dx * t - px;
                    const trailY = e.sy + dy * t - 180 * Math.sin(t * Math.PI) - py;
                    ctx.beginPath();
                    ctx.arc(trailX, trailY, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
                continue;
            }
        }
    },

    async endTurn() {
      // Reject endTurn calls that land too soon after combat start or while
      // a previous endTurn is already running the enemy phase. Fixes a
      // mobile bug where the same tap that picked the map node leaked
      // through to the newly-positioned END TURN button, auto-skipping
      // turn 1 and kicking the enemy phase before the player could act.
      if (this._endTurnRunning) return;
      if (this._combatStartedAt && (Date.now() - this._combatStartedAt) < 500) return;
      if (this.currentState !== STATE.COMBAT && this.currentState !== STATE.TUTORIAL_COMBAT) return;
      this._endTurnRunning = true;
      try {
        ClassAbility.onTurnEnd();
        // Relic: TEMPO LOOP — count unused dice for next-turn shield bonus.
        if (this.player && this.player.hasRelic && this.player.hasRelic('tempo_loop')) {
            this._carriedUnusedDice = (this.dicePool || []).filter(d => !d.used).length;
        }
        // Sector 3 — Heat Tiles. Molten ground burns the player each turn
        // end. Ignores the shield (it's environmental, not an attack) so
        // shield-stack runs still have to respect the sector tempo.
        if (this._activeSectorMech && this._activeSectorMech.playerHeatDmg && this.player && this.player.currentHp > 0) {
            const burn = this._activeSectorMech.playerHeatDmg;
            this.player.takeDamage(burn, null, true, /*bypassShield*/ true);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, `HEAT -${burn}`, '#ff6600');
        }
        // Show end-of-turn summary if any meaningful stats this turn
        this.showTurnSummary();
        if (this.currentState === STATE.TUTORIAL_COMBAT && this.tutorialStep === 8) {
            this.tutorialStep = 9;
            this.updateTutorialStep(); 
            if (this.enemy) this.enemy.playAnim('lunge');
            await this.sleep(2000);
            this.qte.radius = 100; 
            const multiplier = await this.startQTE('DEFEND', this.player.x, this.player.y);
            let dmg = 5;
            dmg = Math.floor(dmg * multiplier);
            this.player.takeDamage(dmg, this.enemy, true);
            await this.sleep(1000);
            this.tutorialStep = 10;
            this.updateTutorialStep();
            this.startTurn();
            return;
        }
        
        if(!this.enemy) return;
        
        const btnEnd = document.getElementById('btn-end-turn');
        if(btnEnd) {
             btnEnd.disabled = true;
             // Hourglass — enemy phase active
             this.setButtonLabel(btnEnd, '<svg viewBox="0 0 24 24" class="game-icon" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3 L17 3 L17 7 L12 11 L7 7 Z" fill="currentColor" fill-opacity="0.3"/><path d="M7 21 L17 21 L17 17 L12 13 L7 17 Z" fill="currentColor" fill-opacity="0.3"/><path d="M6 3 L18 3 M6 21 L18 21"/></svg>');
             btnEnd.style.opacity = 0.5;
        }

        await this.showPhaseBanner("ENEMY PHASE", "INCOMING DATA STREAM", 'enemy');

        // --- PLAYER MINION PHASE ---
        for (const m of this.player.minions) {
            if(!this.enemy || this.enemy.currentHp <= 0) break;
            m.playAnim('lunge');
            const targets = [this.enemy, ...this._enemyMinions()];
            const t = targets[Math.floor(Math.random() * targets.length)];
            if(t && t.currentHp > 0) {
                if (this.player.traits.minionName === "Bomb Bot") {
                    // Snapshot the bomb's on-screen position BEFORE we mutate
                    // `player.minions`. Removing `m` from the array shifts
                    // remaining minions down an index, and the next render
                    // frame's `updateMinionPositions` would otherwise re-bind
                    // `m.x` to whichever slot it used to occupy.
                    const launchX = m.x, launchY = m.y;
                    // Decrement charges first so retargeting & UI reflect this strike before flight.
                    m.charges--;
                    const spent = m.charges <= 0;
                    if (spent) {
                        // Mark truly dead — the enemy intent's validTarget check
                        // (currentHp > 0) needs this so it retargets to the player.
                        m.currentHp = 0;
                        this.player.minions = this.player.minions.filter(min => min !== m);
                    } else {
                        ParticleSys.createFloatingText(m.x, m.y - 50, `${m.charges} CHARGES LEFT`, COLORS.GOLD);
                    }
                    await this._detonateBombBot(m, launchX, launchY);
                } else {
                    this.triggerVFX('nature_dart', m, t, (multiplier = 1.0) => {
                        // Relic: SWARM BEACON — player minions deal +1 DMG per alive minion.
                        let swarmBonus = 0;
                        if (this.player.hasRelic('swarm_beacon')) {
                            const aliveCount = this.player.minions.filter(mm => mm && mm.currentHp > 0).length;
                            const stacks = this.player.relics.filter(r => r.id === 'swarm_beacon').length;
                            swarmBonus = aliveCount * stacks;
                        }
                        const dmg = Math.floor((m.dmg + swarmBonus) * multiplier);
                        if (t.takeDamage(dmg, m) && t === this.enemy) { this.winCombat(); return; }
                        if (t !== this.enemy && t.currentHp <= 0) {
                             // Blood Thrall kills no longer heal the player — the
                             // thrall's value now comes from soaking damage while
                             // alive (see Player.takeDamage redirect). Per-hit
                             // lifesteal on the player's own attacks is still on.
                             if (this.enemy) this.enemy.minions = this.enemy.minions.filter(min => min !== t);
                             if(this.player.hasRelic('brutalize') && !t.isPlayerSide) {
                                 this.triggerBrutalize(t);
                                 if(this.enemy && this.enemy.currentHp <= 0) { this.winCombat(); return; }
                             }
                        }
                    });
                }
            }
            await this.sleep(500);
        }
        
        if(!this.enemy || this.enemy.currentHp <= 0) { this.winCombat(); return; }

        // --- ENEMY INTENT PHASE ---
        for (const intent of this.enemy.nextIntents) {
            if (this.enemy.currentHp <= 0) break;
            // Stop resolving further intents once the player has died (e.g.
            // a reflected-damage kill, Phage Pod detonation, or prior intent's
            // deferred VFX callback). Prevents extra intents chewing on a
            // corpse and overwriting the death screen.
            if (this.currentState === STATE.GAMEOVER) return;
            if (this.player && this.player.currentHp <= 0) return;

            this.enemy.playAnim('lunge');
            
            // 1. Secondary Effects (Buff/Debuff)
            if (intent.secondary) {
                const isImproved = (this.enemy.isElite || this.enemy.isBoss);
                if (intent.secondary.type === 'buff') {
                    const hpGain = isImproved ? 15 : 5;
                    const dmgGain = isImproved ? 5 : 2;
                    this.enemy.maxHp += hpGain;
                    this.enemy.currentHp += hpGain;
                    this.enemy.baseDmg += dmgGain;
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "EMPOWERED!", "#ff00ff");
                    AudioMgr.playSound('upgrade');
                    await this.sleep(400);
                } else if (intent.secondary.type === 'debuff') {
                    const id = intent.secondary.id;
                    const duration = isImproved ? 3 : 2;
                    let desc = "";
                    if (id === 'weak') desc = "Deals 50% less DMG.";
                    if (id === 'frail') desc = "Takes 30% more DMG.";
                    this.player.addEffect(id, duration, 0, '🦠', desc);
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "SYSTEM HACKED", "#00ff00");
                    AudioMgr.playSound('attack');
                    await this.sleep(400);
                }
            }

            // 2. Primary Intent Execution
            if (intent.type === 'buff') {
                this.enemy.addShield(20);
                this._enemyMinions().forEach(m => m.addShield(10));
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "FORTIFY", "#00f3ff");
                AudioMgr.playSound('upgrade');
            }
            else if (intent.type === 'debuff') {
                // Ensure debuff damage (Virus) uses effective value (affected by Weak/Constrict)
                const dmgVal = (intent.effectiveVal !== undefined) ? intent.effectiveVal : intent.val;
                
                if (dmgVal > 0) {
                    const multiplier = await this.startQTE('DEFEND', this.player.x, this.player.y);
                    let dmg = Math.floor(dmgVal * multiplier);
                    if (this.player.takeDamage(dmg, this.enemy, true) && this.player.currentHp <= 0) { this.gameOver(); return; }
                }
                this.player.addEffect('weak', 2, 0, '🦠', "Deals 50% less DMG.");
                ParticleSys.createFloatingText(this.player.x, this.player.y - 120, "VIRUS UPLOAD", "#00ff00");
                AudioMgr.playSound('attack');
            }
            else if (intent.type === 'shield') {
                this.enemy.addShield(intent.val);
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "SHIELD UP", COLORS.SHIELD);
                AudioMgr.playSound('defend');
            }
            else if (intent.type === 'dispel') {
                this.enemy.effects = []; 
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, "CLEANSED", "#ffffff");
                AudioMgr.playSound('upgrade');
            }
            else if (intent.type === 'consume') {
                if (this.player.minions.length > 0) {
                    const snack = this.player.minions[0];
                    this.triggerVFX('beam', this.enemy, snack);
                    await this.sleep(300);
                    this.player.minions.shift(); 
                    
                    // UPDATED: Restore 30% HP, bypassing modifiers (Constrict/Rot)
                    const healAmt = Math.floor(this.enemy.maxHp * 0.3);
                    this.enemy.currentHp = Math.min(this.enemy.maxHp, this.enemy.currentHp + healAmt);
                    
                    // Manually trigger visual/audio since we bypassed entity.heal()
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 80, "+" + healAmt, '#0f0');
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y, "CONSUMED!", "#ff0000");
                    AudioMgr.playSound('mana');
                } else {
                    // Fallback to Attack if no minions
                    intent.type = 'attack';
                    intent.val = this.enemy.baseDmg;
                    // Recalculate effectiveVal immediately for the subsequent attack block
                    intent.effectiveVal = this.enemy.getEffectiveDamage(intent.val);
                }
            }
            else if (intent.type === 'charge') {
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 150, "CHARGING PURGE...", "#ff0000");
                AudioMgr.playSound('siren');
            }
            else if (intent.type === 'reality_overwrite') {
                this.enemy.realityOverwritten = true;
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 150, "REALITY OVERWRITE", "#bc13fe");
                Game.shake(20);
                AudioMgr.playSound('grid_fracture');
            }
            else if (intent.type === 'summon_glitch') {
                const m = new Minion(this.enemy.x, this.enemy.y, this.enemy.minions.length + 1, false, 3);
                m.name = "Glitch";
                m.maxHp = 100; m.currentHp = 100; m.dmg = 5;
                m.spawnTimer = 1.0;
                this.enemy.minions.push(m);
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, "GLITCH SPAWNED", "#ff00ff");
                AudioMgr.playSound('mana');
            }
            else if (intent.type === 'summon_void') {
                if (this.enemy.minions.length < 2) {
                    const m = new Minion(this.enemy.x, this.enemy.y, this.enemy.minions.length + 1, false, 1);
                    m.name = "Void Spawn";
                    m.maxHp = 28; m.currentHp = 28;
                    m.dmg = 8;
                    m.isVoidSpawn = true;
                    m.spawnTimer = 1.0;
                    this.enemy.minions.push(m);
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, "VOID SPAWN", "#ff00ff");
                    ParticleSys.createShockwave(this.enemy.x, this.enemy.y + 80, '#ff00ff', 24);
                    AudioMgr.playSound('mana');
                }
            }

            // ===== Expansion (5.2.1) intent handlers ================================
            // Some kinds resolve fully here (self-buffs, helper actions, silent turns);
            // others mutate into a standard 'attack' so the shared attack block handles
            // damage, VFX, hit-stop, and QTEs uniformly.
            else if (intent.type === 'aoe_sweep') {
                // Riot Suppressor: single QTE then damage everyone player-side.
                const dmg = intent.effectiveVal !== undefined ? intent.effectiveVal : intent.val;
                await this.sleep(300);
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, "SWEEP ARC", "#ff3355");
                const mult = await this.startQTE('DEFEND', this.player.x, this.player.y);
                const finalDmg = Math.floor(dmg * mult);
                this.triggerVFX('glitch_spike', this.enemy, this.player, () => {
                    if (this.player.takeDamage(finalDmg, this.enemy, true) && this.player.currentHp <= 0) { this.gameOver(); return; }
                });
                this.player.minions.forEach(m => m.takeDamage(finalDmg, this.enemy));
                this.player.minions = this.player.minions.filter(m => m.currentHp > 0);
                AudioMgr.playSound('explosion');
                if (this.shake) this.shake(10);
                continue;
            }
            else if (intent.type === 'frost_aoe') {
                const dmg = intent.effectiveVal !== undefined ? intent.effectiveVal : intent.val;
                await this.sleep(300);
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, "CRYO FIELD", "#88eaff");
                const mult = await this.startQTE('DEFEND', this.player.x, this.player.y);
                const finalDmg = Math.floor(dmg * mult);
                if (this.player.takeDamage(finalDmg, this.enemy, true) && this.player.currentHp <= 0) { this.gameOver(); return; }
                this.player.addEffect('weak', 2, 0, '🥶', 'Deals 50% less DMG.');
                this.player.minions.forEach(m => m.takeDamage(Math.floor(finalDmg * 0.6), this.enemy));
                this.player.minions = this.player.minions.filter(m => m.currentHp > 0);
                continue;
            }
            else if (intent.type === 'immolate') {
                // Self-destruct: massive AoE and the Slag Geyser dies.
                const dmg = intent.effectiveVal !== undefined ? intent.effectiveVal : intent.val;
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, "IMMOLATE!", "#ff6600");
                ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 80, "#ff6600");
                if (this.shake) this.shake(24);
                AudioMgr.playSound('explosion');
                if (this.player.takeDamage(dmg, this.enemy, true) && this.player.currentHp <= 0) { this.gameOver(); return; }
                this.player.minions.forEach(m => m.takeDamage(Math.floor(dmg * 0.8), this.enemy));
                this.player.minions = this.player.minions.filter(m => m.currentHp > 0);
                // Geyser consumes itself — force a combat win.
                this.enemy.currentHp = 0;
                this.winCombat();
                return;
            }
            else if (intent.type === 'charging_immolate' || intent.type === 'burrow_idle' || intent.type === 'observer_wait') {
                const label = intent.type === 'charging_immolate' ? "CHARGING..." :
                              intent.type === 'burrow_idle' ? "BURROWED" : "OBSERVING...";
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, label, "#ffaa00");
                await this.sleep(300);
                continue;
            }
            else if (intent.type === 'heal_ally') {
                const t = intent.target;
                if (t && t.currentHp > 0 && typeof t.heal === 'function') {
                    t.heal(intent.val);
                    this.triggerVFX && this.triggerVFX('beam', this.enemy, t);
                }
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, "MEND LINK", "#7fff00");
                continue;
            }
            else if (intent.type === 'shield_ally') {
                const allies = [...(this.enemy.minions || [])];
                allies.forEach(a => a.addShield && a.addShield(intent.val));
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, `WARDED +${intent.val}`, COLORS.SHIELD);
                continue;
            }
            else if (intent.type === 'buff_allies') {
                // Permanent +dmg buff to every enemy-side combatant this combat.
                const pool = [this.enemy, ...(this.enemy.minions || [])];
                pool.forEach(a => { if (a && a.baseDmg !== undefined) a.baseDmg += intent.val; });
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, `EMPOWER +${intent.val} DMG`, "#ffd76a");
                continue;
            }
            else if (intent.type === 'shield_strip_attack') {
                // Null Priest: erase shield before landing the hit.
                if (this.player.shield > 0) {
                    this.player.shield = 0;
                    ParticleSys.createFloatingText(this.player.x, this.player.y - 130, "SHIELD PURGED", "#ff66aa");
                    ParticleSys.createShockwave(this.player.x, this.player.y, '#ff66aa', 32);
                }
                intent.type = 'attack';
            }
            else if (intent.type === 'chaotic_act') {
                // Random self-buff, then fall through to standard attack.
                const pick = this.enemy.chaoticBuffList[Math.floor(Math.random() * this.enemy.chaoticBuffList.length)];
                if (pick === 'empower')    { this.enemy.baseDmg += 3; ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, "EMPOWER +3 DMG", "#ffd76a"); }
                else if (pick === 'thorns') { this.enemy.thorns = (this.enemy.thorns || 0) + 4; ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, "THORNS +4", "#ffffff"); }
                else if (pick === 'regen')  { this.enemy.heal && this.enemy.heal(Math.floor(this.enemy.maxHp * 0.08)); }
                else                         { this.enemy.addShield && this.enemy.addShield(15); }
                intent.type = 'attack';
            }
            else if (intent.type === 'mirror_attack' || intent.type === 'observer_strike' || intent.type === 'burrow_resurge') {
                // Unique flavor toast, then drop into the shared attack handler.
                const label = intent.type === 'mirror_attack' ? "REFLECT" :
                              intent.type === 'observer_strike' ? "STRIKE!" : "RESURGE";
                const color = intent.type === 'mirror_attack' ? "#00f3ff" :
                              intent.type === 'observer_strike' ? "#ff3355" : "#cc6600";
                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 140, label, color);
                intent.type = 'attack';
            }

            // 3. Attack Handling (Normal, Multi, Purge)
            if (intent.type === 'attack' || intent.type === 'multi_attack' || intent.type === 'purge_attack') {
                const target = intent.target || this.player;
                const validTarget = (target.currentHp > 0) ? target : this.player;
                
                // Determine Hit Count (Multi-attack support)
                const hits = (intent.type === 'multi_attack' && intent.hits) ? intent.hits : 1;
                
                await this.sleep(400); 

                for(let h=0; h<hits; h++) {
                    // Slight delay between multi-hits
                    if (h > 0) await this.sleep(200);

                    if (validTarget === this.player) {
                        // Only trigger QTE on the first hit of a multi-attack to avoid spamming
                        let multiplier = 1.0;
                        if (h === 0) {
                            multiplier = await this.startQTE('DEFEND', this.player.x, this.player.y);
                        } else {
                            multiplier = 0.8; // Reduced block on subsequent hits if they happen fast
                        }

                        const vfxType = intent.type === 'purge_attack' ? 'orbital_strike' : 'glitch_spike';
                        
                        this.triggerVFX(vfxType, this.enemy, validTarget, () => {
                            // Ensure using effectiveVal (includes Weak/Constrict)
                            let dmg = intent.effectiveVal !== undefined ? intent.effectiveVal : intent.val;
                            dmg = Math.floor(dmg * multiplier);
                            // Sentinel SHIELD WALL: nullify incoming attack if primed.
                            if (validTarget === this.player && ClassAbility.consumeAttackBlock()) {
                                ParticleSys.createShockwave(this.player.x, this.player.y, '#ffffff', 40);
                                if (this.shake) this.shake(8);
                                return;
                            }
                            // Annihilator RICOCHET: reduce incoming damage based on stacks
                            if (validTarget === this.player && this.player.ricochetStacks > 0) {
                                if (this.player.ricochetStacks >= 3) {
                                    dmg = 0;
                                    ParticleSys.createFloatingText(this.player.x, this.player.y - 170, "RICOCHET IMMUNE!", "#ff8800");
                                } else {
                                    const ricochetPct = this.player.ricochetStacks * (this.player.classId === 'annihilator' ? 20 : 20);
                                    dmg = Math.floor(dmg * (1 - ricochetPct / 100));
                                    ParticleSys.createFloatingText(this.player.x, this.player.y - 170, `RICOCHET -${ricochetPct}%`, "#ff6600");
                                }
                            }
                            // Sentinel TEMP THORNS: reflect damage back to attacker
                            if (validTarget === this.player && this.player.tempThorns > 0 && this.enemy && this.enemy.currentHp > 0) {
                                this.enemy.takeDamage(this.player.tempThorns);
                                ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, `THORNS ${this.player.tempThorns}`, "#ffffff");
                            }
                            if (validTarget.takeDamage(dmg, this.enemy, true) && validTarget === this.player) { this.gameOver(); return; }
                        });
                    } else {
                        // Minion Target
                        this.triggerVFX('glitch_spike', this.enemy, validTarget, () => {
                            let dmg = intent.effectiveVal !== undefined ? intent.effectiveVal : intent.val;
                            if (validTarget.takeDamage(dmg, this.enemy)) {
                                 if (this.player.traits.maxMinions === 3 && Math.random() < 0.3) { 
                                     validTarget.currentHp = Math.floor(validTarget.maxHp / 2);
                                     ParticleSys.createFloatingText(validTarget.x, validTarget.y, "REVIVED!", "#00ff99");
                                 } else {
                                     // Capture launch coords before removal — see _detonateBombBot.
                                     const bombX = validTarget.x, bombY = validTarget.y;
                                     this.player.minions = this.player.minions.filter(m => m !== validTarget);
                                     this.deadMinionsThisTurn++;
                                     if (this.player.traits.minionName === "Bomb Bot") {
                                         // Fire-and-forget — the enemy's attack flow continues
                                         // while the missile flies and explodes a beat later.
                                         this._detonateBombBot(validTarget, bombX, bombY);
                                     }
                                 }
                            }
                        });
                    }
                }
            } 
            else if (intent.type === 'heal') {
                await this.sleep(300);
                // Use effectiveVal (Constrict applies here)
                this.enemy.heal(intent.effectiveVal || intent.val); 
            } 
            else if (intent.type === 'summon') {
                await this.sleep(300);
                if(this.enemy.minions.length < 2) {
                    const tier = this.enemy.isBoss ? 3 : (this.enemy.isElite ? 2 : 1);
                    const m = new Minion(this.enemy.x, this.enemy.y, this.enemy.minions.length + 1, false, tier);
                    m.spawnTimer = 1.0; 
                    
                    // Apply sector scaling to summons
                    const ascensionMult = 1 + (this.corruptionLevel * 0.2);
                    m.maxHp = Math.floor(m.maxHp * ascensionMult);
                    m.currentHp = m.maxHp;
                    m.dmg = Math.floor(m.dmg * ascensionMult);
                    
                    this.enemy.minions.push(m);
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, "REINFORCING", "#fff");
                    AudioMgr.playSound('mana');
                }
            }
            
            await this.sleep(1200);
        }

        // Combat may have ended mid-intent (e.g. Bomb Bot killed the boss). Bail before
        // touching enemy.minions.
        if (!this.enemy || this.enemy.currentHp <= 0) return;

        // --- MINION ATTACKS ---
        for (const min of this._enemyMinions()) {
            // Bail if the player died on a prior minion's attack callback (or
            // via thorns/reflect). Prevents cascading gameOver calls and the
            // minion queue chewing on a corpse.
            if (this.currentState === STATE.GAMEOVER) return;
            if (this.player && this.player.currentHp <= 0) return;
            // --- VOID SPAWN: consume a player minion (heal boss by its HP) or drain mana on hit. ---
            if (min.isVoidSpawn) {
                min.playAnim('lunge');
                await this.sleep(300);
                if (this.player.minions.length > 0) {
                    const victim = this.player.minions[0];
                    const healAmt = Math.max(1, victim.currentHp);
                    this.triggerVFX('void_tendril', min, victim);
                    // Reach + wrap phase.
                    await this.sleep(420);
                    victim.currentHp = 0;
                    ParticleSys.createFloatingText(victim.x, victim.y, "CONSUMED", "#bc13fe");
                    ParticleSys.createShockwave(victim.x, victim.y, '#1a0025', 40);
                    this.player.minions = this.player.minions.filter(m => m !== victim);
                    // Retract phase drags essence back into the boss.
                    await this.sleep(360);
                    this.enemy.currentHp = Math.min(this.enemy.maxHp, this.enemy.currentHp + healAmt);
                    ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 80, `+${healAmt}`, "#00ff00");
                    AudioMgr.playSound('mana');
                } else {
                    this.triggerVFX('micro_laser', min, this.player, () => {
                        if (this.player.takeDamage(min.dmg, min) && this.player.currentHp <= 0) { this.gameOver(); return; }
                        if (this.player.mana > 0) {
                            this.player.mana = Math.max(0, this.player.mana - 1);
                            ParticleSys.createFloatingText(this.player.x, this.player.y - 80, "MANA DRAIN -1", "#bc13fe");
                        }
                    });
                }
                await this.sleep(600);
                continue;
            }

            min.playAnim('lunge');
            await this.sleep(300);
            const targets = [this.player, ...this.player.minions];
            const t = targets[Math.floor(Math.random() * targets.length)];
            if(t) {
                this.triggerVFX('micro_laser', min, t, () => {
                    if (min.tier >= 2 && this.enemy.currentHp > 0) {
                        this.enemy.heal(2);
                        ParticleSys.createFloatingText(this.enemy.x, this.enemy.y, "LEECH", "#00ff00");
                    }
                    if (t.takeDamage(min.dmg, min) && t === this.player) { this.gameOver(); return; }
                    if (t !== this.player && t.currentHp <= 0) {
                         if (this.player.traits.maxMinions === 3 && Math.random() < 0.3) { 
                             t.currentHp = Math.floor(t.maxHp / 2);
                             ParticleSys.createFloatingText(t.x, t.y, "REVIVED!", "#00ff99");
                         } else {
                            // Capture launch coords before removal — see _detonateBombBot.
                            const bombX = t.x, bombY = t.y;
                            this.player.minions = this.player.minions.filter(m => m !== t);
                            this.deadMinionsThisTurn++;
                            if (this.player.traits.minionName === "Bomb Bot") {
                                this._detonateBombBot(t, bombX, bombY);
                            }
                         }
                    }
                });
            }
            await this.sleep(600);
        }

        // Combat may have ended inside a minion callback (kill via lifesteal/brutalize/etc).
        if (!this.enemy || this.enemy.currentHp <= 0) return;
        // Or the player died on a reflect / thorns / minion-attack path — don't
        // start another turn on a dead player.
        if (this.currentState === STATE.GAMEOVER) return;
        if (this.player && this.player.currentHp <= 0) return;

        if (this.enemy) this.enemy.minions = this.enemy.minions.filter(m => m.currentHp > 0);

        while (this.effects.some(e => e.type === 'micro_laser' && !e.parried)) {
            await this.sleep(100);
        }

        this.updateHUD();
        this.startTurn();
      } catch (err) {
        this._recoverFromCombatError('endTurn', err, false);
      }
    },

    async winCombat() {
        // Guard: a detonator / reflect / thorns interaction can kill the player
        // in the same tick that kills the enemy. gameOver() has already moved
        // the state — bail before we hand out rewards to a corpse.
        if (this.currentState === STATE.GAMEOVER) return;
        if (this.player && this.player.currentHp <= 0) return;
        // Idempotency guard: if a deferred VFX callback (e.g. Bomb Bot missile
        // impact) already finished the combat and nulled `this.enemy`, the
        // outer turn loop's post-phase win check (endTurn ~line 9892) would
        // re-enter here and crash on `this.enemy.isBoss`. Bail cleanly.
        if (!this.enemy) return;
        // Reentrance guard: multiple player-minion darts, reflect damage, or
        // the post-phase win check can all fire winCombat() concurrently. The
        // first call is paused on an await (slow-mo, dissolve) when the second
        // enters — and the first will later null `this.enemy` at the rewards
        // step, stranding the second call to crash on `this.enemy.isBoss`.
        // Single-flight via this flag; reset in finally so next combat is clean.
        if (this._winCombatRunning) return;
        this._winCombatRunning = true;
        try {
        // Victory fanfare — particle shower at enemy + audio sting so every
        // kill lands before the slow-mo cinematic takes over. Non-blocking.
        if (this.enemy) {
            const fx = this.enemy.x, fy = this.enemy.y;
            ParticleSys.createShockwave(fx, fy, COLORS.GOLD, 56);
            ParticleSys.createExplosion(fx, fy, 40, COLORS.GOLD);
            ParticleSys.createSparks(fx, fy, COLORS.GOLD, 26);
            if (this.player) {
                ParticleSys.createExplosion(this.player.x, this.player.y, 18, COLORS.GOLD);
            }
            AudioMgr.playSound('upgrade');
            this.shake(this.enemy.isBoss ? 18 : this.enemy.isElite ? 12 : 8);
            this.triggerScreenFlash && this.triggerScreenFlash('rgba(255,215,0,0.18)', 260);
        }
        ClassAbility.endCombat();
        AudioMgr.stopSectorAmbient && AudioMgr.stopSectorAmbient();
        // Clear the sector signature mechanic so post-combat states don't
        // inherit it (noise on shop previews, map draws, etc.).
        this._activeSectorMech = null;
        const mechPillEnd = document.getElementById('sector-mech-pill');
        if (mechPillEnd) mechPillEnd.textContent = '';
        // Track the kill so the next time the player meets this enemy the
        // briefing shows "Encountered N times" and achievements can fire.
        if (this.enemy && this.enemy.name && this.currentState !== STATE.TUTORIAL_COMBAT) {
            Intel.recordKill(this.enemy.name);
            // Also log any enemy-side minion kills for regular combats so
            // the total-kill counter climbs realistically.
            if (Array.isArray(this.enemy.minions)) {
                this.enemy.minions.forEach(m => {
                    if (m && m.name && m.currentHp <= 0) Intel.recordKill(m.name);
                });
            }
        }
        Analytics.emit('combat_end', {
            won: true,
            sector: this.sector,
            enemy: this.enemy ? this.enemy.name : 'unknown',
            turns: this.turnCount || 0
        });
        // Per-boss death dissolve — run before the usual victory fanfare so
        // the cinematic plays while frags/rewards resolve in the background.
        if (this.enemy && this.enemy.isBoss && this.currentState !== STATE.TUTORIAL_COMBAT) {
            try { await this._runBossDeathDissolve(this.enemy); } catch (e) { /* swallow */ }
        }
        // Achievements: boss + run-completion checks (eligible only outside tutorial)
        if (this.currentState !== STATE.TUTORIAL_COMBAT && this.enemy) {
            if (this.enemy.isBoss && typeof Achievements !== 'undefined') {
                Achievements.unlock('FIRST_BOSS');
                Unlocks.grant('intel', 'first_boss_defeated');
                // Clear the assist streak for this sector on victory.
                Assist.recordWin(this.sector);
                if (this.sector >= 5) {
                    Unlocks.grant('ascension', 'sector5_cleared');
                    Analytics.emit('run_end', {
                        won: true,
                        sector: this.sector,
                        turns: this.turnCount || 0,
                        fragments: this.techFragments || 0
                    });
                }
                // Signature die evolution: T1 -> T2 after sector 2 clear, T2 -> T3 after sector 4 clear
                if (this.player) {
                    const prevTier = this.player.signatureTier || 1;
                    let nextTier = prevTier;
                    if (this.sector >= 4) nextTier = 3;
                    else if (this.sector >= 2) nextTier = Math.max(nextTier, 2);
                    if (nextTier > prevTier) {
                        this.player.signatureTier = nextTier;
                        this._syncSignatureDie();
                        const def = (SIGNATURE_DICE[this.player.classId] || [])[nextTier - 1];
                        // Stronger tier-up cue so the moment reads clearly:
                        // shockwave + burst + shake + haptic, on top of the
                        // two floating labels.
                        const cx = this.player.x, cy = this.player.y;
                        const col = (def && def.color) || COLORS.GOLD;
                        ParticleSys.createShockwave(cx, cy, col, 48);
                        ParticleSys.createExplosion(cx, cy - 30, 36, col);
                        ParticleSys.createSparks && ParticleSys.createSparks(cx, cy, col, 20);
                        this.shake && this.shake(10);
                        this.haptic && this.haptic('crit');
                        AudioMgr.playSound('upgrade');
                        ParticleSys.createFloatingText(cx, cy - 180,
                            `SIGNATURE → TIER ${nextTier}`, COLORS.GOLD);
                        if (def) ParticleSys.createFloatingText(cx, cy - 130, def.name.toUpperCase(), col);
                    }
                }
                // Sector-5 boss = full run clear → class achievement + grand achievement
                if (this.sector >= 5 && this.player) {
                    Achievements.unlock('FIRST_RUN_COMPLETE');
                    const map = {
                        tactician: 'CLASS_TACTICIAN', arcanist: 'CLASS_ARCANIST',
                        bloodstalker: 'CLASS_BLOODSTALKER', annihilator: 'CLASS_ANNIHILATOR',
                        sentinel: 'CLASS_SENTINEL', summoner: 'CLASS_SUMMONER'
                    };
                    if (map[this.player.classId]) Achievements.unlock(map[this.player.classId]);
                    // Check "all 6 classes" composite
                    const allSix = ['CLASS_TACTICIAN','CLASS_ARCANIST','CLASS_BLOODSTALKER','CLASS_ANNIHILATOR','CLASS_SENTINEL','CLASS_SUMMONER'];
                    if (allSix.every(id => Achievements.isUnlocked(id))) Achievements.unlock('ALL_CLASSES_S5');
                    // Ascension-tier achievements
                    const sel = Ascension.getSelected();
                    if (sel >= 10) Achievements.unlock('ASC_10');
                    if (sel >= 5) Achievements.unlock('ASC_5');
                    if (sel >= 1) Achievements.unlock('ASC_1');
                }
                // Naked Power / Pristine
                if (this.player && (!this.player.relics || this.player.relics.length === 0)) {
                    Achievements.unlock('NO_RELIC_BOSS');
                }
                if (this.player && this.player.currentHp >= this.player.maxHp) {
                    Achievements.unlock('FULL_HP_BOSS');
                }
            }
        }
        if (this.currentState === STATE.TUTORIAL_COMBAT) {
            if (this.enemy.currentHp <= 0) {
                // Hide narration + tutorial overlays immediately so nothing lingers.
                const nar = document.getElementById('tutorial-narration');
                if (nar) nar.classList.add('hidden');
                document.getElementById('tutorial-overlay').classList.add('hidden');
                document.getElementById('tutorial-text').classList.add('hidden');
                document.querySelectorAll('.tutorial-focus').forEach(el => el.classList.remove('tutorial-focus'));
                // Celebration burst at dummy's position, then exit to map.
                ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 80, '#fff');
                ParticleSys.createShockwave(this.enemy.x, this.enemy.y, COLORS.GOLD, 32);
                AudioMgr.playSound('explosion');
                this.enemy = null;
                setTimeout(() => this.openPostTutorial(), 600);
                return;
            }
            return;
        }

        // Kill-blow slow-mo cinematic — scaled by enemy tier for game-feel impact.
        if (this.enemy && this.enemy.isBoss) {
            this.triggerSlowMo(0.35, 0.7);
            await this.sleep(700);
        } else if (this.enemy && this.enemy.isElite) {
            this.triggerSlowMo(0.55, 0.35);
            await this.sleep(300);
        } else if (this.enemy) {
            // Normal mob kills get a brief slow-mo so every victory lands.
            this.triggerSlowMo(0.7, 0.18);
            await this.sleep(150);
        }

        // --- UPDATED: VICTORY SEQUENCE FOR TESSERACT PRIME ---
        if (this.enemy && this.enemy.name === "TESSERACT PRIME") {
            // Chronicle entry for the win (Roadmap Part 27).
            this._logRunHistory('win', { defeatedBy: null });
            // 1. Cinematic Crash
            await this.triggerSystemCrash();

            // 2. Set Data
            localStorage.setItem('mvm_gameCompleted', 'true');
            
            // Increment Corruption Level
            this.corruptionLevel++;
            localStorage.setItem('mvm_corruption', this.corruptionLevel);

            // Ascension promotion — clearing the run on selected level unlocks N+1
            const selected = Ascension.getSelected();
            const promoted = Ascension.onRunVictory(selected);
            if (promoted) {
                setTimeout(() => {
                    ParticleSys.createFloatingText(540, 800, `ASCENSION ${selected + 1} UNLOCKED`, '#ffd700');
                }, 1500);
            }
            // Daily Run completion bookkeeping
            if (Dailies.isActive()) {
                Dailies.markDailyComplete({
                    fragments: this.techFragments,
                    turns: (this.runStats && this.runStats.turns) || 0,
                    ascension: selected
                });
                Math.random = Game._origRandom; // restore unseeded RNG
                if (typeof Achievements !== 'undefined') Achievements.unlock('DAILY_FINISH');
            }
            
            // 3. Rewards
            this.techFragments += 1000;
            this.encryptedFiles += 3;
            this.bossDefeated = true; 
            
            this.saveGame();
            
            localStorage.removeItem('mvm_save_v1');
            document.getElementById('btn-load-save').style.display = 'none';

            this.changeState(STATE.ENDING);
            return;
        }
        // -----------------------------------------------------

        AudioMgr.bossSilence = false;
        AudioMgr.startMusic();

        let frags = 0;
        if (this.enemy.isBoss) {
            this.bossDefeated = true;
        }

        let droppedFile = false;
        if (this.enemy.isBoss) {
            frags = 95;
            droppedFile = true;
        } else if (this.enemy.isElite) {
            frags = Math.floor(Math.random() * (37 - 21 + 1)) + 21;
            if (Math.random() < 0.10) droppedFile = true;
        } else {
            frags = Math.floor(Math.random() * (27 - 11 + 1)) + 11;
        }

        // Data Miner: end combat at full HP → +20 fragments per stack.
        if (this.player.currentHp >= this.player.maxHp) {
            const miners = this.player.relics.filter(r => r.id === 'data_miner').length;
            if (miners > 0) {
                const bonus = 20 * miners;
                frags += bonus;
                ParticleSys.createFloatingText(this.player.x, this.player.y - 140, `DATA MINED +${bonus}`, COLORS.GOLD);
            }
        }

        ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 100, COLORS.MECH_LIGHT); 
        ParticleSys.createExplosion(this.enemy.x, this.enemy.y, 50, '#fff'); 
        AudioMgr.playSound('explosion'); 

        if (droppedFile) {
            this.encryptedFiles++;
            try { localStorage.setItem('mvm_encrypted', this.encryptedFiles); } catch(e) {}
            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH/2, CONFIG.CANVAS_HEIGHT/2 + 50, "ENCRYPTED FILE ACQUIRED", COLORS.MANA);
        }
        
        const lootBots = this.stackCount('loot_bot');
        if (lootBots > 0) {
            frags = Math.floor(frags * Math.pow(1.2, lootBots));
        }
        if(this.hasMetaUpgrade('m_greed')) {
            frags = Math.floor(frags * 1.2);
        }
        // Relic: LEYLINE CACHE — +50% Fragments from combat rewards.
        const leylineStacks = this.stackCount('leyline_cache');
        if (leylineStacks > 0) {
            frags = Math.floor(frags * Math.pow(1.5, leylineStacks));
        }
        // Relic: SALVAGE PROTOCOL — +3 Fragments per enemy-minion kill this
        // combat, plus the boss/regular kill that just ended combat. Works
        // as a steady passive trickle for run-sustain builds.
        if (this.player.hasRelic('salvage_protocol')) {
            const minionKills = Array.isArray(this.enemy.minions)
                ? this.enemy.minions.filter(m => m && m.currentHp <= 0).length
                : 0;
            const salvageBonus = 3 * (1 + minionKills);
            frags += salvageBonus;
            ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 120, `SALVAGE +${salvageBonus}`, COLORS.GOLD);
        }
        // Relic: SALVAGE ARM — elite kills drop +15 Fragments per stack.
        if (this.enemy && this.enemy.isElite && this.player.hasRelic('salvage_arm')) {
            const salvageStacks = this.stackCount('salvage_arm');
            frags += 15 * salvageStacks;
            ParticleSys.createFloatingText(this.enemy.x, this.enemy.y - 100, `SALVAGE +${15 * salvageStacks}`, COLORS.GOLD);
        }

        const stimStacks = this.stackCount('stim_pack');
        if (stimStacks > 0) {
            const healAmt = 5 * stimStacks;
            this.player.heal(healAmt);
            ParticleSys.createFloatingText(this.player.x, this.player.y - 100, "STIM PACK", COLORS.NATURE_LIGHT);
        }

        this.techFragments += frags;
        // Corrupted: VOID SIPHON — killing an enemy grants +1 Max Mana.
        if (this.player.hasRelic('c_void_siphon')) {
            const stacks = this.player.relics.filter(r => r.id === 'c_void_siphon').length;
            this.player.baseMana = (this.player.baseMana || 3) + stacks;
            ParticleSys.createFloatingText(this.player.x, this.player.y - 120, `VOID SIPHON +${stacks} MAX MANA`, "#aa00ff");
        }
        this.saveGame();

        // Capture celebration metadata before clearing combat state.
        const wasBoss = !!this.enemy.isBoss;
        const wasElite = !!this.enemy.isElite;
        const killName = this.enemy.name || '';

        this.enemy = null;
        this.player.minions = [];

        AudioMgr.playSound('mana');

        this.showCombatWin({ frags, droppedFile, wasBoss, wasElite, killName });
        } finally {
            this._winCombatRunning = false;
        }
    },

    showCombatWin({ frags, droppedFile, wasBoss, wasElite, killName }) {
        const titleEl = document.getElementById('combat-win-title');
        const subEl = document.getElementById('combat-win-sub');
        if (titleEl) {
            titleEl.classList.remove('boss-kill');
            if (wasBoss) {
                titleEl.classList.add('boss-kill');
                titleEl.textContent = `SECTOR CLEARED`;
            } else if (wasElite) {
                titleEl.textContent = 'ELITE ELIMINATED';
            } else {
                titleEl.textContent = 'TARGET NEUTRALIZED';
            }
        }
        if (subEl) {
            const fragLine = `<span class="highlight-frag">+${frags} FRAGMENTS</span>`;
            const fileLine = droppedFile ? ` &nbsp;·&nbsp; <span class="highlight-file">+1 ENCRYPTED FILE</span>` : '';
            const nameLine = (wasBoss && killName) ? `<div style="margin-top:8px; font-size:0.8em; opacity:0.7;">${killName} OFFLINE</div>` : '';
            // Highlight stat (Roadmap Part 31.2) — pulls the most
            // interesting moment from the run's combat log.
            let highlightLine = '';
            try {
                const entries = (typeof CombatLog !== 'undefined' && CombatLog._entries) || [];
                // Biggest DEALT hit this combat
                const playerName = this.player ? this.player.name : '';
                const dealtHits = entries.filter(e => e.type === 'damage' && e.targetName !== playerName);
                if (dealtHits.length) {
                    const best = dealtHits.reduce((m, e) => (!m || e.amount > m.amount) ? e : m, null);
                    if (best && best.amount >= 20) {
                        const tierWord = best.tier === 'catastrophic' ? 'CATASTROPHIC'
                                       : best.tier === 'heavy'        ? 'HEAVY'
                                       : best.tier === 'solid'        ? 'SOLID'
                                       : 'CHIP';
                        highlightLine = `<div class="combat-win-highlight">${tierWord} HIT · ${best.amount} DMG</div>`;
                    }
                }
            } catch (_) { /* cosmetic */ }
            subEl.innerHTML = fragLine + fileLine + nameLine + highlightLine;
        }
        this.changeState(STATE.COMBAT_WIN);
        AudioMgr.duck(0.1, wasBoss ? 2200 : 1500);
        const dwell = wasBoss ? 2500 : (wasElite ? 2000 : 1800);
        setTimeout(() => {
            if (this.currentState === STATE.COMBAT_WIN) {
                this.changeState(STATE.REWARD);
            }
        }, dwell);
    },

    generateRewards() {
        const container = document.getElementById('reward-options');
        container.innerHTML = '';
        
        let choices = 3;
        if(this.player.hasRelic('manifestor')) choices = 4;
        
        let pool = [...UPGRADES_POOL];
        
        // --- ADD CORRUPTED RELICS (If Ascended) ---
        // Gated entries require minimum corruption level.
        if (this.corruptionLevel > 0 && typeof CORRUPTED_RELICS !== 'undefined') {
            const level = this.corruptionLevel;
            const eligible = CORRUPTED_RELICS.filter(r => !r.minAscension || level >= r.minAscension);
            pool.push(...eligible);
        }
        
        // Filter Unique/One-time items
        if(this.player.hasRelic('second_life')) pool = pool.filter(i => i.id !== 'second_life');
        if(this.player.hasRelic('manifestor')) pool = pool.filter(i => i.id !== 'manifestor');
        if(this.player.hasRelic('voodoo_doll')) pool = pool.filter(i => i.id !== 'voodoo_doll');
        if(this.player.hasRelic('overcharge_chip')) pool = pool.filter(i => i.id !== 'overcharge_chip');
        if(this.player.hasRelic('reckless_drive')) pool = pool.filter(i => i.id !== 'reckless_drive'); 
        
        // Filter Maxed Items
        const coreCount = this.player.relics.filter(r => r.id === 'minion_core').length;
        if(coreCount >= 2) pool = pool.filter(i => i.id !== 'minion_core');

        const titanCount = this.player.relics.filter(r => r.id === 'titan_module').length;
        if(titanCount >= 3) pool = pool.filter(i => i.id !== 'titan_module');

        const relentlessCount = this.player.relics.filter(r => r.id === 'relentless').length;
        if(relentlessCount >= 3) pool = pool.filter(i => i.id !== 'relentless');

        const lensCount = this.player.relics.filter(r => r.id === 'crit_lens').length;
        if(lensCount >= 5) pool = pool.filter(i => i.id !== 'crit_lens');

        const gamblerCount = this.player.relics.filter(r => r.id === 'gamblers_chip').length;
        if(gamblerCount >= 3) pool = pool.filter(i => i.id !== 'gamblers_chip');

        const holoCount = this.player.relics.filter(r => r.id === 'hologram').length;
        if(holoCount >= 3) pool = pool.filter(i => i.id !== 'hologram');

        const fireCount = this.player.relics.filter(r => r.id === 'firewall').length;
        if(fireCount >= 3) pool = pool.filter(i => i.id !== 'firewall');

        // Shuffle pool
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        
        // Select Options
        const options = pool.slice(0, choices);
        
        options.forEach(item => {
            const card = document.createElement('div');
            const isGold = item.rarity === 'gold';
            const isRed = item.rarity === 'red';
            const isCorrupted = item.rarity === 'corrupted'; 
            
            let borderClass = '';
            if (isGold) borderClass = 'gold-border';
            if (isRed) borderClass = 'red-border';
            if (isCorrupted) borderClass = 'red-border'; // Re-use red border for now or add specific style

            // Apply sector theme so rewards feel tied to the zone you cleared.
            card.className = `reward-card ${borderClass} reward-sector-${this.sector}`;
            
            // Special styling for Corrupted items
            if (isCorrupted) {
                card.style.borderColor = "#ff00ff";
                card.style.boxShadow = "0 0 15px #ff00ff";
                card.style.background = "linear-gradient(135deg, rgba(50,0,50,0.8), rgba(20,0,20,0.9))";
            }
            
            const currentCount = this.player.relics.filter(r => r.id === item.id).length;
            
            // Safety for description scaling
            let nextDesc = item.desc;
            if (this.getRelicDescription) {
                 nextDesc = this.getRelicDescription(item, currentCount + 1);
            }

            // Rarity label (Phase 4g) — color-blind-safe text label + icon.
            let rarityLabel = 'COMMON', rarityIcon = '◆', rarityClass = 'rarity-common';
            if (isCorrupted) { rarityLabel = 'CORRUPTED'; rarityIcon = '☣'; rarityClass = 'rarity-corrupted'; }
            else if (isGold)  { rarityLabel = 'RARE';      rarityIcon = '★'; rarityClass = 'rarity-gold'; }
            else if (isRed)   { rarityLabel = 'EPIC';      rarityIcon = '✦'; rarityClass = 'rarity-red'; }

            // Synergy / stack hint (Phase 4h)
            let synergyHint = '';
            if (currentCount > 0) {
                synergyHint += `<div class="reward-stack-hint">⎘ Owned: ${currentCount}</div>`;
            }
            if (typeof SYNERGIES !== 'undefined' && this.player && this.player.relics) {
                const ownedIds = new Set(this.player.relics.map(r => r.id));
                ownedIds.add(item.id);
                const completed = SYNERGIES.find(s => s.ids.includes(item.id) && s.ids.every(id => ownedIds.has(id)) && !(this.synergiesTriggered && this.synergiesTriggered.has(s.id)));
                if (completed) {
                    synergyHint += `<div class="reward-synergy-hint">⚡ SYNERGY: ${completed.name}</div>`;
                    card.classList.add('synergy-ready');
                }
            }

            card.innerHTML = `
                <div class="reward-rarity ${rarityClass}">${rarityIcon} ${rarityLabel}</div>
                <div class="reward-icon">${item.icon}</div>
                <div class="reward-name ${isGold ? 'gold-text' : ''} ${isRed ? 'red-text' : ''}">${item.name}</div>
                <div class="reward-desc">${nextDesc}</div>
                ${synergyHint}
            `;
            
            card.onclick = () => {
                AudioMgr.playSound('click');

                // Optimistic UI (P10): the picked card flies toward the relic strip
                // before the actual state mutation happens. Visual feedback feels instant.
                this.flyRewardToStrip(card, item);

                if (item.instant) {
                    if(item.id === 'repair') {
                        const amt = Math.floor(this.player.maxHp * 0.3);
                        this.player.heal(amt);
                    }
                    if(item.id === 'hull_plating') { this.player.maxHp += 10; this.player.currentHp += 10; }
                    if(item.id === 'reinforced_shell') { this.player.maxHp += 20; this.player.currentHp += 20; }
                    if(item.id === 'mana_battery') this.player.baseMana += 1;
                } else {
                    this.player.addRelic(item);
                }
                Analytics.emit('relic_picked', { id: item.id, rarity: item.rarity || 'common' });
                Hints.trigger('first_relic');

                this.completeCurrentNode();

                if (this.bossDefeated) {
                    this.bossDefeated = false;
                    this.sector++;
                    this.generateMap();

                    // Custom Run: Tax Man — drain a fixed percentage of the
                    // player's fragments at each sector transition. Drives
                    // the "expensive decisions get more expensive" fantasy.
                    if (this._customFragDrainPerSector && this.techFragments > 0) {
                        const drained = Math.floor(this.techFragments * this._customFragDrainPerSector);
                        if (drained > 0) {
                            this.techFragments -= drained;
                            ParticleSys.createFloatingText(CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2,
                                `TAX MAN -${drained}`, '#ffaa00');
                        }
                    }

                    const sectorDisplay = document.getElementById('sector-display');
                    if(sectorDisplay) sectorDisplay.innerText = `SECTOR ${this.sector}`;

                    // Cinematic intro overlay (P6) plus full-screen collapse.
                    this.triggerSectorCollapse && this.triggerSectorCollapse();
                    this.playSectorIntro(this.sector);

                    this.saveGame();
                }

                this.changeState(STATE.MAP); 
            };

            container.appendChild(card);
        });
    },

    gameOver() {
        AudioMgr.stopSectorAmbient && AudioMgr.stopSectorAmbient();
        this._activeSectorMech = null;
        const mechPillGO = document.getElementById('sector-mech-pill');
        if (mechPillGO) mechPillGO.textContent = '';
        Hints.trigger('first_death');
        Unlocks.grant('daily', 'first_run_ended');
        // Record loss for the sector the run ended in — feeds dynamic assist.
        if (this.enemy && this.enemy.isBoss) {
            Assist.recordLoss(this.sector);
        }
        Analytics.emit('death', {
            enemy_name: this.enemy ? this.enemy.name : 'unknown',
            sector: this.sector,
            turn: this.turnCount || 0
        });
        Analytics.emit('run_end', {
            won: false,
            sector: this.sector,
            turns: this.turnCount || 0,
            fragments: this.techFragments || 0
        });
        ClassAbility.endCombat();
        if (typeof Achievements !== 'undefined') Achievements.unlock('GAMEOVER_FIRST');
        const revive = this.player.relics.findIndex(r => r.id === 'second_life');
        if(revive !== -1) {
            this.player.relics.splice(revive, 1);
            this.player.currentHp = Math.floor(this.player.maxHp * 0.5);
            
            ParticleSys.createFloatingText(this.player.x, this.player.y - 150, "REVIVED!", COLORS.GOLD);
            AudioMgr.playSound('mana');
            this.player.playAnim('pulse');
            this.renderRelics();
            this.updateHUD();

            setTimeout(() => {
                this.startTurn();
            }, 1000);
            
            return;
        }

        // RESET BOSS SILENCE
        AudioMgr.bossSilence = false;

        localStorage.removeItem('mvm_save_v1');
        document.getElementById('btn-load-save').style.display = 'none';

        // Chronicle entry (Roadmap Part 27) — every loss logs.
        this._logRunHistory('loss', { defeatedBy: this.enemy ? this.enemy.name : 'unknown' });

        this.renderDeathCards();
        this.renderRunSummary('screen-gameover');
        this.changeState(STATE.GAMEOVER);
    },

    // Rebuilds the death screen to emphasise what happened, not just stats.
    // Pulls entries from the CombatLog to surface concrete moments.
    renderDeathCards() {
        const screen = document.getElementById('screen-gameover');
        if (!screen) return;

        // Defeated-by title + operator callsign.
        const title = document.getElementById('go-title');
        const desc = document.getElementById('go-desc');
        const killer = (this.enemy && this.enemy.name) ? this.enemy.name : 'UNKNOWN';
        const operator = (Onboarding.getName && Onboarding.getName()) || 'OPERATOR';
        if (title) title.textContent = `OPERATOR ${operator}`;
        if (desc) desc.textContent = `Defeated by ${killer}`;

        // Paint the killing enemy into the portrait slot (same pattern as
        // char-select preview — swap ctx, suppress ambient particles, draw,
        // restore). Idempotent: re-injects a fresh canvas on every open.
        const portraitSlot = screen.querySelector('.go-portrait-slot');
        if (portraitSlot && this.enemy) {
            portraitSlot.innerHTML = `<canvas class="go-portrait" width="220" height="220" aria-hidden="true"></canvas>`;
            const canvas = portraitSlot.querySelector('canvas.go-portrait');
            if (canvas) this._paintEnemyPortrait(canvas, this.enemy);
        } else if (portraitSlot) {
            portraitSlot.innerHTML = '';
        }

        // Ensure a cards container exists above the run summary
        let cards = screen.querySelector('.death-cards');
        if (!cards) {
            cards = document.createElement('div');
            cards.className = 'death-cards';
            // Place right after desc line
            (desc && desc.after) ? desc.after(cards) : screen.appendChild(cards);
        }

        const entries = CombatLog._entries || [];
        // Biggest hit taken
        const dmgTaken = entries.filter(e => e.type === 'damage' && e.targetName === (this.player && this.player.name));
        const biggest = dmgTaken.reduce((m, e) => (!m || e.amount > m.amount) ? e : m, null);
        // Biggest hit dealt
        const dmgDealt = entries.filter(e => e.type === 'damage' && e.targetName !== (this.player && this.player.name));
        const bestDealt = dmgDealt.reduce((m, e) => (!m || e.amount > m.amount) ? e : m, null);
        // Note: how many turns you lasted
        const turnsCard = {
            title: 'TURNS SURVIVED',
            body: String(this.turnCount || 0)
        };
        const bestCard = bestDealt
            ? { title: 'BEST HIT', body: `${bestDealt.amount} on ${bestDealt.targetName}` }
            : { title: 'BEST HIT', body: '—' };
        const hurtCard = biggest
            ? { title: 'BIGGEST BLOW', body: `${biggest.amount} from ${biggest.sourceName || killer}` }
            : { title: 'BIGGEST BLOW', body: '—' };

        // Best-run comparison — pulls from localStorage
        let bestSector = parseInt(localStorage.getItem('mvm_best_sector') || '0', 10);
        let bestTurns  = parseInt(localStorage.getItem('mvm_best_turns') || '0', 10);
        const curSector = this.sector || 1;
        const curTurns  = this.turnCount || 0;
        const isNewBest = curSector > bestSector || (curSector === bestSector && curTurns > bestTurns);
        if (isNewBest) {
            bestSector = curSector;
            bestTurns  = curTurns;
            try {
                localStorage.setItem('mvm_best_sector', String(bestSector));
                localStorage.setItem('mvm_best_turns', String(bestTurns));
            } catch (e) {}
        }
        const bestCard2 = {
            title: isNewBest ? 'NEW BEST' : 'PERSONAL BEST',
            body: `Sector ${bestSector}, Turn ${bestTurns}`
        };

        cards.innerHTML = [turnsCard, bestCard, hurtCard, bestCard2].map(c => `
            <div class="death-card${c.title === 'NEW BEST' ? ' death-card-best' : ''}">
                <div class="death-card-title">${c.title}</div>
                <div class="death-card-body">${c.body}</div>
            </div>
        `).join('');

        // Autopsy lesson (Roadmap Part 31.3) — reads the run stats and
        // surfaces ONE actionable takeaway. Rotates through concrete
        // observations so different runs get different advice.
        try {
            let lesson = null;
            const manaSpent = (this.runStats && this.runStats.manaSpent) || 0;
            const turnsSurvived = this.turnCount || 0;
            const rerollsUsed = (this.runStats && this.runStats.rerollsUsed) || 0;
            const relicsHeld = (this.player && this.player.relics) ? this.player.relics.length : 0;
            const bossBlow = biggest && biggest.amount >= 30;
            const cameClose = this.player && this.player.maxHp && biggest
                ? (biggest.amount / this.player.maxHp) > 0.6 : false;
            if (cameClose) {
                lesson = 'One hit did 60%+ of your HP. Bank more shield or spread damage across turns.';
            } else if (bossBlow && turnsSurvived < 4) {
                lesson = 'Boss crushed you in under 4 turns. A Defend die turn-one buys you the setup window.';
            } else if (manaSpent === 0 && turnsSurvived >= 3) {
                lesson = 'You spent 0 Mana this run. Skill dice (Meteor, Earthquake) can finish fights you\'re losing.';
            } else if (rerollsUsed === 0 && turnsSurvived >= 3) {
                lesson = 'You never rerolled. A bad hand isn\'t fate — reroll to chase a combo.';
            } else if (relicsHeld === 0) {
                lesson = 'Zero relics at time of death. Events + shops pay out more than they cost most of the time.';
            } else if (turnsSurvived >= 12) {
                lesson = 'Long fight — next run, try picking up damage-dealers earlier to finish faster.';
            } else {
                lesson = 'Every death is a read. Note which class + relics didn\'t click and try a different build.';
            }
            let lessonEl = screen.querySelector('.death-lesson');
            if (!lessonEl) {
                lessonEl = document.createElement('div');
                lessonEl.className = 'death-lesson';
                cards.after(lessonEl);
            }
            lessonEl.innerHTML = `<span class="death-lesson-label">LESSON</span><span class="death-lesson-body">${lesson}</span>`;
        } catch (_) { /* autopsy is cosmetic, never throw into the game-over path */ }

        // Ensure buttons are in retry-first order.
        const retryBtn = document.getElementById('btn-retry-class');
        const menuBtn  = document.getElementById('btn-menu');
        if (retryBtn && menuBtn) {
            retryBtn.classList.add('death-cta-primary');
            menuBtn.classList.add('death-cta-secondary');
        }
    },

    renderRunSummary(screenId) {
        const screen = document.getElementById(screenId);
        if (!screen) return;
        let container = screen.querySelector('.run-summary');
        if (!container) {
            container = document.createElement('div');
            container.className = 'run-summary stagger-in';
            screen.appendChild(container);
        }
        const s = this.runStats || {};
        const synergies = (s.synergies && s.synergies.length > 0)
            ? s.synergies.map(n => `<span class="run-synergy">${n}</span>`).join('')
            : '<span class="run-synergy-none">None discovered</span>';
        container.innerHTML = `
            <div class="run-summary-title">RUN DIAGNOSTICS</div>
            <div class="run-summary-grid">
                <div class="rs-row"><span>Turns</span><b>${s.turns || 0}</b></div>
                <div class="rs-row"><span>Total Damage</span><b>${s.totalDamage || 0}</b></div>
                <div class="rs-row"><span>Highest Hit</span><b class="rs-highlight">${s.highestHit || 0}</b></div>
                <div class="rs-row"><span>Kills</span><b>${s.kills || 0}</b></div>
                <div class="rs-row"><span>Fragments</span><b class="rs-gold">${this.techFragments}</b></div>
                <div class="rs-row"><span>Sector Reached</span><b>${this.sector || 1}</b></div>
            </div>
            <div class="run-summary-synergies">
                <div class="rs-subtitle">Synergies Triggered</div>
                <div class="rs-synergy-list">${synergies}</div>
            </div>
        `;
    },

    _renderVictoryCard() {
        const s = this.runStats || {};
        const turns = s.turns || this.turnCount || 0;
        const dmg   = s.totalDamage || 0;
        const kills = s.kills || 0;
        const frags = this.techFragments || 0;
        const relics = (this.player && this.player.relics) ? this.player.relics.length : 0;
        const cls = (this.player && this.player.classId) ? this.player.classId.toUpperCase() : '???';

        // Grade: S if fast + efficient, down to C
        let grade = 'C';
        if (turns <= 30 && dmg >= 800) grade = 'S';
        else if (turns <= 45 && dmg >= 500) grade = 'A';
        else if (turns <= 60) grade = 'B';

        const gradeEl = document.getElementById('victory-grade');
        if (gradeEl) gradeEl.textContent = grade;

        const ring = document.getElementById('victory-grade-ring');
        if (ring) {
            const colors = { S: '#ffd700', A: '#00f3ff', B: '#00ff99', C: '#aaa' };
            ring.style.borderColor = colors[grade] || '#ffd700';
            ring.style.boxShadow = `0 0 30px ${colors[grade]}80, inset 0 0 20px ${colors[grade]}33`;
            if (gradeEl) { gradeEl.style.color = colors[grade]; gradeEl.style.textShadow = `0 0 20px ${colors[grade]}`; }
        }

        const container = document.getElementById('victory-stats');
        if (container) {
            container.innerHTML = [
                { label: 'CLASS',    value: cls },
                { label: 'TURNS',    value: turns },
                { label: 'DAMAGE',   value: dmg.toLocaleString() },
                { label: 'KILLS',    value: kills },
                { label: 'RELICS',   value: relics },
                { label: 'FRAGMENTS', value: frags }
            ].map(s => `
                <div class="victory-stat">
                    <div class="victory-stat-label">${s.label}</div>
                    <div class="victory-stat-value">${s.value}</div>
                </div>
            `).join('');
        }
    },

	restoreCombatButtons() {
        const btnReroll = document.getElementById('btn-reroll');
        const btnEnd = document.getElementById('btn-end-turn');

        const restore = (btn, callback) => {
            if (!btn) return;
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                btn.blur();
                TooltipMgr.hide();
                AudioMgr.playSound('click');
                callback(e);
            };
        };

        restore(btnReroll, () => this.rerollDice());
        restore(btnEnd, () => {
            this.dicePool.forEach(d => d.selected = false);
            this.renderDiceUI();
            this.endTurn();
        });
    },
    
    // Retry the run with the same class (skip character select)
    retrySameClass() {
        const cls = (this.player && this.player.classId)
            ? PLAYER_CLASSES.find(c => c.id === this.player.classId)
            : null;
        if (!cls) { this.changeState(STATE.MENU); return; }
        this.selectClass(cls);
    },

    quitRun() {
        AudioMgr.bossSilence = false;
        this.restoreCombatButtons();
        ClassAbility.endCombat();
        // Restore unseeded RNG in case this was an aborted daily
        if (Game._origRandom) Math.random = Game._origRandom;
        Dailies.markActive(false);
        this.changeState(STATE.MENU);
    },
    
    shake(amount) { this.shakeTime = amount; },
    updateHUD() {},

    updateMinionPositions() {
        const spacing = 280; // FIX: Increased spacing (was 180) to move minions further out
        if (this.player) {
            if (this.player.minions[0]) {
                this.player.minions[0].x = this.player.x - spacing;
                this.player.minions[0].y = this.player.y;
            }
            if (this.player.minions[1]) {
                this.player.minions[1].x = this.player.x + spacing;
                this.player.minions[1].y = this.player.y;
            }
            if (this.player.minions[2]) {
                this.player.minions[2].x = this.player.x;
                this.player.minions[2].y = this.player.y + spacing; 
            }
        }
        if (this.enemy) {
            // Slots 0/1 flank the enemy; extras (Multiplier clone, HIVE drones
            // phase 2, etc.) stack in a second row behind so they don't render
            // at stale spawn coordinates off-canvas.
            const ROW2_DX = Math.floor(spacing * 0.55);
            const ROW2_DY = -160;
            this.enemy.minions.forEach((m, i) => {
                if (!m) return;
                if (i === 0)      { m.x = this.enemy.x - spacing; m.y = this.enemy.y; }
                else if (i === 1) { m.x = this.enemy.x + spacing; m.y = this.enemy.y; }
                else {
                    const j = i - 2;
                    const side = (j % 2 === 0) ? -1 : 1;
                    const tier = Math.floor(j / 2);
                    m.x = this.enemy.x + side * ROW2_DX;
                    m.y = this.enemy.y + ROW2_DY - tier * 140;
                }
            });
        }
    },

    drawHealthBar(entity) {
        if (!entity) return;

        const ctx = this.ctx;
        
        // --- 1. BAR DIMENSIONS ---
        const width = (entity instanceof Minion) ? 96 : 192;
        const height = 30; 
        
        const x = entity.x - width/2;
        const y = entity.y - entity.radius - 50; 
        
        // Draw Bar Background
        ctx.fillStyle = COLORS.HP_BAR_BG;
        ctx.fillRect(x, y, width, height);
        
        // Calculate & Draw HP Fill
        const pct = Math.max(0, entity.currentHp / entity.maxHp);
        const isPlayerSide = (entity instanceof Player || (entity instanceof Minion && entity.isPlayerSide));

        ctx.fillStyle = isPlayerSide ? COLORS.NATURE_LIGHT : COLORS.MECH_LIGHT;

        // Low-HP warning pulse for player (Phase 4d)
        const isCritical = entity instanceof Player && pct < 0.15 && entity.currentHp > 0;
        if (isCritical) {
            const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200);
            ctx.fillStyle = `rgba(255, ${Math.floor(40 * pulse)}, ${Math.floor(85 * pulse)}, 1)`;
        }

        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = isCritical ? 24 : 10;
        ctx.fillRect(x, y, width * pct, height);
        ctx.shadowBlur = 0;
        
        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2; 
        ctx.strokeRect(x, y, width, height);

        // --- 2. HP TEXT ---
        ctx.font = 'bold 33px "Orbitron"'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; 
        
        const textX = x + width/2;
        const textY = y + height/2 + 2; 
        
        const hpString = Math.floor(entity.currentHp).toString();

        ctx.lineWidth = 4; 

        if (isPlayerSide) {
            ctx.strokeStyle = '#ffffff'; 
            ctx.strokeText(hpString, textX, textY);
            ctx.fillStyle = '#000000'; 
            ctx.fillText(hpString, textX, textY);
        } else {
            ctx.strokeStyle = '#000000';
            ctx.strokeText(hpString, textX, textY);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(hpString, textX, textY);
        }

        // --- SHIELD DISPLAY ---
        if (entity.shield > 0) {
            const sx = x + width + 15;
            const sy = y + height/2;
            // Canvas-native shield crest
            drawIntentIcon(ctx, 'shield', sx + 18, sy, 36, COLORS.SHIELD);

            ctx.font = 'bold 33px "Orbitron"';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(entity.shield, sx + 45, sy);
        }

        // --- MANA DISPLAY ---
         if (entity instanceof Player) {
            const mx = x - 20;
            const my = y + height/2;

            ctx.font = 'bold 33px "Orbitron"';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(entity.mana, mx, my);

            // Canvas-native mana diamond
            ctx.save();
            ctx.translate(mx - 68, my);
            ctx.fillStyle = COLORS.MANA;
            ctx.strokeStyle = COLORS.MANA;
            ctx.lineWidth = 2;
            ctx.shadowColor = COLORS.MANA;
            ctx.shadowBlur = 8;
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.moveTo(0, -14); ctx.lineTo(12, 0); ctx.lineTo(0, 14); ctx.lineTo(-12, 0);
            ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -8); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0);
            ctx.closePath(); ctx.stroke();
            ctx.restore();
        }

        // --- STATUS BAR (UNIFIED: effects + derived flags + affixes) ---
        // Builds a virtual effects list per frame that includes the entity's
        // real .effects array PLUS synthesized entries for persistent states
        // that otherwise only flash as floating text (enemy elite affixes,
        // Reckless Charge / Overclock, armor plating, Sentinel thorns, etc.).
        // The downstream renderer doesn't care where the entry came from —
        // all it needs is { id, val, duration, _permanent, _hideCount }.
        const statusList = this._collectStatusDisplay(entity);
        if (statusList.length > 0) {
            const iconWidth = 30;
            const barHeight = 28;
            const padding = 0;

            const totalBarWidth = (statusList.length * iconWidth) + (padding * 2);
            const barX = entity.x - (totalBarWidth / 2);
            const barY = y + height + 6;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(barX, barY, totalBarWidth, barHeight);

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '20px Arial';
            ctx.fillStyle = '#fff';

            // Per-effect colour tints. Entries fall back to white if not in
            // the table so a new effect never renders as an invisible icon.
            const effectColor = {
                // Existing status effects
                weak:        '#d97bff',
                frail:       '#ff8800',
                vulnerable:  '#ff3355',
                overcharge:  '#ffaa33',
                constrict:   '#ff0055',
                voodoo:      '#bc13fe',
                bleed:       '#ff3333',
                poison:      '#88ff00',
                // Enemy elite affixes (persistent)
                brittle:     '#ff6600',
                shielded:    '#00f3ff',
                second_wind: '#00ff99',
                jammer:      '#d97bff',
                reflector:   '#ff0055',
                phase:       '#bc13fe',
                multiplier:  '#ffd76a',
                anchor:      '#88ff00',
                vampiric:    '#ff3333',
                // Player derived states
                charged:     '#ffd76a',   // nextAttackMult > 1 (Reckless Charge etc.)
                armor:       '#ffaa00',   // armorPlating
                overclock:   '#ff8800',   // Annihilator Overclock vent
                sig_thorns:  '#ffffff',   // Sentinel signature thorns
                firewall:    '#00f3ff',   // Firewall relic armed this turn
                blood_tier:  '#ff0033',   // Bloodstalker kill tier
                // Incoming damage multipliers (Reckless Charge self-debuff etc.)
                exposed:     '#ff3355'
            };

            statusList.forEach((eff, i) => {
                const ix = barX + padding + (iconWidth / 2) + (i * iconWidth);
                const iy = barY + (barHeight / 2);
                drawEffectIcon(ctx, eff.id, ix, iy, 22, effectColor[eff.id] || '#ffffff');

                // Count badge: show the most meaningful number.
                //   stacked DoT (bleed/poison) → stack count
                //   permanent affix            → hidden (infinite)
                //   duration >= 2              → turns remaining
                //   val >= 2                   → magnitude (for +DMG x2 etc.)
                let count = 0;
                if (eff._hideCount || eff._permanent) {
                    count = 0;
                } else if ((eff.id === 'bleed' || eff.id === 'poison') && (eff.stacks || 1) > 1) {
                    count = eff.stacks;
                } else {
                    count = Math.max(eff.duration || 0, (eff.val && eff.val > 1) ? eff.val : 0);
                }
                if (count >= 2) {
                    ctx.save();
                    ctx.font = 'bold 11px "Orbitron"';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const bx = ix + 9;
                    const by = iy + 9;
                    ctx.fillStyle = '#000';
                    ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = '#fff';
                    ctx.fillText(count, bx, by + 0.5);
                    ctx.restore();
                }
            });
        }
    },

    // Collect the full status display list for an entity. Combines real
    // effects (from entity.effects) with synthesized entries derived from
    // persistent state flags that wouldn't otherwise render as icons.
    // Keeps the rendering path blind to the source so future additions
    // (new affixes, new class resources) just need one entry here.
    _collectStatusDisplay(entity) {
        if (!entity) return [];
        const out = [];
        // 1. Real on-duration effects (the existing system).
        if (Array.isArray(entity.effects)) {
            for (const eff of entity.effects) {
                if (eff) out.push(eff);
            }
        }
        // 2. Enemy-side elite affixes (permanent for the fight).
        if (entity instanceof Enemy && Array.isArray(entity.affixes)) {
            for (const affix of entity.affixes) {
                const id = String(affix).toLowerCase().replace(/\s+/g, '_');
                out.push({ id, val: 0, duration: 0, _permanent: true, _hideCount: true });
            }
        }
        // 3. Enemy-side persistent state flags that players need to read.
        if (entity instanceof Enemy) {
            if (entity.invincibleTurns > 0) {
                out.push({ id: 'shielded', val: 0, duration: entity.invincibleTurns });
            }
            if (entity.armorPlating > 0) {
                out.push({ id: 'armor', val: entity.armorPlating, duration: 0, _hideCount: false });
            }
        }
        // 4. Player-side derived states — surface every "invisibly-ticking"
        //    buff/debuff so the player knows what's live. Entries fold into
        //    the same pill bar as real effects so the visual language stays
        //    consistent.
        if (entity instanceof Player) {
            if (entity.nextAttackMult && entity.nextAttackMult > 1) {
                out.push({ id: 'charged', val: entity.nextAttackMult, duration: 0 });
            }
            if (entity.incomingDamageMult && entity.incomingDamageMult > 1) {
                out.push({ id: 'exposed', val: entity.incomingDamageMult, duration: 0 });
            }
            if (entity.armorPlating > 0) {
                out.push({ id: 'armor', val: entity.armorPlating, duration: 0 });
            }
            if (entity.bloodTier && entity.bloodTier > 0) {
                out.push({ id: 'blood_tier', val: entity.bloodTier, duration: 0 });
            }
            if (this._sigThornsActive) {
                out.push({ id: 'sig_thorns', val: 0, duration: 0, _permanent: true, _hideCount: true });
            }
            if (entity.hasRelic && entity.hasRelic('firewall') && !entity.firewallTriggered) {
                out.push({ id: 'firewall', val: 0, duration: 0, _permanent: true, _hideCount: true });
            }
            // Annihilator Overclock — ClassAbility tracks the live multiplier
            // that calculateCardDamage consumes next attack. Badge it so the
            // vent state is visible without opening the reactor widget.
            const overclockMult = (typeof ClassAbility !== 'undefined' && ClassAbility.peekDamageMultiplier)
                ? ClassAbility.peekDamageMultiplier('ATTACK')
                : 1;
            if (overclockMult && overclockMult > 1) {
                out.push({ id: 'overclock', val: overclockMult, duration: 0 });
            }
        }
        return out;
    },

    // --- NEW: Background Initialization ---
    initBackground() {
        this.bgState = {
            sector: this.sector,
            skyline: [],
            particles: [],
            drones: [],
            nextDroneTime: 5 // seconds until first drone
        };

        const type = SECTOR_CONFIG[this.sector] ? SECTOR_CONFIG[this.sector].type : 'city';
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;

        // 1. Generate Skyline (Parallax Objects)
        // We create 2 layers: Far (slow) and Mid (medium)
        const count = 8;
        for(let i=0; i<count; i++) {
            this.bgState.skyline.push({
                x: Math.random() * w,
                y: h * 0.45, // Horizon line
                w: 60 + Math.random() * 100,
                h: 100 + Math.random() * 300,
                speed: 5 + Math.random() * 5, // Pixels per second
                layer: 0, // Far
                type: type
            });
        }
        for(let i=0; i<5; i++) {
            this.bgState.skyline.push({
                x: Math.random() * w,
                y: h * 0.45,
                w: 80 + Math.random() * 120,
                h: 50 + Math.random() * 150,
                speed: 15 + Math.random() * 10,
                layer: 1, // Mid
                type: type
            });
        }

        // 2. Pre-warm Particles
        for(let i=0; i<50; i++) {
            this.spawnBgParticle(type, true);
        }
    },

    spawnBgParticle(type, randomY = false) {
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;
        const horizon = h * 0.45;
        
        let p = {
            x: Math.random() * w,
            y: randomY ? Math.random() * h : (type === 'fire' ? h : -10),
            vx: (Math.random() - 0.5) * 20,
            vy: 0,
            life: 5 + Math.random() * 5,
            size: Math.random() * 3 + 1,
            type: type,
            char: Math.random() > 0.5 ? "1" : "0" // For data rain
        };

        if (type === 'city') {
            p.vy = 20 + Math.random() * 30; // Dust falling
            p.color = 'rgba(0, 243, 255, 0.5)';
        } else if (type === 'ice') {
            p.vy = 50 + Math.random() * 50; // Fast data snow
            p.color = 'rgba(255, 255, 255, 0.8)';
        } else if (type === 'fire') {
            p.vy = -(30 + Math.random() * 40); // Rising ash
            p.color = 'rgba(255, 100, 0, 0.6)';
            p.y = randomY ? Math.random() * h : h;
        } else if (type === 'tech') {
            p.vy = -(10 + Math.random() * 20); // Floating bits
            p.color = 'rgba(188, 19, 254, 0.5)';
            p.y = randomY ? Math.random() * h : h;
        } else if (type === 'source') {
            p.vx = 0; p.vy = 0; // Glitch static
            p.life = 0.2; // Flash
            p.w = Math.random() * 50;
            p.h = Math.random() * 5;
            p.color = Math.random() > 0.5 ? '#f00' : '#fff';
        }

        this.bgState.particles.push(p);
    },

    // Epic, theme-specific backdrops that only render during boss fights.
    // Replaces the default sector celestial layer. Kept mobile-friendly (no huge
    // shadow blurs, bounded loop counts) so the sector 2 perf work still holds.
    drawBossBackdrop(ctx, boss, w, h, time) {
        const horizon = h * 0.45;
        const sector = this.sector;

        if (sector === 1) {
            // --- THE PANOPTICON ARENA ---
            // Concept: the boss is the central watcher, so the backdrop is a
            // Bentham panopticon. Twin prison towers flank the stage, their cell
            // windows flicker with individual prisoners, searchlights sweep,
            // and a clean dark spotlight keeps the boss silhouette readable.
            ctx.save();
            const cx = w * 0.5;

            // Deep night-blue overwash — quiets the underlying sector sky.
            ctx.fillStyle = 'rgba(2, 12, 28, 0.7)';
            ctx.fillRect(0, 0, w, horizon);

            // Starfield of tiny surveillance "eyes" — distant, blinking.
            for (let i = 0; i < 60; i++) {
                const sx = (i * 137 % w);
                const sy = ((i * 83 + 60) % horizon);
                const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * 1.5 + i));
                ctx.fillStyle = `rgba(140, 220, 255, ${tw * 0.6})`;
                ctx.fillRect(sx, sy, 1.8, 1.8);
            }

            // Twin guard towers — tall silhouettes at L and R. Parameterized so
            // we can draw the same tower mirrored.
            const drawTower = (baseX, flip) => {
                const topY = horizon * 0.08;
                const baseY = horizon;
                const topW = 80;
                const baseW = 150;
                ctx.save();
                if (flip) { ctx.translate(baseX * 2, 0); ctx.scale(-1, 1); }
                // Main tower silhouette (tapered trapezoid)
                ctx.fillStyle = '#050a16';
                ctx.strokeStyle = 'rgba(0, 220, 255, 0.35)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(baseX - baseW * 0.5, baseY);
                ctx.lineTo(baseX - topW * 0.5, topY + 60);
                ctx.lineTo(baseX - topW * 0.7, topY + 30);
                ctx.lineTo(baseX - topW * 0.3, topY);
                ctx.lineTo(baseX + topW * 0.3, topY);
                ctx.lineTo(baseX + topW * 0.7, topY + 30);
                ctx.lineTo(baseX + topW * 0.5, topY + 60);
                ctx.lineTo(baseX + baseW * 0.5, baseY);
                ctx.closePath(); ctx.fill(); ctx.stroke();

                // Cell windows — grid of small glowing rects, each flickers on its own phase.
                const rows = 16;
                const cols = 5;
                for (let r = 0; r < rows; r++) {
                    // Windows narrow toward the top (tapered building)
                    const rowT = r / rows;
                    const rowY = topY + 80 + (baseY - topY - 80) * rowT;
                    const rowW = topW + (baseW - topW) * rowT;
                    for (let c = 0; c < cols; c++) {
                        const phase = (r * 7 + c * 13);
                        const seed = Math.sin(time * 1.6 + phase);
                        if (seed < -0.6) continue; // some cells dim/off
                        const fx = baseX - rowW * 0.35 + c * (rowW * 0.7 / (cols - 1));
                        const lit = 0.35 + Math.abs(seed) * 0.55;
                        ctx.fillStyle = `rgba(0, 230, 255, ${lit})`;
                        ctx.fillRect(fx - 4, rowY - 6, 8, 10);
                        // Prisoner silhouette (tiny bar across window)
                        if (seed > 0.4) {
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                            ctx.fillRect(fx - 3, rowY - 2, 6, 2);
                        }
                    }
                }

                // Antenna / spotlight mount on top
                ctx.strokeStyle = 'rgba(0, 220, 255, 0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(baseX, topY);
                ctx.lineTo(baseX, topY - 40);
                ctx.stroke();
                // Blinking beacon
                const blink = Math.sin(time * 3) > 0;
                ctx.fillStyle = blink ? '#ff3344' : 'rgba(80, 0, 0, 0.6)';
                ctx.shadowColor = '#ff3344';
                ctx.shadowBlur = blink ? 14 : 0;
                ctx.beginPath(); ctx.arc(baseX, topY - 40, 4, 0, Math.PI * 2); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.restore();
            };
            drawTower(w * 0.12, false);
            drawTower(w * 0.88, true);

            // Sweeping searchlights — two beams originating from each tower top,
            // counter-rotating so the arena is constantly panned over.
            ctx.globalCompositeOperation = 'lighter';
            const beams = [
                { ox: w * 0.12, oy: horizon * 0.08, phase: 0, dir: 1 },
                { ox: w * 0.88, oy: horizon * 0.08, phase: Math.PI, dir: -1 }
            ];
            for (const b of beams) {
                const sweep = Math.sin(time * 0.5 + b.phase) * 0.55 * b.dir;
                const baseAng = Math.PI / 2 + sweep;
                const len = 1100;
                ctx.save();
                ctx.translate(b.ox, b.oy);
                ctx.rotate(baseAng);
                const beamGrad = ctx.createLinearGradient(0, 0, 0, len);
                beamGrad.addColorStop(0, 'rgba(180, 240, 255, 0.45)');
                beamGrad.addColorStop(1, 'rgba(0, 120, 200, 0)');
                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-110, len);
                ctx.lineTo(110, len);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
            ctx.globalCompositeOperation = 'source-over';

            // Distant cell-block wall stretching across the horizon behind the boss.
            // Very low contrast so it reads as "prison block" without competing.
            const wallY = horizon - 110;
            ctx.fillStyle = 'rgba(4, 10, 22, 0.92)';
            ctx.fillRect(0, wallY, w, horizon - wallY);
            for (let i = 0; i < 22; i++) {
                const wx = i * (w / 22);
                const lit = Math.sin(time * 1.2 + i * 0.8) > 0.2 ? 0.55 : 0.15;
                ctx.fillStyle = `rgba(0, 220, 255, ${lit * 0.35})`;
                ctx.fillRect(wx + 8, wallY + 30, 20, 6);
                ctx.fillRect(wx + 8, wallY + 60, 20, 6);
            }

            // Scanline data streams falling from above — info-feeds into the tower.
            for (let i = 0; i < 20; i++) {
                const dx = (i * 53) % w;
                const dy = ((i * 97 + time * 140) % horizon);
                const ht = 28 + (i % 3) * 10;
                ctx.fillStyle = `rgba(0, 230, 255, ${0.18 + (i % 2) * 0.1})`;
                ctx.fillRect(dx, dy, 1.5, ht);
            }

            // Patrol drones in the sky — two cyan dots with blinking red underlights.
            for (let i = 0; i < 3; i++) {
                const orbit = time * 0.25 + i * 2.1;
                const dx = w * 0.5 + Math.cos(orbit) * (w * 0.42);
                const dy = horizon * 0.25 + Math.sin(orbit * 1.4) * 20;
                ctx.fillStyle = '#0a0a14';
                ctx.fillRect(dx - 7, dy - 2, 14, 4);
                ctx.fillStyle = '#00e6ff';
                ctx.shadowColor = '#00e6ff'; ctx.shadowBlur = 8;
                ctx.fillRect(dx - 9, dy - 1, 2, 2);
                ctx.fillRect(dx + 7, dy - 1, 2, 2);
                ctx.shadowBlur = 0;
                if (Math.sin(time * 5 + i) > 0) {
                    ctx.fillStyle = 'rgba(255, 50, 60, 0.9)';
                    ctx.fillRect(dx - 1, dy + 3, 2, 2);
                }
            }

            // Central spotlight — dark vignette around the boss so its silhouette
            // pops. This is the KEY fix: nothing bright directly behind the boss.
            const spotX = cx, spotY = horizon * 0.55;
            const spotR = 340;
            const spot = ctx.createRadialGradient(spotX, spotY, 40, spotX, spotY, spotR);
            spot.addColorStop(0, 'rgba(0, 0, 0, 0)');
            spot.addColorStop(0.6, 'rgba(0, 0, 0, 0.35)');
            spot.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
            ctx.fillStyle = spot;
            ctx.fillRect(0, 0, w, horizon);

            // Soft cyan rim around the spotlight — "you are being watched".
            ctx.strokeStyle = 'rgba(0, 220, 255, 0.22)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(spotX, spotY, spotR * 0.85, 0, Math.PI * 2); ctx.stroke();

            // HUD targeting brackets — corner frames that "lock on" to the arena.
            ctx.strokeStyle = 'rgba(0, 230, 255, 0.55)';
            ctx.lineWidth = 2;
            const bsz = 40;
            const pad = 20;
            const corners = [
                [pad, pad, 1, 1], [w - pad, pad, -1, 1],
                [pad, horizon - pad, 1, -1], [w - pad, horizon - pad, -1, -1]
            ];
            for (const [px, py, dx, dy] of corners) {
                ctx.beginPath();
                ctx.moveTo(px, py + dy * bsz);
                ctx.lineTo(px, py);
                ctx.lineTo(px + dx * bsz, py);
                ctx.stroke();
            }
            // Tracking label
            ctx.fillStyle = 'rgba(0, 230, 255, 0.7)';
            ctx.font = "bold 14px 'Orbitron', monospace";
            ctx.fillText('// SUBJECT LOCKED', pad + 8, pad + 24);
            ctx.font = "10px 'Orbitron', monospace";
            ctx.fillStyle = 'rgba(0, 230, 255, 0.45)';
            ctx.fillText(`SURV.TICK ${Math.floor(time * 10) % 10000}`, w - pad - 140, pad + 22);

            ctx.restore();
            return;
        }

        if (sector === 2) {
            // --- NULL_POINTER: THE CONSUMING VOID ---
            ctx.save();
            // Deep void-purple wash
            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            sky.addColorStop(0, 'rgba(40, 0, 60, 0.55)');
            sky.addColorStop(1, 'rgba(10, 0, 30, 0.2)');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);

            // Massive vortex behind boss — swirling layered arms
            const vx = w * 0.5, vy = horizon * 0.55;
            const vR = 380;
            // Dark core
            const core = ctx.createRadialGradient(vx, vy, 20, vx, vy, vR);
            core.addColorStop(0, '#000');
            core.addColorStop(0.5, 'rgba(30, 0, 50, 0.85)');
            core.addColorStop(1, 'rgba(255, 0, 255, 0)');
            ctx.fillStyle = core;
            ctx.beginPath(); ctx.arc(vx, vy, vR, 0, Math.PI * 2); ctx.fill();
            // Spiral arms (magenta/cyan)
            ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 16;
            for (let j = 0; j < 5; j++) {
                ctx.strokeStyle = j % 2 ? 'rgba(0, 200, 255, 0.55)' : 'rgba(255, 0, 255, 0.55)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                const baseA = time * 0.5 + j * (Math.PI * 2 / 5);
                for (let k = 0; k < 36; k++) {
                    const a = baseA + k * 0.18;
                    const r = k * 11;
                    if (r > vR) break;
                    const x = vx + Math.cos(a) * r;
                    const y = vy + Math.sin(a) * r;
                    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Reality cracks tearing across the sky — bright magenta seams
            ctx.strokeStyle = 'rgba(255, 80, 255, 0.85)';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 14;
            const cracks = [
                [0.02, 0.1, 0.25, 0.05, 0.4, 0.18, 0.55, 0.08],
                [0.6, 0.3, 0.75, 0.22, 0.88, 0.35, 0.98, 0.28],
                [0.05, 0.4, 0.2, 0.35, 0.35, 0.42]
            ];
            for (const crack of cracks) {
                ctx.beginPath();
                for (let i = 0; i < crack.length; i += 2) {
                    const px = w * crack[i];
                    const py = horizon * crack[i + 1] + Math.sin(time * 3 + i) * 3;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Magenta aurora bands drifting
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) {
                const ay = horizon * (0.18 + i * 0.1);
                const aGrad = ctx.createLinearGradient(0, ay - 40, 0, ay + 40);
                aGrad.addColorStop(0, 'rgba(255, 0, 255, 0)');
                aGrad.addColorStop(0.5, `rgba(255, 0, 255, ${0.18 - i * 0.04})`);
                aGrad.addColorStop(1, 'rgba(255, 0, 255, 0)');
                ctx.fillStyle = aGrad;
                ctx.beginPath();
                ctx.moveTo(0, ay);
                for (let x = 0; x <= w; x += 60) {
                    ctx.lineTo(x, ay + Math.sin(x * 0.008 + time * 0.6 + i) * 22);
                }
                ctx.lineTo(w, ay + 40); ctx.lineTo(0, ay + 40);
                ctx.closePath(); ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
            return;
        }

        if (sector === 3) {
            // --- THE COMPILER: THE FORGE ---
            ctx.save();
            // Hot ember-red sky wash
            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            sky.addColorStop(0, 'rgba(80, 10, 0, 0.55)');
            sky.addColorStop(1, 'rgba(255, 80, 0, 0.35)');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);

            // Giant forge gate silhouette at horizon — arched foundry
            ctx.fillStyle = '#0b0500';
            ctx.beginPath();
            ctx.moveTo(w * 0.1, horizon);
            ctx.lineTo(w * 0.1, horizon - 360);
            ctx.quadraticCurveTo(w * 0.5, horizon - 600, w * 0.9, horizon - 360);
            ctx.lineTo(w * 0.9, horizon);
            ctx.closePath(); ctx.fill();
            // Inner molten glow
            const mouth = ctx.createRadialGradient(w * 0.5, horizon - 180, 40, w * 0.5, horizon - 180, 360);
            mouth.addColorStop(0, '#fff0aa');
            mouth.addColorStop(0.4, '#ff6600');
            mouth.addColorStop(1, 'rgba(80, 0, 0, 0)');
            ctx.fillStyle = mouth;
            ctx.beginPath();
            ctx.moveTo(w * 0.18, horizon);
            ctx.lineTo(w * 0.18, horizon - 320);
            ctx.quadraticCurveTo(w * 0.5, horizon - 520, w * 0.82, horizon - 320);
            ctx.lineTo(w * 0.82, horizon);
            ctx.closePath(); ctx.fill();

            // Two piston hammers rising and falling beside the gate
            const pistonY = (phase) => horizon - 260 + Math.sin(time * 3 + phase) * 60;
            for (const [px, phase] of [[w * 0.22, 0], [w * 0.78, Math.PI]]) {
                ctx.fillStyle = '#1a0500';
                ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 3;
                ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.rect(px - 22, 0, 44, pistonY(phase));
                ctx.fill(); ctx.stroke();
                // Hammer head
                ctx.beginPath();
                ctx.rect(px - 50, pistonY(phase), 100, 60);
                ctx.fill(); ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Molten seams on the ground
            ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 2;
            ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10;
            for (let i = 0; i < 4; i++) {
                const sy = horizon + 20 + i * 40;
                ctx.beginPath();
                ctx.moveTo(0, sy);
                for (let x = 0; x < w; x += 40) {
                    ctx.lineTo(x, sy + Math.sin(x * 0.03 + time * 2 + i) * 4);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Ember rain from above
            ctx.fillStyle = '#ffcc00';
            for (let i = 0; i < 30; i++) {
                const ex = (i * 73 + time * 90) % w;
                const ey = (i * 241 + time * 160) % horizon;
                ctx.globalAlpha = 0.6 + (i % 3) * 0.15;
                ctx.fillRect(ex, ey, 2, 6);
            }
            ctx.globalAlpha = 1;
            ctx.restore();
            return;
        }

        if (sector === 4) {
            // --- HIVE PROTOCOL: THE HIVE CATHEDRAL ---
            ctx.save();
            // Acid-green sky wash
            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            sky.addColorStop(0, 'rgba(10, 40, 10, 0.55)');
            sky.addColorStop(1, 'rgba(0, 80, 20, 0.2)');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);

            // Monolithic hive tower at the horizon — stacked hexagonal cells
            const towerX = w * 0.5;
            const towerBase = horizon;
            const towerTop = horizon * 0.1;
            const towerWidth = 320;
            ctx.fillStyle = '#061a06';
            ctx.strokeStyle = '#7fff00';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#32cd32'; ctx.shadowBlur = 12;
            // Body
            ctx.beginPath();
            ctx.moveTo(towerX - towerWidth * 0.5, towerBase);
            ctx.lineTo(towerX - towerWidth * 0.4, towerTop + 20);
            ctx.lineTo(towerX, towerTop);
            ctx.lineTo(towerX + towerWidth * 0.4, towerTop + 20);
            ctx.lineTo(towerX + towerWidth * 0.5, towerBase);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            // Honeycomb cells on the tower (stacked hexagons glowing)
            ctx.shadowBlur = 0;
            const cellR = 22;
            for (let row = 0; row < 14; row++) {
                const y = towerBase - 60 - row * (cellR * 1.7);
                if (y < towerTop + 40) break;
                const rowWidth = (towerWidth * (1 - row * 0.04)) * 0.5;
                const cells = Math.max(3, Math.floor(rowWidth / (cellR * 1.8)) * 2);
                for (let c = 0; c < cells; c++) {
                    const cx = towerX - rowWidth + (c + 0.5) * (rowWidth * 2 / cells);
                    const pulse = 0.35 + 0.5 * Math.abs(Math.sin(time * 2 + row * 0.3 + c * 0.7));
                    ctx.fillStyle = `rgba(127, 255, 0, ${pulse})`;
                    ctx.beginPath();
                    for (let k = 0; k < 6; k++) {
                        const a = (Math.PI / 3) * k + Math.PI / 6;
                        const px = cx + Math.cos(a) * cellR * 0.9;
                        const py = y + Math.sin(a) * cellR * 0.9;
                        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                    }
                    ctx.closePath(); ctx.fill();
                }
            }

            // Neural network web across the sky
            ctx.strokeStyle = 'rgba(127, 255, 0, 0.35)';
            ctx.lineWidth = 1;
            const nodes = [];
            for (let i = 0; i < 18; i++) {
                nodes.push([
                    (i * 173 % w),
                    (i * 97 % (horizon * 0.7))
                ]);
            }
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[i][0] - nodes[j][0];
                    const dy = nodes[i][1] - nodes[j][1];
                    if (dx * dx + dy * dy < 220 * 220) {
                        ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[j][0], nodes[j][1]); ctx.stroke();
                    }
                }
            }
            ctx.fillStyle = '#7fff00';
            ctx.shadowColor = '#32cd32'; ctx.shadowBlur = 8;
            for (const [nx, ny] of nodes) {
                const pulse = 1 + Math.sin(time * 3 + nx) * 0.4;
                ctx.beginPath(); ctx.arc(nx, ny, 3 * pulse, 0, Math.PI * 2); ctx.fill();
            }
            ctx.shadowBlur = 0;

            // Swarm of tiny drones buzzing in formations
            ctx.fillStyle = '#7fff00';
            for (let i = 0; i < 24; i++) {
                const orbit = time * (0.3 + (i % 4) * 0.1) + i;
                const dx = towerX + Math.cos(orbit) * (180 + (i % 5) * 30);
                const dy = horizon * 0.35 + Math.sin(orbit * 1.3) * 120 + (i % 3) * 20;
                ctx.fillRect(dx - 2, dy - 1, 4, 2);
            }
            ctx.restore();
            return;
        }

        if (sector === 5) {
            // --- TESSERACT PRIME: GEOMETRIC IMPOSSIBILITY ---
            ctx.save();
            // Prismatic white-pink wash
            const sky = ctx.createLinearGradient(0, 0, 0, horizon);
            sky.addColorStop(0, 'rgba(60, 0, 30, 0.5)');
            sky.addColorStop(1, 'rgba(130, 0, 50, 0.25)');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon);

            // Prismatic rays fanning from center
            const cx = w * 0.5, cy = horizon * 0.55;
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 18; i++) {
                const a = time * 0.15 + i * (Math.PI * 2 / 18);
                const hue = (i * 20 + time * 30) % 360;
                ctx.strokeStyle = `hsla(${hue}, 90%, 65%, 0.18)`;
                ctx.lineWidth = 40;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * 1400, cy + Math.sin(a) * 1400);
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';

            // Rotating tesseract (outer cube + inner cube connected) wireframe
            const tR = 230;
            const rotOuter = time * 0.3;
            const rotInner = time * 0.6;
            const cubeVerts = (rot, size) => {
                const verts = [];
                const corners = [
                    [-1, -1], [1, -1], [1, 1], [-1, 1]
                ];
                for (const [ux, uy] of corners) {
                    const rx = ux * Math.cos(rot) - uy * Math.sin(rot);
                    const ry = ux * Math.sin(rot) + uy * Math.cos(rot);
                    verts.push([cx + rx * size, cy + ry * size]);
                }
                return verts;
            };
            const outer = cubeVerts(rotOuter, tR);
            const inner = cubeVerts(rotInner, tR * 0.55);
            const drawPoly = (pts, color, width) => {
                ctx.strokeStyle = color; ctx.lineWidth = width;
                ctx.beginPath();
                for (let i = 0; i < pts.length; i++) {
                    const [x, y] = pts[i];
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath(); ctx.stroke();
            };
            ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14;
            drawPoly(outer, 'rgba(255, 255, 255, 0.85)', 3);
            drawPoly(inner, 'rgba(255, 100, 180, 0.9)', 2.5);
            // Connect outer to inner (tesseract edges)
            ctx.strokeStyle = 'rgba(255, 215, 100, 0.55)'; ctx.lineWidth = 1.5;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath(); ctx.moveTo(outer[i][0], outer[i][1]); ctx.lineTo(inner[i][0], inner[i][1]); ctx.stroke();
            }
            ctx.shadowBlur = 0;

            // Glitch scan-line tears — horizontal bands offset
            for (let i = 0; i < 4; i++) {
                const ty = ((time * 90 + i * 220) % horizon);
                const off = Math.sin(time * 5 + i) * 20;
                ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + (i % 2) * 0.04})`;
                ctx.fillRect(off, ty, w - off, 6);
                ctx.fillStyle = `rgba(255, 50, 120, 0.12)`;
                ctx.fillRect(-off, ty + 3, w, 2);
            }

            // Ghosted overlay echoes of the tesseract (chromatic aberration copies)
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = 'rgba(0, 220, 255, 0.6)'; ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < outer.length; i++) {
                const [x, y] = outer[i];
                if (i === 0) ctx.moveTo(x + 10, y); else ctx.lineTo(x + 10, y);
            }
            ctx.closePath(); ctx.stroke();
            ctx.strokeStyle = 'rgba(255, 0, 120, 0.6)';
            ctx.beginPath();
            for (let i = 0; i < outer.length; i++) {
                const [x, y] = outer[i];
                if (i === 0) ctx.moveTo(x - 10, y); else ctx.lineTo(x - 10, y);
            }
            ctx.closePath(); ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.restore();
            return;
        }

        // Fallback — use the regular celestial if sector is unrecognized.
        const conf = SECTOR_CONFIG[sector] || SECTOR_CONFIG[1];
        this.drawSectorCelestial(ctx, conf, conf.type, w, h, time);
    },

    drawAtmosphere(ctx, conf, type, w, h, time, dt) {
        // Initialize per-sector atmosphere state on demand.
        if (!this.atmState || this.atmState.sector !== this.sector) {
            this.atmState = {
                sector: this.sector,
                billboards: [],
                rings: [],
                cracks: [],
                lastLightning: 0,
                lastTremor: 0,
                nextAurora: 0
            };
            // Seed depth-layer objects based on sector
            if (type === 'city') {
                for (let k = 0; k < 4; k++) {
                    this.atmState.billboards.push({
                        x: Math.random() * w,
                        y: h * (0.18 + Math.random() * 0.2),
                        w: 80 + Math.random() * 60,
                        h: 20 + Math.random() * 16,
                        flickerPhase: Math.random() * Math.PI * 2,
                        color: ['#ff0055', '#00f3ff', '#bc13fe'][k % 3]
                    });
                }
            } else if (type === 'tech') {
                for (let k = 0; k < 5; k++) {
                    this.atmState.rings.push({
                        x: Math.random() * w,
                        y: h * (0.15 + Math.random() * 0.25),
                        r: 18 + Math.random() * 28,
                        speed: 0.2 + Math.random() * 0.5,
                        angle: Math.random() * Math.PI * 2
                    });
                }
            } else if (type === 'source') {
                for (let k = 0; k < 6; k++) {
                    this.atmState.cracks.push({
                        x: Math.random() * w,
                        y: Math.random() * h * 0.8,
                        len: 40 + Math.random() * 100,
                        angle: Math.random() * Math.PI,
                        flickerPhase: Math.random() * Math.PI * 2
                    });
                }
            }
        }
        const atm = this.atmState;
        const horizon = h * 0.45;

        if (type === 'city') {
            // Distant glow haze above horizon
            const hazeGrad = ctx.createLinearGradient(0, horizon - 120, 0, horizon);
            hazeGrad.addColorStop(0, 'transparent');
            hazeGrad.addColorStop(1, 'rgba(188,19,254,0.15)');
            ctx.fillStyle = hazeGrad;
            ctx.fillRect(0, horizon - 120, w, 120);
            // Holographic billboards, flickering
            atm.billboards.forEach(b => {
                const flick = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 3 + b.flickerPhase));
                ctx.save();
                ctx.globalAlpha = flick * 0.55;
                ctx.fillStyle = b.color;
                ctx.shadowColor = b.color;
                ctx.shadowBlur = 20;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.globalAlpha = flick;
                ctx.fillStyle = '#fff';
                ctx.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.3, b.w * 0.8, b.h * 0.1);
                ctx.fillRect(b.x + b.w * 0.1, b.y + b.h * 0.5, b.w * 0.5, b.h * 0.1);
                ctx.restore();
            });
            // Slow traffic light streaks along horizon
            const streakY = horizon - 6;
            for (let k = 0; k < 3; k++) {
                const sx = ((time * 40 * (k + 1)) + k * 200) % (w + 120) - 60;
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = k % 2 === 0 ? '#ff8844' : '#44aaff';
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 12;
                ctx.fillRect(sx, streakY - k * 3, 40, 2);
                ctx.restore();
            }
        } else if (type === 'ice') {
            // Aurora ribbons across the top third
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 3; k++) {
                const auroraGrad = ctx.createLinearGradient(0, 0, 0, h * 0.4);
                const colors = [['rgba(0,243,255,0.12)', 'rgba(0,255,153,0.08)'],
                                ['rgba(188,19,254,0.1)', 'rgba(255,0,85,0.06)'],
                                ['rgba(0,255,153,0.1)', 'rgba(0,243,255,0.05)']][k];
                auroraGrad.addColorStop(0, 'transparent');
                auroraGrad.addColorStop(0.4, colors[0]);
                auroraGrad.addColorStop(0.8, colors[1]);
                auroraGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = auroraGrad;
                ctx.beginPath();
                ctx.moveTo(0, h * 0.1);
                for (let x = 0; x <= w; x += 20) {
                    const phase = time * 0.4 + k * 1.3;
                    const y = h * (0.1 + 0.04 * k) + Math.sin(x * 0.008 + phase) * (18 + k * 6);
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(w, h * 0.4);
                ctx.lineTo(0, h * 0.4);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        } else if (type === 'fire') {
            // Lava glow pulsing from below horizon
            const pulse = 0.5 + 0.5 * Math.sin(time * 1.1);
            const lavaGrad = ctx.createLinearGradient(0, horizon, 0, h);
            lavaGrad.addColorStop(0, `rgba(255, ${80 + 60 * pulse}, 0, 0.35)`);
            lavaGrad.addColorStop(0.5, 'rgba(180, 40, 0, 0.25)');
            lavaGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = lavaGrad;
            ctx.fillRect(0, horizon, w, h - horizon);
            // Rare tremor shake
            atm.lastTremor -= dt;
            if (atm.lastTremor <= 0) {
                this.shake(4);
                atm.lastTremor = 8 + Math.random() * 10;
            }
        } else if (type === 'tech') {
            // Dyson-ring fragments floating in the mid-sky
            atm.rings.forEach(r => {
                r.angle += r.speed * dt;
                r.x += Math.cos(r.angle) * 0.3;
                r.y += Math.sin(r.angle) * 0.15;
                if (r.x < -40) r.x = w + 20;
                if (r.x > w + 40) r.x = -20;
                ctx.save();
                ctx.translate(r.x, r.y);
                ctx.rotate(r.angle);
                ctx.strokeStyle = 'rgba(188,19,254,0.35)';
                ctx.shadowColor = '#bc13fe';
                ctx.shadowBlur = 14;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, r.r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, r.r * 0.55, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            });
            // Data packets zipping along horizon
            atm.lastLightning -= dt;
            if (atm.lastLightning <= 0 && Math.random() < 0.6) {
                // Brief strobe
                ctx.save();
                ctx.fillStyle = 'rgba(188, 19, 254, 0.1)';
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
                atm.lastLightning = 6 + Math.random() * 10;
            }
        } else if (type === 'source') {
            // Reality cracks: jagged white fissures flickering in/out
            atm.cracks.forEach(c => {
                const flick = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 2 + c.flickerPhase));
                ctx.save();
                ctx.translate(c.x, c.y);
                ctx.rotate(c.angle);
                ctx.globalAlpha = flick * 0.5;
                ctx.strokeStyle = '#fff';
                ctx.shadowColor = '#ffccff';
                ctx.shadowBlur = 18;
                ctx.lineWidth = 2;
                ctx.beginPath();
                let lx = 0, ly = 0;
                ctx.moveTo(lx, ly);
                for (let k = 0; k < 6; k++) {
                    lx += c.len / 6;
                    ly += (Math.random() - 0.5) * 20;
                    ctx.lineTo(lx, ly);
                }
                ctx.stroke();
                ctx.restore();
            });
            // Sacred-geometry ghost overlay pulsing
            ctx.save();
            ctx.globalAlpha = 0.08 + 0.05 * Math.sin(time * 0.5);
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.5;
            ctx.translate(w / 2, h / 2);
            ctx.rotate(time * 0.05);
            for (let k = 0; k < 6; k++) {
                const a = k * Math.PI / 3;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * 280, Math.sin(a) * 280);
                ctx.stroke();
            }
            ctx.restore();
        }
    },

    // Dramatic per-sector backdrop — huge focal element + atmospherics.
    // Boss fights get an enhanced variant that amplifies the theme.
    drawSectorCelestial(ctx, conf, type, w, h, time) {
        const horizon = h * 0.45;
        const isBoss = this.enemy && this.enemy.isBoss;

        if (type === 'city') {
            // 1. Neon moon with concentric rings
            const moonX = w * 0.72, moonY = horizon * 0.55;
            const moonR = isBoss ? 160 : 120;
            const moonGrad = ctx.createRadialGradient(moonX - 30, moonY - 30, 10, moonX, moonY, moonR);
            moonGrad.addColorStop(0, '#fff');
            moonGrad.addColorStop(0.3, conf.sun[0]);
            moonGrad.addColorStop(1, 'rgba(255, 94, 185, 0.05)');
            ctx.fillStyle = moonGrad;
            ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2); ctx.fill();
            // Rings around moon
            ctx.strokeStyle = 'rgba(255, 94, 185, 0.35)'; ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.ellipse(moonX, moonY, moonR + 30 + i * 18, (moonR + 30 + i * 18) * 0.25, time * 0.05, 0, Math.PI * 2);
                ctx.stroke();
            }
            // 2. Faint star field
            for (let i = 0; i < 60; i++) {
                const sx = ((i * 137.5) % w);
                const sy = ((i * 71.3) % (horizon - 40));
                const tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
                ctx.fillStyle = `rgba(255, 255, 255, ${tw * 0.6})`;
                ctx.fillRect(sx, sy, 1.5, 1.5);
            }
            // 3. Holographic city haze (bright magenta glow over horizon)
            const hazeGrad = ctx.createLinearGradient(0, horizon - 80, 0, horizon);
            hazeGrad.addColorStop(0, 'transparent');
            hazeGrad.addColorStop(1, 'rgba(255, 94, 185, 0.25)');
            ctx.fillStyle = hazeGrad;
            ctx.fillRect(0, horizon - 80, w, 80);
            // 4. Boss-only lightning over moon
            if (isBoss && Math.random() < 0.02) {
                ctx.save();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.shadowColor = '#fff'; ctx.shadowBlur = 20;
                ctx.beginPath();
                let lx = moonX + (Math.random() - 0.5) * 100;
                ctx.moveTo(lx, moonY - moonR);
                for (let s = 0; s < 4; s++) { lx += (Math.random() - 0.5) * 40; ctx.lineTo(lx, moonY - moonR + s * 40); }
                ctx.stroke();
                ctx.restore();
            }
        }

        else if (type === 'ice') {
            // 1. Crystalline spire horizon (layered mountains)
            for (let layer = 0; layer < 3; layer++) {
                ctx.save();
                ctx.fillStyle = `rgba(${30 + layer * 40}, ${80 + layer * 40}, ${120 + layer * 30}, ${0.35 + layer * 0.15})`;
                ctx.beginPath();
                ctx.moveTo(0, horizon);
                for (let x = 0; x <= w; x += 40) {
                    const off = Math.sin(x * 0.008 + layer * 2 + time * 0.1) * 18;
                    const peak = horizon - 80 - layer * 40 - off - Math.abs(Math.sin(x * 0.02 + layer)) * 60;
                    ctx.lineTo(x, peak);
                }
                ctx.lineTo(w, horizon); ctx.closePath(); ctx.fill();
                ctx.restore();
            }
            // 2. Frozen sun — pale disc with halo
            const sunX = w * 0.3, sunY = horizon * 0.45;
            const sunR = isBoss ? 140 : 100;
            const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, sunR);
            sunGrad.addColorStop(0, '#fff');
            sunGrad.addColorStop(0.4, '#c4f1ff');
            sunGrad.addColorStop(1, 'rgba(180, 230, 255, 0.02)');
            ctx.fillStyle = sunGrad;
            ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
            // 3. Falling snow specks (cheap loop)
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            for (let i = 0; i < 40; i++) {
                const fx = ((i * 97 + time * 30) % w);
                const fy = ((i * 53 + time * 80) % h);
                ctx.fillRect(fx, fy, 2, 2);
            }
        }

        else if (type === 'fire') {
            // 1. Volcano silhouette on horizon
            ctx.save();
            ctx.fillStyle = 'rgba(30, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            ctx.lineTo(w * 0.25, horizon - 150);
            ctx.lineTo(w * 0.35, horizon - 120);
            ctx.lineTo(w * 0.45, horizon - 240);
            ctx.lineTo(w * 0.55, horizon - 200);
            ctx.lineTo(w * 0.70, horizon - 260);
            ctx.lineTo(w * 0.85, horizon - 140);
            ctx.lineTo(w, horizon - 180);
            ctx.lineTo(w, horizon); ctx.closePath();
            ctx.fill();
            // Lava cap glow on each peak
            ctx.strokeStyle = '#ffca3a'; ctx.lineWidth = 3; ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.moveTo(w * 0.25, horizon - 150);
            ctx.lineTo(w * 0.35, horizon - 120);
            ctx.moveTo(w * 0.45, horizon - 240);
            ctx.lineTo(w * 0.55, horizon - 200);
            ctx.moveTo(w * 0.70, horizon - 260);
            ctx.lineTo(w * 0.85, horizon - 140);
            ctx.stroke();
            ctx.restore();
            // 2. Molten sun (huge, pulsing)
            const sunX = w * 0.78, sunY = horizon * 0.4;
            const pulse = 1 + Math.sin(time * 1.5) * 0.08;
            const sunR = (isBoss ? 180 : 130) * pulse;
            const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, sunR);
            sunGrad.addColorStop(0, '#fff0b0');
            sunGrad.addColorStop(0.4, conf.sun[0]);
            sunGrad.addColorStop(0.8, conf.sun[1]);
            sunGrad.addColorStop(1, 'rgba(255, 68, 0, 0)');
            ctx.fillStyle = sunGrad;
            ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.fill();
            // 3. Rising ember particles (cheap loop)
            for (let i = 0; i < 30; i++) {
                const ex = ((i * 91 + time * 20) % w);
                const ey = (h - ((i * 47 + time * 120) % h));
                const a = 0.4 + 0.4 * Math.sin(time * 3 + i);
                ctx.fillStyle = `rgba(255, ${180 + (i % 60)}, ${50 + (i % 40)}, ${a})`;
                ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, Math.PI * 2); ctx.fill();
            }
        }

        else if (type === 'tech') {
            // 1. Massive gas-giant planet with orbital rings
            const planetX = w * 0.7, planetY = horizon * 0.5;
            const planetR = isBoss ? 200 : 150;
            const planetGrad = ctx.createRadialGradient(planetX - 50, planetY - 50, 20, planetX, planetY, planetR);
            planetGrad.addColorStop(0, '#e0b0ff');
            planetGrad.addColorStop(0.35, '#bc13fe');
            planetGrad.addColorStop(0.8, '#4a0080');
            planetGrad.addColorStop(1, '#1a0033');
            ctx.fillStyle = planetGrad;
            ctx.beginPath(); ctx.arc(planetX, planetY, planetR, 0, Math.PI * 2); ctx.fill();
            // Cloud bands
            ctx.save();
            ctx.beginPath(); ctx.arc(planetX, planetY, planetR - 4, 0, Math.PI * 2); ctx.clip();
            ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 8;
            for (let y = -planetR; y <= planetR; y += 30) {
                ctx.beginPath();
                ctx.moveTo(planetX - planetR, planetY + y + Math.sin(time + y * 0.1) * 6);
                ctx.lineTo(planetX + planetR, planetY + y + Math.sin(time + y * 0.1) * 6);
                ctx.stroke();
            }
            ctx.restore();
            // Orbital ring (tilted)
            ctx.save();
            ctx.translate(planetX, planetY);
            ctx.rotate(-0.4);
            ctx.strokeStyle = 'rgba(224, 176, 255, 0.6)'; ctx.lineWidth = 3;
            ctx.shadowColor = '#bc13fe'; ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.ellipse(0, 0, planetR + 50, (planetR + 50) * 0.25, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(0, 0, planetR + 72, (planetR + 72) * 0.25, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            // 2. Floating hex data grid in the foreground sky
            ctx.save();
            ctx.strokeStyle = 'rgba(188, 19, 254, 0.25)'; ctx.lineWidth = 1;
            for (let i = 0; i < 8; i++) {
                const hx = (i * 173 + time * 20) % w;
                const hy = horizon * 0.2 + Math.sin(time + i) * 20 + (i % 3) * 40;
                ctx.save(); ctx.translate(hx, hy);
                this.drawPolygon(ctx, 0, 0, 14, 6, time * 0.2 + i);
                ctx.restore();
            }
            ctx.restore();
        }

        else if (type === 'source') {
            // 1. Central void fracture — fracturing sphere at top
            const vx = w * 0.5, vy = horizon * 0.4;
            const vr = isBoss ? 180 : 130;
            const voidGrad = ctx.createRadialGradient(vx, vy, 10, vx, vy, vr);
            voidGrad.addColorStop(0, '#000');
            voidGrad.addColorStop(0.5, '#4a0010');
            voidGrad.addColorStop(0.9, 'rgba(255, 0, 68, 0.3)');
            voidGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = voidGrad;
            ctx.beginPath(); ctx.arc(vx, vy, vr + 40, 0, Math.PI * 2); ctx.fill();
            // Jagged glyph ring around void
            ctx.save();
            ctx.translate(vx, vy);
            ctx.rotate(time * 0.3);
            ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 2;
            ctx.shadowColor = '#ff3355'; ctx.shadowBlur = 15;
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * (vr + 10), Math.sin(a) * (vr + 10));
                ctx.lineTo(Math.cos(a + 0.1) * (vr + 20), Math.sin(a + 0.1) * (vr + 20));
                ctx.lineTo(Math.cos(a - 0.1) * (vr + 20), Math.sin(a - 0.1) * (vr + 20));
                ctx.stroke();
            }
            ctx.restore();
            // 2. Red lightning cracks emanating outward
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * Math.PI * 2 + time * 0.1;
                ctx.save();
                ctx.translate(vx, vy);
                ctx.rotate(a);
                ctx.strokeStyle = `rgba(255, 51, 85, ${0.35 + 0.35 * Math.sin(time * 3 + i)})`;
                ctx.lineWidth = 1.5;
                ctx.shadowColor = '#ff3355'; ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.moveTo(vr, 0);
                let x = vr, y = 0;
                for (let s = 0; s < 6; s++) {
                    x += 40 + Math.random() * 30;
                    y += (Math.random() - 0.5) * 40;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.restore();
            }
            // 3. Falling glyph particles (red tint)
            for (let i = 0; i < 30; i++) {
                const gx = ((i * 113 + time * 40) % w);
                const gy = ((i * 67 + time * 60) % h);
                ctx.fillStyle = `rgba(255, 51, 85, ${0.4 + 0.3 * Math.sin(time * 2 + i)})`;
                ctx.fillRect(gx, gy, 2, 6);
            }
        }
    },

    drawEnvironment(dt) {
        if (this.currentState === STATE.META) {
            this.drawSanctuary(dt);
            return;
        }

        // Initialize BG State if missing or sector changed
        if (!this.bgState || this.bgState.sector !== this.sector) {
            this.initBackground();
        }

        const ctx = this.ctx;
        // FIX: Use CONFIG constants to ensure full screen clear
        const w = CONFIG.CANVAS_WIDTH;
        const h = CONFIG.CANVAS_HEIGHT;
        const time = Date.now() / 1000;
        
        let conf = SECTOR_CONFIG[this.sector] || SECTOR_CONFIG[1];
        let type = conf.type;

        // Special Override for Sector 5 Boss Reality Shift
        if (this.enemy && this.enemy.name === "THE SOURCE" && this.enemy.realityOverwritten) {
            conf = { type: 'source', bgTop: '#1a001a', bgBot: '#330000', sun: ['#ff8800', '#800080'], grid: '#ff00ff' };
            type = 'source';
        }

        // 1. Richer sky gradient — top / mid / bottom using sector palette
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, conf.bgTop);
        grad.addColorStop(0.35, conf.bgMid || conf.bgBot);
        grad.addColorStop(0.7, conf.bgBot);
        grad.addColorStop(1, conf.bgTop);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        const isBossFight = !!(this.enemy && this.enemy.isBoss);

        // 1a. Boss fights get a full bespoke backdrop; regular fights keep the
        //      sector celestial + atmosphere + skyline + drones layered look.
        if (isBossFight) {
            this.drawBossBackdrop(ctx, this.enemy, w, h, time);
        } else {
            this.drawSectorCelestial(ctx, conf, type, w, h, time);
            this.drawAtmosphere(ctx, conf, type, w, h, time, dt);
        }

        // 3. Dynamic Skyline (Parallax) — skipped during boss fights so the
        //     bespoke boss backdrop isn't cluttered with generic silhouettes.
        const horizon = h * 0.45;

        if (!isBossFight) this.bgState.skyline.forEach(b => {
            // Move
            b.x -= b.speed * dt;
            if (b.x + b.w < 0) b.x = w + 50; // Wrap around

            // Draw
            ctx.fillStyle = b.layer === 0 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.8)'; // Dark silhouettes
            
            // Shape based on sector type
            if (type === 'city') {
                // Skyscrapers
                ctx.fillRect(b.x, horizon - b.h, b.w, b.h);
                // Windows
                if (b.layer === 1) {
                    ctx.fillStyle = conf.grid;
                    for(let wy = 0; wy < b.h; wy += 20) {
                        if(Math.random()>0.8) ctx.fillRect(b.x + 5, horizon - b.h + wy, 5, 5);
                        if(Math.random()>0.8) ctx.fillRect(b.x + b.w - 10, horizon - b.h + wy, 5, 5);
                    }
                }
            } else if (type === 'ice') {
                // Spikes / Mountains
                ctx.beginPath();
                ctx.moveTo(b.x, horizon);
                ctx.lineTo(b.x + b.w/2, horizon - b.h);
                ctx.lineTo(b.x + b.w, horizon);
                ctx.fill();
            } else if (type === 'fire') {
                // Trapezoid Factories
                ctx.beginPath();
                ctx.moveTo(b.x - 10, horizon);
                ctx.lineTo(b.x + 10, horizon - b.h);
                ctx.lineTo(b.x + b.w - 10, horizon - b.h);
                ctx.lineTo(b.x + b.w + 10, horizon);
                ctx.fill();
                // Smoke
                if (b.layer === 1 && Math.random() > 0.95) {
                    this.spawnBgParticle('fire', false); 
                }
            } else if (type === 'tech') {
                // Floating Hexagons/Monoliths
                ctx.save();
                ctx.translate(b.x + b.w/2, horizon - b.h/2 - Math.sin(time + b.x)*20);
                this.drawPolygon(ctx, 0, 0, b.w/2, 6, time * 0.2);
                ctx.restore();
            } else if (type === 'source') {
                // Glitchy rectangles
                if (Math.random() > 0.1) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#200';
                    ctx.fillRect(b.x, horizon - b.h, b.w, b.h);
                }
            }
        });

        // 4. Distant Drones — skipped during boss fights.
        if (!isBossFight) {
            this.bgState.nextDroneTime -= dt;
            if (this.bgState.nextDroneTime <= 0) {
                this.bgState.drones.push({
                    x: w + 50,
                    y: h * 0.1 + Math.random() * h * 0.3,
                    vx: -(50 + Math.random() * 100),
                    type: Math.random() > 0.5 ? 'scout' : 'cargo'
                });
                this.bgState.nextDroneTime = 10 + Math.random() * 20;
            }

            for (let i = this.bgState.drones.length - 1; i >= 0; i--) {
                let d = this.bgState.drones[i];
                d.x += d.vx * dt;
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.fillStyle = '#000';
                ctx.fillRect(-15, -5, 30, 10);
                ctx.fillStyle = conf.sun[1];
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(15, 0, 3, 0, Math.PI * 2); ctx.fill();
                if (Math.sin(time * 10) > 0) {
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(-15, 0, 2, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
                if (d.x < -100) this.bgState.drones.splice(i, 1);
            }
        }

        // 5. Grid Floor
        const cx = w/2;
        const gridSpeed = 40;
        const offsetY = (time * gridSpeed) % 40;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, horizon, w, h - horizon);
        ctx.clip();

        const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
        floorGrad.addColorStop(0, conf.grid.substring(0,7) + '1A'); 
        floorGrad.addColorStop(1, conf.grid.substring(0,7) + '00');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, horizon, w, h-horizon);

        ctx.strokeStyle = conf.grid;
        ctx.lineWidth = 2;

        const fov = 3.0;
        for (let i = -10; i <= 10; i++) {
            const x = cx + (i * 120);
            ctx.beginPath();
            ctx.moveTo(cx, horizon - 20); 
            ctx.lineTo(x * fov + (cx * (1-fov)), h);
            ctx.stroke();
        }

        for(let y = horizon; y < h; y += 40) {
            const dist = (y - horizon) / (h - horizon);
            const perspectiveY = horizon + (Math.pow(dist, 0.7)) * (h - horizon);
            
            const moveY = perspectiveY + (offsetY * (1-dist)); 
            if (moveY > h) continue;

            ctx.globalAlpha = 0.1 + (dist * 0.4);
            ctx.beginPath();
            ctx.moveTo(0, moveY);
            ctx.lineTo(w, moveY);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // 6. Atmospheric Particles
        if (Math.random() < 0.2) this.spawnBgParticle(type); // Spawn rate

        for (let i = this.bgState.particles.length - 1; i >= 0; i--) {
            let p = this.bgState.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.min(1, p.life);
            
            if (p.type === 'ice') {
                // Binary rain
                ctx.font = `${p.size * 4}px monospace`;
                ctx.fillText(p.char, p.x, p.y);
            } else if (p.type === 'source') {
                // Glitch rects
                ctx.fillRect(p.x, p.y, p.w, p.h);
            } else {
                // Standard dots/ash
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
                ctx.fill();
            }

            // Bounds check
            if (p.life <= 0 || p.y > h + 50 || p.y < -50) {
                this.bgState.particles.splice(i, 1);
            }
        }
        ctx.globalAlpha = 1.0;
    },

    drawIntentLine(enemy) {
        if (!enemy.showIntent) return;

        const ctx = this.ctx;
        const time = Date.now() / 1000;
        
        const drawLine = (target) => {
            if (!target || target.currentHp <= 0) return;
            
            ctx.save();
            // Improved Visuals: Thicker, glowing, animated
            ctx.lineWidth = 4; 
            ctx.lineCap = 'round';
            ctx.shadowColor = "#ff0000";
            ctx.shadowBlur = 15;
            
            // Gradient Stroke (Fade from Enemy to Target)
            const grad = ctx.createLinearGradient(enemy.x, enemy.y, target.x, target.y);
            grad.addColorStop(0, 'rgba(255, 0, 0, 0.3)');
            grad.addColorStop(1, '#ff0000');
            ctx.strokeStyle = grad;

            // Flow animation (Moving Dashes)
            ctx.setLineDash([20, 20]);
            ctx.lineDashOffset = -time * 80; // Fast flow towards target

            ctx.beginPath();
            
            // Calculate Offset Start/End points to avoid center overlap
            const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
            
            // Start from edge of Enemy
            const startX = enemy.x + Math.cos(angle) * (enemy.radius * 0.6);
            const startY = enemy.y + Math.sin(angle) * (enemy.radius * 0.6);
            
            // End at edge of Target
            const endX = target.x - Math.cos(angle) * (target.radius * 0.9);
            const endY = target.y - Math.sin(angle) * (target.radius * 0.9);

            ctx.moveTo(startX, startY);
            
            // Bezier Curve for "Arcing" attack (Visual flair)
            // Midpoint moved 'up' slightly to create an arc
            const cpX = (startX + endX) / 2;
            const cpY = (startY + endY) / 2 - 40; 
            
            ctx.quadraticCurveTo(cpX, cpY, endX, endY);
            ctx.stroke();
            
            // Impact Point Marker (Target Lock)
            ctx.setLineDash([]);
            ctx.fillStyle = "#ff0000";
            ctx.shadowColor = "#fff";
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(endX, endY, 6, 0, Math.PI*2);
            ctx.fill();
            
            // Pulsing Ring at target
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(endX, endY, 6 + Math.sin(time * 10) * 4, 0, Math.PI*2);
            ctx.stroke();
            
            ctx.restore();
        };

        // Handle Multiple Intents
        if (enemy.nextIntents && enemy.nextIntents.length > 0) {
            enemy.nextIntents.forEach(intent => {
                if (intent.type === 'attack' || intent.type === 'multi_attack' || intent.type === 'debuff' || intent.type === 'purge_attack') {
                    // Default to player if no specific target set (common for boss logic)
                    const target = intent.target || this.player;
                    drawLine(target);
                }
            });
        } 
        // Fallback for single intent
        else if (enemy.nextIntent && enemy.nextIntent.target) {
            drawLine(enemy.nextIntent.target);
        }
    },

    loop(timestamp) {
        let dt = (timestamp - this.lastTime) / 1000;
        if (dt > 0.1) dt = 0.1;

        this.lastTime = timestamp;

        // Hit-stop: while active, freeze dt to 0 so animations pause.
        if (this.hitStopUntil && timestamp < this.hitStopUntil) {
            dt = 0;
        }

        // Rolling FPS sample for adaptive quality manager. Circular buffer
        // (fixed-size Float32Array + write index) so we don't do per-frame
        // array.shift() — that was O(n) on 60 items every frame and compounded
        // into visible GC pressure on mid-tier mobile during long combats.
        if (!this._fpsSamples) {
            this._fpsSamples = new Float32Array(60);
            this._fpsWrite = 0;
            this._fpsCount = 0;
        }
        if (dt > 0) {
            this._fpsSamples[this._fpsWrite] = 1 / dt;
            this._fpsWrite = (this._fpsWrite + 1) % 60;
            if (this._fpsCount < 60) this._fpsCount++;
        }

        // Re-evaluate quality every ~60 frames; smooth changes via hysteresis
        this._qualityCheckFrame = (this._qualityCheckFrame || 0) + 1;
        if (this._qualityCheckFrame >= 60 && this._fpsCount >= 30) {
            this._qualityCheckFrame = 0;
            let sum = 0;
            for (let i = 0; i < this._fpsCount; i++) sum += this._fpsSamples[i];
            const avg = sum / this._fpsCount;
            // Only step at most ±1 quality tier per check to avoid flapping
            let q = ParticleSys.quality;
            if (avg < 38 && q > 0.4) q = Math.max(0.4, q - 0.3);
            else if (avg < 50 && q > 0.7) q = 0.7;
            else if (avg > 56 && q < 1.0) q = Math.min(1.0, q + 0.15);
            ParticleSys.quality = q;
            this.qualityShakeScale = q < 0.6 ? 0.5 : q < 0.85 ? 0.8 : 1.0;
        }

        // Cinematic slow-motion support: last-blow on boss kills, etc.
        if (this.slowMoTimer && this.slowMoTimer > 0) {
            this.slowMoTimer -= dt;
            if (this.slowMoTimer <= 0) { this.slowMoTimer = 0; this.slowMoScale = 1; }
        }
        const timeScale = this.slowMoScale || 1;
        dt *= timeScale;

        if (this.inputCooldown > 0) {
            this.inputCooldown -= dt;
        }
        
        // NEW: Update Hex Minigame Movement
        if (this.currentState === STATE.HEX) {
            this.updateHexBreach(dt);
        }

        try {
            // Early-exit for DOM-only screens — the main canvas is fully covered by
            // HTML overlays on these states, so the combat backdrop + particle update
            // is pure waste. On CHAR_SELECT we also have a second rAF chain redrawing
            // 6 preview canvases; keeping the main loop idle here is a major win.
            const domOnlyStates = new Set([
                STATE.MENU, STATE.CHAR_SELECT, STATE.MAP, STATE.SHOP,
                STATE.REWARD, STATE.GAMEOVER, STATE.ACHIEVEMENTS,
                STATE.TUTORIAL, STATE.EVENT, STATE.INTEL
            ]);
            if (domOnlyStates.has(this.currentState)) {
                requestAnimationFrame(this._boundLoop);
                return;
            }

            this.drawEnvironment(dt);

            if (this.currentState === STATE.META) {
                this.drawSanctuary(dt);
                requestAnimationFrame(this._boundLoop);
                return;
            }

            let shakeX = 0, shakeY = 0;
            if(this.shakeTime > 0) {
                shakeX = (Math.random() - 0.5) * 15;
                shakeY = (Math.random() - 0.5) * 15;
                this.shakeTime--;
            }

            this.ctx.save();
            this.ctx.translate(shakeX, shakeY);
            
            this.updateMinionPositions();

            if ((this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT) && this.player && this.enemy) {
                this.drawEntity(this.player);
                
                if (this.player.minions) {
                    this.player.minions.forEach(m => {
                        if (m) this.drawEntity(m);
                    });
                }
                
                this.drawEntity(this.enemy);
                
                if (this.enemy.minions) {
                    this.enemy.minions.forEach(m => {
                        if (m) this.drawEntity(m);
                    });
                }
                
                this.drawIntentLine(this.enemy);
                this.drawEffects();
                
                // QTE Updates
                this.updateQTE(dt);
                this.drawQTE();

                this.drawHealthBar(this.player);
                if (this.player.minions) {
                    this.player.minions.forEach(m => {
                        if (m) this.drawHealthBar(m);
                    });
                }
                this.drawHealthBar(this.enemy);
                if (this.enemy.minions) {
                    this.enemy.minions.forEach(m => {
                        if (m) this.drawHealthBar(m);
                    });
                }
            }

            ParticleSys.update(dt);
            ParticleSys.draw(this.ctx);

            // Combat mood vignette: tint shifts by who's in danger.
            // Skipped on low tier (gradient creation per frame is expensive).
            if (Perf.tier !== 'low' && (this.currentState === STATE.COMBAT || this.currentState === STATE.TUTORIAL_COMBAT) && this.player && this.enemy) {
                const pHp = this.player.currentHp / (this.player.maxHp || 1);
                const eHp = this.enemy.currentHp / (this.enemy.maxHp || 1);
                let tintColor = null;
                let tintStrength = 0;
                if (pHp < 0.3) { tintColor = [255, 0, 85]; tintStrength = (0.3 - pHp) / 0.3; }
                else if (eHp < 0.3) { tintColor = [0, 243, 255]; tintStrength = (0.3 - eHp) / 0.3; }
                if (tintColor) {
                    const cw = CONFIG.CANVAS_WIDTH, chh = CONFIG.CANVAS_HEIGHT;
                    const vGrad = this.ctx.createRadialGradient(cw/2, chh/2, chh*0.35, cw/2, chh/2, chh*0.7);
                    vGrad.addColorStop(0, 'transparent');
                    vGrad.addColorStop(1, `rgba(${tintColor[0]}, ${tintColor[1]}, ${tintColor[2]}, ${0.28 * tintStrength})`);
                    this.ctx.save();
                    this.ctx.fillStyle = vGrad;
                    this.ctx.fillRect(0, 0, cw, chh);
                    this.ctx.restore();
                }
            }

        } catch (e) {
            console.error("Render Error:", e);
            this.ctx.restore();
        } finally {
            this.ctx.restore();
        }

        // Screen flash overlay (perfect QTE / cinematic moments) — full-canvas
        // additive layer that fades over its duration.
        if (this.screenFlashUntil && timestamp < this.screenFlashUntil) {
            const elapsed = timestamp - this.screenFlashStart;
            const alpha = Math.max(0, 1 - elapsed / this.screenFlashDuration);
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = this.screenFlashColor || 'rgba(255,255,255,0.4)';
            // Use logical dims — ctx is already scaled by renderScale.
            this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
            this.ctx.restore();
        }

        requestAnimationFrame(this._boundLoop);
    },

// --- DRAWING HELPERS ---
    drawPolygon(ctx, x, y, radius, sides, rotation) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const angle = rotation + (i * 2 * Math.PI / sides);
            const px = x + radius * Math.cos(angle);
            const py = y + radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
    },

    drawSpikedCircle(ctx, x, y, radius, spikes, spikeDepth, rotation) {
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const angle = rotation + (i * Math.PI / spikes);
            const r = (i % 2 === 0) ? radius : radius + spikeDepth;
            const px = x + r * Math.cos(angle);
            const py = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
    },

    // Per-class signature flourishes (§2.3). Adds unique motion + sfx so
    // each class reads distinctly at a glance. Driven by class-id and by
    // current player state (HP%, combo active, etc.).
    drawPlayerClassSignature(ctx, entity, time) {
        const id = entity.classId;
        const hpPct = entity.currentHp / Math.max(1, entity.maxHp);
        const r = entity.radius || 120;

        ctx.save();

        if (id === 'tactician') {
            // Clockwork tick — 12 tick marks rotating once every 4s.
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 0;
            const rot = (time * Math.PI * 2 / 4) % (Math.PI * 2);
            for (let i = 0; i < 12; i++) {
                const a = rot + (i * Math.PI * 2 / 12);
                const r1 = r + 10, r2 = r + 18 + (i % 3 === 0 ? 6 : 0);
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
                ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
                ctx.stroke();
            }
            // Minute hand
            ctx.strokeStyle = 'rgba(0, 243, 255, 0.75)';
            ctx.lineWidth = 2;
            const handA = time * 0.6;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(handA) * (r - 20), Math.sin(handA) * (r - 20));
            ctx.stroke();
        }

        else if (id === 'arcanist') {
            // Rune orbit — 5 floating glyphs orbiting slowly.
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#bc13fe';
            ctx.fillStyle = 'rgba(188, 19, 254, 0.8)';
            ctx.font = "bold 16px 'Orbitron'";
            ctx.textAlign = 'center';
            const glyphs = ['Ψ', 'Θ', 'Λ', 'Ξ', 'Φ'];
            for (let i = 0; i < glyphs.length; i++) {
                const a = time * 0.5 + i * (Math.PI * 2 / glyphs.length);
                const ox = Math.cos(a) * (r + 25);
                const oy = Math.sin(a) * (r * 0.5) - r * 0.3;
                const alpha = 0.4 + 0.4 * Math.sin(time * 2 + i);
                ctx.globalAlpha = alpha;
                ctx.fillText(glyphs[i], ox, oy);
            }
            ctx.globalAlpha = 1;
        }

        else if (id === 'bloodstalker') {
            // Low-HP blood pool — dark red ring grows as HP drops.
            if (hpPct < 0.5) {
                const intensity = 1 - (hpPct / 0.5);
                ctx.globalAlpha = 0.25 + intensity * 0.35;
                const grad = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 1.6);
                grad.addColorStop(0, 'rgba(255, 0, 0, 0)');
                grad.addColorStop(0.7, `rgba(180, 0, 0, ${intensity * 0.6})`);
                grad.addColorStop(1, `rgba(120, 0, 0, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            // Blood drip particles from below
            ctx.fillStyle = '#aa0000';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 6;
            for (let i = 0; i < 4; i++) {
                const dx = (i - 1.5) * 14;
                const phase = (time + i * 0.35) % 1.4;
                const dy = r * 0.7 + phase * 40;
                ctx.globalAlpha = Math.max(0, 1 - (phase / 1.4));
                ctx.beginPath();
                ctx.ellipse(dx, dy, 2.2, 4, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        else if (id === 'annihilator') {
            // Shoulder-mounted ordnance glow: alternating hazard pulse.
            ctx.shadowBlur = 0;
            const pulse = 0.5 + 0.5 * Math.sin(time * 6);
            ctx.fillStyle = `rgba(255, 136, 0, ${0.5 + pulse * 0.4})`;
            ctx.shadowColor = '#ff8800';
            ctx.shadowBlur = 14 * pulse;
            ctx.beginPath();
            ctx.arc(-r * 0.85, -r * 0.3, 6 + pulse * 2, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath();
            ctx.arc(r * 0.85, -r * 0.3, 6 + pulse * 2, 0, Math.PI * 2); ctx.fill();
            // Hazard stripes arc above the head
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 4;
            ctx.setLineDash([10, 6]);
            ctx.lineDashOffset = -time * 25;
            ctx.beginPath();
            ctx.arc(0, 0, r + 26, -Math.PI * 0.75, -Math.PI * 0.25);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        else if (id === 'sentinel') {
            // Hex-plate armor chunks — three rotating plates that visibly
            // "reassemble" around the player as they gain shield.
            const shieldNorm = Math.min(1, (entity.shield || 0) / 20);
            const chunks = 3;
            ctx.strokeStyle = 'rgba(230, 250, 255, 0.85)';
            ctx.fillStyle = 'rgba(230, 250, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#e6faff';
            ctx.shadowBlur = 10;
            for (let i = 0; i < chunks; i++) {
                const a = time * 0.2 + i * (Math.PI * 2 / chunks);
                const orbitR = r + 22 + shieldNorm * 4;
                const px = Math.cos(a) * orbitR;
                const py = Math.sin(a) * orbitR;
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(a);
                // Little hex chunk
                const hr = 8 + shieldNorm * 2;
                ctx.beginPath();
                for (let k = 0; k < 6; k++) {
                    const ka = (Math.PI / 3) * k + Math.PI / 6;
                    const hx = Math.cos(ka) * hr;
                    const hy = Math.sin(ka) * hr;
                    if (k === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
                }
                ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.restore();
            }
        }

        else if (id === 'summoner') {
            // Leaf / spore trail — green motes drift upward around the player.
            ctx.shadowColor = '#00ff99';
            ctx.shadowBlur = 8;
            for (let i = 0; i < 6; i++) {
                const phase = (time * 0.3 + i * 0.17) % 1;
                const dx = Math.sin(time * 1.5 + i * 1.5) * r * 0.8;
                const dy = r * 0.9 - phase * r * 1.8;
                const alpha = Math.sin(phase * Math.PI);
                ctx.globalAlpha = alpha * 0.85;
                ctx.fillStyle = i % 2 === 0 ? '#00ff99' : '#7fff00';
                ctx.beginPath();
                ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Full-screen accent for Bloodstalker low HP — toggled via a body
        // class so CSS can render a pulsing red vignette.
        if (id === 'bloodstalker') {
            const low = hpPct < 0.3;
            document.body.classList.toggle('bloodstalker-critical', low);
        } else if (document.body.classList.contains('bloodstalker-critical')) {
            document.body.classList.remove('bloodstalker-critical');
        }
    },

    // Build a sector-specific animated backdrop for the map screen. Each
    // sector gets a bespoke SVG/DOM stack — not just a color swap — so the
    // player instantly reads which zone they're in.
    _injectSectorMapBackdrop(screen, sector) {
        // Remove any previous backdrop
        const prev = screen.querySelector('.map-sector-bg');
        if (prev) prev.remove();

        const bg = document.createElement('div');
        bg.className = `map-sector-bg map-sector-bg-${sector}`;

        if (sector === 1) {
            // Neon megacity — parallax silhouettes + data lines sweeping
            bg.innerHTML = `
                <div class="msb-sky msb-city-sky"></div>
                <div class="msb-city-far"></div>
                <div class="msb-city-near"></div>
                <div class="msb-data-lines"><span></span><span></span><span></span><span></span><span></span></div>
                <div class="msb-city-drones"><span></span><span></span><span></span></div>
                <div class="msb-grid"></div>
            `;
        } else if (sector === 2) {
            // Cryo lattice — frozen aurora + falling snow-data + ice fractures
            bg.innerHTML = `
                <div class="msb-sky msb-ice-sky"></div>
                <div class="msb-aurora"></div>
                <div class="msb-ice-peaks"></div>
                <div class="msb-snowfall"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
                <div class="msb-ice-cracks"><span></span><span></span><span></span></div>
                <div class="msb-grid"></div>
            `;
        } else if (sector === 3) {
            // Molten forge — lava core + ember rain + hammer silhouettes
            bg.innerHTML = `
                <div class="msb-sky msb-forge-sky"></div>
                <div class="msb-lava-pool"></div>
                <div class="msb-forge-pistons"><span></span><span></span></div>
                <div class="msb-embers"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
                <div class="msb-grid"></div>
            `;
        } else if (sector === 4) {
            // Hive protocol — hex cells pulsing + drone swarm
            bg.innerHTML = `
                <div class="msb-sky msb-hive-sky"></div>
                <div class="msb-hive-cells"></div>
                <div class="msb-hive-network"><span></span><span></span><span></span><span></span></div>
                <div class="msb-hive-swarm"><span></span><span></span><span></span><span></span><span></span><span></span></div>
                <div class="msb-grid"></div>
            `;
        } else if (sector === 5) {
            // Source fracture — reality tears + glitch bars + prism rays
            bg.innerHTML = `
                <div class="msb-sky msb-source-sky"></div>
                <div class="msb-source-rays"></div>
                <div class="msb-source-cracks"><span></span><span></span><span></span><span></span></div>
                <div class="msb-source-glitch"><span></span><span></span><span></span></div>
                <div class="msb-grid"></div>
            `;
        } else {
            bg.innerHTML = `<div class="msb-sky"></div><div class="msb-grid"></div>`;
        }

        // Insert as the first child so it sits behind title/nodes/legend.
        screen.insertBefore(bg, screen.firstChild);
    },

    // Sector silhouette underlayer — drawn BEHIND the base enemy shape so
    // the silhouette shifts visually per zone. Kept cheap (one gradient or a
    // few strokes) so perf stays clean.
    drawSectorEnemyUnderlayer(ctx, entity, time) {
        const sector = this.sector;
        const r = entity.radius || 80;
        ctx.save();
        if (sector === 1) {
            // Surveillance — faint cyan ground scan projected beneath the chassis.
            const g = ctx.createRadialGradient(0, r * 0.6, 4, 0, r * 0.6, r * 1.3);
            g.addColorStop(0, 'rgba(0, 230, 255, 0.35)');
            g.addColorStop(1, 'rgba(0, 230, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(0, r * 0.6, r * 1.25, r * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (sector === 2) {
            // Frost aura — cold halo behind the entity.
            const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.4);
            g.addColorStop(0, 'rgba(220, 240, 255, 0.45)');
            g.addColorStop(0.7, 'rgba(120, 220, 255, 0.18)');
            g.addColorStop(1, 'rgba(0, 50, 80, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.4, 0, Math.PI * 2);
            ctx.fill();
        } else if (sector === 3) {
            // Heat corona — orange pulsing halo + ground scorch.
            const pulse = 0.8 + 0.2 * Math.sin(time * 4);
            const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.3 * pulse);
            g.addColorStop(0, 'rgba(255, 160, 60, 0.55)');
            g.addColorStop(0.5, 'rgba(255, 90, 0, 0.25)');
            g.addColorStop(1, 'rgba(80, 0, 0, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.3 * pulse, 0, Math.PI * 2);
            ctx.fill();
            // Ground scorch ellipse
            ctx.fillStyle = 'rgba(80, 20, 0, 0.55)';
            ctx.beginPath();
            ctx.ellipse(0, r * 0.7, r, r * 0.25, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (sector === 4) {
            // Hive resonance ring — slowly rotating concentric dashes.
            ctx.strokeStyle = 'rgba(127, 255, 0, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 8]);
            ctx.lineDashOffset = -time * 14;
            for (let i = 0; i < 2; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, r * (1.1 + i * 0.18), 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        } else if (sector === 5) {
            // Ghost echo — two offset red/cyan clones of the base shape silhouette
            // as a halo, so the enemy reads as "out of phase".
            const ghostOff = Math.sin(time * 3) * 4 + 8;
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = 'rgba(255, 0, 68, 0.55)';
            ctx.beginPath(); ctx.arc(-ghostOff, 0, r * 0.95, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(0, 243, 255, 0.45)';
            ctx.beginPath(); ctx.arc(ghostOff, 0, r * 0.95, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    },

    // Sector-thematic accents layered on top of each standard/elite enemy.
    // Called from drawEntity after the base shape is drawn. The accent
    // motifs make the same base chassis read as "surveillance drone" in
    // Sector 1 vs "forged war-frame" in Sector 3 without swapping meshes.
    drawSectorEnemyAccents(ctx, entity, time) {
        const sector = this.sector;
        const r = entity.radius || 80;
        const isElite = !!entity.isElite;

        ctx.save();

        if (sector === 1) {
            // Surveillance — cyan data-rain trailing down from shoulders + a
            // rotating targeting crosshair hovering to the right.
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(0, 230, 255, 0.8)';
            for (let i = 0; i < 8; i++) {
                const dx = -r * 0.9 + (i * r * 0.25);
                const dyBase = -r * 0.3;
                const dy = dyBase + ((time * 80 + i * 37) % (r * 1.4));
                const h = 6 + (i % 3) * 3;
                ctx.globalAlpha = 0.25 + (i % 2) * 0.25;
                ctx.fillRect(dx, dy, 1.4, h);
            }
            ctx.globalAlpha = 1;
            // Crosshair reticle (rotates slowly around the enemy)
            ctx.save();
            ctx.translate(Math.cos(time * 0.6) * r * 1.1, Math.sin(time * 0.6) * r * 0.7 - r * 0.5);
            ctx.strokeStyle = 'rgba(0, 230, 255, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-12, 0); ctx.lineTo(-4, 0);
            ctx.moveTo(4, 0); ctx.lineTo(12, 0);
            ctx.moveTo(0, -12); ctx.lineTo(0, -4);
            ctx.moveTo(0, 4); ctx.lineTo(0, 12);
            ctx.stroke();
            ctx.restore();
        }

        else if (sector === 2) {
            // Ice / Cryo — frost crystals on shoulders, icicles dripping
            // beneath the chassis, a chilled breath-puff.
            ctx.shadowColor = 'rgba(220, 240, 255, 0.9)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#eaffff';
            ctx.strokeStyle = 'rgba(180, 230, 255, 0.8)';
            ctx.lineWidth = 1.5;
            // Left + right shoulder crystals
            for (const sx of [-r * 0.7, r * 0.7]) {
                ctx.beginPath();
                ctx.moveTo(sx, -r * 0.45);
                ctx.lineTo(sx - 6, -r * 0.25);
                ctx.lineTo(sx, -r * 0.55);
                ctx.lineTo(sx + 6, -r * 0.25);
                ctx.closePath();
                ctx.fill(); ctx.stroke();
            }
            // Icicles hanging from the chest seam
            ctx.shadowBlur = 0;
            for (let i = -2; i <= 2; i++) {
                const ix = i * 10;
                const sway = Math.sin(time * 0.8 + i) * 2;
                ctx.fillStyle = 'rgba(210, 240, 255, 0.85)';
                ctx.beginPath();
                ctx.moveTo(ix - 2 + sway, r * 0.15);
                ctx.lineTo(ix + 2 + sway, r * 0.15);
                ctx.lineTo(ix + sway, r * 0.35 + Math.abs(i) * 2);
                ctx.closePath();
                ctx.fill();
            }
            // Chilled breath — slow expanding puff every ~2s
            const puff = (time * 0.5) % 1;
            if (puff < 0.6) {
                ctx.globalAlpha = (1 - puff / 0.6) * 0.35;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(r * 0.4, -r * 0.1, 6 + puff * 18, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        }

        else if (sector === 3) {
            // Forge / Fire — molten seams glowing through chassis plating,
            // embers rising, heat distortion shimmer.
            // Seams (jagged glowing lines)
            ctx.strokeStyle = '#ff9933';
            ctx.shadowColor = '#ff4500';
            ctx.shadowBlur = 10 + Math.sin(time * 5) * 4;
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(-r * 0.6, -r * 0.4);
            ctx.lineTo(-r * 0.2, -r * 0.1);
            ctx.lineTo(-r * 0.45, r * 0.2);
            ctx.lineTo(-r * 0.1, r * 0.5);
            ctx.moveTo(r * 0.5, -r * 0.3);
            ctx.lineTo(r * 0.15, 0);
            ctx.lineTo(r * 0.4, r * 0.3);
            ctx.stroke();
            // Ember specks rising from head
            ctx.fillStyle = '#ffcc33';
            ctx.shadowBlur = 6;
            for (let i = 0; i < 6; i++) {
                const ex = (i * 17) - r * 0.3;
                const ey = -r * 0.6 - ((time * 60 + i * 35) % (r * 0.9));
                ctx.globalAlpha = 0.4 + (i % 2) * 0.3;
                ctx.fillRect(ex, ey, 2, 3);
            }
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            // Faint heat shimmer — two offset wavy arcs
            ctx.strokeStyle = 'rgba(255, 170, 80, 0.25)';
            ctx.lineWidth = 1;
            for (let k = 0; k < 2; k++) {
                ctx.beginPath();
                for (let x = -r; x <= r; x += 8) {
                    const y = -r - 6 - k * 6 + Math.sin(x * 0.06 + time * 4 + k) * 3;
                    if (x === -r) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        else if (sector === 4) {
            // Hive / Tech — buzzing drone-swarm orbiting, green neural
            // tendrils + a hex-cell motif on the chest.
            // Orbiting swarm
            ctx.fillStyle = '#7fff00';
            ctx.shadowColor = '#32cd32';
            ctx.shadowBlur = 6;
            const swarm = 9;
            for (let i = 0; i < swarm; i++) {
                const a = time * (1 + (i % 3) * 0.4) + i * (Math.PI * 2 / swarm);
                const dist = r * 1.05 + Math.sin(time * 2 + i) * 4;
                const dx = Math.cos(a) * dist;
                const dy = Math.sin(a) * dist * 0.8;
                ctx.fillRect(dx - 1.2, dy - 1.2, 2.4, 2.4);
            }
            ctx.shadowBlur = 0;
            // Hex plate over the sternum
            const hexR = r * 0.24;
            ctx.strokeStyle = 'rgba(127, 255, 0, 0.7)';
            ctx.fillStyle = `rgba(127, 255, 0, ${0.12 + 0.08 * Math.sin(time * 3)})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = (Math.PI / 3) * k + Math.PI / 6;
                const px = Math.cos(a) * hexR;
                const py = Math.sin(a) * hexR;
                if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Neural tendrils from nape (subtle)
            ctx.strokeStyle = 'rgba(127, 255, 0, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = -1; i <= 1; i += 2) {
                const bx = i * r * 0.15;
                ctx.moveTo(bx, -r * 0.4);
                ctx.quadraticCurveTo(i * r * 0.5, -r * 0.65, i * r * 0.35, -r * 0.9 + Math.sin(time * 2 + i) * 4);
            }
            ctx.stroke();
        }

        else if (sector === 5) {
            // Source / Void — glitch tears, red code fragments, chromatic
            // ghost duplicates trailing the silhouette.
            // Ghost echo (offset red + cyan copies of a simple silhouette ring)
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.4;
            ctx.strokeStyle = '#ff0044';
            ctx.beginPath(); ctx.arc(-6, 0, r * 0.92, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#00f3ff';
            ctx.beginPath(); ctx.arc(6, 0, r * 0.92, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
            // Glitch bars — occasional horizontal offsets
            if (Math.sin(time * 5) > 0.55) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                const by = -r * 0.3 + Math.sin(time * 7) * r * 0.5;
                ctx.fillRect(-r, by, r * 2, 4);
            }
            // Floating code fragments
            ctx.fillStyle = '#ff3355';
            ctx.font = "bold 10px 'Orbitron', monospace";
            ctx.textAlign = 'center';
            const frags = ['01', '0x', 'FF', '77'];
            for (let i = 0; i < 4; i++) {
                const fa = time * 0.4 + i * (Math.PI / 2);
                const fx = Math.cos(fa) * r * 1.1;
                const fy = Math.sin(fa) * r * 0.9;
                ctx.globalAlpha = 0.6;
                ctx.fillText(frags[i], fx, fy);
            }
            ctx.globalAlpha = 1;
        }

        // Elite halo — applies on top of any sector; marks the enemy as a
        // stronger variant at a glance.
        if (isElite) {
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.65)';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 16;
            ctx.setLineDash([6, 10]);
            ctx.lineDashOffset = -time * 30;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.15, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    },

drawEntity(entity) {
        if (!entity) return;

        const ctx = this.ctx;
        const time = Date.now() / 1000;
        let animX = 0, animY = 0;
        let scale = 1.0; 
        
        if (entity.flashTimer > 0) {
            entity.flashTimer -= 0.05; 
        }
        
        const isSpawning = entity.spawnTimer > 0;

        // --- SPAWN ANIMATION (Opacity Only - No Clip) ---
        if (isSpawning) {
            entity.spawnTimer -= 0.02; 
            ctx.globalAlpha = 1.0 - Math.max(0, entity.spawnTimer);
        }

        // --- ANIMATION HANDLING ---
        if (entity.anim && entity.anim.timer > 0 || entity.anim.type === 'windup') {
            if (entity.anim.type !== 'windup') entity.anim.timer--;
            const t = entity.anim.timer;
            // Normalized progress 0..1 (1 at start, 0 at end). Smoothstep ease for weight.
            const maxT = entity.anim.maxTimer || 15;
            const p = Math.max(0, Math.min(1, t / maxT));
            const eased = p * p * (3 - 2 * p);

            if (entity.anim.type === 'lunge') {
                const dir = (entity instanceof Player || (entity instanceof Minion && entity.isPlayerSide)) ? -1 : 1;
                // Ease-out arc so the attack snaps out then settles.
                animY = Math.sin((1 - eased) * Math.PI) * 46 * dir;
            } else if (entity.anim.type === 'shake') {
                const decay = eased;
                animX = (Math.random() - 0.5) * 22 * decay;
                animY = (Math.random() - 0.5) * 8 * decay;
            } else if (entity.anim.type === 'pulse') {
                scale = 1.0 + Math.sin((1 - p) * Math.PI) * 0.14;
            } else if (entity.anim.type === 'windup') {
                animX = (Math.random() - 0.5) * 6;
                animY = (Math.random() - 0.5) * 6;
                scale = 1.1;
            }
        }
        
        const renderX = entity.x + animX;
        const renderY = entity.y + animY;

        ctx.save(); 
        ctx.translate(renderX, renderY);
        
        // --- SCALE APPLICATION ---
        let finalScale = scale;
        if (entity instanceof Enemy || (entity instanceof Minion && !entity.isPlayerSide)) {
            finalScale *= 1.6; 
        }
        ctx.scale(finalScale, finalScale);

        const sectorPower = Math.min(5, Math.ceil(this.sector / 2)); 
        const baseGlow = 20 + (sectorPower * 5);
        const baseWidth = 3 + sectorPower;

        // --- SHADOW (Ground) ---
        // Only draw shadow for Player to save performance on mobile
        if (entity instanceof Player) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(0, 40, entity.radius, entity.radius/3, 0, 0, Math.PI*2);
            ctx.fill();
        }

        // ============================================================
        // 1. PLAYER CLASSES
        // ============================================================
        if (entity instanceof Player) {
            const color = entity.classColor || COLORS.NATURE_LIGHT;
            ctx.strokeStyle = color;
            ctx.lineWidth = baseWidth;
            ctx.shadowColor = color;
            ctx.shadowBlur = baseGlow;
            ctx.fillStyle = '#050505'; 

            if (entity.classId === 'tactician') {
                // TACTICIAN — Holographic Command Core with orbital drones + radar sweep.
                const R = entity.radius;

                // 1. Holographic ground grid (isometric ellipse rings)
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.18)';
                ctx.lineWidth = 1; ctx.shadowBlur = 0;
                for (let r = 12; r <= R + 22; r += 10) {
                    ctx.beginPath();
                    ctx.ellipse(0, R * 0.55, r * 1.25, r * 0.35, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();

                // 2. Radar sweep wedge
                ctx.save();
                ctx.rotate(time * 1.5);
                const sweepR = R + 30;
                const scanGrad = ctx.createLinearGradient(0, 0, sweepR, 0);
                scanGrad.addColorStop(0, 'rgba(0, 243, 255, 0.45)');
                scanGrad.addColorStop(1, 'rgba(0, 243, 255, 0)');
                ctx.fillStyle = scanGrad;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, sweepR, -0.28, 0.28);
                ctx.closePath(); ctx.fill();
                ctx.restore();

                // 3. Outer hex ring (slow counter-rotation, bright nodes at vertices)
                ctx.save();
                ctx.rotate(-time * 0.3);
                ctx.strokeStyle = color; ctx.lineWidth = 1.5;
                ctx.shadowColor = color; ctx.shadowBlur = 14;
                ctx.beginPath();
                for (let i = 0; i <= 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.lineTo(Math.cos(a) * (R + 12), Math.sin(a) * (R + 12));
                }
                ctx.stroke();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * (R + 12), Math.sin(a) * (R + 12), 3, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                // 4. Main hex body — layered plates with inner hex accent
                ctx.fillStyle = '#050512';
                ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.shadowColor = color; ctx.shadowBlur = baseGlow;
                this.drawPolygon(ctx, 0, 0, R, 6, time * 0.4);
                ctx.save();
                ctx.rotate(time * 0.4);
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)'; ctx.lineWidth = 1;
                ctx.shadowBlur = 4;
                // Inner hex outline
                ctx.beginPath();
                for (let i = 0; i <= 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.lineTo(Math.cos(a) * R * 0.65, Math.sin(a) * R * 0.65);
                }
                ctx.stroke();
                // Radial spokes
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * R * 0.65, Math.sin(a) * R * 0.65);
                    ctx.lineTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
                    ctx.stroke();
                }
                ctx.restore();

                // 5. Central command eye (iris with concentric rings + pulsing pupil)
                ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
                ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
                for (let r = 4; r <= 13; r += 4) {
                    ctx.strokeStyle = `rgba(0, 243, 255, ${0.35 + (14 - r) * 0.03})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
                }
                const pupil = 3 + Math.sin(time * 3) * 1.2;
                ctx.fillStyle = '#fff';
                ctx.shadowColor = color; ctx.shadowBlur = 22;
                ctx.beginPath(); ctx.arc(0, 0, pupil, 0, Math.PI * 2); ctx.fill();

                // 6. Three drone satellites on tilted 3D orbit with data tether
                for (let i = 0; i < 3; i++) {
                    const a = time * 1.1 + i * (Math.PI * 2 / 3);
                    const orbitR = R + 34;
                    const tilt = 0.45;
                    const sx = Math.cos(a) * orbitR;
                    const sy = Math.sin(a) * orbitR * tilt;
                    const depthZ = Math.sin(a);
                    const scale = 0.7 + 0.35 * depthZ;

                    // Data tether (wavy line)
                    ctx.save();
                    ctx.strokeStyle = `rgba(0, 243, 255, ${0.15 + Math.max(0, depthZ) * 0.15})`;
                    ctx.lineWidth = 1; ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.moveTo(0, 0);
                    for (let t = 0.15; t <= 1; t += 0.12) {
                        const wig = 3 * (1 - t);
                        ctx.lineTo(sx * t + Math.sin(time * 7 + i + t * 12) * wig,
                                   sy * t + Math.cos(time * 7 + i + t * 12) * wig);
                    }
                    ctx.stroke();
                    ctx.restore();

                    // Drone body
                    ctx.save(); ctx.translate(sx, sy); ctx.scale(scale, scale); ctx.rotate(a + Math.PI / 2);
                    ctx.fillStyle = '#050512'; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
                    ctx.shadowColor = color; ctx.shadowBlur = 12;
                    ctx.beginPath();
                    ctx.moveTo(0, -9); ctx.lineTo(6, -2); ctx.lineTo(4, 7); ctx.lineTo(-4, 7); ctx.lineTo(-6, -2); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    // Wings
                    ctx.beginPath();
                    ctx.moveTo(-6, -2); ctx.lineTo(-13, 2);
                    ctx.moveTo(6, -2); ctx.lineTo(13, 2); ctx.stroke();
                    // Blink
                    const blink = (Math.sin(time * 5 + i * 1.3) > 0.4) ? 1 : 0.25;
                    ctx.fillStyle = color; ctx.globalAlpha = blink;
                    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }

                // 7. Target-lock reticle towards enemy
                if (this.enemy) {
                    const dx = this.enemy.x - entity.x, dy = this.enemy.y - entity.y;
                    const ang = Math.atan2(dy, dx);
                    ctx.save();
                    ctx.rotate(ang);
                    const lock = 0.55 + 0.45 * Math.sin(time * 6);
                    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = lock;
                    ctx.shadowColor = color; ctx.shadowBlur = 10;
                    const rx = R + 24;
                    ctx.beginPath();
                    ctx.moveTo(rx, -9); ctx.lineTo(rx - 4, -9); ctx.lineTo(rx - 4, 9); ctx.lineTo(rx, 9);
                    ctx.moveTo(rx + 14, -9); ctx.lineTo(rx + 18, -9); ctx.lineTo(rx + 18, 9); ctx.lineTo(rx + 14, 9);
                    ctx.moveTo(rx, 0); ctx.lineTo(rx + 18, 0);
                    ctx.stroke();
                    ctx.restore();
                }

                // 8. Rising data-stream particles
                for (let i = 0; i < 6; i++) {
                    const t = (time * 0.6 + i * 0.17) % 1;
                    const py = R - 6 - t * (R + 28);
                    const px = Math.sin(time * 1.5 + i * 2) * R * 0.6 * (1 - t * 0.4);
                    ctx.fillStyle = `rgba(0, 243, 255, ${(1 - t) * 0.75})`;
                    ctx.shadowColor = color; ctx.shadowBlur = 6;
                    ctx.beginPath(); ctx.arc(px, py, 1.8 * (1 - t * 0.6), 0, Math.PI * 2); ctx.fill();
                }
            }
            else if (entity.classId === 'bloodstalker') {
                // BLOOD STALKER — Vampiric predator with bat wings, pulsing heart, blood drip.
                const R = entity.radius;
                const hpRatio = entity.currentHp / Math.max(1, entity.maxHp);
                const urgency = 1 + (1 - hpRatio) * 1.5;
                const heartbeat = Math.sin(time * 4 * urgency);

                // 1. Blood-red fog aura
                const auraGrad = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R + 30);
                auraGrad.addColorStop(0, 'rgba(255, 30, 60, 0.22)');
                auraGrad.addColorStop(0.6, 'rgba(120, 0, 20, 0.12)');
                auraGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = auraGrad;
                ctx.beginPath(); ctx.arc(0, 0, R + 30, 0, Math.PI * 2); ctx.fill();

                // 2. Twin bat wings (behind body, bezier-curved membranes)
                ctx.save();
                ctx.fillStyle = 'rgba(40, 0, 15, 0.85)';
                ctx.strokeStyle = '#aa0022'; ctx.lineWidth = 2;
                ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 14;
                const wingFlap = Math.sin(time * 2.5) * 0.15;
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.rotate(side * wingFlap);
                    ctx.beginPath();
                    ctx.moveTo(side * 6, -2);
                    ctx.bezierCurveTo(side * (R + 20), -R * 0.6, side * (R + 38), -R * 0.1, side * (R + 30), R * 0.35);
                    ctx.bezierCurveTo(side * (R + 8), R * 0.15, side * (R + 14), R * 0.05, side * (R + 4), R * 0.3);
                    ctx.bezierCurveTo(side * (R - 2), R * 0.05, side * (R - 4), -R * 0.05, side * 6, 2);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    // Wing bones (radial lines from shoulder to tips)
                    ctx.strokeStyle = 'rgba(180, 20, 40, 0.55)'; ctx.lineWidth = 1; ctx.shadowBlur = 4;
                    for (const bone of [[side * (R + 32), -R * 0.4], [side * (R + 34), 0], [side * (R + 26), R * 0.3]]) {
                        ctx.beginPath(); ctx.moveTo(side * 4, 0); ctx.lineTo(bone[0], bone[1]); ctx.stroke();
                    }
                    ctx.restore();
                }
                ctx.restore();

                // 3. Dripping blood particles from wing tips & body
                for (let i = 0; i < 6; i++) {
                    const tFall = (time * 0.8 + i * 0.17) % 1;
                    const seedX = [-R - 18, R + 18, -R * 0.6, R * 0.6, -R * 0.3, R * 0.3][i];
                    const dy = R * 0.3 + tFall * (R + 24);
                    const alpha = 1 - tFall;
                    ctx.fillStyle = `rgba(200, 20, 40, ${alpha})`;
                    ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.ellipse(seedX + Math.sin(time * 3 + i) * 1.5, dy, 2, 3 + tFall * 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 4. Body — dark obsidian spiked core
                const bodyPulse = R - 6 + heartbeat * 3;
                ctx.fillStyle = '#120306';
                ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 16 + (1 - hpRatio) * 10;
                this.drawSpikedCircle(ctx, 0, 0, bodyPulse, 10, 14, time * 0.8);

                // 5. Carved rune tracery on the body
                ctx.save();
                ctx.strokeStyle = `rgba(255, 40, 80, ${0.5 + heartbeat * 0.3})`;
                ctx.lineWidth = 1.3; ctx.shadowBlur = 6;
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + time * 0.3;
                    const r1 = R * 0.45, r2 = R * 0.7;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
                    ctx.lineTo(Math.cos(a + 0.2) * r2, Math.sin(a + 0.2) * r2);
                    ctx.lineTo(Math.cos(a - 0.2) * r2, Math.sin(a - 0.2) * r2);
                    ctx.stroke();
                }
                ctx.restore();

                // 6. Claws — always visible, elongate on lunge
                let clawExt = 10;
                if (entity.anim && entity.anim.type === 'lunge') {
                    const p = entity.anim.timer / (entity.anim.maxTimer || 15);
                    clawExt += Math.sin((1 - p) * Math.PI) * 22;
                }
                ctx.save();
                ctx.strokeStyle = '#ff3355'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 12;
                for (const dir of [-1, 1]) {
                    const baseX = dir * R * 0.35, baseY = -R * 0.85;
                    ctx.beginPath();
                    ctx.moveTo(baseX, baseY);
                    ctx.quadraticCurveTo(dir * (R * 0.55 + clawExt * 0.3), baseY - 4, dir * (R * 0.5 + clawExt * 0.6), baseY - clawExt);
                    ctx.stroke();
                }
                ctx.restore();
                ctx.lineCap = 'butt';

                // 7. Pulsing heart core (beats visibly)
                const beat = 1 + Math.max(0, heartbeat) * 0.25;
                ctx.save();
                ctx.scale(beat, beat);
                const heartGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, R * 0.4);
                heartGrad.addColorStop(0, '#ff6080');
                heartGrad.addColorStop(0.55, '#aa0022');
                heartGrad.addColorStop(1, '#220005');
                ctx.fillStyle = heartGrad;
                ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 20 + heartbeat * 10;
                ctx.beginPath(); ctx.arc(0, 0, R * 0.36, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 8. Twin vampire eyes
                ctx.fillStyle = hpRatio < 0.4 ? '#ff88aa' : '#ff2244';
                ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 16;
                ctx.beginPath(); ctx.arc(-5, -2, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(5, -2, 2.5, 0, Math.PI * 2); ctx.fill();
                // Glint
                ctx.fillStyle = '#fff'; ctx.shadowBlur = 4;
                ctx.beginPath(); ctx.arc(-5.5, -2.5, 0.8, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(4.5, -2.5, 0.8, 0, Math.PI * 2); ctx.fill();
            }
            else if (entity.classId === 'arcanist') {
                // ARCANIST — High-sorcerer: nested sacred geometry sigil, floating crystal orb,
                // ribboned rune tablets, chained lightning, starfield backdrop, all-seeing eye.
                const R = entity.radius;
                const PURPLE = COLORS.PURPLE;
                const LILAC = '#e0b0ff';

                // 1. Twinkling starfield backdrop (deterministic seeds so they don't flicker chaotically)
                ctx.save();
                ctx.shadowBlur = 0;
                for (let i = 0; i < 22; i++) {
                    const seed = i * 73.91;
                    const a = seed * 1.17 + time * 0.08;
                    const r = 20 + (seed % (R + 34));
                    const tw = 0.4 + 0.6 * Math.sin(time * 2 + seed);
                    const sx = Math.cos(a) * r, sy = Math.sin(a) * r * 0.85;
                    const sz = 0.7 + (seed % 1.4);
                    ctx.fillStyle = i % 4 === 0 ? `rgba(255, 255, 255, ${tw * 0.85})` : `rgba(220, 170, 255, ${tw * 0.7})`;
                    ctx.beginPath(); ctx.arc(sx, sy, sz, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();

                // 2. Clean summoning disc — single soft-radial halo (flat, no hard lines)
                ctx.save();
                ctx.translate(0, R * 0.55);
                const discGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, (R + 28) * 1.3);
                discGrad.addColorStop(0, 'rgba(188, 19, 254, 0.35)');
                discGrad.addColorStop(0.5, 'rgba(188, 19, 254, 0.12)');
                discGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = discGrad;
                ctx.beginPath();
                ctx.ellipse(0, 0, (R + 30) * 1.3, (R + 30) * 0.36, 0, 0, Math.PI * 2);
                ctx.fill();
                // One slim rotating rune ring — deterministic, no jitter
                ctx.save();
                ctx.rotate(time * 0.12);
                ctx.strokeStyle = 'rgba(224, 176, 255, 0.45)';
                ctx.lineWidth = 1;
                ctx.shadowColor = PURPLE; ctx.shadowBlur = 6;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.ellipse(0, 0, (R + 18) * 1.3, (R + 18) * 0.36, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
                ctx.restore();

                // 3. Outer arcane aura (pulses with breath)
                const breath = 1 + Math.sin(time * 1.5) * 0.08;
                const auraR = (R + 18) * breath;
                const aura = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, auraR);
                aura.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
                aura.addColorStop(0.4, 'rgba(224, 176, 255, 0.28)');
                aura.addColorStop(0.8, 'rgba(188, 19, 254, 0.22)');
                aura.addColorStop(1, 'transparent');
                ctx.fillStyle = aura;
                ctx.beginPath(); ctx.arc(0, 0, auraR, 0, Math.PI * 2); ctx.fill();

                // 4. Runic band — a ring of floating glyphs (8 symbols) slowly rotating
                ctx.save();
                ctx.rotate(time * 0.22);
                const bandR = R + 8;
                ctx.shadowColor = LILAC; ctx.shadowBlur = 4;
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    const gx = Math.cos(a) * bandR, gy = Math.sin(a) * bandR;
                    ctx.save(); ctx.translate(gx, gy); ctx.rotate(a + Math.PI / 2);
                    const alpha = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.9);
                    ctx.strokeStyle = `rgba(220, 170, 255, ${alpha})`;
                    ctx.lineWidth = 1;
                    // Assorted tiny glyphs
                    ctx.beginPath();
                    const g = i % 4;
                    if (g === 0) { ctx.moveTo(-3, -3); ctx.lineTo(3, 0); ctx.lineTo(-3, 3); }
                    else if (g === 1) { ctx.moveTo(-3, -3); ctx.lineTo(3, 3); ctx.moveTo(3, -3); ctx.lineTo(-3, 3); }
                    else if (g === 2) { ctx.arc(0, 0, 3, 0, Math.PI * 1.5); }
                    else { ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); }
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // 5. Rhombus body — three nested, each at a different rotation / style
                ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.shadowColor = color; ctx.shadowBlur = baseGlow;
                this.drawPolygon(ctx, 0, 0, R, 4, time * 0.3);
                ctx.save();
                ctx.strokeStyle = LILAC; ctx.lineWidth = 1.5; ctx.shadowBlur = 8;
                this.drawPolygon(ctx, 0, 0, R * 0.78, 4, -time * 0.4);
                ctx.setLineDash([3, 4]);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'; ctx.lineWidth = 1;
                this.drawPolygon(ctx, 0, 0, R * 0.55, 4, time * 0.55);
                ctx.setLineDash([]);
                ctx.restore();

                // 6. Chained lightning weave — connects each tablet to the next around the ring
                const TABLETS = 6;
                const tabletPositions = [];
                for (let i = 0; i < TABLETS; i++) {
                    const a = time * 0.7 + i * (Math.PI * 2 / TABLETS);
                    // Alternate orbit radius to create depth layering
                    const orbitR = R + 30 + (i % 2 === 0 ? 0 : 10);
                    tabletPositions.push({
                        x: Math.cos(a) * orbitR,
                        y: Math.sin(a) * orbitR * 0.55,
                        a,
                        depth: Math.sin(a),
                        flip: Math.cos(time * 2 + i * 0.9),
                    });
                }
                // Smooth, deterministic connection between adjacent tablets — fades
                // toward the bottom so the floor-orbit doesn't muddle the silhouette.
                ctx.save();
                ctx.lineWidth = 1;
                ctx.shadowColor = color; ctx.shadowBlur = 4;
                for (let i = 0; i < TABLETS; i++) {
                    const p = tabletPositions[i], q = tabletPositions[(i + 1) % TABLETS];
                    // Fade arcs whose midpoint is below the body (keeps the bottom tidy)
                    const midY = (p.y + q.y) / 2;
                    const alpha = midY > R * 0.3 ? 0.08 : 0.45;
                    ctx.strokeStyle = `rgba(220, 170, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.stroke();
                }
                ctx.restore();

                // 7. Aetheric ribbon trails (behind each tablet)
                ctx.save();
                ctx.lineWidth = 2;
                for (let i = 0; i < TABLETS; i++) {
                    const p = tabletPositions[i];
                    const trailSegs = 8;
                    for (let s = 1; s <= trailSegs; s++) {
                        const lag = 0.18 * s;
                        const a = p.a - lag;
                        const orbitR = R + 30 + (i % 2 === 0 ? 0 : 10);
                        const tx = Math.cos(a) * orbitR;
                        const ty = Math.sin(a) * orbitR * 0.55;
                        const alpha = (1 - s / trailSegs) * 0.32;
                        ctx.fillStyle = `rgba(188, 19, 254, ${alpha})`;
                        ctx.shadowColor = color; ctx.shadowBlur = 6;
                        ctx.beginPath(); ctx.arc(tx, ty, 2.5 * (1 - s / trailSegs), 0, Math.PI * 2); ctx.fill();
                    }
                }
                ctx.restore();

                // 8. Core → tablet link (dotted line, upper tablets only, no jagged randomness)
                ctx.save();
                ctx.strokeStyle = 'rgba(224, 176, 255, 0.28)';
                ctx.lineWidth = 0.7; ctx.setLineDash([2, 3]); ctx.shadowBlur = 0;
                for (let i = 0; i < TABLETS; i++) {
                    const p = tabletPositions[i];
                    // Only draw links for tablets above the body center — keeps the bottom clean
                    if (p.y > R * 0.2) continue;
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.x, p.y); ctx.stroke();
                }
                ctx.setLineDash([]);
                ctx.restore();

                // 9. Six levitating rune tablets (flip-rotate for 3D feel, depth scale)
                for (let i = 0; i < TABLETS; i++) {
                    const p = tabletPositions[i];
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.scale(Math.max(0.15, Math.abs(p.flip)), 0.9 + p.depth * 0.18);
                    // Tablet crystal
                    const tabGrad = ctx.createLinearGradient(0, -18, 0, 18);
                    tabGrad.addColorStop(0, '#24093a');
                    tabGrad.addColorStop(1, '#0a0214');
                    ctx.fillStyle = tabGrad; ctx.strokeStyle = PURPLE; ctx.lineWidth = 2;
                    ctx.shadowColor = PURPLE; ctx.shadowBlur = 14;
                    ctx.beginPath();
                    ctx.moveTo(-10, -15); ctx.lineTo(10, -15); ctx.lineTo(13, 0);
                    ctx.lineTo(10, 15); ctx.lineTo(-10, 15); ctx.lineTo(-13, 0);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    // Inner frame
                    ctx.strokeStyle = 'rgba(224, 176, 255, 0.5)'; ctx.lineWidth = 0.8; ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.moveTo(-7, -11); ctx.lineTo(7, -11); ctx.lineTo(9, 0);
                    ctx.lineTo(7, 11); ctx.lineTo(-7, 11); ctx.lineTo(-9, 0);
                    ctx.closePath(); ctx.stroke();
                    // Unique rune glyph per tablet
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 5;
                    ctx.beginPath();
                    const g = i % 6;
                    if (g === 0) { ctx.moveTo(-5, -7); ctx.lineTo(5, -7); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.moveTo(-3, 4); ctx.lineTo(3, 4); }
                    else if (g === 1) { ctx.moveTo(-5, -7); ctx.lineTo(5, 7); ctx.moveTo(5, -7); ctx.lineTo(-5, 7); }
                    else if (g === 2) { ctx.arc(0, 0, 5, 0, Math.PI * 1.6); ctx.moveTo(5, -5); ctx.lineTo(5, 5); }
                    else if (g === 3) { ctx.moveTo(-5, 0); ctx.lineTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.closePath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); }
                    else if (g === 4) { ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.moveTo(-5, 5); ctx.lineTo(5, -5); }
                    else { ctx.moveTo(-5, -5); ctx.lineTo(-5, 5); ctx.moveTo(5, -5); ctx.lineTo(5, 5); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); }
                    ctx.stroke();
                    ctx.restore();
                }

                // 10. Floating crystal orb HOVERING above the body (bobs gently)
                const orbY = -R * 0.55 + Math.sin(time * 1.5) * 4;
                ctx.save();
                ctx.translate(0, orbY);
                // Orb halo
                const orbHalo = ctx.createRadialGradient(0, 0, 4, 0, 0, 22);
                orbHalo.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
                orbHalo.addColorStop(0.5, 'rgba(224, 176, 255, 0.4)');
                orbHalo.addColorStop(1, 'transparent');
                ctx.fillStyle = orbHalo;
                ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
                // Orb body (radial gradient glass)
                const orbGrad = ctx.createRadialGradient(-3, -4, 1, 0, 0, 10);
                orbGrad.addColorStop(0, '#fff');
                orbGrad.addColorStop(0.4, '#e0b0ff');
                orbGrad.addColorStop(0.85, 'rgba(76, 19, 136, 0.9)');
                orbGrad.addColorStop(1, 'rgba(20, 5, 40, 0.9)');
                ctx.fillStyle = orbGrad;
                ctx.shadowColor = PURPLE; ctx.shadowBlur = 18;
                ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
                // Swirling cloud inside orb
                ctx.save();
                ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.clip();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
                for (let s = 0; s < 3; s++) {
                    ctx.beginPath();
                    const rot = time * 2 + s * Math.PI * 0.5;
                    for (let k = 0; k <= 18; k++) {
                        const tt = k / 18;
                        const spiralA = rot + tt * Math.PI * 3;
                        const spiralR = tt * 8;
                        ctx.lineTo(Math.cos(spiralA) * spiralR, Math.sin(spiralA) * spiralR);
                    }
                    ctx.stroke();
                }
                ctx.restore();
                // Specular highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'; ctx.shadowBlur = 0;
                ctx.beginPath(); ctx.arc(-3, -4, 2.2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 11. All-seeing arcane eye — concentric iris + lash-like spokes
                ctx.save();
                ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
                ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
                // Iris rings
                for (let r = 4; r <= 13; r += 3) {
                    ctx.strokeStyle = `rgba(224, 176, 255, ${0.5 - (r - 4) * 0.04})`;
                    ctx.lineWidth = 0.8;
                    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
                }
                // Iris spokes (rotating)
                ctx.save();
                ctx.rotate(time * 1.5);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; ctx.lineWidth = 0.5;
                for (let i = 0; i < 12; i++) {
                    const a = i * Math.PI / 6;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
                    ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
                    ctx.stroke();
                }
                ctx.restore();
                // Pupil (pulsing)
                const pupil = 3 + Math.sin(time * 3) * 1.2;
                const pupilGrad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, pupil + 3);
                pupilGrad.addColorStop(0, '#fff');
                pupilGrad.addColorStop(0.5, LILAC);
                pupilGrad.addColorStop(1, 'rgba(188, 19, 254, 0)');
                ctx.fillStyle = pupilGrad;
                ctx.shadowColor = color; ctx.shadowBlur = 22;
                ctx.beginPath(); ctx.arc(0, 0, pupil + 3, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 12. Rising crystalline shards (replace generic motes)
                for (let i = 0; i < 6; i++) {
                    const t = (time * 0.4 + i * 0.167) % 1;
                    const px = Math.sin(time * 1.2 + i * 1.3) * R * 0.65 * (1 - t * 0.25);
                    const py = R * 0.5 - t * (R + 30);
                    const rot = time * 2 + i;
                    const alpha = (1 - t) * 0.85;
                    ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
                    ctx.fillStyle = `rgba(224, 176, 255, ${alpha})`;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.lineWidth = 0.6;
                    ctx.shadowColor = color; ctx.shadowBlur = 6;
                    const sz = 2 + (1 - t) * 1.5;
                    ctx.beginPath();
                    ctx.moveTo(0, -sz * 1.4); ctx.lineTo(sz, 0); ctx.lineTo(0, sz * 1.4); ctx.lineTo(-sz, 0); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    ctx.restore();
                }

                // 13. Occasional arcane spark emission (links with ParticleSys if available)
                if (Math.random() < 0.35) {
                    const sa = Math.random() * Math.PI * 2;
                    const sr = R * 0.7 + Math.random() * 10;
                    ParticleSys.createTrail(entity.x + Math.cos(sa) * sr, entity.y + Math.sin(sa) * sr, LILAC, 0.35);
                }
            }
            else if (entity.classId === 'sentinel') {
                // SENTINEL — Guardian with four orbiting shield panels, layered aegis rings.
                const R = entity.radius;
                const shieldLit = entity.shield > 0 ? 1 : 0.55;

                // 1. Layered hex aegis rings (multiple concentric rotating hexagons)
                ctx.save();
                for (let layer = 0; layer < 3; layer++) {
                    ctx.save();
                    ctx.rotate(time * 0.25 * (layer % 2 === 0 ? 1 : -1));
                    const rr = R + 14 + layer * 10;
                    ctx.strokeStyle = `rgba(0, 243, 255, ${0.35 - layer * 0.08})`;
                    ctx.lineWidth = 1.5 - layer * 0.3;
                    ctx.shadowColor = COLORS.SHIELD; ctx.shadowBlur = 6;
                    ctx.beginPath();
                    for (let i = 0; i <= 6; i++) {
                        const a = i * Math.PI / 3;
                        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                    }
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // 2. Aegis bubble (soft shield dome)
                const bubbleGrad = ctx.createRadialGradient(0, -R * 0.3, R * 0.3, 0, 0, R + 18);
                bubbleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
                bubbleGrad.addColorStop(0.55, 'rgba(0, 243, 255, 0.15)');
                bubbleGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = bubbleGrad;
                ctx.beginPath(); ctx.arc(0, 0, R + 18, 0, Math.PI * 2); ctx.fill();

                // 3. Four orbital shield panels (rotating around)
                const panelBaseAngle = time * 0.7;
                for (let i = 0; i < 4; i++) {
                    const a = panelBaseAngle + (i * Math.PI / 2);
                    const pr = R + 8;
                    const px = Math.cos(a) * pr;
                    const py = Math.sin(a) * pr;
                    ctx.save();
                    ctx.translate(px, py);
                    ctx.rotate(a + Math.PI / 2);
                    ctx.fillStyle = '#071620'; ctx.strokeStyle = color; ctx.lineWidth = 2;
                    ctx.shadowColor = color; ctx.shadowBlur = 14 * shieldLit;
                    // Shield panel shape (crest)
                    ctx.beginPath();
                    ctx.moveTo(-10, -12); ctx.lineTo(10, -12);
                    ctx.lineTo(13, 0); ctx.lineTo(10, 12);
                    ctx.lineTo(-10, 12); ctx.lineTo(-13, 0); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    // Inner accent
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 1; ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.moveTo(-6, -7); ctx.lineTo(6, -7); ctx.moveTo(0, -7); ctx.lineTo(0, 7);
                    ctx.stroke();
                    ctx.restore();
                }

                // 4. Central armored body — angular knight shield shape
                ctx.fillStyle = '#0a1820'; ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.shadowColor = color; ctx.shadowBlur = baseGlow;
                ctx.beginPath();
                // Hexagonal armor
                for (let i = 0; i < 6; i++) {
                    const a = -Math.PI / 2 + i * Math.PI / 3;
                    ctx.lineTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();

                // 5. Reinforced rivets on armor edges
                ctx.save();
                ctx.fillStyle = color; ctx.shadowBlur = 6;
                for (let i = 0; i < 6; i++) {
                    const a = -Math.PI / 2 + i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.arc(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();

                // 6. Engraved aegis glyph — four-point diamond in center
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.lineWidth = 2;
                ctx.shadowColor = color; ctx.shadowBlur = 10;
                ctx.rotate(time * 0.2);
                ctx.beginPath();
                ctx.moveTo(0, -R * 0.45); ctx.lineTo(R * 0.3, 0);
                ctx.lineTo(0, R * 0.45); ctx.lineTo(-R * 0.3, 0); ctx.closePath();
                ctx.stroke();
                // Cross inside diamond
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(0, -R * 0.25); ctx.lineTo(0, R * 0.25);
                ctx.moveTo(-R * 0.15, 0); ctx.lineTo(R * 0.15, 0);
                ctx.stroke();
                ctx.restore();

                // 7. Corner bracket HUD (emphasizes when shielded)
                ctx.save();
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.globalAlpha = shieldLit;
                ctx.shadowColor = COLORS.SHIELD; ctx.shadowBlur = entity.shield > 0 ? 22 : 8;
                const corners = R + 4, len = 12;
                ctx.beginPath();
                ctx.moveTo(-corners, -corners + len); ctx.lineTo(-corners, -corners); ctx.lineTo(-corners + len, -corners);
                ctx.moveTo(corners - len, -corners); ctx.lineTo(corners, -corners); ctx.lineTo(corners, -corners + len);
                ctx.moveTo(corners, corners - len); ctx.lineTo(corners, corners); ctx.lineTo(corners - len, corners);
                ctx.moveTo(-corners + len, corners); ctx.lineTo(-corners, corners); ctx.lineTo(-corners, corners - len);
                ctx.stroke();
                ctx.restore();

                // 8. Deploying plates (on lunge)
                const isAttacking = entity.anim && entity.anim.type === 'lunge';
                const deploy = isAttacking ? Math.sin((1 - (entity.anim.timer / (entity.anim.maxTimer || 15))) * Math.PI) : 0;
                if (deploy > 0) {
                    ctx.save();
                    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 12;
                    for (let i = 0; i < 4; i++) {
                        ctx.save();
                        ctx.rotate(i * Math.PI / 2);
                        const out = deploy * 16;
                        ctx.beginPath();
                        ctx.moveTo(-14, -R - 6 - out); ctx.lineTo(14, -R - 6 - out);
                        ctx.lineTo(10, -R - 14 - out); ctx.lineTo(-10, -R - 14 - out); ctx.closePath();
                        ctx.fillStyle = '#0a1a22'; ctx.fill(); ctx.stroke();
                        ctx.restore();
                    }
                    ctx.restore();
                }

                // 9. Shield sparks (tiny motes circling)
                if (entity.shield > 0) {
                    for (let i = 0; i < 5; i++) {
                        const a = time * 2 + i * (Math.PI * 2 / 5);
                        const r = R + 22 + Math.sin(time * 4 + i) * 3;
                        ctx.fillStyle = '#fff'; ctx.shadowColor = color; ctx.shadowBlur = 8;
                        ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 1.5, 0, Math.PI * 2); ctx.fill();
                    }
                }
            }
            else if (entity.classId === 'annihilator') {
                // ANNIHILATOR — Meltdown reactor: plasma core, jagged blast shell, ember storm.
                const R = entity.radius;

                // 1. Outer heat-haze rings (wavy pulse)
                ctx.save();
                for (let i = 0; i < 4; i++) {
                    const wobble = Math.sin(time * (3 + i * 0.5)) * 3;
                    const rr = R + 18 + i * 8;
                    ctx.strokeStyle = `rgba(255, 120, 0, ${0.28 - i * 0.06})`;
                    ctx.lineWidth = 1 + Math.sin(time * 2 + i) * 0.5;
                    ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10;
                    ctx.beginPath(); ctx.arc(wobble, -wobble, rr, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();

                // 2. Ember / spark storm radiating outward
                for (let i = 0; i < 14; i++) {
                    const seed = i * 37.1;
                    const t = (time * 0.85 + seed * 0.1) % 1;
                    const a = seed * 2.3 + time * 0.4;
                    const r = R + 4 + t * 32;
                    const px = Math.cos(a) * r, py = Math.sin(a) * r;
                    const hue = ['#ffaa33', '#ff6600', '#ffcc66'][i % 3];
                    ctx.fillStyle = hue;
                    ctx.globalAlpha = (1 - t) * 0.95;
                    ctx.shadowColor = hue; ctx.shadowBlur = 8;
                    ctx.beginPath(); ctx.arc(px, py, 1.6 * (1 - t * 0.6), 0, Math.PI * 2); ctx.fill();
                }
                ctx.globalAlpha = 1;

                // 3. Orbital chain-link fragments
                ctx.save();
                for (let i = 0; i < 6; i++) {
                    const a = time * 1.1 + i * (Math.PI / 3);
                    const rr = R + 26;
                    const cx = Math.cos(a) * rr, cy = Math.sin(a) * rr;
                    ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
                    ctx.strokeStyle = '#ff6a00'; ctx.lineWidth = 2;
                    ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(-4, 0); ctx.lineTo(-2, -3); ctx.lineTo(2, -3); ctx.lineTo(4, 0); ctx.lineTo(2, 3); ctx.lineTo(-2, 3); ctx.closePath();
                    ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // 4. Jagged blast shell (8-point star silhouette)
                ctx.save();
                ctx.rotate(time * 0.4);
                ctx.fillStyle = '#120700'; ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.shadowColor = color; ctx.shadowBlur = baseGlow;
                ctx.beginPath();
                const points = 8;
                for (let i = 0; i < points * 2; i++) {
                    const a = i * Math.PI / points;
                    const rr = (i % 2 === 0) ? R : R * 0.55;
                    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();

                // 5. Inner fracture cracks (seam lines leaking heat)
                ctx.save();
                ctx.strokeStyle = '#ffaa33'; ctx.lineWidth = 1.5;
                ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 12;
                ctx.globalAlpha = 0.75 + Math.sin(time * 6) * 0.25;
                ctx.beginPath();
                ctx.moveTo(-R * 0.55, -R * 0.15); ctx.lineTo(-R * 0.2, 0); ctx.lineTo(-R * 0.3, R * 0.35);
                ctx.moveTo(R * 0.45, -R * 0.35); ctx.lineTo(R * 0.15, -R * 0.05); ctx.lineTo(R * 0.4, R * 0.25);
                ctx.moveTo(-R * 0.1, -R * 0.6); ctx.lineTo(R * 0.05, -R * 0.25); ctx.lineTo(-R * 0.05, R * 0.3);
                ctx.stroke();
                ctx.restore();

                // 6. Inner spinning triangle (reactor containment)
                ctx.save();
                ctx.strokeStyle = '#ff4400'; ctx.lineWidth = 2;
                ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 14;
                this.drawPolygon(ctx, 0, 0, R * 0.45, 3, -time * 5);
                ctx.rotate(time * 3);
                ctx.strokeStyle = 'rgba(255, 170, 50, 0.7)';
                this.drawPolygon(ctx, 0, 0, R * 0.32, 3, 0);
                ctx.restore();

                // 7. Plasma fusion core (radial gradient, pulsing)
                const coreBeat = 1 + Math.sin(time * 10) * 0.15;
                const coreR = 12 * coreBeat;
                const coreGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, coreR + 8);
                coreGrad.addColorStop(0, '#fff4c0');
                coreGrad.addColorStop(0.35, '#ffb433');
                coreGrad.addColorStop(0.75, '#ff5a00');
                coreGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = coreGrad;
                ctx.shadowColor = '#ffaa33'; ctx.shadowBlur = 30;
                ctx.beginPath(); ctx.arc(0, 0, coreR + 8, 0, Math.PI * 2); ctx.fill();

                // 8. Rising flame puffs (smoke)
                ctx.save();
                for (let i = 0; i < 4; i++) {
                    const t = (time * 0.9 + i * 0.25) % 1;
                    const y = R * 0.3 - t * (R + 20);
                    const sz = 4 + t * 12;
                    const x = Math.sin(time * 1.3 + i * 2) * 8 + (i - 1.5) * 8;
                    const hue = `rgba(255, ${Math.floor(120 + t * 60)}, 0, ${(1 - t) * 0.55})`;
                    ctx.fillStyle = hue;
                    ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 8;
                    ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();

                // 9. Overheat sparks flying off on each frame (classic firework)
                ctx.save();
                ctx.shadowBlur = 0;
                for (let i = 0; i < 3; i++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = R * 0.5 + Math.random() * R * 0.4;
                    ctx.fillStyle = '#ffdd66';
                    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 0.8, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
            else {
                // SUMMONER — ANGELIC WISP (refined). Deep-emerald floating
                // spirit: luminous orb core, two detailed light-feather wings
                // that flap, tilted halo, small companion motes, and a subtle
                // cloud of particles. No humanoid shape, no ground shadow, no
                // trailing tail — every accent is either a soft gradient or a
                // thin alpha-tapered stroke. Designed to be cheap: shared
                // shadow state per layer, no additive compositing, bounded
                // gradient count (~6 per frame).
                const R = entity.radius;
                const NATURE = '#00ff99';

                // 1. Deep emerald aura — breathing radial halo.
                ctx.save();
                const auraR = R * 2.0;
                const aura = ctx.createRadialGradient(0, 0, R * 0.25, 0, 0, auraR);
                const breath = 0.28 + Math.sin(time * 1.0) * 0.1;
                aura.addColorStop(0, `rgba(180, 255, 210, ${breath * 0.7})`);
                aura.addColorStop(0.3, `rgba(30, 200, 120, ${breath * 0.55})`);
                aura.addColorStop(0.7, `rgba(10, 110, 70, ${breath * 0.28})`);
                aura.addColorStop(1, 'rgba(0, 30, 15, 0)');
                ctx.fillStyle = aura;
                ctx.beginPath(); ctx.arc(0, 0, auraR, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 2. Angelic feather wings — the centerpiece. Each wing is a
                //    collection of 7 elongated leaf-shaped feathers fanning
                //    outward and upward from the body. Each feather is a
                //    quadratic-bezier teardrop with a translucent green fill
                //    and a thin bright spine down the middle. The whole wing
                //    flaps via a sine rotation + slight spread scale so the
                //    fan opens and closes gently.
                //
                //    Feathers share shadow state (set once before the loop)
                //    and there are no per-feather gradients — each wing only
                //    costs ~7 fills + 7 spine strokes = ~14 paths per side.
                ctx.save();
                ctx.lineCap = 'round';
                ctx.shadowColor = NATURE; ctx.shadowBlur = 6;
                const flap = Math.sin(time * 2.4);                    // -1..1 (slightly faster cycle)
                const flapRot = flap * 0.22;                           // ~2× previous — wings visibly beat
                const flapSpread = 1.0 + flap * 0.18;                  // ~2× previous — fan opens/closes noticeably
                const FEATHERS = 7;
                for (const side of [-1, 1]) {
                    ctx.save();
                    ctx.scale(side, 1);
                    // Anchor the wing just behind the shoulder of the core
                    ctx.translate(R * 0.08, -R * 0.05);
                    ctx.rotate(-0.45 + flapRot * side);
                    for (let k = 0; k < FEATHERS; k++) {
                        const t = k / (FEATHERS - 1);
                        // Spread feathers in a fan: first is near-horizontal,
                        // last arcs higher overhead.
                        const spread = (-1.05 + t * 1.35) * flapSpread;
                        const len = R * (0.95 - t * 0.2);
                        const wid = 10 + t * 2;
                        ctx.save();
                        ctx.rotate(spread);
                        // Feather body — teardrop shape (convex on both sides)
                        const bodyAlpha = 0.2 + (1 - t) * 0.3;
                        ctx.fillStyle = `rgba(100, 255, 180, ${bodyAlpha})`;
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.quadraticCurveTo(wid,        -len * 0.45, 0, -len);
                        ctx.quadraticCurveTo(-wid * 0.8, -len * 0.45, 0, 0);
                        ctx.fill();
                        // Bright spine down the feather — alpha-tapered via two
                        // overlapping strokes (inner thin bright, outer thicker dim)
                        ctx.strokeStyle = `rgba(30, 200, 140, ${0.55 + (1 - t) * 0.25})`;
                        ctx.lineWidth = 1.2;
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -len); ctx.stroke();
                        ctx.strokeStyle = `rgba(230, 255, 235, ${0.6 + (1 - t) * 0.3})`;
                        ctx.lineWidth = 0.6;
                        ctx.stroke();
                        // Tiny bud at the feather tip
                        ctx.fillStyle = `rgba(255, 255, 220, ${0.65 + (1 - t) * 0.3})`;
                        ctx.beginPath(); ctx.arc(0, -len, 1.2, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                    }
                    ctx.restore();
                }
                ctx.restore();

                // 3. Central luminous core — soft radial gradient orb, deep
                //    green rim fading to a white center. No stroke edge.
                ctx.save();
                const coreR = R * 0.42;
                const corePulse = 1.0 + Math.sin(time * 2.0) * 0.08;
                const coreGrad = ctx.createRadialGradient(0, -coreR * 0.15, 1, 0, 0, coreR * corePulse);
                coreGrad.addColorStop(0, 'rgba(255, 255, 235, 1.0)');
                coreGrad.addColorStop(0.25, 'rgba(200, 255, 220, 0.95)');
                coreGrad.addColorStop(0.65, 'rgba(40, 220, 130, 0.75)');
                coreGrad.addColorStop(1, 'rgba(10, 90, 50, 0)');
                ctx.fillStyle = coreGrad;
                ctx.shadowColor = NATURE; ctx.shadowBlur = 20;
                ctx.beginPath(); ctx.arc(0, 0, coreR * corePulse, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 3b. Bright pinpoint at the exact center — the "soul".
                ctx.save();
                ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#b7ffd8'; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 4. Tilted halo — thin elliptical ring floating above the
                //    core. Two concentric rings for a depth read.
                ctx.save();
                const haloY = -R * 0.58;
                const haloTilt = 0.35 + Math.sin(time * 0.8) * 0.05;
                const haloGlow = 0.55 + 0.25 * Math.sin(time * 1.6);
                ctx.strokeStyle = `rgba(220, 255, 230, ${haloGlow})`;
                ctx.shadowColor = NATURE; ctx.shadowBlur = 8;
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.ellipse(0, haloY, R * 0.45, R * 0.45 * haloTilt, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.strokeStyle = `rgba(140, 255, 200, ${haloGlow * 0.6})`;
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.ellipse(0, haloY + 1, R * 0.36, R * 0.36 * haloTilt, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();

                // 5. Companion motes — 3 brighter fairy attendants orbiting on
                //    a wide tilted ellipse. Each is a small radial gradient
                //    with a hard white pinpoint center.
                ctx.save();
                ctx.shadowColor = NATURE; ctx.shadowBlur = 8;
                for (let i = 0; i < 3; i++) {
                    const ca = time * 0.9 + i * (Math.PI * 2 / 3);
                    const cx = Math.cos(ca) * R * 0.95;
                    const cy = Math.sin(ca) * R * 0.4 - R * 0.15;
                    const compPulse = 0.7 + 0.3 * Math.sin(time * 3 + i * 1.7);
                    const compGrad = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, 5);
                    compGrad.addColorStop(0, `rgba(255, 255, 220, ${compPulse})`);
                    compGrad.addColorStop(0.5, `rgba(140, 255, 200, ${compPulse * 0.7})`);
                    compGrad.addColorStop(1, 'rgba(0, 255, 153, 0)');
                    ctx.fillStyle = compGrad;
                    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = `rgba(255, 255, 255, ${compPulse})`;
                    ctx.beginPath(); ctx.arc(cx, cy, 1.1, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();

                // 6. Firefly dust — 12 tiny motes drifting around the aura.
                //    Shared shadow state. Fast inner loop, cheap fill.
                ctx.save();
                ctx.shadowBlur = 4;
                const FIREFLIES = 12;
                for (let i = 0; i < FIREFLIES; i++) {
                    const pAngle = time * (0.35 + (i % 4) * 0.18) + (i * (Math.PI * 2 / FIREFLIES));
                    const pDist = R * (0.85 + Math.sin(time * 1.05 + i * 0.7) * 0.35);
                    const px = Math.cos(pAngle) * pDist;
                    const py = Math.sin(pAngle) * pDist * (0.7 + Math.sin(time + i) * 0.12);
                    const isGold = i % 6 === 0;
                    const twinkle = 0.45 + Math.sin(time * 2.5 + i * 1.3) * 0.35;
                    const a = (isGold ? 0.8 : 0.5) * twinkle;
                    ctx.shadowColor = isGold ? COLORS.GOLD : NATURE;
                    ctx.fillStyle = isGold
                        ? `rgba(255, 230, 110, ${a})`
                        : `rgba(170, 255, 200, ${a})`;
                    ctx.beginPath(); ctx.arc(px, py, isGold ? 1.1 : 0.8, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();

                // 7. Feather shimmer — tiny bright dust particles shed from
                //    the wing tips as they flap. Each particle is a single
                //    arc, shared shadow. Gives the "wings leaving sparkle"
                //    feel without per-frame ParticleSys churn.
                ctx.save();
                ctx.shadowBlur = 3;
                ctx.shadowColor = NATURE;
                for (let i = 0; i < 10; i++) {
                    const phase = (time * 0.9 + i * 0.18) % 1;
                    const side = (i % 2 === 0) ? -1 : 1;
                    // Shimmer origin near a wing tip; drifts outward + falls.
                    const originX = side * R * 0.75;
                    const originY = -R * 0.35;
                    const sx = originX + side * phase * R * 0.35 + Math.sin(time * 2 + i) * 2;
                    const sy = originY + phase * R * 0.55;
                    const alpha = (1 - phase) * 0.65;
                    ctx.fillStyle = `rgba(220, 255, 230, ${alpha})`;
                    ctx.beginPath(); ctx.arc(sx, sy, 1.0 * (1 - phase * 0.5), 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();

                // 8. Rising spark motes — gentle upward drift from the body.
                for (let i = 0; i < 8; i++) {
                    const t = (time * 0.5 + i * 0.13) % 1;
                    const py = R * 0.2 - t * (R + 30);
                    const px = Math.sin(time * 1.2 + i * 0.9) * R * 0.4;
                    const fade = (1 - t) * 0.55;
                    ctx.fillStyle = `rgba(200, 255, 220, ${fade})`;
                    ctx.shadowColor = NATURE; ctx.shadowBlur = 4;
                    ctx.beginPath(); ctx.arc(px, py, 0.8 * (1 - t * 0.4), 0, Math.PI * 2); ctx.fill();
                }
            }
            ctx.fillStyle = '#fff'; ctx.shadowBlur = 50; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();

            // Per-class signature flourish (§2.3). Layered on every frame on
            // top of the base class render so each class has an unmistakable
            // visual + state-driven identity.
            this.drawPlayerClassSignature(ctx, entity, time);
        }

        // ============================================================
        // 2. MINIONS
        // ============================================================
        else if (entity instanceof Minion && entity.isPlayerSide) {
            ctx.save(); ctx.scale(1.5, 1.5);
            const color = (this.player && this.player.classColor) ? this.player.classColor : COLORS.NATURE_LIGHT;
            const classId = (this.player && this.player.classId) || 'summoner';
            ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowColor = color; ctx.shadowBlur = 15;
            const hpRatio = entity.currentHp / Math.max(1, entity.maxHp);

            // ---- BOMB BOT (Annihilator) ----
            // Volatile armored munition. Armor plating + hazard stripe band +
            // glowing heat vents + angry slit eye + twisted fuse with ember
            // rain + arming pin + ground scorch. Escalates visibly as HP drops:
            // the pulse frequency rises, vents glow hotter, and crack patterns
            // appear on the armor to telegraph the death-explosion payload.
            if (classId === 'annihilator' || entity.name.includes('Bomb')) {
                const pulseRate = 8 + (1 - hpRatio) * 20;
                const body = Math.sin(time * pulseRate) > 0;
                const danger = 1 - hpRatio; // 0..1 threat escalator

                // 1. Ground scorch + shadow pool
                ctx.save();
                const scorch = ctx.createRadialGradient(0, 22, 4, 0, 22, 22);
                scorch.addColorStop(0, 'rgba(40, 10, 0, 0.7)');
                scorch.addColorStop(0.7, 'rgba(20, 5, 0, 0.4)');
                scorch.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = scorch;
                ctx.beginPath(); ctx.ellipse(0, 22, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
                // Charred radial cracks
                ctx.strokeStyle = `rgba(100, 30, 0, ${0.35 + 0.25 * danger})`;
                ctx.lineWidth = 0.8; ctx.shadowBlur = 0;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 + time * 0.1;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 10, 22 + Math.sin(a) * 3);
                    ctx.lineTo(Math.cos(a) * 20, 22 + Math.sin(a) * 5);
                    ctx.stroke();
                }
                ctx.restore();

                // 2. Layered heat-haze rings (more, more alpha, wobblier)
                ctx.save();
                for (let r = 1; r <= 3; r++) {
                    ctx.strokeStyle = `rgba(255, 120, 0, ${(0.28 - r * 0.06) + 0.15 * danger})`;
                    ctx.lineWidth = 1;
                    const wobble = Math.sin(time * 3 + r) * (2 + danger * 1.5);
                    ctx.beginPath(); ctx.arc(wobble, -wobble, 22 + r * 5, 0, Math.PI * 2); ctx.stroke();
                }
                ctx.restore();

                // 3. Outer armor shell (dark steel)
                ctx.fillStyle = '#1a0a05';
                ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10 + danger * 22;
                ctx.strokeStyle = color; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

                // 4. Glowing inner core (pulses through the vents)
                const coreIntensity = body ? 1 : 0.55;
                const coreGrad = ctx.createRadialGradient(0, 2, 2, 0, 0, 16);
                coreGrad.addColorStop(0, `rgba(255, 220, 140, ${0.95 * coreIntensity})`);
                coreGrad.addColorStop(0.45, `rgba(255, 80, 10, ${0.75 * coreIntensity})`);
                coreGrad.addColorStop(1, 'rgba(40, 5, 0, 0.6)');
                ctx.shadowBlur = 0;
                ctx.fillStyle = coreGrad;
                ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();

                // 5. Armor plate seams — 6 radial lines dividing the shell
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'; ctx.lineWidth = 1.6; ctx.shadowBlur = 0;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
                    ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
                    ctx.stroke();
                }
                ctx.restore();

                // 6. Hazard stripe band (diagonal yellow/black at equator)
                ctx.save();
                ctx.beginPath(); ctx.rect(-20, -3, 40, 6); ctx.clip();
                // Stripe pattern moves with pulseRate so it feels energized
                const stripeOffset = (time * 16) % 10;
                for (let sx = -25; sx < 25; sx += 5) {
                    ctx.fillStyle = ((Math.floor((sx + stripeOffset) / 5)) % 2 === 0) ? '#ffcc00' : '#110800';
                    ctx.beginPath();
                    ctx.moveTo(sx, -3);
                    ctx.lineTo(sx + 5, -3);
                    ctx.lineTo(sx + 8, 3);
                    ctx.lineTo(sx + 3, 3);
                    ctx.closePath(); ctx.fill();
                }
                ctx.restore();
                // Stripe bezel
                ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(-20, -3); ctx.lineTo(20, -3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-20, 3); ctx.lineTo(20, 3); ctx.stroke();

                // 7. Heat vents — 4 glowing slits around the body
                for (let i = 0; i < 4; i++) {
                    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                    const vx = Math.cos(a) * 18, vy = Math.sin(a) * 18;
                    ctx.save();
                    ctx.translate(vx, vy);
                    ctx.rotate(a);
                    const ventGlow = 0.55 + Math.sin(time * (4 + danger * 6) + i) * 0.35;
                    ctx.fillStyle = `rgba(255, 180, 40, ${ventGlow})`;
                    ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 8;
                    ctx.beginPath(); ctx.ellipse(0, 0, 4, 1.2, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }

                // 8. Low-HP crack pattern on armor (only appears when hurt)
                if (danger > 0.35) {
                    ctx.save();
                    ctx.strokeStyle = `rgba(255, 150, 40, ${0.4 + danger * 0.5})`;
                    ctx.lineWidth = 0.9; ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.moveTo(-8, -12); ctx.lineTo(-3, -7); ctx.lineTo(-6, -2); ctx.lineTo(-1, 3);
                    ctx.moveTo(6, -14); ctx.lineTo(10, -9); ctx.lineTo(7, -5);
                    ctx.stroke();
                    ctx.restore();
                }

                // 9. Angry slit eye (horizontal, with iris scan when damaged)
                ctx.save();
                ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
                // Socket
                ctx.beginPath(); ctx.ellipse(0, -5, 8, 3.2, 0, 0, Math.PI * 2); ctx.fill();
                // Glow pupil
                const eyeGlow = body ? '#ffcc00' : '#ff4400';
                ctx.shadowColor = '#ff6600'; ctx.shadowBlur = 10;
                ctx.fillStyle = eyeGlow;
                const pupW = 5 + (body ? 1 : 0);
                ctx.beginPath(); ctx.ellipse(0, -5, pupW, 2, 0, 0, Math.PI * 2); ctx.fill();
                // Crosshair tick
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.shadowBlur = 0;
                ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(2, -5); ctx.stroke();
                ctx.restore();

                // 10. Arming pin (classic grenade-pin ring on top)
                ctx.save();
                ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 1.4; ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(-4, -22, 3, 0, Math.PI * 2); ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-1, -22); ctx.lineTo(4, -22);
                ctx.stroke();
                ctx.restore();

                // 11. Twisted fuse with wrapping detail
                ctx.save();
                ctx.strokeStyle = '#444'; ctx.lineWidth = 2.4; ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(0, -20); ctx.quadraticCurveTo(10, -30, 15, -25);
                ctx.stroke();
                // Wrapping ticks
                ctx.strokeStyle = '#999'; ctx.lineWidth = 0.8;
                for (let t = 0.15; t < 0.95; t += 0.15) {
                    const fx = 0 + t * (15 - 0) + (1 - t) * t * 18;
                    const fy = -20 + t * (-25 + 20) + (1 - t) * t * -6;
                    ctx.beginPath();
                    ctx.moveTo(fx - 1, fy - 1); ctx.lineTo(fx + 1, fy + 1);
                    ctx.stroke();
                }
                // Inner fuse filament
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 3;
                ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(10, -30, 15, -25); ctx.stroke();
                ctx.restore();

                // 12. Fuse ember — bigger, pulsing, with a tail
                const emberR = 3.4 + Math.sin(time * 20) * 1.1;
                const emberGrad = ctx.createRadialGradient(15, -25, 0.5, 15, -25, emberR * 1.8);
                emberGrad.addColorStop(0, '#fff');
                emberGrad.addColorStop(0.35, '#ffee88');
                emberGrad.addColorStop(0.7, '#ff7700');
                emberGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
                ctx.fillStyle = emberGrad; ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(15, -25, emberR * 1.3, 0, Math.PI * 2); ctx.fill();
                // Ember spark streaks (short lines radiating out)
                ctx.strokeStyle = `rgba(255, 220, 120, ${0.6 + 0.3 * Math.sin(time * 14)})`;
                ctx.lineWidth = 0.7;
                for (let i = 0; i < 5; i++) {
                    const a = time * 3 + i * 1.3;
                    ctx.beginPath();
                    ctx.moveTo(15 + Math.cos(a) * 3, -25 + Math.sin(a) * 3);
                    ctx.lineTo(15 + Math.cos(a) * 6, -25 + Math.sin(a) * 6);
                    ctx.stroke();
                }

                // Particle trail — escalates with danger
                const trailChance = 0.4 + danger * 0.35;
                if (Math.random() < trailChance) ParticleSys.createTrail(entity.x + 22, entity.y - 38, '#ffaa00', 0.3);
                if (danger > 0.5 && Math.random() < 0.25) ParticleSys.createTrail(entity.x + (Math.random() - 0.5) * 20, entity.y + 4, '#ff6600', 0.25);
            }

            // ---- GUARDIAN (Sentinel) ----
            else if (classId === 'sentinel' || entity.name.includes('Guardian')) {
                // Backing octagonal halo
                ctx.save(); ctx.rotate(time * 0.3);
                ctx.globalAlpha = 0.22; ctx.fillStyle = color;
                ctx.beginPath();
                for (let i = 0; i < 8; i++) {
                    const a = i * Math.PI / 4;
                    ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26);
                }
                ctx.closePath(); ctx.fill();
                ctx.restore();

                // 4 orbital plates
                for (let i = 0; i < 4; i++) {
                    const a = time * 0.8 + i * (Math.PI / 2);
                    const ox = Math.cos(a) * 24;
                    const oy = Math.sin(a) * 24;
                    ctx.save();
                    ctx.translate(ox, oy); ctx.rotate(a + Math.PI / 2);
                    ctx.fillStyle = '#071620'; ctx.strokeStyle = COLORS.SHIELD; ctx.lineWidth = 1.5;
                    ctx.shadowColor = COLORS.SHIELD; ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(-5, -4); ctx.lineTo(5, -4); ctx.lineTo(5, 4); ctx.lineTo(-5, 4); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    ctx.restore();
                }

                // Central hex shield body
                const pulse = 0.5 + 0.5 * Math.sin(time * 3);
                ctx.save();
                ctx.strokeStyle = COLORS.SHIELD; ctx.lineWidth = 2;
                ctx.shadowColor = COLORS.SHIELD; ctx.shadowBlur = 10 + pulse * 10;
                ctx.fillStyle = `rgba(0, 243, 255, ${0.18 + pulse * 0.2})`;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2;
                    ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // Cyan crystal core
                ctx.fillStyle = '#fff'; ctx.shadowBlur = 16;
                ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Shield-bubble flash when player just took damage
                if (this.player && this.player.flashTimer > 0.05) {
                    const fa = this.player.flashTimer * 2;
                    ctx.save();
                    ctx.strokeStyle = `rgba(0, 243, 255, ${fa})`; ctx.lineWidth = 2.5;
                    ctx.shadowColor = COLORS.SHIELD; ctx.shadowBlur = 20;
                    ctx.beginPath(); ctx.arc(0, 0, 28 + (1 - fa) * 6, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }
            }

            // ---- PAWN (Tactician) ----
            // Mini command-core: holo ground grid, inner/outer hex frames,
            // crosshair reticle eye, 3 command-track pips, antenna beacon,
            // dual orbital drones (counter-rotating), radar sweep line,
            // and a pulsing cyan aura. Matches the player Tactician's
            // "holographic command core" language at minion scale.
            else if (classId === 'tactician' || entity.name.includes('Pawn')) {
                const cyan = '#00f3ff';

                // 1. Holographic ground grid — 2 isometric ellipse rings
                ctx.save();
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.22)';
                ctx.lineWidth = 1; ctx.shadowBlur = 0;
                for (let r = 18; r <= 30; r += 6) {
                    ctx.beginPath();
                    ctx.ellipse(0, 22, r, r * 0.3, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();

                // 2. Soft pulse aura behind the body
                const auraPulse = 0.55 + Math.sin(time * 2.2) * 0.25;
                const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 34);
                aura.addColorStop(0, `rgba(0, 243, 255, ${0.35 * auraPulse})`);
                aura.addColorStop(1, 'rgba(0, 243, 255, 0)');
                ctx.fillStyle = aura;
                ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();

                // 3. Cyan tether ribbon behind (extends down, now glowing)
                ctx.save();
                ctx.strokeStyle = `rgba(0, 243, 255, ${0.3 + 0.25 * auraPulse})`;
                ctx.lineWidth = 1.5; ctx.shadowColor = cyan; ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.moveTo(0, 16);
                for (let t = 0; t <= 1; t += 0.1) {
                    const y = 16 + t * 30;
                    const x = Math.sin(time * 3 + t * 6) * 3 * t;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
                ctx.restore();

                // 4. Outer rotating hex frame with corner notches (tech feel)
                ctx.save();
                ctx.rotate(time * 0.3);
                ctx.strokeStyle = color; ctx.lineWidth = 1.2;
                ctx.shadowColor = color; ctx.shadowBlur = 8;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.lineTo(Math.cos(a) * 21, Math.sin(a) * 21);
                }
                ctx.closePath(); ctx.stroke();
                // Corner notches pointing outward
                ctx.shadowBlur = 0;
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    const nx = Math.cos(a), ny = Math.sin(a);
                    ctx.beginPath();
                    ctx.moveTo(nx * 21, ny * 21);
                    ctx.lineTo(nx * 25, ny * 25);
                    ctx.stroke();
                }
                ctx.restore();

                // 5. Inner hex chassis (counter-rotating, filled)
                ctx.save();
                ctx.rotate(-time * 0.5);
                ctx.fillStyle = '#050510'; ctx.strokeStyle = color; ctx.lineWidth = 2;
                ctx.shadowColor = color; ctx.shadowBlur = 12;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3;
                    ctx.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();
                // Panel seams — three radial lines from center suggest folded plating
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)'; ctx.lineWidth = 0.6;
                ctx.shadowBlur = 0;
                for (let i = 0; i < 3; i++) {
                    const a = (i * 2 * Math.PI / 3);
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
                    ctx.stroke();
                }
                ctx.restore();

                // 6. 3 command-track pips orbiting slowly (echoes the player's Command Track)
                for (let i = 0; i < 3; i++) {
                    const pa = time * 0.9 + i * (Math.PI * 2 / 3);
                    const px = Math.cos(pa) * 18, py = Math.sin(pa) * 18;
                    const glow = 0.6 + Math.sin(time * 3 + i) * 0.35;
                    ctx.fillStyle = `rgba(0, 243, 255, ${glow})`;
                    ctx.shadowColor = cyan; ctx.shadowBlur = 6;
                    ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
                }

                // 7. Crosshair reticle eye (replaces plain dot)
                ctx.save();
                ctx.shadowColor = cyan; ctx.shadowBlur = 10;
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = cyan; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.stroke();
                // Crosshair ticks
                ctx.shadowBlur = 0; ctx.strokeStyle = cyan; ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(-7, 0);  ctx.lineTo(-4, 0);
                ctx.moveTo( 4, 0);  ctx.lineTo( 7, 0);
                ctx.moveTo(0, -7);  ctx.lineTo(0, -4);
                ctx.moveTo(0,  4);  ctx.lineTo(0,  7);
                ctx.stroke();
                // Pupil
                ctx.fillStyle = '#fff'; ctx.shadowColor = cyan; ctx.shadowBlur = 8;
                ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 8. Antenna beacon — thin mast with a blinking tip
                ctx.save();
                ctx.strokeStyle = color; ctx.lineWidth = 1;
                ctx.shadowColor = cyan; ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(0, -23);
                ctx.stroke();
                const blink = 0.5 + 0.5 * Math.sin(time * 5);
                ctx.fillStyle = `rgba(255, 255, 255, ${blink})`;
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 8;
                ctx.beginPath(); ctx.arc(0, -24, 1.6, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // 9. Dual orbital drones — one CW, one CCW on offset orbits
                const drawDrone = (a, rx, ry) => {
                    const dx = Math.cos(a) * rx, dy = Math.sin(a) * ry;
                    ctx.save(); ctx.translate(dx, dy); ctx.rotate(a + Math.PI / 2);
                    ctx.fillStyle = '#050510'; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
                    ctx.shadowColor = color; ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.moveTo(0, -4); ctx.lineTo(3, 0); ctx.lineTo(0, 4); ctx.lineTo(-3, 0); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    ctx.fillStyle = color; ctx.shadowBlur = 4;
                    ctx.beginPath(); ctx.arc(0, 0, 0.9, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                };
                drawDrone( time * 1.6,  28, 11);
                drawDrone(-time * 1.3 + Math.PI, 24, 8);

                // 10. Radar sweep line to enemy (existing) — now with a trailing dotted wake
                if (this.enemy) {
                    const tdx = this.enemy.x - entity.x, tdy = this.enemy.y - entity.y;
                    const ang = Math.atan2(tdy, tdx);
                    ctx.save(); ctx.rotate(ang);
                    ctx.strokeStyle = `rgba(0, 243, 255, ${0.5 + 0.5 * Math.sin(time * 4)})`;
                    ctx.lineWidth = 1; ctx.shadowBlur = 6; ctx.setLineDash([2, 3]);
                    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(32, 0); ctx.stroke();
                    ctx.setLineDash([]);
                    // Tiny target bracket at the sweep endpoint
                    ctx.strokeStyle = `rgba(0, 243, 255, 0.85)`;
                    ctx.lineWidth = 1; ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.moveTo(30, -2); ctx.lineTo(32, -2); ctx.lineTo(32, 2); ctx.lineTo(30, 2);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            // ---- MANA WISP (Arcanist) ----
            else if (classId === 'arcanist' || entity.name.includes('Wisp') || entity.name.includes('Mana')) {
                // Halo
                ctx.save();
                const haloGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 28);
                haloGrad.addColorStop(0, 'rgba(224, 176, 255, 0.55)');
                haloGrad.addColorStop(0.5, 'rgba(188, 19, 254, 0.35)');
                haloGrad.addColorStop(1, 'transparent');
                ctx.fillStyle = haloGrad;
                ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Translucent orb body
                ctx.save();
                const orbGrad = ctx.createRadialGradient(-3, -4, 1, 0, 0, 14);
                orbGrad.addColorStop(0, '#fff');
                orbGrad.addColorStop(0.4, '#e0b0ff');
                orbGrad.addColorStop(0.9, 'rgba(76, 19, 136, 0.9)');
                orbGrad.addColorStop(1, 'rgba(20, 5, 40, 0.9)');
                ctx.fillStyle = orbGrad; ctx.shadowColor = COLORS.PURPLE; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
                // Cloud swirl clipped inside
                ctx.save();
                ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.clip();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
                ctx.beginPath();
                for (let k = 0; k <= 14; k++) {
                    const tt = k / 14;
                    const a = time * 2 + tt * Math.PI * 3;
                    const r = tt * 10;
                    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                }
                ctx.stroke();
                ctx.restore();
                // Specular highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath(); ctx.arc(-4, -5, 2.5, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Pulse brighter when player has ≥4 mana
                if (this.player && this.player.mana >= 4) {
                    ctx.save();
                    ctx.strokeStyle = `rgba(224, 176, 255, ${0.4 + 0.4 * Math.sin(time * 6)})`;
                    ctx.lineWidth = 1.2; ctx.shadowColor = COLORS.PURPLE; ctx.shadowBlur = 10;
                    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();
                }

                // Lavender mote trail
                if (Math.random() < 0.4) ParticleSys.createTrail(entity.x + (Math.random() - 0.5) * 20, entity.y + 14, '#e0b0ff', 0.4);
            }

            // ---- BLOOD THRALL (Blood Stalker) ----
            else if (classId === 'bloodstalker' || entity.name.includes('Thrall') || entity.name.includes('Blood')) {
                // Bat wings (bezier, symmetrical)
                const wingFlap = Math.sin(time * (2.5 + (1 - hpRatio) * 3)) * 0.25;
                ctx.save();
                ctx.fillStyle = 'rgba(40, 0, 15, 0.9)'; ctx.strokeStyle = '#aa0022';
                ctx.lineWidth = 1.5; ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 10;
                for (const side of [-1, 1]) {
                    ctx.save(); ctx.rotate(side * wingFlap);
                    ctx.beginPath();
                    ctx.moveTo(side * 3, -1);
                    ctx.bezierCurveTo(side * 18, -10, side * 28, -2, side * 22, 8);
                    ctx.bezierCurveTo(side * 14, 2, side * 10, 4, side * 5, 7);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // Pulsing heart core
                const beat = 1 + Math.sin(time * (4 + (1 - hpRatio) * 2)) * 0.18;
                ctx.save();
                ctx.scale(beat, beat);
                const heartGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
                heartGrad.addColorStop(0, '#ff6080');
                heartGrad.addColorStop(0.55, '#aa0022');
                heartGrad.addColorStop(1, '#220005');
                ctx.fillStyle = heartGrad;
                ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Twin red eyes
                ctx.fillStyle = '#ff2244'; ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.arc(-3, -2, 1.2, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(3, -2, 1.2, 0, Math.PI * 2); ctx.fill();

                // Blood drip particles
                if (Math.random() < 0.35) ParticleSys.createTrail(entity.x + (Math.random() - 0.5) * 30, entity.y + 16, '#ff2244', 0.45);
            }

            // ---- SPIRIT / DEFAULT (Summoner) ----
            else {
                // Petal wreath (behind)
                ctx.save();
                ctx.rotate(time * 0.3);
                for (let i = 0; i < 6; i++) {
                    ctx.save(); ctx.rotate(i * Math.PI / 3);
                    const petalGrad = ctx.createLinearGradient(0, 0, 0, -18);
                    petalGrad.addColorStop(0, 'rgba(0, 255, 153, 0.15)');
                    petalGrad.addColorStop(1, 'rgba(0, 200, 120, 0.55)');
                    ctx.fillStyle = petalGrad; ctx.strokeStyle = color; ctx.lineWidth = 1.2;
                    ctx.shadowColor = color; ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    ctx.quadraticCurveTo(6, -10, 0, -18);
                    ctx.quadraticCurveTo(-6, -10, 0, 0);
                    ctx.fill(); ctx.stroke();
                    ctx.restore();
                }
                ctx.restore();

                // Pollen core
                const coreGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
                coreGrad.addColorStop(0, '#fff');
                coreGrad.addColorStop(0.4, '#ffff99');
                coreGrad.addColorStop(1, 'rgba(0, 255, 153, 0.3)');
                ctx.fillStyle = coreGrad; ctx.shadowColor = COLORS.GOLD; ctx.shadowBlur = 14;
                ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();

                // Three orbiting fireflies
                for (let i = 0; i < 3; i++) {
                    const a = time * 2 + i * (Math.PI * 2 / 3);
                    const r = 14 + Math.sin(time * 3 + i) * 2;
                    const fx = Math.cos(a) * r, fy = Math.sin(a) * r;
                    ctx.fillStyle = i % 2 === 0 ? COLORS.GOLD : COLORS.NATURE_LIGHT;
                    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
                    ctx.beginPath(); ctx.arc(fx, fy, 1.5, 0, Math.PI * 2); ctx.fill();
                }

                // Root tendrils briefly extend when attacking
                if (entity.anim && entity.anim.type === 'lunge') {
                    const p = entity.anim.timer / (entity.anim.maxTimer || 15);
                    const ease = 1 - p;
                    ctx.save();
                    ctx.strokeStyle = `rgba(0, 200, 120, ${ease})`;
                    ctx.lineWidth = 1.4; ctx.shadowColor = color; ctx.shadowBlur = 8;
                    for (let i = 0; i < 3; i++) {
                        const a = -Math.PI / 2 + (i - 1) * 0.4;
                        const len = 22 * ease;
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.quadraticCurveTo(Math.cos(a) * len * 0.5, Math.sin(a) * len * 0.5 - 6, Math.cos(a) * len, Math.sin(a) * len);
                        ctx.stroke();
                    }
                    ctx.restore();
                }

                // Firefly trail emission
                if (Math.random() < 0.25) ParticleSys.createTrail(entity.x + (Math.random() - 0.5) * 20, entity.y - 8, COLORS.NATURE_LIGHT, 0.35);
            }
            ctx.restore();
        }

        // ============================================================
        // 3. ENEMIES
        // ============================================================
        else if (entity instanceof Enemy) {
            
            // --- DETERMINE SECTOR COLOR PALETTE ---
            let mColor = '#ff0055'; 
            let mGlow = '#ff0055';
            let mFill = '#1a0505';

            if (this.sector === 1) { mColor = '#00ffff'; mGlow = '#00ffff'; mFill = '#001111'; }
            else if (this.sector === 2) { mColor = '#ff00ff'; mGlow = '#ff00ff'; mFill = '#110011'; }
            else if (this.sector === 3) { mColor = '#ff4500'; mGlow = '#ff4500'; mFill = '#1a0500'; }
            else if (this.sector === 4) { mColor = '#32cd32'; mGlow = '#32cd32'; mFill = '#051a05'; }
            else if (this.sector === 5) { mColor = '#ffffff'; mGlow = '#ffd700'; mFill = '#111111'; }

            // Apply Palette to Context
            ctx.strokeStyle = mColor;
            ctx.lineWidth = baseWidth;
            ctx.shadowColor = mGlow;
            ctx.shadowBlur = baseGlow;
            
            const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.radius);
            bodyGrad.addColorStop(0, '#111'); 
            bodyGrad.addColorStop(1, mColor);
            ctx.fillStyle = bodyGrad;

            // =========================================================
            // BOSS RENDERING
            // =========================================================
            if (entity.isBoss) {
                // --- SECTOR 1: THE PANOPTICON (Wireframe/Bare Metal Mode) ---
                if (this.sector === 1) {
                    ctx.save();
                    const p2 = entity.phase === 2;
                    const cyan = p2 ? '#ff2244' : '#00ffff';
                    if (p2) { ctx.translate((Math.random()-0.5)*4, (Math.random()-0.5)*4); }

                    // Scanning Beams — only when actively analysing (telegraph), or full rage in phase 2.
                    if (entity.analyzing || p2) {
                        ctx.save();
                        const pulse = 0.65 + Math.sin(time * 6) * 0.35;
                        const beamWidth = 120 + Math.sin(time * 2) * 20;
                        const beamColor = p2
                            ? `rgba(255, 34, 68, ${0.35 + pulse * 0.25})`
                            : `rgba(0, 255, 255, ${0.35 + pulse * 0.4})`;
                        ctx.strokeStyle = beamColor;
                        ctx.lineWidth = entity.analyzing ? 3 : 2;
                        if (entity.analyzing) { ctx.shadowColor = p2 ? '#ff2244' : '#00ffff'; ctx.shadowBlur = 20; }
                        const scanOffset = (time * 150) % 50;

                        ctx.beginPath();
                        ctx.moveTo(-20, 20); ctx.lineTo(-beamWidth, 400);
                        ctx.moveTo(20, 20); ctx.lineTo(beamWidth, 400);
                        const scanRows = p2 ? 16 : 8;
                        for(let i=0; i<scanRows; i++) {
                            const y = 50 + i * (400/scanRows) + scanOffset;
                            if (y < 400) { const w = (y / 400) * beamWidth; ctx.moveTo(-w, y); ctx.lineTo(w, y); }
                        }
                        ctx.stroke();
                        ctx.restore();
                    }

                    // Eye Frame
                    ctx.strokeStyle = cyan; ctx.lineWidth = 4;
                    ctx.beginPath(); ctx.moveTo(-100, 0); ctx.quadraticCurveTo(0, -80, 100, 0); ctx.moveTo(-100, 0); ctx.quadraticCurveTo(0, 80, 100, 0); ctx.stroke();

                    // Rings (Solid)
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(0, 0, 160, 0, Math.PI*2); ctx.stroke();
                    const r1X = Math.cos(time * 0.15) * 160; const r1Y = Math.sin(time * 0.15) * 160;
                    ctx.fillStyle = cyan; ctx.beginPath(); ctx.arc(r1X, r1Y, 5, 0, Math.PI*2); ctx.fill();

                    ctx.save(); ctx.rotate(Math.sin(time * 0.5) * 0.2); 
                    ctx.beginPath(); ctx.arc(0, 0, 130, -Math.PI/4, Math.PI/4); ctx.stroke();
                    ctx.beginPath(); ctx.arc(0, 0, 130, Math.PI - Math.PI/4, Math.PI + Math.PI/4); ctx.stroke();
                    ctx.restore();

                    ctx.beginPath(); ctx.arc(0, 0, 110, 0, Math.PI*2); ctx.stroke();
                    const r3X = Math.cos(-time * 0.8) * 110; const r3Y = Math.sin(-time * 0.8) * 110;
                    ctx.beginPath(); ctx.arc(r3X, r3Y, 4, 0, Math.PI*2); ctx.fill();

                    // Lens housing
                    ctx.strokeStyle = cyan; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI*2); ctx.stroke();
                    // Tick marks around iris
                    ctx.save(); ctx.lineWidth = 2;
                    for (let i = 0; i < 16; i++) {
                        const a = i * Math.PI / 8 + time * 0.25;
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(a) * 40, Math.sin(a) * 40);
                        ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48);
                        ctx.stroke();
                    }
                    ctx.restore();
                    // Pupil that tracks toward the player (snap-lock)
                    const tpx = (this.player ? (this.player.x - entity.x) : 0);
                    const tpy = (this.player ? (this.player.y - entity.y) : 0);
                    const tmag = Math.hypot(tpx, tpy) || 1;
                    const trackR = 14; // pixels of offset
                    const tox = (tpx / tmag) * trackR;
                    const toy = (tpy / tmag) * trackR;
                    const pupilSize = 18 + Math.sin(time * 4) * 5;
                    ctx.fillStyle = p2 ? '#ff2244' : '#fff';
                    if (p2) { ctx.shadowColor = '#ff2244'; ctx.shadowBlur = 30; }
                    ctx.beginPath(); ctx.arc(tox, toy, pupilSize, 0, Math.PI*2); ctx.fill();
                    // Sharp highlight
                    ctx.fillStyle = '#fff'; ctx.shadowBlur = 4;
                    ctx.beginPath(); ctx.arc(tox - pupilSize*0.3, toy - pupilSize*0.3, pupilSize*0.25, 0, Math.PI*2); ctx.fill();

                    ctx.restore();
                }

                // --- SECTOR 2: NULL_POINTER ---
                else if (this.sector === 2) {
                    ctx.save();
                    // Scale the whole boss down — keeps hitbox intact via entity.radius while
                    // shrinking the render footprint (smaller shadowBlur bounds = cheaper pass).
                    ctx.scale(0.82, 0.82);
                    const p2 = entity.phase === 2;
                    const magenta = '#ff00ff';
                    const brightMagenta = p2 ? '#00ffff' : '#ff88ff';
                    const purple = p2 ? '#00ccff' : '#800080';
                    const jitterAmp = p2 ? 10 : 5;
                    const jt = time * 37;
                    const jitterX = Math.sin(jt) * jitterAmp;
                    const jitterY = Math.cos(jt * 1.3) * jitterAmp;
                    ctx.translate(jitterX, jitterY);

                    // RGB channel split aberration rings (red offset left, cyan offset right)
                    const aberr = p2 ? 10 : 5;
                    const ringSteps = 24;
                    for (const [dx, col] of [[-aberr, 'rgba(255,50,80,0.5)'], [aberr, 'rgba(0,220,255,0.5)']]) {
                        ctx.save();
                        ctx.translate(dx, 0);
                        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowBlur = 0; ctx.globalAlpha = 0.6;
                        ctx.beginPath();
                        for (let i = 0; i <= ringSteps; i++) {
                            const a = (Math.PI * 2 / ringSteps) * i;
                            const r = 180 + Math.sin(time * 10 + i * 5) * 10;
                            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
                        }
                        ctx.closePath(); ctx.stroke();
                        ctx.restore();
                    }

                    // Body outline — reduced blur, deterministic jitter (no random churn).
                    ctx.fillStyle = '#000'; ctx.shadowColor = magenta; ctx.shadowBlur = 20; ctx.beginPath();
                    const bodySteps = 24;
                    for (let i = 0; i <= bodySteps; i++) {
                        const angle = (Math.PI * 2 / bodySteps) * i;
                        const r = 180 + Math.sin(time * 10 + i * 5) * 10 + Math.sin(time * 17 + i * 2.3) * 6;
                        ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
                    }
                    ctx.closePath(); ctx.fill();
                    ctx.shadowBlur = 0;

                    // Spiral arms — coarser step, fewer points.
                    ctx.lineWidth = 4; ctx.globalAlpha = 0.6;
                    const spiralArms = 6;
                    for (let j = 0; j < spiralArms; j++) {
                        ctx.beginPath();
                        ctx.strokeStyle = (j % 2 === 0) ? magenta : purple;
                        const baseTheta = (time * -3) + (j * (Math.PI * 2) / spiralArms);
                        for (let k = 0; k < 28; k++) {
                            const theta = baseTheta + (k * 0.22);
                            const r = k * 7.5;
                            if (r > 190) break;
                            const x = Math.cos(theta) * r;
                            const y = Math.sin(theta) * r;
                            if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                    }
                    ctx.globalAlpha = 1.0;

                    // Floating shards — reduced count + cheaper blur. Shared warp table.
                    const shards = 8;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = magenta;
                    for (let i = 0; i < shards; i++) {
                        ctx.save();
                        const angle = time * 1.5 + (i * Math.PI * 2 / shards);
                        const dist = 280 + Math.sin(time * 2 + i * 43) * 50;
                        ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist);
                        ctx.rotate(angle + (time * 4) + (i % 2 === 0 ? time : -time));
                        const fade = 0.4 + 0.6 * Math.sin(time * 3 + i * 100);
                        ctx.globalAlpha = fade;
                        ctx.fillStyle = '#050005';
                        ctx.strokeStyle = brightMagenta;
                        ctx.shadowBlur = 8;
                        const wBase = time * 15 + i * 10;
                        const w1 = Math.sin(wBase + 1) * 12;
                        const w2 = Math.sin(wBase + 2) * 12;
                        const w3 = Math.sin(wBase + 3) * 12;
                        const w4 = Math.sin(wBase + 4) * 12;
                        ctx.beginPath();
                        ctx.moveTo(0 + w1, -60 + w2);
                        ctx.lineTo(30 + w3, 20 + w4);
                        ctx.lineTo(0 + w2, 10 + w1);
                        ctx.lineTo(-30 + w4, 20 + w3);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                        ctx.restore();
                    }
                    ctx.shadowBlur = 0;

                    ctx.font = "bold 32px 'Orbitron', monospace"; ctx.fillStyle = brightMagenta; ctx.shadowBlur = 8; ctx.globalAlpha = 0.8; const txtX = Math.sin(time * 1.2) * 140; const txtY = Math.cos(time * 0.9) * 140; ctx.fillText("NULL", txtX - 40, txtY); ctx.fillText("VOID", -txtX - 40, -txtY);

                    // --- VOID CRUSH CHARGING VISUAL ---
                    if (entity.voidCrushTurns > 0) {
                        const charge = 1 - (entity.voidCrushTurns / 5); // 0..1 across the 5-turn charge
                        const chargePulse = 0.6 + Math.sin(time * (8 + charge * 10)) * 0.4;
                        // Concentric crackling rings pulling inward
                        ctx.globalAlpha = 1;
                        ctx.shadowColor = '#ff00ff';
                        ctx.shadowBlur = 22 + charge * 28;
                        for (let r = 0; r < 4; r++) {
                            const ringR = 260 - (r * 40) + Math.sin(time * 6 + r) * 8;
                            ctx.strokeStyle = `rgba(255, ${20 + r * 40}, 255, ${0.35 + chargePulse * 0.4 * (1 - r * 0.15)})`;
                            ctx.lineWidth = 3 + charge * 3;
                            ctx.setLineDash([12, 8]);
                            ctx.beginPath();
                            ctx.arc(0, 0, ringR, time * (0.8 + r * 0.3), time * (0.8 + r * 0.3) + Math.PI * 2);
                            ctx.stroke();
                        }
                        ctx.setLineDash([]);
                        // Countdown text
                        ctx.globalAlpha = 0.9;
                        ctx.shadowColor = '#ff00ff';
                        ctx.shadowBlur = 18;
                        ctx.fillStyle = '#fff';
                        ctx.font = "bold 56px 'Orbitron', monospace";
                        ctx.textAlign = 'center';
                        ctx.fillText(`${entity.voidCrushTurns}`, 0, 20);
                        ctx.font = "bold 16px 'Orbitron', monospace";
                        ctx.fillStyle = '#ff88ff';
                        ctx.fillText("VOID CRUSH", 0, 50);
                        ctx.textAlign = 'start';
                    }

                    ctx.restore();
                }

                // --- SECTOR 3: THE COMPILER ---
                else if (this.sector === 3) {
                    ctx.save(); ctx.scale(1.6, 1.6);
                    const p2 = entity.phase === 2;
                    const orange = p2 ? '#ff1a00' : '#ff4500'; const darkMetal = '#1a0500'; const rust = '#4a1a00'; const heat = p2 ? '#fff0aa' : '#ffcc00';
                    const hover = Math.sin(time * 1.5) * 8; ctx.translate(0, hover);
                    ctx.save(); const thrustLen = (p2 ? 140 : 90) + Math.sin(time * (p2 ? 30 : 20)) * (p2 ? 16 : 10); const thrustGrad = ctx.createLinearGradient(0, 80, 0, 80 + thrustLen); thrustGrad.addColorStop(0, '#fff'); thrustGrad.addColorStop(0.2, heat); thrustGrad.addColorStop(1, 'transparent'); ctx.fillStyle = thrustGrad; ctx.beginPath(); ctx.moveTo(-50, 80); ctx.lineTo(-30, 80 + thrustLen); ctx.lineTo(-10, 80); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, 80); ctx.lineTo(30, 80 + thrustLen); ctx.lineTo(50, 80); ctx.fill(); ctx.restore();
                    ctx.fillStyle = '#111'; ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.fillRect(-90, -110, 20, 60); ctx.strokeRect(-90, -110, 20, 60); ctx.fillRect(70, -110, 20, 60); ctx.strokeRect(70, -110, 20, 60);
                    ctx.fillStyle = 'rgba(150, 150, 150, 0.4)'; for(let i=0; i<6; i++) { const puffY = (time * 100 + i * 40) % 200; const alpha = 1.0 - (puffY / 200); const size = 10 + (puffY / 5); const drift = Math.sin(time * 2 + i) * 15 * (puffY/200); if (alpha > 0) { ctx.globalAlpha = alpha * 0.5; ctx.beginPath(); ctx.arc(-80 + drift, -110 - puffY, size, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(80 - drift, -110 - puffY, size, 0, Math.PI*2); ctx.fill(); } } ctx.globalAlpha = 1.0;
                    ctx.fillStyle = darkMetal; ctx.strokeStyle = orange; ctx.lineWidth = 3; ctx.shadowColor = orange; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(-70, -70); ctx.lineTo(70, -70); ctx.lineTo(80, -20); ctx.lineTo(50, 80); ctx.lineTo(0, 90); ctx.lineTo(-50, 80); ctx.lineTo(-80, -20); ctx.closePath(); ctx.fill(); ctx.stroke();

                    // Lava-seam cracks across the chassis (brighten on pulse)
                    ctx.save();
                    const seamHeat = 0.5 + Math.sin(time * (p2 ? 8 : 5)) * 0.5;
                    ctx.strokeStyle = heat;
                    ctx.lineWidth = 2 + seamHeat * (p2 ? 2.5 : 1.5);
                    ctx.shadowColor = '#ffaa00';
                    ctx.shadowBlur = 10 + seamHeat * 16;
                    ctx.globalAlpha = 0.6 + seamHeat * 0.4;
                    ctx.beginPath();
                    // Jagged network (fixed seam paths for consistency)
                    ctx.moveTo(-55, -55); ctx.lineTo(-38, -30); ctx.lineTo(-52, -12); ctx.lineTo(-30, 10);
                    ctx.moveTo(-30, 10); ctx.lineTo(-8, 24); ctx.lineTo(-18, 52); ctx.lineTo(12, 70);
                    ctx.moveTo(55, -50); ctx.lineTo(34, -22); ctx.lineTo(58, 4); ctx.lineTo(36, 30);
                    ctx.moveTo(36, 30); ctx.lineTo(10, 40); ctx.lineTo(24, 70);
                    ctx.stroke();
                    // Ember pinpricks along seams
                    ctx.fillStyle = heat; ctx.shadowBlur = 6;
                    for (const [ex, ey] of [[-38, -30], [-30, 10], [-18, 52], [34, -22], [36, 30], [10, 40]]) {
                        const flicker = 1 + Math.sin(time * 10 + ex) * 0.4;
                        ctx.beginPath(); ctx.arc(ex, ey, 2.5 * flicker, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();
                    const shoulderOffset = Math.sin(time * 2) * 5; ctx.fillStyle = rust; ctx.beginPath(); ctx.moveTo(-80, -70 + shoulderOffset); ctx.lineTo(-120, -50 + shoulderOffset); ctx.lineTo(-110, 20 + shoulderOffset); ctx.lineTo(-70, 0 + shoulderOffset); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(80, -70 + shoulderOffset); ctx.lineTo(120, -50 + shoulderOffset); ctx.lineTo(110, 20 + shoulderOffset); ctx.lineTo(70, 0 + shoulderOffset); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = '#220a00'; ctx.fillRect(-120, 20 + shoulderOffset, 30, 60); ctx.strokeRect(-120, 20 + shoulderOffset, 30, 60); ctx.fillRect(90, 20 + shoulderOffset, 30, 60); ctx.strokeRect(90, 20 + shoulderOffset, 30, 60);
                    const pulse = 1 + (p2 ? 0.18 : 0.1) * Math.sin(time * (p2 ? 14 : 8)); ctx.save(); ctx.translate(0, -10); ctx.scale(pulse, pulse); ctx.shadowColor = '#ffaa00'; ctx.shadowBlur = p2 ? 50 : 30; ctx.fillStyle = p2 ? '#fff0aa' : '#ffcc00'; ctx.beginPath(); const r = 25; for(let i=0; i<6; i++) { const a = (Math.PI/3)*i; ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.moveTo(-15, -10); ctx.lineTo(15, -10); ctx.moveTo(-15, 10); ctx.lineTo(15, 10); ctx.stroke(); ctx.restore();
                    if (entity.armorPlating > 0) { ctx.save(); ctx.strokeStyle = '#ffaa00'; ctx.lineWidth = 3; ctx.globalAlpha = 0.5 + Math.sin(time * 10) * 0.3; ctx.beginPath(); const ar = 130; for(let i=0; i<6; i++) { const a = (Math.PI/3) * i; ctx.lineTo(Math.cos(a)*ar, Math.sin(a)*ar); } ctx.closePath(); ctx.stroke(); ctx.fillStyle = '#ffaa00'; ctx.font = "bold 20px 'Orbitron'"; ctx.textAlign = "center"; ctx.fillText(`ARMOR: ${entity.armorPlating}`, 0, -140); ctx.restore(); }
                    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 15; ctx.fillRect(-15, -80 + shoulderOffset*0.5, 30, 8);
                    ctx.restore();
                }

                // --- SECTOR 4: HIVE PROTOCOL ---
                else if (this.sector === 4) {
                    ctx.save();
                    const p2 = entity.phase === 2;
                    const lime = p2 ? '#7fff00' : '#32cd32';
                    const darkLime = '#0a2a0a';
                    const pulse = 1 + (p2 ? 0.16 : 0.1) * Math.sin(time * (p2 ? 5 : 3));
                    const coreGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, 250);
                    coreGrad.addColorStop(0, p2 ? 'rgba(127, 255, 0, 0.28)' : 'rgba(50, 205, 50, 0.2)'); coreGrad.addColorStop(0.5, 'rgba(50, 205, 50, 0.05)'); coreGrad.addColorStop(1, 'transparent');
                    ctx.scale(2.0, 1.0); ctx.fillStyle = coreGrad; ctx.beginPath(); ctx.arc(0, 0, 140 * pulse, 0, Math.PI*2); ctx.fill(); ctx.scale(0.5, 1.0);
                    const droneCount = p2 ? 55 : 40; ctx.lineWidth = p2 ? 1.5 : 1; ctx.strokeStyle = p2 ? 'rgba(127, 255, 0, 0.32)' : 'rgba(50, 205, 50, 0.15)'; ctx.beginPath();
                    const positions = [];
                    for (let i = 0; i < droneCount; i++) {
                        const spreadX = (i / droneCount - 0.5) * 500; 
                        const waveY = Math.sin(time * 1.5 + (i * 0.2)) * 60; const noiseY = Math.cos(time * 2.3 + (i * 0.7)) * 30;
                        positions.push({ x: spreadX, y: waveY + noiseY });
                    }
                    for (let i = 0; i < droneCount - 1; i++) {
                        ctx.moveTo(positions[i].x, positions[i].y); ctx.lineTo(positions[i+1].x, positions[i+1].y);
                        if (i + 5 < droneCount) { ctx.moveTo(positions[i].x, positions[i].y); ctx.lineTo(positions[i+5].x, positions[i+5].y); }
                    } ctx.stroke();
                    for (let i = 0; i < droneCount; i++) {
                        const pos = positions[i];
                        ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(time * 2 + i); const depthScale = 0.8 + 0.4 * Math.sin(time + i); ctx.scale(depthScale, depthScale);
                        ctx.fillStyle = darkLime; ctx.strokeStyle = lime; ctx.lineWidth = 2;
                        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(12, 10); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); 
                        ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8; ctx.fillRect(-2, -2, 4, 4);
                        ctx.restore();
                    }
                    ctx.fillStyle = lime; ctx.globalAlpha = 0.6;
                    for(let k=0; k<15; k++) { const px = (Math.sin(time * 0.5 + k) * 300); const py = (Math.cos(time * 0.7 + k) * 100); ctx.fillRect(px, py, 2, 2); }
                    ctx.restore();
                }

                // --- SECTOR 5: TESSERACT PRIME (Sacred Geometry Overhaul) ---
                else if (this.sector === 5) {
                    ctx.save();
                    const p2 = entity.phase === 2;
                    const gold = p2 ? '#ff3355' : '#ffd700';
                    const white = p2 ? '#ffaaaa' : '#ffffff';
                    const paleGold = '#fffacd';

                    // Phase-2 counter-ring (outer shield)
                    if (p2) {
                        ctx.save();
                        ctx.rotate(-time * 0.6);
                        ctx.strokeStyle = 'rgba(255, 51, 85, 0.6)';
                        ctx.lineWidth = 2;
                        ctx.shadowColor = '#ff3355';
                        ctx.shadowBlur = 18;
                        ctx.beginPath();
                        for (let i = 0; i < 7; i++) {
                            const a = i * Math.PI / 3;
                            ctx.lineTo(Math.cos(a) * 260, Math.sin(a) * 260);
                        }
                        ctx.closePath();
                        ctx.stroke();
                        ctx.restore();
                    }
                    
                    // 1. Orbital Rings (Background Layer)
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
                    const rings = 3;
                    for(let i=0; i<rings; i++) {
                        ctx.save();
                        // Wobble rotation
                        ctx.rotate(time * (0.1 + i*0.05) + i);
                        ctx.scale(1, 0.6); // Perspective tilt
                        ctx.beginPath();
                        ctx.arc(0, 0, 180 + i*40, 0, Math.PI*2);
                        ctx.stroke();
                        
                        // Ring Particles
                        const pCount = 3;
                        for(let k=0; k<pCount; k++) {
                            const angle = time * 2 + k * (Math.PI*2/pCount);
                            const px = Math.cos(angle) * (180 + i*40);
                            const py = Math.sin(angle) * (180 + i*40);
                            ctx.fillStyle = gold;
                            ctx.fillRect(px-2, py-2, 4, 4);
                        }
                        ctx.restore();
                    }

                    // 1b. Parallax starfield (windowed through the hypercube)
                    ctx.save();
                    ctx.shadowBlur = 0;
                    for (let layer = 0; layer < 3; layer++) {
                        const speed = 0.05 + layer * 0.08;
                        const count = 18 + layer * 10;
                        const size = 2.5 - layer * 0.6;
                        ctx.globalAlpha = 0.35 + layer * 0.2;
                        ctx.fillStyle = layer === 0 ? paleGold : (layer === 1 ? white : gold);
                        for (let i = 0; i < count; i++) {
                            const seed = i * 97 + layer * 13;
                            const a = (seed % 628) / 100 + time * speed;
                            const r = 40 + ((seed * 7) % 130);
                            const x = Math.cos(a) * r;
                            const y = Math.sin(a) * r * 0.8;
                            const tw = 0.6 + 0.4 * Math.sin(time * 3 + seed);
                            ctx.beginPath(); ctx.arc(x, y, size * tw, 0, Math.PI * 2); ctx.fill();
                        }
                    }
                    ctx.restore();

                    // 1c. Outer rune ring (engraved glyphs, slow counter-rotation)
                    ctx.save();
                    ctx.rotate(-time * 0.15);
                    ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
                    ctx.lineWidth = 1.5;
                    ctx.shadowColor = gold; ctx.shadowBlur = 8;
                    for (let g = 0; g < 12; g++) {
                        const a = g * (Math.PI * 2 / 12);
                        const rx = Math.cos(a) * 230, ry = Math.sin(a) * 230;
                        ctx.save(); ctx.translate(rx, ry); ctx.rotate(a);
                        ctx.beginPath();
                        // Tiny glyph — varies by index for engraved feel
                        if (g % 3 === 0) { ctx.moveTo(-6, -6); ctx.lineTo(6, 0); ctx.lineTo(-6, 6); }
                        else if (g % 3 === 1) { ctx.moveTo(-6, -4); ctx.lineTo(6, -4); ctx.moveTo(-4, 4); ctx.lineTo(4, 4); }
                        else { ctx.arc(0, 0, 5, 0, Math.PI * 1.5); }
                        ctx.stroke();
                        ctx.restore();
                    }
                    ctx.restore();

                    // 2. Outer Geometric Star (Hexagram)
                    ctx.save();
                    ctx.rotate(time * 0.2);
                    ctx.strokeStyle = white;
                    ctx.lineWidth = 3;
                    ctx.shadowColor = gold;
                    ctx.shadowBlur = 20;
                    
                    const drawStar = (rad) => {
                        ctx.beginPath();
                        for(let i=0; i<7; i++) { // 6 points + close
                            const angle = i * Math.PI / 3;
                            const x = Math.cos(angle) * rad;
                            const y = Math.sin(angle) * rad;
                            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    };
                    
                    // Outer bright star
                    drawStar(140);
                    // Inner rotated star
                    ctx.rotate(Math.PI/6); 
                    ctx.strokeStyle = gold;
                    ctx.lineWidth = 2;
                    drawStar(140);
                    ctx.restore();

                    // 3. The Hypercube Core (Nested Polygons)
                    ctx.save();
                    // Counter-rotate core
                    ctx.rotate(-time * 0.5);
                    
                    // Layer 1: White Hexagon
                    ctx.strokeStyle = white;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    for(let i=0; i<6; i++) {
                         const angle = i * Math.PI / 3;
                         ctx.lineTo(Math.cos(angle)*90, Math.sin(angle)*90);
                    }
                    ctx.closePath();
                    ctx.stroke();
                    
                    // Layer 2: Gold Hexagon (Offset)
                    ctx.scale(0.7, 0.7);
                    ctx.rotate(Math.sin(time)*0.5);
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.1)';
                    ctx.strokeStyle = gold;
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    for(let i=0; i<6; i++) {
                         const angle = i * Math.PI / 3;
                         ctx.lineTo(Math.cos(angle)*90, Math.sin(angle)*90);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    
                    // Layer 3: Central Solid Diamond
                    ctx.scale(0.5, 0.5);
                    ctx.rotate(time * 2);
                    ctx.fillStyle = white;
                    ctx.shadowColor = white;
                    ctx.shadowBlur = 50;
                    ctx.beginPath();
                    ctx.rect(-40, -40, 80, 80);
                    ctx.fill();
                    
                    ctx.restore();

                    // 4. God Rays (Radiating Lines)
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.lineWidth = 2;
                    const rays = 8;
                    for(let i=0; i<rays; i++) {
                        const angle = (Math.PI*2/rays) * i + (time * 0.1);
                        ctx.beginPath();
                        ctx.moveTo(Math.cos(angle)*50, Math.sin(angle)*50);
                        ctx.lineTo(Math.cos(angle)*300, Math.sin(angle)*300);
                        ctx.stroke();
                    }

                    // 5. Invincibility Visuals (Tesseract Shield)
                    if (entity.invincibleTurns > 0) {
                        ctx.save();
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth = 3;
                        ctx.setLineDash([5, 10]);
                        ctx.beginPath();
                        ctx.arc(0, 0, 220, 0, Math.PI*2);
                        ctx.stroke();
                        ctx.restore();
                    }

                    ctx.restore();
                }
            }
            
            // =========================================================
            // STANDARD & ELITE ENEMIES (NOT BOSSES)
            // =========================================================
            else {
                // Sector silhouette underlayer — drawn BEFORE the shape so
                // the sector's "aura" sits behind the enemy. Makes the same
                // base chassis read distinctly per sector.
                this.drawSectorEnemyUnderlayer(ctx, entity, time);

                const shape = entity.shape || (entity.name.includes("Drone") ? 'drone' : entity.name.includes("Loader") ? 'tank' : entity.name.includes("Arachnid") ? 'spider' : 'drone');
                if (shape === 'drone' || entity.name.includes("Drone")) {
                    // SENTRY DRONE — gyroscopic chassis, orbiting targeting nodes, pulsing thrusters
                    const hover = Math.sin(time * 2.5) * 10;
                    const bank = Math.sin(time * 1.1) * 0.08;
                    ctx.translate(0, hover);

                    // Down-facing scan cone
                    ctx.save();
                    const scanSweep = Math.sin(time * 1.5) * 0.15;
                    ctx.rotate(scanSweep);
                    const scanLen = 220, scanWidth = 80;
                    const sg = ctx.createLinearGradient(0, 0, 0, scanLen);
                    sg.addColorStop(0, mColor); sg.addColorStop(1, 'transparent');
                    ctx.fillStyle = sg; ctx.globalAlpha = 0.15;
                    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-scanWidth, scanLen);
                    ctx.arc(0, scanLen, scanWidth, Math.PI, 0, true);
                    ctx.lineTo(scanWidth, scanLen); ctx.lineTo(0, 10); ctx.fill();
                    ctx.strokeStyle = mColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
                    const gridSpeed = (time * 80) % 40;
                    ctx.beginPath();
                    for (let i = 0; i < 6; i++) {
                        const y = 30 + (i * 35) + gridSpeed;
                        if (y < scanLen) { const w = (y / scanLen) * scanWidth; ctx.moveTo(-w, y); ctx.lineTo(w, y); }
                    }
                    ctx.stroke(); ctx.restore();

                    ctx.rotate(bank);

                    // Thruster exhaust (two lateral jets)
                    ctx.save();
                    const thrust = 0.6 + Math.sin(time * 12) * 0.4;
                    for (const sx of [-42, 42]) {
                        const tg = ctx.createLinearGradient(sx, 18, sx, 18 + 30 * thrust);
                        tg.addColorStop(0, mColor); tg.addColorStop(1, 'transparent');
                        ctx.fillStyle = tg; ctx.shadowColor = mGlow; ctx.shadowBlur = 18;
                        ctx.beginPath(); ctx.ellipse(sx, 18 + 14 * thrust, 6, 14 * thrust, 0, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.restore();

                    // Armored chassis — layered pentagonal hull
                    ctx.fillStyle = '#0a0a0a';
                    ctx.strokeStyle = mColor; ctx.lineWidth = 3;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.moveTo(-38, -38); ctx.lineTo(38, -38);
                    ctx.lineTo(48, -8); ctx.lineTo(0, 52); ctx.lineTo(-48, -8);
                    ctx.closePath(); ctx.fill(); ctx.stroke();

                    // Inner armor plate seams
                    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.moveTo(-20, -38); ctx.lineTo(-10, 52);
                    ctx.moveTo(20, -38); ctx.lineTo(10, 52);
                    ctx.moveTo(-48, -8); ctx.lineTo(48, -8);
                    ctx.stroke();

                    // Shoulder antenna nubs
                    ctx.fillStyle = mColor; ctx.shadowColor = mGlow; ctx.shadowBlur = 8;
                    ctx.fillRect(-40, -46, 6, 8);
                    ctx.fillRect(34, -46, 6, 8);

                    // Counter-rotating gimbal rings
                    ctx.save(); ctx.lineWidth = 2; ctx.shadowBlur = 10; ctx.strokeStyle = mColor;
                    ctx.beginPath(); ctx.ellipse(0, 0, 60, 20, time * 0.5, 0, Math.PI * 2); ctx.stroke();
                    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath(); ctx.ellipse(0, 0, 45, 12, -time * 1.2, 0, Math.PI * 2); ctx.stroke();
                    ctx.restore();

                    // Central optic — iris with pulsing pupil
                    ctx.save(); ctx.translate(0, -6);
                    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = mColor; ctx.lineWidth = 1.5; ctx.shadowBlur = 0;
                    for (let r = 4; r <= 14; r += 5) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
                    const pupil = 6 + Math.sin(time * 4) * 2;
                    ctx.fillStyle = mColor; ctx.shadowColor = mColor; ctx.shadowBlur = 30;
                    ctx.beginPath(); ctx.arc(0, 0, pupil, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.shadowBlur = 5;
                    ctx.beginPath(); ctx.arc(0, 0, pupil * 0.45, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();

                    // Orbiting targeting nodes
                    ctx.save();
                    for (let i = 0; i < 3; i++) {
                        const a = time * 1.6 + (i * Math.PI * 2 / 3);
                        const nx = Math.cos(a) * 70, ny = Math.sin(a) * 24;
                        ctx.fillStyle = mColor; ctx.shadowColor = mGlow; ctx.shadowBlur = 10;
                        ctx.fillRect(nx - 2, ny - 2, 4, 4);
                    }
                    ctx.restore();
                }
                else if (shape === 'tank' || entity.name.includes("Loader")) {
                    // HEAVY LOADER — anti-grav hover chassis (no treads), twin thrust pods, spinning shoulder turrets
                    const hover = Math.sin(time * 2.0) * 6;
                    ctx.translate(0, hover);

                    // Anti-grav glow beneath chassis
                    ctx.save();
                    const lift = ctx.createRadialGradient(0, 60, 4, 0, 60, 80);
                    lift.addColorStop(0, mColor); lift.addColorStop(0.5, 'rgba(255,255,255,0.15)'); lift.addColorStop(1, 'transparent');
                    ctx.fillStyle = lift; ctx.globalAlpha = 0.7 + Math.sin(time * 6) * 0.15;
                    ctx.beginPath(); ctx.ellipse(0, 60, 80, 18, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();

                    // Lateral thruster pods (replace wheels)
                    ctx.save();
                    for (const side of [-1, 1]) {
                        ctx.save();
                        ctx.translate(side * 55, 0);
                        // Pod housing
                        ctx.fillStyle = '#1a1a1a'; ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
                        ctx.shadowColor = mGlow; ctx.shadowBlur = 12;
                        ctx.beginPath();
                        ctx.moveTo(-10, -36); ctx.lineTo(10, -30); ctx.lineTo(12, 30);
                        ctx.lineTo(-10, 36); ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        // Intake vent bars
                        ctx.strokeStyle = mColor; ctx.lineWidth = 2; ctx.shadowBlur = 6;
                        for (let v = -22; v <= 22; v += 8) {
                            ctx.beginPath(); ctx.moveTo(-6, v); ctx.lineTo(6, v); ctx.stroke();
                        }
                        // Pulsed exhaust puff beneath pod
                        const puff = (time * 2 + (side > 0 ? 0.5 : 0)) % 1;
                        const pr = 6 + puff * 12;
                        const pg = ctx.createRadialGradient(0, 40, 0, 0, 40, pr);
                        pg.addColorStop(0, mColor); pg.addColorStop(1, 'transparent');
                        ctx.fillStyle = pg; ctx.globalAlpha = 1 - puff;
                        ctx.beginPath(); ctx.arc(0, 40, pr, 0, Math.PI * 2); ctx.fill();
                        ctx.restore();
                    }
                    ctx.restore();

                    // Main chassis — layered hex plate with rivets
                    ctx.fillStyle = '#1a1a1a';
                    ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
                    ctx.beginPath();
                    ctx.moveTo(-42, -30); ctx.lineTo(-30, -46); ctx.lineTo(30, -46);
                    ctx.lineTo(42, -30); ctx.lineTo(42, 30); ctx.lineTo(30, 46);
                    ctx.lineTo(-30, 46); ctx.lineTo(-42, 30); ctx.closePath();
                    ctx.fill(); ctx.stroke();
                    ctx.fillStyle = '#555';
                    for (const [rx, ry] of [[-34, -38], [34, -38], [-34, 38], [34, 38], [-42, 0], [42, 0]]) {
                        ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI * 2); ctx.fill();
                    }

                    // Animated energy vents (horizontal plasma slits)
                    ctx.save();
                    const ventPulse = 0.5 + Math.sin(time * 4) * 0.5;
                    ctx.fillStyle = mColor; ctx.shadowColor = mGlow; ctx.shadowBlur = 14;
                    ctx.globalAlpha = 0.6 + ventPulse * 0.4;
                    ctx.fillRect(-20, -24, 40, 3);
                    ctx.fillRect(-20, 21, 40, 3);
                    ctx.restore();

                    // Inner armored faceplate (hex)
                    ctx.fillStyle = '#222'; ctx.strokeStyle = mColor; ctx.lineWidth = 2;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 10;
                    ctx.beginPath();
                    ctx.moveTo(-28, -16); ctx.lineTo(28, -16); ctx.lineTo(34, 0);
                    ctx.lineTo(28, 16); ctx.lineTo(-28, 16); ctx.lineTo(-34, 0);
                    ctx.closePath(); ctx.fill(); ctx.stroke();

                    // Reactor core — pulsing iris
                    ctx.save();
                    ctx.rotate(time * 0.6);
                    ctx.strokeStyle = mColor; ctx.lineWidth = 1.5; ctx.shadowBlur = 6;
                    for (let k = 0; k < 6; k++) {
                        ctx.rotate(Math.PI / 3);
                        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(3, -8); ctx.lineTo(-3, -8); ctx.closePath(); ctx.stroke();
                    }
                    ctx.restore();
                    const corePulse = 8 + Math.sin(time * 5) * 2;
                    ctx.fillStyle = (this.sector === 2) ? '#fff' : '#ffaa00';
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 24;
                    ctx.beginPath(); ctx.arc(0, 0, corePulse, 0, Math.PI * 2); ctx.fill();

                    // Shoulder turrets (spinning)
                    ctx.save();
                    for (const side of [-1, 1]) {
                        ctx.save();
                        ctx.translate(side * 22, -40);
                        ctx.rotate(time * 1.4 * side);
                        ctx.fillStyle = '#333'; ctx.strokeStyle = mColor; ctx.lineWidth = 1.5; ctx.shadowBlur = 8;
                        ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                        ctx.fillStyle = mColor;
                        ctx.fillRect(-1.5, -14, 3, 6);
                        ctx.restore();
                    }
                    ctx.restore();
                }
                else if (shape === 'spider' || entity.name.includes("Arachnid")) {
                    // CYBER ARACHNID — articulated legs, mandibles, circuit-lit abdomen
                    // Abdomen (rear)
                    ctx.save();
                    ctx.translate(0, 10);
                    ctx.fillStyle = '#0a0a0a'; ctx.strokeStyle = mColor; ctx.lineWidth = 2;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 14;
                    ctx.beginPath(); ctx.ellipse(0, 18, 22, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                    // Circuit runes along abdomen
                    ctx.strokeStyle = mColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.4;
                    ctx.shadowBlur = 6;
                    ctx.beginPath();
                    ctx.moveTo(-10, 8); ctx.lineTo(-10, 20); ctx.lineTo(-4, 26);
                    ctx.moveTo(10, 8); ctx.lineTo(10, 20); ctx.lineTo(4, 26);
                    ctx.moveTo(0, 4); ctx.lineTo(0, 34);
                    ctx.stroke();
                    ctx.restore();

                    // Articulated legs (3-segment, sinusoidal gait)
                    ctx.lineCap = 'round';
                    for (let i = 0; i < 8; i++) {
                        const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
                        const phase = Math.sin(time * 3 + i * 0.8);
                        const lift = Math.max(0, phase) * 4;
                        const cx = Math.cos(angle), cy = Math.sin(angle);
                        // Hip
                        const hx = cx * 18, hy = cy * 18;
                        // Knee (raised above hip toward the body perimeter, outward)
                        const kx = cx * 38 + cy * 6, ky = cy * 38 - 14 - lift;
                        // Foot
                        const fx = cx * 62 + cy * 2, fy = cy * 62 + 6;
                        const lg = ctx.createLinearGradient(hx, hy, fx, fy);
                        lg.addColorStop(0, mColor); lg.addColorStop(1, '#000');
                        ctx.strokeStyle = lg; ctx.lineWidth = 3; ctx.shadowColor = mGlow; ctx.shadowBlur = 6;
                        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
                        // Joint highlight
                        ctx.fillStyle = mColor; ctx.shadowBlur = 10;
                        ctx.beginPath(); ctx.arc(kx, ky, 2, 0, Math.PI * 2); ctx.fill();
                    }
                    ctx.lineCap = 'butt';

                    // Cephalothorax (main body)
                    ctx.fillStyle = '#111'; ctx.strokeStyle = mColor; ctx.lineWidth = 3;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 15;
                    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

                    // Mandibles (animated clack)
                    ctx.save();
                    const clack = Math.abs(Math.sin(time * 4)) * 0.25;
                    ctx.strokeStyle = mColor; ctx.lineWidth = 2.5; ctx.shadowBlur = 8;
                    for (const side of [-1, 1]) {
                        ctx.save(); ctx.translate(side * 6, -18); ctx.rotate(side * clack);
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(side * 6, -10); ctx.stroke();
                        ctx.restore();
                    }
                    ctx.restore();

                    // Eye cluster (4 eyes, central primary)
                    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 20;
                    ctx.beginPath(); ctx.arc(0, -4, 6, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = mColor; ctx.shadowColor = mGlow; ctx.shadowBlur = 10;
                    for (const [ex, ey, er] of [[-8, -10, 2], [8, -10, 2], [-10, 2, 1.5], [10, 2, 1.5]]) {
                        ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
                    }
                }
                else if (shape === 'wisp') {
                    // WISP — ethereal plasma core, orbiting glyph shards, drifting tendrils
                    const bob = Math.sin(time * 3) * 6;
                    ctx.translate(0, bob);

                    // Trailing smoke tendrils below
                    ctx.save();
                    ctx.strokeStyle = mColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 10;
                    for (let i = 0; i < 3; i++) {
                        const off = i * 1.1;
                        ctx.beginPath(); ctx.moveTo(Math.sin(time + off) * 8, 20);
                        for (let y = 20; y < 90; y += 6) {
                            const x = Math.sin(time * 2 + y * 0.1 + off) * (10 + (y - 20) * 0.25);
                            ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                    }
                    ctx.restore();

                    // Outer halo
                    const haloGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 80);
                    haloGrad.addColorStop(0, mColor);
                    haloGrad.addColorStop(0.4, 'rgba(255,255,255,0.25)');
                    haloGrad.addColorStop(1, 'transparent');
                    ctx.fillStyle = haloGrad;
                    ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.fill();

                    // Flame petals (8, layered)
                    ctx.save();
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 28;
                    ctx.fillStyle = mColor;
                    const petals = 8;
                    for (let i = 0; i < petals; i++) {
                        const a = (Math.PI * 2 / petals) * i + time * 1.2;
                        const r = 38 + Math.sin(time * 4 + i) * 8;
                        ctx.beginPath();
                        ctx.moveTo(0, 0);
                        ctx.quadraticCurveTo(Math.cos(a + 0.18) * r * 0.5, Math.sin(a + 0.18) * r * 0.5, Math.cos(a) * r, Math.sin(a) * r);
                        ctx.quadraticCurveTo(Math.cos(a - 0.18) * r * 0.5, Math.sin(a - 0.18) * r * 0.5, 0, 0);
                        ctx.fill();
                    }
                    ctx.restore();

                    // Orbiting glyph shards
                    ctx.save();
                    ctx.strokeStyle = mColor; ctx.fillStyle = '#050505'; ctx.lineWidth = 1.5;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 8;
                    for (let i = 0; i < 4; i++) {
                        const a = time * 0.9 + i * (Math.PI / 2);
                        const rx = Math.cos(a) * 52, ry = Math.sin(a) * 52;
                        ctx.save(); ctx.translate(rx, ry); ctx.rotate(a + time);
                        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(6, 0); ctx.lineTo(0, 6); ctx.lineTo(-6, 0); ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        ctx.restore();
                    }
                    ctx.restore();

                    // Eye pupil inside bright core
                    ctx.save();
                    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 25;
                    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#000'; ctx.shadowBlur = 0;
                    const look = Math.sin(time * 0.8);
                    ctx.beginPath(); ctx.ellipse(look * 2, 0, 2, 6, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();

                    if (Math.random() < 0.5) {
                        ParticleSys.createTrail(entity.x + (Math.random() - 0.5) * 20, entity.y + 30 + bob, mColor, 0.4);
                    }
                }
                else if (shape === 'sniper') {
                    // SNIPER — floating chassis, articulated stabilizer fins, laser sight, charging muzzle
                    const hover = Math.sin(time * 1.8) * 5;
                    const sway = Math.sin(time * 1.1) * 3;
                    ctx.translate(sway, hover);

                    const charge = (Math.sin(time * 2) + 1) * 0.5; // 0..1

                    // Laser sight line (downrange, threat indicator)
                    ctx.save();
                    ctx.strokeStyle = mColor; ctx.lineWidth = 1; ctx.globalAlpha = 0.35 + charge * 0.35;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 6; ctx.setLineDash([4, 6]);
                    ctx.beginPath(); ctx.moveTo(0, -118); ctx.lineTo(0, -260); ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.restore();

                    // Hover glow pad
                    ctx.save();
                    const pad = ctx.createRadialGradient(0, 48, 2, 0, 48, 40);
                    pad.addColorStop(0, mColor); pad.addColorStop(1, 'transparent');
                    ctx.fillStyle = pad; ctx.globalAlpha = 0.6;
                    ctx.beginPath(); ctx.ellipse(0, 48, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();

                    // Stabilizer fins (flared, animated)
                    ctx.save();
                    const flare = 0.8 + Math.sin(time * 2) * 0.2;
                    ctx.fillStyle = '#111'; ctx.strokeStyle = mColor; ctx.lineWidth = 2;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 10;
                    for (const side of [-1, 1]) {
                        ctx.beginPath();
                        ctx.moveTo(side * 12, 10);
                        ctx.lineTo(side * 26 * flare, 28);
                        ctx.lineTo(side * 22 * flare, 44);
                        ctx.lineTo(side * 10, 40);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                    }
                    ctx.restore();

                    // Body
                    ctx.fillStyle = '#0a0a0a';
                    ctx.strokeStyle = mColor; ctx.lineWidth = 3;
                    ctx.shadowColor = mGlow; ctx.shadowBlur = 16;
                    ctx.beginPath();
                    ctx.moveTo(0, -60); ctx.lineTo(18, -30);
                    ctx.lineTo(12, 40); ctx.lineTo(-12, 40);
                    ctx.lineTo(-18, -30); ctx.closePath();
                    ctx.fill(); ctx.stroke();

                    // Chest plate seam + rail
                    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(10, -20); ctx.moveTo(0, -60); ctx.lineTo(0, 40); ctx.stroke();

                    // Barrel with cooling fins
                    ctx.strokeStyle = '#666'; ctx.lineWidth = 6; ctx.shadowBlur = 0;
                    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -112); ctx.stroke();
                    ctx.strokeStyle = mColor; ctx.lineWidth = 1.5; ctx.shadowColor = mGlow; ctx.shadowBlur = 8;
                    for (let f = -100; f <= -70; f += 8) {
                        ctx.beginPath(); ctx.moveTo(-6, f); ctx.lineTo(6, f); ctx.stroke();
                    }

                    // Charging muzzle glow
                    ctx.fillStyle = mColor; ctx.shadowColor = mGlow; ctx.shadowBlur = 10 + charge * 34;
                    ctx.beginPath(); ctx.arc(0, -112, 4 + charge * 9, 0, Math.PI * 2); ctx.fill();

                    // Scope eye with rotating reticle
                    ctx.save();
                    ctx.translate(0, -22);
                    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 12;
                    ctx.beginPath(); ctx.arc(0, 0, 5 + charge * 2, 0, Math.PI * 2); ctx.fill();
                    ctx.rotate(time * 2);
                    ctx.strokeStyle = mColor; ctx.lineWidth = 1; ctx.shadowBlur = 4;
                    ctx.beginPath();
                    ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
                    ctx.moveTo(0, -10); ctx.lineTo(0, 10);
                    ctx.stroke();
                    ctx.restore();
                }
                else {
                    // Generic Fallback
                    this.drawSpikedCircle(ctx, 0, 0, entity.radius, 6, 5, time);
                    ctx.fillStyle = mColor; ctx.globalAlpha = 0.3;
                    ctx.beginPath(); ctx.arc(0, 0, entity.radius * 0.5, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }

                // Sector-thematic decoration pass — overlays unique flavor on
                // top of the base shape so the same 'drone' chassis reads
                // totally different between Sector 1 (surveillance) and
                // Sector 3 (forged-in-fire).
                this.drawSectorEnemyAccents(ctx, entity, time);
            }
        }

        // ============================================================
        // 4. ENEMY MINIONS (Unified Elite Design + Mobile Fix)
        // ============================================================
        else if (entity instanceof Minion && !entity.isPlayerSide) {
            
            let mColor = '#ff0055'; let mGlow = '#ff0055'; let mFill = '#1a0505';
            if (this.sector === 1) { mColor = '#00ffff'; mGlow = '#00ffff'; mFill = '#001111'; }
            else if (this.sector === 2) { mColor = '#ff00ff'; mGlow = '#ff00ff'; mFill = '#110011'; }
            else if (this.sector === 3) { mColor = '#ff4500'; mGlow = '#ff4500'; mFill = '#1a0500'; }
            else if (this.sector === 4) { mColor = '#32cd32'; mGlow = '#32cd32'; mFill = '#051a05'; }
            else if (this.sector === 5) { mColor = '#ffffff'; mGlow = '#ffd700'; mFill = '#111111'; }

            // Tether back to owning enemy (drawn before inner scale so coords map cleanly).
            // Outer scale applied upstream is finalScale (≈1.6 for enemies); dividing undoes it.
            if (this.enemy && this.enemy !== entity && this.enemy.currentHp > 0) {
                const outerScale = 1.6;
                const tx = (this.enemy.x - entity.x) / outerScale;
                const ty = (this.enemy.y - entity.y) / outerScale;
                ctx.save();
                ctx.strokeStyle = mColor; ctx.lineWidth = 1;
                ctx.globalAlpha = 0.35 + 0.15 * Math.sin(time * 4);
                ctx.shadowColor = mGlow; ctx.shadowBlur = 6;
                ctx.setLineDash([3, 5]);
                // Data-packet flow offset
                ctx.lineDashOffset = -time * 20;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(tx, ty); ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            ctx.save();
            ctx.scale(1.8, 1.8);
            
            // Tier 3 or Named Minions (Boss Minions) use the Safe "Elite" Design
            // --- VOID SPAWN (eldritch tentacled horror) ---
            if (entity.isVoidSpawn) {
                const voidPurple = '#bc13fe';
                const voidDark = '#1a0022';
                const breathing = 1 + 0.08 * Math.sin(time * 2.3);

                // Dark pooling aura beneath the spawn
                const aur = ctx.createRadialGradient(0, 0, 0, 0, 0, 44);
                aur.addColorStop(0, 'rgba(60, 0, 80, 0.85)');
                aur.addColorStop(0.5, 'rgba(40, 0, 60, 0.55)');
                aur.addColorStop(1, 'rgba(20, 0, 30, 0)');
                ctx.fillStyle = aur;
                ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.fill();

                // Writhing tendrils radiating outward (6 arms, each wavy)
                const arms = 6;
                ctx.lineCap = 'round';
                for (let a = 0; a < arms; a++) {
                    const baseAngle = (Math.PI * 2 / arms) * a + Math.sin(time * 0.8 + a) * 0.3;
                    const armLen = 26 + Math.sin(time * 1.6 + a * 1.3) * 6;
                    ctx.beginPath();
                    ctx.moveTo(0, 0);
                    const segs = 10;
                    for (let s = 1; s <= segs; s++) {
                        const t = s / segs;
                        const curl = Math.sin(time * 3 + a + t * 5) * 8 * t;
                        const ang = baseAngle + curl * 0.08;
                        const r = armLen * t;
                        ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
                    }
                    ctx.strokeStyle = a % 2 === 0 ? voidDark : voidPurple;
                    ctx.lineWidth = 3.2 - 0.12 * a;
                    ctx.shadowColor = voidPurple;
                    ctx.shadowBlur = 12;
                    ctx.stroke();
                }

                // Core bulb — dark body with a glowing purple center
                ctx.save();
                ctx.scale(breathing, breathing);
                ctx.fillStyle = voidDark;
                ctx.strokeStyle = voidPurple;
                ctx.lineWidth = 1.8;
                ctx.shadowColor = voidPurple;
                ctx.shadowBlur = 18;
                ctx.beginPath();
                // Lumpy bulb shape (not a clean circle)
                const bulbPts = 14;
                for (let p = 0; p <= bulbPts; p++) {
                    const a = (Math.PI * 2 / bulbPts) * p;
                    const wobble = 14 + Math.sin(time * 3 + p * 1.7) * 2.5;
                    if (p === 0) ctx.moveTo(Math.cos(a) * wobble, Math.sin(a) * wobble);
                    else ctx.lineTo(Math.cos(a) * wobble, Math.sin(a) * wobble);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke();

                // Unblinking eye in the middle — pupil tracks the player
                const targetX = Game.player ? (Game.player.x - entity.x) : 0;
                const targetY = Game.player ? (Game.player.y - entity.y) : 0;
                const tMag = Math.hypot(targetX, targetY) || 1;
                const puDx = (targetX / tMag) * 3;
                const puDy = (targetY / tMag) * 3;
                const eyeBlink = (Math.sin(time * 0.35) > 0.97) ? 0.1 : 1; // rare slow blink
                ctx.fillStyle = `rgba(255, 210, 255, ${0.9 * eyeBlink})`;
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 14;
                ctx.beginPath();
                ctx.ellipse(0, 0, 6, 6 * eyeBlink, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(puDx, puDy, 2.4, 0, Math.PI * 2);
                ctx.fill();
                // Slit pupil highlight
                ctx.fillStyle = voidPurple;
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.arc(puDx - 1, puDy - 1, 0.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;

                ctx.restore();

                // Drifting ember motes orbiting the spawn
                ctx.fillStyle = voidPurple;
                ctx.shadowColor = voidPurple; ctx.shadowBlur = 10;
                for (let m = 0; m < 5; m++) {
                    const oa = time * 1.2 + m * 1.25;
                    const orb = 30 + Math.sin(time * 2 + m) * 4;
                    ctx.beginPath();
                    ctx.arc(Math.cos(oa) * orb, Math.sin(oa) * orb, 1.4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            else if (entity.tier === 3 || entity.name.includes("Glitch") || entity.name.includes("Guardian")) {
                const pulse = 1 + 0.05 * Math.sin(time * 4);
                ctx.scale(pulse, pulse);
                ctx.save(); ctx.rotate(time * 0.8); 
                ctx.strokeStyle = mColor; ctx.lineWidth = 2; ctx.shadowColor = mGlow; ctx.shadowBlur = 15; ctx.fillStyle = mFill;
                ctx.beginPath();
                const spikes = 4;
                for(let i=0; i<spikes*2; i++) {
                    const r = (i%2 === 0) ? 22 : 10;
                    const a = (Math.PI / spikes) * i;
                    ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
                }
                ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
                
                ctx.save(); ctx.rotate(-time * 1.5); ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.rect(-4, -4, 8, 8); ctx.fill(); ctx.restore();

                // Solid Ring (Safe)
                ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2);
                ctx.strokeStyle = mColor; ctx.lineWidth = 1.5; ctx.stroke();

                ctx.save(); ctx.rotate(time * 0.5);
                for(let k=0; k<4; k++) {
                    ctx.rotate(Math.PI/2); ctx.fillStyle = mColor; ctx.shadowBlur = 5; ctx.fillRect(0, -30, 3, 3);
                }
                ctx.restore();
                
            } 
            else {
                // Standard Minion (Prism)
                const hover = Math.sin(time * 3) * 3;
                ctx.save(); ctx.translate(0, hover);
                ctx.fillStyle = mFill; ctx.strokeStyle = mColor; ctx.lineWidth = 2; ctx.shadowColor = mGlow; ctx.shadowBlur = 10;
                ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(10, 0); ctx.lineTo(0, 25); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
                
                const corePulse = 0.5 + 0.5 * Math.sin(time * 8);
                ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + corePulse * 0.5})`; ctx.shadowColor = '#fff';
                ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3, 0); ctx.lineTo(0, 10); ctx.lineTo(-3, 0); ctx.fill();
                ctx.restore();
                
                ctx.save(); ctx.rotate(Math.sin(time) * 0.2); 
                ctx.strokeStyle = mColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
                ctx.beginPath(); ctx.moveTo(-18, -10 + hover); ctx.lineTo(-22, 0 + hover); ctx.lineTo(-18, 15 + hover); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(18, -10 + hover); ctx.lineTo(22, 0 + hover); ctx.lineTo(18, 15 + hover); ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
        }

        // --- FLASH EFFECT (On Hit) ---
        if (entity.flashTimer > 0) {
            ctx.globalCompositeOperation = 'source-atop';
            ctx.fillStyle = `rgba(255, 255, 255, ${entity.flashTimer * 3})`; 
            ctx.fillRect(-100, -100, 200, 200); 
            ctx.globalCompositeOperation = 'source-over';
        }

        // --- SHIELD VISUAL (MOBILE SAFE) ---
        if (entity.shield > 0) {
            // Pick a themed palette + a style variant based on who the shield belongs to.
            // Player / player minions → class color (class aegis).
            // Bosses → boss color with a heavier containment-field look.
            // Regular enemies / enemy minions → sector color (mesh grid).
            const SECTOR_SHIELD = { 1: '#00f3ff', 2: '#88eaff', 3: '#ff8800', 4: '#bc13fe', 5: '#ff3355' };
            let base = '#00f3ff';
            let style = 'hex'; // 'hex' | 'aegis' | 'containment' | 'mesh'
            if (entity instanceof Player) {
                base = entity.classColor || '#00f3ff';
                style = 'aegis';
            } else if (entity instanceof Minion) {
                if (entity.isPlayerSide && this.player && this.player.classColor) {
                    base = this.player.classColor;
                    style = 'aegis';
                } else {
                    base = SECTOR_SHIELD[this.sector] || '#00f3ff';
                    style = 'mesh';
                }
            } else if (entity instanceof Enemy) {
                if (entity.isBoss && entity.bossData && entity.bossData.color) {
                    base = entity.bossData.color;
                    style = 'containment';
                } else {
                    base = SECTOR_SHIELD[this.sector] || '#00f3ff';
                    style = 'mesh';
                }
            }
            // Sentinel's class color is pure white — tint the shield slightly cyan so the
            // plating reads against the white body, and switch to aegis style (double-plated).
            if (base.toLowerCase() === '#ffffff') base = '#e6fbff';

            // Hex → rgb so we can build rgba strings for the bubble gradient.
            const hx = base.replace('#', '');
            const full = hx.length === 3 ? hx.split('').map(c => c + c).join('') : hx;
            const rv = parseInt(full.slice(0, 2), 16);
            const gv = parseInt(full.slice(2, 4), 16);
            const bv = parseInt(full.slice(4, 6), 16);
            const rgba = (a) => `rgba(${rv},${gv},${bv},${a})`;

            ctx.save();
            const r = entity.radius + 15;
            const intensity = Math.min(1, entity.shield / 20);
            const pulse = 0.5 + 0.5 * Math.sin(time * 3);
            const tier = entity.shield >= 30 ? 2 : (entity.shield >= 10 ? 1 : 0);

            // Inner bubble — soft radial glow to sell the "barrier" volume.
            const bubble = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
            bubble.addColorStop(0, rgba(0));
            bubble.addColorStop(0.78, rgba(0.08 + intensity * 0.08));
            bubble.addColorStop(1, rgba(0.22 + intensity * 0.2));
            ctx.fillStyle = bubble;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();

            // Primary ring — glowing hull in theme color.
            ctx.shadowColor = base;
            ctx.shadowBlur = 12 + pulse * 8;
            ctx.strokeStyle = base;
            ctx.lineWidth = 2.5 + intensity * 1.5;
            ctx.globalAlpha = 0.75 + pulse * 0.2;
            ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();

            if (style === 'containment') {
                // Boss — three heavy plates, counter-rotating chevron runes. Feels aggressive.
                ctx.shadowBlur = 0;
                ctx.lineWidth = 6 + tier * 1.5;
                ctx.strokeStyle = rgba(0.7 + pulse * 0.2);
                const rot = -time * 0.35;
                const plates = 3;
                const segP = (Math.PI * 2) / plates;
                const gapP = 0.55;
                for (let i = 0; i < plates; i++) {
                    const a0 = rot + i * segP + gapP * 0.5;
                    const a1 = rot + (i + 1) * segP - gapP * 0.5;
                    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
                }
                // Counter-rotating inner chevron markers.
                ctx.lineWidth = 2;
                ctx.strokeStyle = rgba(0.9);
                ctx.shadowColor = base; ctx.shadowBlur = 10;
                const rotI = time * 0.7;
                for (let i = 0; i < 3; i++) {
                    const a = rotI + i * ((Math.PI * 2) / 3);
                    const cx = Math.cos(a) * (r - 14);
                    const cy = Math.sin(a) * (r - 14);
                    ctx.beginPath();
                    ctx.moveTo(cx - 8, cy);
                    ctx.lineTo(cx, cy - 6);
                    ctx.lineTo(cx + 8, cy);
                    ctx.stroke();
                }
                // Rivet pips at plate joints.
                ctx.shadowBlur = 14;
                ctx.fillStyle = '#fff';
                for (let i = 0; i < plates; i++) {
                    const a = rot + i * segP;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 4 + pulse * 1.5, 0, Math.PI * 2); ctx.fill();
                }
            } else if (style === 'mesh') {
                // Regular enemy / enemy minion — dashed mesh grid. Feels like hostile firmware.
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 0.55 + pulse * 0.2;
                ctx.lineWidth = 2;
                ctx.strokeStyle = rgba(0.75);
                ctx.setLineDash([8, 6]);
                ctx.lineDashOffset = -time * 14;
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
                ctx.setLineDash([]);
                // Triangular nodes at cardinal points.
                ctx.fillStyle = rgba(0.95);
                ctx.shadowColor = base; ctx.shadowBlur = 8;
                const rotM = time * 0.35;
                for (let i = 0; i < 4; i++) {
                    const a = rotM + i * (Math.PI / 2);
                    const nx = Math.cos(a) * r;
                    const ny = Math.sin(a) * r;
                    ctx.save();
                    ctx.translate(nx, ny);
                    ctx.rotate(a + Math.PI / 2);
                    ctx.beginPath();
                    ctx.moveTo(0, -4); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
            } else {
                // Aegis (default / player / allied minion) — six hex plates + rivet pips.
                ctx.shadowBlur = 0;
                ctx.lineWidth = 4 + tier * 1.2;
                ctx.strokeStyle = rgba(0.65 + pulse * 0.25);
                const rot = time * 0.25;
                const seg = Math.PI / 3;
                const gap = 0.18;
                for (let i = 0; i < 6; i++) {
                    const a0 = rot + i * seg + gap * 0.5;
                    const a1 = rot + (i + 1) * seg - gap * 0.5;
                    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1); ctx.stroke();
                }
                // Rivet nodes at joints — bright white core.
                ctx.shadowColor = base;
                ctx.shadowBlur = 10;
                ctx.fillStyle = '#ffffff';
                for (let i = 0; i < 6; i++) {
                    const a = rot + i * seg;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 2.5 + pulse * 1.2, 0, Math.PI * 2); ctx.fill();
                }
                // Heavy-shield inner ring once stacks accumulate.
                if (tier >= 1) {
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 0.5 + pulse * 0.2;
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = base;
                    ctx.beginPath(); ctx.arc(0, 0, r - 6, 0, Math.PI * 2); ctx.stroke();
                }
            }
            ctx.restore();
        }

        // --- DEBUFF VISUALS ---
        if (entity.hasEffect('weak')) { ctx.strokeStyle = 'rgba(0, 0, 50, 0.5)'; ctx.lineWidth = 2; const offset = (time * 20) % 20; ctx.beginPath(); for(let y = -entity.radius; y < entity.radius; y+=10) { ctx.moveTo(-entity.radius, y + offset); ctx.lineTo(entity.radius, y + offset); } ctx.stroke(); }
        if (entity.hasEffect('frail')) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; ctx.lineWidth = 1; ctx.beginPath(); const seed = entity.name.length; for(let k=0; k<3; k++) { ctx.moveTo(Math.sin(seed+k)*20, Math.cos(seed+k)*20); ctx.lineTo(Math.sin(seed+k+1)*40, Math.cos(seed+k+1)*40); } ctx.stroke(); }
        if ((entity instanceof Player && entity.traits.vulnerable) || entity.hasEffect('vulnerable')) { ctx.rotate(time); ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(0, 0, entity.radius + 15, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]); }

        // --- ENEMY INTENT ICON ---
        if (entity instanceof Enemy && ((entity.nextIntents && entity.nextIntents.length > 0) || entity.nextIntent)) {
            ctx.restore(); 
            ctx.save();
            ctx.translate(renderX, renderY);
            
            if (entity.nextIntents && entity.nextIntents.length > 0) {
                const count = entity.nextIntents.length;
                const spacing = 60;
                const startX = -((count - 1) * spacing) / 2;

                // Ping envelope: 0..1 in the first ~450ms after refresh,
                // drives a scale pulse + halo so the player notices the change.
                const pingAge = entity.intentRefreshedAt ? (time - entity.intentRefreshedAt) : 999;
                const pingT = Math.max(0, Math.min(1, 1 - pingAge / 0.45));

                for(let i=0; i<count; i++) {
                    const intent = entity.nextIntents[i];
                    const ix = startX + (i * spacing);
                    const iy = -entity.radius - 130 + (Math.cos(time * 5 + i) * 5);

                    // Apply ping scale around each icon's center
                    const pingScale = 1 + pingT * 0.35;
                    ctx.save();
                    ctx.translate(ix, iy + 25);
                    ctx.scale(pingScale, pingScale);
                    ctx.translate(-ix, -(iy + 25));

                    // Ping halo behind the icon as it shrinks back to rest
                    if (pingT > 0) {
                        ctx.save();
                        ctx.globalAlpha = pingT * 0.75;
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2 + pingT * 2;
                        ctx.strokeRect(ix - 25 - pingT * 10, iy - pingT * 10, 50 + pingT * 20, 50 + pingT * 20);
                        ctx.restore();
                    }

                    ctx.fillStyle = COLORS.MECH_LIGHT; ctx.fillRect(ix - 25, iy, 50, 50);
                    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(ix - 25, iy, 50, 50);
                    
                    // Canvas-native icon (no image loading — always renders identically).
                    // Covers the 14 expansion-kind intents too so those enemies don't
                    // fall back to the generic "?" glyph in `drawIntentIcon`.
                    let iconColor = '#ffffff';
                    if      (intent.type === 'heal')              iconColor = '#00ff99';
                    else if (intent.type === 'shield')            iconColor = '#00f3ff';
                    else if (intent.type === 'buff')              iconColor = '#ffd76a';
                    else if (intent.type === 'debuff')            iconColor = '#d97bff';
                    else if (intent.type === 'consume')           iconColor = '#ff8800';
                    else if (intent.type === 'charge' || intent.type === 'purge_attack') iconColor = '#ff3355';
                    else if (intent.type === 'reality_overwrite') iconColor = '#bc13fe';
                    else if (intent.type === 'dispel')            iconColor = '#ffd76a';
                    else if (intent.type === 'summon' || intent.type === 'summon_glitch') iconColor = '#00f3ff';
                    else if (intent.type === 'summon_void')       iconColor = '#ff00ff';
                    // Expansion (5.2.1) intent types — colored per gameplay role.
                    else if (intent.type === 'aoe_sweep')         iconColor = '#ff3355';
                    else if (intent.type === 'mirror_attack')     iconColor = '#00f3ff';
                    else if (intent.type === 'frost_aoe')         iconColor = '#88eaff';
                    else if (intent.type === 'immolate')          iconColor = '#ff6600';
                    else if (intent.type === 'charging_immolate') iconColor = '#ffaa00';
                    else if (intent.type === 'burrow_idle')       iconColor = '#886655';
                    else if (intent.type === 'burrow_resurge')    iconColor = '#cc6600';
                    else if (intent.type === 'observer_wait')     iconColor = '#888899';
                    else if (intent.type === 'observer_strike')   iconColor = '#ff3355';
                    else if (intent.type === 'chaotic_act')       iconColor = '#bc13fe';
                    else if (intent.type === 'heal_ally')         iconColor = '#7fff00';
                    else if (intent.type === 'shield_ally')       iconColor = '#00f3ff';
                    else if (intent.type === 'buff_allies')       iconColor = '#ffd76a';
                    else if (intent.type === 'shield_strip_attack') iconColor = '#ff66aa';

                    // Map each expansion intent to a known icon shape so
                    // `drawIntentIcon` doesn't render a question-mark placeholder.
                    const INTENT_ICON_ALIAS = {
                        summon_void:           'intentSummon',
                        aoe_sweep:             'multi_attack',
                        mirror_attack:         'attack',
                        frost_aoe:             'multi_attack',
                        immolate:              'multi_attack',
                        charging_immolate:     'charge',
                        burrow_idle:           'buff',          // inert / still — buff glyph reads as "nothing attacking"
                        burrow_resurge:        'attack',
                        observer_wait:         'buff',
                        observer_strike:       'attack',
                        chaotic_act:           'attack',
                        heal_ally:             'heal',
                        shield_ally:           'shield',
                        buff_allies:           'buff',
                        shield_strip_attack:   'attack'
                    };
                    const drawIntentType = INTENT_ICON_ALIAS[intent.type] || intent.type;
                    drawIntentIcon(ctx, drawIntentType, ix, iy + 26, 36, iconColor);

                    const displayVal = (intent.effectiveVal !== undefined) ? intent.effectiveVal : intent.val;
                    // Custom Run: Dark Visions — hide the damage number so
                    // the player has to read the icon + their own HP math.
                    if(displayVal !== undefined && displayVal > 0 && !this._customHideIntentNumbers) {
                        ctx.font = 'bold 24px "Orbitron"';
                        ctx.fillStyle = (intent.type === 'heal') ? '#0f0' : '#fff';
                        ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
                        ctx.fillText(displayVal, ix, iy - 5);
                    }
                    ctx.restore(); // close ping-scale transform
                }
            } else {
                const hover = Math.cos(time * 5) * 5;
                ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.shadowBlur = 0;
                let iconName = 'intentAttack', iconColor = '#ffffff';
                if      (entity.nextIntent.type === 'heal')   { iconName = 'intentHeal';   iconColor = '#00ff99'; }
                else if (entity.nextIntent.type === 'summon') { iconName = 'intentSummon'; iconColor = '#00f3ff'; }
                drawIntentIcon(ctx, entity.nextIntent.type, 0, -entity.radius - 88 + hover, 44, iconColor);
                const val = (entity.nextIntent.effectiveVal !== undefined) ? entity.nextIntent.effectiveVal : entity.nextIntent.val;
                // Custom Run: Dark Visions hides the intent damage number.
                if(val > 0 && !this._customHideIntentNumbers) {
                    // Embossed HP-style: black outline + white fill (green fill if heal).
                    ctx.font = 'bold 30px "Orbitron"';
                    ctx.textBaseline = 'middle';
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = '#000';
                    ctx.strokeText(val, 0, -entity.radius - 60 + hover);
                    ctx.fillStyle = (entity.nextIntent.type === 'heal') ? '#0f0' : '#fff';
                    ctx.fillText(val, 0, -entity.radius - 60 + hover);
                }
            }
            ctx.restore();
            return; 
        }

        ctx.restore(); 

        // --- SPAWN SCANLINE (NO CLIP) ---
        if (isSpawning) {
            const scanY = entity.y + entity.radius - (entity.radius * 2 * (1.0 - Math.max(0, entity.spawnTimer)));
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(entity.x - entity.radius, scanY);
            ctx.lineTo(entity.x + entity.radius, scanY);
            ctx.stroke();
            ctx.restore(); 
        }
    },

// --- TUTORIAL SYSTEM ---

    startTutorial() {
        this.changeState(STATE.TUTORIAL_COMBAT);
        this.tutorialStep = 0;

        // Mark body for auto-run so CSS can suppress the legacy tutorial-text overlay.
        document.body.classList.toggle('tutorial-auto-run', !!this.tutorialAutoRun);

        // If we're running this BEFORE the player picked a class (manual Training Mode),
        // spawn a mock player. For Phase 3 auto-run we use the real player the user chose.
        if (!this.tutorialAutoRun) {
            this.player = new Player(PLAYER_CLASSES[0]);
            this.player.currentHp = 30;
            this.player.maxHp = 30;
            this.player.mana = 3;
            this.player.diceCount = 2;
        }

        // Training Dummy: HP caps so it can't die until step 12 (Phase 3).
        this.enemy = new Enemy({ name: "Training Dummy", hp: 10, dmg: 2 }, 1);
        this.enemy.nextIntent = { type: 'attack', val: 2, target: this.player };
        this.enemy.showIntent = false;
        this.enemy.isTutorialDummy = true; // flag read by takeDamage guard below

        const hud = document.getElementById('hud');
        hud.classList.remove('hidden');
        hud.style.zIndex = "3500";

        const overlay = document.getElementById('tutorial-overlay');
        overlay.classList.remove('hidden');
        overlay.style.opacity = "1";

        this.updateTutorialStep();
    },

     updateTutorialStep() {
        const overlay = document.getElementById('tutorial-overlay');
        const text = document.getElementById('tutorial-text');
        const canvas = document.getElementById('gameCanvas');
        const spotlight = document.getElementById('tutorial-spotlight');
        const gameContainer = document.getElementById('game-container');

        // --- Narration pane (Phase 3) ---
        // Compact floating pane anchored to whatever UI element the current
        // step is teaching. Keeps gameplay visible behind a thin glass panel.
        const narrPane = document.getElementById('tutorial-narration');
        const storyEl = document.getElementById('tutorial-narration-story');
        const actionEl = document.getElementById('tutorial-narration-action');
        if (narrPane && typeof TUTORIAL_NARRATION !== 'undefined') {
            const wasHidden = narrPane.classList.contains('hidden');
            narrPane.classList.remove('hidden');
            const entry = TUTORIAL_NARRATION[this.tutorialStep];
            const storyText = (entry && typeof entry !== 'string') ? (entry.story || '') : (typeof entry === 'string' ? '' : '');
            const actionText = (entry && typeof entry !== 'string') ? (entry.action || '') : (typeof entry === 'string' ? entry : '');
            // Smooth fade-through on text swap so stage changes don't snap.
            // Skip the fade on the first show (wasHidden) — the pane itself
            // is already running the fadeInUp entrance animation.
            if (!wasHidden && entry) {
                narrPane.classList.add('narration-switching');
                // Debounce rapid advances so the last-scheduled swap wins.
                if (this._narrSwapTimer) clearTimeout(this._narrSwapTimer);
                this._narrSwapTimer = setTimeout(() => {
                    if (storyEl) storyEl.textContent = storyText;
                    if (actionEl) actionEl.textContent = actionText;
                    narrPane.classList.remove('narration-switching');
                    this._narrSwapTimer = null;
                }, 160);
            } else if (entry) {
                if (storyEl) storyEl.textContent = storyText;
                if (actionEl) actionEl.textContent = actionText;
            }
            // Pane sits in the OPPOSITE half-screen from the action it's
            // teaching, so it never overlaps the element the player needs
            // to see or interact with. top value is computed in pixels so
            // the CSS transition can animate between anchors — anchoring
            // via `bottom: Npx; top: auto` broke because CSS transitions
            // can't animate to/from `auto`.
            narrPane.classList.remove('anchor-top', 'anchor-bottom');
            const bottomHalfSteps = new Set([1, 3, 5, 7, 8, 9, 10, 11, 12]);
            const anchorTop = bottomHalfSteps.has(this.tutorialStep);
            narrPane.classList.add(anchorTop ? 'anchor-top' : 'anchor-bottom');
            // Compute pixel `top` for whichever anchor we're targeting.
            // The container is the game frame; measuring after any
            // reflow from class changes settles, and falling back to
            // CONFIG heights avoids a zero-height first-show flash.
            const container = document.getElementById('game-container');
            const containerH = (container && container.getBoundingClientRect().height)
                || (typeof CONFIG !== 'undefined' ? (CONFIG.CANVAS_HEIGHT / (window.devicePixelRatio || 1)) : 960);
            const paneH = narrPane.getBoundingClientRect().height || 80;
            const TOP_MARGIN = 60;
            const BOTTOM_MARGIN = 260;
            const targetTop = anchorTop ? TOP_MARGIN : Math.max(TOP_MARGIN, containerH - BOTTOM_MARGIN - paneH);
            narrPane.style.top = `${targetTop}px`;
        }

        // Skip button is now a sibling, shown whenever the narration pane
        // is shown and hidden alongside it. Lives at the bottom-center of
        // the game container regardless of where the pane is anchored.
        const skipBtn = document.getElementById('btn-tutorial-skip');
        if (skipBtn) {
            if (this.tutorialAutoRun) skipBtn.classList.remove('hidden');
            else skipBtn.classList.add('hidden');
        }

        // --- 1. Reset Classes and Clear Focus ---
        document.querySelectorAll('.tutorial-focus').forEach(el => {
            el.classList.remove('tutorial-focus');
            el.style.position = ''; 
        });
        canvas.classList.remove('tutorial-focus'); 

        text.classList.remove('tutorial-transparent');
        text.classList.remove('hidden');
        overlay.classList.remove('hidden');
        spotlight.classList.add('hidden'); 
        
        // Default: Overlay blocks game interaction
        overlay.style.pointerEvents = 'auto';
        spotlight.style.pointerEvents = 'none'; 

        // Remove previous click handlers
        const hud = document.getElementById('hud');
        if(hud) hud.onclick = null;
        if(canvas) canvas.onclick = null;
        overlay.onclick = null;
        
        // --- HELPER: Wait for Tap (robust — advances on any pointerdown) ---
        // The overlay-onclick path alone breaks when the tap lands on a
        // child widget (e.g. a die) whose own pointerdown handler calls
        // preventDefault. That cancels the synthetic click iOS would have
        // fired, so overlay.onclick never runs and the tutorial stalls.
        // We also listen for pointerdown on document in the capture phase,
        // which fires before any child handler and isn't blocked by the
        // child's preventDefault. SKIP button is excluded so its own
        // handler still runs without being pre-empted.
        const waitForTap = () => {
            overlay.style.pointerEvents = 'auto';
            overlay.onclick = null;
            let advanced = false;
            const advance = (e) => {
                if (advanced) return;
                if (e && e.target && e.target.closest && e.target.closest('#btn-tutorial-skip')) return;
                advanced = true;
                overlay.onclick = null;
                document.removeEventListener('pointerdown', advance, true);
                this.tutorialStep++;
                this.updateTutorialStep();
            };
            // Short delay so the pointerdown that just advanced us to this
            // step (from the previous step) doesn't immediately re-advance.
            setTimeout(() => {
                if (advanced) return;
                overlay.onclick = advance;
                document.addEventListener('pointerdown', advance, true);
            }, 120);
        };

        // --- SPOTLIGHT HELPERS ---
        const setSpotlight = (targetRect, shape = 'rect') => {
            const containerRect = gameContainer.getBoundingClientRect();
            spotlight.classList.remove('hidden');
            
            const relativeTop = targetRect.top - containerRect.top;
            const relativeLeft = targetRect.left - containerRect.left;

            spotlight.style.top = `${relativeTop}px`;
            spotlight.style.left = `${relativeLeft}px`;
            spotlight.style.width = `${targetRect.width}px`;
            spotlight.style.height = `${targetRect.height}px`;
            spotlight.style.borderRadius = shape === 'circle' ? '50%' : '8px';
        };

        const getEntityRect = (entity) => {
            const rect = canvas.getBoundingClientRect();
            // IMPORTANT: divide by the *logical* resolution, not canvas.width
            // (which is logical × devicePixelRatio after the HiDPI patch).
            const scaleX = rect.width / CONFIG.CANVAS_WIDTH;
            const scaleY = rect.height / CONFIG.CANVAS_HEIGHT;
            
            const screenX = rect.left + (entity.x * scaleX);
            const screenY = rect.top + (entity.y * scaleY);
            const radius = entity.radius * scaleX; 
            
            return {
                top: screenY - radius - 10, 
                left: screenX - radius - 10,
                width: (radius * 2) + 20,
                height: (radius * 2) + 20,
                right: (screenX - radius - 10) + ((radius * 2) + 20),
                bottom: (screenY - radius - 10) + ((radius * 2) + 20)
            };
        };

        const getHpBarRect = (entity) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width / CONFIG.CANVAS_WIDTH;
            const scaleY = rect.height / CONFIG.CANVAS_HEIGHT;
            
            const width = (entity instanceof Minion) ? 80 : 160;
            const height = 24; 
            
            const gameX = entity.x - width / 2;
            const gameY = entity.y - entity.radius - 40;
            
            const screenLeft = rect.left + (gameX * scaleX);
            const screenTop = rect.top + (gameY * scaleY);
            const screenWidth = width * scaleX;
            const screenHeight = height * scaleY;
            
            const padding = 15;
            const manaOffset = (entity instanceof Player) ? (50 * scaleX) : 0; 

            return {
                top: screenTop - padding,
                left: screenLeft - padding - manaOffset,
                width: screenWidth + (padding * 2) + manaOffset,
                height: screenHeight + (padding * 2),
                right: (screenLeft - padding - manaOffset) + (screenWidth + (padding * 2) + manaOffset),
                bottom: (screenTop - padding) + (screenHeight + (padding * 2))
            };
        };

        const getUnionRect = (r1, r2) => {
            const top = Math.min(r1.top, r2.top);
            const left = Math.min(r1.left, r2.left);
            const right = Math.max(r1.right, r2.right);
            const bottom = Math.max(r1.bottom, r2.bottom);
            return {
                top: top,
                left: left,
                width: right - left,
                height: bottom - top
            };
        };

        // --- 2. DYNAMIC POSITIONING LOGIC ---
        let topPercent = '40%'; 
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            switch (this.tutorialStep) {
                case 0: // Intro
                case 5: // End Phase
                case 8: // Summon Die
                case 9: // Destroy Target
                case 11: // Summon (Actual step)
                case 12: // Final Attack
                    topPercent = '40%'; 
                    break;
                
                case 1: // Player Stats
                case 10: // Reroll (Actual step)
                    topPercent = '75%'; 
                    break;

                // --- FIX: Specific Adjustments ---
                case 3: // Modules (Screenshot 1) - Move Higher
                    topPercent = '30%'; // Was 40%
                    break;
                
                case 2: // Enemy/Intent (Screenshot 2) - Move Lower
                case 4: // Enemy Scan
                    topPercent = '85%'; // Was 75%
                    break;

                case 6: // QTE Attack (Screenshot 3) - Move Lower
                    topPercent = '50%'; // Was 40%
                    break;

                case 7: // Shield Module (Screenshot 4) - Move WAY Higher
                    topPercent = '25%'; // Was 75% (Bottom) -> Now Top
                    break;
            }
        }
        
        text.style.top = topPercent;
        text.style.transform = 'translateX(-50%) translateY(-50%)'; 

        // ----------------------------------------------------

        switch(this.tutorialStep) {
            case 0: 
                text.innerHTML = "SIMULATION BOOT.<br>Welcome to Magic v Machine.<br>Your objective is to infiltrate the core.<br><br><strong>[TAP SCREEN TO BEGIN]</strong>";
                waitForTap();
                break;

            case 1: 
                text.innerHTML = "OPERATOR STATS: This is your <strong>Health Bar</strong>. To its left is your <strong>Mana (3/3)</strong>. You start with 3 Mana and gain 1 each turn. Mana is used for powerful Skills. <strong>Debuffs</strong> (like WEAK) appear near your HP.<br><strong>[TAP SCREEN TO CONTINUE]</strong>";
                setSpotlight(getHpBarRect(this.player), 'rect');
                waitForTap();
                break;
                
            case 2:
                text.innerHTML = "ENEMY THREAT: This is the <strong>Enemy Health Bar</strong>. The icon above them shows their <strong>Intent</strong> (what they will do on their turn). <strong>Buffs/Debuffs</strong> also appear near their HP.<br>Click or hold the Enemy to get a detailed combat prognosis.<br><strong>[TAP SCREEN TO CONTINUE]</strong>";
                
                const enemyEntityRect = getEntityRect(this.enemy);
                const enemyHpRect = getHpBarRect(this.enemy);
                enemyHpRect.top -= 40; 
                enemyHpRect.height += 40;
                
                setSpotlight(getUnionRect(enemyEntityRect, enemyHpRect), 'rect');
                waitForTap();
                break;

            case 3:
                this.rollDice(2);
                text.innerHTML = "MODULES: The bottom bar holds your <strong>Dice Modules</strong>. You can re-roll any un-used or selected module, then <strong>Drag & Drop</strong> it onto a valid target (Enemy or Self).<br><br><strong>[TAP SCREEN TO CONTINUE]</strong>";
                
                setTimeout(() => {
                    const diceCont = document.getElementById('dice-container');
                    if(diceCont) setSpotlight(diceCont.getBoundingClientRect(), 'rect');
                }, 50);
                
                waitForTap();
                break;
                
            case 4:
                text.innerHTML = "KNOWLEDGE IS POWER: The enemy telegraphs every move. Read it, then respond.<br><strong>[TAP ANYWHERE TO CONTINUE]</strong>";
                setSpotlight(getEntityRect(this.enemy), 'circle');
                waitForTap();
                break;

            case 5: 
                text.innerHTML = "Enemy intent detected. DRAG the <strong>Attack Module</strong> onto the enemy unit. This uses 0 Mana.";
                const dice5 = document.querySelectorAll('#dice-container .die');
                if(dice5[0]) setSpotlight(dice5[0].getBoundingClientRect(), 'rect');
                
                if(dice5[0]) {
                    dice5[0].classList.add('tutorial-focus');
                    dice5[0].style.position = 'relative'; 
                    dice5[0].style.zIndex = '2000';
                }
                // Allow interaction
                overlay.classList.add('hidden');
                spotlight.classList.add('hidden');
                break;

            case 6: 
                overlay.classList.add('hidden'); 
                spotlight.classList.add('hidden');
                text.innerHTML = "ACTION COMMAND: Click inside the inner ring during the attack to achieve a <strong>Critical Hit</strong> (+30% DMG)!";
                break;

            case 7: 
                overlay.classList.remove('hidden');
                overlay.classList.add('hidden'); // FIX: Hide overlay for drag
                text.innerHTML = `
                    CRITICAL REGISTERED.
                    <div style="font-size: 0.8rem; color: #ccc; margin: 5px 0; font-family: var(--font-main);">
                        (Note: The Enemy Intent is always visible. Tap to view details.)
                    </div>
                    Incoming damage predicted. DRAG the <strong>Shield Module</strong> to your avatar (Self-Target).
                `;
                const dice7 = document.querySelectorAll('#dice-container .die');
                if(dice7[1]) {
                    setSpotlight(dice7[1].getBoundingClientRect(), 'rect');
                    dice7[1].classList.add('tutorial-focus');
                    dice7[1].style.position = 'relative';
                    dice7[1].style.zIndex = '2000';
                }
                break;

            case 8:
                // Button Click Required (Functional Step). DON'T override onclick —
                // `attachButtonEvent` already wired btn.onclick to call endTurn(),
                // and endTurn() itself branches on tutorialStep===8 to advance.
                // Overriding onclick here wiped the real handler and left the
                // button dead in the first real combat.
                overlay.classList.remove('hidden');
                overlay.style.pointerEvents = 'auto';
                text.innerHTML = "Cycle complete. TAP the END TURN (⏭) button. The Enemy will execute their Intent now.";
                const btnEnd = document.getElementById('btn-end-turn');
                if(btnEnd) {
                    btnEnd.classList.add('tutorial-focus');
                    // Spotlight measured after layout settles so the highlight
                    // lands on the button's real position (not the pre-narration-pane
                    // position).
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            setSpotlight(btnEnd.getBoundingClientRect(), 'rect');
                        });
                    });
                }
                break;

            case 9: 
                overlay.classList.add('hidden'); 
                spotlight.classList.add('hidden');
                text.innerHTML = "INCOMING ATTACK: CLICK the shrinking ring on your avatar. A perfect block grants 50% damage reduction!";
                break;

            case 10:
                // Button Click Required (Functional Step). DON'T override onclick.
                // rerollDice() already branches on tutorialStep===10 and advances
                // the tutorial itself; overriding onclick would leave the reroll
                // button dead in the first real combat (same class of bug as §8).
                overlay.classList.remove('hidden');
                overlay.style.pointerEvents = 'auto';
                text.innerHTML = "MODULES EXHAUSTED: You get 2 free re-rolls per turn. TAP the <strong>Reroll icon</strong> to generate new data for the selected modules.";
                const btnReroll = document.getElementById('btn-reroll');
                if(btnReroll) {
                    btnReroll.classList.add('tutorial-focus');
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            setSpotlight(btnReroll.getBoundingClientRect(), 'circle');
                        });
                    });
                }
                break;

            case 11: 
                // FIX: Ensure dice are rolled for this step
                this.rollDice(2);
                
                overlay.classList.add('hidden'); 
                spotlight.classList.add('hidden');
                text.innerHTML = "REINFORCEMENTS: DRAG the <strong>Minion/Wisp Module</strong> onto empty canvas space. Your Wisp will attack automatically at the end of your turn.";
                setTimeout(() => {
                    const dice = document.querySelectorAll('#dice-container .die');
                    if(dice[0]) {
                        setSpotlight(dice[0].getBoundingClientRect(), 'rect');
                        dice[0].classList.add('tutorial-focus');
                        dice[0].style.position = 'relative';
                        dice[0].style.zIndex = '2000';
                    }
                }, 150);
                break;
                
            case 12:
                // Step 12: rigs [ATTACK, ATTACK] → DOUBLE STRIKE combo, both
                // dice glow. Highlights dice[0] first; teaches combos in context.
                this.rollDice(2);

                text.classList.add('tutorial-transparent');
                text.innerHTML = "TWO ATTACKS — <strong>DOUBLE STRIKE</strong> COMBO. BOTH MODULES GLOW. DESTROY THE TARGET.";

                overlay.classList.add('hidden');
                spotlight.classList.add('hidden');
                overlay.style.display = 'none';

                setTimeout(() => {
                    const dice = document.querySelectorAll('#dice-container .die');
                    // The text instructs an ATTACK; highlight the ATTACK die (index 0), not the SHIELD (index 1).
                    if (dice[0]) {
                        setSpotlight(dice[0].getBoundingClientRect(), 'rect');
                        dice[0].classList.add('tutorial-focus');
                        dice[0].style.position = 'relative';
                        dice[0].style.zIndex = '2000';
                    }
                }, 150);
                break;
        }
    },

    playStory() {
        this.changeState(STATE.STORY);
        const content = document.getElementById('story-content');
        const btn = document.getElementById('btn-finish-story');
        
        content.innerHTML = `
            SIMULATION COMPLETE.<br><br>
            YEAR 21XX.<br>
            The Silicon Empire has paved the oceans.<br>
            Humanity is deleted.<br>
            Nature is illegal.<br><br>
            You are the <strong>GREEN SPARK</strong>.<br>
            The last avatar of life.<br><br>
            Your mission: Infiltrate the Core.<br>
            MAGIC v MACHINE IS ONLINE.
        `;
        
        content.classList.remove('story-crawl');
        void content.offsetWidth; 
        content.classList.add('story-crawl');

        setTimeout(() => {
            btn.classList.remove('hidden');
        }, 8000);
    },

}; // <--- GAME OBJECT CLOSES HERE

export { Game };
