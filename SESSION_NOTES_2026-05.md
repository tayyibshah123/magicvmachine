# Session Notes — May 2026 (v1.5.0 → v1.6.0)

> Snapshot: 2026-05-06.
> Audience: future Claude Code session (or human dev) picking the build up later.
> Full commit log lives in `git log --since=2026-05-04`. This document is the **why** + **what's next**, not a re-statement of every diff.

This document complements `WEEKLY_ROADMAP.md` (Week 1 + Week 2 polish pass through v1.5.0) and `PRODUCTION_ROADMAP.md` (the original 31-part ledger). All Week 1/2 entries are still accurate; this file covers everything shipped on top of that since 2026-05-04, plus the recommended next moves.

---

## 1. State of the build at v1.6.0

### What this build is

A premium-only, mobile-first roguelike deckbuilder. Locked to a 432×768 portrait container on every platform (PC mirrors phone exactly via `container-type: size` + named container queries). PWA-shippable today; Capacitor wrappers for iOS / Android sit alongside.

### Vital stats

| | |
|---|---|
| Code size | ~30k LOC across `src/` |
| Test suite | **98 / 98 vitest green**, regression-checked at every commit |
| Performance budget | 60fps on Snapdragon 7-gen-1 / A13-class mid-spec phones, FPS HUD + render annotation in place for further measurement |
| Asset surface | 26 SFX, 5 music tracks, all cyberpunk-palette canvas-rendered art (no external sprites) |
| Total commits this session | 41 since the last roadmap snapshot (2026-05-04) |
| Save schema version | 2 (migrations live; backwards-compatible) |

### Run loop summary

```
Main Menu → Storyboard (first-run only) → Char Select → Combat → Reward
  ↘ Map ↘ Combat / Event / Shop / Rest / Elite / Boss → next sector
  → Sector 5 boss (TESSERACT PRIME) →
       Endless Spire continue prompt (if owned) ─ ─ ─ Sector 6+ loop
       Challenge / Archive → STATE.VICTORY (skip cinematic)
       Standard run → STATE.ENDING (auto-crawl) → STATE.VICTORY
  → Sanctuary (sparks-only meta) → next run
```

Currency model:
- **Fragments** — run-only. Awarded inside a run; wiped at every run-end (loss / win / quit). Funds the in-run shop only.
- **Sparks (✦)** — persistent meta currency. Earned at significant events (boss kills, sector clears, full-run wins, hex breaches, achievements). Spent in the Sanctuary on permanent upgrades. Migrate-on-boot from legacy fragment stockpiles at 100:1.

---

## 2. What landed since 2026-05-04 (v1.5.0 → v1.6.0)

Grouped thematically; rough chronological order.

### A. Save / softlock / boot fixes
- **Wallet error filter + `screen.active` race** (`ec8cc58`). Brave's iOS built-in wallet was throwing `window.ethereum.selectedAddress = undefined` and surfacing as a SYSTEM FAULT overlay. Filter expanded; combat-screen activation race that left the canvas stuck on the cinematic background also addressed (defensive `.active` add on a 600ms setTimeout fallback so iOS Brave's throttled `requestAnimationFrame` can't strand the screen).
- **HP=0 corrupt-save guard** (`170738f`, prior session — still relevant). Saves with `currentHp <= 0` now restore to `maxHp` instead of stranding the run on a dead-player enemy phase.
- **Sector intro hold** (`7711e70`, prior session). 2s readable hold so the sector banner registers.

