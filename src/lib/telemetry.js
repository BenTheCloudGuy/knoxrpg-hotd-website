// ══════════════════════════════════════════════════════════════
// ── Telemetry bridge ──────────────────────────────────────────
// Preserves the existing public API consumed by routes/auth.js and
// lib/ai-tools.js, while back-ending each event into:
//   • prom-client (via lib/metrics.js) — for Prometheus / Grafana
//   • structured JSON log lines on stdout (HOTD_LOG_FORMAT=json)
//   • optional Loki push (via lib/loki-shipper.js) until a
//     cluster-wide log collector lands in MicroK8s
//
// Compatibility:
//   • HOTD_TELEMETRY_LOG=1   → legacy `[telemetry:kind] {json}` stdout
//   • HOTD_LOG_FORMAT=json   → one JSON object per line on stdout
//                              (preferred when the cluster shipper is up)
//   • LOKI_PUSH_URL=…        → also forwards every event to Loki
// Both flags can be enabled simultaneously; metrics always fire.
// ══════════════════════════════════════════════════════════════

const metrics = require("./metrics");
const loki = require("./loki-shipper");

const DEBUG_LEGACY = process.env.HOTD_TELEMETRY_LOG === "1";
const JSON_LOGS = process.env.HOTD_LOG_FORMAT === "json";

// ── Counter for arbitrary trackEvent calls (bounded by call sites). ──
let eventsTotal = null;
if (metrics.ENABLED && metrics.registry) {
  try {
    const promClient = require("prom-client");
    eventsTotal = new promClient.Counter({
      name: "hotd_events_total",
      help: "Custom application events emitted via trackEvent.",
      labelNames: ["name"],
      registers: [metrics.registry],
    });
  } catch (_e) { /* prom-client missing — metrics module already no-ops */ }
}

function emitLog(kind, payload, level) {
  const lvl = level || "info";
  // 1. Legacy `[telemetry:kind] {json}` line (opt-in via env).
  if (DEBUG_LEGACY) {
    try { console.log(`[telemetry:${kind}] ${JSON.stringify(payload)}`); }
    catch (_) { console.log(`[telemetry:${kind}] (unserializable payload)`); }
  }
  // 2. Structured JSON line (preferred for Alloy / Promtail / Loki).
  if (JSON_LOGS || loki.ENABLED) {
    let line;
    try {
      line = JSON.stringify({
        ts: new Date().toISOString(),
        level: lvl,
        kind,
        ...payload,
      });
    } catch (_) {
      line = JSON.stringify({ ts: new Date().toISOString(), level: lvl, kind, msg: "unserializable" });
    }
    if (JSON_LOGS) {
      if (lvl === "error") console.error(line); else console.log(line);
    }
    if (loki.ENABLED) loki.enqueue(lvl, line);
  }
}

function trackEvent(name, properties = {}, measurements = {}) {
  emitLog("event", { name, properties, measurements });
  if (eventsTotal && name) {
    try { eventsTotal.labels(name).inc(); } catch (_) {}
  }
}

function trackMetric(name, value) {
  // No backing Prometheus type for free-form gauges — keep as log only.
  // For real metrics, define them in lib/metrics.js.
  emitLog("metric", { name, value });
}

function trackLogin(username, success, ip, userAgent) {
  const payload = {
    username,
    success: !!success,
    ip: ip || "",
    userAgent: (userAgent || "").slice(0, 200),
  };
  emitLog("auth.login", payload, success ? "info" : "warn");
  try {
    metrics._metrics.authAttemptsTotal.labels(success ? "success" : "failure").inc();
  } catch (_) {}
}

function trackSignup(username, ip) {
  emitLog("auth.signup", { username, ip: ip || "" });
  try { metrics._metrics.authSignupsTotal.inc(); } catch (_) {}
}

function trackLogout(username) {
  emitLog("auth.logout", { username });
  try { metrics._metrics.authLogoutsTotal.inc(); } catch (_) {}
}

function trackAiChat(opts = {}) {
  const payload = {
    username: opts.username || "",
    isDM: !!opts.isDM,
    model: opts.model || "",
    finishReason: opts.finishReason || "",
    toolCalls: opts.toolCalls || "",
    source: opts.source || "",
    latencyMs: opts.latencyMs || 0,
    promptTokens: opts.promptTokens || 0,
    completionTokens: opts.completionTokens || 0,
    totalTokens: opts.totalTokens || 0,
    toolRounds: opts.toolRounds || 0,
  };
  emitLog("ai.chat", payload);

  const model = payload.model || "unknown";
  const isDm = payload.isDM ? "true" : "false";
  try {
    metrics._metrics.openaiRequestsTotal
      .labels(model, payload.finishReason || "unknown", isDm).inc();
    if (payload.latencyMs > 0) {
      metrics._metrics.openaiRequestDurationSeconds
        .labels(model).observe(payload.latencyMs / 1000);
    }
    if (payload.promptTokens) {
      metrics._metrics.openaiTokensTotal.labels(model, "prompt").inc(payload.promptTokens);
    }
    if (payload.completionTokens) {
      metrics._metrics.openaiTokensTotal.labels(model, "completion").inc(payload.completionTokens);
    }
    if (payload.totalTokens) {
      metrics._metrics.openaiTokensTotal.labels(model, "total").inc(payload.totalTokens);
    }
    if (payload.toolRounds) {
      metrics._metrics.openaiToolRoundsTotal.labels(model).inc(payload.toolRounds);
    }
  } catch (_) {}
}

