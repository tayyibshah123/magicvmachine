# Contributing to Magic v Machine

Conventions and patterns to follow when adding new code. These exist because we
hit each one of these as a bug at some point — please don't make a future
session re-discover them.

Purely cosmetic menu improvements are standard features and must not
require Sparks or a separate upgrade. Glitch Overlay and Drift Echo are
part of the normal menu title styling.

## Independent editions

The Stable and Guided editions share a hosting origin but keep independent
profiles, saves, settings, imports, resets and offline caches. `main.js`
must import `edition-storage.js` before any game module. Stable keeps the
established game keys in place, avoiding a quota-consuming copy of existing
profiles. Guided uses a separate namespace. Use the installed Storage API;
do not access its native backing stores from gameplay code. Each worker
owns only its edition's scoped cache family and must never intercept a
nested edition's resources. Keep edition metadata and PWA identities in
sync with their source versions. Both editions retain the ALPHA V1 stamp.

## Testing procedure

Tests have seven reporting owners in `scripts/test-groups.mjs`: health,
decisions, actions, timing, saves, platform and supporting services. Put new
regressions in the owning area and preserve the distinction between a rule,
its real callers and its rendered browser behaviour.

- During development, run the affected area with `npm run test:area -- AREA`.
- Before publication, run `npm run check`: all rules/integration tests, the
  web build, cache/version/asset validation and the portable browser suite.
- When changing fixtures or reorganising checks, run
  `npm run check:comprehensive` to include shuffled ordering. Do not reduce
  worker parallelism without measuring an improvement.
- The runner continues gathering evidence after a failed phase, writes one
  ignored `test-results/` summary, and exits nonzero if any required phase
  fails. A red discovery check blocks publication; preserve it while the
  underlying defect is reported and assessed.
- After deployment, verify the public version/cache/files match the tested
  source and perform a fresh launch. Reuse results for an unchanged-source
  deployment retry.

For the Stable and Guided release pair, use `npm run check:editions --
--stable PATH --guided PATH`. It checks both source trees, packages only
their validated web bundles, and tests both editions in one browser profile.
Evidence may be reused only when its source fingerprint matches. The final
check also rejects source edits made while checks were running. Publish the
generated `release-site/` contents on `gh-pages`, with Stable at the root and
Guided in `guided/`. Source branches remain separate; generated output is
never committed to the source branches. Verify both public URLs after Pages
finishes its deployment.

Use `helpers/combat-fixture.js` for reset state, clocks and explicit optional
cosmetic stubs. Opt into real rendering through `helpers/combat-renderer.js`.
Do not globally mock QTE, damage, death or victory: a test must choose any
such stub deliberately. Cold recovery uses `helpers/session-fixture.js` to
load Game, entities and services from the same fresh dependency graph.

Restore clocks, random values, subscriptions, timers and presentation groups.
Use fake time for boundary checks and observable completion for browser
actions. Do not copy gameplay implementations into a test. Historical save
payloads remain frozen fixtures rather than current saves with an older
version number substituted.

Install test tooling with `npm ci` and `npx playwright install chromium`.
Browser paths come from Playwright, not a developer's machine. The browser
suite runs one game at a time, targets real touch input, retains failure
screenshots, state, saved checkpoints and resource errors, and uses no automatic retries. Enable
`MVM_QA_TRACE=1` only for a focused diagnostic run if a trace is useful.
Do not concurrently rebuild `www/` while another browser suite serves it.

Desktop touch emulation does not verify iPhone browser chrome, the home
indicator, installed-PWA audio/background behaviour or Android OS Back.
Record physical-device coverage explicitly using `mobile-qa.md`.

---

## Reduced motion (accessibility)

Reduced motion is **combat-scoped only**. Outside combat (menus, intro, story,
sanctuary, glossary, reward, end-of-run, etc.) every screen always plays at full
motion regardless of OS preference or settings toggle.

