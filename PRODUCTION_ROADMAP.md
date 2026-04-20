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

---

# Part 23 — Sector & enemy redesign (v2)

> *Parts 0–18 assumed five sectors with reasonable-but-generic enemies. Post-launch player feedback on the alpha flagged the enemies as "samey" and the sector maps as "a line of nodes". Part 23 rebuilds both from the visual language up.*

## 23.1 Sector identity framework

Every sector is built from **five pillars** that together deliver a cohesive 20-minute experience:

1. **Visual language** — palette, skyline silhouette, parallax layers, particle ambient
2. **Audio signature** — ambient drone, boss sting, enemy-phase motif
3. **Mechanical twist** — one combat rule unique to the sector
4. **Enemy family** — 3 standard + 2 elite + 1 boss, sharing a silhouette DNA
5. **Map topology** — shape of the node graph, density, and special-node distribution

| Sector | Theme             | Palette         | Mechanical twist                               | Skyline DNA           |
|--------|-------------------|-----------------|------------------------------------------------|-----------------------|
| 1      | Downtown Glass    | Purple / cyan   | Baseline — onboarding safe zone                | Low office towers     |
| 2      | Cryo Docks        | Ice blue / teal | Frost meter — stacking Frost slows rerolls    | Frozen shipyard cranes|
| 3      | Foundry Ravine    | Orange / red    | Heat tiles — standing still drains Mana        | Lava-lit smelters     |
| 4      | Hive Vectors      | Lime / magenta  | Swarm bar — kills on enemies you left alive heal the Hive | Drone pylons |
| 5      | The Source        | Deep violet / hot pink | Reality glitch — every 3 turns a die inverts its slot | Impossible geometry |
| X      | The Archive       | Monochrome + gold | No relics, hand shuffled, 5-boss gauntlet    | Negative-space vault  |

