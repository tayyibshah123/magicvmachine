# AGENTS.md — Magic v Machine

Onboarding contract for OpenAI Codex (and any other autonomous agent
operating in this repo). Codex auto-loads `AGENTS.md` at the start of
every task. Keep it short, accurate, and current.

> If you change project conventions, update this file in the same
> commit. Stale onboarding is worse than no onboarding.

---

## What this project is

- **Name:** Magic v Machine
- **Genre:** Cyberpunk roguelite dice-builder
- **Stack:** Vanilla JavaScript (ES modules), HTML, CSS. No framework.
- **Mobile wrapper:** Capacitor 6 → Android APK.
- **Runtime:** Browser (PWA) + Android WebView.
- **Current ship:** `src/version.js` is the source of truth.
- **Author repo:** `tayyibshah123/magicvmachine` on GitHub, branch `main`.

There is no backend. All state is `localStorage`. The PWA caches itself
via `service-worker.js`.

---

## Repository layout

```
index.html              entry point (loads main.js)
main.js                 bootstrap — wires DOM, kicks Game.init()
style.css               every style rule (single file, intentional)
manifest.json           PWA manifest
service-worker.js       offline cache; CACHE_NAME must match APP_VERSION
src/
  version.js            APP_VERSION + APP_CACHE_KEY (bump on every ship)
  game.js               ~32k lines — the main Game singleton, state machine,
                        combat loop, UI orchestrator. Do not refactor wholesale.
  constants.js          tunables, enemy/boss data, lore epigrams
  audio.js              music + SFX loader, fade machine
  data/
    intel-codex.js      40 structured lore entries (chapters I–V + hidden)
    matchup-hints.js    class-vs-enemy tip strings
  effects/              particles, screen flashes
  entities/             Player, Enemy, Projectile classes
  services/             combat-recap, ascension, streak, dailies, perf, etc.
  ui/                   modal helpers, tooltips
  styles/               (rarely used — most styles live in /style.css)
  __tests__/            rules and integration checks, seven reporting areas
tests/browser/          portable touch journeys, PWA and renderer checks
scripts/
  build-www.mjs         clean-build to ./www/ for Capacitor
  compress-music.mjs    OGG → M4A pass for Android payload
  codex-setup.sh        Codex container bootstrap (npm install)
android/                Capacitor Android project (committed, except build/)
docs/                   ROADMAP, CODEX.md, archived planning docs
music/                  Vorbis + AAC music tracks
sfx/                    short audio cues
```

Files **never** to commit: `node_modules/`, `www/` (regenerated),
`android/app/build/`, anything in `.gitignore`.

---

## Build & test commands

