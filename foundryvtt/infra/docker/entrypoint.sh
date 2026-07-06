#!/bin/sh
# ==============================================================================
# FoundryVTT container entrypoint (Halls of the Damned).
# Prepares the persistent /data volume and launches FoundryVTT directly under
# tini. No PM2/companion: Kubernetes liveness/readiness probes handle restarts.
#
# Env (injected by the Helm chart):
#   FOUNDRY_LICENSE_KEY  — Foundry license (from the foundry-secrets K8s Secret)
#   FOUNDRY_ADMIN_KEY    — admin/setup password (from the same Secret)
#   FOUNDRY_DATA_PATH    — data dir (default /data, the mounted PVC)
# ==============================================================================
set -e

DATA_PATH="${FOUNDRY_DATA_PATH:-/data}"

# PVC mounts empty on first run; create the standard Foundry layout.
mkdir -p "$DATA_PATH/Config" "$DATA_PATH/Data" "$DATA_PATH/Logs"

# Clear stale world/config locks left by an unclean shutdown (pod kill).
find "$DATA_PATH" -name '*.lock' -type f -delete 2>/dev/null || true

# Seed a minimal options.json on first boot; Foundry extends it thereafter.
OPTIONS_FILE="$DATA_PATH/Config/options.json"
if [ ! -s "$OPTIONS_FILE" ]; then
  cat > "$OPTIONS_FILE" <<EOF
{
  "port": 30000,
  "upnp": false,
  "dataPath": "$DATA_PATH",
  "compressStatic": true,
  "compressSocket": true,
  "hotReload": false
}
EOF
fi

# Assemble launch args. Secrets are passed as flags only when present.
set -- --dataPath="$DATA_PATH" --port=30000 --noupnp
[ -n "$FOUNDRY_ADMIN_KEY" ] && set -- "$@" --adminPassword="$FOUNDRY_ADMIN_KEY"
[ -n "$FOUNDRY_LICENSE_KEY" ] && set -- "$@" --licenseKey="$FOUNDRY_LICENSE_KEY"

exec node /home/foundry/foundryvtt/main.js "$@"