// Convenience wrapper: pass the raw OpenAI completion object and we extract
// usage/finish_reason/model automatically. Use this at every
// `openaiClient.chat.completions.create` call site so every chat request the
// website makes is counted.
function recordChatCompletion(completion, opts = {}) {
  const usage = (completion && completion.usage) || {};
  const choice = (completion && completion.choices && completion.choices[0]) || {};
  trackAiChat({
    username: opts.username || "",
    isDM: !!opts.isDM,
    model: opts.model || (completion && completion.model) || "unknown",
    finishReason: choice.finish_reason || opts.finishReason || "",
    source: opts.source || "",
    latencyMs: opts.latencyMs || 0,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    toolRounds: opts.toolRounds || 0,
  });
  return completion;
}

function trackAiImage(opts = {}) {
  const payload = {
    username: opts.username || "",
    model: opts.model || "",
    size: opts.size || "",
    quality: opts.quality || "",
    count: opts.count || 1,
    latencyMs: opts.latencyMs || 0,
    success: opts.success !== false,
    source: opts.source || "",
    error: opts.error || "",
  };
  emitLog("ai.image", payload, payload.success ? "info" : "warn");

  const model = payload.model || "unknown";
  const size = payload.size || "unknown";
  const quality = payload.quality || "unknown";
  const result = payload.success ? "success" : "failure";
  try {
    metrics._metrics.openaiImagesTotal.labels(model, size, quality, result).inc(payload.count || 1);
    if (payload.latencyMs > 0) {
      metrics._metrics.openaiImageDurationSeconds.labels(model, size).observe(payload.latencyMs / 1000);
    }
  } catch (_) {}
}

function trackAiEmbedding(opts = {}) {
  const payload = {
    model: opts.model || "",
    tokens: opts.tokens || 0,
    count: opts.count || 1,
    latencyMs: opts.latencyMs || 0,
    success: opts.success !== false,
    source: opts.source || "",
    error: opts.error || "",
  };
  emitLog("ai.embedding", payload, payload.success ? "info" : "warn");

  const model = payload.model || "unknown";
  const result = payload.success ? "success" : "failure";
  try {
    metrics._metrics.openaiEmbeddingsTotal.labels(model, result).inc(payload.count || 1);
    if (payload.latencyMs > 0) {
      metrics._metrics.openaiEmbeddingDurationSeconds.labels(model).observe(payload.latencyMs / 1000);
    }
    if (payload.tokens) {
      // Roll embedding tokens into the existing tokens counter under a
      // dedicated kind so dashboards can sum chat + embed spend by model.
      metrics._metrics.openaiTokensTotal.labels(model, "embedding").inc(payload.tokens);
    }
  } catch (_) {}
}

function trackDbQuery(sql, rowCount, latencyMs, userRole) {
  const role = userRole || "unknown";
  const payload = {
    sql: (sql || "").slice(0, 500),
    rowCount: rowCount || 0,
    latencyMs: latencyMs || 0,
    userRole: role,
  };
  emitLog("db.query", payload);
  try {
    metrics._metrics.dbQueriesTotal.labels(role).inc();
    if (latencyMs > 0) {
      metrics._metrics.dbQueryDurationSeconds.labels(role).observe(latencyMs / 1000);
    }
  } catch (_) {}
}

// ── Per-request log (App Insights `requests` table equivalent) ────────────
// Called once per HTTP request from server.js. One JSON line per request goes
// to stdout and Loki with a stable schema dashboards / Grafana Explore can
// pivot on (operation_Id correlates with downstream dependencies + exceptions).
function trackRequest(opts = {}) {
  const statusCode = opts.statusCode || 0;
  const success = statusCode > 0 && statusCode < 500;
  const lvl = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
  const payload = {
    name: opts.name || `${opts.method || "GET"} ${opts.route || "/"}`,
    method: opts.method || "GET",
    url: opts.url || "",
    route: opts.route || "",
    statusCode,
    success,
    durationMs: Math.round((opts.durationMs || 0) * 1000) / 1000,
    requestId: opts.requestId || "",
    operationId: opts.operationId || opts.requestId || "",
    parentId: opts.parentId || "",
    ip: opts.ip || "",
    userAgent: (opts.userAgent || "").slice(0, 200),
    referer: (opts.referer || "").slice(0, 200),
    username: opts.username || "",
    role: opts.role || "",
    queryString: (opts.queryString || "").slice(0, 500),
    responseSize: opts.responseSize || 0,
    contentType: (opts.contentType || "").slice(0, 100),
    isStatic: !!opts.isStatic,
  };
  emitLog("request", payload, lvl);
}

// ── Exception log (App Insights `exceptions` table equivalent) ────────────
// `ctx` should carry whatever correlation IDs are available so the exception
// can be joined back to the originating request in Loki.
function trackException(err, ctx = {}) {
  const e = err || {};
  const payload = {
    type: e.name || (typeof e === "string" ? "string" : typeof e),
    message: (e.message || String(e) || "").slice(0, 2000),
    stack: (e.stack || "").slice(0, 8000),
    code: e.code || "",
    severity: ctx.severity || "error",
    requestId: ctx.requestId || "",
    operationId: ctx.operationId || ctx.requestId || "",
    route: ctx.route || "",
    method: ctx.method || "",
    url: ctx.url || "",
    username: ctx.username || "",
    role: ctx.role || "",
    source: ctx.source || "",
  };
  emitLog("exception", payload, "error");
}

module.exports = {
  trackEvent,
  trackMetric,
  trackLogin,
  trackSignup,
  trackLogout,
  trackAiChat,
  recordChatCompletion,
  trackAiImage,
  trackAiEmbedding,
  trackDbQuery,
  trackRequest,
  trackException,
  // Re-exports for callers that want to record richer metrics directly:
  registry: metrics.registry,
  _metrics: metrics._metrics,
};
