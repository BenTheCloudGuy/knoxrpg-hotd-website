# HotD Website — Observability

This folder holds Prometheus / Loki / Grafana wiring for the Halls of the
Damned website. The runtime observability stack itself (Prometheus, Loki,
Grafana, Promtail) lives on a separate UnRAID host as docker containers and
is owned by the homenetwork repo. The HotD repo only owns:

- Application metrics exposition (`prom-client` on a separate port)
- Structured-log emission shape (JSON to stdout when enabled)
- A Grafana dashboard JSON the operator imports into their existing Grafana
- A Prometheus scrape-config snippet the operator drops into their existing
  `prometheus.yml`

Treat host IPs as secrets. The samples below use `${OBS_HOST}` /
`${UNRAID_HOST}` / `${CORTANA_HOST}` placeholders — substitute when applying.

## What gets exposed

| Surface | Where | Default port | Notes |
| --- | --- | --- | --- |
| `/metrics` | Separate HTTP listener inside the pod | `9464` | NOT routed through the public ingress. Bound to `0.0.0.0` so the host port (hostNetwork mode) is reachable from the LAN-side Prometheus. |
| Structured logs | Pod stdout / `kubectl logs` | — | Set `HOTD_LOG_FORMAT=json` to emit JSON; otherwise legacy `[telemetry:*]` shape. |

The website pod runs with `hostNetwork: true` (already in `values.yaml` to
support the Azure Arc managed identity). That means `:9464` on the pod is
literally `:9464` on the cortana host, the same way Foundry instances expose
`30300/30301/30302`.

## Metrics catalog

All metrics share the default label `app="hotd-website"`. The `instance`
label is set by Prometheus from the scrape target (recommend `hotd`).

### HTTP (RED)

- `http_requests_total{method, route, status}` — counter
- `http_request_duration_seconds{method, route, status}` — histogram
  (buckets: 5ms..10s)

`route` is a low-cardinality template: `/api/foo`, `/admin/sessions`,
`/sessions/:id`, etc. Bare IDs and hashes collapse to `:id`.

### PostgreSQL pool

- `hotd_pg_pool_total_connections` — gauge
- `hotd_pg_pool_idle_connections` — gauge
- `hotd_pg_pool_waiting_clients` — gauge
- `hotd_db_queries_total{role}` — counter
- `hotd_db_query_duration_seconds{role}` — histogram

### OpenAI / RAG

- `hotd_openai_requests_total{model, finish_reason, is_dm}` — counter
- `hotd_openai_request_duration_seconds{model}` — histogram
- `hotd_openai_tokens_total{model, kind}` — counter (`kind`=`prompt|completion|total`)
- `hotd_openai_tool_rounds_total{model}` — counter
- `hotd_rag_queries_total{result}` — counter (`result`=`hit|empty|error`)

### Auth

- `hotd_auth_attempts_total{result}` — counter (`success|failure`)
- `hotd_auth_signups_total` — counter
- `hotd_auth_logouts_total` — counter

Plus prom-client's default process / event-loop / GC metrics
(`process_cpu_seconds_total`, `nodejs_eventloop_lag_seconds`, etc.).

## Wire-up

### 1. Application side (already done in this repo)

`prom-client` is a dependency in `src/package.json`. The metrics listener
starts automatically on `METRICS_PORT` (default `9464`) when the pod boots.
Disable with `METRICS_ENABLED=false`.

The Helm chart exposes the relevant knobs under `observability:` in
`values.yaml`:

```yaml
observability:
  metrics:
    enabled: true
    port: 9464
    bindAddr: "0.0.0.0"
  logs:
    format: "json"   # or "" to keep the legacy shape
```

### 2. UnRAID Prometheus — add scrape target

Edit `/mnt/docker_containers/docker/observability/prometheus/prometheus.yml`
on the observability host and append:

```yaml
  - job_name: hotd_website
    scrape_interval: 30s
    metrics_path: /metrics
    static_configs:
      - targets: ['${CORTANA_HOST}:9464']
        labels:
          instance: hotd
          app: hotd-website
```

Validate, then reload (no restart):

```bash
ssh ${OBS_HOST} \
  'docker run --rm \
     -v /mnt/docker_containers/docker/observability/prometheus:/p \
     prom/prometheus:v3.3.0 promtool check config /p/prometheus.yml'

ssh ${OBS_HOST} 'curl -fsS -XPOST http://localhost:9090/-/reload'
```

