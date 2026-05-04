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

### Day 3 — Combat HUD densification (Part 25.7)
- [ ] **Health ribbon** overlay across the top of player + enemy sprites instead of the current floating bars (saves vertical space on portrait).
- [ ] **Top-left collapsible chip** for SECTOR / TURN / FRAGMENTS — collapses to icon-only after 3 turns of inactivity, expands on tap.
- [ ] Move the intent preview card to a **glass-edged dock** that hugs the top of the dice tray, capped at 2 lines on mobile (already truncates by viewport).
- [ ] Cyberpunk aesthetic checklist: glass-edge underline, neon-cyan brand glow on health, magenta on enemy, no solid fills.

**Acceptance:** at 360×800, the combat scene has no overlap between HUD chrome and entities; intent text remains readable.

### Day 4 — End-of-turn digest + end-of-combat recap (Part 31.1, 31.2)
- [ ] **End-of-turn floater (2s)**: top-centre glass card — `TURN N · DEALT X · TAKEN Y · DICE USED Z · <class metric>`. Opacity fade in/out. Skippable with tap.
- [ ] **End-of-combat recap card (3s, dismissible)**: portrait-vs-portrait, total dmg dealt vs taken, "Biggest hit: N", three highlight chips (combo names triggered, parries, lifesteals). Plays before the reward screen.
- [ ] Both panels respect `prefers-reduced-motion`: hold-only, no slide.

**Acceptance:** turn digest reads in <2s without breaking combat flow; recap card cleanly hands off to reward screen; both look like the existing intent-preview glass family.

### Day 5 — Post-death autopsy + share-out hooks (Part 31.3, 31.4)
- [ ] Replace the current Game Over screen with an **Autopsy card**: `CAUSE OF DEATH: <enemy name> — <amount> DMG`, generated **lesson** based on run telemetry (e.g. "0 mana spent — try Skill dice", "no rerolls used after turn 5"), `RESTART` + `MAIN MENU` + `SHARE` buttons.
- [ ] Wire **share triggers**: Sector 5 first clear, Asc 5+ clear, Custom Run with 3+ negative modifiers, 100k fragments milestone. Use existing `src/services/share.js`.
- [ ] Cyberpunk aesthetic: scanline overlay on the death screen, glitch-stutter the cause-of-death string once on entry.

**Acceptance:** running a test death and a test Sector-5 win both surface the right card; share generates a 1080×1080 PNG via existing share.js.

### Day 6 — Per-enemy death dissolves + idle micro-animations (Part 26.5, 26.6)
- [ ] **Death dissolves per `kind`**: `mirror` → glass-shatter into shards; `frost` → ice-crack + steam; `immolate` already does its own; `burrow` → sink with dust column; `clone` → digital phantom split; `aoe_sweep` → radial gust; `chaotic` → pixelated noise burst; `observer` → eye-implode flash; default → existing explosion. Reuse particle pool, no new sprites needed.
- [ ] **Idle anims per shape**: gentle hover bob for `wisp` and `drone`, treadle for `tank`, leg-shift for `spider`, scope-creep for `sniper`. All cap at 2 sin() per frame and gate via `Perf.tier === 'high'` if total cost trips Day 1's budget.

**Acceptance:** day 1 fps target still hit; every enemy in roster shows a unique death animation in a dev grid; combat scene reads "alive" when paused.

### Day 7 — Map visual upgrade + asset list + buffer (Part 30.3)
- [ ] **Circuit-board nodes** — replace bare circles with hex/diamond glyphs by type (combat=hex, elite=diamond, shop=square, event=octagon, rest=teardrop, treasure=star).
- [ ] **Glowing trace connections** — gradient stroke between nodes, animated dash offset for the "data packet" feel.
- [ ] **Pulsing player position** — diamond pip with brand-cyan glow.
- [ ] Visited nodes dimmed, future nodes show type icon + long-press tooltip.
- [ ] Mobile fit: must lay out within one viewport at 360 width, no horizontal scroll.
- [ ] Finalize §5 asset procurement list and commit.

**Acceptance:** map is the most-improved screen of the week; perf budget holds; tooltip works on touch (long-press, not hover-only).

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
