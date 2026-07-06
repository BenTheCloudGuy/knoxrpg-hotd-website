// ══════════════════════════════════════════════════════════════
// ── SESSIONS (notebook-backed) ────────────────────────────────
// Sessions live as notebook pages under a root-level "Sessions/" folder.
// Each page carries a small metadata header, a "# Session Notes"
// (DM prep, private) section and a "# Session Summary" (player recap,
// public when published) section:
//
//   Session #: 28
//   Title: The Gathering of Allies
//   In-Game Date: 25th of Mirtul
//   Play Date: 2025-11-15T18:00
//
//   # Session Notes
//   ...DM prep...
//
//   # Session Summary
//   ...player-facing recap...
//
// This module is the single source of truth for detecting, parsing,
// templating and listing session pages. The legacy `hotd_sessions`
// table is retained (dormant) as a backup + canon-provenance anchor.
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");

const SESSIONS_PREFIX = "Sessions/";
const NOTES_HEADING = "Session Notes";
const SUMMARY_HEADING = "Session Summary";

// True if a notebook path is a session page (under the Sessions folder).
function isSessionPath(p) {
  return typeof p === "string" && p.startsWith(SESSIONS_PREFIX) && p !== SESSIONS_PREFIX;
}

// Split markdown into H1 sections: [{ heading, body }].
function splitH1(md) {
  const lines = String(md || "").split(/\r?\n/);
  const sections = [];
  let cur = null;
  for (const line of lines) {
    const h = line.match(/^#\s+(.+?)\s*$/);
    if (h) { cur = { heading: h[1].trim(), body: [] }; sections.push(cur); }
    else if (cur) cur.body.push(line);
  }
  return sections.map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }));
}

function sectionBody(sections, name) {
  const t = name.toLowerCase();
  const found = sections.find((s) => s.heading.toLowerCase() === t);
  return found ? found.body : "";
}

// Parse a session page's markdown into structured fields.
function parseSessionPage(content) {
  const text = String(content || "");
  // Metadata = leading "Key: value" lines before the first H1.
  const firstH1 = text.search(/^#\s/m);
  const head = firstH1 >= 0 ? text.slice(0, firstH1) : text;
  const meta = {};
  head.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
  });
  const rawNum = meta["session #"] ?? meta["session#"] ?? meta["session number"] ?? meta["session no"] ?? meta["session"] ?? "";
  const n = parseInt(rawNum, 10);
  const sections = splitH1(text);
  return {
    sessionNumber: Number.isInteger(n) ? n : null,
    title: meta["title"] || "",
    gameDate: meta["in-game date"] || meta["in game date"] || meta["ingame date"] || "",
    playDate: meta["play date"] || "",
    notes: sectionBody(sections, NOTES_HEADING),
    summary: sectionBody(sections, SUMMARY_HEADING),
  };
}

// Build the default template for a new session page.
function sessionTemplate({ sessionNumber = "", title = "", gameDate = "", playDate = "" } = {}) {
  return [
    "Session #: " + (sessionNumber === null ? "" : sessionNumber),
    "Title: " + title,
    "In-Game Date: " + gameDate,
    "Play Date: " + playDate,
    "",
    "# Session Notes",
    "",
    "",
    "# Session Summary",
    "",
    "_This is what players will see when you Publish. Write it by hand or use Generate Summary to draft it from the notes above._",
    "",
  ].join("\n");
}

// A filesystem-safe page name for a session, e.g. "Session 028 - The Gathering of Allies".
function sessionFileName(sessionNumber, title) {
  const num = Number.isInteger(sessionNumber) ? String(sessionNumber).padStart(3, "0") : "000";
  const cleanTitle = String(title || "").replace(/[\\/:*?"<>|#]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return "Session " + num + (cleanTitle ? " - " + cleanTitle : "");
}

// List session pages from the notebook, newest-first by session number.
async function listSessionPages({ publishedOnly = true } = {}) {
  let sql = "SELECT path, name, content, status, updated_at, created_at FROM hotd_notebook_pages WHERE type='file' AND path LIKE $1";
  if (publishedOnly) sql += " AND status='published'";
  let rows = [];
  try { ({ rows } = await pgPool.query(sql, [SESSIONS_PREFIX + "%"])); } catch (_) { return []; }
  const out = rows.map((r) => {
    const p = parseSessionPage(r.content);
    return { path: r.path, name: r.name, status: r.status, published: r.status === "published", updated_at: r.updated_at, created_at: r.created_at, ...p };
  }).filter((s) => s.sessionNumber !== null);
  out.sort((a, b) => b.sessionNumber - a.sessionNumber);
  return out;
}

// The latest PUBLISHED session (for the home "Last Session" block), or null.
async function getLatestPublishedSession() {
  const list = await listSessionPages({ publishedOnly: true });
  return list.length ? list[0] : null;
}

// Next session number = highest across ALL session pages (drafts included) + 1.
async function nextSessionNumber() {
  const list = await listSessionPages({ publishedOnly: false });
  const max = list.reduce((m, s) => Math.max(m, s.sessionNumber || 0), 0);
  return max + 1;
}

module.exports = {
  SESSIONS_PREFIX,
  NOTES_HEADING,
  SUMMARY_HEADING,
  isSessionPath,
  parseSessionPage,
  sessionTemplate,
  sessionFileName,
  listSessionPages,
  getLatestPublishedSession,
  nextSessionNumber,
  splitH1,
  sectionBody,
};
