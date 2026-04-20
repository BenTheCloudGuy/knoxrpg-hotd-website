# Helm & MicroK8s Deployment

**Confidence:** medium

## Pattern

Conventions for Helm chart development and MicroK8s deployment.

### Helm Chart

- Chart location: `helm/hotd-website/`
- Validate with: `helm template hotd-website helm/hotd-website/`
- Deploy with: `helm upgrade --install hotd-website helm/hotd-website/`
- Use `.Values` references — never hardcode secrets in templates
- Container image tags must match the version in `Chart.yaml`

### MicroK8s

- Target MicroK8s (self-hosted) — no cloud load balancers
- Ingress uses the MicroK8s ingress addon
- PVC for persistent data

### Version Bump

The CHANGELOG.md version drives the deployment pipeline. When Chart.yaml or image tags change, the version in CHANGELOG.md must be updated.

## Learned from

- Helm chart setup and deployment pipeline
