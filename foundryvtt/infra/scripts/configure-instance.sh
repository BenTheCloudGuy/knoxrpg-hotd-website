#!/usr/bin/env bash
# ==============================================================================
# configure-instance.sh — install the game system + modules and create the
# campaign world on the live hotd-foundry instance, headlessly.
#
# Idempotent + re-runnable. Uses FoundryVTT's setup HTTP API (POST /auth,
# POST /setup) and writes module activation directly into the world's settings
# LevelDB (via classic-level bundled in the running pod).
#
# Runs on cortana (needs microk8s kubectl + az). The Foundry admin password is
# read from Azure Key Vault (foundry-admin-key). The instance must be reachable
# on its NodePort and have NO world active (setup mode).
#
# What it configures (all pinned to Foundry v13.x — the "latest" of several of
# these is v14-only, so versions are pinned deliberately):
#   System : dnd5e            release-5.2.5   (Verified 13.351)
#   Module : touch-vtt        v2.3.13         (Verified 13.351)
#   Module : dice-so-nice     5.2.5           (Verified 13.351)
#   Module : monks-common-display 13.01       (Verified 13)   <- 14.01 is v14-only
#   World  : halls-of-the-damned "Halls of the Damned" (dnd5e)
#
# NOT installed here: MaterialDeck. The v13-capable release (v2.2.0) is premium
# and Patreon-gated; it must be installed via Foundry's module browser after
# linking a Material Foundry Patreon account, then enabled alongside
# materialdeck-dnd5e. (The public "latest" GitHub release is a stale v11 build.)
# ==============================================================================
set -euo pipefail

NAMESPACE="${NAMESPACE:-foundryvtt-hotd}"
KEYVAULT="${KEYVAULT:-cloudgeek-cus-keyvault}"
NODEPORT="${NODEPORT:-30002}"
BASE="${BASE:-http://localhost:${NODEPORT}}"
WORLD_ID="${WORLD_ID:-halls-of-the-damned}"
WORLD_TITLE="${WORLD_TITLE:-Halls of the Damned}"
SYSTEM_ID="dnd5e"

SYSTEM_MANIFEST="https://github.com/foundryvtt/dnd5e/releases/download/release-5.2.5/system.json"
declare -A MODULE_MANIFESTS=(
  ["touch-vtt"]="https://github.com/Aioros/touch-vtt/releases/download/v2.3.13/module.json"
  ["dice-so-nice"]="https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/raw/5.2.5/module/module.json"
  ["monks-common-display"]="https://raw.githubusercontent.com/ironmonk108/monks-common-display/13.01/module.json"
)
ENABLE_MODULES=("touch-vtt" "dice-so-nice" "monks-common-display")

log() { echo "[$(date -Is)] $*"; }
kc() { microk8s kubectl "$@"; }

PVC="$(kc get pv "$(kc get pvc foundry-data -n "$NAMESPACE" -o jsonpath='{.spec.volumeName}')" -o jsonpath='{.spec.hostPath.path}')"
POD="$(kc get pod -n "$NAMESPACE" -l app=foundryvtt -o jsonpath='{.items[0].metadata.name}')"
[ -n "$PVC" ] && [ -n "$POD" ] || { echo "ERROR: could not resolve PVC/pod" >&2; exit 1; }
log "PVC=$PVC"
log "pod=$POD"

STATUS="$(curl -s -m 10 "$BASE/api/status" || true)"
log "status: $STATUS"
case "$STATUS" in *'"active":false'*) ;; *) echo "ERROR: a world is active (or instance unreachable); need setup mode." >&2; exit 1;; esac

ADMIN="$(az keyvault secret show --vault-name "$KEYVAULT" --name foundry-admin-key --query value -o tsv)"
CJ="$(mktemp)"; trap 'rm -f "$CJ"' EXIT
curl -s -o /dev/null -c "$CJ" -X POST "$BASE/auth" -H "Content-Type: application/json" \
  -d "{\"action\":\"adminAuth\",\"adminPassword\":\"${ADMIN}\"}"

install_pkg() { # type id manifest destdir
  local type="$1" id="$2" manifest="$3" dest="$4"
  if [ -f "$PVC/Data/$dest/$id/${type}.json" ]; then log "$type $id already installed"; return; fi
  log "installing $type $id"
  curl -s -m 120 -b "$CJ" -X POST "$BASE/setup" -H "Content-Type: application/json" \
    -d "{\"action\":\"installPackage\",\"type\":\"${type}\",\"id\":\"${id}\",\"manifest\":\"${manifest}\"}" >/dev/null
  local i; for i in $(seq 1 60); do [ -f "$PVC/Data/$dest/$id/${type}.json" ] && break; sleep 2; done
  [ -f "$PVC/Data/$dest/$id/${type}.json" ] || { echo "ERROR: $id install failed" >&2; exit 1; }
  log "installed $id"
}

install_pkg system "$SYSTEM_ID" "$SYSTEM_MANIFEST" systems
for mod in "${!MODULE_MANIFESTS[@]}"; do
  install_pkg module "$mod" "${MODULE_MANIFESTS[$mod]}" modules
done

# Create the world (idempotent).
if [ -f "$PVC/Data/worlds/$WORLD_ID/world.json" ]; then
  log "world $WORLD_ID already exists"
