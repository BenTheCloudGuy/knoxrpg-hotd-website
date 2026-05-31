# Phase 4 — Out-of-repo PR snippets

This file lists the changes that must land in OTHER repositories so the
in-repo observability wire-up (metrics, JSON logs, optional Loki push,
Grafana dashboard) actually reaches the LGTM stack on UnRAID.

**These are copy-paste targets. Once each PR merges, delete the matching
section from this file.**

The canonical facts (Loki URL, Prometheus reload endpoint, datasource UIDs,
config-of-record path) were re-verified against `cloudgeeklabs/homenetwork`
knowledge-base on the date the in-repo PR landed.

---

## 1. `cloudgeeklabs/homeStack-files`

### 1a. New Prometheus scrape job

**File:** `docker/observability/config/prometheus/prometheus.yml`

Append under `scrape_configs:`. Naming follows the existing
`cortana_*` / `arr_*` underscore convention. The pod runs
`hostNetwork: true` (Arc identity requirement) so the metrics port binds
directly on the cortana host IP at `9464`.

```yaml
  - job_name: hotd_website
    scrape_interval: 30s
    scrape_timeout: 10s
    metrics_path: /metrics
    static_configs:
      - targets: ['192.168.10.210:9464']
        labels:
          instance: cortana
          app: hotd-website
          owner: knoxrpg
```

Apply with the standard add-target procedure:

```bash
ssh homeserver \
  'docker run --rm \
     -v /mnt/docker_containers/docker/observability/prometheus:/p \
     prom/prometheus:v3.3.0 promtool check config /p/prometheus.yml'

ssh homeserver 'curl -fsS -XPOST http://localhost:9090/-/reload'

ssh homeserver \
  "curl -s http://localhost:9090/api/v1/targets \
    | jq '.data.activeTargets[] | select(.labels.job==\"hotd_website\")'"
```

Target should report `health: up`. If it sits `down`, sanity-check from the
obs host:

```bash
curl -fsS http://192.168.10.210:9464/metrics | head
```

### 1b. (Optional) Provisioned dashboard copy

The dashboard lives in this repo at
[`observability/dashboards/hotd-website.json`](./dashboards/hotd-website.json)
and is pushed to Grafana automatically by
[`.github/workflows/grafana-dashboard-sync.yml`](../.github/workflows/grafana-dashboard-sync.yml)
using the same `GRAFANA_API_TOKEN` pattern post-KB-074. **No copy into
homeStack-files is required** as long as that workflow's secrets
(`GRAFANA_URL`, `GRAFANA_API_TOKEN`) exist on this repo.

If you would rather keep the dashboard provisioned from the obs host's
filesystem (parity with the rest of your dashboards), copy it once:

```bash
scp observability/dashboards/hotd-website.json \
    homeserver:/mnt/docker_containers/docker/observability/grafana/dashboards/hotd-website.json
ssh homeserver 'docker restart grafana'
```

Then disable the `grafana-dashboard-sync.yml` workflow in this repo to
avoid two pushers fighting over the dashboard.

---

## 2. `cloudgeeklabs/homenetwork` — knowledge base backfill

### 2a. `knowledge-base/observability/prometheus.md`

Add a row to the scrape-target table (the existing table groups jobs by
host — append under the cortana group, after `cortana_kube_state`):

```md
| `hotd_website` | `192.168.10.210:9464` | 30s | HotD campaign website Node.js app metrics (prom-client). Repo: `knoxrpg-hotd-website`. |
```

Update the "current scrape target count" line at the top of the file
(13 → 14, or whatever the current value is at PR time).

### 2b. `knowledge-base/observability/exporters.md`

Add a row to the application-exporters table:

```md
| HotD website | `knoxrpg-hotd-website` | `prom-client` (Node.js) | `192.168.10.210:9464/metrics` | Counter/histogram set in `src/lib/metrics.js`; auth + AI + DB + RED + Node runtime. |
```

### 2c. `knowledge-base/observability/grafana.md`

Add to the dashboard inventory:

```md
| `hotd-website` | HotD Website | knoxrpg-hotd-website | Prometheus + Loki | Service health, AI usage, auth, DB, Node runtime, logs. |
```

### 2d. `knowledge-base/knoxrpg-services/hotd-website.md`

Append a new "Observability" section:

```md
## Observability

- **Metrics endpoint:** `http://192.168.10.210:9464/metrics` (LAN only; blocked at the public ingress via `nginx.ingress.kubernetes.io/server-snippet`).
- **Prometheus job:** `hotd_website` (30 s interval).
- **Loki ingestion:** until a cluster-wide log collector lands, the pod can push JSON log lines directly to `http://192.168.10.20:3100/loki/api/v1/push`. Enable via Helm:
  ```yaml
  observability:
    logs: { format: "json" }
    loki:
      enabled: true
      pushUrl: "http://192.168.10.20:3100/loki/api/v1/push"
  ```
- **Grafana dashboard:** `HotD Website` (uid `hotd-website`). Source of truth: `knoxrpg-hotd-website/observability/dashboards/hotd-website.json`. Sync workflow: `.github/workflows/grafana-dashboard-sync.yml`.
- **Tracing:** OTel SDK stub is wired but inert. To turn on, install `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/auto-instrumentations-node` in `src/package.json` and set:
  ```yaml
  observability:
    tracing:
      enabled: true
      endpoint: "http://192.168.10.20:4318/v1/traces"   # Tempo OTLP/HTTP
  ```
  Tempo is not yet deployed on the obs host; tracking under a future homenetwork PR.
```

---

## 3. (Future) Cluster log collector — out of scope for this PR

The in-process Loki shipper is a transitional path. The "right" long-term
shape is a Grafana Alloy (or Promtail) DaemonSet on MicroK8s reading
`/var/log/containers/*.log` and pushing to
`http://192.168.10.20:3100/loki/api/v1/push`, with labels populated from
the kubelet metadata. That belongs in either `cloudgeeklabs/homenetwork`
(Ansible) or a new `cortana-loki-collector` Helm chart, not this repo.

When that lands, set `observability.loki.enabled: false` in this chart's
values to stop the duplicate stream.
