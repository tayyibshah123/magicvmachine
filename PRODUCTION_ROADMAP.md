# Magic v Machine — Mobile Production Roadmap

A meticulous, end-to-end plan to ship *Magic v Machine* as a casual-friendly, deeply masterable mobile roguelite on **iOS** and **Android**. Everything below is structured so a small team (1–3 devs + contractor art/audio) could execute it in quarter-long chunks.

**Document conventions**
- **[P0]** ship-blocker (cannot launch without) · **[P1]** high-value (should launch with) · **[P2]** nice-to-have / post-launch
- **S** ≈ 1 day · **M** ≈ 1 week · **L** ≈ 2–4 weeks · **XL** ≈ 1 month+
- "AC:" = Acceptance Criteria (what "done" looks like)
- "Risk:" = the most likely way this item slips or fails

---

## Part 0 — Positioning, audience, pillars

### 0.1 Target audience
- **Primary:** 18–34yo casual mobile players who enjoyed *Slay the Spire*, *Dicey Dungeons*, *Dead Cells Mobile*, *Downwell*, *Luck Be a Landlord*, *Balatro*. They want 2–20 minute sessions, quick restarts, progression between runs.
- **Secondary:** Deck-builder veterans who see the dice twist on the genre and want deep class mastery (ascension scene).
- **Tertiary:** Lapsed console roguelite players who can't commit to 40-hour runs but miss the genre.

### 0.2 Five pillars — every feature decision passes through these
1. **One-tap to combat.** From cold-launch to rolling the first die of a run: ≤30 seconds.
2. **Every roll feels weighty.** Visual, audio, and haptic feedback on every interaction.
3. **Lose fast, learn fast.** A run never exceeds 25 minutes; death screens show concrete lessons.
4. **Class identity above all.** Each class should play, look, sound, and feel mechanically distinct.
5. **Mobile-native, not a port.** Built for thumbs, for commute-length sessions, for intermittent connectivity.

### 0.3 Reference matrix
| Reference                  | What we steal                                                         | What we reject                       |
|----------------------------|-----------------------------------------------------------------------|--------------------------------------|
| Slay the Spire             | Relic stacking, boss variety, map node chess                          | Deck-heavy UI, desktop-first tooltips |
| Dicey Dungeons             | Dice-as-cards visual metaphor, chunky feedback                        | Character-per-run gimmick            |
| Balatro                    | Satisfying score pops, compulsive "one more hand"                     | Pure score-chase ending              |
| Luck Be a Landlord         | Tight portrait layout, mobile-first                                   | Symbol-combo fatigue                 |
| Monster Train              | Dual-lane parallel combat, ride replay value                          | Complex card layering for mobile     |
| Hades                      | Narrative dripped into every run                                      | 40-hour time commitment              |
| Vampire Survivors (mobile) | Restart friction = zero                                               | Visual maximalism that hurts clarity |

### 0.4 What we are NOT
- We are not an auto-battler. The player's hand matters every turn.
- We are not a gacha. No randomized character/relic pulls tied to monetization.
- We are not endless. Each run has a defined conclusion (Sector 5 boss or death).
- We are not grimdark. Neon + cyberpunk snark, never cruel or hopeless.

---

## Part 1 — Onboarding (first 3 minutes)

> *If they don't get to "I summoned a minion and smashed a robot" in under 3 minutes, they churn. Everything else in this roadmap is useless if onboarding fails.*

### 1.1 First-launch flow — target 3 min to first combat victory
**[P0 · L]** Replace current tutorial with a scripted 5-stage onboarding:

| Stage | Screen           | Time budget | Goal                                         |
|-------|------------------|-------------|----------------------------------------------|
| 1     | Intro splash     | ≤5s         | Brand impression, "TAP TO CONTINUE"          |
| 2     | Name entry       | 15s         | Personalization anchor (shown in lore)       |
| 3     | Combat tutorial  | 90s         | Roll → drag → hit enemy → block → minion     |
| 4     | First real combat| 60s         | Win a tutorial-only easy fight                |
| 5     | Sector 1 node 1  | 30s         | Free-play starts. First win cements habit.    |

**AC:**
- Every stage can be skipped (visible skip button from stage 2 onwards).
- Tutorial combat is rigged to be winnable with random reasonable play.
- Player cannot get stuck — if they idle >20s on a step, the prompt animates harder and eventually the action auto-performs for them.
- Tracked analytics event: `onboarding_stage_complete` with stage id + seconds elapsed.
- Target funnel: 95% reach stage 3, 85% reach stage 5, 70% start a real run.

**Risk:** Tutorial rigidity makes returning players angry. Mitigation: detect a completed tutorial in cloud save / localStorage and auto-skip.

### 1.2 Contextual micro-tooltips
**[P0 · M]** First-time-see-X tooltips for every major mechanic. Dismissable. Never shown twice.

- **Triggers:** First reroll, first shield, first minion, first elite (each affix type), first relic pickup, first shop, first rest, first boss sighting, first death, first ascension unlock.
- **Format:** Translucent panel over the target element with a 4–8 word description and a single "GOT IT" button.
- **Storage:** Per-player flag `tutorial.seen.X` in localStorage + cloud.
- **AC:** Every tooltip is <8 words, finger-sized (≥48dp tap target), dismisses on tap anywhere.

### 1.3 Progressive feature unlocks
**[P1 · M]** Hide complexity until the player is ready.

| Feature                     | Unlock condition                     |
|-----------------------------|--------------------------------------|
| Daily Run button            | Complete first run (win or lose)     |
| Ascension 1                 | First Sector 5 clear                 |
| Corrupted relics            | First event reward choice            |
| Intel (Hex Breach)          | First boss elite drop                |
| Advanced settings (dev tab) | Never shown to end users             |

**AC:** On fresh install, main menu shows only: INITIATE RUN, SANCTUARY, SETTINGS. Daily/Intel/Ascension appear via a subtle "+NEW" badge + shake when unlocked.

### 1.4 Return-player onboarding (v1.1+)
**[P1 · S]** If a player hasn't launched in 14+ days:

- Show a 3-card refresher on launch: "last run you did X", "here's what's new", "quick play or continue".
- Grant a 100-fragment "welcome back" gift.
- Trigger analytics event `retention_d14_reengaged`.

---

## Part 2 — Core loop polish

### 2.1 Dice mechanics

#### 2.1.1 Already in-progress (ship this first)
- **[P0 · S]** Once-per-hand cap on locked skill dice (RECKLESS_CHARGE / OVERCHARGE / VOODOO).
- **[P0 · S]** Signature dice pity timer (miss 2 turns → guarantee turn 3).
- **[P0 · S]** Base-dice floor (every hand has ≥1 zero-cost base die).

#### 2.1.2 Dice affordances (feel)
**[P0 · M]** The 6 die "senses":
1. **Hover** — lift, glow, outline.
2. **Select** — ring pulse, soft chime.
3. **Drag** — constant ghost-trail particle, soft hum.
4. **Hover-target** — target jitters/glows, arrow line from die to target.
5. **Drop-valid** — hit flash + damage number + target shake + haptic light.
6. **Drop-invalid** — red flash + "nope" buzz + die returns with bounce.

**AC:** Each sense has a unique sound (not recycled), a unique haptic (iOS `UIImpactFeedback`, Android `VibrationEffect`), and a unique particle burst. Fallback gracefully on platforms without haptics.

