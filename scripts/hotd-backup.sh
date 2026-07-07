#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# hotd-backup.sh — unified nightly backup of the HotD campaign data
# ══════════════════════════════════════════════════════════════
# Backs up, to the NAS (CIFS //192.168.10.20/nasshare -> /mnt/nas):
#   1. PostgreSQL `dnd_website` DB  → gzip'd pg_dump (timestamped + latest,
#      retained). This DB CONTAINS the RAG/pgvector embeddings, NPCs, notebook,
#      sessions, etc. — i.e. "RAG data + Postgres" are one artifact.
#   2. FoundryVTT `hotd` /data PVC  → timestamped tar.gz (worlds, systems,
#      modules, Config incl. license.json), retained.
#
# The website uploads PVC is handled separately by sync-uploads-backup.sh.
#
# Runs on cortana (has the live PVC hostpath, pg access on :30432, NAS mount,
# and `az`). Secrets are read at runtime — none are stored in this script.
#
# Install (user cron for benthebuilder):
#   15 3 * * * /home/benthebuilder/knoxrpg-hotd-website/scripts/hotd-backup.sh \
#     >> /home/benthebuilder/.local/state/hotd-backup.log 2>&1
#
# Config (optional overrides via env or ~/.config/hotd-backup/backup.env):
#   NAS_BASE            backup root on the NAS (default /mnt/nas/backups/hotd)
#   PGHOST/PGPORT/PGUSER/PGDATABASE   default localhost/30432/cortana/dnd_website
#   PG_KV_SECRET        Key Vault secret with the PG password (default pg-password)
#   KEYVAULT            Azure Key Vault name (default cloudgeek-cus-keyvault)
#   RETAIN_DAYS         prune backups older than this (default 14)
#   BLOB_DB_ENABLED     "1" to also upload the DB dump to Azure Blob (default 0)
#   (blob creds sourced from ~/.config/hotd-backup/blob.env when enabled)
# ══════════════════════════════════════════════════════════════
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:/snap/bin:${PATH:-}"

CONF_DIR="${HOTD_BACKUP_CONF:-$HOME/.config/hotd-backup}"
# shellcheck source=/dev/null
[ -f "$CONF_DIR/backup.env" ] && . "$CONF_DIR/backup.env"

NAS_BASE="${NAS_BASE:-/mnt/nas/backups/hotd}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-30432}"
PGUSER="${PGUSER:-cortana}"
PGDATABASE="${PGDATABASE:-dnd_website}"
KEYVAULT="${KEYVAULT:-cloudgeek-cus-keyvault}"
PG_KV_SECRET="${PG_KV_SECRET:-pg-password}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
BLOB_DB_ENABLED="${BLOB_DB_ENABLED:-0}"

TS="$(date +%Y%m%d-%H%M%S)"
DB_DIR="$NAS_BASE/db"
FOUNDRY_DIR="$NAS_BASE/foundry"

log()  { echo "[$(date -Is)] $*"; }
fail() { echo "[$(date -Is)] ERROR: $*" >&2; exit 1; }

command -v pg_dump >/dev/null || fail "pg_dump not found"
mkdir -p "$DB_DIR" "$FOUNDRY_DIR" || fail "cannot create NAS backup dirs under $NAS_BASE (is /mnt/nas mounted?)"

log "════ HotD backup start ($TS) ════"

# ── 1) PostgreSQL + RAG dump ────────────────────────────────────────────────
if [ -z "${PGPASSWORD:-}" ]; then
  PGPASSWORD="$(az keyvault secret show --vault-name "$KEYVAULT" --name "$PG_KV_SECRET" --query value -o tsv 2>/dev/null || true)"
fi
[ -n "${PGPASSWORD:-}" ] || fail "no PG password (set PGPASSWORD or Key Vault secret $PG_KV_SECRET)"
export PGPASSWORD

