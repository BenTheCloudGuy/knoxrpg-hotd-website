// ══════════════════════════════════════════════════════════════
// ── Prometheus metrics (prom-client) ──────────────────────────
// Exposed on a separate HTTP listener (default :9464) so /metrics
// never travels through the public ingress. The UnRAID Prometheus
// pulls this endpoint via the cortana host IP — see
// observability/README.md for the scrape-config snippet.
// ══════════════════════════════════════════════════════════════

let promClient;
try { promClient = require("prom-client"); } catch (_e) { promClient = null; }

const ENABLED = !!promClient && process.env.METRICS_ENABLED !== "false";

// ── Safe no-op shims when prom-client is missing (dev / minimal installs) ──
function noop() {}
const noopMetric = {
  inc: noop,
  observe: noop,
  set: noop,
  startTimer: () => noop,
  labels: () => noopMetric,
};

let registry = null;
let httpRequestsTotal = noopMetric;
let httpRequestDurationSeconds = noopMetric;
let pgPoolTotal = noopMetric;
let pgPoolIdle = noopMetric;
let pgPoolWaiting = noopMetric;
let dbQueriesTotal = noopMetric;
let dbQueryDurationSeconds = noopMetric;
let openaiRequestsTotal = noopMetric;
let openaiRequestDurationSeconds = noopMetric;
let openaiTokensTotal = noopMetric;
let openaiToolRoundsTotal = noopMetric;
let openaiImagesTotal = noopMetric;
let openaiImageDurationSeconds = noopMetric;
let openaiEmbeddingsTotal = noopMetric;
let openaiEmbeddingDurationSeconds = noopMetric;
let ragQueriesTotal = noopMetric;
let authAttemptsTotal = noopMetric;
let authSignupsTotal = noopMetric;
let authLogoutsTotal = noopMetric;
let requestsByGeoTotal = noopMetric;

