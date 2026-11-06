# Magic v Machine. Roadmap

**Live tracker.** Edit when items ship; archive completed sections every
quarter. Replaces AUDIT_2026-05.md, SESSION_NOTES_2026-05.md,
WEEKLY_ROADMAP.md, and PRODUCTION_ROADMAP.md, all of which are now
in `docs/archive/`.

## Status

- **Implementation complete:** Stable v1.9.57 and Guided v1.10.1.
- **Release status:** both final versions are published and verified on
  6 November 2026. Stable v1.9.57 and Guided v1.10.1 are independently playable.
- **Earlier Stable reference:** v1.9.56 remains frozen at `d51d8b1` with
  552 normal checks, 552 shuffled checks, 15 browser cases and 150 layout
  checks passed. The v1.9.57 gate includes the additional consent fix.
- **Final Stable evidence:** runtime and checks at `088aec7`, 566 normal
  checks, 566 shuffled checks, 16 browser cases and 150 layout checks passed.
  Report: `test-results/2026-11-06T21-46-20-271Z/summary.json` in the Stable checkout.
- **Final Guided v1.10.1 evidence:** source `17c3d5f`, 753 normal checks,
  753 shuffled checks, 29 browser cases and 150 layout checks passed.
  Report: `test-results/2026-11-06T22-33-55-914Z/summary.json` in the Guided checkout.
- **Frame metrics:** truthful (intervalBuf + workBuf split shipped v1.8.9)

### Completed dual-edition implementation

