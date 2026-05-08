# Magic v Machine. Roadmap

**Live tracker.** Edit when items ship; archive completed sections every
quarter. Replaces AUDIT_2026-05.md, SESSION_NOTES_2026-05.md,
WEEKLY_ROADMAP.md, and PRODUCTION_ROADMAP.md, all of which are now
in `docs/archive/`.

## Status

- **Current build:** v1.9.8 (Intel Codex deep dive complete: 40
  structured entries with multi-paragraph bodies, dedicated modal
  popup, format-specific rendering, rare unlock triggers wired)
- **Last ship:** 2026-05-08
- **Active branch:** main
- **Test baseline:** 98/98 passing
- **Frame metrics:** truthful (intervalBuf + workBuf split shipped v1.8.9)

Live checklist of what was claimed open in the old docs but is actually
shipped, removed during this consolidation:

- ✅ Hive Protocol 4→3 acts/turn (`constants.js:929`)
- ✅ Text-scale slider 80-140% (`index.html:1157-1159`)
- ✅ Dyslexic-font toggle (`index.html:1170-1171`)
- ✅ Intel Cipher + Chronicle tabs (collapsed back into the unified
  Intel screen. see `_renderIntelCipher` in game.js:12477)

## Buckets

Six buckets, ordered roughly by priority. Asset-bound work (Bucket 4)
runs in parallel because it's user-bound. Bucket 7 is the new Intel
Codex deep dive. see its dedicated section below.

### 1 · Perf & UX blockers

Carryover from AUDIT_2026-05. All small, all win-net.

- Reroll + end-turn button hit-zones too small at 360px (52×52 → 56×56)
  with translucent panel background to keep the dice-crescent clear
- Music fade timers leak through state transitions (raw `setInterval`
  not in `Game._intervals`) → migrate to `Game.setLoop`
- Particle pool O(n) victim scan when full → silent-skip when full (the
  visual cost of one missing particle is < the scan cost)
- Combat-recap + turn-digest fire on `Perf.tier === 'low'` with no
  fallback → gate to a single-line digest under low tier
- Touch handlers blanket `passive: false` → switch to `passive: true`
  except where `preventDefault` is genuinely needed
- Death-screen glitch animation `filter` causing repaints (30-35fps
  mid-tier) → promote to compositor layer or animate transform
- Save-quota exhaustion fails silently → toast + auto-prune oldest
  non-active slot on second consecutive fail

### 2 · Combat balance pass

Carryover from AUDIT_2026-05 §8 + new tuning items from v1.9.0.

- S2 → S3 enemy mean HP doubles (~55→110) → 15% reduction on S3
- S3 → S4 boss DPS jump (Hive 3 acts/turn already, residual on base
  dmg or other S4 bosses). verify against current numbers
- S4 enemy DMG flat vs S3 (1.07× ratio) → 15% bump
- **v1.9.0 mechanic tuning** (need real-play telemetry before tuning):
  - Tesseract Fragment HP/DMG (40/14). likely too easy at S5 power
  - Hive Surge cadence (every 4 turns; 3 in phase 3) + 5% Assimilate
    siphon. could create a death-spiral. Sanity-check
  - Time Control floor (10s). verify QTE chains don't overshoot
  - Reality Shift duration (currently 1 turn). consider 2 turns at
    Asc 5+
  - Victory rank thresholds (90/75/60/40). calibrate after 5-10 runs

### 3 · Accessibility & polish

Carryover from AUDIT §6, SESSION_NOTES.

- Achievement progress N/M for trackable counters
  (KILLS_50/250/1000, STREAK_*, DAILY_*)
- ✅ Module Fusion celebration moment. first-fusion banner + sting +
  shockwave; suppressed on repeats (shipped: layered grid_fracture +
  upgrade audio, stacked pink/gold shockwaves, screen flash, boss-
  variant banner; mvm_first_fusion_picked localStorage flag)
- Visual regression checklist. Settings modal padding, glossary tab
  wrap, hint-toast width, btn spin-loader positioning
- Tablet/iPad portrait pass. `@media (min-width: 768px) and
  (pointer: coarse)` rule never QA'd