| Command | What it does |
|---|---|
| `npm install` | Install dev deps (vitest, jsdom, @capacitor/*). |
| `npm test` | All rules and integration checks. Required release gate. |
| `npm run test:watch` | Watch mode for local dev. |
| `npm run test:groups` | List the seven test areas. |
| `npm run test:area -- health` | Run one area (use the key from test:groups). |
| `npm run test:browser` | Build and run mobile browser journeys and targeted checks. |
| `npm run check` | Full tests, bundle validation and browser checks with one result summary. |
| `npm run check:comprehensive` | Also run shuffled tests to check fixture isolation. |
| `npm run build:www` | Wipes `www/`, rebuilds the shippable web bundle. |
| `npm run build:native` | Compact Android bundle with AAC music. |
| `npm run android:sync` | `build:native` then `npx cap sync android`. |
| `npm run compress:music` | Generates `.m4a` siblings for `.ogg` tracks. |
| `npm run compress:audio` | Generates music and SFX AAC compatibility files. |

No bundler, no transpiler. Browsers load `src/*.js` directly as ES modules.

Browser publication retains both audio formats. Validate native builds with
`node scripts/validate-build.mjs --native`; a compact native bundle must never
be published as the browser edition. Keep required code and both small SFX
formats in the worker shell. Music uses the acknowledged selected-format
background download; Settings shows when offline audio is ready.

There is no dev-server script. To preview locally, serve the repo root
with any static server (e.g. `npx http-server -p 8080`) and open
`http://localhost:8080/`. Service worker is gated by `https` or
`localhost`.

---

## Conventions (full detail in `CONTRIBUTING.md`)

These exist because each one bit us as a bug. Don't make a future
session re-discover them.

1. **Reduced motion is combat-scoped.** `body.reduced-motion` only
   fires inside `STATE.COMBAT` / `TUTORIAL_COMBAT` / `COMBAT_WIN` /
   `BREAKOUT` when the player has the toggle on. Outside combat,
   animations always play at full motion. JS-driven motion that runs
   in combat must gate on `Game._isReducedMotion()`. JS-driven motion
   outside combat must NOT gate.

2. **Long-lived timers use the trackers.** Inside combat, use
   `Game.setTimer(fn, ms)` / `Game.setLoop(fn, ms)` so they get drained
   on combat exit. Raw `setTimeout` is only OK for short cosmetic UI
   animations that are harmless if late.

3. **`position: fixed` modals must live at `body` level.** `.screen`
   containers create a containing block (transform/filter/will-change),
   so a fixed-positioned modal nested inside one sizes itself to the
   screen rect, not the viewport. Reparent on open (idempotent check).

4. **Save schema changes bump `SAVE_SCHEMA_VERSION`** and append a
   migration to `SAVE_MIGRATIONS` in `src/game.js`. Add a regression
   test in `src/__tests__/save-migration.test.js`.

5. **`localStorage` access must be `try/catch`'d.** Safari Private +
   some Capacitor profiles throw on read or write.

6. **`Entity.takeDamage` declares `actualDmg` BEFORE any branch that
   reads it.** Phase-shift dodge once crashed on TDZ — don't reintroduce.

7. **Visible "version" stamp in the menu stays at `ALPHA V1`.**
   `APP_VERSION` in `src/version.js` keeps moving (it's the cache key
   and the service-worker bust), but the user-facing version span in
   the menu does not change per ship. Don't "fix" it.

8. **Push after every shippable change.** Working copy is treated as
   throwaway — the canonical state lives at `origin/main`. Every commit
   is followed by `git push`. Never leave commits unpushed.

9. **Menu polish is standard.** Purely cosmetic menu improvements must
   not require Sparks or a separate upgrade. Glitch Overlay and Drift
   Echo are built into the title styling.

10. **Settle health changes before action presentation.** Use
   `Game._runCombatAction` for damage and its subsequent animation.
   Support actions also use this boundary to settle inverted healing
   and deaths. Surviving support actions need not hold input for VFX.
   Finish committed multi-hit visuals even after a lethal first hit.
   VFX callbacks must not change HP or settle victory/death. Collect
   timing input first, then resolve damage and play cosmetic effects.
   Wait for actual presentation completion, including delayed effects;
   a fixed wall-clock delay cannot cover low frame rates or pauses.
   After awaits, verify combat generation, state and entity identity.

11. **Keep the editions independent.** The first import in `main.js`
    installs the edition's storage view before game modules execute.
    Stable retains the existing `mvm_*` keys; Guided uses its own
    namespace. Always use the installed Storage API, including imports,
    exports and resets. Never bypass it through native backing storage.
    Service-worker cache cleanup must be restricted to its own edition
    and URL scope. Keep `APP_EDITION`, `APP_CACHE_PREFIX`, worker constants
    and the PWA identity consistent when preparing an edition.

---

## Versioning + ship checklist

Use the shared test fixtures and seven reporting areas described in
`CONTRIBUTING.md`. Test the real production method, not a copied formula.
Keep new failures visible and classify fixture failures separately from
game defects. Do not skip or weaken checks to make a release green.
`npm run check` must pass for the final release source. Use the comprehensive
variant when changing fixtures or test organisation. A deployment retry
can reuse results if the tested source has not changed.

The approved two-edition release uses `npm run check:editions -- --stable
PATH --guided PATH`. It verifies independent saves, updates and cold offline
launches in one browser profile. Keep Stable source on `main`, Guided source
on `codex/guided-v1.10.1`, and publish the validated dual bundle on `gh-pages`.
Never commit `release-site/` or `www/` to a source branch. Reused evidence must
match the full source fingerprint. Preserve the frozen v1.9.55 and
v1.9.56 refs when publishing later fixes.

Every shippable change does these in one commit, in this order:

1. Bump `APP_VERSION` in `src/version.js` (e.g. `1.9.49` → `1.9.50`).
2. Bump `CACHE_NAME` in `service-worker.js` to match (the string is
   intentionally duplicated — service workers can't import ES modules).
3. Make the code change.
4. Run `npm test`. Must be green.
5. `git add` the files explicitly (avoid `git add -A` — never sweep
   secrets or build artifacts).
6. Commit with a message in the style of recent log:
   `Drop Bay v1.9.50 — <one-line summary>`.
7. `git push origin main`.

There is no PR workflow — commits go straight to `main`. CI is
not configured; tests are the gate.

If you ship visual changes, briefly note manual QA done (or admit
"not visually tested") in the commit body.
For layout changes, inspect named native browser screenshots at 360px and
390px before publication. Include measured separation and reachable tap
checks, and keep the image paths and bounds in the browser evidence.

---

## Where to read for context

- `ROADMAP.md` — live bucket list, what's open vs shipped. **Read this
  first when picking a task.**
- `CONTRIBUTING.md` — full version of every convention above.
- `mobile-qa.md` — per-screen QA checklist + known non-issues at 360/
  390/414/iPad widths.
- `docs/CODEX.md` — handoff guide written for the human operator. You
  (Codex) probably don't need it, but it explains the trust contract.
- `docs/archive/` — old planning docs. Reference-only; do not edit.

---

## What to work on when given a vague task

If the user says "continue work" or "do the next thing":

1. Read `ROADMAP.md` and pick the highest-priority **open** item from
   the lowest-numbered bucket. Bucket 1 (Perf & UX blockers) is closed.
   Bucket 2 (Combat balance) is currently the live front-line.
2. Skip Bucket 4 (Audio asset queue) — those are user-procured drops.
3. Skip Bucket 10 (Post-launch deferred) — those need a distribution
   decision that hasn't landed.
4. Confirm the scope in writing before starting if the item is bigger
   than ~200 lines of churn. Otherwise just ship.

Prefer **small, verifiable** changes over sweeping refactors. The
`game.js` file is intentionally large; do not split it unless the user
asks.

---

## Things you should NOT do

- Don't change the visible version stamp in the menu (see convention 7).
- Don't commit `www/`, `node_modules/`, or `android/app/build/`.
- Don't use `git add -A` / `git add .` — name files explicitly.
- Don't `--no-verify` or `--amend` published commits. Always make a
  new commit; the user's working copy is reloaded from `origin/main`,
  so amending live history breaks their pull.
- Don't add a framework. The vanilla-JS choice is deliberate.
- Don't introduce TypeScript, a bundler, a CSS preprocessor, or
  per-file CSS modules.
- Don't add telemetry, analytics, or any network call. The game is
  fully offline.
- Don't generate documentation files (e.g. `*.md`) unless explicitly
  asked — `ROADMAP.md` and `CONTRIBUTING.md` are the canonical homes.

---

## Sanity checks before declaring done

- `npm test` exits 0.
- `git status` is clean (or only has the files you intended).
- The commit is pushed (`git log origin/main..HEAD` is empty).
- The visible menu version stamp still says `ALPHA V1` if you touched
  any UI strings.
- If you touched `src/version.js`, `service-worker.js`'s `CACHE_NAME`
  matches.
