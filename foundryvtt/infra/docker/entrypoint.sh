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
# proxySSL/proxyPort tell Foundry it sits behind the TLS-terminating ingress so
# clients hold a real WebSocket instead of falling back to slow long-polling.
OPTIONS_FILE="$DATA_PATH/Config/options.json"
if [ ! -s "$OPTIONS_FILE" ]; then
  cat > "$OPTIONS_FILE" <<EOF
{
  "port": 30000,
  "upnp": false,
  "dataPath": "$DATA_PATH",
  "compressStatic": true,
  "compressSocket": true,
  "proxySSL": true,
  "proxyPort": 443,
  "hotReload": false
}
EOF
fi

# Enforce the reverse-proxy settings on every boot (existing data dirs may have
# them unset, which causes sluggish long-polling fallback for web clients).
if [ -f "$OPTIONS_FILE" ] && command -v node >/dev/null 2>&1; then
  node -e '
    const fs = require("fs"); const f = process.argv[1];
    try {
      const o = JSON.parse(fs.readFileSync(f, "utf8"));
      if (o.proxySSL !== true || o.proxyPort !== 443) {
        o.proxySSL = true; o.proxyPort = 443;
        fs.writeFileSync(f, JSON.stringify(o, null, 2));
        console.log("[entrypoint] set proxySSL=true proxyPort=443");
      }
    } catch (e) {}
  ' "$OPTIONS_FILE" 2>/dev/null || true
fi

# Assemble launch args. Secrets are passed as flags only when present.
set -- --dataPath="$DATA_PATH" --port=30000 --noupnp
[ -n "$FOUNDRY_ADMIN_KEY" ] && set -- "$@" --adminPassword="$FOUNDRY_ADMIN_KEY"
[ -n "$FOUNDRY_LICENSE_KEY" ] && set -- "$@" --licenseKey="$FOUNDRY_LICENSE_KEY"

# FoundryVTT binds its signed license (Config/license.json "host") to the
# hostname. If the pod was recreated under a different hostname, the signature
# no longer verifies. Drop a stale license.json so it re-signs for this host.
HOSTNAME_NOW="$(cat /etc/hostname 2>/dev/null | tr -d '[:space:]')"
LIC="$DATA_PATH/Config/license.json"
if [ -n "$HOSTNAME_NOW" ] && [ -f "$LIC" ] && ! grep -q "\"$HOSTNAME_NOW\"" "$LIC" 2>/dev/null; then
  echo "[entrypoint] license.json host mismatch ($HOSTNAME_NOW); removing to re-sign"
  rm -f "$LIC"
fi

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
    # Sign the license until the activation page clears. Foundry needs more
    # than one signLicense POST (validation lag), so loop and stop only once
    # GET / no longer redirects to /license.
    j=0
    while [ "$j" -lt 6 ]; do
      node -e '
        const key = process.env.FOUNDRY_LICENSE_KEY || "";
        const body = new URLSearchParams({ licenseKey: key, accept: "on", action: "signLicense" }).toString();
        fetch("http://localhost:30000/license", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, redirect: "manual" })
          .then((r) => console.log("[entrypoint] license sign ->", r.status))
          .catch((e) => console.error("[entrypoint] license sign error:", e.message));
      ' 2>&1 || true
      j=$((j + 1))
      if node -e 'fetch("http://localhost:30000/",{redirect:"manual"}).then(r=>{const l=r.headers.get("location")||"";process.exit(/\/license/.test(l)?1:0)}).catch(()=>process.exit(1))' 2>/dev/null; then
        echo "[entrypoint] license active"
        break
      fi
      sleep 3
    done
  ) &
fi

exec node /home/foundry/foundryvtt/main.js "$@"
