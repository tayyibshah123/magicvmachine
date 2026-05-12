#!/usr/bin/env bash
# scripts/codex-setup.sh
#
# Container bootstrap for OpenAI Codex's cloud sandbox.
#
# Codex runs this once when the environment is created (it has internet
# access at that point) and then disables network for the actual agent
# turns. Anything the agent needs at runtime — node_modules, headless
# browser, etc. — must be installed here.
#
# Paste this script's path into the "Setup script" field when creating
# the Codex environment for this repo:
#
#   bash scripts/codex-setup.sh
#
# Keep it idempotent and fast (<2 min).

set -euo pipefail

echo "[codex-setup] node: $(node --version)"
echo "[codex-setup] npm:  $(npm --version)"

# Install dev deps so vitest is on PATH. We use `npm ci` when a lockfile
# is present (deterministic) and fall back to `npm install` if a future
# branch drops it.
if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund
else
    npm install --no-audit --no-fund
fi

echo "[codex-setup] running vitest once to warm the cache and verify the env…"
npx vitest run --reporter=dot

echo "[codex-setup] done. Ready for agent turns."