#### 2.1.3 Combo dice
**[P1 · M]** Rolling 2+ of a base type grants a situational bonus:
- 2× ATTACK → "Double Strike": next attack hits twice.
- 3× ATTACK → "Flurry": first attack hits all enemies.
- 2× DEFEND → "Bulwark": shield gained is doubled for the first use.
- 2× MANA → "Overflow": each MANA grants +1 reroll instead.
- 2× MINION → "Sibling Bond": both minions start at +3 HP.

**AC:** Combo banner shows top-of-hand for 1.5s when a combo is detected. Haptic pulse. Tooltip explains. Analytics `combo_triggered` with type + count.

#### 2.1.4 Sealed dice
**[P1 · M]** Certain events/relics "pin" a die type. Example event: *"Firmware Pin — next 3 turns always roll one MINION."*
- Visual: pinned die slot is locked with a magenta ring. Can't be rerolled on.
- AC: Sealed state persists across turns. Display a "SEALED: MINION (2 turns left)" chip under the hand.

#### 2.1.5 Dice weights (shop / meta)
**[P2 · M]** Spend fragments to permanently bias rolls:
- "Weighted ATTACK" meta upgrade: +5% roll chance for ATTACK.
- Max 3 weights active at once. Trade-off: heavy bias reduces variety.

### 2.2 Combat feedback layer

#### 2.2.1 Damage numbers
**[P0 · S]** Tiered visual/audio treatment:
| Tier          | HP range      | Font size | Color      | Sound      | Shake |
|---------------|--------------|-----------|------------|------------|-------|
| Chip          | 1–9          | 28px      | white      | tick       | none  |
| Solid         | 10–29        | 36px      | #ff3355    | thud       | light |
| Crit          | QTE bonus    | 52px      | #ffd700    | metal hit  | med   |
| Heavy         | 30–99        | 60px      | #ff1100    | boom       | med   |
| Catastrophic  | 100+         | 84px      | red→white  | explosion  | heavy |

**AC:** Numbers arc upward with easing, stack if overlapping, never overlap the HP bar.

#### 2.2.2 Hit stop (freeze frame)
**[P1 · S]** On Heavy+ damage or boss crit, freeze the game for 80ms. On Catastrophic, freeze for 200ms + white flash.

#### 2.2.3 Camera juice
**[P1 · M]** Mild camera effects during combat only:
- **Zoom-in** to boss face for 600ms when a new boss phase begins.
- **Shake** tuned per event (see table in §4.1).
- **Slow pan** during void-crush countdown.

#### 2.2.4 Combat log
**[P0 · M]** Tap-to-reveal log panel — the #1 trust-builder for theorycraft players.
- Accessible via top-right icon during combat.
- Shows last 15 events: "You dealt 18 (base 15 + 20% crit). Enemy took 18."
- Filter chips: All / Damage / Healing / Buffs / Deaths.
- AC: Opens in <200ms, closes on backdrop tap, doesn't block input underneath.

### 2.3 Class identity sharpening
**[P1 · L]** Each class should have at least 3 unique mechanical identifiers visible within 1 turn:

| Class        | Visual identifier                | Mechanical identifier                    | Audio identifier           |
|--------------|----------------------------------|------------------------------------------|----------------------------|
| Tactician    | Blueprint overlay during turns   | +1 Reroll per combat                     | Clockwork tick             |
| Arcanist    | Floating runes orbit             | Mana crackles visually                   | Ethereal hum               |
| Bloodstalker| Blood particles on attack        | Red screen vignette on low HP            | Wet visceral SFX           |
| Annihilator | Explosion radius glow            | Extra screen shake on attack             | Industrial boom            |
| Sentinel    | Hex-plate armor chunks on body   | Shield regen sound on turn start         | Metallic clang             |
| Summoner    | Leaf/nature particle trail       | Minion spawn is larger + greener         | Woodwind motif             |

**AC:** A playtester shown 5 seconds of gameplay with the name hidden can identify the class 4/6 times (67%).

### 2.4 QTE (Quick Time Events)

#### 2.4.1 Rebalance
**[P0 · S]**
- Perfect block window: currently ~10% of ring → bump to 15%.
- Good block window: currently ~30% → bump to 40%.
- Crit window: currently ~25% → unchanged.
- Miss window is tightened to compensate.

#### 2.4.2 New QTE variants
**[P1 · M]**
- **Rhythm Taps** — 3 beats timed to music. Perfect on all 3 = +50% damage.
- **Drag Defuse** — drag a slider from left to right while a red zone moves. Miss = take +X damage.
- **Hold & Release** — hold finger down until a bar fills to the yellow zone.

Each variant is triggered by specific dice / relics, never forced on every combat.

#### 2.4.3 Accessibility toggle
**[P1 · S]** Setting: "Auto-QTE at 80% efficiency" — for players with motor impairments or who just want chill play.

### 2.5 Reroll UX
**[P1 · M]**
- Selecting dice: tap-to-select with clear "locked" state (chain icon appears).
- Default reroll behavior: reroll UNSELECTED (locked ones stay). Currently reversed.
- Visual affordance: locked dice drop alpha slightly; reroll button shows "Reroll 3" with count.
- Blood Stalker (HP cost reroll): confirm dialog appears first time per run, then remembered.

### 2.6 Intent clarity
**[P0 · M]**
- Enemy intents show calculated damage POST all buffs/debuffs.
- Hover (or tap) on intent: shows breakdown ("15 base × 1.5 crit = 22, then -7 shield = 15 HP").
- Multi-intent bosses (Panopticon) clearly number each intent (1/2).

---

## Part 3 — Difficulty curve

> *"Easy to pickup, hard to master" is the product promise. Every design decision must preserve this.*

### 3.1 Difficulty philosophy
- **First win:** winnable in 2–3 attempts for a total novice. Sector 1 boss is tanky but slow.
- **Mastery wall:** starts at Ascension 3. Separates casual from dedicated.
- **Endgame:** Ascension 10 is for 1% of players. No rewards gated behind it except cosmetics.

### 3.2 Difficulty tuning
**[P0 · L]** Establish target win rates via telemetry, iterate monthly:

| Tier                  | Target win rate | Current (est.) |
|-----------------------|-----------------|----------------|
| Sector 1              | 85%             | ?              |
| First full run (A0)   | 55%             | ?              |
| Ascension 1           | 40%             | ?              |
| Ascension 5           | 25%             | ?              |
| Ascension 10          | 10%             | ?              |

### 3.3 Dynamic difficulty adjustment (stealth, NOT adaptive AI)
**[P2 · M]** If a player loses Sector 1 three times in a row:
- On attempt 4: boss HP silently reduced by 10%, shows subtle "adaptive" icon in HUD (transparency is important).
- Reverts on win.
- Ascension mode disables this entirely.

**Risk:** Hardcore players hate adaptive difficulty. Must be clearly disabled in Ascension and communicated.

### 3.4 Session length budgets
**[P0 · S]** Target session lengths on mobile:
- **Quick tap:** 3–5 minutes (abort-friendly runs with auto-save).
- **Commute:** 15–25 minutes (typical run).
- **Deep dive:** 45–60 minutes (meta + run + experimentation).

Resume-run feature (already exists) must be bulletproof. See §6.3.

### 3.5 Failure states
**[P0 · M]** Death screen is the single most important retention moment on mobile. Rebuild:

