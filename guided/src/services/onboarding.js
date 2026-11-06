// Optional callsign entry before character selection and the Breakout.
// The player advances explicitly. A slow reader or mobile keyboard must
// never trigger an automatic deployment. Legacy primer renderers below
// remain unused; the current handoff is renderStage1 -> onStartTutorial.

import { Analytics } from './analytics.js';

const KEY = 'mvm_onboarding_done';
const KEY_NAME = 'mvm_operator_name';

export const Onboarding = {
    // Returns true if the scripted flow has already completed for this install.
    isComplete() {
        try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
    },

    markComplete() {
        try { localStorage.setItem(KEY, '1'); } catch (e) {}
    },

    reset() {
        try { localStorage.removeItem(KEY); } catch (e) {}
    },

    // Operator name (shown in briefings + lore). Optional — if the player
    // skips the name prompt we fall back to 'OPERATOR'.
    getName() {
        try { return localStorage.getItem(KEY_NAME) || 'OPERATOR'; }
        catch (e) { return 'OPERATOR'; }
    },

    setName(name) {
        const clean = String(name || '').trim().slice(0, 16) || 'OPERATOR';
        try { localStorage.setItem(KEY_NAME, clean); } catch (e) {}
        return clean;
    },

    // Kick off the flow. Resolves when onboarding is complete (either by
    // the player finishing it or by skipping it). Non-destructive: the
    // existing tutorial/main-menu pipeline runs after.
    //
    // `hooks` = { onFinished(), onStartTutorial() }
    run({ onFinished, onStartTutorial, onModeChoice, mode = 'guided' } = {}) {
        Analytics.emit('onboarding_stage_complete', { stage: 'start', seconds: 0 });

        const root = document.createElement('div');
        root.id = 'onboarding-overlay';
        root.className = 'onboarding-overlay';
        document.body.appendChild(root);

        const state = {
            stage: 1,
            stageStart: performance.now(),
            name: this.getName(),
            mode: mode === 'full' ? 'full' : 'guided',
            idleTimer: null,
            finished: false
        };

        const finish = () => {
            if (state.finished) return;
            state.finished = true;
            // Mark complete IMMEDIATELY so a mid-fade reload doesn't re-run
            // the flow. Analytics + DOM teardown can happen after.
            this.markComplete();
            Analytics.emit('onboarding_stage_complete', { stage: 'done', seconds: Math.round((performance.now() - state.stageStart) / 1000) });
            clearTimeout(state.idleTimer);
            root.classList.add('fade-out');
            setTimeout(() => root.remove(), 350);
            if (onFinished) onFinished();
        };

        const skip = () => {
            // Guard the flag first, then animate out.
            this.markComplete();
            Analytics.emit('onboarding_stage_complete', { stage: 'skipped', seconds: Math.round((performance.now() - state.stageStart) / 1000) });
            finish();
        };

        const emitStage = (label) => {
            Analytics.emit('onboarding_stage_complete', {
                stage: label,
                seconds: Math.round((performance.now() - state.stageStart) / 1000)
            });
            state.stageStart = performance.now();
        };

        // ---- Stage 1: Welcome + name entry ----
        // Stage 2 (the long combat primer) was moved to *after* the tutorial
        // — see Game.openPostTutorial() — so first-time players land in
        // gameplay sooner. Stage 1 now hands directly to Stage 3.
        const renderStage1 = () => {
            // Minimal opening: a single question + input + START. The
            // earlier card carried the game title, the lore paragraph,
            // and a SKIP button. The title is already on the main menu
            // so repeating it here was noise; the lore lands harder
            // inside the Sector 0 storyboard than on a boot card; SKIP
            // was an unnecessary off-ramp on a 2-second flow. Keeping
            // the callsign input optional (placeholder defaults to
            // OPERATOR if blank).
            root.innerHTML = `
                <div class="onb-card onb-card-minimal">
                    <h1 class="onb-title onb-title-question">Who Are You?</h1>
                    <label for="onb-name" class="onb-name-label">CALLSIGN (OPTIONAL)</label>
                    <input type="text" id="onb-name" class="onb-input" maxlength="16" placeholder="OPERATOR" autocomplete="off">
                    <p class="onb-name-help">Leave this blank to play as OPERATOR. Continue when you are ready.</p>
                    ${onModeChoice ? `<div class="onb-mode-choices" role="radiogroup" aria-label="Learning style">
                        <button type="button" class="onb-mode-choice" data-learning-mode="guided" role="radio" aria-checked="${state.mode === 'guided'}"><strong>GUIDED (RECOMMENDED)</strong><span>Learn a little at a time, with short practice and simpler early choices.</span></button>
                        <button type="button" class="onb-mode-choice" data-learning-mode="full" role="radio" aria-checked="${state.mode === 'full'}"><strong>FULL RULES</strong><span>Start with every system available. Practice and help remain optional.</span></button>
                    </div>` : ''}
                    <div class="onb-actions onb-actions-single">
                        <button class="btn primary onb-next" id="onb-next-1">START</button>
                    </div>
                </div>
            `;
            const handoffToTutorial = () => {
                if (state.finished) return;
                if (onModeChoice) onModeChoice(state.mode);
                emitStage('1_welcome');
                finish();
                if (onStartTutorial) onStartTutorial(state.mode);
            };
            root.querySelectorAll('[data-learning-mode]').forEach(button => {
                button.tabIndex = button.dataset.learningMode === state.mode ? 0 : -1;
                button.onclick = () => {
                    state.mode = button.dataset.learningMode;
                    root.querySelectorAll('[data-learning-mode]').forEach(option => {
                        option.setAttribute('aria-checked', String(option === button));
                        option.tabIndex = option === button ? 0 : -1;
                    });
                };
                button.onkeydown = event => {
                    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                    event.preventDefault();
                    const next = [...root.querySelectorAll('[data-learning-mode]')].find(option => option !== button);
                    next?.click();
                    next?.focus();
                };
            });
            document.getElementById('onb-next-1').onclick = () => {
                const input = document.getElementById('onb-name');
                state.name = this.setName(input.value);
                handoffToTutorial();
            };
            // Enter-key on the input commits the same as tapping START.
            const nameInput = document.getElementById('onb-name');
            if (nameInput) {
                nameInput.value = state.name === 'OPERATOR' ? '' : state.name;
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        state.name = this.setName(nameInput.value);
                        handoffToTutorial();
                    }
                });
            }
        };

        // ---- Stage 2: Primer (text lesson) ----
        const renderStage2 = () => {
            root.innerHTML = `
                <div class="onb-card onb-card-wide">
                    <div class="onb-header">// COMBAT PRIMER</div>
                    <h2 class="onb-title-mid">DICE, DRAG, WIN.</h2>
                    <div class="onb-bullets">
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span><strong>Roll dice</strong> every turn. Drag an ATTACK die onto the enemy. Drag a SHIELD die onto yourself. Drag a MINION die onto empty space to summon a helper.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Every attack triggers a <strong>timing ring</strong>. Tap inside the inner ring for a critical. When an enemy attacks, the ring appears on <strong>you</strong>. Tap to block.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span><strong>Mana</strong> powers skill dice (Meteor, Earthquake, etc). You gain +1 every turn. Save it for the big moves.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Your <strong>class ability</strong> sits below the dice tray. Each class plays a different beat:</span><div class="onb-subbullets"><div>· <strong>TACTICIAN</strong> · spend dice to fill 3 pips, then pick a reroll, +shield, or +damage payout.</div><div>· <strong>ANNIHILATOR</strong> · every die heats the reactor. Vent in the yellow zone for x1.4 next attack, red zone for an AoE blast.</div><div>· <strong>BLOODSTALKER</strong> · damage taken fills the Blood Pool. Spend HP for tributes (reroll, attack + bleed, or grand strike).</div><div>· <strong>SENTINEL</strong> · shield gained fills 3 plates. Full plates nullify the next enemy attack.</div><div>· <strong>ARCANIST</strong> · Fire, Ice, Lightning glyphs cycle. Tap when the wanted glyph is lit. One use per turn.</div><div>· <strong>SUMMONER</strong> · summons grow plots in the Sacred Grove. Tap a bloomed plot for a free Spirit, or Apex (3 blooms + max minions) for a x2 empower.</div></div></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Status icons (WEAK, FRAIL, SHIELD) appear near HP bars. Tap them for details.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Out of options? <strong>Reroll</strong>. Two free every turn. Tap dice to lock them first.</span></div>
                    </div>
                    <div class="onb-actions">
                        <button class="btn secondary onb-skip" id="onb-skip-2">SKIP</button>
                        <button class="btn primary onb-next" id="onb-next-2">NEXT</button>
                    </div>
                </div>
            `;
            document.getElementById('onb-skip-2').onclick = skip;
            document.getElementById('onb-next-2').onclick = () => {
                emitStage('2_primer');
                state.stage = 3;
                renderStage3();
            };
        };

        // ---- Stage 3: Hand off to the scripted tutorial combat ----
        // The existing tutorial combat rig in game.js is a solid scripted
        // flow — we just launch it here. Completion is captured by Game
        // clearing its 'tutorial_combat_done' flag, which calls finish().
        const renderStage3 = () => {
            root.innerHTML = `
                <div class="onb-card">
                    <div class="onb-header">// LIVE-FIRE DRILL</div>
                    <h2 class="onb-title-mid">YOUR FIRST FIGHT.</h2>
                    <p class="onb-body">
                        A training dummy awaits. Every action is safe. Every mistake is forgivable.
                        Hit the enemy. Block the counter. End the turn. Step through training.
                    </p>
                    <div class="onb-actions">
                        <button class="btn secondary onb-skip" id="onb-skip-3">SKIP</button>
                        <button class="btn primary onb-next" id="onb-next-3">DEPLOY</button>
                    </div>
                </div>
            `;
            document.getElementById('onb-skip-3').onclick = () => {
                emitStage('3_tutorial_skipped');
                finish();
            };
            document.getElementById('onb-next-3').onclick = () => {
                emitStage('3_tutorial_start');
                finish();
                if (onStartTutorial) onStartTutorial();
            };
            // No idle auto-advance here — this is the last chance to skip,
            // and pushing someone into combat unexpectedly is hostile.
        };

        renderStage1();
    }
};
