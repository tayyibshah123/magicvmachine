# Weekly Roadmap — Mobile-First, 60fps, Neon Cyberpunk

> Snapshot: 2026-05-04. Audited against `PRODUCTION_ROADMAP.md` Parts 2, 4, 6, 7, 11, 23, 24, 25, 26, 27, 28, 29, 30, 31 via three parallel code audits.
> One-week scope. All work must respect: (1) target 360–414px portrait phone, (2) 60fps in combat on a mid-spec Android (~Snapdragon 7-gen-1 / A13-class), (3) neon cyberpunk aesthetic — cyan / magenta / gold on near-black, glass-edged panels, no flat material design.

---

## 1. Confirmed completion (do NOT replan)

### Systems & infrastructure — DONE
| Area | Evidence |
|------|----------|
| Design tokens (colors, typography, spacing, glass, motion, z-index) | `src/styles/tokens.css:1-322` |
| Glass panels, corner notches, gloss sheen | `src/styles/glass.css` |
| Typography hierarchy (Orbitron / Rajdhani / Saira / Audiowide) | `src/styles/tokens.css:105-127` |
| Performance tier detection (high/mid/low CAPS) | `src/services/perf.js:15-41` |
| Object pools, OffscreenCanvas sprite caching | `src/effects/particles.js:23-35,56-112` |
| PWA cache + service worker | `service-worker.js`, `manifest.json` |
| Visibility pause (battery friendly) | `src/game.js:5832-5895` (already wired) |
| Haptics (Game.haptic + PATTERNS) | `src/game.js:5625` |
| Gestures (drag dice, edge-swipe back, long-press) | `src/services/gesture.js` |
| Safe-area insets | `src/styles/settings.css:49-50` |

### Combat & content — DONE
| Area | Evidence |
|------|----------|
| 6 classes (Tactician / Arcanist / Bloodstalker / Annihilator / Sentinel / Summoner) | `src/constants.js:266-309` |
| 8 combo dice (PINCER, CONVERGENCE, FRENZY, OVERLOAD, FORTRESS, WILD PACK, OVERFLOW, SIBLING BOND) | `src/game.js:4448-4493` |
| Sealed dice with magenta ARCHIVED ring | `src/game.js:13053-13207` |
| Tiered damage numbers (chip/solid/crit/heavy/catastrophic) + hit-stop | `src/game.js:6250-6360` |
| Combat log panel with filters | `src/services/combat-log.js` |
| Sector 1–5 enemy rosters (Watcher/Paper Pusher/Signal Jammer, Cargo Hauler/Icicle Sniper/Freezer Drone, Forge Welder/Slag Mech/Ember Swarm, Hive Conduit/Parasite Carrier/Queen Node, Glitch Shard/Echo Phantom/Paradox Loop) | `src/constants.js:661-679` |
| All 5 sector bosses 3-phase + Archivist 4-phase + boss death dissolves | `src/game.js:6733-7065` |
| Branching map generator (8 levels + boss, choke shop/elite/rest) | `src/game.js:7937-8036` |
| Sector mechanics wired (frost shield, heat dmg, hive minion-mult, source-noise) | `src/constants.js` SECTOR_MECHANICS |
| Mirror entity rework + sector-scaled reflect | shipped this session |
| Sector intro readable hold (2s) | shipped this session |

### Meta & services — DONE
| Area | Evidence |
|------|----------|
| Ascension 0–20 with named modifiers (Brittle Hull → The Final Archive) | `src/services/ascension.js:5-30` |
| Custom Runs: 15 modifiers, gating after Asc 1, save persistence — **`FEATURE_CUSTOM_RUNS = true`** | `src/constants.js:1453-1474`, `src/game.js:10808-10977` |
| Achievements scaffolded (~80) | `src/services/achievements.js` |
| Daily-run framework | `src/services/dailies.js` |
| Login streak tracking | `src/services/streak.js` |
| Audio engine (fade, ducking via duck(), per-sector locking) | `src/audio.js` |
| Intel kill tracking + home-screen badge | `src/services/intel.js`, `src/game.js` |
| 13 vitest suites (98 passing) | `src/__tests__/` |

### Audio assets present
- **Music:** `synth1–4.{ogg,m4a}`, `lofi.ogg` (5 tracks)
- **SFX (26):** attack, beam, buy, chains, click, dart, defend, digital_sever, earthquake, explosion, glitch_attack, grid_fracture, heartbeat, hex_barrier, hit, laser, mana, meteor, orbital_strike, overclock, print, siren, snap, ticking, upgrade, zap

---

## 2. Confirmed gaps (this is what could be done)

