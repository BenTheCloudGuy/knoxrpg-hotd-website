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

# ── 0. Wait for PostgreSQL ──────────────────────────────────────────────────
echo "── Waiting for PostgreSQL ──"
for i in $(seq 1 30); do
  if pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-cortana}" -q 2>/dev/null; then
    echo "✔  PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "⚠  PostgreSQL not ready after 30s — website may fail to connect"
  fi
  sleep 1
done

# ── 0a. Azure CLI auto-login (service principal) ────────────────────────────
# Uses AZURE_TENANT, AZURE_CLIENT_ID, AZURE_SECRET from env (matches cortana).
# Set these as Codespaces secrets or export on your host for local Docker.
if az account show &>/dev/null 2>&1; then
  echo "✔  Azure CLI already logged in ($(az account show --query user.name -o tsv 2>/dev/null))"
elif [[ -n "${AZURE_TENANT:-}" && -n "${AZURE_CLIENT_ID:-}" && -n "${AZURE_SECRET:-}" ]]; then
  echo "── Logging into Azure CLI (service principal) ──"
  if az login --service-principal \
    --tenant "$AZURE_TENANT" \
    --username "$AZURE_CLIENT_ID" \
    --password "$AZURE_SECRET" \
    --only-show-errors &>/dev/null; then
    echo "✔  Azure CLI logged in as $(az account show --query user.name -o tsv 2>/dev/null)"
  else
    echo "⚠  Azure CLI login failed — check AZURE_TENANT / AZURE_CLIENT_ID / AZURE_SECRET"
  fi
else
  echo "⚠  Azure CLI: no credentials — set AZURE_TENANT, AZURE_CLIENT_ID, AZURE_SECRET"
  echo "   DB auto-seed from Azure will be skipped"
fi

# ── 0b. Auto-seed from Azure backup (first run only) ────────────────────────
# If the database has no tables yet (fresh volume), try to download and restore
# the latest nightly backup from Azure Storage. Requires 'az login' or a
# service principal. Set HOTD_SKIP_DB_SEED=1 to disable.
if [[ "${HOTD_SKIP_DB_SEED:-}" != "1" ]]; then
  TABLE_COUNT=$(PGPASSWORD="${PGPASSWORD:-cortana_dev}" psql \
    -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-cortana}" \
    -d "${PGDATABASE:-dnd_website}" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null || echo "0")

  if [[ "$TABLE_COUNT" -le 1 ]]; then
    echo "── Database looks empty ($TABLE_COUNT tables) — attempting Azure seed ──"
    if command -v az &>/dev/null && az account show &>/dev/null 2>&1; then
      bash "$WORKSPACE/.devcontainer/scripts/db-restore.sh" download || \
        echo "⚠  Azure seed failed — run 'db-restore.sh download' manually after 'az login'"
    else
      echo "⚠  Not logged into Azure CLI — skipping auto-seed"
      echo "   Run: az login && bash .devcontainer/scripts/db-restore.sh download"
    fi
  else
    echo "✔  Database has $TABLE_COUNT tables — skipping auto-seed"
  fi
fi

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
