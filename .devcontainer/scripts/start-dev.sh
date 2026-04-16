#!/usr/bin/env bash
# .devcontainer/scripts/start-dev.sh
#
# Starts both the HotD website dev server and FoundryVTT side-by-side.
# Called from postStartCommand or run manually.

set -euo pipefail

WORKSPACE="/workspaces/knoxrpg-hotd-website"

echo "═══════════════════════════════════════════════════════════"
echo "  KnoxRPG HotD — Dev Environment Startup"
echo "═══════════════════════════════════════════════════════════"

# ── 1. Start FoundryVTT (if setup was successful) ───────────────────────────
INSTALL_DIR="$HOME/foundryvtt"
DATA_DIR="$HOME/foundrydata"

if [ -f "$INSTALL_DIR/resources/app/main.mjs" ]; then
  # Check if already running
  if pgrep -f "foundryvtt/resources/app/main.mjs" > /dev/null 2>&1; then
    echo "✔  FoundryVTT already running"
  else
    echo "── Starting FoundryVTT on port 30000 ──"
    mkdir -p "$DATA_DIR/logs"
    nohup node "$INSTALL_DIR/resources/app/main.mjs" \
      --dataPath="$DATA_DIR" --port=30000 --host=0.0.0.0 \
      > "$DATA_DIR/logs/foundry-stdout.log" 2>&1 &
    echo "✔  FoundryVTT started (PID $!)"
  fi
else
  echo "⚠  FoundryVTT not installed — skipping (set FOUNDRY_* secrets to enable)"
fi

# ── 2. Start HotD website dev server ────────────────────────────────────────
echo "── Starting HotD website on port 3000 ──"
cd "$WORKSPACE/src"
node server.js &
echo "✔  HotD website started (PID $!)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  HotD Website  → http://localhost:3000"
echo "  FoundryVTT    → http://localhost:30000"
echo "═══════════════════════════════════════════════════════════"