| Edition | Version | Publication destination |
|---|---|---|
| Stable | 1.9.57 | [Existing root URL](https://tayyibshah123.github.io/magicvmachine/) |
| Guided | 1.10.1 | [Separate Guided URL](https://tayyibshah123.github.io/magicvmachine/guided/) |

Stable preserves the five-room prologue and ordinary map progression.
Guided adds optional staged learning. Full Rules remains available at the
start, all six operators remain selectable, and difficulty is a separate
choice. Both editions retain the visible ALPHA V1 stamp. The frozen
`stable-v1.9.55` tag remains a fallback.

The editions use separate profiles, saves, wallets, settings, imports,
resets, PWA identities and scoped worker caches. Stable retains its existing
profile keys; Guided uses its own storage namespace. One edition's update
or reset must leave the other intact. Packaging and the cross-edition gate
check both builds together before publication.

Completed correctness work includes unobstructed dice and control zones,
larger class-action targets, distinct Save and Return and Abandon actions,
checkpoint replacement confirmation, recoverable pending rewards, safer
save import and quota handling, and refunds for unwired permanent offers.
Optional callsigns no longer advance on an idle timer. Diagnostics consent
waits for a safe screen and describes local logging without new network
collection. Its banner disappears on gameplay or modal transitions, rejects
queued gameplay taps and waits for a quiet safe screen before returning.
Keyboard navigation can reach its buttons. Teaching feedback follows actual outcomes. Reference copy,
currency labels, integer minion boosts and passive-orb handling match the
active rules. Glitch Overlay and Drift Echo are standard menu effects;
earned streak styles remain rewards.

Guided implementation now provides:

- Two class-aware core drills covering attack, the real defensive action,
  intent, timing and a genuine enemy phase. Perfect timing is optional.
  Class-specific enemy HP keeps tested Good loops within four attack turns
  per room. The second drill uses the selected class's actual attack rhythm.
  Deterministic critical-hit checks cover both drills for all six classes.
  Annihilator's 32-HP and Sentinel's 13-HP teaching targets preserve the
  intended enemy phase and next-hand step even with the tested critical
  opening and parry combination.
- A smaller opening hand, then four, five and six dice as resources, allies
  and signature tools are introduced. Summoner keeps its essential ally
  identity early. HP costs are explained before their normal rules apply.
- A versioned first-sector route that separates rerolls, recovery, Mana and
  a paid skill, shops, allies, optional ally timing, status effects, hostile
  target priority, multi-hit attacks and signatures before the boss.
  Enemy and offer pools follow the same introductions.
- Later-sector lessons for sector rules, combos, momentum, synergies and
  new enemy types. Existing Guided v1 checkpoints retain their route; new
  runs receive the current route. Active run rules survive a cold resume.
- Optional reward-free practice with real resource costs and lesson actions.
  Leaving restores the original run and profile. Practice does not consume
  a checkpoint or award currency, modules or route progression.
- Clear run-only reward wording, first-return and loss currency guidance,
  affordable working Sanctuary suggestions, and Browse All access to the
  full catalogue. Existing players retain their content and can choose a
  refresher without a mandatory new funnel.
- Shorter routine phase waits, complete committed attack presentation,
  readable encounter rules and explicit advanced-mode consequences. A
  meaningful friendly volley can use one optional boost prompt; Bomb Bots
  retain their charge and detonation controls. Challenge is optional and
  is not the recommended recovery path after a beginner loss.

### Validation and remaining limits

Both final source gates passed with frozen runtime, test and bundle inputs.
Together they passed 1,319 checks in normal order and 1,319 in shuffled
order, with no skipped checks. All 45 source mobile browser cases and
150 layout scenarios per edition passed. The corrected publication then
passed all seven combined-edition cases covering reset, abandon, import,
update and cold offline isolation in the same browser profile.
Combined report: `test-results/dual-1794005138191/summary.json`.

Published commit `bd52dab` passed the GitHub Pages deployment. All 286
deployed game files matched the package hashes; two interrupted transport
requests matched on their first follow-up. Fresh native touch launches
confirmed Stable v1.9.57 and Guided v1.10.1, their own worker scopes, separate
storage and one navigation on each first installation. Onboarding was not
refreshed or skipped, both entered the actual core, and no page errors were
observed. The corrected public Guided cards were visually checked.
Evidence: `test-results/publication-verification.json` and
`test-results/public-smoke/summary.json` in the Guided checkout.
Release refs: `stable-v1.9.57` and `guided-v1.10.1`; earlier frozen refs remain intact.

Live visual QA of Guided v1.10.0 found that its recommended cards' previews
still used the global absolute canvas positioning after the cards switched
to a column layout. Guided v1.10.1 restores normal preview flow. Its browser
regression failed before the correction and passed at 360px and 390px after
fonts and entry effects settled. Preview, name, badge and role rectangles
are separated, fit their cards and retain reachable card centres. Named
screenshots and measured bounds are retained in the browser evidence.

A separate balance stress probe at source `5589b26` ran 6,480 cases:
5,480 wins, 951 losses and 49 turn-limit results. The turn-limit cases are
censored outcomes. These are automated stress results across configured
classes, sectors, builds, timing qualities and HP models, not human win
rates or proof of campaign balance.

Actual-method playtests at `79c31c0` completed all 14 stops and 11 combat
wins on the earned Sector 1 route with all six classes, including the real
reroll lesson, rewards and purchases. A further simple-policy run cleared Sector 2 and then lost in
Sector 3 without an observed softlock. Those losses do not establish that
Sector 3 is impossible. Full campaign balance and first-time human learning
remain unproven by these checks.

Browser evidence uses Chromium touch emulation. Optional Windows WebKit
could not launch because Application Control blocked it. No Safari or
physical iPhone coverage is claimed. Physical-device browser chrome,
keyboard, installed-PWA lifecycle and Android wrapper behaviour still need
their own checks.

Live checklist of what was claimed open in the old docs but is actually
shipped, removed during this consolidation:

- ✅ Hive Protocol 4→3 acts/turn (`constants.js:929`)
- ✅ Text-scale slider 80-140% (`index.html:1157-1159`)
- ✅ Dyslexic-font toggle (`index.html:1170-1171`)
- ✅ Intel Cipher + Chronicle tabs (collapsed back into the unified
  Intel screen. see `_renderIntelCipher` in game.js:12477)

<a id="proposed-experience-and-onboarding-plan-awaiting-approval"></a>
## Approved experience and onboarding work: original audit and scope

Approved on 2026-11-06. The user authorised the two-edition implementation
and publication, with recommended decisions resolved autonomously. The
implementation summary and current release evidence are above. The
following v1.9.55 findings and proposed sequence are retained as the audit
record, not a list of current open defects. Final publication remains
subject to the remaining gate and live verification.

### Baseline and scope

- Reviewed source: v1.9.55, commit `56435c416137368781c88af931b986710cf0f31b`.
- Frozen stable branch: `codex/stable-v1.9.55`. Annotated tag:
  `stable-v1.9.55`. Both point to that same existing release commit.
- Original proposal branch: `codex/progressive-onboarding-plan`.
  Implementation proceeds on separate Stable and Guided branches. The
  original v1.9.55 branch and tag remain frozen.
- Existing release evidence remains 381 normal checks, 381 shuffled checks
  and nine browser cases. This exploratory review found additional gaps;
  passing the existing gate does not invalidate the findings below.

### What was actually tested

- A fresh live profile, optional-data prompt, idle callsign screen, class
  selection, and all five Tactician Breakout encounters. Used real touch
  input, deliberately dropped an attack on the wrong target and missed
  attack/parry timing. Started at 390px and continued at 360px.
- First real map and its forced opening Rest layout, maintenance choices
  and the first module offer. A controlled post-tutorial checkpoint then
  exercised full-health Sleep, a normal Cyber Arachnid fight, its reward
  selection and return to map. The normal fight completed at turn seven
  with 31/33 HP. This was an exploratory input strategy, not an optimal
  build or a novice completion-time benchmark.
- Six-die hit targets at 360, 390 and 414px. The blocked die was recovered
  through its exposed corner, then the ordinary fight continued at 390px.
- Native Sanctuary purchase, reload, actual reward generation, Challenge
  entry with an existing checkpoint, and Abort Run checkpoint behavior.
  Controlled profiles used fictional Sparks and saves, not player data.
- The actual Tesseract fragment factory plus minion strike resolver, and
  the actual friendly minion resolver with a native Perfect timing input.
  These were isolated encounter probes, not claimed full boss victories.
- A controlled storage-write failure against the actual save import method.
- Additional staged native-touch checks covered shop entry, the directional
  hacking game and its natural timeout, Intel/Cipher entry and two wrong
  inputs, and refresh/resume before selecting a real combat reward.
- Staged actual boss introductions were inspected for all five sectors.
  Sector 1's phase-two presentation was exercised with a controlled HP
  threshold. These were entry/presentation probes, not boss playthroughs
  or victories; Sector 2 was sampled during entry rather than readiness.
- All six class detail panels were opened and closed with native touch at
  360px, and their confirmation centres were hittable. Longer content can
  require scrolling; that alone is not treated as inaccessibility.
- Settings at 140% text size at 360, 414 and 768px. Footer actions remained
  within the viewport and there was no document horizontal overflow.
- Read-only review of all six class kits, all five sectors, boss rules,
  learning flags, reward/shop pools, currencies, saves and advanced modes.

The browser work used Chromium touch emulation. Physical iPhone Safari,
Android wrapper behavior, audio quality, mobile keyboard behavior and
human learning/retention were not measured. Later-sector balance findings
are source-derived and require matched-build playtests. One exploration
script used an incorrect screen selector and lost its temporary browser
session; subsequent checks used an explicitly staged checkpoint. That
automation error is excluded from game defects.

Local screenshots and JSON observations are in the ignored directory
`test-results/experience-v1.9.55/`. They are deliberately not shipped.
Retain the working shop risk disclosure, scrollable Intel exit, reachable
large-text settings actions, class choice and full attack presentation.

### Confirmed failures and friction to address first

1. **A sixth die is covered at 360px.** The unused rightmost die's centre
   hits `btn-end-turn` rather than the die. Native centre drags failed;
   grabbing its exposed corner worked. The same hand was unobstructed at
   390 and 414px. Reserve separate control and dice zones, with an
   unobstructed touch target for every die at the maximum hand size.
   Also enlarge Tactician's three ability actions, measured at 24 by 44px.

2. **Purchases can charge for missing benefits.** A native Foresight
   purchase reduced Sparks from 102 to 92, remained owned/enabled after
   reload, but actual reward generation still produced three choices.
   Eight Run Options IDs have definitions and purchase UI but no gameplay
   consumers found: Run Archive, Corruption Index, Anomaly Detector,
   Foresight, Skill Database, Tactic Library, Heretic Protocol and
   Curator's Choice. See `constants.js:540` and `game.js:4388`.
   Preferred first fix: withdraw these offers and refund owned entries
   once at their published v1.9.55 prices. The total for all eight is
   80 Sparks. Preserve earned lifetime totals and working upgrades. There
   is no durable purchase ledger, so describe this as a refund at those
   published prices, not a reconstruction of historical receipts. New
   implementations of these systems should be separate design work.

3. **Challenge silently deletes a checkpoint.** One native Challenge tap
   erased the active slot before character selection, without a discard
   confirmation. Initiate Run already protects this case. Apply one
   consistent new-run/mode-switch confirmation before any destructive
   action. Cancelling must preserve the exact old checkpoint.

4. **Exit and resume labels are unclear.** Native Abort Run returned to
   the menu, reset runtime Fragments and kept the old checkpoint resumable.
   Provide distinct Save and Return and Abandon Run actions. Describe
   checkpoint restoration honestly rather than implying an exact frozen
   turn. Add visible settings/help/return navigation to the map, where
   the current screen offers no visible menu button.

5. **Save import can erase data and report success.** With controlled
   write failures, `SaveSync.importAll()` removed existing game keys,
   failed to write replacements, and returned true. Validate the entire
   input first, preserve recoverable originals, expose write failure and
   verify restoration before reporting success. Quota recovery also
   silently deletes another slot based on its size; replace that policy
   with an explicit export/delete decision. See `save-sync.js:110` and
   `game.js:11035`.

6. **The opening advances without the player.** Callsign entry progressed
   to character selection after 20 seconds without input. Consent and
   callsign requests also share the opening screen. Remove automatic
   lesson advancement, keep the callsign optional and sequence optional
   diagnostics at a safe point with wording matching the local logging
   implementation. No new network collection is part of this plan.

7. **Tutorial praise can contradict the action.** After deliberately
   missing a defensive timing input and taking damage, the first room
   still said 'You parried'. Branch feedback from the resolved outcome.
   Keep instructions readable until the relevant action and presentation
   finish. The status drill also took eight turns in this run; teach a
   first status in a shorter controlled exchange before longer practice.

8. **Successful early minion timing can do nothing.** A native Perfect
   result produced multiplier 1.3 on a one-damage spirit and still dealt
   one damage. For otherwise unmodified minions, Good adds no integer
   damage below base damage ten; Perfect adds none at base damage one to
   three. The Summoner's advertised
   starting 40% stat increase also floors 2 HP/1 damage back to 2 HP/1
   damage. Make advertised improvements visible in the final numbers.

9. **Passive orbs request defensive timing.** An actual Tesseract Heart
   with damage zero and `_pacifist=true` opened a defensive prompt with
   incoming damage zero. Resolving it changed no HP. Reserve defensive
   prompts for real threats; show the four passive roles in one clear
   passive-resolution beat. Preserve genuine attack animations.

10. **Early decision density needs testing.** All six class
    panels introduce minions, abilities, signatures and combos. Five
    compulsory training fights then introduce almost the entire combat
    vocabulary. Free play begins with two forced Rest nodes before a
    normal fight. Full-health Sleep consumes the choice with no HP gain.
    The first observed module offer combined dodge chance, shield-break
    healing, a mana-spend threshold and an unfinished synergy. Use a
    guided route and small, concrete offer pool for new guided runs.
    These screens are observed facts; whether their decision density is
    too high is a design hypothesis to validate with first-time players.

11. **Learning records confuse suppression with understanding.** Hints
    suppressed during Breakout or disabled settings are marked seen;
    queued hints are marked seen before display. Separate per-run hints
    can then repeat basics on every run. Introduce one ordered learning
    queue with acknowledgement and action evidence. Multiple unlocks
    must not overwrite a single 'new unlock' announcement.

12. **Basic instructions disagree with the rules.** Correct the complete
    reference set together, including:
    - Fragments reset with the run; Sparks fund permanent upgrades.
    - Ordinary Perfect attack timing is +60%, not double damage.
    - Timing taps work anywhere, rather than requiring target aiming.
    - Current signature dice cost zero mana; paid skills demonstrate mana.
    - Arcanist taps the current glyph; it cycles in real time, not per turn.
    - Sentinel's third plate primes its block automatically.
    - Summoner has four plots, not three.
    - Frail currently increases incoming damage 50%, not the described 30%.
    - Signature evolution requires its unlock and specified boss milestones.
    - Tesseract's removed double-hit mechanic remains in a phase banner.
    - Ordinary rewards still say SECTOR CLEARED, even after a normal enemy.
    - Meditate's 'permanent' benefit should explicitly say it lasts this run.
    Derive numeric descriptions from rule data where practical. Review
    signatures' tier-specific critical claims against the common resolver.

13. **Phase and recovery explanations need clearer consequences.** The
    enemy-phase banner appears before friendly minions act. Tooltips on
    touch still use 'Left Click'. First defensive ally/minion prompts are
    different from ordinary parries without a distinct introduction.
    Use consistent touch language, ALLIES ACT and ENEMY ACTS labels,
    persistent effect counters and a death recap that explains actual
    damage sources, shield bypass and what remains banked.

14. **Several advanced promises need reconciliation.** Hive respawn
    advances its counter per intent instead of per round; a production
    roster probe became eligible on the second decision round rather
    than the described fourth. Its low-HP mercy rule also bypasses the
    advertised faster final-phase cadence. Define and test one rule.
    A20's required-Archivist flag has no Game consumer found, while actual
    entry depends on the 1,000-Spark key. Put that goal in Endgame rather
    than OTHER and distinguish Chronicle, Run Archive and Sector X names.

15. **Pending combat rewards do not survive refresh.** In a staged normal
    victory, Fragments increased from 100 to 197 and three module choices
    appeared. Reloading before selection restored the map, kept all 197
    Fragments and offered the same encounter node again. Entering it
    spawned a different enemy. Persist the offered IDs, already-awarded
    payout and encounter completion as one recoverable receipt. Resume
    the actual pending choice and settle it once. Historical saves cannot
    reliably reveal whether a reward was pending, so migration must not
    invent free rewards for every old combat checkpoint.

16. **Cipher exposes its failure cost after the loss.** First entry began
    the memory sequence without a cost/reward/risk briefing. Two wrong
    native inputs consumed a file, from two to one, and awarded no Sparks.
    Explain that before the first attempt and offer harmless practice.
    The sequence waited for input rather than timing out after 32 seconds;
    that waiting is not a softlock. Shop hacking, by contrast, already
    disclosed its discount and doubled-price failure outcome. Its natural
    12-second timeout doubled all six prices and kept Fragments unchanged.
    Preserve that clear risk disclosure and introduce the optional game
    after ordinary purchasing is understood.

### Proposed slower introduction of systems

Spread learning across more encounters. Keep the opening practical and
reduce routine waiting between meaningful actions. The exact encounter
counts below are proposed design choices, not proven balance targets.

| Stage | Trigger | What becomes part of the guided experience |
|---|---|---|
| Arrival | New profile chooses guidance | Optional callsign; Initiate selected by default; Tactician and Sentinel foregrounded with plain role descriptions. More Operators keeps all six available. Timing/reading assistance is immediately accessible. |
| Core drill | First deployment | One attack, the selected class's defensive action, enemy intent, timing and End Turn. Use a small hand and forgiving enemy. Wrong inputs get specific feedback; no perfect result is required. |
| First ordinary victory | Core actions demonstrated | Repeat the same loop independently, then choose a simple run-only module whose benefit is visible in the next fight. Show where the checkpoint was saved. |
| Hand control | Next suitable encounter | Reroll one unwanted die and demonstrate keeping useful dice. Introduce no enemy gimmick in the same lesson. |
| Mana and a paid skill | Basic loop established | Show the skill's cost, current mana and resulting effect together. Use one paid skill; do not use a free signature to teach spending. |
| Ally and class identity | Relevant to the selected class | One summon, one meaningful ally action, then the class's real signature rhythm and one ability payoff. Summoner receives its essential minions earlier; HP-cost classes receive their warning before spending HP. |
| First maintenance and shop | At least two ordinary victories | One preparation stop, a clear health/build trade-off and Fragment spending. Avoid the current double opening Rest. Offer simple, useful purchases; introduce hacking separately. |
| Late Sector 1 | Fundamentals practised | Introduce one status, one hostile-minion priority and one multi-wave attack in separate suitable encounters before the boss uses them together. |
| First boss and first return | Relevant run outcome | Pin the boss's current rule and counter. Explain Sparks versus Fragments and offer one relevant permanent purchase. A loss retains learned fundamentals and offers retry/refresher choices. |
| Sector 2 onward | Existing progression plus relevant actions | Introduce sector rules, first useful combo, momentum, deeper synergies, corruption, fusion and hacking in context. Advanced modes get a short purpose/consequence briefing when unlocked. |

Class essentials override the generic order, including the core drill.
Bloodstalker's defensive die heals, and Annihilator's provides Ricochet
reduction, rather than ordinary shield. Give the former a safe prior wound
and the latter a previewed reduced hit. Do not remove a Summoner's identity
to satisfy a universal late minion gate. Do not require a manual Perfect
result to unlock anything. Offer Full Rules immediately to confident
players, and make individual prison drills replayable instead of requiring
the entire five-fight prologue before every new learning path.

Challenge may remain available after a defeat, but should not be promoted
as the recommended next step to a struggling beginner. Introduce Intel at
the first file with an explicit Cipher cost, success reward and failure
consequence. Sanctuary's first view should foreground a few affordable,
working choices and the selected class; Browse All retains the full catalog.

### Combat flow and difficulty proposals

- The two routine phase banners currently add 5.6 seconds per round before
  attack presentation. Trial shorter routine labels, keeping deliberate
  first-time boss and phase explanations. Remove redundant spacers only
  after the actual effects have completed.
- Prefer one optional friendly-volley boost with an explicit integer
  payoff. If no damage can change, resolve the base attacks automatically.
  Teach ally boosts separately from defensive timing. Evaluate this simple
  volley first; defer additional interaction modes until evidence supports
  a meaningful benefit.
- All timing decisions finish before logical damage. Every committed hit
  and projectile still animates fully, including after an early lethal
  hit. For each committed action or volley, victory/defeat transitions
  wait for those presentations. Explicit quit or encounter replacement
  still cancels stale actions immediately.
- Enemy previews should say exactly when an effect happens and how to
  respond. Self-destruct needs a player-turn countdown; orb roles,
  invulnerability, shield charges, support regeneration and Reality Shift
  need visible rules and counters, not only short floating text.
- Trial separate guided enemy pools. First normal opponent is basic;
  target priority, detonation, reflection and other rules enter one at a
  time. Reward, rest, shop and event pools must follow the same curriculum.
  Hiding a button while still rolling its mechanic would not simplify play.

Source-derived normal enemy spawn values at Ascension 0/corruption 0:

| Sector | HP range | Mean HP | Base hit range |
|---|---|---|---|
| 1 | 34 to 114 | 79.0 | 4 to 13 |
| 2 | 110 to 220 | 158.8 | 10 to 21 |
| 3 | 159 to 481 | 327.2 | 0 to 37 |
| 4 | 220 to 659 | 438.3 | 14 to 51 |
| 5 | 496 to 1,033 | 705.2 | 23 to 72 |

These include constructor and normal-enemy sector multipliers. They are
not effective DPS, boss values or predictions of player difficulty. The
Sector 3 zero is the charging Slag Geyser. Test Sector 1 to 2 and 2 to 3
transitions with plausible weak, average and synergistic builds before
choosing HP reductions or additional upgrade guarantees. Test heat against
minion builds, Compiler armor/support/chip damage, Hive healing/respawn and
Tesseract's orb/vulnerability/reversal rules as separate balance scenarios.

### Learning persistence and existing players

- Keep access entitlements separate from explanation, practice and skipped
  lessons. Use stable shared and per-class milestone IDs, plus an ordered
  introduction queue. Learning survives death and harmless restarts.
- Hints disabled or suppressed remain eligible for later explanation.
  Skipping guidance never removes access or pretends a Perfect was learned.
- Keep Initiate as an explicit persistent choice. Do not silently end help
  after three class confirmations or aborted attempts.
- Treat meaningful legacy saves/unlocks as returning-player evidence.
  Preserve earned content, wallets, achievements, accessibility choices
  and active runs. Offer a voluntary refresher; never force a new funnel.
- Apply new routes and pools only at new-run creation. Save their version
  with that run so a refresh cannot silently change its rules or choices.
  Label Guided rules clearly; do not silently rewrite a chosen difficulty
  or an existing Challenge run.
- A profile guidance key can be versioned independently. If lesson state,
  route versions or pending choices enter slot snapshots, bump the run
  schema and append the required migration. Resume the current short
  lesson/checkpoint instead of restarting all training.
- Published editions may share the existing GitHub Pages host only with
  verified storage views, independent PWA identities and URL-scoped worker
  caches. Branches or URL paths alone do not isolate browser state. Test
  updates, imports, resets and offline launches with both editions present.

### Proposed implementation order and approval gates

1. **Correctness and control foundations.** Fix the verified purchase,
   save/import, destructive navigation, hit-target and teaching-truth
   failures. Withdraw/refund unwired purchases before recommending them.
   Keep this package separate from map and balance changes.
2. **Guided first-sector prototype.** Implement the learning record,
   returning-player migration, small core drill, class-aware curriculum,
   guided route and beginner offer pools. Make guidance optional. Review
   the playable first sector before committing to later-sector tuning.
3. **Pacing and decision clarity.** Meaningful ally timing, passive orb
   resolution, shorter routine banners, contextual rules, consistent
   mobile language, explicit outcome/persistence labels and useful recaps.
4. **Difficulty validation and rollout.** Compare all six classes with
   matched builds/seeds; tune measured transitions, then validate the full
   campaign and advanced modes. Publish only an approved, fully checked
   candidate. Keep the frozen v1.9.55 tag and branch unchanged.

Extend the existing seven check areas and shared fixtures, rather than
adding separate overlapping suites. Required new acceptance cases:

- Four-, five- and six-die hands at 360/390/414px, including large targets,
  handedness and text-size settings. Native drags must reach every die.
- Every offered permanent purchase changes its promised real gameplay
  caller. Refunds settle once across reloads and partial-write failures.
- Challenge/new-run cancellation preserves an existing checkpoint. Save
  and Return and Abandon have distinct, tested consequences.
- Failed import preserves recoverable data and reports failure. Quota
  pressure never silently deletes another named run.
- Each teaching outcome follows the actual action. Wrong drops, missed
  timing, assisted timing, skipping and death/retry remain valid paths.
- Every class can complete the guided route. Its actual ordinary attack
  rhythm is practised before training ends. Essential costs are taught
  before the player can pay them.
- Hidden/unintroduced mechanics cannot enter early offer or enemy pools.
  One new concept is introduced at a safe boundary, never during a QTE.
- A successful advertised ally boost changes damage; passive zero-damage
  orbs produce no defensive prompts. Full multi-hit animations and settled
  damage remain covered by the existing regression checks.
- Reload, backgrounding, worker updates, slot changes and returning-profile
  migration preserve learning, rules and pending choices without duplicate
  rewards. Refresh at REWARD restores the same offer and never repeats
  payout or the won fight. Existing later-sector saves remain on their
  original rules.
- Match runtime behavior to descriptions for currencies, statuses, class
  abilities, signatures, boss phases and advanced-mode requirements.
- Run the consolidated release gate on the final candidate, then inspect
  the public source and fresh/update/offline launches after publication.

Suggested human validation: five first-time players and two returning
players, then revise and repeat. Candidate goals are four of five novices
performing the core loop without a moderator, explaining that timing taps
work anywhere, identifying the next threat and distinguishing Sparks from
Fragments. Record misunderstanding, retries, optional help and time spent
deciding versus waiting. These are proposed targets, not measured results.
Include physical iPhone Safari and Android testing before rollout. Keep
all such observations local or manually supplied; add no telemetry.

## Buckets

Six buckets, ordered roughly by priority. Asset-bound work (Bucket 4)
runs in parallel because it's user-bound. Bucket 7 is the new Intel
Codex deep dive. see its dedicated section below.

### 1 · Perf & UX blockers ✅ CLOSED

Carryover from AUDIT_2026-05. Pre-implementation audit revealed
4 of 7 items were already shipped (the AUDIT carried stale claims
into the consolidation). The remaining 3 landed together as the
quick-wins ship. All seven items now resolved:

- ~~Reroll + end-turn button hit-zones too small at 360px~~
  shipped; 56×56 with translucent panel bg at `style.css:11053-11075`
- ✅ Music fade timers leak through state transitions
  shipped; `src/audio.js` fade intervals migrated to
  `Game.setLoop` with feature-detect fallback for boot-order races
- ~~Particle pool O(n) victim scan when full~~
  shipped in v1.8.0; round-robin O(1) eviction at
  `src/effects/particles.js:115-137`
- ✅ Combat-recap + turn-digest fire on `Perf.tier === 'low'`
  shipped; turn-digest had the gate already, combat-recap now
  matches at `src/services/combat-recap.js`
- ✅ Touch handlers blanket `passive: false`
  shipped; canvas touchstart at `src/game.js:1395` flipped to
  passive: true (handleInteraction does not preventDefault).
  Remaining 3 passive: false sites legitimately call
  preventDefault (intro dismiss, tutorialOverlay, pointermove
  drag) and stay non-passive.
- ~~Death-screen glitch animation filter causing repaints~~
  no-op; death title uses `text-shadow` keyframes (compositor
  safe), backdrop uses `background-position`. No `filter`
  animation found on the gameover overlay.
- ~~Save-quota exhaustion fails silently~~
  shipped; `_writeSaveRaw` at `src/game.js:10655-10735` already
  has auto-prune oldest non-active slot on first fail and
  floating-text toast on second fail.

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