if (ENABLED) {
  registry = new promClient.Registry();
  registry.setDefaultLabels({ app: "hotd-website" });
  promClient.collectDefaultMetrics({ register: registry, prefix: "" });

  httpRequestsTotal = new promClient.Counter({
    name: "http_requests_total",
    help: "Total HTTP requests handled, labeled by method, normalized route, and status class.",
    labelNames: ["method", "route", "status"],
    registers: [registry],
  });

  httpRequestDurationSeconds = new promClient.Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds (server-side).",
    labelNames: ["method", "route", "status"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  pgPoolTotal = new promClient.Gauge({
    name: "hotd_pg_pool_total_connections",
    help: "Total connections held by the pg pool (idle + in-use).",
    registers: [registry],
  });
  pgPoolIdle = new promClient.Gauge({
    name: "hotd_pg_pool_idle_connections",
    help: "Idle pg pool connections.",
    registers: [registry],
  });
  pgPoolWaiting = new promClient.Gauge({
    name: "hotd_pg_pool_waiting_clients",
    help: "Clients waiting for a pg pool connection.",
    registers: [registry],
  });

  dbQueriesTotal = new promClient.Counter({
    name: "hotd_db_queries_total",
    help: "Database queries executed (from telemetry hooks).",
    labelNames: ["role"],
    registers: [registry],
  });
  dbQueryDurationSeconds = new promClient.Histogram({
    name: "hotd_db_query_duration_seconds",
    help: "Database query duration in seconds.",
    labelNames: ["role"],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [registry],
  });

  openaiRequestsTotal = new promClient.Counter({
    name: "hotd_openai_requests_total",
    help: "OpenAI chat completions, labeled by model and finish reason.",
    labelNames: ["model", "finish_reason", "is_dm"],
    registers: [registry],
  });
  openaiRequestDurationSeconds = new promClient.Histogram({
    name: "hotd_openai_request_duration_seconds",
    help: "OpenAI chat completion latency in seconds.",
    labelNames: ["model"],
    buckets: [0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    registers: [registry],
  });
  openaiTokensTotal = new promClient.Counter({
    name: "hotd_openai_tokens_total",
    help: "OpenAI tokens consumed, labeled by model and token kind.",
    labelNames: ["model", "kind"],
    registers: [registry],
  });
  openaiToolRoundsTotal = new promClient.Counter({
    name: "hotd_openai_tool_rounds_total",
    help: "Function-calling tool rounds executed per request (sum).",
    labelNames: ["model"],
    registers: [registry],
  });

  openaiImagesTotal = new promClient.Counter({
    name: "hotd_openai_images_total",
    help: "OpenAI image generations, labeled by model, size, quality, and result (success|failure).",
    labelNames: ["model", "size", "quality", "result"],
    registers: [registry],
  });
  openaiImageDurationSeconds = new promClient.Histogram({
    name: "hotd_openai_image_duration_seconds",
    help: "OpenAI image generation latency in seconds.",
    labelNames: ["model", "size"],
    buckets: [1, 2.5, 5, 10, 20, 30, 60, 120],
    registers: [registry],
  });

  openaiEmbeddingsTotal = new promClient.Counter({
    name: "hotd_openai_embeddings_total",
    help: "OpenAI embedding requests, labeled by model and result (success|failure).",
    labelNames: ["model", "result"],
    registers: [registry],
  });
  openaiEmbeddingDurationSeconds = new promClient.Histogram({
    name: "hotd_openai_embedding_duration_seconds",
    help: "OpenAI embedding request latency in seconds.",
    labelNames: ["model"],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });

  ragQueriesTotal = new promClient.Counter({
    name: "hotd_rag_queries_total",
    help: "RAG embedding searches issued.",
    labelNames: ["result"],
    registers: [registry],
  });

  authAttemptsTotal = new promClient.Counter({
    name: "hotd_auth_attempts_total",
    help: "Auth login attempts, labeled by result (success|failure).",
    labelNames: ["result"],
    registers: [registry],
  });
  authSignupsTotal = new promClient.Counter({
    name: "hotd_auth_signups_total",
    help: "New user signups.",
    registers: [registry],
  });
  authLogoutsTotal = new promClient.Counter({
    name: "hotd_auth_logouts_total",
    help: "Session logouts.",
    registers: [registry],
  });

  // Visitor geography. Country is ISO-3166-1 alpha-2 ("US", "GB", ...) or
  // "unknown" when the IP is private / unresolved. Route uses the same
  // bounded normalizer as http_requests_total so total cardinality stays
  // ~countries × ~routes (well under 5000).
  requestsByGeoTotal = new promClient.Counter({
    name: "hotd_requests_by_geo_total",
    help: "HTTP requests by visitor country and normalized route.",
    labelNames: ["country", "route"],
    registers: [registry],
  });
}

// ── Route normalizer (cardinality control) ────────────────────
// Bucket pathnames so the `route` label stays bounded. We keep
// the first one or two segments and treat anything numeric / hex
// (IDs, hashes, slugs) as a wildcard.
function normalizeRoute(pathname) {
  if (!pathname || pathname === "/") return "/";
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return "/";

  const first = segs[0].toLowerCase();
  // Single-segment routes
  const singleton = new Set([
    "health", "healthz", "login", "logout", "signup",
    "auth", "search", "metrics",
  ]);
  if (singleton.has(first)) return `/${first}`;

  // Two-segment for API / admin surfaces
  const twoSeg = new Set([
    "api", "admin", "dm-admin", "reference", "hotd-content",
    "images", "css", "js", "sessions", "npcs", "groups",
    "realms", "characters", "calendar", "monsters", "spells",
    "magic-items", "handouts", "artifacts", "monster", "spell",
  ]);
  if (twoSeg.has(first)) {
    const second = segs[1] ? segs[1].toLowerCase() : "";
    // Treat purely numeric / hex / slug-like second segments as wildcards
    if (!second) return `/${first}`;
    if (/^\d+$/.test(second) || /^[a-f0-9]{16,}$/i.test(second)) return `/${first}/:id`;
    return `/${first}/${second}`;
  }

  // Default: just the first segment
  return `/${first}`;
}

// ── HTTP timing wrapper ───────────────────────────────────────
function observeHttp(method, pathname, statusCode, durationSeconds) {
  if (!ENABLED) return;
  const route = normalizeRoute(pathname);
  const status = String(statusCode || 0);
  httpRequestsTotal.labels(method, route, status).inc();
  httpRequestDurationSeconds.labels(method, route, status).observe(durationSeconds);
}

// ── PG pool gauge poller ──────────────────────────────────────
// Pool exposes totalCount / idleCount / waitingCount on every pg.Pool.
function startPgPoolPoll(pool, intervalMs) {
  if (!ENABLED || !pool) return null;
  const tick = () => {
    try {
      pgPoolTotal.set(pool.totalCount || 0);
      pgPoolIdle.set(pool.idleCount || 0);
      pgPoolWaiting.set(pool.waitingCount || 0);
    } catch (_e) { /* never throw from a poller */ }
  };
  tick();
  const handle = setInterval(tick, intervalMs || 15000);
  if (handle && typeof handle.unref === "function") handle.unref();
  return handle;
}

// ── /metrics listener ─────────────────────────────────────────
let metricsServer = null;
function startMetricsServer(opts = {}) {
  if (!ENABLED) return null;
  if (metricsServer) return metricsServer;

  const http = require("http");
  const port = parseInt(process.env.METRICS_PORT || opts.port || "9464", 10);
  const bindAddr = process.env.METRICS_BIND_ADDR || opts.bindAddr || "0.0.0.0";

  metricsServer = http.createServer(async (req, res) => {
    if (!req.url || (req.url !== "/metrics" && req.url !== "/")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("not found");
    }
    try {
      const body = await registry.metrics();
      res.writeHead(200, { "Content-Type": registry.contentType });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(String(err && err.message ? err.message : err));
    }
  });

  metricsServer.listen(port, bindAddr, () => {
    console.log(`  Metrics: listening on http://${bindAddr}:${port}/metrics`);
  });
  metricsServer.on("error", (err) => {
    console.warn(`  Metrics: listener error: ${err.message}`);
  });
  return metricsServer;
}

module.exports = {
  ENABLED,
  registry,
  observeHttp,
  startPgPoolPoll,
  startMetricsServer,
  normalizeRoute,
  // Direct metric handles for telemetry.js bridge:
  _metrics: {
    dbQueriesTotal,
    dbQueryDurationSeconds,
    openaiRequestsTotal,
    openaiRequestDurationSeconds,
    openaiTokensTotal,
    openaiToolRoundsTotal,
    openaiImagesTotal,
    openaiImageDurationSeconds,
    openaiEmbeddingsTotal,
    openaiEmbeddingDurationSeconds,
    ragQueriesTotal,
    authAttemptsTotal,
    authSignupsTotal,
    authLogoutsTotal,
    requestsByGeoTotal,
  },
};
