// Scripted 5-stage onboarding (§1.1).
//
// Runs ONCE on a fresh install, between the intro splash and the main menu.
// Stages:
//   1. Welcome / name entry    (~15s)
//   2. Combat tutorial primer  (~90s)  — delegates to existing scripted tutorial
//   3. Rigged first real combat (~60s) — played via the tutorial-combat path
//   4. Sector 1 map reveal      (~30s)  — free play starts here
// Players can skip from stage 2 onwards. A 20-second idle auto-advance keeps
// a stuck player from churning.
//
// Storage key mvm_onboarding_done — once set, the entire onboarding flow is
// bypassed on subsequent launches. Settings → Gameplay has a "Replay tutorial"
// button that clears it.

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
    run({ onFinished, onStartTutorial } = {}) {
        Analytics.emit('onboarding_stage_complete', { stage: 'start', seconds: 0 });

        const root = document.createElement('div');
        root.id = 'onboarding-overlay';
        root.className = 'onboarding-overlay';
        document.body.appendChild(root);

        const state = {
            stage: 1,
            stageStart: performance.now(),
            name: this.getName(),
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

        const resetIdle = (nextStage) => {
            clearTimeout(state.idleTimer);
            state.idleTimer = setTimeout(() => nextStage && nextStage(), 20000);
        };

        // ---- Stage 1: Welcome + name entry ----
        const renderStage1 = () => {
            root.innerHTML = `
                <div class="onb-card">
                    <div class="onb-header">// SYSTEM BOOT</div>
                    <h1 class="onb-title">MAGIC <span class="onb-vs">v</span> MACHINE</h1>
                    <p class="onb-body">
                        You are the last Operator. The Silicon Empire has paved the oceans
                        with glass and silenced every analog signal. You are the glitch
                        they didn't catch.
                    </p>
                    <label class="onb-label" for="onb-name">Callsign (optional):</label>
                    <input type="text" id="onb-name" class="onb-input" maxlength="16" placeholder="OPERATOR" value="${state.name === 'OPERATOR' ? '' : state.name}">
                    <div class="onb-actions">
                        <button class="btn secondary onb-skip" id="onb-skip-1">SKIP</button>
                        <button class="btn primary onb-next" id="onb-next-1">START</button>
                    </div>
                </div>
            `;
            document.getElementById('onb-skip-1').onclick = skip;
            document.getElementById('onb-next-1').onclick = () => {
                const input = document.getElementById('onb-name');
                state.name = this.setName(input.value);
                emitStage('1_welcome');
                state.stage = 2;
                renderStage2();
            };
            resetIdle(() => {
                state.name = this.setName(document.getElementById('onb-name').value);
                emitStage('1_welcome_idle');
                state.stage = 2;
                renderStage2();
            });
        };

        // ---- Stage 2: Primer (text lesson) ----
        const renderStage2 = () => {
            root.innerHTML = `
                <div class="onb-card onb-card-wide">
                    <div class="onb-header">// COMBAT PRIMER</div>
                    <h2 class="onb-title-mid">DICE, DRAG, WIN.</h2>
                    <div class="onb-bullets">
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span><strong>Roll dice</strong> every turn. Drag an ATTACK die onto the enemy. Drag a SHIELD die onto yourself. Drag a MINION die onto empty space to summon a helper.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Every attack triggers a <strong>timing ring</strong>. Tap inside the inner ring for a critical. When an enemy attacks, the ring appears on <strong>you</strong> — tap to block.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span><strong>Mana</strong> powers skill dice (Meteor, Earthquake, etc). You gain +1 every turn. Save it for the big moves.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Your <strong>class ability</strong> sits below the dice tray — each class plays a different beat:</span><div class="onb-subbullets"><div>· <strong>TACTICIAN</strong> · spend dice to fill 3 pips, then pick a reroll, +shield, or +damage payout.</div><div>· <strong>ANNIHILATOR</strong> · every die heats the reactor. Vent in the yellow zone for ×1.4 next attack, red zone for an AoE blast.</div><div>· <strong>BLOODSTALKER</strong> · damage taken fills the Blood Pool. Spend HP for tributes — reroll, attack + bleed, or grand strike.</div><div>· <strong>SENTINEL</strong> · shield gained fills 3 plates. Full plates nullify the next enemy attack.</div><div>· <strong>ARCANIST</strong> · Fire / Ice / Lightning glyphs cycle. Tap when the wanted glyph is lit. One use per turn.</div><div>· <strong>SUMMONER</strong> · summons grow plots in the Sacred Grove. Tap a bloomed plot for a free Spirit, or Apex (3 blooms + max minions) for a ×2 empower.</div></div></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Status icons (WEAK, FRAIL, SHIELD) appear near HP bars. Tap them for details.</span></div>
                        <div class="onb-bullet"><span class="onb-bullet-icon">◆</span><span>Out of options? <strong>Reroll</strong> — two free every turn. Tap dice to lock them first.</span></div>
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
            resetIdle(() => { emitStage('2_primer_idle'); state.stage = 3; renderStage3(); });
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
