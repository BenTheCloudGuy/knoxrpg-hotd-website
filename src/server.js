#!/usr/bin/env node

// Tracing must be required before any other instrumented module so the OTel
// auto-instrumentations can hook them. No-op until OTEL_EXPORTER_OTLP_ENDPOINT is set.
require("./lib/tracing").start();

const http = require("http");
const crypto = require("crypto");
const path = require("path");

const { PORT, STATIC_ROOT, HOTD_CONTENT_DIR, HOTD_UPLOADS_DIR } = require("./config");
const { ensureSessionsTable, ensureHotdTables } = require("./db/schema");
const { serveFile, serveStaticFile, sendJSON, mimeType } = require("./lib/utils");
const { getSession } = require("./lib/auth");
const { initOpenAI } = require("./lib/azure");
const metrics = require("./lib/metrics");
const telemetry = require("./lib/telemetry");
const { pgPool } = require("./db/pool");

const { handleAuthRoutes }      = require("./routes/auth");
const { handleApiRoutes }       = require("./routes/api");
const { handleAdminRoutes }      = require("./routes/admin");
const { handleAdminTestRoutes } = require("./routes/admin-test");
const { handleDmAdminApiRoutes } = require("./routes/dm-admin-api");
const { handlePageRoutes }      = require("./routes/pages");

// ══════════════════════════════════════════════════════════════
// ── HTTP SERVER ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function dispatch(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const decoded = decodeURIComponent(pathname);

  // ── Static assets / health — skip DB session lookup ────────
  if (decoded === "/siteLogo.png") {
    return serveFile(res, path.join(STATIC_ROOT, "images", "hotd_logo.png"));
  }
  if (decoded.startsWith("/images/") || decoded.startsWith("/css/") || decoded.startsWith("/js/")) {
    return serveStaticFile(decoded.slice(1), res);
  }
  // ── Local HOTD content (writable uploads PVC overlayed over read-only NAS) ─
  if ((HOTD_UPLOADS_DIR || HOTD_CONTENT_DIR) && decoded.startsWith("/hotd-content/")) {
    const relative = decodeURIComponent(decoded.slice("/hotd-content/".length));
    // Try the writable uploads PVC first, then the NAS read-only mount.
    const roots = [HOTD_UPLOADS_DIR, HOTD_CONTENT_DIR].filter(Boolean);
    for (const root of roots) {
      const fullPath = require("path").join(root, relative);
      if (!fullPath.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
      if (require("fs").existsSync(fullPath)) {
        return serveFile(res, fullPath);
      }
    }
    // Fall through to the last root so serveFile can emit a clean 404.
    const lastRoot = roots[roots.length - 1];
    return serveFile(res, require("path").join(lastRoot, relative));
  }
  if (decoded === "/health" || decoded === "/healthz") {
    return sendJSON(res, { status: "ok", app: "hotd-campaign", ts: new Date().toISOString() });
  }

  // ── Session (only for dynamic pages) ───────────────────────
  const session = await getSession(req);
  // Stash on req so the outer per-request log can read username/role.
  req.session = session;

  // ── Auth routes (before auth gate) ─────────────────────────
  if (await handleAuthRoutes(decoded, req, res, session, url)) return;

  // ── API routes ─────────────────────────────────────────────
  if (await handleApiRoutes(decoded, req, res, session, url)) return;

  // ── Admin API test routes (test console + debug endpoints) ─
  if (await handleAdminTestRoutes(decoded, req, res, session, url)) return;

  // ── DM Admin API routes ────────────────────────────────────
  if (await handleDmAdminApiRoutes(decoded, req, res, session)) return;

  // ── Auth gate ──────────────────────────────────────────────
  const AUTH_EXEMPT = ["/siteLogo.png", "/", "/index.html"];
  const isStaticAsset = decoded.startsWith("/images/") || decoded.startsWith("/css/");
  const isApiRoute = decoded.startsWith("/api/");
  if (!session && !AUTH_EXEMPT.includes(decoded) && !isStaticAsset && !isApiRoute) {
    res.writeHead(302, { Location: "/login" });
    return res.end();
  }

  // ── Admin routes (campaign CRUD) ───────────────────────────
  if (await handleAdminRoutes(decoded, req, res, session)) return;

  // ── Page routes ────────────────────────────────────────────
  await handlePageRoutes(decoded, req, res, session, url);
}