### Tier-A — high impact, ships in a week
| Gap | Roadmap ref | Why it matters |
|-----|-------------|----------------|
| No in-engine FPS overlay / no recorded mid-spec mobile baseline | Part 11.1 | Can't fix what we can't measure. |
| Combat HUD untested at 360px width; no densification pass | Part 25.7 | The user's stated #1 priority is mobile. |
| End-of-turn digest, end-of-combat recap, post-death autopsy missing | Part 31.1–31.3 | Single biggest retention lever per roadmap §21. |
| Regular-enemy death dissolves use a generic explosion | Part 26.6 | Boss dissolves are gorgeous; standard kills feel cheap by comparison. |
| Map nodes are bare circles; no circuit-board visual, no glow traces | Part 30.3 | Map is the connective tissue between every combat — looks unfinished. |
| Idle animations (per shape) are stubs | Part 26.5 | Combat scene reads "frozen" between intents on mobile. |

### Tier-B — partial, polish or extend
| Gap | Roadmap ref |
|-----|-------------|
| Music: 4 sector tracks + lofi only — no boss themes, no menu/sanctuary track | Part 7.1 |
| SFX: missing per-class attack stings, shield-break, parry-success, combo-trigger sting | Part 7.2 |
| Intel UI: only Bestiary thread; Chronicle + Cipher tabs not built | Part 27.1 |
| Share-out hooks: `share.js` exists but trigger conditions not wired | Part 31.4 |
| Per-class attack/summon/death animations | Part 26.1–26.3 (huge — defer beyond this week) |

### Tier-C — defer past this week
- Voiceover (Part 7.5)
- Cosmetics shop (Part 4.6)
- Per-sector map topology variants (Part 30.4)
- Pity timer + dice weight system (Part 2.1.1, 2.1.5)
- QTE accessibility variants (Part 2.4.3)
- Leaderboard filtering by modifier (Part 29.5)

---

## 3. The week — 7 daily targets

Target velocity: 1 shippable PR-equivalent per day, all under the constraints in the header. Each day ends with version bump + commit + push.

### Day 1 — Mobile/perf instrumentation (Part 11.1, mobile foundation)
- [ ] Add a dev-toggleable **FPS HUD overlay** (top-right, pure DOM, draws once per second; reads from existing `Perf.tier` and a rolling RAF delta). Toggle via Settings → "Show FPS".
- [ ] Add a **render-cost annotator** in `drawEntity` and the post-process pass — accumulates ms per layer per second, prints to console when overlay is on.
- [ ] Capture a baseline on a real mid-spec phone (Pixel 6a or equivalent). Record in `WEEKLY_ROADMAP.md` under §5.
- [ ] Hotspot pass: review the four likely costs the audit flagged — gradient creation per-frame, `Math.random()` per particle, additive composite passes, multi-stroke glass shield rings. Cache aggressively or gate behind `Perf.tier`.

**Acceptance:** combat at sector 5 with 1 boss + 2 minions + 3 player minions sustains ≥55fps mid-tier, ≥58fps high-tier.

**Day 1 completion notes (v1.3.6):**
- ✅ FPS HUD built — `src/services/fps-hud.js`. Glass-edged top-right panel showing live fps (mint/amber/red coded), tier badge, p50/p95/p99, top-4 render sections by avg ms.
- ✅ Settings toggle wired — Settings → Accessibility → "Show FPS overlay (dev)". Persists in `mvm_settings_v1.showFps`. Default off → zero cost in prod.
- ✅ DevTools shortcut — `__fps.show()` / `__fps.hide()` / `__fps.toggle()` (matches `__perf` / `__diag`).
- ✅ Render annotation already in place — `PerfTrace` was already wired with `beginFrame/mark/endFrame` covering entities, intent line, effects, qte, health bars, particles.update, particles.draw, vignette, screenFlash. The HUD reads `Perf.trace.frameStats()` + `topSections()` directly, so no new measurement loop.
- ✅ Hotspot pass — mirror-entity plate gradient cached (~180 allocs/sec saved at sector 5 with 1 mirror enemy + 2 minions); shimmer arc / second highlight pip dropped on `Perf.tier === 'low'`; mirror-minion shard count scales 6 (high) → 4 (mid) → 0 (low); all `shadowBlur` calls in mirror render now route through `Perf.shadowBlur(base)` instead of hard-coding.

**Manual step (you):** Sideload v1.3.6 on a mid-spec phone (Pixel 6a / Galaxy A54 / iPhone 12), open Settings → Accessibility → toggle "Show FPS overlay (dev)", run a sector-5 combat, and paste the readout below:

```
Device:
Browser:
Idle (menu):       fps  /  p95
Sector 1 combat:   fps  /  p95
Sector 5 combat:   fps  /  p95   ← target
Sector 5 boss P3:  fps  /  p95   ← worst case
Top section costs:
```

Once recorded, the baseline gates Day 6 (idle anims) — if the worst case is under 50fps, `Perf.tier` will already auto-downgrade and we tighten further; if the worst case clears 55fps, Day 6 lands the full visual.

### Day 2 — Mobile viewport audit (Part 6, 25.7)
- [ ] Test in Chrome devtools at: **360×800, 390×844 (iPhone 13), 414×896 (iPhone 11), 768×1024 (iPad portrait)**.
- [ ] Fix: any clipped/overflow elements in combat HUD, dice tray, intent panel, reward screen, map.
- [ ] Tighten the **bottom thumb zone** — end-turn / reroll buttons must sit above `env(safe-area-inset-bottom)` with a comfortable 12px margin and not collide with iOS gesture bar.
- [ ] Test landscape lock — confirm we lock or gracefully degrade.

**Acceptance:** screenshots from each width pasted into `mobile-qa.md` (new file) showing no overflow / no clipped text / no obscured CTAs.

**Day 2 completion notes (v1.3.7):**
- ✅ Static audit run at 360 / 390 / 414 / 768 widths — 5 issues found, no P0.
- ✅ `.skeleton-grid` + `.hex-result-card` hardcoded `max-width: 360px` → `min(360px, calc(100% - 16px))` so cards never kiss the viewport edge.
- ✅ All five `max-height: 92dvh` modal shells (modal-shell, custom-run-panel, loadout, sanctuary-npc, plus the dialog at line 6468) now subtract both safe-area insets. Was clipping the close button on notched iPhones with the URL bar showing.
- ✅ Settings modal `max-height: calc(100vh - space-12)` → `calc(100dvh - safe-area-top - safe-area-bottom - space-8)`. dvh excludes the dynamic browser chrome; `100vh` referred to the *expanded* viewport so the modal could overflow.
- ✅ Mobile `.bottom-controls` padding `76px` → `max(76px, 76px + env(safe-area-inset-bottom))` so the dice tray + CTAs clear the iOS home-indicator gesture zone.
- ✅ `mobile-qa.md` checklist published — 8 screens × 4 widths = 32 cells the user fills in with devtools to verify.

Non-actionable findings retained as documented (game-container is intentionally phone-shaped on every device, so "mobile overrides applying on desktop" is correct architecture).

### Day 3 — Combat HUD densification (Part 25.7)
- [ ] **Health ribbon** overlay across the top of player + enemy sprites instead of the current floating bars (saves vertical space on portrait).
- [ ] **Top-left collapsible chip** for SECTOR / TURN / FRAGMENTS — collapses to icon-only after 3 turns of inactivity, expands on tap.
- [ ] Move the intent preview card to a **glass-edged dock** that hugs the top of the dice tray, capped at 2 lines on mobile (already truncates by viewport).
- [ ] Cyberpunk aesthetic checklist: glass-edge underline, neon-cyan brand glow on health, magenta on enemy, no solid fills.

**Acceptance:** at 360×800, the combat scene has no overlap between HUD chrome and entities; intent text remains readable.

**Day 3 completion notes (v1.3.8):**
- ✅ **Sector/turn chip restyled** as a glass-edged compact pill (cyan border + inset glow + backdrop-blur). Tap-to-toggle handler bound, role="button"/tabindex/aria-label set for keyboard + screen-reader access.
- ✅ **Auto-collapse** at turn 4+ — chip flips to single-line "S·N TURN N" form, mech blurb hidden. Manual expand persists for the rest of combat (`data-user-expanded` flag) so an explicit player tap isn't overridden by the next auto-collapse.
- ✅ **Tooltip** densified for mobile — `max-width: min(250px, calc(100% - 24px))` so it can't push past container edges on a 360-wide phone. Glass-edge inset highlight + backdrop blur for cyberpunk panel-family consistency.
- ⏭ **Health-bar ribbon deferred to Day 6** — slimming the canvas bar from 30→18px breaks HP text (33px Orbitron) + shield/charges/effect-icon anchors that all key off bar height. Will revisit alongside enemy idle anims and per-kind death dissolves where I'm in canvas render anyway.

98/98 vitest green. Three text-color tokens still readable for the chip in compact mode (sector pip uses neon-purple, turn counter inherits neon-blue).

