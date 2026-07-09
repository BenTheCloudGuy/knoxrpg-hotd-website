// ══════════════════════════════════════════════════════════════
// ── PAGE ROUTES (dispatch to renderers) ──────────────────────
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, parseForm } = require("../lib/utils");

// Campaign pages
const {
  renderHouseRulesPage, renderOvercastingPage, renderCircleMagicPage,
  renderHomePage, renderCalendarPage, renderMapsPage,
  renderNpcsPage, renderNpcDetailPage, renderSessionsPage, renderCharactersPage,
  renderHistoryPage, renderArtifactsPage, renderHandoutsPage, renderArtGalleryPage,
  renderArtifactDetailPage, renderHandoutDetailPage,
  renderGroupsPage, renderGroupDetailPage,
  renderRealmsPage, renderRealmDetailPage,
} = require("../pages/campaign");

// Admin pages
const {
  renderCalendarAdminPage, renderMapsAdminPage,
  renderNpcsAdminPage, renderSessionsAdminPage, renderArtifactsAdminPage,
  renderHandoutsAdminPage, renderArtAdminPage, renderBulkUploadAdminPage,
  renderMapAdminPage, renderCharactersAdminPage,
} = require("../pages/admin");

// Auth pages
const { renderUserAccountPage, renderAdminAccountPage } = require("../pages/auth");

// Special pages
const { renderDungeonMasterPage, renderSearchPage, renderReferencePage, render404Page } = require("../pages/special");

// DM Management Interface
const { renderDmAdminPage } = require("../pages/dm-admin");

/**
 * Handle page routes. Returns true if the route was handled, false otherwise.
 */
