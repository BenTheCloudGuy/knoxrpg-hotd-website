#!/usr/bin/env node

// Tracing must be required before any other instrumented module so the OTel
// auto-instrumentations can hook them. No-op until OTEL_EXPORTER_OTLP_ENDPOINT is set.
require("./lib/tracing").start();

const http = require("http");
const path = require("path");

const { PORT, STATIC_ROOT, HOTD_CONTENT_DIR } = require("./config");
const { ensureSessionsTable, ensureHotdTables } = require("./db/schema");
const { serveFile, serveStaticFile, sendJSON, mimeType } = require("./lib/utils");
const { getSession } = require("./lib/auth");
const { initOpenAI } = require("./lib/azure");
const metrics = require("./lib/metrics");
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
  // ── Local HOTD content from NAS ─────────────────────────────
  if (HOTD_CONTENT_DIR && decoded.startsWith("/hotd-content/")) {
    const relative = decodeURIComponent(decoded.slice("/hotd-content/".length));
    const fullPath = require("path").join(HOTD_CONTENT_DIR, relative);
    if (!fullPath.startsWith(HOTD_CONTENT_DIR)) { res.writeHead(403); return res.end("Forbidden"); }
    return serveFile(res, fullPath);
  }
  if (decoded === "/health" || decoded === "/healthz") {
    return sendJSON(res, { status: "ok", app: "hotd-campaign", ts: new Date().toISOString() });
  }

  // ── Session (only for dynamic pages) ───────────────────────
  const session = await getSession(req);

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
  try {
    await dispatch(req, res);
  } catch (err) {
    if (!res.headersSent) {
      try { res.writeHead(500, { "Content-Type": "text/plain" }); res.end("internal error"); } catch (_) {}
    }
    console.error(`[server] dispatch error: ${err && err.stack || err}`);
  } finally {
    if (metrics.ENABLED) {
      try {
        const durationSec = Number(process.hrtime.bigint() - startNs) / 1e9;
        const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const pathname = u.pathname.replace(/\/+$/, "") || "/";
        metrics.observeHttp(req.method || "GET", pathname, res.statusCode || 0, durationSec);
      } catch (_) { /* never throw from telemetry */ }
    }
  }
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