### B. Module / relic system
- **Kinetic Battery scaling fix** (`b54e368`). Stack scaling regex was multiplying both threshold AND reward — `2 stacks = "every 6 shields gained grants +2 Reroll"` was identical-ratio dead pickup. Now threshold pinned at 5; reward scales with stacks. Audited every threshold-style relic in the same pass (overcharge_vent, tacticians_eye, tidal_recycler, echo_round, last_stand, ghost_cache, spark_battery — fixes or `ONE_COPY_MAX` adds).
- **Class-locked module pool** (`b54e368`). Each of the 6 classes now has at least 3 identity-pure modules that ONLY surface in their own reward screens (`classLocked: 'arcanist'` etc). 3 new bloodstalker modules created; 11 existing relics retagged. Filter applied in `generateRewards`, rest-node module rolls, event random-relic grants, and the Smith / Oracle pre-run flows (which strip locks since class isn't picked yet).
- **Module FUSIONS — Hades-style Duos** (`441cc54`, `cab64b0`). 12 fusion pairings total. When a player owns BOTH source modules of any unfired pair, the next reward screen surfaces the fusion as a single bonus card. Picking it consumes one stack of each source and installs the fusion as a more powerful single relic.
  - Voltaic Bulwark (kinetic_battery × iron_lung)
  - Toxic Coil (static_field × venom_edge)
  - Phoenix Protocol (second_life × emergency_kit) — full-HP revive + clear debuffs
  - Tesla Lens (static_capacitor × crit_lens) — 25 dmg auto-crit zap, +25% crit chance
  - Reflective Plating (shield_gen × spike_armor) — +8 shield/turn + reflect splashes 30%
  - Flux Cycler (mana_syphon × recycle_bin) — +2 mana/turn, mana gain heals 2 HP
  - Aegis Field (nano_shield × warden_protocol — sentinel-only) — +18 combat-start shield + +6 minion shield/turn
  - Pulse Hammer (crit_lens × volt_primer) — first attack +12 flat AND auto-crit
  - Tyrant Engine (relentless × titan_module) — flat +35% damage + every 3rd attack triples
  - Bramble Cycle (thorn_mail × coolant_loop) — +4 block on damage + +5 heal on shield break
  - Wisp Engine (minion_core × wisp_hp) — start combat with 2 wisps at +10 HP and 5 shield each
  - Wounded Beast (last_stand × retaliator) — sub-33% HP: +30% dmg, +1 reroll, reflect at 30 dmg gate-10
- **Recycle Bin dead-code bug fix** (`441cc54`). Heal-on-mana-gain handler was placed AFTER `return actual;` in `gainMana` — never executed. Moved before return; fires correctly now.
- **Rarity rebalance** (`441cc54`, `1616e1d`). Second Life → epic, Static Capacitor → rare, Siphon Blade → rare, Bite icon SVG redesigned (twin fangs + drip).

### C. Status effects rework
- **Duration stacks cumulatively, magnitude takes the max** (`db52583`). Bleed / poison / constrict / weak / etc. now extend duration on re-apply (existing.duration += incoming) instead of taking max. `val` is the max-of (incoming vs existing) so a stronger source raises the floor; weaker re-apply doesn't drop the bar. DoTs no longer multi-stack — tick = `val` (no `* stacks` multiplier). Old `stacks` field pinned at 1 for legacy saves so they don't keep multiplying after this rewrite. Tooltips updated.

### D. Sanctuary economy
- **Sparks-only meta + run-only fragments** (`97f62d6`). All Sanctuary upgrades cost sparks now. META_UPGRADES costs converted from 400-2000 frags to 4-12 ✦ (same ids so saved owned-list still hydrates). Hex Breach drops 8 ✦ instead of 300 frags + 3 ✦. Smith re-roll 4 ✦. Login-streak fragment grant suppressed; sparks-tier still pays. Run-end wipe via `_resetRunCurrency()` fires on gameOver / sector-5 win / quitRun / start-of-new-run. One-time migration converts existing fragment hoards 100:1 to sparks (gated on `mvm_frag_to_spark_migrated`).
- **Toggleable Sanctuary upgrades** (`97f62d6`). Owned upgrades show ◉ ON / ◯ OFF buttons — free toggle (sparks were spent at purchase, the toggle just dials the effect on/off). `metaToggledOff` Set persists to `mvm_meta_disabled`. `hasMetaUpgrade` checks both per-run Apostate curse AND user toggle.
- **Cache Primer** new upgrade — `start each run with +100 Fragments` (5 ✦). The first sanctuary node that buys into the run-only fragment economy.
- **Sanctuary redesign + class section** (`4ae5432`, `6ada23e`). Drop the redundant SPARKS UNLOCKS header. Six contextual sections (Starting Loadout / Combat Edge / Economy / Dice Tuning / Run Options / Class Specialisation / Endgame). Compact horizontal-row cards (icon left, name+desc center, ◉/◯ pill right) so 4-6 cards fit per scroll on phone. New 6 class-specific upgrades (one per class, trait-modifying) with class-coloured left-edge tint.
- **Signature Forge fix** (`6ada23e`). Audit found `s_signature` was never read at runtime — Signature Tier 2/3 evolutions fired on sector clears regardless of ownership. Now gated; description rewritten ("Permanently unlock Tier 2 + Tier 3 Signature evolutions") to match the wiring.
- **Endless Spire wiring** (`6ada23e`). Was fully decorative — Sector 5 boss kill always ended the run regardless. Now surfaces a CONTINUE / RETIRE prompt; CONTINUE rolls into Sector 6+ via existing fallbacks (sector backdrop fallback to S5, BOSS_DATA[1] fallback, +20%/sector enemy stat scaling). Deepest sector tracked in `mvm_endless_best`, displayed inline on the Sanctuary card.
- **NPCs (Smith / Oracle / Curator) audit** (`6ada23e`) — all three confirmed wired. No bug fixes needed; improvement proposals (Smith fusion, Oracle streak bonus, Curator trophy challenges) flagged for future.

### E. Tutorial / storyboard / menu
- **Tutorial moves to main menu** (`6e77372`). New TUTORIAL tile in `mv2-bento-row--tiles` runs the practice flow with `_tutorialReturnToMenu = true`, routing back to STATE.MENU instead of STATE.MAP on completion or skip. Storyboard's last scene now has a single CONTINUE button (TUTORIAL / SKIP TO GAME pair removed). Left back arrow on storyboard scenes 2-N for rewinding.

### F. The Compiler boss
- **EMPOWER value visible + AoE attacks + Bolster Mech bodyguards** (`e391270`). Audit found EMPOWER's secondary `val` was never quoted in the intent panel ("Also applies EMPOWER" with zero numbers). Now reads `+5 DMG`. All Compiler attacks routed through `aoe_sweep`. Two 300-HP "Bolster Mech" minions (orange industrial hovering jets, custom `_isBolsterMech` render branch) spawn at combat start; each grants +10 boss shield per turn and stamps a 2× damage charge on every 3rd round.

### G. Sector 4 Hive Protocol
- **Backdrop perf overhaul + 5-drone swarm** (`73c018c`). The Hive Cathedral backdrop was the heaviest scene in the game (~84 hex cells with per-frame Math.sin alpha, O(n²) neural web, 24 patrol drones). Replaced with a single pulsing green grid (one cached gradient sky + ~44 grid lines batched into 2 stroke calls + one shared sin pulse). Hive identity preserved, 60fps reclaimed for combat. Boss now spawns 5 "Hive Drone" minions at combat start (`_isHiveDrone` flag, 60 HP / 6 DMG each). Phase-2 drip-spawn removed (would push count past intended cap).

### H. Sector 3 Heat Tiles
- **Flame scorch overlay + sizzle SFX** (`5d5b040`). The turn-end heat damage was a quiet zap. Now fires a CSS overlay (radial orange gradient + scrolling flicker stripes) over the bottom half of the game container with a 900ms keyframe + layered sizzle audio (zap at 0.55× rate + glitch_attack at 0.7× rate, low volume).

### I. Fabricator hack minigame
- **Timers halved + heavy distraction VFX** (`3654a7f`). Normal 25s → 12.5s, hard 35s → 17.5s. Layered visual chaos: pulsing red vignette, sweeping diagonal scan band, glitching RGB-split title with 0.18s sub-pixel jitter on hard mode, breathing panel scale, rotating bracket dashed border. Canvas adds: pulsing maze walls, scanline static, 18 floating data particles, neon trail behind the player dot, danger-mode red sparks under 5s.

### J. Sector map differentiation
- **Per-sector grid colour + ambient vignette** (`cab64b0`). Removed the uniform cyan grid; each sector now reads at a glance:
  - S1 pink mesh, S2 ice-blue wider lattice, S3 orange tighter mesh, S4 hex diagonals, S5 red+glitch-stutter.
  - Plus a `#screen-map[data-sector]::after` radial vignette in each sector's signature colour (sector 5 throbs).

### K. Reward screen
- **Module Fusion UI** (`cab64b0`). Reward card carries `.reward-fusion-card` class: rotating prismatic conic-gradient border (4.5s spin), pulsing ⟁ glyph top-right, FUSION rarity label that shimmers through the prism palette. Banner that originally said "// MODULE FUSION DETECTED" was later removed (`df3fbcf`) — the unique card is its own visual cue.
- **Card density iterations** (`df3fbcf` → `2416753` → `73c018c` → `2b8e2b7`). Multiple shrink passes culminating in: icon hidden via `display: none`, padding 6px 12px 8px, name 0.95rem, desc 0.72rem with 2-line clamp, hints left-aligned. Cards now ~60px tall and content-sized (`flex: 0 0 auto`) — `safe center` justify so 1-2 cards cluster mid-screen, 5+ overflow scrolls cleanly.

### L. Victory recap
- **Encrypted-file pulsing pill** (`df3fbcf`). New magenta/cyan pill mirrors the gold Spark pill — surfaces "+1 ENCRYPTED FILE — BOSS KILL / ELITE DROP / LUCKY DROP" whenever a kill drops an intel file. Renders 1180ms after the spark pill so the two payouts arrive sequentially.
- **Layout clipping fix** (`2b8e2b7`). `.victory-actions` was a horizontal flex with `flex: 1` buttons squeezing labels to ~50px each (read as rotated 1-char-per-line on phone). Now flex-column with full-width buttons. Recap screen scrolls when content exceeds viewport.

### M. Achievements
- **Sparks reward (1-15 each), no fragments** (`2b8e2b7`). Full table reauthored — `frag` field replaced with `sparks` (1-15 scaled to difficulty). First Blood = 1 ✦, marquee feats up to 15. Unlock handler drops the techFragments grant entirely (fragments wipe at run end so the reward never landed) and grants the per-entry sparks. Floater quotes `+N ✦`.

### N. Intel screen
- **Sticky RETURN button** (`72afe60`). `position: sticky; bottom: max(12px, env(safe-area-inset-bottom));` so RETURN stays visible while scrolling cipher chapters or chronicle. Aggressive `.intel-pane:not(.active) { display: none !important; }` guard against chronicle leak into other tabs.
- **Sequential lore unlock + striking popup** (`72afe60`). `winHexBreach` now unlocks the lowest-indexed locked entry (was random). New full-screen glass card popup: rotating ⌬ glyph, monitor-warmup type-on for the lore quote, gold ✦ +N SPARKS line, CONTINUE button. Tap-anywhere dismiss, 12-second auto-dismiss safety, reduced-motion strips animations.

### O. Ending cinematic
- **Auto-crawl + Challenge skip + z-index fix** (`2b8e2b7`).
  - 38s linear translateY crawl on `.ending-readable` (was static, user had to manually scroll).
  - Reduced-motion users get a static fade-in.
  - Challenge / Archive runs skip the cinematic entirely → route directly to `STATE.VICTORY` (the FATAL EXCEPTION canon only fits a standard 5-sector run).
  - `#screen-ending` was missing from the "promote children above z:0 vfx layer" rule — added; cyan vfx-host particles no longer paint over the cinematic copy.

### P. Desktop = mobile (force mobile viewport on PC across the entire game)
This was a recurring theme over multiple commits — `8a028d3` did the bulk of it.

- **Killed two `@media (min-width: 600px)` menu breakpoints** in `menu.css` and `glass.css` that read the BROWSER WINDOW width (not the 432px game container's), forcing 2-3 column layouts that blew out of the container on PC.
- **Converted 10 `@media (max-width: N)` rules to `@container gc (max-width: N)`** — they were checking the WINDOW width too, so phone-tightening rules NEVER fired on desktop (window > N). Now they fire when the game container drops below the breakpoint, which it always is on PC. Affected: turn-digest, diff-frame, save-slot-meta-grid, sb-back-arrow, loadout-relic-list, intel-profile-row, intel-chronicle-stats, rest-stage, vfx-rain, mv2-bento-row--tiles.
- **Sanctuary section grid** locked to single-column at every size (the prior `@media (min-width: 540 / 900px)` breakpoints split into 2-3 cols on desktop).
- Left untouched: `@media (min-width: 768px) and (pointer: coarse)` — only fires on touch tablets, intentionally scales container UP for them. Desktop mouse setups don't touch it.

### Q. Audit-driven layout sweep
A multi-agent audit found these clipping / sizing issues; addressed in `2b8e2b7`:
- `.codex-grid` `minmax(180px, 1fr)` → `minmax(min(140px, 100%), 1fr)` (was forcing 2-col overflow at 432px).
- `.discount-badge` anchored at `top: -8px; right: -8px;` → `2px / 2px` (was clipping outside parent's overflow:hidden).
- `.event-option-card` icon column 56→44px (more text room at 432px).
- `#modal-glossary` `100vh` → `100dvh - safe-area insets` (iOS URL bar shrink ignored before).

---

## 3. Architecture state — what the next session should know

### Container / viewport contract
- `#game-container` is **always** 432×768 (max), 9/16 aspect, regardless of platform. `container-type: size; container-name: gc;` enables container queries.
- **Use `@container gc (max-width: N)` not `@media (max-width: N)`** for any phone-tightening rule. Window-width media queries don't fire on PC where the container is mobile-shaped but the window is huge.
- **Never re-introduce `@media (min-width: N)` for layout**. The container is the same size on every platform — there's no breakpoint to switch on.

### Currency contract
- `techFragments` is run-only. Read inside a run (shop, events). Wiped at run end via `_resetRunCurrency()`. Don't persist it across runs.
- `sparks` is the only persistent meta currency. `grantSparks(N, reason, opts)` and `spendSparks(N, reason)`.
- `metaUpgrades` array tracks owned sanctuary upgrades. `metaToggledOff` Set tracks user-disabled ones. `hasMetaUpgrade(id)` returns true only if owned AND not toggled-off AND not Apostate-cursed.

### Effect contract (post status-effect rework)
- Re-applying same effect: `existing.duration += incoming.duration` (was `Math.max`).
- `val` takes the max (or min for `weak`).
- DoTs no longer multi-stack — `stacks` is pinned at 1 forever.
- Tick damage = `val` (no `* stacks` multiplier). `Kindling` still adds its flat per-stack bonus on top.

### Ending flow
- Sector 5 boss kill → check `s_endless` ownership. Endless owned → `_endlessAwaitContinue()` prompt. Endless not owned + Challenge/Archive → route to `STATE.VICTORY` directly. Standard run → `STATE.ENDING` (auto-crawl) → user taps PROCEED → `STATE.VICTORY`.

### Recently-changed render hot paths
- Sector 4 backdrop: simplified to pulsing grid in `drawSectorCelestial` (game.js around line 22578). Don't re-introduce hex/network/swarm; that's why we replaced it.
- Compiler boss: 2 Bolster Mechs spawn at `setupCombat`. Each tick adds shield/dmg in `startTurn` Compiler block.
- Hive boss: 5 Hive Drones spawn at `setupCombat`. Phase-2 drip-spawn removed.

### Tests
- 98/98 vitest green. New file `damage-flow.test.js` was updated to assert the new effect-stacking contract. If you change effect-stacking again, update those tests.
- Test container in jsdom doesn't evaluate CSS, so visual regressions aren't caught by tests — manual + agent audit.

---

## 4. Known limitations (not bugs, just unshipped scope)

- **Endless Spire content** is shallow. Sectors 6+ recycle Sector 5 backdrop and BOSS_DATA[1] fallback. No bespoke sector-6+ enemy roster, no boss-variant rotation past Tesseract Prime. Functionally playable but cosmetically thin.
- **Class-locked module pool** is small (3-4 per class). More variety per class would deepen build identity. Bloodstalker only got 3 NEW relics; the others reuse existing ids retagged as `classLocked`.
- **Module Fusions don't have unique sound or VFX flair** beyond the prismatic card border. A "FUSED!" sting would land the moment harder.
- **Sanctuary NPCs (Smith / Oracle / Curator) are functional but shallow**. The prior agent audit suggested Smith fusion / Oracle streak bonus / Curator trophy challenges as deepening hooks; not yet implemented.
- **Endless personal-best UI** only surfaces inline on the Sanctuary card description ("Best: Sector N"). Not on the menu, not on the run-end victory recap.
- **Achievement progress tracking** (e.g. "5/10 stacks until Stockpiler") isn't shown — players see the achievement title + reward but not their progress toward it.

---

## 5. Recommended next steps — picking up later

Ordered by impact-per-day. All are bite-sized — each fits a single Claude Code session.

### Tier 1 — Player-visible polish (1 day each)

#### 1.1 — Endless Spire content depth
Sectors 6+ are functionally playable but reuse S5 visuals. Either:
- **(a) Visual variety**: wire 3-5 alternate sector palettes for endless levels (cycle on every 5 sectors, e.g. `endless ÷ 5 % 5` → city / ice / fire / tech / source). Cheap if the existing `drawSectorCelestial` branches are reused.
- **(b) Boss rotation**: pick from BOSS_DATA randomly for each endless sector boss, scaling stats with endless level. Already 6 bosses available.
- **(c) Endless modifier**: every 3 sectors, apply a stacking endless-only debuff (chosen from a small pool — "+10% enemy HP / sector", "skill dice cost +1", "minions take +25% dmg"). Communicated via a banner.

#### 1.2 — Sanctuary NPC enhancements
Audit's deferred suggestions:
- **Smith fusion** — combine 2 banked relics into 1 upgraded relic (8 ✦, consumes both). Deepens the blacksmith fantasy.
- **Oracle streak bonus** — if streak ≥ 3, grant +1 free reroll banked for the next run. Ties Oracle into the streak service.
- **Curator trophy challenges** — sector-specific feats ("S1 boss under 10 turns") that reward 2 ✦ each on completion. Turns Curator from passive museum into active quest board.

#### 1.3 — Module Fusion VFX/SFX
Currently fusion pickup floats `FUSION → ${name}` text + a shockwave + screen shake. Layer:
- A custom "fusion forge" sting (currently uses `upgrade` SFX). Synthwave snare-and-pad swell, ~1s.
- Brief screen flash in the fusion's signature colour (mostly red — gold for Phoenix Protocol).
- A 2-3 frame chromatic aberration burst on the player entity.

#### 1.4 — Achievement progress hints
On the achievements screen, each locked achievement currently just shows "???" when locked. Show progress where trackable: "Defeat your first enemy" → counts kills > 0; "Have 10+ relics at once" → current/10; etc. Requires a per-achievement progress reader function in `achievements.js`. ~1 day.

### Tier 2 — Mobile UX hardening (0.5-1 day each)

#### 2.1 — Per-screen visual regression checklist
The agent's audit flagged a punch-list of layout edge cases. Most were addressed in `2b8e2b7`, but worth a follow-up tour:
- Settings modal `max-width: 460px on 432px container` leaves 8px padding (settings.css:74).
- Glossary tabs hardcoded `flex: 0 0 auto` prevents wrapping (settings.css:818).
- `.hint-toast` `max-width: 340px on 432px` leaves 46px margin (style.css:14691).
- `.btn` spin-loader hardcoded `right: 16px` (style.css:2981).

These are minor — pick them off as a 30-minute polish PR.

#### 2.2 — Tablet / orientation testing pass
The tablet `@media (min-width: 768px) and (pointer: coarse)` rule scales the container UP to 720×1280 on touch tablets. We've never QA'd that path. Recommend Chrome devtools at iPad-portrait + a real iPad / Android tablet sideload.

### Tier 3 — Asset content (asset-bound, blocked on you)

The Week 1/2 wishlist still applies — see WEEKLY_ROADMAP.md §9 for the full list. Highest leverage:
- **Per-boss themes ×5** — Tesseract Prime's win still lands on shared sector-5 music.
- **Combat-recap sting** — the recap card has a great visual but a generic SFX.
- **Game-over autopsy drone** — death screen sting.

All wired with sensible fallbacks; swap-in is a one-line change per asset.

### Tier 4 — Production / launch (Parts 7, 10, 15, 17 of original PRODUCTION_ROADMAP.md)

Out of scope for code work — these are the user's blockers:
- iOS Apple Developer Program enrolment ($99/yr), Android Google Play Console enrolment ($25 one-time).
- Capacitor signing keys.
- Privacy policy / Terms / COPPA classification.
- Soft-launch market choice + launch date.
- Store listing screenshots (4-6 per platform, multiple device sizes).

---

## 6. Backlog of **deferred** items the user mentioned but we didn't implement

These came up in passing during this session but weren't actioned. Worth surfacing for future:

- **Class-specific signature tier 2 VARIANT choice** — `s_signature` description originally promised "Choose your Signature T2 form between two variants per class." We rescoped to "Permanently unlock T2/T3 evolutions" because no alternate-variant SIGNATURE_DICE entries exist. Implementing the variant choice would require adding 6 alternate T2 + 6 alternate T3 dice (12 new die definitions) plus a picker UI. Substantial.
- **Bloodstalker hemoclock idea** — was floated as a third bloodstalker class-locked relic but skipped (overlaps with Kindling). Replaced with Predator's Mark.
- **Endless Spire achievements** — "Reach Sector 8 in Endless", "Survive an Endless boss with 1 HP" etc. would deepen the endless meta. Currently zero endless-specific achievements.
- **Class-specific reward tinting** — fusion cards have a beautiful prismatic border; class-locked common cards just get the regular border. Could tint them with the class colour for stronger identity reads.
- **Compiler Bolster Mech defeat reward** — killing a Bolster Mech mid-fight currently has no special reward beyond regular Hive Drone tier-2 stats. Could grant the player a temporary buff ("OVERLOAD" — +25% damage for 2 turns) to make killing them feel earned.
- **Hive Drone visual specialisation** — current `_isHiveDrone` flag exists but doesn't have a custom render branch (drones use the standard prism minion sprite). A custom green-bot sprite would sell the hive identity stronger.

---

## 7. Quick-start for a future Claude Code session

If you're picking this up cold:

1. **Read `WEEKLY_ROADMAP.md` §9 first** for the v1.5.0 closed-parts ledger. Most of PRODUCTION_ROADMAP's 31 parts are shipped or deferred-by-architecture.
2. **Then this file's §3** for the v1.6.0 architectural contracts (container, currency, effects, ending flow, render hot paths).
3. **Then this file's §5** for recommended next moves.
4. Run `npx vitest run` before any change to confirm 98/98 baseline.
5. Bump `src/version.js` + `service-worker.js` `CACHE_NAME` on every shippable commit.
6. The user reloads from `origin/main` — every change must be `git add` + `commit` + `push` to land. They don't fetch local commits.
7. The user prefers terse responses. State what changed, not a paragraph of reasoning.

---

**End of session notes — 2026-05-06.** Build is at v1.6.0, all 98 tests passing, on `origin/main`.