else
  log "creating world $WORLD_ID"
  curl -s -m 60 -b "$CJ" -X POST "$BASE/setup" -H "Content-Type: application/json" \
    -d "{\"action\":\"createWorld\",\"id\":\"${WORLD_ID}\",\"title\":\"${WORLD_TITLE}\",\"system\":\"${SYSTEM_ID}\",\"background\":\"\",\"nextSession\":null,\"description\":\"The ${WORLD_TITLE} D&D 5e campaign.\"}" >/dev/null
  sleep 2
  [ -f "$PVC/Data/worlds/$WORLD_ID/world.json" ] || { echo "ERROR: world creation failed" >&2; exit 1; }
  log "created world $WORLD_ID"
fi

# ── Local repo module: hotd-website-integration (DM AI chat bridge) ─────────
REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
LOCAL_MODULE_SRC="$REPO_ROOT/foundry/hotd-module"
WEBSITE_URL="${WEBSITE_URL:-https://hotd.knoxrpg.com}"
PGHOST="${PGHOST:-localhost}"; PGPORT="${PGPORT:-30432}"; PGUSER="${PGUSER:-cortana}"; PGDATABASE="${PGDATABASE:-dnd_website}"

if [ -f "$LOCAL_MODULE_SRC/module.json" ]; then
  log "installing local module hotd-website-integration"
  rm -rf "$PVC/Data/modules/hotd-website-integration"
  mkdir -p "$PVC/Data/modules/hotd-website-integration"
  cp -r "$LOCAL_MODULE_SRC/." "$PVC/Data/modules/hotd-website-integration/"
  ENABLE_MODULES+=("hotd-website-integration")
fi

# DM AI token from hotd_config (seeds the module's chat-bridge settings so the
# operator never has to paste the secret). Best-effort; skipped if unavailable.
if command -v psql >/dev/null 2>&1; then
  : "${PGPASSWORD:=$(az keyvault secret show --vault-name "$KEYVAULT" --name pg-password --query value -o tsv 2>/dev/null || true)}"
  export PGPASSWORD
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A \
    -c "SELECT value FROM hotd_config WHERE key='foundry_dmai_token';" 2>/dev/null | tr -d '\n' > "$PVC/.dmai-token" || true
  [ -s "$PVC/.dmai-token" ] && chmod 600 "$PVC/.dmai-token" || rm -f "$PVC/.dmai-token"
fi

# Enable modules in the world's settings LevelDB (classic-level from the pod).
log "enabling modules: ${ENABLE_MODULES[*]}"
# Build a JSON array of the module ids for the embedded node script.
ENABLE_JSON="[$(printf '"%s",' "${ENABLE_MODULES[@]}" | sed 's/,$//')]"
ENABLE_JS="$PVC/.configure-enable.cjs"
cat > "$ENABLE_JS" <<EOF
const { ClassicLevel } = require('/home/foundry/foundryvtt/node_modules/classic-level');
const crypto = require('crypto'); const fs = require('fs');
const DBP = '/data/Data/worlds/${WORLD_ID}/data/settings';
const MODULES = ${ENABLE_JSON};
const WEBSITE_URL = ${WEBSITE_URL@Q};
const rid=(n=16)=>{const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';let s='';const b=crypto.randomBytes(n);for(let i=0;i<n;i++)s+=c[b[i]%c.length];return s;};
const stats=()=>({coreVersion:'13',systemId:'${SYSTEM_ID}',systemVersion:null,createdTime:Date.now(),modifiedTime:Date.now(),lastModifiedBy:null});
(async()=>{
  const db = new ClassicLevel(DBP, { valueEncoding: 'json' });
  const byKey={};
  for await (const [,v] of db.iterator()){ if(v && v.key) byKey[v.key]=v; }
  async function upsert(key,value){ const ex=byKey[key]; const id=ex?ex._id:rid(); await db.put('!settings!'+id,{key,value:JSON.stringify(value),_id:id,user:null,_stats:ex?ex._stats:stats()}); }
  let cur={}; if(byKey['core.moduleConfiguration']){ try{cur=JSON.parse(byKey['core.moduleConfiguration'].value);}catch{ const vv=byKey['core.moduleConfiguration'].value; if(vv&&typeof vv==='object')cur=vv; } }
  for(const m of MODULES) cur[m]=true;
  await upsert('core.moduleConfiguration', cur);
  if (MODULES.includes('hotd-website-integration')) {
    await upsert('hotd-website-integration.websiteUrl', WEBSITE_URL);
    if (fs.existsSync('/data/.dmai-token')) {
      const t = fs.readFileSync('/data/.dmai-token','utf8').trim();
      if (t) await upsert('hotd-website-integration.dmaiToken', t);
    }
  }
  await db.close();
  console.log('moduleConfiguration =', JSON.stringify(cur));
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
EOF
kc exec -n "$NAMESPACE" "$POD" -- node /data/.configure-enable.cjs
rm -f "$ENABLE_JS" "$PVC/.dmai-token"

log "done. Launch the '${WORLD_TITLE}' world in the Foundry UI to start playing."
log "DM AI chat: in-game, type 'DMAI <question>' (GM) — needs the website /api/foundry/dmai endpoint deployed + foundry_dmai_token in hotd_config."
log "MaterialDeck: install via Foundry module browser after linking Material Foundry Patreon, then enable + install materialdeck-dnd5e."
