#!/usr/bin/env bash
# =============================================================================
# .devcontainer/scripts/db-restore.sh
#
# Restore the dev PostgreSQL database from a cortana backup.
#
# Usage:
#   1. DOWNLOAD latest backup from Azure Storage + restore:
#        bash .devcontainer/scripts/db-restore.sh download
#
#   2. PULL from cortana (requires SSH access to cortana):
#        bash .devcontainer/scripts/db-restore.sh pull
#
#   3. RESTORE from a local dump file:
#        bash .devcontainer/scripts/db-restore.sh restore [path/to/dump.sql.gz]
#
#   4. DUMP the current dev database (for sharing / committing a seed):
#        bash .devcontainer/scripts/db-restore.sh dump
#
# Environment Variables (defaults match docker-compose.yml):
#   PGHOST      — default: db
#   PGPORT      — default: 5432
#   PGUSER      — default: cortana
#   PGPASSWORD  — default: cortana_dev
#   PGDATABASE  — default: dnd_website
#
#   CORTANA_HOST — SSH host for cortana (default: cortana)
#   CORTANA_PG_USER — PG user on cortana (default: cortana)
#   CORTANA_PG_DB   — PG database on cortana (default: dnd_website)
#
#   AZURE_STORAGE_ACCOUNT — default: knoxrpgwebsitestore
#   AZURE_CONTAINER       — default: db-backups
# =============================================================================
set -euo pipefail

# ── Defaults ─────────────────────────────────────────────────────────────────
DUMP_DIR="/workspaces/knoxrpg-hotd-website/.devcontainer/db/backups"
DEFAULT_DUMP="$DUMP_DIR/cortana-latest.sql"

PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-cortana}"
PGPASSWORD="${PGPASSWORD:-cortana_dev}"
PGDATABASE="${PGDATABASE:-dnd_website}"
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

CORTANA_HOST="${CORTANA_HOST:-cortana}"
CORTANA_PG_USER="${CORTANA_PG_USER:-cortana}"
CORTANA_PG_DB="${CORTANA_PG_DB:-dnd_website}"

AZURE_STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-knoxrpgwebsitestore}"
AZURE_CONTAINER="${AZURE_CONTAINER:-db-backups}"
AZURE_BLOB_NAME="dnd_website-latest.sql.gz"

mkdir -p "$DUMP_DIR"

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { echo "── $*"; }
ok()    { echo "✔  $*"; }
fail()  { echo "✘  $*" >&2; exit 1; }

wait_for_pg() {
  info "Waiting for PostgreSQL at $PGHOST:$PGPORT ..."
  for i in $(seq 1 30); do
    if pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q 2>/dev/null; then
      ok "PostgreSQL is ready"
      return 0
    fi
    sleep 1
  done
  fail "PostgreSQL did not become ready in 30 seconds"
}

# ── PULL: SSH into cortana and pg_dump → local file ──────────────────────────
cmd_pull() {
  info "Pulling database dump from $CORTANA_HOST ..."
  info "  Remote: $CORTANA_PG_USER@$CORTANA_HOST / $CORTANA_PG_DB"

  ssh "$CORTANA_HOST" \
    "pg_dump -U $CORTANA_PG_USER -d $CORTANA_PG_DB --no-owner --no-privileges --clean --if-exists" \
    > "$DEFAULT_DUMP"

  ok "Dump saved to $DEFAULT_DUMP ($(wc -c < "$DEFAULT_DUMP") bytes)"
  echo ""
  echo "Now run:  bash .devcontainer/scripts/db-restore.sh restore"
}