Confirm uptake:

```bash
ssh ${OBS_HOST} \
  "curl -s http://localhost:9090/api/v1/targets \
    | jq '.data.activeTargets[] | select(.labels.job==\"hotd_website\")'"
```

You should see the target as `up`. If it sits at `down`, check that the pod
is actually listening (`microk8s kubectl exec -n hotd-website
deploy/hotd-website -- curl -fsS http://localhost:9464/metrics | head`).

### 3. Grafana — import the dashboard

The dashboard JSON lives at
[`observability/dashboards/hotd-website.json`](./dashboards/hotd-website.json).

**Option A — provisioned (preferred):** the homenetwork repo's Grafana
container auto-loads anything dropped into `/var/lib/grafana/dashboards`.
Copy the JSON onto the obs host and restart Grafana:

```bash
scp observability/dashboards/hotd-website.json \
    ${OBS_HOST}:/mnt/docker_containers/docker/observability/grafana/dashboards/hotd-website.json
ssh ${OBS_HOST} 'docker restart grafana'
```

**Option B — import via UI:** Grafana → Dashboards → New → Import → upload
the JSON. Select `Prometheus` (uid `prometheus`) as the datasource if
prompted.

The dashboard expects:

- Prometheus datasource UID `prometheus` (already provisioned)
- Loki datasource UID `loki` (already provisioned, used by the Logs panel)

Both UIDs match what's configured in
`provisioning/datasources/datasources.yml` on the obs host.

## Logs (Loki)

Today there is no log shipper inside MicroK8s, so the Logs panel on the
dashboard will be empty until one is deployed. Two paths exist:

1. **Grafana Alloy DaemonSet** (recommended for new deploys) — tails
   container stdout via the kubelet, pushes to `http://${UNRAID_HOST}:3100/loki/api/v1/push`.
   Alloy replaces Promtail upstream.
2. **Promtail DaemonSet** — keeps parity with what the obs host already runs.

When deployed, set the app to emit JSON so Loki pipeline stages can extract
fields cleanly:

```yaml
# helm/hotd-website values override
observability:
  logs:
    format: "json"
```

This produces one JSON line per event: `{ "ts", "level", "msg", "kind",
"route", "status", "duration_ms", ... }`. Loki query examples:

```logql
# all errors in the last hour
{app="hotd-website"} | json | level="error"

# slow requests (>1s)
{app="hotd-website"} | json | duration_ms > 1000

# auth failures by username (low cardinality — the field is bounded)
sum by (username) (count_over_time({app="hotd-website"} | json | kind="auth.login" and success="false" [1h]))
```

A sample Alloy DaemonSet manifest is intentionally NOT bundled here yet;
deploy it as a separate concern once the operator decides on Alloy vs
Promtail.

## Networking asks for the operator

- **No new firewall rules needed.** Prometheus already reaches the cortana
  host on `30300-30302`, `30400`, `30081`, `9100`, `30919`. `9464` is on
  the same LAN segment and uses the same path. Confirm with
  `curl -fsS http://${CORTANA_HOST}:9464/metrics | head` from the obs host.
- **No new secrets needed for Phase 1.** Loki has `auth_enabled: false` on
  the LAN; Prometheus scrapes without auth. If Loki ever gets a tenant
  token, the app's push path (not the scrape path) is what needs the
  secret — wire it through Key Vault at that point, not now.
- **DNS** — the dashboard's panels reference Prometheus and Loki by their
  provisioned Grafana datasource UIDs, not by URL, so no DNS work is
  required on this side.

## Validation

```bash
# Helm template renders cleanly
helm template hotd-website helm/hotd-website/ \
  --set postgres.password=test \
  > /tmp/hotd-rendered.yaml
grep -q 'name: metrics' /tmp/hotd-rendered.yaml || echo "MISSING metrics port"

# Dashboard JSON is valid
jq empty observability/dashboards/*.json

# App boots and exposes /metrics
node --check src/server.js
node --check src/lib/metrics.js
node --check src/lib/telemetry.js
```

A GitHub Actions workflow at
`.github/workflows/validate-observability.yml` runs the same checks on
push to `observability/**`, `helm/**`, or `src/lib/metrics.js`.
