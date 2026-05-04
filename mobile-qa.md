# Mobile QA Checklist

> Day-2 deliverable from `WEEKLY_ROADMAP.md`. Walks the four target widths through every gameplay screen with concrete pass/fail criteria, then collects screenshots so future regressions are caught against a known-good baseline.

## How to run this

Open the deployed build in **Chrome** (desktop), open DevTools (F12), enable device emulation (Ctrl/Cmd+Shift+M), and step through each row using the four custom dimensions below. The PWA layout is locked to a 9:16 portrait via `#game-container { max-width: 432px; aspect-ratio: 9/16 }`, so on wider devtools widths you'll see black letterboxing — that's expected and not a failure.

For the **iOS gesture-zone collision check** specifically, you must test on a real iPhone (DevTools doesn't simulate the home indicator). Falling back to "the bottom 34px of any pinned button must be unobstructed" is acceptable as a static check.

### Target dimensions

| Profile | DevTools size  | Real device example       | Notes |
|---------|----------------|---------------------------|-------|
| Narrow  | 360 × 800      | Samsung Galaxy A-series   | Tightest portrait commonly shipped |
| iPhone  | 390 × 844      | iPhone 12 / 13 / 14       | Typical iOS portrait |
| Plus    | 414 × 896      | iPhone XR / 11 / Plus     | Wider iOS portrait |
| Tablet  | 768 × 1024     | iPad portrait             | Confirms aspect-ratio cap holds |

---

## Per-screen checklist

For every cell, mark ✅ pass / ⚠️ partial / ❌ fail. Add a one-line note when not ✅.

### A — Main menu (`#screen-menu`)

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| Title fits on one line, no clip | ☐ | ☐ | ☐ | ☐ |
| Class-select tile grid wraps cleanly | ☐ | ☐ | ☐ | ☐ |
| Settings + Intel buttons reachable with one thumb | ☐ | ☐ | ☐ | ☐ |
| FPS overlay (when on) doesn't cover any tappable element | ☐ | ☐ | ☐ | ☐ |

### B — Combat (`STATE.COMBAT`)

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| Sector / turn / fragments chip readable, doesn't overlap player health | ☐ | ☐ | ☐ | ☐ |
| Intent preview card top-anchored, text wraps not clipped | ☐ | ☐ | ☐ | ☐ |
| Dice tray fits 4 dice without overflow | ☐ | ☐ | ☐ | ☐ |
| Reroll button (left) and End-Turn button (right) don't collide with dice | ☐ | ☐ | ☐ | ☐ |
| Bottom CTAs sit above iOS gesture zone (real-device check) | ☐ | ☐ | ☐ | ☐ |
| Drag a die from tray onto enemy — drop target ring visible | ☐ | ☐ | ☐ | ☐ |
| Combat log button surfaces panel; panel scrolls within viewport | ☐ | ☐ | ☐ | ☐ |

### C — Reward screen (post-combat)

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| 3 reward cards visible without horizontal scroll | ☐ | ☐ | ☐ | ☐ |
| Card names + descriptions don't get cut off | ☐ | ☐ | ☐ | ☐ |
| SKIP button reachable | ☐ | ☐ | ☐ | ☐ |
| Tap-to-pick triggers reward-flyer animation cleanly | ☐ | ☐ | ☐ | ☐ |

### D — Map screen (sector node graph)

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| All 8 layers visible, no scroll required | ☐ | ☐ | ☐ | ☐ |
| Player position pip clearly visible | ☐ | ☐ | ☐ | ☐ |
| Long-press a node — tooltip appears on the right side | ☐ | ☐ | ☐ | ☐ |
| Boss icon distinguishable from regular combat | ☐ | ☐ | ☐ | ☐ |

### E — Settings modal (`#modal-settings`)

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| Modal fits within viewport with URL bar visible (mobile Safari)| ☐ | ☐ | ☐ | ☐ |
| Modal fits within viewport with URL bar hidden | ☐ | ☐ | ☐ | ☐ |
| Tab indicator slides correctly on tab swap | ☐ | ☐ | ☐ | ☐ |
| Long settings rows scroll inside modal, body doesn't scroll behind | ☐ | ☐ | ☐ | ☐ |
| **Show FPS overlay (dev)** toggle visible & tappable | ☐ | ☐ | ☐ | ☐ |
| Close button (X) reachable without scrolling | ☐ | ☐ | ☐ | ☐ |

### F — Sector intro overlay

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| `SECTOR N`, name, mechanic blurb all visible | ☐ | ☐ | ☐ | ☐ |
| Holds for ≥1.5s of fully-readable time | ☐ | ☐ | ☐ | ☐ |
| Sweep underline animates fully across | ☐ | ☐ | ☐ | ☐ |

### G — Death / autopsy / share screens

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| Game-over screen content fits viewport | ☐ | ☐ | ☐ | ☐ |
| RESTART + MAIN MENU buttons reachable | ☐ | ☐ | ☐ | ☐ |
| Share PNG modal (when implemented Day 5) sized for portrait | ☐ | ☐ | ☐ | ☐ |

### H — Loadout / Custom Run / Sanctuary modals

| Check | 360 | 390 | 414 | iPad |
|-------|-----|-----|-----|------|
| Loadout panel fits viewport (was `max-height: 92dvh` → now safe-area aware) | ☐ | ☐ | ☐ | ☐ |
| Custom Run modifier tiles stack legibly | ☐ | ☐ | ☐ | ☐ |
| NPC content panel scrolls inside, not page | ☐ | ☐ | ☐ | ☐ |

---

## Day 2 fixes already applied (v1.3.7)

- **`.skeleton-grid` and `.hex-result-card`**: hardcoded `max-width: 360px` → `min(360px, calc(100% - 16px))` so the card always has 8px of breathing room from the viewport edge on a 360-wide phone.
- **All 5 modal shells previously using `max-height: 92dvh`**: now `calc(92dvh - safe-area-inset-top - safe-area-inset-bottom)`. Was overflowing past notched-iPhone gesture zones; close buttons could scroll out of reach with the URL bar visible.
- **Settings modal `max-height`**: was `calc(100vh - space-12)` → now `calc(100dvh - safe-area-top - safe-area-bottom - space-8)`. `100vh` referred to the *expanded* viewport on mobile Safari; the modal could clip below the URL bar.
- **Mobile `.bottom-controls` padding override**: was hard `76px` → `max(76px, 76px + safe-area-inset-bottom)` so the dice tray sits above the iOS home-indicator gesture zone.

---

## Known non-issues (do not flag)

- **Aesthetic black letterboxing on devtools widths > 432px** — game-container is intentionally locked to a 9:16 portrait shape. Wider viewports show the canvas centred with black bars. This is the design choice, not a bug.
- **`@media all` block at style.css:8823 mobile overrides apply on desktop too** — intentional. The game's `#game-container` is phone-sized on every device, so what looks like a "mobile-only" rule is the canonical layout.
- **Reward card mobile override fires at all widths** — same reason as above. The override applies inside the phone-sized game-container.

---

## Sign-off

When every row is ✅ across all four widths, paste this block into the WEEKLY_ROADMAP.md Day 2 completion notes and move to Day 3:

```
Tested at: 360 / 390 / 414 / 768
Browser:
Date:
Notes:
```