### 4 · Audio asset queue (user-bound)

Carryover from WEEKLY_ROADMAP §5. These need user-procured drops; the
hooks already exist in code.

**Critical (8):**

1. Combat-recap sting (1.0-1.5s synthwave swell)
2. Game-over autopsy drone (2-3s descending bass + vinyl, loopable)
3. Combo-trigger sting ×3 variants (0.4-0.8s glitchy zaps)
4. Shield-break SFX (0.6s glass-crack + electric snap)
5. Parry-success ping (0.3s bright chime)
6. Per-boss themes ×5 (90s loops, 110-130 BPM)
7. Menu / sanctuary track (90s ambient synthwave loop)
8. UI tap variants ×2 (80-120ms soft synth ticks)

**Optional (2):**

9. Per-class voice barks ×6 classes (36 clips)
10. Cipher-doc unlock chimes ×24 (0.5s pitch variants)

### 5 · Endgame depth

Carryover from SESSION_NOTES §5.

- Endless Spire content variety. Sectors 6+ currently reuse S5
  backdrop. Pick one of:
  - Visual rotation: 3-5 alternate palettes, cycle every 5 sectors
  - Boss rotation: pick from BOSS_DATA per endless sector, scale stats
  - Stacking modifier: +10% enemy HP/sector, skill dice cost +1, etc.
- Sanctuary NPC enhancements:
  - Smith fusion. combine 2 banked relics → 1 upgraded (8 sparks,
    consumes both)
  - Oracle streak bonus. streak ≥3 grants +1 free reroll banked
  - Curator trophy challenges. sector-specific feats (S1 boss
    <10 turns) at 2 sparks each
- Pity timer / dice weight (Part 2.1.1, 2.1.5)
- QTE accessibility variants (Part 2.4.3). slower windows, larger
  press zones, optional auto-perfect with halved damage

### 6 · Mobile / device-specific

New bucket post-v1.9.0. driven by Honor Tab 10 playtest.

- Honor Tab 10 throttling. diag dump showed device at 26fps with
  2.4ms work. External (display Hz / battery saver / browser policy).
  - Test on 3-4 more Android devices to scope the problem
  - Detect 30Hz delivery and surface a one-line player hint
  - Possibly skip every-other-frame canvas redraw when delivered fps
    is locked at half-rate (DOM updates already throttled)
- Tutorial CSS deep-dive. v1.8.8 trimmed obvious offenders but
  Honor Tab still reported tutorial lag. Audit `.breakout-storyboard`
  + `.tutorial-narration` line by line for next-tier wins.
- Diag-dump artifact archive. `docs/diag-archive/` folder, dumps
  tagged by device + version, helps track perf trends.

### 7 · Intel Codex deep dive ✅ SHIPPED

**Closed v1.9.8.** All six chunks landed:

- C7.1 v1.9.1: structured intel-codex.js scaffold with 40 entry
  metadata records and backwards-compat re-export
- C7.2 v1.9.2: dedicated modal popup, format-specific rendering,
  swipe / arrow / hash routing, READ FULL on unlock card
- C7.3 v1.9.3: chapter I bodies (THE FALL, 8 entries)
- C7.4 v1.9.4: chapters II + III bodies (16 entries)
- C7.5 v1.9.5: chapters IV + V bodies (9 entries)
- C7.6a v1.9.6: 7 hidden entry bodies
- C7.6b v1.9.7: typewriter reveal, redacted glitch, unread badge
- C7.6c v1.9.8: rare unlock triggers wired to player actions

Total: ~13,740 words across 40 entries. Six format voices
(field_report, personal_log, cipher_fragment, manifesto,
audio_transcript, schematic). Cross-chapter character
continuity (Vish, Lin, M. Kel, V. Aroma, Henderson, the
Archivist, the Shopkeeper). The singular antagonist arc closes
with entry 38 (Patch Note 0.0.0) where the Core speaks for the
first time. Hidden tail gated on rare actions (no-death S5
clear, S20 endless, qte-perfect run, all-bosses-no-minion-loss,
low-hp killing blow, cumulative 1000 kills, all-other-lore-
decrypted).