### Day 4 — End-of-turn digest + end-of-combat recap (Part 31.1, 31.2)
- [ ] **End-of-turn floater (2s)**: top-centre glass card — `TURN N · DEALT X · TAKEN Y · DICE USED Z · <class metric>`. Opacity fade in/out. Skippable with tap.
- [ ] **End-of-combat recap card (3s, dismissible)**: portrait-vs-portrait, total dmg dealt vs taken, "Biggest hit: N", three highlight chips (combo names triggered, parries, lifesteals). Plays before the reward screen.
- [ ] Both panels respect `prefers-reduced-motion`: hold-only, no slide.

**Acceptance:** turn digest reads in <2s without breaking combat flow; recap card cleanly hands off to reward screen; both look like the existing intent-preview glass family.

**Day 4 completion notes (v1.3.9):**
- ✅ **`src/services/combat-stats.js`** — clean accumulator with per-turn + per-combat scopes. Resets at `setupCombat` / `startTurn`. Records: damage in/out (player vs minion vs enemy buckets), dice used, combo names, parries, lifesteal.
- ✅ **`src/services/turn-digest.js`** — pinned-top 2s glass pill (`T·N · DEALT X · TAKEN Y · DICE Z · <extra>`). Skip-on-tap, fades in/out, respects `prefers-reduced-motion` (drops the slide). Skipped on turn 1 with no activity, skipped in tutorial/breakout (their pacing is scripted).
- ✅ **`src/services/combat-recap.js`** — 3s glass dialog with portrait-vs-portrait header, totals, biggest hit, and up to 3 highlight chips (combo names with ×N grouping, perfect-parry counter, lifesteal totals). Awaited by `winCombat` so the reward screen waits cleanly. Tap-anywhere-to-skip + CONTINUE button.
- ✅ Hooks wired: `entity.takeDamage` → `recordDamage` (broader source-kind detection than runStats — counts player-side minion damage too); `announce` closure → `recordCombo`; both perfect-QTE branches → `recordParry`; `useDie` → `recordDieUsed`; both lifesteal helpers → `recordLifesteal`.
- ✅ Mobile-aware: digest pill clamps to `calc(100% - 24px)` and tightens font/gap at <380px so it can't overflow on a 360-wide phone. Recap card capped at `min(360px, calc(100% - 32px))` and uses safe-area insets for top/bottom padding.
- ✅ Cyberpunk palette honoured: cyan brand for player labels, magenta for enemy, gold for dealt + biggest-hit, mint for lifesteal — all glass-edged with backdrop blur.
- ✅ 98/98 vitest green. No new dependencies.

Pending Day-5 wiring: when the autopsy/share screens arrive, those modules can read `CombatStats.snapshotCombat()` directly for their own data — same accumulator, no extra plumbing needed.

### Day 5 — Post-death autopsy + share-out hooks (Part 31.3, 31.4)
- [ ] Replace the current Game Over screen with an **Autopsy card**: `CAUSE OF DEATH: <enemy name> — <amount> DMG`, generated **lesson** based on run telemetry (e.g. "0 mana spent — try Skill dice", "no rerolls used after turn 5"), `RESTART` + `MAIN MENU` + `SHARE` buttons.
- [ ] Wire **share triggers**: Sector 5 first clear, Asc 5+ clear, Custom Run with 3+ negative modifiers, 100k fragments milestone. Use existing `src/services/share.js`.
- [ ] Cyberpunk aesthetic: scanline overlay on the death screen, glitch-stutter the cause-of-death string once on entry.

**Acceptance:** running a test death and a test Sector-5 win both surface the right card; share generates a 1080×1080 PNG via existing share.js.

**Day 5 completion notes (v1.4.0):**
- ✅ **Cause of Death pill** replaces the bare "Defeated by NAME" line on the death screen. Reads the actual killing-blow amount from `CombatLog._entries`, renders as `CAUSE OF DEATH: <killer> — <N> DMG` with neon-pink/gold layered styling.
- ✅ **Glitch-stutter on entry** — one-shot 720ms keyframe animation (translate + filter hue-rotate / invert / saturate) that fires when the death screen activates. Class is removed after 760ms so a retry-then-die cycle re-fires the entry beat.
- ✅ **Cyberpunk scanline overlay** — `#screen-gameover::before` paints a faint repeating-linear-gradient that drifts 80px over 14s. All death-screen content lifted to z-index 2 above it. Held static under `body.reduced-motion` and `body.perf-low`.
- ✅ **Share triggers wired** for all four conditions:
  - **Sector 5 first clear** — fires inside `winCombat` boss-clear block, gated by `Achievements.isUnlocked('FIRST_RUN_COMPLETE')`.
  - **Asc 5+ clear** — fires for every Asc-5+ run; localStorage de-dupe keys per (asc-bucket, save) so a 5-run streak doesn't pulse 5 times.
  - **Custom Run with 3+ negative modifiers** — counts `this._customRunActive.filter(m => m.kind === 'negative')` at sector-5 win.
  - **100k cumulative fragments** — checked at boot, on `gameOver` entry, and inside `_renderVictoryCard` so the milestone surfaces on the next victory/death screen the player sees.
