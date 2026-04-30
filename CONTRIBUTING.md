# Contributing to Magic v Machine

Conventions and patterns to follow when adding new code. These exist because we
hit each one of these as a bug at some point — please don't make a future
session re-discover them.

---

## Reduced motion (accessibility)

The game respects both the OS-level `prefers-reduced-motion` media query AND an
in-game settings toggle (`body.reduced-motion`). Either being on triggers a
blanket CSS rule that collapses every animation/transition to ~0ms.

### How to write a new animation

By default, your animation **already works** under reduced motion: the blanket
rule shortcuts to its end state, which is what most ambient pulses, entry
fades, and infinite spins should do.

You only need to do something extra if:

- Your animation MUST keep its smooth tween for correctness (rare). Add the
  `.rm-keep` class to the element. The opt-out is intentionally one-off — most
  animations should respect the user's preference.
- Your animation is a vestibular trigger (slam-zoom, screen flash, big shake).
  Add the `.rm-vestibular` class so it's removed entirely instead of just
  finishing instantly.

### How to write a new JS-driven motion path

Check `Game._isReducedMotion()` first. Examples in the codebase: `triggerSlowMo`,
`triggerBossZoom`, `hitStop`, `triggerScreenFlash`, `shake`, `_qteChromaticPulse`.

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

Two flavours:
- **Pure helpers** (e.g., `shield.test.js`) — replicate the production math as
  a pure function and test it. Avoids needing to import Game with all its
  side effects. Good for tight loops.
- **Integration** (e.g., `damage-flow.test.js`) — import `Game` and entity
  classes directly. Set up a player + enemy and exercise the real flow.
  Slower, more thorough. Use this when a pure helper would miss
  interactions (instanceof checks, late-bound class registrations, TDZ).

When you fix a bug, add an integration test in `damage-flow.test.js` (or a
new file) that locks the regression. Tests are cheaper than a re-discovery.

---

## Build

- `npm test` — vitest unit + integration suite.
- `npm run build:www` — wipes `www/` and rebuilds the shippable web bundle.
- `npm run android:sync` — `build:www` then `npx cap sync android`.

`www/` is gitignored. Don't commit it.
