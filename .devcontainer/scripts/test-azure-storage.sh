#!/usr/bin/env bash
# =============================================================================
# .devcontainer/scripts/test-azure-storage.sh
#
# Verify Azure CLI auth and access to the db-backups storage container.
# Run after container startup to confirm everything is wired correctly.
# =============================================================================
set -euo pipefail

STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-knoxrpgwebsitestore}"
CONTAINER="${AZURE_CONTAINER:-db-backups}"

info()  { echo "── $*"; }
ok()    { echo "✔  $*"; }
warn()  { echo "⚠  $*"; }
fail()  { echo "✘  $*" >&2; }

echo "═══════════════════════════════════════════════════════════"
echo "  Azure Storage Access Test"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Check az CLI is installed ─────────────────────────────────────────────
info "Checking Azure CLI ..."
if ! command -v az &>/dev/null; then
  fail "Azure CLI not found on PATH"
  exit 1
fi
ok "Azure CLI installed ($(az version --query '\"azure-cli\"' -o tsv 2>/dev/null))"

# ── 2. Check authentication ─────────────────────────────────────────────────
info "Checking authentication ..."
if ! az account show &>/dev/null 2>&1; then
  fail "Not logged in to Azure CLI"
  echo ""
  echo "   Fix: Set these env vars (Codespaces secrets or host env):"
  echo "     AZURE_TENANT_ID"
  echo "     AZURE_CLIENT_ID"
  echo "     AZURE_CLIENT_SECRET"
  echo ""
  echo "   Or run: az login"
  exit 1
fi

ACCOUNT=$(az account show --query '{name:name, user:user.name, tenant:tenantId}' -o json 2>/dev/null)
ok "Authenticated"
echo "   Account: $(echo "$ACCOUNT" | grep -oP '"name":\s*"\K[^"]*')"
echo "   User:    $(echo "$ACCOUNT" | grep -oP '"user":\s*"\K[^"]*')"
echo "   Tenant:  $(echo "$ACCOUNT" | grep -oP '"tenant":\s*"\K[^"]*')"
echo ""

# ── 3. Check storage account access ─────────────────────────────────────────
info "Checking storage account: $STORAGE_ACCOUNT ..."
if ! az storage account show --name "$STORAGE_ACCOUNT" --query name -o tsv &>/dev/null 2>&1; then
  fail "Cannot access storage account '$STORAGE_ACCOUNT'"
  echo "   The service principal may need 'Reader' role on the storage account"
  exit 1
fi
ok "Storage account accessible"

# ── 4. Check container access ───────────────────────────────────────────────
info "Checking container: $CONTAINER ..."
if ! az storage container show \
    --account-name "$STORAGE_ACCOUNT" \
    --name "$CONTAINER" \
    --auth-mode login \
    --only-show-errors &>/dev/null 2>&1; then
  warn "Container '$CONTAINER' not found or not accessible"
  echo "   Create it with:"
  echo "     az storage container create -n $CONTAINER --account-name $STORAGE_ACCOUNT"
  echo ""
  echo "   Then assign blob data roles to the service principal:"
  echo "     az role assignment create \\"
  echo "       --assignee \$AZURE_CLIENT_ID \\"
  echo "       --role 'Storage Blob Data Contributor' \\"
  echo "       --scope /subscriptions/\$SUB_ID/resourceGroups/\$RG/providers/Microsoft.Storage/storageAccounts/$STORAGE_ACCOUNT"
  exit 1
fi
ok "Container '$CONTAINER' accessible"

# ── 5. List blobs ───────────────────────────────────────────────────────────
info "Listing backups in $CONTAINER ..."
BLOBS=$(az storage blob list \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name "$CONTAINER" \
  --auth-mode login \
  --query "[].{name:name, size:properties.contentLength, modified:properties.lastModified}" \
  -o table 2>/dev/null) || true

if [[ -z "$BLOBS" || "$BLOBS" == *"0 items"* ]]; then
  warn "No backups found in container"
  echo "   Run the backup script on cortana first:"
  echo "     bash scripts/cortana-db-backup.sh"
else
  ok "Backups found:"
  echo "$BLOBS" | head -20
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  All checks passed — Azure storage access is working"
echo "═══════════════════════════════════════════════════════════"