**Each sector ships with:**
- 3 standard enemies (each with 2 visual variants, colour-swapped for late-sector)
- 2 elite enemies with unique silhouettes + affix pool
- 1 boss with a 3-phase fight
- 2 event-node variants
- 1 shop-node visual variant
- 1 rest-node visual variant
- 1 map background tile (procedurally dressed with the sector's parallax)

### 23.1.1 Silhouette DNA rule
Every enemy in a sector shares a 20% silhouette trait so the player learns to read the sector visually. Examples:
- **Sector 1:** surveillance-camera lenses — every enemy has a single glowing eye.
- **Sector 2:** ice shards jutting from chassis — every enemy has crystalline spikes.
- **Sector 3:** exposed molten cores — every enemy has a red-hot weak spot.
- **Sector 4:** insectoid segmented bodies — every enemy has 3+ body segments.
- **Sector 5:** hovering above the ground — every enemy has no legs / floats.

## 23.2 Sector 1 — Downtown Glass (remaster)

**Fantasy:** Surveillance state. The player is a glitch in the CCTV feed. Enemies are corporate guard drones.

### Standard enemies
- **Watcher-01** — a rotating camera-pod. Attacks with a focused beam. Twist: marks the player; next hit on a marked player deals +3 DMG.
- **Paper Pusher** — a bureaucrat-drone dragging a filing stack. Low damage but every turn summons a Filing Cabinet (1HP decoy).
- **Signal Jammer** — short, squat, four antennas. Has a chance to seal a random die each turn (unsealable by the usual method).

### Elites
- **The Auditor** — A tower of floating holographic clipboards. Has *Anchor* and *Reflector*. When hit, a clipboard floats off and stabs the player next turn.
- **Blackout** — A camera pod that flickers. Has *Phase* and *Shielded*. When Phase flips to shield, the player's dice also lose their icons for one turn.

### Boss — THE PANOPTICON (v2)
- **Phase 1:** Sweeps 4-slice arcs. Marks a die "observed" — that die is revealed to the boss; any crit against it reflects.
- **Phase 2:** Splits into three eye-drones. Each drone has 30% of the boss's HP. Kills propagate damage back to the "main" eye.
- **Phase 3:** Eye-lock protocol. While any enemy minion is alive, the player takes 2x damage from the boss. (Already implemented — keep, polish visuals.)

## 23.3 Sector 2 — Cryo Docks (new)

**Fantasy:** A frozen shipyard running automated cargo drones. The player is an intruder stealing heat.

**Mechanical twist — Frost meter:**
A new HUD widget tracks 0–10 Frost. Frost ticks up on certain enemy actions. At 5 Frost, one reroll per turn is "frozen" (cannot reroll that die). At 10 Frost, the player skips a turn. Frost decays 1/turn. Relics exist that redirect frost to shield conversion.

### Standard enemies
- **Cargo Hauler** — Bulky crate-walker. Attacks with a crate slam (heavy, slow). On kill drops a "Cold Crate" that gives Frost +2 if left alive 2 turns.
- **Icicle Sniper** — Thin, long-barrelled. Attacks at range, applies +1 Frost per hit.
- **Freezer Drone** — Small floating. Every 2 turns emits a pulse: +1 Frost, applies Slow (player's next attack die deals -2).

### Elites
- **The Icebreaker** — Mini-boss-sized. Breaks through the player's shield entirely on one hit every 3 turns. Affix pool: *Vampiric*, *Phase*.
- **Frost Maiden** — Narrow humanoid silhouette. Every turn applies +2 Frost. Dies revive once with 30% HP (hard-coded, not an affix).

### Boss — NULL_POINTER (v2)
- **Phase 1:** Pulls 2 player dice into a "Void Pocket" — they vanish for 2 turns. Player starts each turn with +1 Frost while pocket active.
- **Phase 2:** Consume protocol — if the player has a minion, the boss devours it for 30% heal; if not, boss takes 5 self-damage and the player gets +2 Frost.
- **Phase 3:** Dimensional collapse — player's Frost meter locks at 10 for 1 turn. Player must survive one massive hit. Boss is vulnerable during this turn (+50% incoming damage).

### Map topology — Cryo Docks
- **Layout:** icy-river node graph. Nodes are platforms on a frozen canal. Some paths are "iced over" (visible but walkable only after a specific event).
- **Special nodes:**
  - **Heat Vent** (1 per map) — rest node variant. Also removes 5 Frost on use.
  - **Sunken Cache** — shop variant. Prices +20% but inventory includes Cryo-themed relics.
  - **Ghost Ship event** — free relic, but applies +3 starting Frost to the next combat.

## 23.4 Sector 3 — Foundry Ravine (new)

**Fantasy:** An active smelter. Everything is oversized, glowing, molten. The player is a bug in the assembly line.

**Mechanical twist — Heat tiles:**
The combat arena shows a grid of 3 tiles at the player's position. One tile is "Hot" each turn. Playing a die on a Hot tile (visualized under the drag ghost) deals +3 DMG but costs 1 HP. Heat rotates each turn.

### Standard enemies
- **Forge Welder** — Humanoid with plasma welder arm. Every 2 turns adds +1 Hot tile (max 2). High HP, medium DMG.
- **Slag Mech** — Hunched, molten-core body. AoE attack hits player + all player minions for 50% damage.
- **Ember Swarm** — 3 small bugs that act as one enemy. Each turn they spawn 1 Ember Bug (3HP, 1DMG) that burns on death for 3 AoE.

### Elites
- **The Compiler (lesser)** — Smaller version of the boss. Armored, halves damage. 3-turn wind-up "OVERHEAT" that deals 25 AoE unless interrupted by a shield-slot die drop on it.
- **Cinderlord** — Burning humanoid. Leaves a Hot tile everywhere it attacks from. Dies after 3 turns if no heat tiles are converted.

### Boss — THE COMPILER (v2)
- **Phase 1:** Armored — halves player damage. Player must use a Defend die on the boss (shield as offence) to strip armour.
- **Phase 2:** Molten overclock — attacks twice per turn, second attack ignores 50% shield.
- **Phase 3:** Shrapnel mode — casts 3 mini-projectiles that telegraph on different dice. Each projectile hits the player unless the telegraphed die is NOT played that turn (puzzle layer).

## 23.5 Sector 4 — Hive Vectors (new)

**Fantasy:** A swarm-mind propagated through a derelict server farm. Everything that dies comes back as a smaller version.

**Mechanical twist — Swarm bar:**
Global bar fills as enemy minions stay alive on the field. At full (say, 4 alive minions turn-end × 2 turns), every enemy gains +2 DMG until one enemy is killed. Forces the player to prioritise minion cleanup even at the cost of chip on the elite.

### Standard enemies
- **Drone Swarmling** — Tiny, triangular. Spawns with 2 extras on combat start (summonOnStart = 2 already implemented for this enemy type).
- **Hive Conduit** — Diamond-shape relay. Turns each enemy minion it touches into a "Boosted" version with +30% HP.
- **Parasite Carrier** — Worm-like. On death lays an egg that hatches into a Parasite (5HP, applies Poison) in 2 turns.

### Elites
- **Queen Node** — Hovering hexagon. Every 2 turns resurrects the most recently-killed enemy minion at 50% HP.
- **Echo Hive** — Small cluster. Attacks split 3 ways — to player, to one minion, to enemy's own ally (heal instead of damage).

### Boss — HIVE PROTOCOL (v2)
- **Phase 1:** Summons 2 Drones at start; hits hard with direct attack while drones distract.
- **Phase 2:** Shared HP — boss and drones share one pool. Killing a drone damages the boss, but also instantly summons a replacement drone.
- **Phase 3:** Assimilate — 20% chance per turn to convert a player minion into a Hive Drone. (Already implemented — keep, polish animation.)

## 23.6 Sector 5 — The Source (new)

**Fantasy:** The logic core. Reality itself is thin here. Enemies are abstract — geometric intruders that bend rules.

**Mechanical twist — Reality glitch:**
Every 3 player turns, one of the player's unused dice randomly has its slot changed (Attack → Defend, etc.) for one turn. Visual: the die's icon flickers and swaps. The slot-change is predictable (telegraphed with a countdown on the HUD), giving the player time to plan around it.

### Standard enemies
- **Glitch Shard** — Diamond that phases. 50% chance per attack to miss entirely.
- **Echo Phantom** — Semi-transparent humanoid. Dealing damage to it mirrors half the damage back onto the player (Reflect built-in).
- **Paradox Loop** — Small ring. When you kill it, it comes back with 1 HP for 1 turn, attacks once, then dies for good.

### Elites
- **The Architect** — Tall, pyramidal. Every turn writes a "rule change" on the battlefield — e.g. "Defend dice deal damage", "Mana dice summon minions". Rules last 2 turns.
- **Null Prince** — Inverted silhouette. Immune to non-odd-numbered dice (visual pip on dice reveals parity).

### Boss — TESSERACT PRIME (v2)
- **Phase 1:** Baseline attack + escalating geometric complexity.
- **Phase 2:** Boss splits into 4 parallel selves — damage must be dealt to the "correct" self each turn (telegraphed).
- **Phase 3:** Reality overwrite — completely scrambles the dice pool. Player must play through a chaos hand while boss hits for massive damage.
- **Victory:** System crash cinematic (already in place — polish the dissolve animation with per-sector fragment colours).

---

# Part 24 — Sector X: The Archive

> *Unlocked after first Sector 5 clear. A post-game boss rush mode that gives veterans something to chase without forcing an "endless" structure we explicitly rejected in Part 0.4.*

## 24.1 Structure

**[P1 · L]** Sector X is a **5-boss gauntlet** with **zero reward nodes between fights**. No shops, no events, no rest. Only combat.

- **Node graph:** linear, 5 nodes. Each node is a boss (the five sector bosses from 1→5 in randomized order).
- **Twist:** Between each boss the player picks ONE of three Pacts:
  - **Pact of Ruin** — +50% player damage, -30% max HP.
  - **Pact of Silence** — rerolls are free, but every die in the hand loses combo-eligibility.
  - **Pact of Hunger** — minions deal double damage, but die one turn after spawning.
- **Pact carries over** — stacks across fights.

## 24.2 Final boss — THE ARCHIVIST

**[P1 · XL]** A unique 6th boss unique to Sector X.

**Fantasy:** A chained AI that remembers every run the player has ever died in. It attacks with echoes of past boss mechanics.

**Mechanics:**
- **Phase 1:** Cycles through a "mechanic menu" from the five sector bosses. Each turn it picks a different mechanic to apply (eye lock, frost, heat, swarm, reality glitch).
- **Phase 2:** Archives the player's last-played die at the start of each turn — that die cannot be played next turn.
- **Phase 3:** "Rewind" — after taking a heavy hit, rewinds the fight 1 turn (player's die spend is refunded, but boss HP is also restored).
- **Phase 4 (Enrage):** At 15% HP, all prior phase mechanics active simultaneously for 3 turns. Survive → win.

**HP scaling:** 500 base HP, +150 per Ascension level.

**Reward:** Unique cosmetic frame for the main menu title ("ARCHIVIST SLAIN" — a rotating brass badge). One per Ascension level.

## 24.3 Access gating
- Unlocks after: First Sector 5 clear.
- Shown on main menu as a 5th option ("ARCHIVE") once unlocked, beneath DAILY RUN.
- Separate leaderboard track from main runs (player stats: fastest clear, highest Pact-stack clear).

---

# Part 25 — Glossy UI pass (v2)

> *Current UI is functional and cohesive but reads as "polished alpha" rather than "premium product". Part 25 takes it to shelf-ready.*

## 25.1 Design tokens expansion

Add to CSS custom properties:
```
--panel-gloss: linear-gradient(180deg, rgba(255,255,255,0.08), transparent 30%, transparent 70%, rgba(0,0,0,0.18));
--panel-bevel-up: inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.35);
--panel-bevel-down: inset 0 1px 0 rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.1);
--glass-blur: blur(12px) saturate(120%);
--ambient-noise: url("data:image/svg+xml;..." grainy low-opacity noise);
```

Every `.glass-panel` uses `backdrop-filter: var(--glass-blur)` and the `--panel-gloss` overlay as a `::after`.

## 25.2 Screen transition overhaul

**[P1 · M]** Replace current linear slide-in with a three-layer transition:

1. **Backdrop flash** — 120ms colour wash in the outgoing screen's accent colour.
2. **Outgoing screen** — slides out with motion blur filter.
3. **Incoming screen** — scales from 0.94 with a 240ms ease-out, stagger-in children after.

Add `--screen-accent` CSS var per screen so each transition feels themed (purple for main menu, red for bloodstalker combat, etc.).

**AC:** Transitions never exceed 500ms end-to-end. Input is locked only for the first 200ms. `prefers-reduced-motion` drops the flash + motion blur and keeps a simple crossfade.

## 25.3 Micro-interaction pass

Every interactive element gets three states plus a press-in animation:

| Element           | Idle                   | Hover                   | Press                                   | Disabled           |
|-------------------|------------------------|-------------------------|-----------------------------------------|--------------------|
| Primary button    | Neon border pulse 2.4s | Lift 2px + glow bump   | Scale 0.94 + deep red flash + haptic    | 40% opacity        |
| Die               | Rest on arc            | Lift 6px + shadow      | Scale 0.95 + die-face flash + pickup spark | Grayscale + scale 0.9 |
| Map node          | Glow to sector colour | Ring expands           | Burst of sparks + audio pulse           | Desaturated + 50%   |
| Reward card       | Rarity-coloured ring  | Card lifts + preview scales | Card flies toward relic strip (exists) | N/A                |
| Tribute button    | Static red            | Glow bump              | Squish 0.92 + blood-drop splash         | 55% opacity (exists) |

**All press animations include a ≤50ms haptic tick on mobile.**

## 25.4 Typography hierarchy

**[P1 · M]** Four named type styles used everywhere:
- **TITLE** — Orbitron 900, 2.4rem, letter-spacing 0.12em, tight line-height. Used for screen titles, boss names.
- **HEADING** — Orbitron 700, 1.2rem, letter-spacing 0.22em uppercase. Used for section headers, settings tabs.
- **BODY** — Rajdhani 500, 1rem, letter-spacing 0.02em. Used for descriptions, run narration.
- **CAPTION** — Rajdhani 700, 0.72rem, letter-spacing 0.18em uppercase. Used for labels, footnotes, costs.

Replace ad-hoc font settings across the codebase with CSS classes `.t-title`, `.t-heading`, `.t-body`, `.t-caption`.

## 25.5 Iconography consistency

**[P1 · M]** All icons move to a **2-stroke, 2px thickness, 24px canvas** SVG system. No emoji fallbacks in combat. No PNG icons except brand asset (`intro.png`).

**Deliverable:** `src/ui/icons.js` contains every icon as a string constant. No icon is authored outside this file.

## 25.6 Panel polish

**[P1 · M]** Every `.glass-panel` gets:
- **Corner notches** (top-right + bottom-left, 12px cut via clip-path)
- **Gloss sheen** (moving highlight on hover — 2s sweep)
- **Edge noise** (grain overlay at 6% opacity)
- **Sectionable dividers** — `.panel-divider` class with a neon scan-line across it

**AC:** Every modal / screen uses `.glass-panel` or a variant; no ad-hoc backgrounds remain.

## 25.7 Combat HUD densification pass

**[P1 · L]** Current combat HUD has readability issues under high-effect load.

Proposed:
- **Top-left:** Sector + Turn chip, collapsible (tap to expand for intel).
- **Top-centre:** MODULES button becomes a small floating dock with a haptic tick on open.
- **Top-right:** Settings gear (persists), Intel quick-peek (new).
- **Middle 60%:** Combat stage.
- **Below combat:** Reroll badge + die arc + skip button (current).
- **Bottom strip:** Class ability widget (current).
- **NEW "health ribbon"** overlays the bottom of the combat stage, showing player shield, HP, effects as a single horizontal bar. Replaces the current stacked presentation.

---

# Part 26 — Class fantasy animation pass

> *Each class currently shares the same generic attack/summon/idle. Part 26 makes every class feel distinct — visually, audibly, and rhythmically.*

## 26.1 Attack animation per class

| Class        | Attack name       | Animation                                                        | Duration | Audio signature |
|--------------|-------------------|------------------------------------------------------------------|----------|-----------------|
| Tactician    | Pawn Volley       | 3 small pawn projectiles arc out in sequence, each with a small thump | 520ms | Snap + triple tick |
| Arcanist     | Glyph Weave       | Three glyph runes spin around the target, collapse inward, ignite | 680ms | Reverb chime + flame |
| Bloodstalker | **Sanguine Bite** | Player lunges forward, spectral fangs materialize, slash-bite on enemy (screen-shake + blood spurt) | 740ms | Meaty snap + drip |
| Annihilator  | Overdrive Strike  | Player charges red plasma, slams it into enemy with recoil pushback | 600ms | Heavy whoom + crack |
| Sentinel     | Bulwark Bash      | Player raises shield, charges, slams shield-first (shield impact splash) | 620ms | Metal clang + rumble |
| Summoner     | Verdant Lash      | Vines erupt from player's feet, whip at enemy, retract | 580ms | Leaves rustle + crack |

**Implementation:**
- Each attack is a distinct entry in `src/effects/attack-animations.js`.
- Trigger point: when a player attack die resolves (existing `applyDmg` path).
- Fallback: if a class attack asset is missing, the current generic "digital_sever" is used. Log a warning so the gap is visible.

**AC:** Playing an attack die as each class feels visually and audibly distinct. First-play test (30s each): A/B tester can identify the class from the animation alone.

## 26.2 Summon animation per class

| Class        | Minion name     | Summon animation                                            |
|--------------|-----------------|-------------------------------------------------------------|
| Tactician    | Pawn            | Materializes as a hologram from the player's hand          |
| Arcanist     | Mana Wisp       | Spirals in on a mana-flame trail                            |
| Bloodstalker | **Blood Thrall**| Swoops in from off-screen above the player — predator flying in, lands with a wing-fold + red dust cloud |
| Annihilator  | Bomb Bot        | Dropped from above with a parachute-cord glitch, lands with a thud |
| Sentinel     | Guardian        | Digital prism crystallizes at the spawn point, plate-by-plate |
| Summoner     | **Spirit**      | Vines crack the ground, the spirit pushes up through the dirt + bloom of green leaves |

**Implementation:**
- Each class registers an `onMinionSpawn(minion)` hook in `src/effects/summon-animations.js`.
- Hook runs after the minion is added to `player.minions` but before its position is updated.
- Duration: 520–700ms (class-specific). Minion's action is disabled during spawn animation (uses the existing `spawnTimer` field).

**AC:** Summoning a minion visually echoes class fantasy. Player who has played two different classes says "oh, of course this one grows from the ground" without being told.

## 26.3 Death animation per class
- **Tactician's Pawn** dissolves into pixels.
- **Arcanist's Wisp** pops with a flame burst.
- **Bloodstalker's Thrall** crumples + red puddle lingers 1s.
- **Annihilator's Bomb Bot** explodes (already exists — keep).
- **Sentinel's Guardian** shatters like glass.
- **Summoner's Spirit** wilts + leaves scatter.

## 26.4 Enemy attack animations

Each enemy family gets **3 attack animations** (baseline, special, crit-reaction):
- **Sector 1 family:** Laser sweep / lock-on beam / recoil flash
- **Sector 2 family:** Ice shard fan / frost spiral / crystallize on crit
- **Sector 3 family:** Plasma welder / lava spout / meltdown flash
- **Sector 4 family:** Drone swarm / venom burst / shell-crack on crit
- **Sector 5 family:** Reality blink / rule inscription / glitch-split

## 26.5 Idle animations
Every unit has a short (2–3s loop) idle — breathing, hovering, servo twitch.
**AC:** No unit is static on the combat stage.

## 26.6 Enemy death dissolves

Each enemy family gets a unique death dissolve (not just a generic explosion):
- **Sector 1 enemies:** dissolve into static (TV static frames fade out).
- **Sector 2 enemies:** shatter into ice shards that slide off-screen.
- **Sector 3 enemies:** slag into a puddle that evaporates.
- **Sector 4 enemies:** disintegrate into a cloud of small bugs that fly off.
- **Sector 5 enemies:** clipping glitch — body shrinks to a single pixel.

**Implementation:** Register per-enemy `onDeath()` hook in `src/effects/death-animations.js`. Current generic "explosion" is the fallback for anything unlisted.

---

# Part 27 — Intel section 2.0

> *Current Intel screen shows a list of defeated enemies with encounter counts. Players report it as "a menu I forgot existed". Part 27 turns it into a reason to play.*

## 27.1 Information architecture

Replace the flat list with three tabs:

### Tab 1 — **Bestiary**
A grid of enemy silhouettes. Undefeated enemies show as `???`. Defeated enemies reveal:
- Full-colour sprite
- Kill count, last-killed date
- Short lore blurb (unlocks at 3 kills)
- Weakness + resistance table (unlocks at 5 kills)
- A 3-second in-combat animation clip (unlocks at 10 kills)

### Tab 2 — **Chronicle**
A living timeline of the player's runs:
- Last 20 runs as a vertical strip (newest at top)
- Each entry: class played, sector reached, fragments earned, cause of death (or "COMPLETED"), elapsed time
- Tap to expand: run chart (HP vs turn, damage dealt vs received, relics picked)
- Best run highlighted with a gold border

### Tab 3 — **Cipher**
Unlockable lore documents, 24 in total:
- Each lore doc is tied to an in-run trigger (e.g., "Survive turn 10 on Sector 4", "Kill Null Pointer with no minion alive")
- Undefeated docs show `[ENCRYPTED]` with a progress bar
- Unlock fanfare: brief full-screen cinematic + lore reveal
- Collecting all 24 unlocks the THIRD SANCTUARY NPC (the Curator, already in code as a stub) with cosmetic unlocks

## 27.2 Progression unlock stream

Intel stops feeling separate when it drip-feeds rewards:

| Unlock milestone         | Reward                                         |
|--------------------------|------------------------------------------------|
| 1st kill of any enemy    | Enemy enters Bestiary                          |
| 3 kills of an enemy      | Lore blurb unlocks                             |
| 5 kills                  | Weakness / resistance table                    |
| 10 kills                 | Animation clip + "Veteran Hunter" sticker      |
| 20 kills                 | Fragment bonus (one-time)                      |
| All bosses defeated once | Unlocks the Chronicle tab                      |
| 24/24 cipher docs        | Unlocks Curator NPC + cosmetic dice skins      |
| All classes Sector-5-clear | Unlocks "GRAND ARCHIVIST" title + a main-menu particle effect |

## 27.3 Home-screen tease

**[P2 · S]** Intel button on the main menu shows a small badge count when there's new unlocked content since last visit. Existing pattern in the file-count system — extend it to Intel.

## 27.4 Integration with Ascension 2.0

Tier-specific Intel entries — e.g. "Ascension 5+: Panopticon's Phase 3 gains Blind Protocol" appears in the Panopticon bestiary entry only after encountering it at Ascension 5.

---

# Part 28 — Ascension 2.0 (hardening the chase)

> *Current ascension is flat number-go-up (+HP, +DMG). Part 28 makes it a genuine mastery ladder.*

## 28.1 Ascension ladder — 20 levels

Each level adds **one named modifier**. They stack, never replace. Clearing Sector 5 at level N unlocks level N+1.

| Lvl | Name               | Effect                                                                                           |
|-----|--------------------|--------------------------------------------------------------------------------------------------|
| 1   | Brittle Hull       | Player takes +2 flat DMG from every enemy attack                                                 |
| 2   | Fragile Memory     | Start every combat with 1 random die sealed                                                      |
| 3   | Bitter Harvest     | Shop prices +25%                                                                                 |
| 4   | Echo Protocol      | 10% of player's outgoing damage is reflected as self-damage                                      |
| 5   | Living Armor       | All enemies start combat with +10 Shield                                                         |
| 6   | Plague Bloom       | Any damage over 20 applies Poison 2 to the player                                                |
| 7   | Quickened Core     | Bosses enter Phase 2 at 75% HP instead of 66%                                                    |
| 8   | Crystal Thorns     | Elite affix pool doubles in size (new affixes unlocked only at Asc 8+)                          |
| 9   | Fractured Sight    | Intent preview shows only icon, not numbers                                                     |
| 10  | Silent Market      | Rest nodes disabled                                                                             |
| 11  | Null Field         | Relic costs +40% fragments                                                                      |
| 12  | Unmaking Strike    | Every 5 turns, a random relic loses a stack                                                     |
| 13  | Entropy Drift      | Lose 5% max HP every sector transition                                                           |
| 14  | Conservation Law   | Overheal becomes damage over time on the healer                                                   |
| 15  | Mirror World       | Enemies gain the player's last-played die as one of their own dice (thematic, flavour-heavy)     |
| 16  | Endless Loop       | Boss Phase 3 lasts two extra turns                                                              |
| 17  | Aurelia's Curse    | All "chance" mechanics roll twice, take the worse                                                |
| 18  | Dark Contract      | No rewards on elite kills                                                                       |
| 19  | Apostate           | Lose one passive meta-upgrade effect per run                                                    |
| 20  | The Final Archive  | Opens Sector X's Archivist boss as a *required* post-Sector-5 additional encounter              |

## 28.2 Display overhaul

Current ascension slider lives in a dev tab. Move to its own **ASCENSION** tile on the main menu, unlocked after first run clear.

- Tile shows current tier, tier name, modifier description.
- Tap to open Ascension panel: ladder visualized vertically. Completed tiers gold, current active tier pulsing, future tiers locked with a teaser "?".
- Show per-class Sector-5 clears at each tier (matrix: 6 classes × 20 tiers = the long-term completion chase).

## 28.3 Ascension-specific cosmetics

Every 5 tiers unlocks a cosmetic frame for the main menu title:
- Tier 5 — bronze cog frame
- Tier 10 — silver lightning frame
- Tier 15 — gold circuitry frame
- Tier 20 — obsidian archivist frame

---

# Part 29 — Custom Runs (Ascension 1+)

> *Once the player has cleared an ascension, unlock custom-run modifiers on the char-select screen. Think roguelite "mutators".*

## 29.1 Gating

**Custom Runs** are unlocked after clearing Ascension 1. A new tile/panel on the character select screen shows three mutator pools (pick 0–3 modifiers per run).

## 29.2 Modifier pool (phase 1 — launch set)

Each modifier has a **cost** (reduces fragment reward by a % on success) and a **payout** (boosts fragments if you win). Net fragment gain is `basePayout * (1 + sum(payoutBonuses)) * (1 - sum(penaltyFragReduction))`.

### Negative modifiers (make the run harder, boost payout)
| ID            | Name                  | Effect                                                     | Payout bonus |
|---------------|-----------------------|------------------------------------------------------------|--------------|
| `hard_heart`  | Low-Health Start      | Start with 50% HP                                          | +15%         |
| `no_rest`     | Merciless             | Rest nodes do nothing                                      | +20%         |
| `glass_cannon`| Glass Cannon          | +50% DMG dealt, +50% DMG taken                             | +20%         |
| `slim_dice`   | Narrow Hand           | Start with only 3 dice instead of 4                        | +30%         |
| `no_reroll`   | Locked In             | No rerolls available                                       | +35%         |
| `undead_mob`  | Undead Protocol       | 20% of enemies resurrect once with 50% HP                  | +30%         |
| `tax_man`     | Tax Man               | 10% of fragments earned lost at each sector transition     | +15%         |
| `cursed_deck` | Cursed Relics         | Every relic you pick deals you 3 DMG when acquired         | +25%         |
| `limit_lore`  | Silent Chronicle      | No lore unlocks this run                                   | +10%         |
| `hot_hands`   | Hot Hands             | Each turn the first die you play triggers a heat pulse (3 self-DMG) | +15% |

### Positive modifiers (make the run easier, penalize payout)
| ID              | Name                   | Effect                                                     | Penalty          |
|-----------------|------------------------|------------------------------------------------------------|------------------|
| `starter_kit`   | Starter Kit            | Begin with 2 random common relics                          | -30% payout      |
| `extra_reroll`  | Steady Hand            | +1 extra reroll per turn                                   | -25% payout      |
| `soft_bosses`   | Soft Bosses            | All bosses -20% HP                                         | -40% payout      |
| `free_shops`    | Open Markets           | Shop prices -30%                                           | -25% payout      |

### Chaotic modifiers (weird but not strictly +/-)
| ID               | Name              | Effect                                                         | Payout bonus |
|------------------|-------------------|----------------------------------------------------------------|--------------|
| `scrambled`      | Scrambled Protocol | Every combat, dice types are shuffled (same pool, random slots) | +10% |
| `dark_visions`   | Dark Visions      | Enemy intent icons hidden; must be inferred from animations    | +20%         |
| `double_or_none` | Double or None    | Attack dice roll 50%: deal 2x or 0 damage                      | +15%         |
| `daily_dupes`    | Daily Dupes       | Every relic is duplicated on pickup (stacks 2x)                | -15% payout  |

## 29.3 UI & flow

**Character select → "CUSTOM RUN" tile** (only shows if Ascension ≥ 1 unlocked):
- Grid of available modifiers, each card shows: icon, name, short desc, payout delta.
- Selected modifiers light up. Running total of net fragment modifier shown at bottom.
- **Apply** button commits; starts run with modifiers encoded into save state.

At run start, a banner shows the active modifiers ("RUN TYPE: GLASS CANNON × LOCKED IN — NET +55%").
At run end, reward screen shows base → modified payout with the delta highlighted.

## 29.4 Save persistence
- Modifiers are stored in `runState.customModifiers` (array of IDs).
- On save/load, modifiers are re-applied to the active run.
- Quitting a custom run doesn't lose the modifier selection — persists as "last picked" for the next run.

## 29.5 Leaderboard integration
Custom runs have their own leaderboard track (not mixed with vanilla Ascension). Players can filter leaderboards by active modifier set.

## 29.6 Phase 2 — post-launch additions
- Player-created modifier combos shareable via short code
- Community-picked "Weekly Challenge" modifier set
- Modifier achievements ("Clear Sector 5 with 5+ negative modifiers active")

---

# Part 30 — Map topology overhaul

> *Current map is a linear sequence of nodes. Part 30 makes map selection a meaningful choice.*

## 30.1 Branching map structure

Each sector's map becomes a **6-layer branching graph** (inspired by Slay the Spire):
- Layer 0: Start (single node)
- Layers 1–4: 2–4 parallel nodes, interconnected
- Layer 5: Boss (single node)
- Paths are *one-way* (forward only; no backtracking)

## 30.2 Node type distribution

For each non-start/non-boss node, type weights:
- **Standard combat** — 40%
- **Elite combat** — 15% (shown with a red-ringed icon)
- **Shop** — 10%
- **Event** — 20%
- **Rest** — 10%
- **Treasure** (mini-event, one-off relic) — 5%

Boss node: always last. No player choice.

## 30.3 Visual redesign

- Map background = sector's parallax skyline (already exists).
- Nodes drawn as circuit-board icons, size/colour by type.
- Paths drawn as glowing traces between nodes.
- Player's current position marked with a pulsing diamond.
- Visited nodes dim but readable.
- Upcoming nodes show their type icon + a small tooltip on long-press ("Standard fight — Watcher-01 likely").

## 30.4 Special map features per sector

- **Sector 1:** Surveillance camera sweep — every N map moves, a random unvisited node is briefly revealed.
- **Sector 2:** Iced paths — some edges are blocked until a heat-vent event unlocks them.
- **Sector 3:** Magma rivers — crossing certain edges costs 5 HP.
- **Sector 4:** Hive corruption — every 2 moves, one visible node becomes "Infested" (harder but double rewards).
- **Sector 5:** Glitched branches — some paths flicker between 2 destinations. Roll-based resolution.

## 30.5 AC
- Player sees a map that feels like a decision, not a corridor.
- Elites are visible in advance so players can route around them (or into them for the risk/reward).
- On mobile, map fits 100% within one viewport (no horizontal scrolling).

---

# Part 31 — Feedback-loop improvements

## 31.1 End-of-turn digest (mini)

**[P1 · S]** After each turn, a 2-second floating summary appears top-centre:
> `TURN 5 · DEALT 47 · TAKEN 12 · 2 DICE USED · +3 BLOOD POOL`

Stackable variables, class-aware (shows the class widget's metric of the day).

## 31.2 End-of-combat recap

**[P1 · M]** Before the reward screen, a brief (3s) combat summary card:
- Player portrait + enemy portrait side-by-side
- Big stat: total damage dealt vs taken
- Highlight stat: "Biggest hit: 84 DMG (Crit)"
- Three interesting moments as tiny thumbnails (e.g. "Lifesteal x5", "Perfect block", "Combo FRENZY")

## 31.3 Post-death autopsy

**[P1 · M]** Replace current Game Over screen with an autopsy card:
- Cause of death (enemy name, killing blow amount)
- "Lesson" generated from the run — e.g. "You spent 0 Mana this run. Try skill dice to multiply your output."
- One-tap "RESTART" and "MAIN MENU" buttons
- Share button for clipboard/social: autogenerated summary image

## 31.4 Share-out hooks

**[P1 · S]** Four natural share moments:
1. First Sector 5 clear → "I beat Magic v Machine!" share card
2. Any Ascension-level clear ≥5 → "Cleared Asc 5+!"
3. Custom Run clear with ≥3 negative modifiers → "Masochist Certified"
4. 100k fragments milestone → "Tech fragment hoarder"

Share card is a 1080×1080 PNG generated client-side (existing `src/services/share.js`). Pre-populates text for Twitter/X/BlueSky/Reddit.

---

# Part 32 — Implementation priority & dependency graph

> *With everything in Parts 23–31 on the table, here's a realistic 6-month rollout.*

## 32.1 Milestone 1 — "Foundation" (weeks 1–6)

Focus: systems & data layers that everything else needs.

- **Part 25.1** Design tokens CSS refactor (`M`)
- **Part 25.2** Screen transition overhaul (`M`) — ***partial implementation already shipped in this changeset***
- **Part 25.4** Typography classes (`M`)
- **Part 23.1** Sector identity framework — data tables only (`M`)
- **Part 26.1–26.2** Attack + summon animation hook infrastructure (no art yet) (`L`)

## 32.2 Milestone 2 — "Class identity" (weeks 7–10)

Focus: class-specific content drops that make every class feel distinct.

- **Part 26.1** All 6 class attack animations (`L`)
- **Part 26.2** All 6 class summon animations (`M`)
- **Part 26.3** All 6 class death animations (`M`)

## 32.3 Milestone 3 — "Sector content" (weeks 11–18)

Focus: new enemy roster and map topology.

- **Part 23.2–23.6** All five sectors' enemy rosters (`XL` × 5)
- **Part 26.4–26.6** Per-family enemy animations (`L` × 5)
- **Part 30** Branching map topology (`L`)

## 32.4 Milestone 4 — "Meta layer" (weeks 19–22)

- **Part 27** Intel 2.0 (`L`)
- **Part 28** Ascension 2.0 modifiers + UI (`L`)
- **Part 29** Custom Runs phase 1 (`L`)

## 32.5 Milestone 5 — "End-game" (weeks 23–26)

- **Part 24** Sector X: The Archive + Archivist boss (`XL`)
- **Part 31** Feedback-loop improvements (`L`)
- Final balance + launch prep.

## 32.6 Dependency notes

- Parts 23.x (sector content) depend on Part 26.1–26.4 (animation hooks).
- Part 28 (Ascension ladder) must ship before Part 29 (Custom Runs) — the gating uses Ascension cleared as a prerequisite.
- Part 24 (Sector X) depends on all sector boss phase overhauls (23.2–23.6).
- Part 27 (Intel) hooks are cheap to add piecemeal alongside any content part — recommend building the three-tab shell early, filling content lazily.

## 32.7 What's already implemented in this changeset

- **Part 25.2** — partial: iOS `100dvh`, stagger-in children on screen activation (exists), reduced-motion branch (exists). Added grain overlay flag + accent-tint CSS var wiring. See `screen-transitions` CSS block.
- **Part 29.3 (partial)** — char-select screen now has a CUSTOM RUN button stub that shows a placeholder panel when Ascension 1+ is unlocked. Modifier data lives in `src/constants.js` (`CUSTOM_RUN_MODIFIERS`); the selection + application logic is scaffolded but behind a feature flag (`FEATURE_CUSTOM_RUNS = false`) until balance playtesting.
- **Part 27.3** — Intel main-menu button now exposes an unlocked-count badge (pattern matches the encryptedFiles badge).

The rest of Parts 23–32 remains to be implemented as scheduled.
