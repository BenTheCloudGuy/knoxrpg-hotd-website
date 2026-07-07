#!/usr/bin/env bash
# ==============================================================================
# fetch-foundry.sh — download + extract the FoundryVTT Node build into the
# Docker build context (foundryvtt/infra/docker/foundry-release/).
#
# Credentials come from Azure Key Vault and are never printed. Run by the
# deploy-foundry.yml workflow before `buildah bud`, or locally on the cortana
# host where `az` is authenticated.
#
# Required Key Vault secrets (vault: cloudgeek-cus-keyvault):
#   foundry-username     — foundryvtt.com account email/username
#   foundry-password     — foundryvtt.com account password
#   foundry-build        — FoundryVTT BUILD NUMBER to fetch (e.g. "351"). The
#                          full version string ("13.351") is also accepted; the
#                          numeric build after the last dot is used for the
#                          download URL. Set to the latest stable build to track
#                          "latest stable".
#
# Env overrides:
#   FOUNDRY_KEYVAULT     — vault name (default cloudgeek-cus-keyvault)
#   FOUNDRY_BUILD        — overrides the foundry-build KV secret
#   Arg $1               — output dir (default ../docker/foundry-release)
# ==============================================================================
set -euo pipefail

VAULT="${FOUNDRY_KEYVAULT:-cloudgeek-cus-keyvault}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR/../docker/foundry-release}"

kv() { az keyvault secret show --vault-name "$VAULT" --name "$1" --query value -o tsv; }

echo "Reading FoundryVTT credentials from Key Vault ($VAULT)..."
FOUNDRY_USERNAME="$(kv foundry-username)"
FOUNDRY_PASSWORD="$(kv foundry-password)"
FOUNDRY_BUILD="${FOUNDRY_BUILD:-$(kv foundry-build)}"

if [ -z "$FOUNDRY_BUILD" ]; then
  echo "ERROR: FOUNDRY_BUILD is empty (set the foundry-build KV secret or FOUNDRY_BUILD env)." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"

echo "Authenticating to foundryvtt.com..."
CSRF="$(curl -s -c cookies.txt "https://foundryvtt.com/auth/login/" \
  | grep -oP 'name="csrfmiddlewaretoken" value="\K[^"]+' | head -1)"

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -b cookies.txt -c cookies.txt \
  -X POST "https://foundryvtt.com/auth/login/" \
  -H "Referer: https://foundryvtt.com/auth/login/" \
  --data-urlencode "csrfmiddlewaretoken=$CSRF" \
  --data-urlencode "username=$FOUNDRY_USERNAME" \
  --data-urlencode "password=$FOUNDRY_PASSWORD" \
  --data-urlencode "login=login")"

case "$HTTP_CODE" in
  200|302) ;;
  *) echo "ERROR: Foundry login failed (HTTP $HTTP_CODE)." >&2; exit 1 ;;
esac

# The download endpoint wants the BUILD NUMBER only (e.g. 351), not the full
# version (13.351). Accept either by taking the segment after the last dot.
BUILD_NUM="${FOUNDRY_BUILD##*.}"
echo "Downloading FoundryVTT build $BUILD_NUM (from '$FOUNDRY_BUILD', node)..."
curl -s -L -b cookies.txt -o foundryvtt.zip \
  "https://foundryvtt.com/releases/download?build=${BUILD_NUM}&platform=node"

if ! unzip -tq foundryvtt.zip >/dev/null 2>&1; then
  echo "ERROR: Download is not a valid zip (auth failed or bad build number)." >&2
  head -c 200 foundryvtt.zip >&2 || true
  exit 1
fi

echo "Extracting to $OUT_DIR ..."
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
unzip -oq foundryvtt.zip -d "$OUT_DIR"

if [ ! -f "$OUT_DIR/main.js" ]; then
  echo "ERROR: main.js not found in extracted release; layout unexpected." >&2
  exit 1
fi

echo "FoundryVTT build $FOUNDRY_BUILD ready in $OUT_DIR"