**Current:** "CRITICAL ERROR" title, fragment count, retry buttons.
**New:**
- **Top third:** "DEFEATED BY: [enemy name]" with their portrait.
- **Middle:** 3 bullet "What happened" cards: best moment, worst turn, missed opportunity. Pulled from combat log.
- **Bottom:** "RETRY / NEW CLASS / SANCTUARY" with retry being visually largest.
- **Animation:** slow scan-line sweep revealing each card. Reduced-motion skips sweep.

**AC:** Player can restart in 2 taps. Fragment count visible but not the focus.

---

## Part 4 — Meta progression & retention

> *This is what keeps them coming back tomorrow.*

### 4.1 Sanctuary (already in-game — deepen)
**[P0 · L]** The sanctuary is already the long-term progression hub. Deepen:

1. **Visual restoration:** every meta upgrade purchased should visibly change the sanctuary view. Add 10+ tiers of restoration.
2. **Weather system:** cycles through day/dusk/night/dawn based on total playtime. Rain on specific sectors cleared.
3. **NPCs move in:** unlocked per meta milestone.
   - **Gatekeeper** (default) — daily run button, intel access.
   - **Smith** (unlocks at 5 metas bought) — relic reroll service.
   - **Oracle** (unlocks after first ascension) — preview next run's starting relic pool.
   - **Curator** (unlocks after decrypting all lore) — trophy room access.
4. **Trophy room:** rotating 3D-ish display of defeated bosses + decrypted files.
5. **Seasonal decorations:** holiday-themed accents during real-world events (Christmas lights, Halloween ghosts, etc.).

### 4.2 Achievement system
**[P1 · L]** 80+ achievements across 4 categories:

| Category     | Count | Examples                                                              |
|--------------|-------|-----------------------------------------------------------------------|
| Progression  | 20    | "First Blood", "Sector 3 Cleared", "Ascension 5 Reached"              |
| Class        | 30    | 5 per class — "Tactician: Win without using rerolls"                  |
| Build        | 15    | "Synergy Master", "Pure Minion run", "No-damage Sector"               |
| Hidden / Feat| 15    | "Die in 1 turn", "Reach boss with 1 HP", "Skip all rewards"           |

**AC:**
- Unlock notification is subtle — corner toast, not a full-screen interrupt.
- Achievement screen accessible from main menu AND from death screen.
- Progress bars on locked achievements.
- Cloud-synced.

### 4.3 Daily / weekly / seasonal

#### 4.3.1 Daily runs
**[P1 · M]** Already has framework. Complete it:
- Seed advances at local midnight OR a global midnight (pick one — global is better for leaderboards).
- Fixed class + fixed starting relic + fixed sector order.
- Leaderboard (see §8).
- Retry limit: 3 attempts per day (hardcore cap) or unlimited with no leaderboard after first attempt (casual).
- Reward for participation: 50 fragments. Reward for winning: 200 fragments + cosmetic.

#### 4.3.2 Weekly challenges
**[P1 · M]**
- One challenge per week, rotating themes: "no shield modules", "minion-only", "A5 ironman", "speedrun".
- 7-day global leaderboard.
- First-time completion rewards a 1-week cosmetic frame.

#### 4.3.3 Seasonal events
**[P2 · L]** Month-long themed runs:
- Holiday skins, themed modules, exclusive boss variant.
- Running leaderboard with end-of-season reward ceremony.

### 4.4 Ascension
**[P1 · M]** Expand from 10 to 20 levels with finer-grained modifiers:
- A1: Enemies +10% HP.
- A2: +1 enemy in elite fights.
- A3: Shop prices +25%.
- A4: Boss gains 1 phase tweak.
- A5: Start with -10 max HP.
- A6: Elite affixes are doubled.
- A7: Rewards are -1 choice.
- A8: Bosses start with shield.
- A9: No rest nodes.
- A10: Final boss gets a unique new ability.
- A11–A20: cosmetic + "TRUE ASCENSION" title, for 1% players.

### 4.5 Login streaks
**[P1 · S]** Already has `Streak` service. Formalize:
- Day 1: +5 fragments.
- Day 3: +20 fragments.
- Day 7: +1 relic unlock.
- Day 14: +100 fragments.
- Day 30: cosmetic frame.
- Day 100: secret class skin.

**Grace:** 1 missed day allowed every 7 days. Configurable gap is common for retention.

### 4.6 Cosmetics (premium currency-free)
**[P1 · L]** All cosmetics are earned via achievement/milestone/daily:
- **Profile frames:** ~40.
- **Class skins:** 3 variants per class (stock / elite / mastered).
- **Dice faces:** 12 variants unlocked via achievements.
- **Particle palettes:** 8 attack-trail colors.
- **Sanctuary props:** unlocked via NPC quests.

No loot boxes. No randomized cosmetics. Direct unlocks only.

---

## Part 5 — Content expansion

### 5.1 Classes
#### 5.1.1 Refine existing 6
**[P0 · M]** Balance pass — each class needs a winning A10 build:
- **Tactician** — buff reroll + draw synergies.
- **Arcanist** — new mana-storage mechanic. Already has unique identity.
- **Bloodstalker** — death path (lose HP, gain power) needs clearer ramp.
- **Annihilator** — no-reroll identity is frustrating. Add QTE-extension compensation.
- **Sentinel** — currently strong but boring. Add a "counterattack" mechanic.
- **Summoner** — currently weak. Buff starting minion stats by 20%.

#### 5.1.2 Two new classes (post-launch)
**[P2 · XL]**
- **Nethermancer** — necromantic hacker; minions persist between combats (lose HP between, heal on boss kill); debuff-focused; weak vs shields.
- **Chronologist** — time-rewind class; once per combat, undo the last turn with a mana cost; unique class ability "LOOP" that bookmarks a turn state.

### 5.2 Enemies
#### 5.2.1 Regular enemies
**[P1 · M]** Add 3 new enemies per sector (18 total):

