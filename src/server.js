#!/usr/bin/env node

// ── Application Insights — must be initialized before all other imports ──
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  const appInsights = require("applicationinsights");
  appInsights.setup().start();
}

const http = require("http");
const path = require("path");

const { PORT, STATIC_ROOT, HOTD_CONTENT_DIR } = require("./config");
const { ensureSessionsTable, ensureHotdTables } = require("./db/schema");
const { serveFile, serveStaticFile, sendJSON, mimeType } = require("./lib/utils");
const { getSession } = require("./lib/auth");
const { initOpenAI } = require("./lib/azure");

const { handleAuthRoutes }  = require("./routes/auth");
const { handleApiRoutes }   = require("./routes/api");
const { handleAdminRoutes } = require("./routes/admin");
const { handlePageRoutes }  = require("./routes/pages");

// ══════════════════════════════════════════════════════════════
// ── HTTP SERVER ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const server = http.createServer(async (req, res) => {
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
});

server.listen(PORT, async () => {
  console.log(`\n  Halls of the Damned campaign server`);
  console.log(`  Listening on http://localhost:${PORT}`);
  await ensureSessionsTable();
  await ensureHotdTables();
  await initOpenAI();
  console.log(`  Press Ctrl+C to stop\n`);
});