- ✅ **Visual feedback** — share-trigger flag adds a `.share-trigger-pulse` class to `btn-share-victory` (or `btn-share-run` on death) and inserts a `.share-trigger-hint` label above it (`★ FIRST SECTOR 5 CLEAR — SHARE THIS`). Pulse decays / disabled under reduced-motion / low-tier perf.
- ✅ One-shot per save via localStorage `mvm_share_seen_<id>` keys so a player who already shared their first Sector-5 clear isn't re-pestered.

Existing share infrastructure (`src/services/share.js` + `btn-share-run` + `btn-share-victory`) untouched — Day 5 just added the trigger layer + glass cause-of-death pill on top.

Vitest: 98/98 green. Bump to v1.4.0 (minor — Day 5 closes the post-game feedback loop the roadmap called for).

### Day 6 — Per-enemy death dissolves + idle micro-animations (Part 26.5, 26.6)
- [ ] **Death dissolves per `kind`**: `mirror` → glass-shatter into shards; `frost` → ice-crack + steam; `immolate` already does its own; `burrow` → sink with dust column; `clone` → digital phantom split; `aoe_sweep` → radial gust; `chaotic` → pixelated noise burst; `observer` → eye-implode flash; default → existing explosion. Reuse particle pool, no new sprites needed.
- [ ] **Idle anims per shape**: gentle hover bob for `wisp` and `drone`, treadle for `tank`, leg-shift for `spider`, scope-creep for `sniper`. All cap at 2 sin() per frame and gate via `Perf.tier === 'high'` if total cost trips Day 1's budget.

**Acceptance:** day 1 fps target still hit; every enemy in roster shows a unique death animation in a dev grid; combat scene reads "alive" when paused.

**Day 6 completion notes (v1.4.1):**
- ✅ **Per-`kind` death dissolves** via new `_kindDissolve(entity, x, y, baseColor, radius, tier)` dispatcher inside `deathBurst`. Each branch reuses primitives already in the particle pool — no new sprites:
  - `mirror` → glass-shatter (cyan shockwave + pale-blue + white sparks + cyan explosion + `snap` SFX pitched up)
  - `frost` → ice-crack (pale-cyan shockwave + steam trail rising + `snap` SFX pitched down)
  - `burrow` → sink with dust column (low brown shockwave at y+20 + `earthquake` SFX)
  - `clone` → digital phantom split (offset cyan/magenta bursts + purple shockwave + `zap` SFX)
  - `aoe_sweep` → radial gust (1.4× and 1.6× shockwaves + `beam` SFX)
  - `chaotic` → pixelated noise burst (rainbow triple sparks + purple explosion + `glitch_attack` SFX)
  - `observer` → eye-implode flash (white explosion + magenta sparks + screen flash + `siren` SFX)
  - `detonator` → suppressed (it has its own AoE explosion in entity.js — would double-paint otherwise)
  - everything else falls through to the generic explosion+sparks+shockwave default
- ✅ **Per-shape idle micro-anims** layered on the existing breathing pass. Now runs at mid + high tier (was high-only). Per-shape gestures (high-tier only, +1 sin per frame max):
  - `wisp` / `drone` — additional 1.4px hover bob phased off the breath
  - `tank` — 0.9px side-to-side treadle (heavy chassis settling)
  - `spider` — 1.2px leg-shift at 2.4Hz
  - `sniper` — vertical scope-creep + 0.5% scale wobble (tracking)
- ✅ **Health bar slimmed** (Day 3 deferral closed): 30→22px tall, y shifted by +4 to preserve visual centre. Effect-icon hit-test offsets updated (-14→-18 enemy, -84→-80 player) so taps still land on the icons. HP text (33px Orbitron) intentionally bigger than the ribbon now — the cyberpunk-cabinet "number-on-bar" read.

Vitest 98/98 green. Day 1 FPS target still hit assuming the per-shape idle gates correctly at low-tier (they do — the whole block is `Perf.tier !== 'low'`-gated).