Inside combat (`STATE.COMBAT`, `STATE.TUTORIAL_COMBAT`, `STATE.COMBAT_WIN`,
`STATE.BREAKOUT`), the body gains the `reduced-motion` class **only** when the
player has Settings → Display → Accessibility → "Reduced motion in combat"
turned on. This is wired in `Game._syncReducedMotion()`.

When the class is set, a blanket CSS rule collapses every animation to ~0ms /
single iteration. CSS *transitions* (state-change motion like screen swaps,
modal fades, hover lift, button press, turn banner slide) are intentionally
NOT touched — the W3C guidance is that transitions don't cause vestibular
issues and removing them makes the UI feel broken rather than respectful.

### How to write a new animation

If your animation runs OUTSIDE combat, it always plays. Nothing to do.

If your animation runs INSIDE combat, it will collapse to its end state when
the player has the toggle on. That's what most ambient combat pulses, entry
fades, and infinite spins should do.

You only need to do something extra if:

- Your combat animation MUST keep its smooth tween for correctness (rare).
  Add the `.rm-keep` class to the element.
- Your combat animation is a vestibular trigger (slam-zoom, screen flash,
  big shake). Add the `.rm-vestibular` class so it's removed entirely
  instead of just finishing instantly.

### How to write a new JS-driven motion path

If your motion fires INSIDE combat, check `Game._isReducedMotion()` first —
that returns `true` only when the player is in combat AND has the toggle on.
Examples in the codebase: `triggerSlowMo`, `triggerBossZoom`, `hitStop`,
`triggerScreenFlash`, `shake`, `_qteChromaticPulse`.

If your motion fires OUTSIDE combat (menu animations, story transitions,
sanctuary VFX), do NOT gate on `_isReducedMotion()` — non-combat screens
always run at full motion.

```js
triggerMyMotion() {
    if (this._isReducedMotion()) return;     // or: shorten / dampen
    // …actual motion code
}
```

---

## Timers — long-lived ones must be tracked

`Game._timers` (Set) and `Game._intervals` (Set) hold combat-scoped timer ids.
`Game.clearTrackedTimers()` drains them on combat exit (called from
`changeState`, `gameOver`, `quitRun`).

### Use the helpers, not raw setTimeout/setInterval

For anything that:
- Fires damage / state mutations
- Needs to NOT fire after the player leaves combat
- Runs longer than ~500ms

…use `Game.setTimer(fn, ms)` / `Game.setLoop(fn, ms)` instead of raw
`setTimeout`/`setInterval`. They register the id with the tracker so a state
change drains them in one pass.

```js
// Good — drained on combat exit
Game.setTimer(() => this.applyDamage(), 600);

// Acceptable — short-lived UI animation that's cosmetic if it fires late
setTimeout(() => el.classList.add('hidden'), 250);

// Bad — fires after player has quit, may dereference a freed enemy
setTimeout(() => this.enemy.takeDamage(50), 1500);
```

### sleep() is pause-aware

`await this.sleep(ms)` defers its resolution while `Game.paused` is true.
You don't need to write `if (paused) ...` guards before sleeping — but you
DO still need post-sleep state guards (`stillLive()`, `_combatGen` checks)
because by the time the sleep resolves, combat may have ended.

---

## Combat damage and presentation

Use `Game._runCombatAction(resolveDamage, present)` for health-changing
actions, including support actions that can invert healing. Complete
timing prompts before applying damage, then present the settled result.
Committed multi-hit animations finish even if an early hit is lethal;
remaining visual hits must not apply damage or change the outcome.

Wait for the committed effects and their delayed spawns to complete, not
just a fixed delay. Presentation time stops during pauses and cancels on
combat replacement. Surviving support actions can release input without
waiting for cosmetic effects; terminal outcomes keep the action locked
until their presentation finishes.

The action boundary locks input and defers victory/death until presentation
finishes. Synchronous VFX calls inside the default damage resolver collect
pure visuals; their damage callbacks execute once during resolution, never
again at visual impact. After any awaited input or delay, check combat
generation, state and captured entities before mutating gameplay state.