| Sector | New enemies                                                         |
|--------|---------------------------------------------------------------------|
| 1      | Riot Suppressor (AoE), Drone Swarmling (low HP, many), Mirror (copies player intent) |
| 2      | Cryo Cultivator (frost AoE), Data Mite (burrows, resurges), Echo (creates 2 weak clones) |
| 3      | Foundry Golem (high armor, slow), Slag Geyser (self-immolates), Coolant Tech (heals allies) |
| 4      | Hive Warden (shields allies), Phage Pod (explodes), Keeper (buffs elite HP) |
| 5      | Null Priest (erases player's shield), Entropy (random buff each turn), Silent Observer (does nothing turn 1, heavy attack turn 2) |

#### 5.2.2 Elite affixes
**[P1 · M]** Expand from 3 to 8 affixes:
- Shielded (existing)
- Second Wind (existing)
- Jammer (existing)
- **Reflector** — reflects 50% damage back.
- **Phase** — alternates targeting HP and shield each turn.
- **Multiplier** — first hit splits it into 2 (separate HP bars).
- **Anchor** — player minions can't die while Anchor is alive.
- **Vampiric** — heals from all damage it deals.

**AC:** Each affix has a unique icon, intro bark, and tooltip. Internal balance doc must justify why a player might fight it vs flee.

### 5.3 Bosses

#### 5.3.1 Multi-phase rework
**[P0 · L]** All 5 bosses get proper 2–3 phase fights:

**PANOPTICON** (Sector 1)
- Phase 1 (100–51% HP): AoE scan attack, summons surveillance drones.
- Phase 2 (50–21%): Eye "locks on" — single player takes 2x damage until they break line of sight by going behind a minion.
- Phase 3 (20–0%): Eye closes → blind phase → attacks are random targets, player attacks can miss 20%.

**NULL_POINTER** (Sector 2 — already partially designed)
- Phase 1: Pull of Void + Void Spawns.
- Phase 2: Void Crush countdown.
- Phase 3: Reality shatter — player's relics random-muted for 1 turn each.

**THE COMPILER** (Sector 3)
- Phase 1: Armor Plating — physical immunity until broken.
- Phase 2: Overclock — multi-hit attacks, very fast.
- Phase 3: Collapse — uses its own armor chunks as projectiles.

**HIVE PROTOCOL** (Sector 4)
- Phase 1: Drone Factory — constant minion spawning.
- Phase 2: Shared HP — boss HP is spread across self + 3 drones; must kill all 4.
- Phase 3: Assimilate — attempts to convert the player's minion to its side.

**TESSERACT PRIME** (Sector 5)
- Phase 1: 4D attacks — hits come from unpredictable directions.
- Phase 2: Reality split — arena shows 2 realities, attacks happen in both simultaneously.
- Phase 3: Collapse — all prior abilities cycle rapidly.

#### 5.3.2 Secret sector / boss
**[P2 · XL]** **Sector X: The Core** — unlocked when all lore decrypted AND sanctuary fully restored AND Tesseract Prime beaten 3 times.
- New boss: **THE ARCHIVIST** — plays the player's own past runs back as attacks.

#### 5.3.3 Boss rematch mode
**[P1 · L]** Ascension-gated (A5+): "GAUNTLET" mode. Face all 5 bosses back-to-back with escalating modifiers. 100-fragment cost to enter, win rewards a unique cosmetic set.

### 5.4 Relics / Modules
**[P1 · L]** Add 30+ new modules across rarity tiers:

**Commons (+12):** Basic stat upgrades targeting under-represented builds.
**Rares (+10):** Build enablers — "Shield Explosion", "Minion Swarm Core".
**Epics (+6):** Build definers — "Paradox Loop v2", "Reality Anchor".
**Legendaries (+4):** Run-changers — "Second Soul" (revive once), "Time Fracture" (one rewind per combat).
**Corrupted (+4):** High risk/reward.

**AC per new relic:**
- Fits at least 1 existing synergy OR creates a new one.
- Playtested to a 45–55% win rate impact (not a no-op, not a win-button).
- Unique icon, unique description that reads in 1 second.

### 5.5 Events
**[P1 · L]** Expand from 7 to 30+ events. New event types:

- **Branching** (2–3 decision trees, outcomes vary by class).
- **Class-specific** (one per class) — tied to their narrative arc.
- **Sector-specific** — tied to sector theme.
- **Chained** — resolution plants a follow-up event 2 nodes later.
- **Mini-combat** — event that triggers a small combat with unique rewards.

---

## Part 6 — Mobile UX / UI

> *Every interaction is a thumb pressing a 6" panel. Nothing else matters.*

### 6.1 Layout — safe zones
**[P0 · M]** Design with iOS/Android safe areas in mind:
- **Top reserve:** 44px (iOS notch + Android status bar).
- **Bottom reserve:** 34px (iOS home indicator + Android gesture area).
- **Landscape lock:** portrait only — already enforced via 9:16 aspect.

### 6.2 Thumb zones
**[P0 · M]** Rebuild HUD with thumb ergonomics:

| Region              | Content                                     |
|---------------------|---------------------------------------------|
| Top (seen area)     | HP, shield, sector, turn count              |
| Middle (view area)  | Combat arena, entities, dice                |
| Bottom (thumb zone) | Dice hand, reroll, end-turn, class ability  |

- **End turn** is on the thumb-dominant side (right for 90% of users; mirrorable in settings).
- **Reroll** is balanced on the opposite side.
- **Settings gear** is top-corner only (low-frequency).

### 6.3 Gestures
**[P0 · M]** Support gesture affordances without over-relying:

| Gesture              | Action                        | Fallback                      |
|----------------------|-------------------------------|-------------------------------|
| Tap die              | Select (lock)                 | (no-op)                       |
| Double-tap die       | Tooltip                       | Long-press                    |
| Drag die → target    | Use                           | Tap die → tap target          |
| Swipe hand left      | Rotate order (not mandatory)  | No fallback needed            |
| Pinch combat area    | Zoom for detail               | Disabled on low-end devices   |
| Back gesture         | Open menu overlay (not quit)  | Dedicated back button visible |

**AC:** Every gesture has a button fallback. No gesture-only actions.

### 6.4 Haptics
**[P1 · S]** Implementation:

- **iOS:** `UIImpactFeedbackGenerator` (light / medium / heavy).
- **Android:** `VibrationEffect.createPredefined` or `createOneShot`.
- **Web fallback:** `navigator.vibrate([30])` — best effort.

Map to events:
- Die select: light.
- Die drop: medium.
- Hit enemy: medium.
- Take damage: heavy.
- Boss phase change: heavy + rumble pattern.
- Critical: medium + double-pulse.

**Setting:** "Haptic feedback" on/off (already exists — verify wiring).

### 6.5 Performance tier detection
**[P0 · M]** Detect device tier at launch:
- **High tier:** Full particles, all shadow blurs.
- **Mid tier:** 50% particles, reduced shadow blurs.
- **Low tier:** 25% particles, no shadow blurs, simplified backdrops.

Detection heuristic: `navigator.deviceMemory`, `navigator.hardwareConcurrency`, initial frame time over 3 seconds.

Show a one-time "Performance mode: Balanced (change in Settings)" toast.

### 6.6 Animation budget
**[P0 · S]** Hard caps:
- Per-frame shadow-blur passes: ≤3.
- Per-frame `Math.random()` calls: ≤50.
- Active particles: ≤150 on high tier, ≤80 mid, ≤40 low.
- Background drones: ≤5.
- Dice-hand animations: staggered by 80ms per die.

### 6.7 Dark mode / always-dark
**[P1 · S]** The game is always neon on black. No light mode. Lock `prefers-color-scheme: dark` OS UI contrast in the manifest.

### 6.8 Text sizing
**[P0 · S]** All text must be legible at a 16px minimum on a 5.5" screen. Global text scale slider already exists (80%–200%). Audit:
- Die numerals: 14px min.
- HP text: 18px min.
- Intent number: 24px min.
- Body text: 16px min.
- Tooltips: 14px min.

### 6.9 Loading states
**[P0 · S]** Every transition >300ms needs a loading indicator:
- Spinner or pulsing logo.
- Never a blank screen.
- Timeout after 10s with retry option.

---

## Part 7 — Audio

### 7.1 Music
**[P0 · L]** Commission 12 original tracks:

| Track                        | Length | Mood                                  |
|------------------------------|--------|---------------------------------------|
| Main menu                    | 2:00   | Cyber synth, calm but charged         |
| Character select             | 1:30   | Light, identity-reinforcing           |
| Sanctuary                    | 3:00   | Ambient, nature-tech hybrid            |
| Sector 1 combat              | 2:30   | Urban synth                            |
| Sector 2 combat              | 2:30   | Cold/icy undertone                     |
| Sector 3 combat              | 2:30   | Industrial/furnace                     |
| Sector 4 combat              | 2:30   | Ethereal tech                           |
| Sector 5 combat              | 2:30   | Red-alert source                       |
| Boss theme 1 (Panopticon)    | 1:30 loop | Surveillance creep                  |
| Boss theme 2 (Null)          | 1:30 loop | Void dread                          |
| Boss theme 3 (Compiler)      | 1:30 loop | Mechanical march                    |
| Boss theme 4 (Hive)          | 1:30 loop | Swarming tension                    |
| Boss theme 5 (Tesseract)     | 1:30 loop | Reality crack                       |
| Victory flourish             | 0:10   | Major key synth                        |
| Defeat flourish              | 0:05   | Descending minor                       |

Each combat theme has a **low-intensity** and **high-intensity** layer that cross-fades when enemy HP drops below 30%.

### 7.2 SFX categories
**[P0 · L]** Must-have SFX (~80 clips):
- UI: button tap, button hover, menu open/close, error, toast. (~15 clips)
- Combat: every dice type use (8), damage tiers (5), shield hit/break (2), heal (1), buff/debuff (6). (~22 clips)
- Entities: 6 classes × attack + die + summon = 18. Add 5 boss-specific = 23.
- QTE: ring-tick, perfect, good, miss, crit. (~10 clips)
- Meta: sanctuary ambient (3), upgrade buy (1), achievement unlock (1), daily seed chime (1). (~6 clips)

### 7.3 Sound design principles
- **Diegetic > non-diegetic** where possible. A die "rolling" sounds like dice, not a magic chime.
- **Pitch-varied** — every sound plays at ±15% pitch to avoid audio fatigue.
- **Duck music under combat SFX** — music drops -6dB when SFX plays.
- **No silence** — every non-trivial action has audio feedback.

### 7.4 Audio engine
**[P0 · M]** Already uses Web Audio. Extend:
- Audio sprite atlas for mobile (fewer HTTP requests).
- Lazy-load per-sector music (don't preload all 12 tracks).
- Fade in/out on track change (1-second crossfade).
- Bus structure: Master → Music / SFX / UI / Voice, each individually volume-controllable.

### 7.5 Voiceover (stretch)
**[P2 · M]** Minimal VO:
- Boss intro line (1 per boss, 5 total).
- Class selection barks (1–3 per class, 6–18 total).
- Death stingers (1 per class, 6 total).

Skip VO if budget is tight. Non-negotiable: subtitles on all VO.

---

## Part 8 — Social & virality

### 8.1 Leaderboards
**[P1 · L]** Global leaderboards for:
- Daily run (top 100).
- Weekly challenge (top 500).
- Speedrun categories (fastest Sector 1 clear, fastest full run).
- Ascension score (custom formula).

Backend: Firebase Firestore or custom Node + Postgres. See §10.4 for infrastructure.

### 8.2 Replays (stretch)
**[P2 · XL]** Record every run as an event stream. Allow daily winners to be replayed by others (deterministic via seeded RNG).

### 8.3 Sharing
**[P1 · M]** On run end, generate a **shareable summary card**:
- 3:4 ratio image (fits Instagram story).
- Shows class + final boss defeated + key stats + branded watermark.
- Native share sheet (iOS: `navigator.share`, Android: same via PWA).

### 8.4 Friends (stretch)
**[P2 · L]** Minimal social layer:
- Add friends by unique code (no accounts beyond code+display-name).
- Compare achievement progress.
- No messaging — invites scope creep and moderation.

### 8.5 Discord integration
**[P1 · S]** Rich Presence (desktop builds). Announce milestones to a community Discord.

---

## Part 9 — Monetization

> *This is the biggest strategic decision. Pick one path before launch.*

### 9.1 Business model options

#### Option A — Premium, one-time purchase (recommended)
- $4.99 one-time.
- No ads, no IAP, no cosmetic shop.
- All content in launch version.
- Post-launch: paid DLC packs at $1.99 for major content (new class, new sector).

**Pros:** Simplest. Respects player. Strongest retention. Aligns with pillars.
**Cons:** Requires trust via demo / trial. Lower revenue ceiling than F2P.

#### Option B — Free-to-start, unlock full game
- Free through Sector 2. $4.99 unlock for full game.
- No ads in free version beyond a single optional rewarded ad for a minor in-run boost.

**Pros:** Discovery benefit + fair gate.
**Cons:** Requires careful balancing of the demo wall.

#### Option C — Free-to-play with cosmetic shop
- All content free.
- Cosmetic-only IAP (frames, skins, particle palettes).
- No loot boxes. No pay-to-win.

**Pros:** Broadest reach.
**Cons:** Contradicts pillar #4 (class identity) if skins are the main monetization. Also risk: if cosmetics are the goal, design focus drifts from gameplay. Avoid.

**Strong recommendation: Option A.** Aligns with all five pillars. Option B is acceptable if App Store conversion concerns demand it.

### 9.2 No dark patterns
Regardless of model:
- No timers / energy gates.
- No "last-chance" popups.
- No scarcity framing on cosmetics.
- No false FOMO.
- No notifications demanding return within 24h.

### 9.3 IAP implementation (only if Option B/C)
**[P1 · M]**
- Native wrapper (Cordova/Capacitor plugin, or react-native-iap equivalent).
- Server-side receipt validation (prevents piracy).
- Restore purchases button on all purchase flows.
- Sandbox testing for both platforms.

### 9.4 Pricing
| Region tier | Base price | Local price example |
|-------------|-----------|---------------------|
| Tier 1 (US, UK, CA, AU) | $4.99 | $4.99 |
| Tier 2 (most EU, JP) | $4.99 | €4.99 / ¥600 |
| Tier 3 (BR, MX, IN, TR) | $2.49 | R$14.90 / ₹99 |

---

## Part 10 — Platform specifics

### 10.1 Codebase strategy
**[P0 · M]** Single PWA codebase wrapped for native distribution:
- **Web build** — PWA, served from custom domain.
- **iOS:** Capacitor wrapper. Submit to App Store.
- **Android:** Capacitor wrapper. Submit to Play Store.
- **Alternative:** Cordova if Capacitor is unfamiliar. Recommendation: Capacitor (modern, active, TypeScript-friendly).

### 10.2 iOS specifics
**[P0 · M]**
- Apple Developer Program: $99/year.
- TestFlight for beta.
- **Splash screens:** Required for 6 device sizes (iPhone Mini through iPad Pro).
- **App icons:** Required in 20+ sizes (generate from single 1024×1024 source).
- **Safe area insets:** Handle iPhone notch via `env(safe-area-inset-top)` in CSS.
- **Haptics:** `UIImpactFeedback` via Capacitor plugin.
- **Review process:** typical 1–3 days. Fails common for: crashes, broken IAP, privacy label mismatch, content rating, metadata.
- **Mandatory privacy labels** (Data Collected section): declare telemetry, crash analytics, cloud save.

### 10.3 Android specifics
**[P0 · M]**
- Google Play Developer account: $25 one-time.
- Internal testing track → Closed testing → Open testing → Production.
- **App icons:** Adaptive icons required (foreground/background layers).
- **Splash screen:** Use Android 12 SplashScreen API where available.
- **Back button:** Must navigate back within the app (don't quit on every press).
- **Play Store review:** typically <24h, but first submission is slower (2–7 days).
- **Play Protect:** may flag game if obfuscated. Submit for safety verification.

### 10.4 Backend / cloud
**[P1 · L]** Minimum viable backend:
- **Save sync:** user auth (anonymous UUID is fine), JSON blob upload/download on login/logout.
- **Leaderboards:** Firestore / Supabase / Cloudflare Workers KV.
- **Analytics:** Firebase Analytics or PostHog.
- **Crash reporting:** Sentry.
- **Feature flags:** LaunchDarkly free tier or custom ENV var service.

**Cost estimate:** <$20/month until you cross ~50k DAU.

### 10.5 App Store Optimization (ASO)
**[P0 · M]** Critical before launch:
- **App name:** "Magic v Machine: Roguelite Dice" (use keywords, under 30 chars).
- **Subtitle:** "Cyber deck-builder meets dice" (iOS).
- **Short description (Android):** 80 chars — hook + key differentiator.
- **Long description:** Feature bullets first, then narrative. Include keywords: roguelite, deck builder, dice, roguelike, card game, turn-based, strategy, pixel art / cyberpunk.
- **Screenshots:** 5–8 per platform. First 3 are critical. Include overlay text explaining the action.
- **Preview video:** 15–30 seconds. Show core loop. No voiceover.
- **Keywords (iOS):** 100 chars total. Research via AppTweak/Sensor Tower.
- **Category:** Games → Strategy (primary), Role-Playing (secondary).

### 10.6 Content ratings
**[P0 · S]**
- **iOS:** Age 9+ (fantasy violence).
- **Google Play:** ESRB Everyone 10+, PEGI 7.
- Must match actual content: no blood in cutscenes, no profanity.

---

## Part 11 — Performance optimization

### 11.1 Frame-rate target
**[P0 · L]** 60fps on:
- iPhone 11 (2019) and newer.
- Pixel 4a (2020) and newer.
- Galaxy S10 and newer.

Lower targets (30fps acceptable) on devices 4+ years old. Detect at launch and auto-switch.

### 11.2 Canvas optimization
**[P0 · M]** Proven wins:
- **Offscreen canvas for backdrops:** render each sector/boss backdrop to an OffscreenCanvas once, reuse.
- **Dirty-rect rendering:** only repaint regions that changed (harder, lower priority).
- **Pre-rendered entity sprites:** at combat start, render each entity's static parts to a sprite, only animate overlays.
- **Object pooling:** particles, dice, text labels — all pooled.
- **Image atlas:** combine icons into a single 2048×2048 texture.

### 11.3 Memory budget
**[P0 · M]** Target <200MB RAM on mobile:
- Audio decoded only for active sector.
- Canvas backbuffers <50MB.
- Particle array capped.
- Clear bgState on menu return.

### 11.4 Battery
**[P1 · M]** Mobile-specific concerns:
- Cap to 60fps (don't render at 120Hz on ProMotion displays during combat — save battery).
- Lower to 30fps when backgrounded briefly (pause behavior).
- Full pause when visibility changes to `hidden`.

### 11.5 Startup time
**[P0 · M]** Cold launch → main menu: <3 seconds.
- Lazy-load non-critical assets.
- Defer audio decoding until after first render.
- Minimize bundle size (target <2MB gzipped JS).
- Tree-shake unused icons / lore.

### 11.6 Network
**[P1 · S]** Fully offline-capable after first launch:
- Service worker caches all assets.
- Leaderboards + cloud save require network; degrade gracefully.
- Show "offline" indicator when network is lost.

---

## Part 12 — Analytics & live ops

### 12.1 Events to track
**[P0 · M]** Minimum event schema:

| Event name                  | Properties                                    | Purpose                               |
|-----------------------------|-----------------------------------------------|---------------------------------------|
| `session_start`             | platform, version, locale                     | DAU tracking                           |
| `session_end`               | duration_sec                                  | Session length                         |
| `onboarding_stage_complete` | stage, seconds                                | Funnel                                 |
| `run_start`                 | class, ascension, seed, daily?                | Run initiation                         |
| `run_end`                   | won, sector_reached, turns, fragments_earned  | Run completion                         |
| `combat_start`              | enemy_name, sector                            | Combat pacing                          |
| `combat_end`                | won, turns, damage_taken, damage_dealt        | Combat balance                         |
| `death`                     | enemy_name, build_hash                        | Death diagnostics                      |
| `relic_picked`              | relic_id, choice_index                        | Relic popularity                       |
| `relic_skipped`             | relic_id                                      | Relic skip rate (bad relics)           |
| `shop_purchase`             | item_id, price                                | Economy                                |
| `achievement_unlocked`      | achievement_id                                | Achievement flow                       |
| `setting_changed`           | key, value                                    | UX insights                            |
| `error_client`              | error_message, stack_hash                     | Crash reporting                        |

### 12.2 Dashboards
**[P1 · M]** Essential dashboards:
- **Retention:** D1, D7, D30 cohorts.
- **Funnel:** Install → tutorial complete → first run → first win → first ascension.
- **Win rate by class/ascension:** heatmap.
- **Relic tier list:** pick rate vs win rate.
- **Crash volume:** trend line by version.
- **Session length histogram:** to validate target session lengths.

### 12.3 Live ops
**[P1 · M]** Post-launch operational cadence:
- **Weekly:** balance patch (tweaks only, no new content).
- **Monthly:** content patch (new relics, events, balance).
- **Quarterly:** major update (new class, new sector, new boss).
- **Seasonal:** themed event every 3 months.

### 12.4 A/B testing framework
**[P2 · L]** For balance tuning:
- Flag-gated experiments on specific card effects or drop rates.
- Control vs variant. Minimum sample size 500 completed runs per arm.
- Never experiment on monetization — trust is primary.

---

## Part 13 — Accessibility

### 13.1 Visual
**[P1 · M]** Currently has colorblind modes; extend:
- **Contrast checker:** all critical info (HP, shield, intents) must have 4.5:1 contrast minimum.
- **Never color-alone signaling:** buffs/debuffs also have icons and text.
- **Large text mode:** +25% font scale preset.
- **Reduced glow:** setting to disable shadow-blurs entirely (also a perf win).

### 13.2 Motor
**[P1 · M]**
- **Tap-only mode:** disables all drag gestures; replace with tap-source-then-tap-target.
- **QTE auto-succeed at 80% efficiency** (see §2.4.3).
- **Larger touch targets** toggle (+30% size).

### 13.3 Cognitive
**[P1 · S]**
- **Tutorial replay:** any tutorial can be replayed from settings.
- **Pause mid-combat:** full pause with no penalty.
- **Extended timers:** all QTE timers can be +50% extended.
- **Minimal animations toggle:** all optional flair disabled.

### 13.4 Auditory
**[P1 · S]**
- **Subtitles:** all VO has subtitles (non-negotiable).
- **Visual equivalents:** critical audio cues (boss attack wind-up, crit timing) also shown visually.

### 13.5 Screen reader
**[P2 · M]**
- **ARIA labels** on all interactive elements.
- **Live region** announces turn transitions, damage, deaths.
- Test with VoiceOver (iOS) and TalkBack (Android).

### 13.6 Formal certification (stretch)
**[P2 · L]** Apply for Apple "Accessibility Nutrition Label" best-practice badge. Consider submitting to game-focused accessibility review boards.

---

## Part 14 — Testing & QA

### 14.1 Automated tests
**[P0 · L]** Build out a test suite:
- **Unit tests** (Jest / Vitest): core math — damage, shields, status effects, reroll logic. Target 70% coverage of `src/` non-rendering code.
- **Integration tests:** combat simulation — play 100 random seeds, assert no crashes.
- **Snapshot tests:** critical UI states don't regress.

### 14.2 Playthrough harness
**[P1 · M]** Headless script that auto-plays:
- 10 runs per class.
- Each run plays to completion (win or death).
- Captures analytics events.
- Fails CI if any run crashes.

### 14.3 Device matrix
**[P0 · M]** Manual test on representative devices per release:
- **iOS:** iPhone 11, iPhone 13, iPhone 15 Pro (current -4, -2, current).
- **Android:** Pixel 4a, Pixel 7, Samsung Galaxy S21.
- **Tablets:** iPad (9th gen), iPad Pro.

### 14.4 Beta program
**[P0 · M]**
- **TestFlight** (iOS): invite 100 external testers via email.
- **Closed Testing** (Android): Play Console track, 100 testers.
- **Discord feedback channel:** triaged weekly.
- **2-week beta cycle** before each major content drop.

### 14.5 Bug reporting in-app
**[P1 · S]** Shake-to-report on Android, triple-tap on iOS:
- Opens an overlay with a screenshot, last 30s of events, player description.
- Submits to Sentry with game state blob attached.

### 14.6 Regression prevention
**[P1 · M]** Every bug fix gets a test. No exceptions. Goal: never ship the same bug twice.

---

## Part 15 — Legal, compliance, store operations

### 15.1 Required documents
**[P0 · S]**
- **Privacy Policy** — even without tracking, stores require one. Include what's collected, where it's stored, how to delete.
- **Terms of Service** — standard boilerplate from iubenda / terms-feed.
- **Cookie policy** — only if web version has analytics.
- **Credits / Attributions** — fonts, music, libraries.

### 15.2 GDPR / CCPA
**[P0 · M]**
- **Consent prompt** for analytics on first launch (EU-origin users).
- **Data deletion request** path — user can email and data is wiped within 30 days.
- **Data portability** — user can export their save + achievements as JSON.

### 15.3 Children / COPPA
**[P0 · S]** Not targeted at under-13. Declare this in stores. Block account creation below 13.

### 15.4 Copyright / trademarks
**[P0 · S]**
- Register "Magic v Machine" wordmark in target jurisdictions (US, EU at minimum).
- Ensure no conflict with existing titles (check USPTO / EUIPO).
- License all music + SFX properly. No unlicensed royalty-free.
- Open-source license audit (MIT OK; GPL carefully evaluated).

### 15.5 Store metadata
**[P0 · M]** Submit with versioned localization:
- **English (US)** — base.
- **English (UK)** — minor tweaks.
- **Spanish (LatAm)** — priority market 2.
- **French, German, Japanese, Korean, Simplified Chinese** — priority market 3.
- **Portuguese (Brazil)** — priority market 4.

In-game localization is a separate larger effort — see §16.3.

---

## Part 16 — Narrative, branding, polish

### 16.1 Narrative
**[P1 · M]** Current lore is already good. Expand:
- **World bible** (internal doc) — factions, timeline, character backstories.
- **Intel entries:** from 33 to 80+ entries unlocked through decryption.
- **Boss intro cinematics** — 5-second intros using canvas text + SFX, no animation required.
- **Multiple endings** — 3 variations based on run style (pure / corrupted / speed).

### 16.2 Branding
**[P0 · M]**
- **Final logo lockup** — commission one clean hero logo + wordmark.
- **Color palette document** — codify neon-blue / pink / green / gold / purple hex codes + usage rules.
- **Typography specimen sheet** — Orbitron (heading) + Rajdhani (body) size/weight scale.
- **Icon library consolidation** — audit all SVGs, unify stroke weights and visual style.

### 16.3 Localization
**[P2 · L]** Post-launch:
- **8 languages** (listed in §15.5).
- Use a managed tool: Lokalise / Crowdin.
- All user-facing strings in a JSON dictionary, not hardcoded.
- Outsource translations to native speakers, QA via in-country testers.

### 16.4 Art direction
**[P0 · M]** Style guide document:
- Characters: silhouette-readable, 1 accent color per class.
- Environments: layered silhouette — foreground silhouette, midground structure, background atmosphere.
- UI: glass-morphism panels with neon borders, 4px corner rounding, subtle inner shadows.
- Particles: 3-color max per effect; pick one primary, one accent, one spark.

### 16.5 Marketing assets
**[P0 · L]**
- **Key art:** 1 hero illustration for store thumbnails + press kit.
- **Trailer (60s):** opens with gameplay, introduces 2 classes, shows 1 boss, ends on title + "launching [date]".
- **Gifs:** 10 looping gifs for social (combat moment, dice roll, boss reveal, win flourish, class sigil reveal, ascension toast, meta upgrade visible change, daily seed roll, defeat screen, sanctuary).
- **Screenshots:** 10 high-res (1290×2796 for iOS 6.7" — the required size). Add text overlays on first 3.
- **Press kit:** zip containing all above + logo variants + fact sheet + dev bio.

---

## Part 17 — Launch plan

### 17.1 Soft launch
**[P0 · L]** 3 months before global launch:
- **Soft launch market:** Philippines (English-speaking, smaller audience, similar engagement patterns to West).
- **Goal:** measure D1/D7 retention, crash rate, in-app purchase conversion.
- **Kill/iterate criteria:** <35% D1 retention → iterate; <25% → redesign.

### 17.2 Pre-launch marketing
**[P0 · L]** 12 weeks out:
- Landing page with email signup.
- Twitter/X + Bluesky + TikTok account (daily GIFs / devlog).
- Reddit launch on r/roguelites + r/iosgaming + r/AndroidGaming.
- IndieGameDev Discord community engagement.
- Influencer outreach 4 weeks before launch (provide review copies).

### 17.3 Launch week
**[P0 · M]**
- **Day -1:** Final binary uploaded, review submissions done.
- **Launch day:** coordinated posts, press kit goes live, Discord buzz.
- **Day +1 to +7:** daily metrics check. Quick patch for any showstoppers.

### 17.4 Post-launch comms
**[P1 · M]**
- Weekly devblog.
- Monthly patch notes with a hero GIF.
- Respond to every store review during first month.

### 17.5 Review responses
**[P0 · S]** Standard playbook:
- 5-star: thanks + hint at upcoming feature.
- 3-4 star: thanks + ask what we can improve.
- 1-2 star (bug): apology + fix ETA.
- 1-2 star (design): neutral, acknowledge preference difference.

---

## Part 18 — Post-launch roadmap (first year)

### 18.1 First 30 days — stabilize
- Crash-fix patches as needed (target <0.5% session crash rate).
- Balance patch at day 14 (based on telemetry).
- First content micro-patch at day 21 (2 new events, 3 new relics).

### 18.2 Months 2–3 — first major update
- **Version 1.1: "The Gatekeeper"**
- Nethermancer class release.
- 15 new relics.
- New elite affix: Vampiric.
- 10 new events.

### 18.3 Months 4–6 — first seasonal event
- **Version 1.2: "Void Season"**
- Month-long seasonal with themed modifiers.
- Chronologist class release.
- Sector 0 (tutorial arcade) released.
- Replay system released.

### 18.4 Months 7–9 — depth update
- **Version 1.3: "The Gauntlet"**
- Boss rematch mode released.
- Ascension expanded to 20 levels.
- 15 new achievements.
- Sanctuary NPCs (Smith + Oracle) unlocked.

### 18.5 Months 10–12 — endgame
- **Version 1.4: "The Core"**
- Sector X + THE ARCHIVIST boss.
- 4 new legendary relics.
- Cosmetic mega-pack (20 new items via achievements).
- 1-year anniversary cosmetic bundle.

---

## Part 19 — Known risks & mitigations

| Risk                                          | Likelihood | Impact | Mitigation                                                                 |
|-----------------------------------------------|-----------|--------|----------------------------------------------------------------------------|
| Mobile perf drops on old devices              | High      | High   | Device tier detection (§6.5) + aggressive perf budget (§11).              |
| Player churn in onboarding                    | High      | High   | Rigid onboarding flow (§1.1) with constant analytics validation.          |
| Apple rejection for perf issues               | Medium    | High   | TestFlight for 2 weeks pre-submit. Internal review checklist.             |
| Play Protect flagging                         | Medium    | Medium | Submit for safety review. Use non-obfuscated release.                     |
| Negative "pay-to-win" reviews                 | Low       | High   | NONE of the monetization options introduce pay-to-win (§9.2).             |
| Feature creep delays launch                   | Medium    | High   | Hard-lock scope 8 weeks before launch. Everything post-lock = v1.1.       |
| Single-dev burnout                            | High      | Critical | Ruthless scope prioritization. Ship Part 0–4 as MVP, defer the rest.    |
| Content fatigue at launch (only 5 sectors)    | Medium    | Medium | 30+ relics + 30+ events + daily runs provide replay. Track churn.         |
| Review cycle delays                           | Medium    | Medium | Submit to Apple 10 days before intended launch. Google Play 3 days.       |
| Localization costs                            | Low       | Low    | Launch in English only, localize in v1.2+ based on demand signals.        |

---

## Part 20 — MVP cut (if only 3 months remain)

If you have 3 months left and need to ship *anything* production-worthy, here's the ruthless cut:

### Must ship (ship-blockers)
- Part 1: Onboarding §1.1 + §1.2 (tutorial rewrite + contextual tooltips).
- Part 2: Core loop § 2.1.1 (ship dice mechanics), § 2.2 (combat feedback), § 2.6 (intent clarity).
- Part 3: § 3.1, § 3.2 (difficulty targets, rough tuning).
- Part 4: § 4.1 (sanctuary basic deepening), § 4.2 (30 achievements, not 80).
- Part 5: § 5.3.1 (boss phases — critical for depth signal).
- Part 6: § 6.1–6.4, § 6.5 (mobile UX baseline + perf tier detection).
- Part 7: § 7.1 (music — commission 5 tracks minimum), § 7.2 (~40 SFX, not 80).
- Part 9: choose monetization (Option A recommended).
- Part 10: § 10.1–10.3 (platform wrappers), § 10.5 (ASO minimum).
- Part 11: § 11.1–11.5 (perf fundamentals).
- Part 12: § 12.1 (analytics).
- Part 13: baseline accessibility audit.
- Part 14: § 14.1 (unit tests), § 14.3 (device matrix testing), § 14.4 (beta program).
- Part 15: § 15.1 (legal docs), § 15.2 (GDPR).
- Part 16: § 16.2 (branding), § 16.5 (marketing assets).
- Part 17: § 17.1 (soft launch), § 17.2 (pre-launch marketing).

### Defer to v1.1
- New classes (Nethermancer, Chronologist).
- Secret sector.
- Gauntlet mode.
- Seasonal events.
- Localization.
- Leaderboards (can launch without, add in 1.1).
- Replays.

---

## Part 21 — Immediate next actions (ranked)

If I could pick 5 things to implement this week, in priority order:

1. **Ship the dice mechanics already planned** (once-per-hand, pity, base floor — already partially coded).
2. **Build the onboarding rewrite (§1.1)** — single biggest retention lever.
3. **Set up analytics (§12.1)** — you can't balance what you can't measure.
4. **Audio pass minimum** (§7.2 — at least button tap, dice use, hit, shield break, music on menu + combat).
5. **Combat log panel (§2.2.4)** — transparency builds theorycraft community.

---

## Part 22 — Decisions locked

| # | Decision | Choice |
|---|----------|--------|
| 1 | Monetization | **Premium one-time $4.99**. No ads, no IAP. Post-launch paid DLC packs allowed for major content (new class / sector). |
| 2 | Onboarding | **Full 5-stage scripted rewrite** (splash → name entry → combat tutorial → rigged first combat → Sector 1). |
| 3 | Launch platform | **Web PWA first**. Zero app-store friction, monthly-push-friendly. Capacitor wrappers follow once retention metrics prove out. |
| 4 | Backend | **Local-first saves, zero backend at launch**. SaveSync abstraction leaves a one-day hook to swap in Firebase / Supabase later if demand appears. |
| 5 | Secret sector (Sector X) | **Ship in v1.4** (~3 months post-launch) to protect replay value. |
| 6 | Test framework | **Vitest**. Already scaffolded with 4 test files. |
| 7 | Accessibility cert | **Skip for launch**, revisit post-launch based on feedback. |
| 8 | Localization | **English-only launch**. Add languages based on install demand signals. |
| 9 | Soft launch market | **Pending** — user to confirm. |

## Part 22a — Still open

- Launch date target.
- Team size / roles (solo vs contractors for art/audio).
- Art / audio budget ceiling.
- Soft launch market (decision #9 above).

---

## Appendix A — Comparable successful launches

| Game                  | Platform    | Model     | D7 retention | Wins                              |
|-----------------------|-------------|-----------|--------------|-----------------------------------|
| Dicey Dungeons        | iOS/Android | Premium   | ~35%         | Clear identity, tight onboarding  |
| Slay the Spire        | Mobile      | Premium   | ~40%         | Best-in-class genre               |
| Balatro               | Mobile      | Premium   | ~45%         | Novel hook, shareable moments     |
| Luck Be a Landlord    | Mobile      | Premium   | ~30%         | Thumb-friendly UI                 |
| Downwell              | Mobile      | Premium   | ~25%         | Replay via simplicity             |
| Dead Cells (Mobile)   | Mobile      | Premium   | ~30%         | Port quality, controller support  |

Benchmarks: D1 >55%, D7 >25%, D30 >10% are healthy for premium roguelites. Our own targets should aim at the higher end of these.

---

## Appendix B — Estimated effort

If everything in Parts 0–18 is implemented:

| Part                       | Estimate         |
|----------------------------|------------------|
| Part 0: Positioning        | 1 week           |
| Part 1: Onboarding         | 3 weeks          |
| Part 2: Core loop          | 4 weeks          |
| Part 3: Difficulty         | 2 weeks          |
| Part 4: Meta progression   | 4 weeks          |
| Part 5: Content            | 8 weeks          |
| Part 6: Mobile UX          | 3 weeks          |
| Part 7: Audio              | 4 weeks (parallel with dev) |
| Part 8: Social             | 3 weeks          |
| Part 9: Monetization       | 1 week           |
| Part 10: Platform          | 4 weeks          |
| Part 11: Perf              | 2 weeks          |
| Part 12: Analytics         | 1 week           |
| Part 13: Accessibility     | 2 weeks          |
| Part 14: Testing           | 3 weeks          |
| Part 15: Legal             | 1 week           |
| Part 16: Narrative & brand | 3 weeks          |
| Part 17: Launch            | 2 weeks          |
| Part 18: First 3 months    | 12 weeks ongoing |

**Total:** ~14 weeks of focused pre-launch work (with 1 dev + part-time art/audio), plus the 12-week post-launch content cadence.

---

## Appendix C — Document usage

Treat this as a living document:
- Duplicate each part into a ticket system (GitHub Issues, Linear, Trello).
- When a part is fully shipped, mark it DONE in this doc.
- When scope changes, update this doc first, tickets second.
- Every 4 weeks, re-prioritize based on telemetry and player feedback.

**Document maintained by:** [name]
**Last reviewed:** [date]
**Next review:** weekly until launch, monthly post-launch.