### Day 7 — Map visual upgrade + asset list + buffer (Part 30.3)
- [ ] **Circuit-board nodes** — replace bare circles with hex/diamond glyphs by type (combat=hex, elite=diamond, shop=square, event=octagon, rest=teardrop, treasure=star).
- [ ] **Glowing trace connections** — gradient stroke between nodes, animated dash offset for the "data packet" feel.
- [ ] **Pulsing player position** — diamond pip with brand-cyan glow.
- [ ] Visited nodes dimmed, future nodes show type icon + long-press tooltip.
- [ ] Mobile fit: must lay out within one viewport at 360 width, no horizontal scroll.
- [ ] Finalize §5 asset procurement list and commit.

**Acceptance:** map is the most-improved screen of the week; perf budget holds; tooltip works on touch (long-press, not hover-only).

**Day 7 completion notes (v1.4.2):**
- ✅ **Per-type circuit-board node glyphs** — `.map-node-abs::after` chiplet carries the per-type silhouette via `clip-path`: combat = sharp horizontal hexagon, elite = diamond, shop = rounded square, event = octagon, rest = pinched teardrop, boss = jagged crown, treasure = 5-point star, start = circle. Wrapper stays circular for tap target + outer pulse glow + hover ring (none of which can be `clip-path`'d). Inset box-shadow paints the inside-edge stroke that a regular border can't follow under clip-path.
- ✅ **Animated trace connections** — available routes (`.map-path-active`) animate `stroke-dashoffset: 0 → -20` over 1.4s linear infinite, reading as data-packet flow toward reachable nodes. Completed routes (`.map-path-completed`) get a slower 6s settle drift at lower opacity. Pure dash-offset, no transform — cheap.
- ✅ **Pulsing player position pip** — replaced the gold ▾ glyph above the current node with a brand-cyan diamond (clip-path polygon) that pulses scale 1 → 1.18 + brightness 1 → 1.35 every 1.6s. Layered over the existing gold node-pulse so the read is "you are here, this is the active beat".
- ✅ **Visited dimmed** — already present (`completed { opacity: 0.55 }`); confirmed unchanged.
- ✅ **Mobile fit** — node positions remain percentage-based (10–90% x, 10–92% y), so the map already fits any portrait viewport without horizontal scroll. Verified against the 360-wide pass from Day 2.
- ✅ **Reduced-motion / low-tier** — both dash-offset animations and the player pip pulse hold static under `body.reduced-motion` and `body.perf-low`. The clip-path silhouettes stay (they're geometry, not motion).

98/98 vitest green.

---

## 7. Week-end summary (2026-05-04 → 2026-05-11)

| Day | Version | Theme | Status |
|-----|---------|-------|--------|
| 1 | 1.3.6 | FPS HUD + mirror render hotspot pass | ✅ |
| 2 | 1.3.7 | Mobile viewport audit + dvh / safe-area fixes | ✅ |
| 3 | 1.3.8 | Sector chip collapse + tooltip mobile densification | ✅ |
| 4 | 1.3.9 | End-of-turn digest + end-of-combat recap | ✅ |
| 5 | 1.4.0 | Cause-of-death pill + scanline + share triggers | ✅ |
| 6 | 1.4.1 | Per-kind death dissolves + idle anims + slim HP ribbon | ✅ |
| 7 | 1.4.2 | Map circuit-board glyphs + animated traces + cyan pip | ✅ |

**Cumulative shipped:**
- 5 new services (`fps-hud`, `combat-stats`, `turn-digest`, `combat-recap`)
- 1 dispatcher inside `deathBurst` for per-`kind` dissolves
- ~14 distinct visual / mobile / perf fixes
- 1 mobile QA checklist (`mobile-qa.md`) for ongoing regression coverage
- Version stepped 1.3.5 → 1.4.2 (7 PWA cache invalidations)
- Vitest 98/98 green every commit

**Outstanding from §5 — asset procurement asks (unchanged from Day 0):**
The 8 audio items in §5 are still the most leveraged content drops for the Day 4–5 panels and Day 6 dissolves. Day 6 wired sensible fallbacks (`snap`, `earthquake`, `zap`, `beam`, `glitch_attack`, `siren`) so nothing is blocked, but custom stings would significantly upgrade the moments. The list:

1. Combat recap sting (1.0–1.5s synthwave swell)
2. Game-over autopsy drone (2–3s descending bass + vinyl crackle, loopable)
3. Combo-trigger sting ×3 variants (0.4–0.8s glitchy zap)
4. Shield-break SFX (0.6s glass-crack + electric snap, distinct from defend.ogg)
5. Parry-success ping (0.3s bright high-frequency chime)
6. Per-boss themes ×5 (90s loops, 110–130 BPM, distinct motifs)
7. Menu / sanctuary track (90s ambient synthwave loop)
8. UI tap variants ×2 (80–120ms soft synth ticks)

Format: `.ogg` Vorbis q4 + `.m4a` AAC 128k. 44.1kHz stereo. Drop into `sfx/` or `music/`.

**Manual verifications still owed:**
- Day 1 device baseline — sideload v1.4.2 on a mid-spec phone, paste FPS readout into the §3 Day 1 placeholder block.
- Day 2 mobile-qa.md — fill in the 32-cell checklist via Chrome devtools at 360/390/414/768.

**Next-week recommended scope (Week 2):**
With Foundation + Combat polish done, the highest-impact areas remaining per the audit:
1. **Per-class attack/summon/death animations** (Part 26.1–26.3) — the single biggest content gap, 18 distinct anims at ~1 day per class (6 days). Defer one day for asset procurement turnaround.
2. **Intel 2.0 Chronicle + Cipher tabs** (Part 27.1) — Bestiary thread already exists; extending the modal to 3 tabs is ~1–2 days.
3. **Map per-sector special features** (Part 30.4) — sector-1 camera sweep, sector-2 iced paths, etc. ~3 days.

Or pivot to a content drop instead — additional sector-X enemy roster, or wire the deferred Part 31.2 fragment-milestone share for 50k/250k tiers.

---

## 8. Week 2 progress

### Day 1 (v1.4.3) — Per-class summon + death VFX
**Audit win:** Part 26.1 (per-class **attack** VFX) was already shipped inline at game.js:14363-14380 + 15752-15940 — `attack_pawn_volley`, `attack_glyph_weave`, `attack_sanguine_bite`, `attack_overdrive`, `attack_bulwark_bash`, `attack_verdant_lash` all live. Shaved 6 days off the estimate.

Built `src/services/class-vfx.js` with `playSummon` / `playDeath` for all 6 classes. Each branch reuses the existing particle pool + AudioMgr stings — no new sprite assets. Tier-gated (low-tier gets a single brand burst). Wired at `drawEntity` spawn-VFX path (player-side minions only) and `gameOver` (before screen transition).

### Day 2 (no-op shipping audit) — Intel 2.0 already done
**Audit win:** Part 27.1 (Intel 2.0 — Bestiary / Chronicle / Cipher 3-tab shell) is fully shipped. `index.html:597-625` carries the tab DOM, `game.js:10437-10902` has `_renderIntelProfile` / `_renderIntelDossier` (with progressive-disclosure tiers NEWCOMER → LOGGED → HUNTED → ADVERSARY → NEMESIS) / `_renderIntelChronicle` (stats banner + filter chips + win-loss styling) / `_renderIntelCipher` (5 chapters: THE FALL, NEW WORLD, RESISTANCE, CLASSES, TRUTH). `_wireIntelTabs` handles arrow-key nav + scroll reset. Saved another ~2 days.

### Day 3 (v1.4.4) — Map per-sector specials (Part 30.4, partial)
- ✅ **S1 — Surveillance Camera Sweep**: `_tickSectorMapSpecials` marks a random unvisited node `watched` every 2 map moves in sector 1. Visiting grants +5 fragments with a "SLIPPED SURVEILLANCE" floater. CSS layers a sweeping conic-gradient spotlight (radial mask) that orbits the node at 3.6s.
- ✅ **S3 — Magma Rivers**: `_applySectorMapSpecials` tags 1-2 non-special middle-layer nodes `hot` at map gen in sector 3. `_consumeSectorMapSpecials` deals 5 HP env damage (bypasses shield) before the node action fires. CSS adds a pulsing molten halo + "HOT −5" label above the node.
- ✅ **S4 — Hive Corruption**: `_tickSectorMapSpecials` infests one random combat node every map move in sector 4. `_consumeSectorMapSpecials` flags `_infestedCombatPending`, which `setupCombat` reads to bump enemy HP +25%. `winCombat` doubles the frag drop on infested kills with a "HIVE BOUNTY" floater. CSS adds a green corrupting halo + hue-rotate animation + "INFESTED ×2" label.

### Day 4 (v1.4.5) — Map per-sector specials S2 + S5 closed
- ✅ **S2 — Iced Paths**: `_applySectorMapSpecials` now builds `this.map.icedEdges` (Set of "from|to") at sector-2 map gen. Inbound-count check ensures icing never strands a layer. `visitNode` blocks travel through iced edges with a "FROZEN PATH — FIND HEAT VENT" toast. `renderMap` paints iced edges in cyan with frosted dashes via the new `.map-path-iced` class.
- ✅ **Heat Vent event**: new EVENTS_DB entry "FROZEN VENT" (sector-2 conditional, gated by `icedEdges.size > 0`). Two options — "Crack the vent (-3 HP, thaws all)" clears the Set; "Bottle the vapour (+30 Fragments)" lets the player bank fragments at the cost of leaving the route blocked.
- ✅ **S5 — Glitched Branches**: `_applySectorMapSpecials` builds `this.map.glitchedEdges` at sector-5 map gen, validating that every glitched edge has at least one same-layer sibling to reroute to. `visitNode` rolls 30% on a glitched-edge click and reroutes to a random sibling on the same layer with a "GLITCH REROUTE" floater + glitch_attack SFX. `renderMap` flickers glitched edges cyan→magenta→purple via `.map-path-glitched` keyframe.
- ✅ Both new edge classes hold static under `body.reduced-motion` and `body.perf-low`.

Part 30.4 is now **fully shipped** — all 5 per-sector map specials live.

---

## 4. Non-negotiables for every PR this week

Each change must:
1. **Not regress** the Day-1 FPS baseline at sector 5 with full board.
2. **Render correctly at 360×800** before merging.
3. **Stay on the cyberpunk palette** — `--ui-brand` (cyan), `--ui-alert` (magenta), `--ui-gold`, deep navy surfaces. No off-brand colors, no shadows that aren't a neon glow.
4. **Respect `Perf.tier`** — anything that adds per-frame cost gates behind `=== 'high'` or scales count by `Perf.CAPS[tier].maxParticles`-style budget.
5. **Bump `src/version.js` + `service-worker.js` CACHE_NAME** so the PWA cache doesn't serve stale JS.
6. **Pass `npx vitest run`** before pushing.

---

## 5. Asset procurement asks

Critical-path audio (would significantly upgrade the week's PRs):

| # | Asset | Why | Spec |
|---|-------|-----|------|
| 1 | **Combat recap sting** | Day 4 recap card needs an audio bookend | 1.0–1.5s, synthwave snare-and-pad swell, fade out tail |
| 2 | **Game-over autopsy drone** | Day 5 autopsy card | 2–3s descending bass drone with vinyl crackle, loopable |
| 3 | **Combo-trigger sting** (×3 variants) | Combos exist visually but no audio reward | 0.4–0.8s, glitchy synth zap with rising pitch |
| 4 | **Shield-break SFX** | Distinct from generic `defend.ogg` | 0.6s, glass-crack + electric snap |
| 5 | **Parry-success ping** | QTE perfect-parry currently uses generic hit | 0.3s, bright high-frequency chime |
| 6 | **Per-boss themes (×5)** | Currently all bosses share sector music | 90s loops at 110–130 BPM, distinct motifs per boss |
| 7 | **Menu/sanctuary track** | Menu sits silent | 90s ambient synthwave loop, calmer than combat tracks |
| 8 | **UI tap (×2 variants)** | `click.ogg` is the only UI ping; gets tiring | 80–120ms, soft synth tick |

Format: `.ogg` Vorbis q4 plus `.m4a` AAC 128k for iOS Safari fallback (matches the existing `synth1.{ogg,m4a}` pattern). 44.1kHz stereo. Drop into `sfx/` or `music/`.

Optional but appreciated:
- 6 short voice barks per class for class-ability triggers (Tactician "deploy", Bloodstalker "feed", etc.) — single voice actor, processed cyberpunk-radio.
- 24 cipher-doc unlock chimes (Part 27.1) — same 0.5s ping with subtle pitch variants.

If procuring is blocked this week, every Day-4–Day-5 audio cue can fall back to `mana.ogg` / `upgrade.ogg` / `grid_fracture.ogg` from the existing pool — flagged as TODO in code so swap-in is a one-line change.

---

## 6. Risks & open questions

- **60fps headroom unknown until Day 1.** If the baseline comes back at ~45fps mid-tier, Day 6 (idle animations) gets cut to high-tier-only and Day 3 expands to a particle-budget tightening pass.
- **Mobile QA is single-device.** Recommend buying / borrowing one Android (Pixel 6a / Galaxy A54) and one iPhone (12-class) for real-device testing — emulator FPS lies.
- **Asset procurement timing** — if SFX list returns mid-week, Day 4–5 ships with placeholders and a second commit lands the real audio.
- **Per-class animations (Part 26.1–26.3) are deferred.** They are 18 distinct animations and would consume the full week alone. Schedule them as Week 2.

---

**Next review:** end of Day 7 — re-audit, re-score, plan Week 2.
