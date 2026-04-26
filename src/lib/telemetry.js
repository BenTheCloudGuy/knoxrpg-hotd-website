// ══════════════════════════════════════════════════════════════
// ── Telemetry — App Insights custom event tracking ────────────
// Provides trackEvent/trackMetric wrappers. No-ops gracefully
// when App Insights is not configured.
// ══════════════════════════════════════════════════════════════

let _appInsights = null;
try { _appInsights = require("applicationinsights"); } catch (_) {}

// Lazy getter — App Insights may be late-initialized from Key Vault
function getClient() {
  return _appInsights ? _appInsights.defaultClient : null;
}

/**
 * Track a custom event with properties and optional metrics.
 */
function trackEvent(name, properties = {}, measurements = {}) {
  const client = getClient();
  if (!client) return;
  try {
    client.trackEvent({ name, properties, measurements });
  } catch (_) {}
}

/**
 * Track a numeric metric.
 */
function trackMetric(name, value) {
  const client = getClient();
  if (!client) return;
  try {
    client.trackMetric({ name, value });
  } catch (_) {}
}

// ── Specific event helpers ───────────────────────────────────

function trackLogin(username, success, ip, userAgent) {
  trackEvent("AuthLogin", {
    username,
    success: String(success),
    ip: ip || "",
    userAgent: (userAgent || "").slice(0, 200),
  });
}

function trackSignup(username, ip) {
  trackEvent("AuthSignup", { username, ip: ip || "" });
}

function trackLogout(username) {
  trackEvent("AuthLogout", { username });
}

function trackAiChat(opts = {}) {
  trackEvent("DmAiChat", {
    username: opts.username || "",
    isDM: String(opts.isDM || false),
    model: opts.model || "",
    finishReason: opts.finishReason || "",
    toolCalls: opts.toolCalls || "",
  }, {
    latencyMs: opts.latencyMs || 0,
    promptTokens: opts.promptTokens || 0,
    completionTokens: opts.completionTokens || 0,
    totalTokens: opts.totalTokens || 0,
    toolRounds: opts.toolRounds || 0,
  });
}

function trackDbQuery(sql, rowCount, latencyMs, userRole) {
  trackEvent("GenericDbQuery", {
    sql: (sql || "").slice(0, 500),
    userRole: userRole || "",
  }, {
    rowCount: rowCount || 0,
    latencyMs: latencyMs || 0,
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
