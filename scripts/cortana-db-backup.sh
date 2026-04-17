#!/usr/bin/env bash
# =============================================================================
# cortana-db-backup.sh
#
# Nightly backup of the dnd_website PostgreSQL database to Azure Blob Storage.
# Install on cortana via crontab:
#
#   crontab -e
#   0 3 * * * /home/cortana/scripts/cortana-db-backup.sh >> /var/log/hotd-db-backup.log 2>&1
#
# Prerequisites on cortana:
#   - Azure CLI installed and logged in (az login or managed identity)
#   - pg_dump available
#   - Storage account container "db-backups" created:
#       az storage container create -n db-backups \
#         --account-name knoxrpgwebsitestore
#
# Environment Variables (optional overrides):
#   PGUSER               — default: cortana
#   PGDATABASE           — default: dnd_website
#   AZURE_STORAGE_ACCOUNT — default: knoxrpgwebsitestore
#   AZURE_CONTAINER       — default: db-backups
#   BACKUP_RETAIN_DAYS    — default: 30 (delete backups older than this)
# =============================================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
PGUSER="${PGUSER:-cortana}"
PGDATABASE="${PGDATABASE:-dnd_website}"
AZURE_STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-knoxrpgwebsitestore}"
AZURE_CONTAINER="${AZURE_CONTAINER:-db-backups}"
BACKUP_RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-30}"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DUMP_FILE="/tmp/dnd_website-${TIMESTAMP}.sql.gz"
BLOB_NAME="dnd_website-${TIMESTAMP}.sql.gz"
LATEST_BLOB="dnd_website-latest.sql.gz"

echo "════════════════════════════════════════════════════════════"
echo "  HotD Database Backup — $(date)"
echo "════════════════════════════════════════════════════════════"

# ── 1. Dump database ────────────────────────────────────────────────────────
echo "── Dumping $PGDATABASE ..."
pg_dump -U "$PGUSER" -d "$PGDATABASE" \
  --no-owner --no-privileges --clean --if-exists \
  | gzip > "$DUMP_FILE"

DUMP_SIZE=$(stat --printf="%s" "$DUMP_FILE" 2>/dev/null || stat -f%z "$DUMP_FILE")
echo "✔  Dump created: $DUMP_FILE ($(numfmt --to=iec "$DUMP_SIZE" 2>/dev/null || echo "${DUMP_SIZE} bytes"))"

# ── 2. Upload timestamped backup ────────────────────────────────────────────
echo "── Uploading to Azure: $AZURE_STORAGE_ACCOUNT/$AZURE_CONTAINER/$BLOB_NAME"
az storage blob upload \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --container-name "$AZURE_CONTAINER" \
  --name "$BLOB_NAME" \
  --file "$DUMP_FILE" \
  --overwrite \
  --auth-mode login \
  --only-show-errors

echo "✔  Uploaded $BLOB_NAME"

# ── 3. Copy as "latest" (so devcontainers always grab the newest) ───────────
echo "── Copying as $LATEST_BLOB ..."
az storage blob copy start \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --destination-container "$AZURE_CONTAINER" \
  --destination-blob "$LATEST_BLOB" \
  --source-container "$AZURE_CONTAINER" \
  --source-blob "$BLOB_NAME" \
  --auth-mode login \
  --only-show-errors

echo "✔  Latest pointer updated"

# ── 4. Clean up old backups ─────────────────────────────────────────────────
echo "── Pruning backups older than $BACKUP_RETAIN_DAYS days ..."
CUTOFF=$(date -d "-${BACKUP_RETAIN_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${BACKUP_RETAIN_DAYS}d +%Y%m%d)

az storage blob list \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --container-name "$AZURE_CONTAINER" \
  --auth-mode login \
  --query "[?name != '$LATEST_BLOB'].name" \
  -o tsv 2>/dev/null | while IFS= read -r blob; do
    # Extract date from blob name: dnd_website-YYYYMMDD-HHMMSS.sql.gz
    BLOB_DATE=$(echo "$blob" | grep -oP '\d{8}' | head -1)
    if [[ -n "$BLOB_DATE" && "$BLOB_DATE" < "$CUTOFF" ]]; then
      echo "  Deleting old backup: $blob"
      az storage blob delete \
        --account-name "$AZURE_STORAGE_ACCOUNT" \
        --container-name "$AZURE_CONTAINER" \
        --name "$blob" \
        --auth-mode login \
        --only-show-errors 2>/dev/null || true
    fi
done

echo "✔  Pruning complete"

# ── 5. Clean up local temp file ─────────────────────────────────────────────
rm -f "$DUMP_FILE"

echo ""
echo "✔  Backup complete: $BLOB_NAME"
echo "════════════════════════════════════════════════════════════"