const server = http.createServer(async (req, res) => {
  const startNs = process.hrtime.bigint();

  // ── Per-request correlation (App-Insights style operation_Id) ───
  // Accept inbound `traceparent` (W3C) if a future cluster collector
  // injects one; otherwise mint a fresh UUID. operationId == requestId
  // unless a parent trace exists.
  const requestId = (crypto.randomUUID && crypto.randomUUID()) ||
    crypto.randomBytes(16).toString("hex");
  let operationId = requestId;
  let parentId = "";
  const traceparent = req.headers["traceparent"];
  if (typeof traceparent === "string") {
    // version-traceid-parentid-flags
    const parts = traceparent.split("-");
    if (parts.length >= 3 && parts[1] && parts[1] !== "0".repeat(32)) {
      operationId = parts[1];
      parentId = parts[2];
    }
  }
  req.requestId = requestId;
  req.operationId = operationId;
  res.setHeader("X-Request-Id", requestId);

  // ── Capture bytes-sent without rewriting every res.end call ─────
  let bytesSent = 0;
  const _write = res.write.bind(res);
  const _end = res.end.bind(res);
  res.write = function (chunk, ...rest) {
    if (chunk) bytesSent += Buffer.byteLength(chunk, typeof rest[0] === "string" ? rest[0] : "utf8");
    return _write(chunk, ...rest);
  };
  res.end = function (chunk, ...rest) {
    if (chunk) bytesSent += Buffer.byteLength(chunk, typeof rest[0] === "string" ? rest[0] : "utf8");
    return _end(chunk, ...rest);
  };

  // ── Capture session-derived identity once the dispatcher has run ─
  // (server-side stash so we don't double-lookup the session). The
  // auth/getSession path already populates req.session when called;
  // for routes that resolve session inside dispatch() we pull from
  // req.session at finish time.
  let dispatchError = null;
  try {
    await dispatch(req, res);
  } catch (err) {
    dispatchError = err;
    if (!res.headersSent) {
      try { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("internal error"); } catch (_) {}
    }
    console.error(`[server] dispatch error: ${err && err.stack || err}`);
    try {
      const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      telemetry.trackException(err, {
        requestId,
        operationId,
        method: req.method || "GET",
        url: u.pathname + (u.search || ""),
        route: metrics.normalizeRoute(u.pathname),
        username: (req.session && req.session.username) || "",
        role: (req.session && req.session.role) || "",
        source: "server.dispatch",
      });
    } catch (_) { /* never throw from telemetry */ }
  }

  // ── Emit prom metric + per-request log on socket close ──────────
  const emitTelemetry = () => {
    try {
      const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;
      const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const pathname = u.pathname.replace(/\/+$/, "") || "/";
      const route = metrics.normalizeRoute(pathname);
      const method = req.method || "GET";
      const status = res.statusCode || 0;

      if (metrics.ENABLED) {
        metrics.observeHttp(method, pathname, status, durationSec);
      }

      // Skip the noisy paths that would dominate Loki without adding
      // signal. Health probes and static assets are still in Prometheus
      // (above), just not as individual request log lines.
      const isStatic = pathname.startsWith("/images/") ||
        pathname.startsWith("/css/") ||
        pathname.startsWith("/js/") ||
        pathname.startsWith("/hotd-content/") ||
        pathname === "/siteLogo.png";
      const isHealth = pathname === "/health" || pathname === "/healthz" || pathname === "/metrics";
      if (isHealth) return;
      if (isStatic && status < 400) return;

      const ip = (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
        (req.socket && req.socket.remoteAddress) || "";

      telemetry.trackRequest({
        method,
        url: pathname + (u.search || ""),
        route,
        statusCode: status,
        durationMs: durationSec * 1000,
        requestId,
        operationId,
        parentId,
        ip,
        userAgent: req.headers["user-agent"] || "",
        referer: req.headers["referer"] || req.headers["referrer"] || "",
        username: (req.session && req.session.username) || "",
        role: (req.session && req.session.role) || "",
        queryString: u.search ? u.search.slice(1) : "",
        responseSize: bytesSent,
        contentType: res.getHeader && (res.getHeader("content-type") || ""),
        isStatic,
      });
    } catch (_) { /* never throw from telemetry */ }
  };

  if (res.writableEnded) emitTelemetry();
  else res.once("close", emitTelemetry);
});

server.listen(PORT, async () => {
  console.log(`\n  Halls of the Damned campaign server`);
  console.log(`  Listening on http://localhost:${PORT}`);
  metrics.startMetricsServer();
  metrics.startPgPoolPoll(pgPool);
  await ensureSessionsTable();
  await ensureHotdTables();
  await initOpenAI();
  console.log(`  Press Ctrl+C to stop\n`);
});