DB_OUT="$DB_DIR/${PGDATABASE}-${TS}.sql.gz"
log "pg_dump $PGDATABASE @ $PGHOST:$PGPORT -> $DB_OUT"
if pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
     --no-owner --no-privileges --clean --if-exists 2>/dev/null | gzip > "$DB_OUT"; then
  # Fail loudly if the dump is suspiciously tiny (auth/empty).
  sz="$(stat -c%s "$DB_OUT" 2>/dev/null || echo 0)"
  [ "$sz" -gt 1024 ] || fail "DB dump is only ${sz} bytes — aborting (not overwriting latest)"
  cp -f "$DB_OUT" "$DB_DIR/${PGDATABASE}-latest.sql.gz"
  log "DB dump OK ($(numfmt --to=iec "$sz" 2>/dev/null || echo "${sz}B"))"
  if [ "$BLOB_DB_ENABLED" = "1" ]; then
    # shellcheck source=/dev/null
    [ -f "$CONF_DIR/blob.env" ] && . "$CONF_DIR/blob.env"
    if [ -n "${AZURE_STORAGE_ACCOUNT:-}" ] && [ -n "${AZURE_STORAGE_KEY:-}" ]; then
      log "blob upload DB dump -> ${AZURE_STORAGE_ACCOUNT}/db-backups"
      az storage blob upload --account-name "$AZURE_STORAGE_ACCOUNT" --account-key "$AZURE_STORAGE_KEY" \
        --container-name db-backups --name "${PGDATABASE}-${TS}.sql.gz" --file "$DB_OUT" \
        --overwrite --only-show-errors || log "WARN: blob upload failed (continuing)"
    else
      log "WARN: BLOB_DB_ENABLED=1 but blob creds missing; skipping blob upload"
    fi
  fi
else
  fail "pg_dump failed"
fi
unset PGPASSWORD

# ── 2) FoundryVTT /data (hotd) ──────────────────────────────────────────────
# Resolve the live PVC hostpath (survives PVC recreation).
FOUNDRY_SRC="${FOUNDRY_SRC:-}"
if [ -z "$FOUNDRY_SRC" ]; then
  FOUNDRY_SRC="$(microk8s kubectl get pv -o jsonpath='{range .items[?(@.spec.claimRef.name=="foundry-data")]}{.spec.hostPath.path}{end}' 2>/dev/null || true)"
fi
[ -n "$FOUNDRY_SRC" ] || FOUNDRY_SRC="$(ls -d /var/snap/microk8s/common/default-storage/*foundry-data* 2>/dev/null | head -1 || true)"

if [ -n "$FOUNDRY_SRC" ] && [ -f "$FOUNDRY_SRC/Config/options.json" ]; then
  FOUNDRY_OUT="$FOUNDRY_DIR/foundryvtt-hotd-data-${TS}.tar.gz"
  log "tar Foundry /data ($FOUNDRY_SRC) -> $FOUNDRY_OUT"
  # Exclude ephemeral Logs; capture worlds/systems/modules/Config.
  if tar czf "$FOUNDRY_OUT" -C "$FOUNDRY_SRC" --exclude=Logs . 2>/dev/null; then
    cp -f "$FOUNDRY_OUT" "$FOUNDRY_DIR/foundryvtt-hotd-data-latest.tar.gz"
    log "Foundry backup OK ($(numfmt --to=iec "$(stat -c%s "$FOUNDRY_OUT")" 2>/dev/null || echo '?'))"
  else
    log "WARN: Foundry tar failed"
  fi
else
  log "WARN: Foundry PVC hostpath not found or empty (looked at '${FOUNDRY_SRC:-none}'); skipping Foundry backup"
fi

# ── 3) Retention (prune old timestamped backups; keep the -latest copies) ────
log "pruning backups older than ${RETAIN_DAYS} days"
find "$DB_DIR" -type f -name "${PGDATABASE}-*.sql.gz" ! -name "*-latest.sql.gz" -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true
find "$FOUNDRY_DIR" -type f -name 'foundryvtt-hotd-data-*.tar.gz' ! -name '*-latest.tar.gz' -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true

log "════ HotD backup complete ════"