Kept the original section below archived for reference.

**See dedicated section below.** This is a content + UI overhaul, not a
bug fix bundle, so it gets its own design section. Implementation will
chunk into 5-6 commits after sign-off.

### 8 · Refactor. boss minion framework

New bucket. Tesseract Fragments + Hive Drones + Compiler Bolster Mechs
all share a "boss has dependent minion swarm with shared invincibility
gate or stat-feed mechanic" pattern. Each is bolted on by hand today.
Worth a small refactor pass before the next boss is added.

- Shared `_dependentMinions` accessor on Enemy
- Shared "invincible while dependents alive" hook in `takeDamage`
- Shared resummon-after-N-turns scheduler

Not urgent. Schedule when adding the next boss.

### 9 · Status-effect rendering audit

New bucket post-v1.9.0. Reality Shift is a player-facing debuff with
big consequences; need to verify:

- `reality_shift` shows up as a player-side debuff pip with its own
  colour (purple) in the existing effects strip
- The `body.reality-shift` class fires a screen vignette while active
  (the v1.9.0 plan called it out but I didn't ship the vignette CSS)
- `summon_hive` + `reality_overwrite` intents appear in the intent
  preview a turn ahead, not just at resolve

### 10 · Post-launch (deferred by design)

PRODUCTION_ROADMAP design-locked items. No code work until backend /
distribution decision lands.

- Leaderboards (no backend)
- Replays (no backend)
- Friends (no backend)
- Soft-launch market decision
- Cosmetics shop sprite asset pack
- Voiceover (Part 7.5)
- Per-class attack/summon/death animations (18 anims, ~1 day per class)

---

## Intel Codex deep dive (Bucket 7)

> **Status: PROPOSAL. needs user sign-off before implementation chunks
> get split into commits.**

### Problem

The Intel system is the game's lore vehicle. Today it ships 33 single-
sentence epigrams (avg 8.5 words, max 14) shown via a tooltip on a
cipher grid. Players unlock them via Hex Breach and never re-read them.
The voice is great. terse cyberpunk-resistance briefing. but the
content is too thin to support the world the rest of the game's
copywriting (boss banners, sector descriptions, post-tutorial slate)
implies.

The opportunity: turn the codex into a destination. Each entry should
be a recovered file the player wants to open and re-read, not a
fortune cookie.

### Goals

1. **Story depth**. expand each entry from one sentence to 3-5
   in-world paragraphs in five distinct format voices (field report,
   personal log, cipher fragment, manifesto, audio transcript).
2. **Dedicated read experience**. replace the tooltip with a
   full-screen modal (mobile) / glass-panel popup (desktop) that
   treats each entry as a recovered document.
3. **Re-readability**. every decrypted entry is permanently
   browsable from the Cipher grid; the existing first-unlock flash
   popup stays as the celebration moment but routes to the new modal
   for deep reading.
4. **Hidden entries**. add 3 new entries unlocked by rare conditions
   (all 5 bosses without dying, S20 Endless, full QTE-perfect run)
   so the codex has an endless tail for completionists.
5. **Voice consistency**. every entry written in the existing
   cyberpunk-resistance register. No high fantasy, no purple prose,
   no comic relief.

### Data model

Move from `LORE_DATABASE: string[]` (constants.js:101-135) to a new
`src/data/intel-codex.js` exporting structured entries:

```js
{
  id: 1,                          // matches existing chapter index
  chapter: 'THE_FALL',            // THE_FALL | THE_NEW_WORLD |
                                  // THE_RESISTANCE | THE_CLASSES |
                                  // THE_TRUTH | HIDDEN
  format: 'field_report',         // field_report | personal_log |
                                  // cipher_fragment | manifesto |
                                  // audio_transcript
  classification: 'PROTOCOL-7',   // in-world security tag
  decryptDate: '04/22/2087',      // in-world date stamp
  shortTitle: 'The Convenience Trap',
  legacyEpigram: 'The Silicon Empire emerged not from war, but from convenience.',
                                  // existing single-line, used for
                                  // backwards compat + as the modal's
                                  // header pull-quote
  body: [                         // array of paragraphs
    'Field-extract from a recovered census ledger, Region 4...',
    'The first delegation was nine board members and a software...',
    '[REDACTED. three lines]',
    'By the time the holdouts realised the Empire was no longer...'
  ],
  flavorTags: ['redacted', 'corporate'],   // optional render hints
  unlockCondition: 'breach_default',       // breach_default | rare
  rareUnlock: null                          // for hidden entries:
                                            //   { type: 'no_death_run' }
                                            //   { type: 'endless_s20' }
                                            //   { type: 'qte_perfect_run' }
}
```

Backwards compat: re-export `LORE_DATABASE` as
`INTEL_ENTRIES.map(e => e.legacyEpigram)` so existing code that reads
the old strings keeps working until callers migrate.

### Format voices (style guide)

Each entry uses one of five formats. Rough chapter weighting:

| Chapter        | Field | Personal | Cipher | Manifesto | Audio |
|----------------|-------|----------|--------|-----------|-------|
| THE_FALL       | 4     | 1        | 2      | 0         | 1     |
| THE_NEW_WORLD  | 3     | 2        | 2      | 0         | 1     |
| THE_RESISTANCE | 1     | 2        | 1      | 3         | 1     |
| THE_CLASSES    | 1     | 4        | 0      | 1         | 2     |
| THE_TRUTH      | 0     | 1        | 0      | 0         | 1     |
| HIDDEN         | 0     | 1        | 1      | 0         | 1     |

**Format rules:**

- **field_report**. third-person, dispassionate. Headed with file
  metadata. Past tense. Specific numbers.
- **personal_log**. first-person, fragmentary. Time stamps. Cut
  off mid-sentence on the final paragraph.
- **cipher_fragment**. recovered text with `[REDACTED]` /
  partial-glyph corruption. 60-70% legible.
- **manifesto**. second-person, urgent. Imperative verbs. No
  exclamation marks (the genre eats them).
- **audio_transcript**. formatted as `[00:14] Speaker A: ...` with
  static descriptors `[STATIC]`, `[DISTANT EXPLOSION]`.

Voice anchor: every entry should pass the test "could this paragraph
appear in the existing post-tutorial slate without seeming out of
place?" The bar is the existing voice, not new.

### UI. dedicated modal

New element `#intel-modal`, glass-panel modal class. Triggers:

- Tap on a decrypted Cipher tile (replaces current tooltip)
- "READ FULL" button on the first-unlock flash popup (new button on
  existing popup; unchanged otherwise)
- Hash-link `#/intel/<id>` for share-extract URLs (optional polish)

**Layout:**

```
┌────────────────────────────────────────┐
│  [×]                          [‹] [›]  │  ← close + prev/next
├────────────────────────────────────────┤
│  // FILE 01 · DECRYPTED                │  ← number + state
│  CLASSIFICATION: PROTOCOL-7            │  ← in-world meta
│  DATE: 04/22/2087                      │
│                                        │
│  THE CONVENIENCE TRAP                  │  ← decrypted title
│                                        │
│  > The Silicon Empire emerged not      │  ← legacy epigram as
│  > from war, but from convenience.     │     pull-quote
│                                        │
│  Field-extract from a recovered        │  ← body paragraphs
│  census ledger...                      │
│                                        │
│  [REDACTED. three lines]              │  ← flavor styling
│                                        │
│  ...by the time the holdouts realised  │
│  the Empire was no longer optional.    │
│                                        │
├────────────────────────────────────────┤
│        ★ EXTRACT (share quote)         │  ← optional polish
└────────────────────────────────────────┘
```

**Interaction:**

- `‹` / `›` arrows step through unlocked entries in chapter order
- Swipe left/right on mobile = same
- `Esc` / tap outside / `×` closes
- First-time-opening-this-entry plays a 0.4s typewriter reveal on the
  body; subsequent reads skip animation. Fully bypassable via
  `body.reduced-motion`.
- Auto-marks the entry as "read" so a future Intel-tab badge can show
  unread-count.

**Styling:**

- Glass-panel matches existing modals (gold-amber accent for THE_FALL,
  cyan for THE_NEW_WORLD, lime for THE_RESISTANCE, magenta for
  THE_CLASSES, gold for THE_TRUTH, white for HIDDEN. same palette
  the chapter divider uses).
- `[REDACTED]` rendered as solid black blocks with `mix-blend-mode:
  difference` so they animate subtly when scrolled.
- `cipher_fragment` corrupted glyphs get a per-char glitch animation,
  rate-limited to 1 per second to avoid being annoying.
- `audio_transcript` formatted with monospace font + speaker
  highlighting.

### Hidden entries (3 new)

| Entry | Chapter | Trigger | Concept |
|-------|---------|---------|---------|
| 34    | HIDDEN  | Clear S5 in one run with zero deaths | "The Green Spark. Field Notes". first-person personal log of the player's own avatar, recovered after a successful infiltration |
| 35    | HIDDEN  | Reach S20 in Endless | "Beyond the Spire". audio_transcript of a survivor who entered the Spire and never came out, voice changes mid-transcript |
| 36    | HIDDEN  | Full QTE-perfect run (every QTE in every fight) | "Operator Profile". field_report assessing the player as a pattern-recognition anomaly the Empire wants to capture |

### Implementation chunks (proposed split)

**Run by user FIRST. Don't start until approved.**

1. **C7.1. data scaffold** (1 commit): Create `src/data/intel-codex.js`
   with the structured shape, backfill the 33 existing entries with
   minimal stubs (legacyEpigram only, plus chapter/format/title fields
   so the modal can render). Wire backwards-compat
   `LORE_DATABASE` re-export.
2. **C7.2. modal UI** (1 commit): Build `#intel-modal` markup + CSS,
   prev/next navigation, swipe handler, redirect Cipher tile click.
   Renders empty body (just legacy epigram + title) until C7.3 lands.
3. **C7.3. bodies, batch 1: THE_FALL** (1 commit): Write the 8
   long-form bodies for chapter I.
4. **C7.4. bodies, batch 2: THE_NEW_WORLD + THE_RESISTANCE** (1 commit):
   16 bodies.
5. **C7.5. bodies, batch 3: THE_CLASSES + THE_TRUTH** (1 commit):
   10 bodies.
6. **C7.6. hidden entries + polish** (1 commit): Three rare-unlock
   entries; per-format styling (typewriter, redacted blocks, audio
   transcript formatting); unread badge on Intel tab.

Total commits: 6. Estimated content effort: heaviest of any roadmap
bucket. Each body is ~150-250 words; 36 bodies = ~6,500 words of
in-world fiction.

### Risks

- **Tone drift**. easy for long-form content to slide into purple
  prose or comic relief. Mitigation: format rules above + voice-anchor
  test before each batch ships.
- **Modal complexity vs scope**. typewriter animation, swipe
  handlers, hash routing, audio cues all easy to over-engineer. C7.6
  is the polish chunk; everything before it is the must-have. If time
  pressure hits, drop C7.6 entirely; the codex still ships at C7.5.
- **Save-data growth**. 36 entries × ~1KB JSON ≈ 36KB. Bounds-checked
  in current quota. Not a real risk.

### Out of scope for this deep dive

- Voice acting / per-entry audio (lives in Bucket 4 audio queue as
  optional asset #10)
- Cross-references between entries (cipher_fragment X mentioning
  field_report Y). interesting but adds combinatorial editing cost
- Player-authored entries / user-generated content
- Localisation. content stays English-only this pass

---

## Conventions

- New roadmap items go into the most-fitting bucket above. New buckets
  only when an item doesn't fit any existing one.
- Shipped items get crossed out with a one-line "shipped <version>,
  <commit>" annotation, then archived to a `## Shipped` section once
  per quarter.
- Stale claims found during ship work get an `~~strikethrough~~` with
  a one-line explanation pointing at the actual code.
- This file is the source of truth. PRODUCTION_ROADMAP / AUDIT /
  SESSION_NOTES / WEEKLY_ROADMAP are archived at `docs/archive/` for
  historical reference only. do not edit them.