# ── DOWNLOAD: Grab latest nightly backup from Azure Blob Storage ─────────────
cmd_download() {
  local dest="$DUMP_DIR/cortana-latest.sql.gz"

  info "Downloading latest backup from Azure ..."
  info "  Source: $AZURE_STORAGE_ACCOUNT/$AZURE_CONTAINER/$AZURE_BLOB_NAME"

  # Wait for DNS resolution (container networking may not be ready at startup)
  local dns_target="${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net"
  for i in $(seq 1 10); do
    if getent hosts "$dns_target" &>/dev/null; then
      break
    fi
    echo "   Waiting for DNS ($dns_target) ... attempt $i/10"
    sleep 2
  done
  if ! getent hosts "$dns_target" &>/dev/null; then
    fail "DNS resolution failed for $dns_target — check network connectivity"
  fi

  # Try --auth-mode login first (works if 'az login' was done), fall back to key
  az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_CONTAINER" \
    --name "$AZURE_BLOB_NAME" \
    --file "$dest" \
    --auth-mode login \
    --only-show-errors 2>/dev/null \
  || az storage blob download \
    --account-name "$AZURE_STORAGE_ACCOUNT" \
    --container-name "$AZURE_CONTAINER" \
    --name "$AZURE_BLOB_NAME" \
    --file "$dest" \
    --only-show-errors \
  || fail "Could not download backup. Run 'az login' first."

  ok "Downloaded to $dest ($(wc -c < "$dest") bytes)"
  echo ""

  # Auto-restore after download
  cmd_restore "$dest"
}

# ── RESTORE: Load a dump file into the dev database ─────────────────────────
cmd_restore() {
  local dump_file="${1:-$DEFAULT_DUMP}"

  if [ ! -f "$dump_file" ]; then
    fail "Dump file not found: $dump_file

  Run 'db-restore.sh pull' first, or provide a path:
    db-restore.sh restore /path/to/dump.sql"
  fi

  wait_for_pg

  info "Restoring from $dump_file ..."
  info "  Target: $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"

  # Drop and recreate the database to start clean
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PGDATABASE' AND pid <> pg_backend_pid();" \
    2>/dev/null || true

  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres <<SQL
    DROP DATABASE IF EXISTS $PGDATABASE;
    CREATE DATABASE $PGDATABASE OWNER $PGUSER;
SQL

  # Ensure pgvector extension exists before restoring
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c \
    "CREATE EXTENSION IF NOT EXISTS vector;"

  # Restore the dump (handle both .gz and plain .sql)
  if [[ "$dump_file" == *.gz ]]; then
    gunzip -c "$dump_file" | \
      psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
        --single-transaction 2>&1 | tail -5
  else
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
      -f "$dump_file" --single-transaction 2>&1 | tail -5
  fi

  ok "Database restored successfully"
  echo ""

  # Show table counts
  info "Table row counts:"
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c \
    "SELECT schemaname, relname AS table, n_live_tup AS rows
     FROM pg_stat_user_tables ORDER BY relname;" 2>/dev/null || true
}

# ── DUMP: Export the current dev database ────────────────────────────────────
cmd_dump() {
  wait_for_pg
  local outfile="$DUMP_DIR/dev-$(date +%Y%m%d-%H%M%S).sql"
  info "Dumping dev database to $outfile ..."

  pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    --no-owner --no-privileges --clean --if-exists \
    > "$outfile"

  ok "Dump saved to $outfile ($(wc -c < "$outfile") bytes)"
}

# ── Main ─────────────────────────────────────────────────────────────────────
case "${1:-help}" in
  download) cmd_download ;;
  pull)     cmd_pull ;;
  restore)  cmd_restore "${2:-}" ;;
  dump)     cmd_dump ;;
  *)
    echo "Usage: db-restore.sh <download|pull|restore|dump> [dump-file]"
    echo ""
    echo "Commands:"
    echo "  download          Download latest nightly backup from Azure + restore"
    echo "  pull              SSH into cortana and download a pg_dump"
    echo "  restore [file]    Load a dump into the dev database (.sql or .sql.gz)"
    echo "  dump              Export the current dev database"
    echo ""
    echo "Examples:"
    echo "  db-restore.sh download                # Grab latest from Azure (recommended)"
    echo "  db-restore.sh pull                    # Clone live from cortana via SSH"
    echo "  db-restore.sh restore                 # Restore latest pull"
    echo "  db-restore.sh restore backup.sql.gz   # Restore specific file"
    echo "  db-restore.sh dump                    # Snapshot current dev DB"
    ;;
esac
