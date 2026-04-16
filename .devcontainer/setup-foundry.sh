#!/usr/bin/env bash
set -e

###############################################################################
# setup-foundry.sh
# Downloads, installs, and configures FoundryVTT v13 in a DevContainer.
#
# Required environment variables:
#   FOUNDRY_USERNAME    – foundryvtt.com account email
#   FOUNDRY_PASSWORD    – foundryvtt.com account password
#   FOUNDRY_LICENSE_KEY – FoundryVTT license key
#   FOUNDRY_BUILD       – FoundryVTT build number (e.g. 351)
#
# These are provided automatically in both environments:
#
#   Codespaces:    Set as Codespaces Secrets on the repo.
#                  (Repo → Settings → Secrets → Codespaces)
#
#   Local Docker:  Set as environment variables, then
#                  devcontainer.json remoteEnv forwards them into
#                  the container via ${localEnv:...}.
###############################################################################

INSTALL_DIR="$HOME/foundryvtt"
DATA_DIR="$HOME/foundrydata"
WORKSPACE="/workspaces/knoxrpg-hotd-website"
MODULE_ID="hotd-website-integration"
MODULE_SRC="$WORKSPACE/foundry/hotd-module"
MODULE_LINK="$DATA_DIR/Data/modules/$MODULE_ID"
WORLD_ID="hotd-dev"
SYSTEM_ID="dnd5e"

# ── Detect environment ───────────────────────────────────────────────────────
if [ "${CODESPACES:-}" = "true" ]; then
  RUNTIME_ENV="codespaces"
  echo "── Environment: GitHub Codespaces ──"
else
  RUNTIME_ENV="local"
  echo "── Environment: Local Docker DevContainer ──"
fi

# ── Pre-flight checks ───────────────────────────────────────────────────────
missing=()
[ -z "${FOUNDRY_USERNAME:-}" ]    && missing+=("FOUNDRY_USERNAME")
[ -z "${FOUNDRY_PASSWORD:-}" ]    && missing+=("FOUNDRY_PASSWORD")
[ -z "${FOUNDRY_LICENSE_KEY:-}" ] && missing+=("FOUNDRY_LICENSE_KEY")
[ -z "${FOUNDRY_BUILD:-}" ]       && missing+=("FOUNDRY_BUILD")

