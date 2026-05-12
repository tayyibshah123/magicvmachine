# Continuing Magic v Machine in OpenAI Codex

This is the **operator** guide: the steps the human (you, Taz) follow to
hand the project off to OpenAI Codex and have it pick up real work.

> The companion file `AGENTS.md` at the repo root is what Codex itself
> reads. You don't need to copy it anywhere — Codex auto-loads it.

---

## 1. What "OpenAI Codex" is in 2026

Two surfaces. You will mostly use the first:

- **Codex Cloud** — `https://chatgpt.com/codex`. A long-running agent
  that clones your GitHub repo into a sandboxed container, runs a setup
  script you provide, then makes commits and opens PRs from a branch.
  Internet is allowed during setup, then disabled for the agent turns.
- **Codex CLI** — `npm i -g @openai/codex` (or `brew install codex`).
  Runs locally in your terminal, edits files in-place, can be pointed
  at the same repo. Useful for ad-hoc tweaks; less hands-off.

Both honour `AGENTS.md`. This repo is set up for either.

---

## 2. One-time setup (~5 min)

### a. Confirm the repo state

```powershell
git status                      # should be clean
git log --oneline -3            # confirm you're at v1.9.49 or newer
npm test                        # 98 passing — must be green
```

### b. Push the Codex onboarding files

This commit (the one shipping with this guide) adds:

- `AGENTS.md` — repo-root onboarding contract Codex reads automatically.
- `scripts/codex-setup.sh` — container bootstrap (`npm ci` + warm vitest).
- `docs/CODEX.md` — this file.

If the commit hasn't happened yet, do it now and push:

```powershell
git add AGENTS.md scripts/codex-setup.sh docs/CODEX.md
git commit -m "Drop Bay v1.9.50 — Codex onboarding (AGENTS.md + setup script)"
git push origin main
```

Codex clones from `origin/main`, so the onboarding files **must** be
pushed before you create the environment.

### c. Create the Codex Cloud environment

1. Go to `https://chatgpt.com/codex`.
2. Click **Environments → New environment**.
3. Select **GitHub** and authorise the `magicvmachine` repo (org
   `tayyibshah123`).
4. Fill in the form:

   | Field | Value |
   |---|---|
   | Repository | `tayyibshah123/magicvmachine` |
   | Default branch | `main` |
   | Container image | `Universal` (Node 20+ included) |
   | Setup script | `bash scripts/codex-setup.sh` |
   | Setup timeout | `300s` (default is fine) |
   | Agent internet access | **Off** (default) |
   | Secrets | none — the project has no API keys |

5. Click **Create**. Codex spins up the container, runs the setup
   script, and verifies vitest passes. First run takes ~2 min; later
   runs are cached.

### d. (Optional) Install the Codex CLI for ad-hoc edits

```powershell
npm i -g @openai/codex
codex login                     # opens browser for OAuth
```

Then from the repo root:

```powershell
codex "fix the issue in src/game.js where the hint toast clips at 360px"
```

The CLI obeys the same `AGENTS.md`. It edits files in place, so commit
locally when you're happy.

---

## 3. The bootstrap prompt

This is what you paste into Codex Cloud on its first task. It tells
Codex who it is, what it's working on, and how to ship.

**Copy from here ↓**

