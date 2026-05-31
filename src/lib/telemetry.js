// ══════════════════════════════════════════════════════════════
// ── Telemetry shim ────────────────────────────────────────────
// This codebase no longer ships to Azure Application Insights. The
// helpers below preserve the public API so existing call sites in
// auth.js and ai-tools.js do not need to change, but they are no-ops
// by default. Set HOTD_TELEMETRY_LOG=1 to mirror events to stdout for
// local debugging; in production rely on `kubectl logs` for ordinary
// console output instead.
// ══════════════════════════════════════════════════════════════

const DEBUG = process.env.HOTD_TELEMETRY_LOG === "1";

function log(kind, payload) {
  if (!DEBUG) return;
  try {
    console.log(`[telemetry:${kind}] ${JSON.stringify(payload)}`);
  } catch (_) {
    console.log(`[telemetry:${kind}] (unserializable payload)`);
  }
}

function trackEvent(name, properties = {}, measurements = {}) {
  log("event", { name, properties, measurements });
}

function trackMetric(name, value) {
  log("metric", { name, value });
}

function trackLogin(username, success, ip, userAgent) {
  log("auth.login", {
    username,
    success: !!success,
    ip: ip || "",
    userAgent: (userAgent || "").slice(0, 200),
  });
}

function trackSignup(username, ip) {
  log("auth.signup", { username, ip: ip || "" });
}

function trackLogout(username) {
  log("auth.logout", { username });
}

function trackAiChat(opts = {}) {
  log("ai.chat", {
    username: opts.username || "",
    isDM: !!opts.isDM,
    model: opts.model || "",
    finishReason: opts.finishReason || "",
    toolCalls: opts.toolCalls || "",
    latencyMs: opts.latencyMs || 0,
    promptTokens: opts.promptTokens || 0,
    completionTokens: opts.completionTokens || 0,
    totalTokens: opts.totalTokens || 0,
    toolRounds: opts.toolRounds || 0,
  });
}

function trackDbQuery(sql, rowCount, latencyMs, userRole) {
  log("db.query", {
    sql: (sql || "").slice(0, 500),
    rowCount: rowCount || 0,
    latencyMs: latencyMs || 0,
    userRole: userRole || "",
  });
}

module.exports = {
  trackEvent,
  trackMetric,
  trackLogin,
  trackSignup,
  trackLogout,
  trackAiChat,
  trackDbQuery,
};
