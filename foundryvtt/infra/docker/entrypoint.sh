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

# On first boot, FoundryVTT still shows the "License Key Activation" page even
# when the key is passed as a flag — the license must be *signed* (writes
# Config/license.json). Sign it automatically: wait for the server to listen,
# then POST the key to /license. Runs as a background subshell so the exec'd
# node process stays PID 1's child (proper tini signal handling). No-op once
# license.json exists.
if [ -n "$FOUNDRY_LICENSE_KEY" ] && [ ! -f "$DATA_PATH/Config/license.json" ]; then
  (
    # Wait up to ~2 min for the server to accept requests.
    i=0
    while [ "$i" -lt 60 ]; do
      if node -e 'fetch("http://localhost:30000/api/status").then(()=>process.exit(0)).catch(()=>process.exit(1))' 2>/dev/null; then
        break
      fi
      i=$((i + 1))
      sleep 2
    done
    # Sign the license (idempotent; retry a few times for validation lag).
    j=0
    while [ "$j" -lt 5 ] && [ ! -f "$DATA_PATH/Config/license.json" ]; do
      node -e '
        const key = process.env.FOUNDRY_LICENSE_KEY || "";
        const body = new URLSearchParams({ licenseKey: key, accept: "on", action: "signLicense" }).toString();
        fetch("http://localhost:30000/license", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "manual" })
          .then((r) => console.log("[entrypoint] license sign ->", r.status))
          .catch((e) => console.error("[entrypoint] license sign error:", e.message));
      ' 2>&1 || true
      j=$((j + 1))
      sleep 3
    done
  ) &
fi

exec node /home/foundry/foundryvtt/main.js "$@"
