#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# sync-uploads-backup.sh — nightly backup of the HOTD uploads PVC
# ══════════════════════════════════════════════════════════════
# Backs up the live uploads PVC (the writable /hotd-content/* store,
# including images/, art/, artifacts/, handouts/, maps/, generated-images/)
# to two durable destinations:
#   1. the NAS  (rsync over SSH to homeserver — owns the share)
#   2. Azure Blob (cloudgeekcusgaming01/hotd-website-content)
#
# Runs on cortana, which has the live PVC locally plus rsync, az, and
# SSH to homeserver. ADDITIVE ONLY — never deletes remote files — so
# historical NAS/blob assets that predate the PVC are preserved.
#
# Install: nightly user cron for benthebuilder (see ops/ notes / CHANGELOG).
# Config (optional overrides via env or ~/.config/hotd-backup/*.env):
#   UPLOADS_SRC             live uploads PVC hostpath (auto-resolved if unset)
#   NAS_SSH                 ssh target for the NAS host
#   NAS_DEST               NAS dir for hotd-website-content
#   BLOB_CONTAINER          blob container (default hotd-website-content)
#   AZURE_STORAGE_ACCOUNT   storage account (default cloudgeekcusgaming01)
#   AZURE_STORAGE_KEY       account key (from ~/.config/hotd-backup/blob.env)
# ══════════════════════════════════════════════════════════════
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin:${PATH:-}"

CONF_DIR="${HOTD_BACKUP_CONF:-$HOME/.config/hotd-backup}"
# shellcheck source=/dev/null
[ -f "$CONF_DIR/backup.env" ] && . "$CONF_DIR/backup.env"
# shellcheck source=/dev/null
[ -f "$CONF_DIR/blob.env" ] && . "$CONF_DIR/blob.env"

NAS_SSH="${NAS_SSH:-homeserver.mitchell-family.com}"
NAS_DEST="${NAS_DEST:-/mnt/user/nasshare/Gaming/ASSETS/DDB_CONTENT/hotd-website-content}"
BLOB_CONTAINER="${BLOB_CONTAINER:-hotd-website-content}"
AZURE_STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-cloudgeekcusgaming01}"

log() { echo "[$(date -Is)] $*"; }
fail() { log "ERROR: $*"; exit 1; }

# ── Resolve the live uploads PVC hostpath (survives PVC recreation) ──
if [ -z "${UPLOADS_SRC:-}" ]; then
  UPLOADS_SRC="$(kubectl get pv -o jsonpath='{range .items[?(@.spec.claimRef.name=="hotd-uploads")]}{.spec.hostPath.path}{end}' 2>/dev/null || true)"
fi
if [ -z "${UPLOADS_SRC:-}" ]; then
  UPLOADS_SRC="$(ls -d /var/snap/microk8s/common/default-storage/*hotd-uploads* 2>/dev/null | head -1 || true)"
fi
[ -n "${UPLOADS_SRC:-}" ] && [ -d "$UPLOADS_SRC" ] || fail "uploads PVC path not found (set UPLOADS_SRC)"
log "Source PVC: $UPLOADS_SRC"

# ── 1) rsync -> NAS (additive; no --delete keeps historical NAS assets) ──
log "rsync -> ${NAS_SSH}:${NAS_DEST}/"
rsync -rlt --info=stats1 "$UPLOADS_SRC"/ "${NAS_SSH}:${NAS_DEST}/" || fail "rsync to NAS failed"

# ── 2) blob upload (additive, --overwrite; account-key auth, no az login) ──
if [ -n "${AZURE_STORAGE_KEY:-}" ]; then
  log "blob upload-batch -> ${AZURE_STORAGE_ACCOUNT}/${BLOB_CONTAINER}"
  az storage blob upload-batch \
    --account-name "$AZURE_STORAGE_ACCOUNT" --account-key "$AZURE_STORAGE_KEY" \
    -d "$BLOB_CONTAINER" -s "$UPLOADS_SRC" \
    --overwrite true --only-show-errors || fail "blob upload failed"
else
  log "WARN: AZURE_STORAGE_KEY unset; skipping blob upload (set ~/.config/hotd-backup/blob.env)"
fi

log "Backup complete."