async function handlePageRoutes(decoded, req, res, session, url) {

  // ── Account update (POST) ──────────────────────────────────
  if (decoded === "/account/update" && req.method === "POST" && session) {
    const body = await readBody(req); const form = parseForm(body);
    try {
      await pgPool.query(
        "UPDATE account_info SET first_name = $1, last_name = $2, email = $3 WHERE id = $4",
        [form.firstName, form.lastName, form.email, session.userId]
      );
      session.firstName = form.firstName; session.lastName = form.lastName; session.email = form.email;
    } catch (e) { console.error(e); }
    res.writeHead(302, { Location: "/account" }); res.end();
    return true;
  }

  // ── Account page ───────────────────────────────────────────
  if (decoded === "/account") {
    if (!session) { res.writeHead(302, { Location: "/login" }); res.end(); return true; }
    let html;
    if (session.role === "admin") {
      try {
        const result = await pgPool.query("SELECT id, username, first_name, last_name, email, role, is_approved FROM account_info ORDER BY id");
        html = renderAdminAccountPage(session, result.rows);
      } catch (err) {
        console.error("Admin page error:", err);
        html = renderAdminAccountPage(session, [], null, "Failed to load users.");
      }
    } else {
      html = renderUserAccountPage(session);
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html);
    return true;
  }

  // ── DM Admin Interface ──────────────────────────────────────
  if (decoded === "/dm-admin") {
    if (!session || session.role !== "admin") { res.writeHead(302, { Location: "/login" }); res.end(); return true; }
    const html = await renderDmAdminPage(session);
    if (html) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return true; }
  }

  // ── NPC detail page ─────────────────────────────────────────
  if (decoded.startsWith("/npcs/") && decoded !== "/npcs" && decoded !== "/npcs/admin") {
    const npcId = parseInt(decoded.split("/")[2], 10);
    if (!isNaN(npcId)) {
      const detailHtml = await renderNpcDetailPage(npcId, session);
      if (detailHtml) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(detailHtml); return true; }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Character detail page → redirect to single page ────────
  // Skip /characters/admin so the GM Player Workspace renderer can run below.
  if (decoded.startsWith("/characters/") && decoded !== "/characters" && decoded !== "/characters/admin") {
    const charId = parseInt(decoded.split("/")[2], 10);
    const anchor = !isNaN(charId) ? `#character-${charId}` : "";
    res.writeHead(302, { Location: `/characters${anchor}` }); res.end();
    return true;
  }

  // ── Artifact detail page ───────────────────────────────────
  if (decoded.startsWith("/artifacts/") && decoded !== "/artifacts" && decoded !== "/artifacts/admin") {
    const artifactId = parseInt(decoded.split("/")[2], 10);
    if (!isNaN(artifactId)) {
      const detailHtml = await renderArtifactDetailPage(artifactId, session);
      if (detailHtml) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(detailHtml); return true; }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Handout detail page ────────────────────────────────────
  if (decoded.startsWith("/handouts/") && decoded !== "/handouts" && decoded !== "/handouts/admin") {
    const handoutId = parseInt(decoded.split("/")[2], 10);
    if (!isNaN(handoutId)) {
      const detailHtml = await renderHandoutDetailPage(handoutId, session);
      if (detailHtml) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(detailHtml); return true; }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Realm detail page ─────────────────────────────────────
  if (decoded.startsWith("/realms/") && decoded !== "/realms") {
    const slug = decoded.split("/")[2];
    if (slug) {
      const detailHtml = await renderRealmDetailPage(slug, session);
      if (detailHtml) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(detailHtml); return true; }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Group detail page ──────────────────────────────────────
  if (decoded.startsWith("/groups/") && decoded !== "/groups") {
    const slug = decoded.split("/")[2];
    if (slug) {
      const detailHtml = await renderGroupDetailPage(slug, session);
      if (detailHtml) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(detailHtml); return true; }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Reference page (dynamic from embeddings) ───────────────
  if (decoded.startsWith("/reference/") && decoded !== "/reference") {
    const hash = decoded.split("/")[2];
    if (hash && /^[a-f0-9]{64}$/.test(hash)) {
      const html = await renderReferencePage(hash, session);
      if (html) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return true; }
    }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Admin pages ────────────────────────────────────────────
  if (decoded.endsWith("/admin") && ["/home/admin","/calendar/admin","/maps/admin","/map/admin","/npcs/admin","/sessions/admin","/artifacts/admin","/handouts/admin","/art/admin","/bulk-upload/admin","/characters/admin"].includes(decoded)) {
    if (!session || session.role !== "admin") { res.writeHead(302, { Location: "/login" }); res.end(); return true; }
    // The Home Dashboard Admin page was retired: its Next Scheduled Game editor
    // moved to Calendar Admin and its other options became DM Command Center
    // dropdown links. Redirect any lingering /home/admin links there.
    if (decoded === "/home/admin") { res.writeHead(302, { Location: "/calendar/admin" }); res.end(); return true; }
    // Sessions Workspace retired: sessions now live in the Campaign Notebook.
    if (decoded === "/sessions/admin") { res.writeHead(302, { Location: "/dm-admin#notes" }); res.end(); return true; }
    let adminHtml;
    switch (decoded) {
      case "/calendar/admin": adminHtml = await renderCalendarAdminPage(session, url.searchParams.get("month")); break;
      case "/maps/admin": adminHtml = await renderMapsAdminPage(session); break;
      case "/map/admin": adminHtml = await renderMapAdminPage(session); break;
      case "/npcs/admin": adminHtml = await renderNpcsAdminPage(session); break;
      case "/artifacts/admin": adminHtml = await renderArtifactsAdminPage(session, "/artifacts"); break;
      case "/handouts/admin": adminHtml = await renderHandoutsAdminPage(session, "/handouts"); break;
      case "/art/admin": adminHtml = await renderArtAdminPage(session); break;
      case "/bulk-upload/admin": adminHtml = await renderBulkUploadAdminPage(session); break;
      case "/characters/admin": adminHtml = await renderCharactersAdminPage(session); break;
    }
    if (adminHtml) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(adminHtml); return true; }
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" }); res.end(render404Page());
    return true;
  }

  // ── Main page switch ───────────────────────────────────────
  let html;
  switch (decoded) {
    case "/":
      html = await renderHomePage(session); break;
    case "/house-rules":
      html = await renderHouseRulesPage(session); break;
    case "/overcasting":
      html = await renderOvercastingPage(session); break;
    case "/circle-magic":
      html = await renderCircleMagicPage(session); break;
    case "/calendar":
      html = await renderCalendarPage(session, url.searchParams.get("month")); break;
    case "/maps":
      html = await renderMapsPage(session, url.searchParams.get("page")); break;
    case "/npcs":
      html = await renderNpcsPage(session); break;
    case "/characters":
      html = await renderCharactersPage(session); break;
    case "/sessions":
      html = await renderSessionsPage(session); break;
    case "/history":
      html = await renderHistoryPage(session); break;
    case "/groups":
      html = await renderGroupsPage(session); break;
    case "/realms":
      html = await renderRealmsPage(session); break;
    case "/artifacts":
      html = await renderArtifactsPage(session); break;
    case "/handouts":
      html = await renderHandoutsPage(session); break;
    case "/art":
      html = await renderArtGalleryPage(session, url.searchParams); break;
    case "/dungeon-master":
      if (!session) { res.writeHead(302, { Location: "/login" }); res.end(); return true; }
      html = renderDungeonMasterPage(session); break;
    case "/search":
      if (!session) { res.writeHead(302, { Location: "/login" }); res.end(); return true; }
      html = renderSearchPage(session, url.searchParams.get("q")); break;
    default:
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(render404Page());
      return true;
  }

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
  return true;
}

module.exports = { handlePageRoutes };
