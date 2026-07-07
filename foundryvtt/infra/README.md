# HotD FoundryVTT — Infrastructure

Repo-managed FoundryVTT deployment for **hotd-foundry.knoxrpg.com** on the
self-hosted MicroK8s cluster (cortana). This replaces the old Ansible-managed
instance whose data lived on a failed NVMe drive.

## Layout

```
foundryvtt/infra/
├── docker/
│   ├── Dockerfile          # node:22-slim + tini + FoundryVTT (fetched at build)
│   ├── entrypoint.sh       # prepares /data, launches Foundry under tini
│   └── .gitignore          # ignores the downloaded foundry-release/
├── helm/foundryvtt/        # Helm chart (Deployment, Service, Ingress, PVC, Secret)
└── scripts/
    └── fetch-foundry.sh    # downloads + extracts the FoundryVTT node build
```

## How it deploys

1. **`.github/workflows/deploy-foundry.yml`** triggers on pushes touching
   `foundryvtt/**` (or manual dispatch).
2. **Fetch** — `fetch-foundry.sh` logs in to foundryvtt.com with Key Vault
   creds and extracts the node build into `docker/foundry-release/` (gitignored).
3. **Build** — `buildah bud` builds `localhost:32000/hotd-foundry:<build>` and
   pushes to the MicroK8s registry.
4. **Deploy** — `helm upgrade --install` into the `foundryvtt-hotd` namespace,
   injecting the license + admin keys from Key Vault as a K8s Secret.

## Storage

FoundryVTT `/data` is a **PVC** on the `microk8s-hostpath` storage class — the
same class the HotD website uses. It is backed by the healthy root NVMe at
`/var/snap/microk8s/common/default-storage`, **not** the failed data drive.

## Required Azure Key Vault secrets

Vault: `cloudgeek-cus-keyvault`. Add these before the first deploy:

| Secret name           | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `foundry-username`    | foundryvtt.com account email/username               |
| `foundry-password`    | foundryvtt.com account password                     |
| `foundry-build`       | FoundryVTT **build number** to fetch (e.g. `351`) — the full version `13.351` is also accepted (the number after the last dot is used). Set to the latest stable build to track "latest stable" |
| `foundry-license-key` | FoundryVTT license key                              |
| `foundry-admin-key`   | Foundry setup/admin password                        |

```bash
az keyvault secret set --vault-name cloudgeek-cus-keyvault --name foundry-username    --value '...'
az keyvault secret set --vault-name cloudgeek-cus-keyvault --name foundry-password    --value '...'
az keyvault secret set --vault-name cloudgeek-cus-keyvault --name foundry-build       --value '351'
az keyvault secret set --vault-name cloudgeek-cus-keyvault --name foundry-license-key --value '...'
az keyvault secret set --vault-name cloudgeek-cus-keyvault --name foundry-admin-key   --value '...'
```

## Local build / manual deploy (on cortana)

```bash
# 1. Fetch the release into the build context
bash foundryvtt/infra/scripts/fetch-foundry.sh

# 2. Build + push
buildah bud -f foundryvtt/infra/docker/Dockerfile \
  -t localhost:32000/hotd-foundry:351 foundryvtt/infra/docker
buildah push --tls-verify=false localhost:32000/hotd-foundry:351 \
  docker://localhost:32000/hotd-foundry:351

# 3. Deploy (secrets from Key Vault)
LICENSE="$(az keyvault secret show --vault-name cloudgeek-cus-keyvault --name foundry-license-key --query value -o tsv)"
ADMIN="$(az keyvault secret show --vault-name cloudgeek-cus-keyvault --name foundry-admin-key --query value -o tsv)"
microk8s helm upgrade --install hotd-foundry foundryvtt/infra/helm/foundryvtt/ \
  --namespace foundryvtt-hotd --create-namespace \
  --set image.tag=351 \
  --set-string secrets.licenseKey="$LICENSE" \
  --set-string secrets.adminKey="$ADMIN"
```

## Validate templates

```bash
microk8s helm template hotd-foundry foundryvtt/infra/helm/foundryvtt/ \
  --set image.tag=351 --set-string secrets.licenseKey=x --set-string secrets.adminKey=y
```