if [ ${#missing[@]} -ne 0 ]; then
  echo "WARNING: Missing environment variables: ${missing[*]}"
  if [ "$RUNTIME_ENV" = "codespaces" ]; then
    echo "   Set them at: Repo → Settings → Secrets and variables → Codespaces"
  else
    echo "   Export them in your shell or add to .devcontainer/.env"
  fi
  echo "   Skipping FoundryVTT installation."
  exit 0
fi

# ── Skip if already installed ────────────────────────────────────────────────
if [ -f "$INSTALL_DIR/resources/app/main.mjs" ]; then
  echo "✔  FoundryVTT already installed at $INSTALL_DIR"
else
  echo "── Authenticating with foundryvtt.com ──"
  COOKIE_FILE=$(mktemp)

  # Get CSRF token / session cookie
  curl -sSL -c "$COOKIE_FILE" "https://foundryvtt.com" > /dev/null

  # Extract CSRF token
  CSRF_TOKEN=$(grep csrftoken "$COOKIE_FILE" | awk '{print $NF}')

  # Log in
  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
    -b "$COOKIE_FILE" -c "$COOKIE_FILE" \
    -X POST "https://foundryvtt.com/auth/login/" \
    --data-urlencode "username=${FOUNDRY_USERNAME}" \
    --data-urlencode "password=${FOUNDRY_PASSWORD}" \
    --data-urlencode "csrfmiddlewaretoken=${CSRF_TOKEN}" \
    -H "Referer: https://foundryvtt.com" \
    -H "X-CSRFToken: ${CSRF_TOKEN}")

  if [ "$HTTP_CODE" -ne 302 ] && [ "$HTTP_CODE" -ge 400 ]; then
    echo "✖  Login failed (HTTP $HTTP_CODE). Check FOUNDRY_USERNAME / FOUNDRY_PASSWORD."
    rm -f "$COOKIE_FILE"
    exit 1
  fi
  echo "✔  Logged in to foundryvtt.com"

  # Download the Linux/NodeJS build
  echo "── Downloading FoundryVTT build ${FOUNDRY_BUILD} (linux) ──"
  curl -sSL -b "$COOKIE_FILE" -o /tmp/foundryvtt.zip \
    "https://foundryvtt.com/releases/download?build=${FOUNDRY_BUILD}&platform=linux"

  rm -f "$COOKIE_FILE"

  # Validate zip
  if ! unzip -tq /tmp/foundryvtt.zip > /dev/null 2>&1; then
    echo "✖  Downloaded file is not a valid zip. Check FOUNDRY_BUILD number."
    rm -f /tmp/foundryvtt.zip
    exit 1
  fi

  # Extract
  echo "── Installing to $INSTALL_DIR ──"
  mkdir -p "$INSTALL_DIR"
  unzip -qo /tmp/foundryvtt.zip -d "$INSTALL_DIR"
  rm -f /tmp/foundryvtt.zip
  echo "✔  FoundryVTT installed"
fi

# ── Data directory ────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR/Data/modules" "$DATA_DIR/Data/systems" "$DATA_DIR/Data/worlds"

# ── Write license key + admin password into options.json ─────────────────────
OPTIONS_FILE="$DATA_DIR/Config/options.json"
mkdir -p "$(dirname "$OPTIONS_FILE")"

if [ ! -f "$OPTIONS_FILE" ]; then
  SALT=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex').slice(0,64))")
  ADMIN_HASH=$(node -e "
    const crypto = require('crypto');
    const hash = crypto.pbkdf2Sync(process.argv[1], process.argv[2], 1000, 64, 'sha512').toString('hex');
    console.log(hash);
  " "$FOUNDRY_PASSWORD" "$SALT")

  cat > "$OPTIONS_FILE" <<EOF
{
  "port": 30000,
  "upnp": false,
  "fullscreen": false,
  "hostname": null,
  "localHostname": null,
  "routePrefix": null,
  "sslCert": null,
  "sslKey": null,
  "awsConfig": null,
  "dataPath": "$DATA_DIR",
  "compressStatic": true,
  "proxySSL": false,
  "proxyPort": null,
  "minifyStaticFiles": true,
  "updateChannel": "stable",
  "language": "en.core",
  "world": "$WORLD_ID",
  "serviceConfig": null,
  "licenseKey": "$FOUNDRY_LICENSE_KEY",
  "adminPassword": "$ADMIN_HASH",
  "passwordSalt": "$SALT"
}
EOF
  echo "✔  Created options.json with license key and admin password"
fi

# ── Start FoundryVTT ─────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR/logs"
echo "── Starting FoundryVTT on port 30000 ──"
nohup node "$INSTALL_DIR/resources/app/main.mjs" \
  --dataPath="$DATA_DIR" --port=30000 --host=0.0.0.0 \
  > "$DATA_DIR/logs/foundry-stdout.log" 2>&1 &
FVTT_PID=$!

echo "✔  FoundryVTT is starting (PID $FVTT_PID)"
echo "   Logs: $DATA_DIR/logs/foundry-stdout.log"

# ── Wait for Foundry to be ready ────────────────────────────────────────────
echo "── Waiting for FoundryVTT to be ready ──"
for i in $(seq 1 30); do
  if curl -sS -o /dev/null -w '' http://localhost:30000 2>/dev/null; then
    break
  fi
  sleep 1
done

# ── Activate the license key ────────────────────────────────────────────────
echo "── Activating license key ──"
LICENSE_RESP=$(curl -sS -o /dev/null -w "%{http_code}" \
  -X POST http://localhost:30000/license \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"enterKey\",\"licenseKey\":\"${FOUNDRY_LICENSE_KEY}\"}")

if [ "$LICENSE_RESP" = "302" ] || [ "$LICENSE_RESP" = "200" ]; then
  echo "✔  License activated"
else
  echo "⚠  License activation returned HTTP $LICENSE_RESP (may already be active)"
fi

# Accept the EULA
curl -sS -o /dev/null \
  -X POST http://localhost:30000/license \
  -H "Content-Type: application/json" \
  -d '{"action":"signAgreement","agreement":true}' 2>/dev/null || true

# ── Authenticate as admin ────────────────────────────────────────────────────
echo "── Authenticating as admin ──"
ADMIN_COOKIE=$(mktemp)
curl -sS -o /dev/null -c "$ADMIN_COOKIE" \
  -X POST http://localhost:30000/auth \
  -H "Content-Type: application/json" \
  -d "{\"action\":\"adminAuth\",\"adminPassword\":\"${FOUNDRY_PASSWORD}\"}"

# ── Install D&D 5e system ───────────────────────────────────────────────────
if [ ! -d "$DATA_DIR/Data/systems/$SYSTEM_ID" ]; then
  echo "── Installing D&D 5e system ──"
  curl -sS -b "$ADMIN_COOKIE" \
    -X POST http://localhost:30000/setup \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"installPackage\",\"type\":\"system\",\"id\":\"${SYSTEM_ID}\"}"

  for i in $(seq 1 60); do
    [ -f "$DATA_DIR/Data/systems/$SYSTEM_ID/system.json" ] && break
    sleep 1
  done
  echo "✔  D&D 5e system installed"
else
  echo "✔  D&D 5e system already installed"
fi

# ── Install required modules from config ─────────────────────────────────────
echo "── Installing required modules ──"

# Module IDs from foundry/config.yml
MODULES=("_dev-mode" "lib-wrapper" "socketlib" "tidy5e-sheet" "monk-active-tiles" "monks-enhanced-journal" "smalltime" "midi-qol" "dfreds-convenient-effects")

for mod in "${MODULES[@]}"; do
  if [ -d "$DATA_DIR/Data/modules/$mod" ]; then
    echo "  ✔  $mod already installed"
  else
    echo "  ── Installing $mod ──"
    curl -sS -b "$ADMIN_COOKIE" \
      -X POST http://localhost:30000/setup \
      -H "Content-Type: application/json" \
      -d "{\"action\":\"installPackage\",\"type\":\"module\",\"id\":\"${mod}\"}"
    # Wait for install
    for i in $(seq 1 30); do
      [ -d "$DATA_DIR/Data/modules/$mod" ] && break
      sleep 1
    done
    if [ -d "$DATA_DIR/Data/modules/$mod" ]; then
      echo "  ✔  $mod installed"
    else
      echo "  ⚠  $mod install may have failed"
    fi
  fi
done

# ── Symlink local HotD module for live development ──────────────────────────
if [ -d "$MODULE_SRC" ]; then
  if [ ! -L "$MODULE_LINK" ]; then
    rm -rf "$MODULE_LINK"
    ln -sfn "$MODULE_SRC" "$MODULE_LINK"
    echo "✔  Local module symlinked: $MODULE_LINK → $MODULE_SRC"
  else
    echo "✔  Module symlink already exists"
  fi
else
  echo "⚠  Local module source not found at $MODULE_SRC — skipping symlink"
fi

# ── Create dev world ────────────────────────────────────────────────────────
if [ ! -d "$DATA_DIR/Data/worlds/$WORLD_ID" ]; then
  echo "── Creating $WORLD_ID world ──"
  curl -sS -b "$ADMIN_COOKIE" \
    -X POST http://localhost:30000/setup \
    -H "Content-Type: application/json" \
    -d "{\"action\":\"createWorld\",\"id\":\"$WORLD_ID\",\"title\":\"Halls of the Damned — Dev World\",\"system\":\"$SYSTEM_ID\",\"background\":\"\",\"nextSession\":null,\"description\":\"Development world for HotD website integration module\"}" > /dev/null
  echo "✔  World '$WORLD_ID' created (system: $SYSTEM_ID)"
  WORLD_CREATED=1
else
  echo "✔  World '$WORLD_ID' already exists"
  WORLD_CREATED=0
fi

rm -f "$ADMIN_COOKIE"

# ── Configure world data (module settings, etc.) ────────────────────────────
if [ "$WORLD_CREATED" = "1" ]; then
  echo "── Configuring world data ──"
  kill "$FVTT_PID" 2>/dev/null || true
  sleep 2

  node "$WORKSPACE/.devcontainer/configure-world.mjs"

  echo "── Restarting FoundryVTT ──"
  nohup node "$INSTALL_DIR/resources/app/main.mjs" \
    --dataPath="$DATA_DIR" --port=30000 --host=0.0.0.0 \
    > "$DATA_DIR/logs/foundry-stdout.log" 2>&1 &
  echo "✔  FoundryVTT restarted (PID $!)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  FoundryVTT is running on port 30000"
echo "  HotD Website dev server on port 3000 (run: npm run dev)"
echo "═══════════════════════════════════════════════════════════"