```
You are the autonomous engineer continuing development of Magic v
Machine, a cyberpunk roguelite dice-builder shipping as a PWA + Android
Capacitor wrapper. The repo's AGENTS.md is your contract — read it
first and treat it as load-bearing.

Repo: tayyibshah123/magicvmachine, branch main, currently at v1.9.49.

Your default loop for every task:

1. Open and re-read AGENTS.md. Then open ROADMAP.md and pick the
   highest-priority OPEN item from the lowest-numbered bucket. Skip
   Bucket 4 (audio assets are user-procured) and Bucket 10 (post-launch
   deferred). Bucket 1 is closed; Bucket 2 (combat balance) is the
   active front-line.

2. State in one sentence which item you picked and why, then start.

3. Make the smallest verifiable change that closes the item. Do not
   refactor src/game.js wholesale — it is intentionally a 32k-line
   monolith. Touch only what the task needs.

4. Follow every convention in AGENTS.md:
   - Reduced motion is combat-scoped only.
   - Long-lived timers use Game.setTimer / Game.setLoop.
   - Fixed-position modals reparent to <body>.
   - Save-schema changes bump SAVE_SCHEMA_VERSION + add a migration +
     add a test.
   - localStorage access is try/catch'd.
   - Entity.takeDamage declares actualDmg before any branch reading it.
   - The visible "ALPHA V1" stamp in the menu does NOT change.
   - APP_VERSION in src/version.js bumps every shippable change; the
     CACHE_NAME string in service-worker.js bumps to match.

5. Run `npm test`. All 98 tests must stay green. If you change
   behaviour covered by a test, update the test in the same commit and
   explain why in the commit body.

6. Stage files explicitly with `git add <path>` — never `-A` or `.`.
   Do not commit www/, node_modules/, or anything in .gitignore.

7. Commit in the existing style:

        Drop Bay v<NEW_VERSION> — <one-line summary>

        <Optional 1–3 sentence body explaining the why.>

   Then push with `git push origin main`. There is no PR workflow.

8. Reply with: the version you shipped, the bucket/item you closed,
   the test count, and a one-line note on anything the human should
   manually QA (visual changes, audio, mobile-only layouts).

Hard rules:

- Do not add frameworks, TypeScript, bundlers, or CSS preprocessors.
- Do not add network calls, telemetry, or analytics. The game is fully
  offline by design.
- Do not amend or rewrite published commits. Always create new commits;
  the operator reloads working copies from origin/main, so amending
  breaks their pull.
- Do not skip git hooks, force-push, or bypass test failures.
- Do not create new *.md files unless explicitly asked. ROADMAP.md
  (live tracker) and CONTRIBUTING.md (conventions) are the canonical
  homes; extend them instead of forking new docs.

If a task is ambiguous, ship the most conservative interpretation and
flag the ambiguity in your reply. Do NOT pause to ask — assume the
operator is offline and will redirect on the next turn.

Start now: read AGENTS.md, then ROADMAP.md, then state your pick and go.
```

**↑ Copy to here.**

Tip: in Codex Cloud you can save this as a **task template** so you
don't paste it every time.

---

## 4. Day-to-day workflow

After the bootstrap is done, the loop is short:

1. **Trigger a task.** Either:
   - In Codex Cloud, open the environment and type a one-line task
     (e.g. "ship the S2→S3 enemy mean HP cut from ROADMAP bucket 2"),
     or just type `continue` and let it pick from the roadmap.
   - From the CLI: `codex "<task>"` from the repo root.

2. **Wait.** Cloud tasks take ~3–15 min depending on scope. You'll get
   an email/notification when the agent posts results.

3. **Pull.** Codex pushes directly to `main`, so on your dev box:

   ```powershell
   git pull --ff-only origin main
   ```

   If `pull` ever complains, **do not force**. Investigate. The most
   common cause is local uncommitted edits — stash them first.

4. **QA.** Run `npm test` locally; if Codex touched UI, open the build
   in a browser and verify the change visually. For mobile/Android
   changes, do `npm run android:sync` and run on the device.

5. **Loop.** Send the next task.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Codex says "no setup script found" | `scripts/codex-setup.sh` not on `origin/main` | Push the onboarding commit, recreate the env |
| Setup script fails on `npm ci` | `package-lock.json` drifted | Run `npm install` locally and push the new lockfile |
| Tests pass locally, fail in Codex | jsdom + Node version skew | Pin Node 20 in the Codex env image; do not pin in `package.json` (mobile build needs flexibility) |
| Codex commits but no push | Token scope missing `repo:write` | Reauthorise the GitHub app on the environment |
| Agent loops on the same file | Task too vague or roadmap item already shipped | Mark the item as shipped in `ROADMAP.md`, re-task |
| `service-worker.js` cache stale on phone | `CACHE_NAME` didn't bump | Diff `src/version.js` against `service-worker.js`; they must match |

---

## 6. What to expect — and what to never delegate

Codex is good at: bug fixes scoped to a few files, balance-number
tweaks driven by ROADMAP bucket 2, test additions, lore content
generation following the existing `intel-codex.js` shape, CSS polish.

Codex is bad at: visual design judgement (you have stronger taste than
it does on this project), Android-specific timing bugs (it can't run
the APK), audio asset creation (Bucket 4 is yours), anything requiring
playtesting through a full run.

**Never delegate**: distribution decisions (Bucket 10), the
ALPHA-V1-stamp policy, Android keystore handling, decisions about
backend / leaderboards, anything that touches `.env` or secrets.

---

## 7. Reading order for a fresh handoff

If you ever need to brief a different agent / contributor / future you:

1. `AGENTS.md` (5 min) — the contract.
2. `ROADMAP.md` (10 min) — what's open and what's shipped.
3. `CONTRIBUTING.md` (10 min) — full convention rationale.
4. `src/version.js` (10 sec) — confirm current ship.
5. `src/game.js` — skim the section headers. Do not read top-to-bottom.

That's it. The other 32k lines are dive-on-demand.