---

## Modals positioned with `position: fixed` MUST live at body level

`.screen` containers have `transform`, `filter`, and `will-change` set, all
of which create a containing block for `position: fixed` descendants. A
fixed-positioned modal nested inside `#screen-foo` will size itself to the
screen rect rather than the viewport — its 92dvh max-height becomes 92% of
the screen, which overflows on tall content.

### Fix pattern

In the open handler, reparent the modal element to `<body>` before showing it:

```js
_openMyModal() {
    const modal = document.getElementById('my-modal');
    if (!modal) return;
    if (modal.parentNode !== document.body) {
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
}
```

The check is idempotent — it only moves once. After the first open the modal
stays at body level for the rest of the session.

Already done for: `save-slot-modal`, `char-detail-overlay`, `custom-run-modal`.

---

## Save data schema changes

When you change the shape of saved data:

1. Bump `Game.SAVE_SCHEMA_VERSION` (currently in src/game.js around line 8138).
2. Append an entry to `Game.SAVE_MIGRATIONS` that mutates v(N-1) data into vN
   shape.

```js
SAVE_MIGRATIONS: [
    { from: 1, to: 2, migrate(data) { /* …existing… */ } },
    { from: 2, to: 3, migrate(data) {
        // Example: rename player.bloodCount → player.bloodTier
        if (data.player && typeof data.player.bloodCount === 'number') {
            data.player.bloodTier = data.player.bloodCount;
            delete data.player.bloodCount;
        }
    }}
],
```

The walker handles forward-compat (a save written by a NEWER build than
what's running passes through unchanged) and is bounded against infinite
loops in misconfigured chains.

Add a test in `src/__tests__/save-migration.test.js` that locks the new
migration's contract.

---

## localStorage access must be try/catch'd

Safari Private mode and a few Capacitor Android storage profiles throw on
`localStorage.getItem` / `setItem`. Treat any failure as "no record" so the
caller falls back to defaults rather than crashing during boot.

```js
let value = null;
try { value = localStorage.getItem(KEY); } catch (_) {}
if (!value) value = defaultValue;

try { localStorage.setItem(KEY, val); } catch (_) {}
```

Many services (`streak.js`, `ascension.js`, `assist.js`, `perf.js`, `analytics.js`,
`dailies.js`) already define small `_read`/`_write` helpers — follow that
pattern when adding new persistent state.

---

## Entity damage flow

`Entity.takeDamage(amount, source, suppressBlockText, bypassShield)` is the
single entry point for HP changes. **Always declare your local `actualDmg`
variable BEFORE any branch that reads it.**

We had a temporal-dead-zone bug here: the `phase_shift` enemy check ran
BEFORE `let actualDmg = amount;` and crashed the game with ReferenceError
on every hit against Phase Stalker. The pattern is:

```js
takeDamage(amount, source, ...) {
    // Pre-checks that DON'T depend on damage value (god mode, dodge):
    if (godMode) return false;

    // Declare the working damage variable EARLY, before any branch.
    let actualDmg = amount;

    // Now you can write checks that read or modify actualDmg.
    if (this.kind === 'phase_shift' && actualDmg > 0 && Math.random() < 0.35) {
        return false;
    }
    // …rest of pipeline
}
```

---

## Tests

`npm test` runs the vitest suite. Test files live in `src/__tests__/`.

Use production helpers directly for small rule checks. Integration checks
import `Game` and entity classes through the shared fixtures and exercise
their actual callers. Do not recreate gameplay formulas inside tests. Add
new cases to the owning area rather than creating overlapping suites.

When you fix a bug, add an integration test in `damage-flow.test.js` (or a
new file) that locks the regression. Tests are cheaper than a re-discovery.

---

## Build

- `npm test` — vitest unit + integration suite.
- `npm run build:www` — wipes `www/` and rebuilds the shippable web bundle.
- `npm run android:sync` — `build:www` then `npx cap sync android`.

`www/` is gitignored. Don't commit it.
