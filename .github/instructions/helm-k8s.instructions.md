---
description: "Use when working on Helm charts, Kubernetes manifests, or deployment configuration"
applyTo: "helm/**"
---
# Helm / Kubernetes Guidelines

- Target MicroK8s (self-hosted) — no cloud load balancers
- Validate changes with `helm template hotd-website helm/hotd-website/`
- Use `.Values` references, never hardcode secrets in templates
- Ingress uses the MicroK8s ingress addon
- Container image tags should match the version in Chart.yaml
