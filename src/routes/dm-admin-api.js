// ══════════════════════════════════════════════════════════════
// ── DM ADMIN API ROUTES ──────────────────────────────────────
// JSON API endpoints for the DM Management Interface.
// All routes require session.role === "admin".
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, sendJSON, parseMultipart } = require("../lib/utils");
const azure = require("../lib/azure");
const { uploadBlobToStorage } = azure;
const { buildEmbeddingContext } = require("../lib/rag");
const { chatWithTools } = require("../lib/ai-tools");
const { extractCanonUpdates } = require("../lib/canon-extractor");
const { applyCanonUpdates, reindexSources } = require("../lib/canon-applier");
const { recordChatCompletion, trackAiImage } = require("../lib/telemetry");
const { syncCharacterFromDDB } = require("../lib/ddb-sync");
const { runAudit: runDdbAudit, embedMissing: embedDdbMissing } = require("../lib/ddb-audit");
const ddbClient = require("../lib/ddb-client");
const ddbDownload = require("../lib/ddb-download");
const ddbBookImages = require("../lib/ddb-book-images");
const ddbJobs = require("../lib/ddb-jobs");
const imageIndex = require("../lib/image-index");
const imageTags = require("../lib/image-tags");
const homebrewSchema = require("../lib/homebrew-schema");
const homebrewPublish = require("../lib/homebrew-publish");
const sessionsLib = require("../lib/sessions");
const fs = require("fs");
const os = require("os");
const childProc = require("child_process");
const notebookPath = require("path");

const REPO_ROOT = (function resolveRepoRoot() {
  // In dev this file lives at <repo>/src/routes/dm-admin-api.js, so the repo
  // root is two levels up. In the Docker image the Dockerfile does
  // `COPY src/ .` into /app, which flattens the layout to /app/routes/..., so
  // the equivalent "root" is one level up. Pick the deepest ancestor that
  // actually has a package.json. The HOTD_REPO_ROOT env var overrides both.
  if (process.env.HOTD_REPO_ROOT) return process.env.HOTD_REPO_ROOT;
  const candidates = [
    notebookPath.join(__dirname, "..", ".."),
    notebookPath.join(__dirname, ".."),
  ];
  for (const dir of candidates) {
    try { if (fs.existsSync(notebookPath.join(dir, "package.json"))) return dir; } catch (_) {}
  }
  return candidates[0];
})();
const PDF_SCRIPT = process.env.HOTD_PDF_SCRIPT
  || notebookPath.join(REPO_ROOT, "scripts", "build-session-pdf.js");
const CARD_SCRIPT = process.env.HOTD_ITEM_CARDS_SCRIPT
  || notebookPath.join(REPO_ROOT, "scripts", "build-item-cards-pdf.js");
const PDF_REPORTS_DIR = process.env.HOTD_REPORTS_DIR
  || notebookPath.join(REPO_ROOT, "reports");

// ── Markdown section helpers (H1-delimited) ─────────────────
// Sessions are stored as one markdown blob; "Publish", "Generate Summary",
// and "Create PDF" all operate on H1-delimited sections like
// "# Session Summary" and "# Session Notes".

function splitMarkdownByH1(md) {
  const text = String(md || "");
  const lines = text.split(/\r?\n/);
  const sections = [];
  let preamble = [];
  let current = null;
  for (const line of lines) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return {
    preamble: preamble.join("\n").trimEnd(),
    sections: sections.map(s => ({ heading: s.heading, body: s.body.join("\n").replace(/^\s+|\s+$/g, "") })),
  };
}

function serializeMarkdown(parts) {
  const chunks = [];
  if (parts.preamble) chunks.push(parts.preamble);
  for (const s of parts.sections) {
    chunks.push(`# ${s.heading}\n\n${s.body}`.replace(/\s+$/, ""));
  }
  return chunks.join("\n\n") + "\n";
}

function getSectionBody(md, headingName) {
  const { sections } = splitMarkdownByH1(md);
  const target = headingName.trim().toLowerCase();
  const found = sections.find(s => s.heading.toLowerCase() === target);
  return found ? found.body : "";
}

function upsertSection(md, headingName, newBody) {
  const parts = splitMarkdownByH1(md);
  const target = headingName.trim().toLowerCase();
  const idx = parts.sections.findIndex(s => s.heading.toLowerCase() === target);
  if (idx >= 0) parts.sections[idx].body = newBody;
  else parts.sections.push({ heading: headingName, body: newBody });
  return serializeMarkdown(parts);
}

function stripSection(md, headingName) {
  const parts = splitMarkdownByH1(md);
  const target = headingName.trim().toLowerCase();
  parts.sections = parts.sections.filter(s => s.heading.toLowerCase() !== target);
  return serializeMarkdown(parts);
}

function safeSessionSlug(n) {
  const num = parseInt(n, 10);
  if (!Number.isInteger(num) || num < 0 || num > 9999) return null;
  return String(num);
}

// Keep a hotd_sessions shadow row in sync with a notebook session page
// (dormant table retained as backup + canon provenance + pdf_path store).
// Returns the row id.
async function upsertSessionShadow(parsed, content) {
  const pd = parsed.playDate || null;
  const ex = await pgPool.query("SELECT id FROM hotd_sessions WHERE session_number = $1", [parsed.sessionNumber]);
  if (ex.rows.length) {
    await pgPool.query(
      "UPDATE hotd_sessions SET title=$1, summary=$2, markdown=$3, game_date=$4, play_date=$5, published=TRUE, published_at=COALESCE(published_at, NOW()), updated_at=NOW() WHERE id=$6",
      [parsed.title, parsed.summary || "", content, parsed.gameDate || "", pd, ex.rows[0].id]
    );
    return ex.rows[0].id;
  }
  const ins = await pgPool.query(
    "INSERT INTO hotd_sessions (session_number, title, summary, markdown, game_date, play_date, published, published_at) VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW()) RETURNING id",
    [parsed.sessionNumber, parsed.title, parsed.summary || "", content, parsed.gameDate || "", pd]
  );
  return ins.rows[0].id;
}

// Resolve a /hotd-content/* asset URL to an absolute local file path so the
// spawned card builder can embed it directly (relative URLs can't be fetched
// from the subprocess). Returns null for remote/unresolvable URLs.
function resolveLocalArt(url) {
  if (!url || typeof url !== "string" || !url.startsWith("/hotd-content/")) return null;
  const rel = url.slice("/hotd-content/".length);
  for (const root of [process.env.HOTD_UPLOADS_DIR, process.env.HOTD_CONTENT_DIR]) {
    if (!root) continue;
    const abs = notebookPath.join(root, rel);
    try { if (fs.existsSync(abs)) return abs; } catch (_) {}
  }
  return null;
}

function requireAdmin(session, res) {
  if (!session || session.role !== "admin") {
    sendJSON(res, { error: "Unauthorized" }, 403);
    return false;
  }
  return true;
}

async function handleDmAdminApiRoutes(decoded, req, res, session) {
  if (!decoded.startsWith("/api/dm-admin")) return false;

  // ── Characters: list ───────────────────────────────────────
  if (decoded === "/api/dm-admin/characters" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query(
      "SELECT id, ddb_character_id, character_name, player_name, level, race, class_summary, background, alignment, strength, dexterity, constitution, intelligence, wisdom, charisma, armor_class, hit_points, max_hit_points, speed, avatar_url FROM hotd_player_characters ORDER BY character_name"
    );
    sendJSON(res, { characters: r.rows });
    return true;
  }

  // ── Characters: get one (full row, including dm_notes) ────
  // Used by the GM Player Workspace at /characters/admin to render the
  // read-only display panes plus the editable dm_notes textarea.
  const charGetMatch = decoded.match(/^\/api\/dm-admin\/characters\/(\d+)$/);
  if (charGetMatch && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(charGetMatch[1], 10);
    const r = await pgPool.query("SELECT * FROM hotd_player_characters WHERE id = $1 LIMIT 1", [id]);
    if (r.rows.length === 0) { sendJSON(res, { error: "Character not found" }, 404); return true; }
    sendJSON(res, { character: r.rows[0] });
    return true;
  }

  // ── Characters: publish (save dm_notes + reindex RAG) ─────
  // The single PUBLISH action: persists the GM-only dm_notes column and then
  // spawns `embed-pipeline.js --source character --mode incremental` so the
  // RAG vector store reflects the new GM notes plus any DDB-synced
  // mechanical changes for this character. No other column is writable here.
  const charPublishMatch = decoded.match(/^\/api\/dm-admin\/characters\/(\d+)\/publish$/);
  if (charPublishMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(charPublishMatch[1], 10);
    const started = Date.now();
    try {
      const body = JSON.parse(await readBody(req));
      if (typeof body.dm_notes !== "string") {
        sendJSON(res, { error: "dm_notes (string) required" }, 400);
        return true;
      }
      const exists = await pgPool.query("SELECT id, character_name FROM hotd_player_characters WHERE id = $1", [id]);
      if (exists.rows.length === 0) { sendJSON(res, { error: "Character not found" }, 404); return true; }
      await pgPool.query(
        "UPDATE hotd_player_characters SET dm_notes = $1, updated_at = NOW() WHERE id = $2",
        [body.dm_notes, id]
      );
      const reindex = await reindexSources(["character"]);
      sendJSON(res, {
        ok: true,
        character_name: exists.rows[0].character_name,
        elapsed_ms: Date.now() - started,
        reindex,
      });
    } catch (e) {
      console.error("Character publish error:", e);
      sendJSON(res, { error: e.message, elapsed_ms: Date.now() - started }, 500);
    }
    return true;
  }

  // ── Characters: audit log (canon-applied changes for this PC) ─
  const charAuditMatch = decoded.match(/^\/api\/dm-admin\/characters\/(\d+)\/audit$/);
  if (charAuditMatch && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(charAuditMatch[1], 10);
    try {
      const r = await pgPool.query(
        `SELECT a.id, a.session_id, a.operation, a.field, a.before_value, a.after_value,
                a.source_excerpt, a.rationale, a.applied_at,
                s.session_number, s.title AS session_title, s.game_date
           FROM hotd_canon_audit a
           LEFT JOIN hotd_sessions s ON s.id = a.session_id
          WHERE a.target_kind = 'pc' AND a.target_id = $1
          ORDER BY a.applied_at DESC
          LIMIT 100`,
        [id]
      );
      sendJSON(res, { audit: r.rows });
    } catch (e) {
      sendJSON(res, { error: e.message }, 500);
    }
    return true;
  }

  // ── Characters: single DDB sync ────────────────────────────
  const charSyncMatch = decoded.match(/^\/api\/dm-admin\/characters\/(\d+)\/sync$/);
  if (charSyncMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(charSyncMatch[1], 10);
    try {
      const r = await pgPool.query("SELECT ddb_character_id FROM hotd_player_characters WHERE id = $1", [id]);
      if (r.rows.length === 0) { sendJSON(res, { error: "Character not found" }, 404); return true; }
      const ddbId = r.rows[0].ddb_character_id;
      if (!ddbId) { sendJSON(res, { error: "No DDB character ID set" }, 400); return true; }

      const result = await syncCharacterFromDDB(ddbId, id);
      sendJSON(res, result);
    } catch (err) {
      console.error("DDB sync error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Characters: sync all ───────────────────────────────────
  if (decoded === "/api/dm-admin/characters/sync-all" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const r = await pgPool.query("SELECT id, ddb_character_id, character_name FROM hotd_player_characters WHERE ddb_character_id IS NOT NULL");
      const results = [];
      for (const row of r.rows) {
        try {
          const result = await syncCharacterFromDDB(row.ddb_character_id, row.id);
          results.push({ name: row.character_name, ...result });
        } catch (err) {
          results.push({ name: row.character_name, error: err.message });
        }
      }
      const ok = results.filter(r => r.ok).length;
      const fail = results.filter(r => r.error).length;
      sendJSON(res, { message: `Synced ${ok}/${results.length} (${fail} failed)`, results });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── NPCs: list ─────────────────────────────────────────────
  if (decoded === "/api/dm-admin/npcs" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT id, npcid, name, race, npc_class, location, status, alignment_tag, portrait_url, description, dm_notes, associations, sort_order, is_hidden FROM hotd_npcs ORDER BY sort_order, name");
    sendJSON(res, { npcs: r.rows });
    return true;
  }

  // ── NPCs: create ──────────────────────────────────────────
  if (decoded === "/api/dm-admin/npcs" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      const r = await pgPool.query(
        "INSERT INTO hotd_npcs (name,race,npc_class,location,status,alignment_tag,portrait_url,description,dm_notes,associations,sort_order,is_hidden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id",
        [b.name, b.race||"", b.npc_class||"", b.location||"", b.status||"Unknown", b.alignment_tag||"neutral", b.portrait_url||"", b.description||"", b.dm_notes||"", JSON.stringify(b.associations||[]), parseInt(b.sort_order)||0, b.is_hidden||false]
      );
      sendJSON(res, { id: r.rows[0].id });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── NPCs: update ──────────────────────────────────────────
  const npcUpdate = decoded.match(/^\/api\/dm-admin\/npcs\/(\d+)$/);
  if (npcUpdate && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      await pgPool.query(
        "UPDATE hotd_npcs SET name=$1,race=$2,npc_class=$3,location=$4,status=$5,alignment_tag=$6,portrait_url=$7,description=$8,dm_notes=$9,associations=$10,sort_order=$11,is_hidden=$12 WHERE id=$13",
        [b.name, b.race||"", b.npc_class||"", b.location||"", b.status||"", b.alignment_tag||"neutral", b.portrait_url||"", b.description||"", b.dm_notes||"", JSON.stringify(b.associations||[]), parseInt(b.sort_order)||0, b.is_hidden||false, npcUpdate[1]]
      );
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── NPCs: delete ──────────────────────────────────────────
  if (npcUpdate && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    try {
      await pgPool.query("DELETE FROM hotd_npcs WHERE id = $1", [npcUpdate[1]]);
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: list ─────────────────────────────────────────
  // Excludes the heavy `markdown` blob; that is fetched per-session via the
  // detail endpoint below to keep the left-pane list snappy.
  if (decoded === "/api/dm-admin/sessions" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query(
      "SELECT id, session_number, title, summary, game_date, play_date, published, published_at, pdf_path, pdf_generated_at, updated_at FROM hotd_sessions ORDER BY session_number DESC"
    );
    sendJSON(res, { sessions: r.rows });
    return true;
  }

  // ── Sessions: get one (full markdown) ──────────────────────
  const sessGetOne = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)$/);
  if (sessGetOne && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query(
      "SELECT id, session_number, title, summary, markdown, game_date, play_date, published, published_at, pdf_path, pdf_generated_at, updated_at, created_at FROM hotd_sessions WHERE id = $1",
      [sessGetOne[1]]
    );
    if (r.rows.length === 0) { sendJSON(res, { error: "Session not found" }, 404); return true; }
    sendJSON(res, r.rows[0]);
    return true;
  }

  // ── Sessions: create ──────────────────────────────────────
  if (decoded === "/api/dm-admin/sessions" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      const r = await pgPool.query(
        "INSERT INTO hotd_sessions (session_number,title,summary,markdown,game_date,play_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
        [parseInt(b.session_number), b.title, b.summary||"", b.markdown||"", b.game_date||"", b.play_date||null]
      );
      sendJSON(res, { id: r.rows[0].id });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: update (SAVE button) ─────────────────────────
  const sessUpdate = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)$/);
  if (sessUpdate && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      // Whitelist of mutable columns. `published`, `summary`, `pdf_path` are
      // intentionally NOT in this list — they are mutated only by the
      // /publish and /pdf endpoints respectively.
      const fields = ["session_number", "title", "markdown", "game_date", "play_date"];
      const sets = [];
      const vals = [];
      let idx = 1;
      for (const f of fields) {
        if (b[f] !== undefined) {
          let v = b[f];
          if (f === "session_number" && v !== null && v !== "") v = parseInt(v, 10);
          if (f === "play_date" && v === "") v = null;
          sets.push(`${f} = $${idx++}`);
          vals.push(v);
        }
      }
      if (sets.length === 0) { sendJSON(res, { error: "No fields to update" }, 400); return true; }
      sets.push(`updated_at = NOW()`);
      vals.push(sessUpdate[1]);
      await pgPool.query(`UPDATE hotd_sessions SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: delete ──────────────────────────────────────
  if (sessUpdate && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    try {
      await pgPool.query("DELETE FROM hotd_sessions WHERE id = $1", [sessUpdate[1]]);
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Sessions: generate GM Guide PDF ────────────────────────
  // POST /api/dm-admin/sessions/:id/pdf
  // Renders the session markdown (with `# Session Summary` stripped) to a
  // PDF using scripts/build-session-pdf.js, then records the path on the row.
  const sessPdfGen = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)\/pdf$/);
  if (sessPdfGen && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const r = await pgPool.query(
        "SELECT id, session_number, title, markdown FROM hotd_sessions WHERE id = $1",
        [sessPdfGen[1]]
      );
      if (r.rows.length === 0) { sendJSON(res, { error: "Session not found" }, 404); return true; }
      const row = r.rows[0];
      const sessSlug = safeSessionSlug(row.session_number);
      if (sessSlug === null) { sendJSON(res, { error: "Invalid session_number" }, 400); return true; }
      if (!row.markdown || !row.markdown.trim()) { sendJSON(res, { error: "Session markdown is empty — nothing to render" }, 400); return true; }

      if (!fs.existsSync(PDF_SCRIPT)) {
        sendJSON(res, {
          error: `PDF builder not available in this deployment. Missing ${PDF_SCRIPT}. ` +
                 `Set HOTD_PDF_SCRIPT, or ship scripts/build-session-pdf.js (plus weasyprint + pandoc) in the container.`,
        }, 501);
        return true;
      }

      // GM Guide = the whole markdown minus the player-facing summary section.
      const gmGuideMd = stripSection(row.markdown, "Session Summary");
      const tmpFile = notebookPath.join(os.tmpdir(), `hotd-session-${row.id}-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, gmGuideMd, "utf8");

      try { fs.mkdirSync(PDF_REPORTS_DIR, { recursive: true }); }
      catch (e) {
        sendJSON(res, { error: `Cannot create reports directory ${PDF_REPORTS_DIR}: ${e.message}. Set HOTD_REPORTS_DIR to a writable path.` }, 500);
        return true;
      }
      const outRelative = `session${sessSlug}-gm-guide.pdf`;
      const outAbsolute = notebookPath.join(PDF_REPORTS_DIR, outRelative);
      const docTitle = `Session ${sessSlug}: ${row.title || "Untitled"}`;

      await new Promise((resolve, reject) => {
        const child = childProc.spawn(
          process.execPath,
          [PDF_SCRIPT, "--input-file", tmpFile, "--out", outAbsolute, "--title", docTitle, "--session", sessSlug],
          { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] }
        );
        let stderr = "";
        child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("error", reject);
        child.on("exit", (code) => {
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          if (code === 0) resolve();
          else reject(new Error(`PDF script exited ${code}: ${stderr.slice(0, 500)}`));
        });
      });

      const pdfRelativeForDb = `reports/${outRelative}`;
      await pgPool.query(
        "UPDATE hotd_sessions SET pdf_path = $1, pdf_generated_at = NOW(), updated_at = NOW() WHERE id = $2",
        [pdfRelativeForDb, row.id]
      );
      sendJSON(res, {
        ok: true,
        pdf_path: pdfRelativeForDb,
        download_url: `/api/dm-admin/sessions/${row.id}/pdf`,
      });
    } catch (e) {
      console.error("Session PDF generation error:", e);
      sendJSON(res, { error: e.message }, 500);
    }
    return true;
  }

  // ── Sessions: download generated PDF ───────────────────────
  // GET /api/dm-admin/sessions/:id/pdf  (admin only, streams the file)
  if (sessPdfGen && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const r = await pgPool.query(
        "SELECT session_number, title, pdf_path FROM hotd_sessions WHERE id = $1",
        [sessPdfGen[1]]
      );
      if (r.rows.length === 0) { sendJSON(res, { error: "Session not found" }, 404); return true; }
      const row = r.rows[0];
      if (!row.pdf_path) { sendJSON(res, { error: "No PDF generated yet for this session" }, 404); return true; }
      // Guard against path traversal: pdf_path must live under reports/.
      const resolved = notebookPath.resolve(REPO_ROOT, row.pdf_path);
      if (!resolved.startsWith(PDF_REPORTS_DIR + notebookPath.sep) && resolved !== PDF_REPORTS_DIR) {
        sendJSON(res, { error: "Invalid PDF path" }, 400);
        return true;
      }
      if (!fs.existsSync(resolved)) { sendJSON(res, { error: "PDF file missing on disk" }, 404); return true; }
      const stat = fs.statSync(resolved);
      const downloadName = `session${row.session_number}-gm-guide.pdf`;
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": stat.size,
        "Content-Disposition": `attachment; filename="${downloadName}"`,
        "Cache-Control": "no-store",
      });
      fs.createReadStream(resolved).pipe(res);
    } catch (e) {
      console.error("Session PDF download error:", e);
      sendJSON(res, { error: e.message }, 500);
    }
    return true;
  }

  // ── Sessions: AI-generate the Session Summary ──────────────
  // POST /api/dm-admin/sessions/:id/generate-summary
  // Reads `# Session Notes`, pulls RAG context from prior sessions/lore, and
  // writes the result into `# Session Summary` (overwriting whatever was
  // there). The full markdown is returned so the editor can refresh.
  const sessGenSummary = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)\/generate-summary$/);
  if (sessGenSummary && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const r = await pgPool.query(
        "SELECT id, session_number, title, markdown, game_date FROM hotd_sessions WHERE id = $1",
        [sessGenSummary[1]]
      );
      if (r.rows.length === 0) { sendJSON(res, { error: "Session not found" }, 404); return true; }
      const row = r.rows[0];

      const notes = getSectionBody(row.markdown, "Session Notes");
      if (!notes || !notes.trim()) {
        sendJSON(res, { error: 'No `# Session Notes` section found. Add a "# Session Notes" H1 with your raw notes before generating a summary.' }, 400);
        return true;
      }

      // Optional extra instructions from the request body (for re-runs with
      // refinement prompts like "make this shorter" or "emphasize the betrayal").
      let promptOverride = "";
      try {
        const raw = await readBody(req);
        if (raw) {
          const b = JSON.parse(raw);
          if (typeof b.prompt === "string") promptOverride = b.prompt.slice(0, 2000);
        }
      } catch (_) {}

      // RAG context: prior session summaries + relevant lore.
      const ragQuery = `Session ${row.session_number} ${row.title || ""} ${notes.slice(0, 1500)}`;
      let ragContext = "";
      try {
        ragContext = await buildEmbeddingContext(azure.openaiClient, ragQuery, {
          includeDmOnly: false, limit: 10, minScore: 0.25,
        });
      } catch (e) {
        console.warn("Session summary RAG lookup failed (continuing without):", e.message);
      }

      const prevR = await pgPool.query(
        "SELECT session_number, title, summary FROM hotd_sessions WHERE session_number < $1 AND published = TRUE ORDER BY session_number DESC LIMIT 3",
        [row.session_number]
      );
      const priorBlock = prevR.rows.length
        ? "Previous published summaries (most recent first):\n" + prevR.rows.map(p => `- Session ${p.session_number}: ${p.title}\n${(p.summary || "").slice(0, 800)}`).join("\n\n")
        : "(No prior published summaries.)";

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-5.4-mini";

      const systemPrompt = `You are the campaign chronicler for "Halls of the Damned", a D&D 5e game.

Your job is to convert the Dungeon Master's raw post-session notes into a polished narrative summary the players will read on the campaign website.

Voice rules (strict):
- Match the DM's grounded, direct voice. Plain prose. No flowery language.
- Do NOT use em-dashes. Use commas, periods, or semicolons instead.
- Past tense, third-person. Refer to the party by their character names where known.
- Do not invent events, NPCs, locations, or outcomes that are not in the notes or prior published summaries.
- If something is ambiguous in the notes, write around it rather than making it up.
- 4 to 8 short paragraphs is the typical length. Keep it tight.
- Do not include a heading; the website wraps the text under "Session Summary".
- Do not include meta commentary like "In this session..." — just tell the story.

Campaign context follows. Use it for consistency; do not contradict it.

${priorBlock}

${ragContext}`.trim();

      const userPrompt = `Session ${row.session_number}${row.game_date ? ` (in-game: ${row.game_date})` : ""}: ${row.title || "Untitled"}

Raw DM notes:
${notes}

${promptOverride ? `Additional instructions from the DM: ${promptOverride}` : ""}`.trim();

      const t0 = Date.now();
      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_completion_tokens: 2048,
        temperature: 0.6,
      });
      recordChatCompletion(completion, {
        model,
        username: session.username || "",
        isDM: true,
        source: "dm-admin.session-summary",
        latencyMs: Date.now() - t0,
      });

      const generated = (completion.choices[0]?.message?.content || "").trim();
      if (!generated) { sendJSON(res, { error: "AI returned an empty summary" }, 502); return true; }

      const newMarkdown = upsertSection(row.markdown, "Session Summary", generated);
      await pgPool.query(
        "UPDATE hotd_sessions SET markdown = $1, updated_at = NOW() WHERE id = $2",
        [newMarkdown, row.id]
      );
      sendJSON(res, {
        ok: true,
        markdown: newMarkdown,
        generated_summary: generated,
        usage: completion.usage,
        rag_chunks: ragContext ? ragContext.split("---").length : 0,
      });
    } catch (e) {
      console.error("Session summary generation error:", e);
      sendJSON(res, { error: e.message }, 500);
    }
    return true;
  }

  // ── Sessions: publish (copies `# Session Summary` to summary col) ──
  // POST /api/dm-admin/sessions/:id/publish
  const sessPublish = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)\/publish$/);
  if (sessPublish && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const r = await pgPool.query(
        "SELECT id, session_number, title, game_date, markdown FROM hotd_sessions WHERE id = $1",
        [sessPublish[1]]
      );
      if (r.rows.length === 0) { sendJSON(res, { error: "Session not found" }, 404); return true; }
      const sessionRow = r.rows[0];
      const summaryBody = getSectionBody(sessionRow.markdown, "Session Summary").trim();
      if (!summaryBody) {
        sendJSON(res, { error: 'Nothing to publish. Add a "# Session Summary" section with content first.' }, 400);
        return true;
      }
      await pgPool.query(
        "UPDATE hotd_sessions SET summary = $1, published = TRUE, published_at = NOW(), updated_at = NOW() WHERE id = $2",
        [summaryBody, sessionRow.id]
      );

      // ── Canon extraction + apply + reindex ─────────────────
      // Runs inline. If anything fails the publish still succeeds; the error
      // is surfaced in the response so the UI can show it.
      let canon = null;
      let canonError = null;
      try {
        const cfgRows = await pgPool.query("SELECT key, value FROM hotd_config WHERE key = 'ai_model'");
        const aiModel = cfgRows.rows[0]?.value || "gpt-5.4-mini";
        const sessionForExtract = {
          id: sessionRow.id,
          session_number: sessionRow.session_number,
          title: sessionRow.title,
          game_date: sessionRow.game_date,
          summary: summaryBody,
        };
        const { proposals, headline } = await extractCanonUpdates({
          openaiClient: azure.openaiClient,
          model: aiModel,
          session: sessionForExtract,
        });
        const apply = await applyCanonUpdates({
          session: sessionForExtract,
          proposals,
          headline,
          userId: session.userId || null,
        });
        // Fire-and-await reindex of touched sources so the response only
        // returns once RAG is consistent with the new canon.
        const reindex = await reindexSources(apply.touched_sources);
        canon = {
          applied: apply.applied,
          skipped: apply.skipped,
          errors: apply.errors,
          summary: apply.summary,
          reindex,
        };
      } catch (e) {
        console.error("Canon pipeline error during publish:", e);
        canonError = e.message;
      }

      sendJSON(res, { ok: true, summary: summaryBody, canon, canon_error: canonError });
    } catch (e) {
      console.error("Session publish error:", e);
      sendJSON(res, { error: e.message }, 500);
    }
    return true;
  }

  // ── Sessions: unpublish (revert to draft) ──────────────────
  // POST /api/dm-admin/sessions/:id/unpublish
  const sessUnpublish = decoded.match(/^\/api\/dm-admin\/sessions\/(\d+)\/unpublish$/);
  if (sessUnpublish && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      await pgPool.query(
        "UPDATE hotd_sessions SET published = FALSE, updated_at = NOW() WHERE id = $1",
        [sessUnpublish[1]]
      );
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Config: get all ────────────────────────────────────────
  if (decoded === "/api/dm-admin/config" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT key, value FROM hotd_config");
    const config = {};
    for (const row of r.rows) config[row.key] = row.value;
    sendJSON(res, config);
    return true;
  }

  // ── Config: update (upsert multiple keys) ──────────────────
  if (decoded === "/api/dm-admin/config" && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    for (const [key, value] of Object.entries(body)) {
      if (typeof key !== "string" || key.length > 100) continue;
      await pgPool.query(
        "INSERT INTO hotd_config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
        [key, String(value)]
      );
    }
    sendJSON(res, { ok: true });
    return true;
  }

  // ── RAG status check ───────────────────────────────────────
  if (decoded === "/api/dm-admin/rag-status" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    // Prefer the DB-stored value (set via the Search Configuration UI),
    // fall back to the RAG_SERVICE_URL env var for deployments that
    // wire it through Helm.
    let ragUrl = "";
    try {
      const r = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'rag_service_url'");
      ragUrl = (r.rows[0] && r.rows[0].value) || "";
    } catch (_) {}
    if (!ragUrl) ragUrl = process.env.RAG_SERVICE_URL || "";
    if (!ragUrl) { sendJSON(res, { status: "not_configured" }); return true; }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await fetch(ragUrl.replace(/\/+$/, "") + "/health", { signal: controller.signal });
      clearTimeout(timeout);
      sendJSON(res, { status: r.ok ? "ok" : "error", code: r.status, url: ragUrl });
    } catch (err) {
      sendJSON(res, { status: "error", error: err.message, url: ragUrl });
    }
    return true;
  }

  // ── Users: list ────────────────────────────────────────────
  if (decoded === "/api/dm-admin/users" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT id, username, first_name, last_name, email, role, is_approved FROM account_info ORDER BY id");
    sendJSON(res, { users: r.rows });
    return true;
  }

  // ── Users: actions (approve/promote/demote/delete) ─────────
  const userActionMatch = decoded.match(/^\/api\/dm-admin\/users\/(\d+)\/(approve|promote|demote|delete)$/);
  if (userActionMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const uid = parseInt(userActionMatch[1], 10);
    const action = userActionMatch[2];
    try {
      switch (action) {
        case "approve":
          await pgPool.query("UPDATE account_info SET is_approved = true WHERE id = $1", [uid]);
          break;
        case "promote":
          await pgPool.query("UPDATE account_info SET role = 'admin' WHERE id = $1", [uid]);
          break;
        case "demote":
          await pgPool.query("UPDATE account_info SET role = 'user' WHERE id = $1", [uid]);
          break;
        case "delete":
          await pgPool.query("DELETE FROM account_info WHERE id = $1", [uid]);
          break;
      }
      sendJSON(res, { ok: true });
    } catch (err) {
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Images: list gallery ────────────────────────────────────
  if (decoded === "/api/dm-admin/images" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const params = new URL("http://x" + req.url).searchParams;
    const folder = params.get("folder") || null;
    let q = "SELECT id, prompt, revised_prompt, folder, tags, size, style, quality, image_url, thumbnail_url, is_published, published_to, created_at FROM hotd_generated_images";
    const vals = [];
    if (folder) { q += " WHERE folder = $1"; vals.push(folder); }
    q += " ORDER BY created_at DESC";
    const r = await pgPool.query(q, vals);
    sendJSON(res, { images: r.rows });
    return true;
  }

  // ── Images: list folders ───────────────────────────────────
  if (decoded === "/api/dm-admin/images/folders" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query("SELECT DISTINCT folder FROM hotd_generated_images WHERE folder IS NOT NULL ORDER BY folder");
    sendJSON(res, { folders: r.rows.map(r => r.folder) });
    return true;
  }

  // ── Images: generate via DALL-E 3 ─────────────────────────
  if (decoded === "/api/dm-admin/images/generate" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const prompt = (body.prompt || "").trim();
      if (!prompt) { sendJSON(res, { error: "Prompt is required" }, 400); return true; }

      // Get style prefix from config
      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'dalle_style_prefix'");
      const stylePrefix = cfgR.rows.length ? cfgR.rows[0].value : "";
      const fullPrompt = stylePrefix ? `${stylePrefix} ${prompt}` : prompt;

      const size = body.size || "1024x1024";
      const quality = body.quality || "medium";
      const folder = body.folder || null;
      const tags = body.tags || [];

      // Call GPT Image
      const imgT0 = Date.now();
      let imgResp;
      try {
        imgResp = await azure.openaiClient.images.generate({
          model: "gpt-image-1.5",
          prompt: fullPrompt,
          n: 1,
          size,
          quality,
        });
      } catch (imgErr) {
        trackAiImage({
          username: session.username || "",
          model: "gpt-image-1.5",
          size,
          quality,
          count: 1,
          latencyMs: Date.now() - imgT0,
          success: false,
          source: "dm-admin.image-generate",
          error: imgErr && imgErr.message ? imgErr.message : String(imgErr),
        });
        throw imgErr;
      }
      trackAiImage({
        username: session.username || "",
        model: "gpt-image-1.5",
        size,
        quality,
        count: 1,
        latencyMs: Date.now() - imgT0,
        success: true,
        source: "dm-admin.image-generate",
      });

      const b64 = imgResp.data[0].b64_json;
      const revisedPrompt = imgResp.data[0].revised_prompt || "";
      const imgBuffer = Buffer.from(b64, "base64");
      const style = body.style || "";

      // Save to local storage
      const ts = Date.now();
      const safeName = prompt.replace(/[^a-z0-9]/gi, "_").substring(0, 40) + "_" + ts + ".png";
      const dir = folder ? `generated-images/${folder}` : "generated-images";
      const imageUrl = await uploadBlobToStorage(safeName, imgBuffer, "image/png", "hotd-website-content", dir);

      // Insert DB record
      const tagsArr = Array.isArray(tags) ? tags : [];
      const insertR = await pgPool.query(
        `INSERT INTO hotd_generated_images (prompt, revised_prompt, folder, tags, size, style, quality, image_url)
         VALUES ($1, $2, $3, $4::text[], $5, $6, $7, $8) RETURNING id, created_at`,
        [prompt, revisedPrompt, folder, tagsArr, size, style, quality, imageUrl]
      );

      sendJSON(res, {
        ok: true,
        image: {
          id: insertR.rows[0].id,
          prompt,
          revised_prompt: revisedPrompt,
          folder,
          tags,
          size,
          style,
          quality,
          image_url: imageUrl,
          created_at: insertR.rows[0].created_at,
        },
      });
    } catch (err) {
      console.error("Image generation error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Images: update (folder, tags) ──────────────────────────
  const imgUpdateMatch = decoded.match(/^\/api\/dm-admin\/images\/(\d+)$/);
  if (imgUpdateMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(imgUpdateMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    const sets = [];
    const vals = [];
    let idx = 1;
    if (body.folder !== undefined) { sets.push(`folder = $${idx++}`); vals.push(body.folder || null); }
    if (body.tags !== undefined) { sets.push(`tags = $${idx++}::text[]`); vals.push(Array.isArray(body.tags) ? body.tags : []); }
    if (sets.length === 0) { sendJSON(res, { error: "Nothing to update" }, 400); return true; }
    vals.push(id);
    await pgPool.query(`UPDATE hotd_generated_images SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Images: delete ─────────────────────────────────────────
  const imgDeleteMatch = decoded.match(/^\/api\/dm-admin\/images\/(\d+)$/);
  if (imgDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(imgDeleteMatch[1], 10);
    // Get image URL to delete file
    const imgR = await pgPool.query("SELECT image_url FROM hotd_generated_images WHERE id = $1", [id]);
    if (imgR.rows.length === 0) { sendJSON(res, { error: "Image not found" }, 404); return true; }
    // Delete from filesystem if local
    const url = imgR.rows[0].image_url;
    if (url.startsWith("/hotd-content/")) {
      const { HOTD_CONTENT_DIR } = require("../config");
      if (HOTD_CONTENT_DIR) {
        const relPath = url.replace("/hotd-content/", "");
        const fs = require("fs");
        const filePath = require("path").join(HOTD_CONTENT_DIR, relPath);
        try { fs.unlinkSync(filePath); } catch (_) { /* file may already be gone */ }
      }
    }
    await pgPool.query("DELETE FROM hotd_generated_images WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Images: publish to Art Gallery ─────────────────────────
  const imgPublishMatch = decoded.match(/^\/api\/dm-admin\/images\/(\d+)\/publish$/);
  if (imgPublishMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(imgPublishMatch[1], 10);
    const imgR = await pgPool.query("SELECT prompt, image_url, folder FROM hotd_generated_images WHERE id = $1", [id]);
    if (imgR.rows.length === 0) { sendJSON(res, { error: "Image not found" }, 404); return true; }
    const img = imgR.rows[0];
    const body = JSON.parse(await readBody(req));
    const title = body.title || img.prompt;
    const category = body.category || img.folder || "Generated";
    // Insert into art gallery
    await pgPool.query(
      "INSERT INTO hotd_art (title, category, image_url) VALUES ($1, $2, $3)",
      [title, category, img.image_url]
    );
    await pgPool.query("UPDATE hotd_generated_images SET is_published = true WHERE id = $1", [id]);
    sendJSON(res, { ok: true, message: `Published "${title}" to Art Gallery` });
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // ── NOTEBOOK AI GENERATION ──────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  // ── Notebook: AI generate (RAG-grounded freeform) ──────────
  // Generates a Markdown document grounded in campaign RAG + NPC lookups.
  // The notebook UI turns the result into a new DRAFT page.
  if (decoded === "/api/dm-admin/notebook/generate" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const { prompt } = body;
      if (!prompt || !prompt.trim()) { sendJSON(res, { error: "Prompt is required" }, 400); return true; }
      // When baseContent is supplied, this is a follow-up revision of an
      // existing draft rather than a fresh generation.
      const baseContent = typeof body.baseContent === "string" ? body.baseContent : "";
      const entities = Array.isArray(body.entities)
        ? body.entities
        : (typeof body.entities === "string" ? body.entities.split(",").map(s => s.trim()).filter(Boolean) : []);

      // Build RAG context from the prompt + entity names (DM content included)
      const searchTerms = [prompt, ...entities].join(" ");
      const ragContext = await buildEmbeddingContext(azure.openaiClient, searchTerms, {
        includeDmOnly: true, limit: 12, minScore: 0.25,
      });

      // Also do direct DB lookups for mentioned entities
      const entityData = [];
      for (const ent of entities.slice(0, 10)) {
        const npcR = await pgPool.query(
          "SELECT name, race, npc_class, location, status, alignment_tag, description FROM hotd_npcs WHERE name ILIKE $1 LIMIT 1",
          [`%${ent}%`]
        );
        if (npcR.rows.length) entityData.push({ type: "NPC", ...npcR.rows[0] });
      }
      const entityContext = entityData.length
        ? "\n\nDirect entity data:\n" + entityData.map(e => `- ${e.type}: ${e.name} — ${e.race || ""} ${e.npc_class || ""}, ${e.location || ""}, ${e.status || ""}. ${(e.description || "").slice(0, 500)}`).join("\n")
        : "";

      const systemPrompt = `You are an AI writing assistant for the Dungeon Master of "Halls of the Damned", a D&D 5e campaign set in Barovia. Produce a single, well-structured Markdown document suitable for the campaign notebook (use headings, lists, and tables where helpful).

You MUST use the campaign context provided below to ensure accuracy. Never invent NPCs, locations, events, or history that contradict the established campaign data. If the context doesn't cover something, you may extrapolate creatively but flag it as [NEW CONTENT].
${ragContext}${entityContext}`;

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-5.4-mini";

      const t0 = Date.now();
      const userMessage = baseContent.trim()
        ? `Here is the current draft document:

---
${baseContent}
---

Revise the document according to this instruction, returning the FULL updated Markdown document (not just the changes):

${prompt}`
        : prompt;
      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_completion_tokens: 4096,
        temperature: 0.8,
      });
      recordChatCompletion(completion, {
        model,
        username: session.username || "",
        isDM: true,
        source: "dm-admin.notebook-generate",
        latencyMs: Date.now() - t0,
      });

      const content = completion.choices[0]?.message?.content || "";
      sendJSON(res, {
        ok: true,
        content,
        usage: completion.usage,
        ragChunks: ragContext ? ragContext.split("---").length : 0,
        entityLookups: entityData.length,
      });
    } catch (err) {
      console.error("Notebook generate error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // ── DM CHAT (persistent conversations) ──────────────────────
  // ══════════════════════════════════════════════════════════════

  // ── Chat: list conversations ───────────────────────────────
  if (decoded === "/api/dm-admin/conversations" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const r = await pgPool.query(
      "SELECT id, title, conversation_type, context_refs, created_at, updated_at, jsonb_array_length(messages) AS message_count FROM hotd_dm_conversations ORDER BY updated_at DESC"
    );
    sendJSON(res, { conversations: r.rows });
    return true;
  }

  // ── Chat: get single conversation ──────────────────────────
  const chatGetMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)$/);
  if (chatGetMatch && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(chatGetMatch[1], 10);
    const r = await pgPool.query("SELECT * FROM hotd_dm_conversations WHERE id = $1", [id]);
    if (r.rows.length === 0) { sendJSON(res, { error: "Not found" }, 404); return true; }
    sendJSON(res, { conversation: r.rows[0] });
    return true;
  }

  // ── Chat: create conversation ──────────────────────────────
  if (decoded === "/api/dm-admin/conversations" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const title = body.title || "New Conversation";
    const type = body.conversation_type || "general";
    const r = await pgPool.query(
      "INSERT INTO hotd_dm_conversations (title, conversation_type, messages) VALUES ($1, $2, '[]'::jsonb) RETURNING id, created_at",
      [title, type]
    );
    sendJSON(res, { ok: true, id: r.rows[0].id });
    return true;
  }

  // ── Chat: send message (append + get AI reply) ─────────────
  const chatMsgMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)\/message$/);
  if (chatMsgMatch && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    const id = parseInt(chatMsgMatch[1], 10);
    try {
      const body = JSON.parse(await readBody(req));
      const userMsg = (body.message || "").trim();
      if (!userMsg) { sendJSON(res, { error: "Message required" }, 400); return true; }

      // Get conversation
      const convR = await pgPool.query("SELECT messages FROM hotd_dm_conversations WHERE id = $1", [id]);
      if (convR.rows.length === 0) { sendJSON(res, { error: "Conversation not found" }, 404); return true; }
      const messages = convR.rows[0].messages || [];

      // Build the conversation transcript for the tool-enabled chat path.
      // Include the last ~20 stored turns plus the new user message. The
      // full tool + auto-RAG loop (same path as /api/chat) handles context
      // retrieval and lookups internally, so no manual system prompt / RAG
      // string is assembled here.
      const historySlice = messages.slice(-20);
      const userMessages = [
        ...historySlice.map(m => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content).slice(0, 2000),
        })),
        { role: "user", content: userMsg.slice(0, 2000) },
      ];

      // Resolve the DM model from config (explicit row preferred, sane fallback).
      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = $1", ["ai_model"]);
      const model = cfgR.rows.length ? cfgR.rows[0].value : (azure.aiModel || "gpt-5.4-mini");

      const { reply: aiReply, _debug: chatDebug } = await chatWithTools(
        azure.openaiClient, model, userMessages,
        {
          isDM: true,
          username: session.username || "",
          userId: session.userId,
          maxTokens: 4096,
          temperature: 0.7,
        }
      );

      const now = new Date().toISOString();

      // Append both messages
      const newMsgs = [
        ...messages,
        { role: "user", content: userMsg, timestamp: now },
        { role: "assistant", content: aiReply, timestamp: now },
      ];

      await pgPool.query(
        "UPDATE hotd_dm_conversations SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(newMsgs), id]
      );

      sendJSON(res, {
        ok: true,
        reply: aiReply,
        usage: (chatDebug && chatDebug.usage) || {},
        ragChunks: (chatDebug && chatDebug.autoRag && chatDebug.autoRag.results) || 0,
      });
    } catch (err) {
      console.error("DM Chat error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Chat: rename conversation ──────────────────────────────
  const chatRenameMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)$/);
  if (chatRenameMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(chatRenameMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    if (body.title) {
      await pgPool.query("UPDATE hotd_dm_conversations SET title = $1, updated_at = NOW() WHERE id = $2", [body.title, id]);
    }
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Chat: delete conversation ──────────────────────────────
  const chatDeleteMatch = decoded.match(/^\/api\/dm-admin\/conversations\/(\d+)$/);
  if (chatDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(chatDeleteMatch[1], 10);
    await pgPool.query("DELETE FROM hotd_dm_conversations WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  // ── CAMPAIGN NOTEBOOK (PostgreSQL-backed markdown pages) ────
  // ══════════════════════════════════════════════════════════════

  const NOTEBOOK_IMG_DIR = notebookPath.join(
    require("path").resolve(require("../config").STATIC_ROOT),
    "images", "notebook"
  );

  // ── Helper: build tree from flat rows ──
  function buildTree(rows) {
    const byPath = {};
    const roots = [];
    // Sort so folders come first, then alphabetical
    rows.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const r of rows) {
      const node = { name: r.name, path: r.path, type: r.type, status: r.status };
      if (r.type === "folder") node.children = [];
      byPath[r.path] = node;
    }
    for (const r of rows) {
      if (r.parent_path && byPath[r.parent_path]) {
        byPath[r.parent_path].children.push(byPath[r.path]);
      } else {
        roots.push(byPath[r.path]);
      }
    }
    // Sort children within each folder
    for (const key in byPath) {
      if (byPath[key].children) {
        byPath[key].children.sort((a, b) => {
          if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }
    }
    return roots;
  }

  // ── Helper: (re)embed a notebook page into RAG per status + visibility ──
  // Delegates to src/lib/notebook-rag.js. Published pages are embedded with
  // player/DM visibility (Campaign Data/* splits on "## DM Notes"); draft /
  // unpublished pages are removed from RAG.
  const { syncNotebookPageEmbedding } = require("../lib/notebook-rag");
  async function embedNotebookPage(path, name, content, status) {
    try {
      const { openaiClient } = require("../lib/azure");
      await syncNotebookPageEmbedding(openaiClient, { path, name, content, status });
    } catch (e) {
      console.warn("  WARN: notebook RAG embed failed for", path, e.message);
    }
  }

  // ── Notebook: file tree ────────────────────────────────────
  if (decoded === "/api/dm-admin/notebook/tree" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const { rows } = await pgPool.query(
        "SELECT path, parent_path, name, type, status FROM hotd_notebook_pages ORDER BY type, name"
      );
      sendJSON(res, { tree: buildTree(rows) });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: read file ────────────────────────────────────
  if (decoded.startsWith("/api/dm-admin/notebook/read") && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const filePath = new URL(req.url, "http://x").searchParams.get("path");
    if (!filePath) { sendJSON(res, { error: "path required" }, 400); return true; }
    try {
      const { rows } = await pgPool.query(
        "SELECT path, content, status FROM hotd_notebook_pages WHERE path = $1 AND type = 'file'", [filePath]
      );
      if (!rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      sendJSON(res, { path: rows[0].path, content: rows[0].content, status: rows[0].status });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: write file (+ RAG embed when published) ──────
  if (decoded === "/api/dm-admin/notebook/write" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path || b.content === undefined) { sendJSON(res, { error: "path and content required" }, 400); return true; }
      const { rows } = await pgPool.query(
        "UPDATE hotd_notebook_pages SET content = $1, updated_at = NOW() WHERE path = $2 AND type = 'file' RETURNING name, status",
        [b.content, b.path]
      );
      if (!rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      sendJSON(res, { ok: true });
      // Re-sync RAG: published pages (re)embed with visibility; drafts are removed.
      embedNotebookPage(b.path, rows[0].name, b.content, rows[0].status).catch(() => {});
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: create file/folder ───────────────────────────
  if (decoded === "/api/dm-admin/notebook/create" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path) { sendJSON(res, { error: "path required" }, 400); return true; }
      const parts = b.path.split("/");
      const name = parts.pop();
      const parentPath = parts.join("/");
      const type = b.type === "folder" ? "folder" : "file";
      const content = type === "file" ? (b.content || "# " + name.replace(/\.md$/i, "").replace(/[-_]/g, " ") + "\n\n") : "";

      // Ensure parent folders exist
      if (parentPath) {
        const segments = parentPath.split("/");
        let cumulative = "";
        for (const seg of segments) {
          cumulative = cumulative ? cumulative + "/" + seg : seg;
          await pgPool.query(
            `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content)
             VALUES ($1, $2, $3, 'folder', '') ON CONFLICT (path) DO NOTHING`,
            [cumulative, cumulative.includes("/") ? cumulative.substring(0, cumulative.lastIndexOf("/")) : "", seg]
          );
        }
      }

      await pgPool.query(
        `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content) VALUES ($1, $2, $3, $4, $5)`,
        [b.path, parentPath, name, type, content]
      );
      sendJSON(res, { ok: true });
      // New pages are created as drafts (status default) and are NOT embedded.
      // They enter RAG only when published (see publish endpoint).
    } catch (e) {
      if (e.code === "23505") { sendJSON(res, { error: "already exists" }, 409); }
      else { sendJSON(res, { error: e.message }, 500); }
    }
    return true;
  }

  // ── Notebook: delete file/folder ───────────────────────────
  if (decoded === "/api/dm-admin/notebook/delete" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path) { sendJSON(res, { error: "path required" }, 400); return true; }
      // Delete the item and any children (for folders)
      await pgPool.query(
        "DELETE FROM hotd_notebook_pages WHERE path = $1 OR path LIKE $2",
        [b.path, b.path + "/%"]
      );
      // Remove RAG embeddings too
      await pgPool.query(
        "DELETE FROM hotd_embeddings WHERE source_type = 'notebook' AND (source_path = $1 OR source_path LIKE $2)",
        [b.path, b.path + "/%"]
      );
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: publish (embed into RAG with visibility) ─────
  if (decoded === "/api/dm-admin/notebook/publish" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path) { sendJSON(res, { error: "path required" }, 400); return true; }
      const { rows } = await pgPool.query(
        "UPDATE hotd_notebook_pages SET status = 'published', updated_at = NOW() WHERE path = $1 AND type = 'file' RETURNING name, content",
        [b.path]
      );
      if (!rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      const { openaiClient } = require("../lib/azure");
      const result = await syncNotebookPageEmbedding(openaiClient, { path: b.path, name: rows[0].name, content: rows[0].content, status: "published" });

      // Session pages: sync the shadow row + run the canon extract/apply/reindex pipeline.
      let canon = null, canon_error = null;
      if (sessionsLib.isSessionPath(b.path)) {
        try {
          const parsed = sessionsLib.parseSessionPage(rows[0].content);
          const sid = await upsertSessionShadow(parsed, rows[0].content);
          if (parsed.summary && parsed.summary.trim()) {
            const cfgRows = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
            const aiModel = cfgRows.rows[0]?.value || "gpt-5.4-mini";
            const sessionForExtract = { id: sid, session_number: parsed.sessionNumber, title: parsed.title, game_date: parsed.gameDate, summary: parsed.summary };
            const { proposals, headline } = await extractCanonUpdates({ openaiClient, model: aiModel, session: sessionForExtract });
            const apply = await applyCanonUpdates({ session: sessionForExtract, proposals, headline, userId: session.userId || null });
            const reindex = await reindexSources(apply.touched_sources);
            canon = { applied: apply.applied, skipped: apply.skipped, errors: apply.errors, summary: apply.summary, reindex };
          }
        } catch (e) { console.error("Session canon on publish failed:", e); canon_error = e.message; }
      }
      sendJSON(res, { ok: true, status: "published", chunks: result.chunks, canon, canon_error });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: unpublish (remove from RAG) ──────────────────
  if (decoded === "/api/dm-admin/notebook/unpublish" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path) { sendJSON(res, { error: "path required" }, 400); return true; }
      const { rows } = await pgPool.query(
        "UPDATE hotd_notebook_pages SET status = 'draft', updated_at = NOW() WHERE path = $1 AND type = 'file' RETURNING name",
        [b.path]
      );
      if (!rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      const { removeNotebookEmbeddings } = require("../lib/notebook-rag");
      await removeNotebookEmbeddings(b.path);
      sendJSON(res, { ok: true, status: "draft" });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: AI-generate a session page's "# Session Summary" ──
  if (decoded === "/api/dm-admin/notebook/session-summary" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path || !sessionsLib.isSessionPath(b.path)) { sendJSON(res, { error: "a session page path is required" }, 400); return true; }
      const pr = await pgPool.query("SELECT content, name, status FROM hotd_notebook_pages WHERE path = $1 AND type = 'file'", [b.path]);
      if (!pr.rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      const content = pr.rows[0].content;
      const parsed = sessionsLib.parseSessionPage(content);
      const notes = parsed.notes;
      if (!notes || !notes.trim()) { sendJSON(res, { error: 'No "# Session Notes" content to summarize. Add your raw notes first.' }, 400); return true; }
      const promptOverride = (typeof b.prompt === "string") ? b.prompt.slice(0, 2000) : "";

      const ragQuery = `Session ${parsed.sessionNumber} ${parsed.title || ""} ${notes.slice(0, 1500)}`;
      let ragContext = "";
      try { ragContext = await buildEmbeddingContext(azure.openaiClient, ragQuery, { includeDmOnly: false, limit: 10, minScore: 0.25 }); } catch (_) {}

      const prior = (await sessionsLib.listSessionPages({ publishedOnly: true })).filter(s => s.sessionNumber < parsed.sessionNumber).slice(0, 3);
      const priorBlock = prior.length
        ? "Previous published summaries (most recent first):\n" + prior.map(p => `- Session ${p.sessionNumber}: ${p.title}\n${(p.summary || "").slice(0, 800)}`).join("\n\n")
        : "(No prior published summaries.)";

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-5.4-mini";

      const systemPrompt = `You are the campaign chronicler for "Halls of the Damned", a D&D 5e game.

Your job is to convert the Dungeon Master's raw post-session notes into a polished narrative summary the players will read on the campaign website.

Voice rules (strict):
- Match the DM's grounded, direct voice. Plain prose. No flowery language.
- Do NOT use em-dashes. Use commas, periods, or semicolons instead.
- Past tense, third-person. Refer to the party by their character names where known.
- Do not invent events, NPCs, locations, or outcomes that are not in the notes or prior published summaries.
- If something is ambiguous in the notes, write around it rather than making it up.
- 4 to 8 short paragraphs is the typical length. Keep it tight.
- Do not include a heading; the website wraps the text under "Session Summary".
- Do not include meta commentary like "In this session..." — just tell the story.

Campaign context follows. Use it for consistency; do not contradict it.

${priorBlock}

${ragContext}`.trim();

      const userPrompt = `Session ${parsed.sessionNumber}${parsed.gameDate ? ` (in-game: ${parsed.gameDate})` : ""}: ${parsed.title || "Untitled"}

Raw DM notes:
${notes}

${promptOverride ? `Additional instructions from the DM: ${promptOverride}` : ""}`.trim();

      const t0 = Date.now();
      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: [ { role: "system", content: systemPrompt }, { role: "user", content: userPrompt } ],
        max_completion_tokens: 2048,
        temperature: 0.6,
      });
      recordChatCompletion(completion, { model, username: session.username || "", isDM: true, source: "dm-admin.notebook-session-summary", latencyMs: Date.now() - t0 });
      const generated = (completion.choices[0]?.message?.content || "").trim();
      if (!generated) { sendJSON(res, { error: "AI returned an empty summary" }, 502); return true; }

      const newContent = upsertSection(content, "Session Summary", generated);
      await pgPool.query("UPDATE hotd_notebook_pages SET content = $1, updated_at = NOW() WHERE path = $2", [newContent, b.path]);
      if (pr.rows[0].status === "published") embedNotebookPage(b.path, pr.rows[0].name, newContent, "published").catch(() => {});
      sendJSON(res, { ok: true, content: newContent, generated_summary: generated, usage: completion.usage });
    } catch (e) { console.error("Notebook session-summary error:", e); sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: generate a session page's GM Guide PDF ──
  if (decoded === "/api/dm-admin/notebook/session-pdf" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path || !sessionsLib.isSessionPath(b.path)) { sendJSON(res, { error: "a session page path is required" }, 400); return true; }
      const pr = await pgPool.query("SELECT content FROM hotd_notebook_pages WHERE path = $1 AND type = 'file'", [b.path]);
      if (!pr.rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      const content = pr.rows[0].content;
      const parsed = sessionsLib.parseSessionPage(content);
      const sessSlug = safeSessionSlug(parsed.sessionNumber);
      if (sessSlug === null) { sendJSON(res, { error: "Session page has no valid Session # metadata" }, 400); return true; }
      if (!fs.existsSync(PDF_SCRIPT)) { sendJSON(res, { error: `PDF builder not available in this deployment (missing ${PDF_SCRIPT}).` }, 501); return true; }
      const gmGuideMd = stripSection(content, "Session Summary");
      const tmpFile = notebookPath.join(os.tmpdir(), `hotd-session-${sessSlug}-${Date.now()}.md`);
      fs.writeFileSync(tmpFile, gmGuideMd, "utf8");
      try { fs.mkdirSync(PDF_REPORTS_DIR, { recursive: true }); }
      catch (e) { sendJSON(res, { error: `Cannot create reports directory ${PDF_REPORTS_DIR}: ${e.message}` }, 500); return true; }
      const outRelative = `session${sessSlug}-gm-guide.pdf`;
      const outAbsolute = notebookPath.join(PDF_REPORTS_DIR, outRelative);
      const docTitle = `Session ${sessSlug}: ${parsed.title || "Untitled"}`;
      await new Promise((resolve, reject) => {
        const child = childProc.spawn(process.execPath, [PDF_SCRIPT, "--input-file", tmpFile, "--out", outAbsolute, "--title", docTitle, "--session", sessSlug], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
        let stderr = ""; child.stderr.on("data", (d) => { stderr += d.toString(); });
        child.on("error", reject);
        child.on("exit", (code) => { try { fs.unlinkSync(tmpFile); } catch (_) {} if (code === 0) resolve(); else reject(new Error(`PDF script exited ${code}: ${stderr.slice(0, 500)}`)); });
      });
      const pdfRelativeForDb = `reports/${outRelative}`;
      await upsertSessionShadow(parsed, content);
      await pgPool.query("UPDATE hotd_sessions SET pdf_path = $1, pdf_generated_at = NOW(), updated_at = NOW() WHERE session_number = $2", [pdfRelativeForDb, parsed.sessionNumber]);
      sendJSON(res, { ok: true, pdf_path: pdfRelativeForDb, download_url: `/api/dm-admin/notebook/session-pdf?path=${encodeURIComponent(b.path)}` });
    } catch (e) { console.error("Notebook session PDF error:", e); sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: download a session page's generated PDF ──
  if (decoded === "/api/dm-admin/notebook/session-pdf" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const qp = new URL(req.url, "http://x").searchParams.get("path");
      if (!qp || !sessionsLib.isSessionPath(qp)) { sendJSON(res, { error: "a session page path is required" }, 400); return true; }
      const pr = await pgPool.query("SELECT content FROM hotd_notebook_pages WHERE path = $1 AND type = 'file'", [qp]);
      if (!pr.rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      const parsed = sessionsLib.parseSessionPage(pr.rows[0].content);
      const sr = await pgPool.query("SELECT pdf_path FROM hotd_sessions WHERE session_number = $1", [parsed.sessionNumber]);
      const pdfPath = sr.rows[0] && sr.rows[0].pdf_path;
      if (!pdfPath) { sendJSON(res, { error: "No PDF generated yet for this session" }, 404); return true; }
      const resolved = notebookPath.resolve(REPO_ROOT, pdfPath);
      if (!resolved.startsWith(PDF_REPORTS_DIR + notebookPath.sep) && resolved !== PDF_REPORTS_DIR) { sendJSON(res, { error: "Invalid PDF path" }, 400); return true; }
      if (!fs.existsSync(resolved)) { sendJSON(res, { error: "PDF file missing on disk" }, 404); return true; }
      const stat = fs.statSync(resolved);
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": stat.size, "Content-Disposition": `attachment; filename="session${parsed.sessionNumber}-gm-guide.pdf"`, "Cache-Control": "no-store" });
      fs.createReadStream(resolved).pipe(res);
    } catch (e) { console.error("Notebook session PDF download error:", e); sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: rename/move ──────────────────────────────────
  if (decoded === "/api/dm-admin/notebook/rename" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.oldPath || !b.newPath) { sendJSON(res, { error: "oldPath and newPath required" }, 400); return true; }
      const newParts = b.newPath.split("/");
      const newName = newParts.pop();
      const newParent = newParts.join("/");

      // Ensure new parent folders exist
      if (newParent) {
        const segments = newParent.split("/");
        let cumulative = "";
        for (const seg of segments) {
          cumulative = cumulative ? cumulative + "/" + seg : seg;
          await pgPool.query(
            `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content)
             VALUES ($1, $2, $3, 'folder', '') ON CONFLICT (path) DO NOTHING`,
            [cumulative, cumulative.includes("/") ? cumulative.substring(0, cumulative.lastIndexOf("/")) : "", seg]
          );
        }
      }

      // Rename the item itself
      await pgPool.query(
        "UPDATE hotd_notebook_pages SET path = $1, parent_path = $2, name = $3, updated_at = NOW() WHERE path = $4",
        [b.newPath, newParent, newName, b.oldPath]
      );
      // Rename children (for folder moves)
      const { rows: children } = await pgPool.query(
        "SELECT id, path FROM hotd_notebook_pages WHERE path LIKE $1",
        [b.oldPath + "/%"]
      );
      for (const child of children) {
        const newChildPath = b.newPath + child.path.slice(b.oldPath.length);
        const childParts = newChildPath.split("/");
        childParts.pop();
        await pgPool.query(
          "UPDATE hotd_notebook_pages SET path = $1, parent_path = $2, updated_at = NOW() WHERE id = $3",
          [newChildPath, childParts.join("/"), child.id]
        );
      }
      // Update RAG embedding paths
      await pgPool.query(
        "UPDATE hotd_embeddings SET source_path = $1 WHERE source_type = 'notebook' AND source_path = $2",
        [b.newPath, b.oldPath]
      );
      sendJSON(res, { ok: true });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: image upload (paste/drop) ────────────────────
  if (decoded === "/api/dm-admin/notebook/upload-image" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const ct = req.headers["content-type"] || "";
      if (!ct.includes("multipart/form-data")) { sendJSON(res, { error: "multipart required" }, 400); return true; }
      const parsed = await parseMultipart(req, ct);
      if (!parsed.file || !parsed.file.data.length) { sendJSON(res, { error: "no file" }, 400); return true; }
      const noteParam = new URL(req.url, "http://x").searchParams.get("notePath") || "";
      const pageName = notebookPath.basename(noteParam, ".md").replace(/[^a-zA-Z0-9_-]/g, "_") || "general";
      const imgDir = notebookPath.join(NOTEBOOK_IMG_DIR, pageName);
      fs.mkdirSync(imgDir, { recursive: true });
      const safeName = Date.now() + "_" + parsed.file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      fs.writeFileSync(notebookPath.join(imgDir, safeName), parsed.file.data);
      sendJSON(res, { url: "/images/notebook/" + pageName + "/" + safeName });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: backlinks for a note ─────────────────────────
  if (decoded.startsWith("/api/dm-admin/notebook/backlinks") && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const filePath = new URL(req.url, "http://x").searchParams.get("path");
    if (!filePath) { sendJSON(res, { error: "path required" }, 400); return true; }
    try {
      const targetName = notebookPath.basename(filePath, ".md").toLowerCase();
      const targetPathNoExt = filePath.replace(/\.md$/i, "").toLowerCase();
      const { rows } = await pgPool.query(
        "SELECT path, name, content FROM hotd_notebook_pages WHERE type = 'file' AND path != $1",
        [filePath]
      );
      const backlinks = [];
      for (const r of rows) {
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = wikiLinkRegex.exec(r.content)) !== null) {
          if (match[1].toLowerCase() === targetName || match[1].toLowerCase() === targetPathNoExt) {
            const lineNum = r.content.substring(0, match.index).split("\n").length;
            const lines = r.content.split("\n");
            backlinks.push({ path: r.path, name: r.name.replace(/\.md$/i, ""), line: lineNum, context: (lines[lineNum - 1] || "").trim().substring(0, 100) });
            break;
          }
        }
      }
      sendJSON(res, { backlinks });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: link map ─────────────────────────────────────
  if (decoded === "/api/dm-admin/notebook/link-map" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const { rows } = await pgPool.query(
        "SELECT path, name, parent_path, content FROM hotd_notebook_pages WHERE type = 'file'"
      );
      const nodes = [];
      const edges = [];
      const fileIndex = {};
      for (const r of rows) {
        const label = r.name.replace(/\.md$/i, "");
        nodes.push({ id: r.path, label, folder: r.parent_path || "(root)" });
        fileIndex[label.toLowerCase()] = r.path;
        fileIndex[r.path.replace(/\.md$/i, "").toLowerCase()] = r.path;
      }
      for (const r of rows) {
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        const seen = new Set();
        while ((match = wikiLinkRegex.exec(r.content)) !== null) {
          const target = fileIndex[match[1].toLowerCase()];
          if (target && target !== r.path && !seen.has(target)) {
            edges.push({ source: r.path, target });
            seen.add(target);
          }
        }
      }
      sendJSON(res, { nodes, edges });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: full-text search ─────────────────────────────
  if (decoded.startsWith("/api/dm-admin/notebook/search") && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const query = (new URL(req.url, "http://x").searchParams.get("q") || "").trim();
    if (!query) { sendJSON(res, { results: [] }); return true; }
    try {
      const pattern = "%" + query.toLowerCase() + "%";
      const { rows } = await pgPool.query(
        `SELECT path, name, content FROM hotd_notebook_pages
         WHERE type = 'file' AND (LOWER(name) LIKE $1 OR LOWER(content) LIKE $1)
         ORDER BY CASE WHEN LOWER(name) LIKE $1 THEN 0 ELSE 1 END, name
         LIMIT 50`,
        [pattern]
      );
      const results = rows.map(r => {
        const lc = r.content.toLowerCase();
        const idx = lc.indexOf(query.toLowerCase());
        const nameMatch = r.name.toLowerCase().includes(query.toLowerCase());
        const lineNum = idx !== -1 ? r.content.substring(0, idx).split("\n").length : 0;
        const lines = r.content.split("\n");
        const context = idx !== -1 ? (lines[lineNum - 1] || "").trim().substring(0, 120) : "";
        return { path: r.path, name: r.name.replace(/\.md$/i, ""), line: lineNum, context, nameMatch };
      });
      sendJSON(res, { results });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Item Cards: search DB items for the picker ─────────────
  // GET /api/dm-admin/item-cards/search?q=...&kind=magic|mundane|all
  if (decoded === "/api/dm-admin/item-cards/search" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const u = new URL(req.url, "http://localhost");
      const q = (u.searchParams.get("q") || "").trim();
      const kind = (u.searchParams.get("kind") || "all").toLowerCase();
      if (q.length < 2) { sendJSON(res, { results: [] }); return true; }
      const like = `%${q}%`;
      const results = [];
      if (kind !== "mundane") {
        const r = await pgPool.query(
          `SELECT m.id, m.name, m.rarity, m.type, m.requires_attunement, m.avatar_url,
                  ca.image_url AS override
             FROM magic_items m
             LEFT JOIN hotd_card_art ca ON ca.kind = 'magic' AND ca.item_id = m.id::text
            WHERE m.name ILIKE $1 ORDER BY m.name LIMIT 40`, [like]);
        for (const row of r.rows) {
          const art = row.override || row.avatar_url || "";
          results.push({
            kind: "magic", id: String(row.id), name: row.name,
            rarity: row.rarity || "", type: row.type || "",
            attune: !!row.requires_attunement, hasImage: !!art,
            hasOverride: !!row.override,
          });
        }
      }
      if (kind !== "magic") {
        const r = await pgPool.query(
          `SELECT i.id, i.name, i.category, i.type, i.image,
                  ca.image_url AS override
             FROM items i
             LEFT JOIN hotd_card_art ca ON ca.kind = 'mundane' AND ca.item_id = i.id::text
            WHERE i.name ILIKE $1 ORDER BY i.name LIMIT 40`, [like]);
        for (const row of r.rows) {
          const art = row.override || row.image || "";
          results.push({
            kind: "mundane", id: String(row.id), name: row.name,
            rarity: row.category || "", type: row.type || "",
            attune: false, hasImage: !!art, hasOverride: !!row.override,
          });
        }
      }
      results.sort((a, b) => a.name.localeCompare(b.name));
      sendJSON(res, { results: results.slice(0, 60) });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Item Cards: single item detail (for the live preview) ────
  // GET /api/dm-admin/item-cards/item?kind=magic|mundane&id=...
  if (decoded === "/api/dm-admin/item-cards/item" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const u = new URL(req.url, "http://localhost");
      const kind = (u.searchParams.get("kind") || "").toLowerCase();
      const id = String(u.searchParams.get("id") || "");
      if (!id || (kind !== "magic" && kind !== "mundane")) { sendJSON(res, { error: "kind and id required" }, 400); return true; }
      const ovR = await pgPool.query("SELECT image_url FROM hotd_card_art WHERE kind=$1 AND item_id=$2", [kind, id]);
      const override = ovR.rows.length ? ovR.rows[0].image_url : null;
      let item = null;
      if (kind === "magic") {
        const r = await pgPool.query(
          `SELECT id, name, rarity, type, requires_attunement, source, source_page, description_text, avatar_url
             FROM magic_items WHERE id = $1`, [id]);
        if (r.rows.length) {
          const row = r.rows[0];
          const statBits = [row.rarity, row.type, row.requires_attunement ? "Requires Attunement" : null,
            row.source ? (row.source + (row.source_page ? ", pg. " + row.source_page : "")) : null].filter(Boolean);
          item = {
            kind, id: String(row.id), name: row.name, rarity: row.rarity || "", type: row.type || "",
            attune: !!row.requires_attunement, source: row.source || "",
            statLine: statBits.join(" \u00b7 "), description: row.description_text || "",
            art: override || row.avatar_url || "", hasOverride: !!override,
          };
        }
      } else {
        const r = await pgPool.query(
          `SELECT id, name, category, type, cost, weight, source, image
             FROM items WHERE id = $1`, [id]);
        if (r.rows.length) {
          const row = r.rows[0];
          const bits = [];
          if (row.category) bits.push(`**Category:** ${row.category}`);
          if (row.type) bits.push(`**Type:** ${row.type}`);
          if (row.cost) bits.push(`**Cost:** ${row.cost}`);
          if (row.weight) bits.push(`**Weight:** ${row.weight}`);
          const statBits = [row.category, row.type, row.source].filter(Boolean);
          item = {
            kind, id: String(row.id), name: row.name, rarity: row.category || "", type: row.type || "",
            attune: false, source: row.source || "",
            statLine: statBits.join(" \u00b7 "), description: bits.join("\n\n"),
            art: override || row.image || "", hasOverride: !!override,
          };
        }
      }
      if (!item) { sendJSON(res, { error: "Item not found" }, 404); return true; }
      sendJSON(res, { item });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Item Cards: set/clear the art override for an item ─────
  // POST /api/dm-admin/item-cards/art  { kind, id, image_url }
  if (decoded === "/api/dm-admin/item-cards/art" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const kind = String(body.kind || "").toLowerCase();
      const id = String(body.id || "");
      const imageUrl = (body.image_url || "").trim();
      if (!id || (kind !== "magic" && kind !== "mundane")) { sendJSON(res, { error: "kind and id required" }, 400); return true; }
      if (!imageUrl) {
        await pgPool.query("DELETE FROM hotd_card_art WHERE kind=$1 AND item_id=$2", [kind, id]);
        sendJSON(res, { ok: true, cleared: true });
      } else {
        await pgPool.query(
          `INSERT INTO hotd_card_art (kind, item_id, image_url, updated_at) VALUES ($1,$2,$3,NOW())
           ON CONFLICT (kind, item_id) DO UPDATE SET image_url = EXCLUDED.image_url, updated_at = NOW()`,
          [kind, id, imageUrl]);
        sendJSON(res, { ok: true, image_url: imageUrl });
      }
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Item Cards: generate a print-ready PDF ─────────────────
  // POST /api/dm-admin/item-cards  { items:[{kind,id}], title? }  → streams PDF
  if (decoded === "/api/dm-admin/item-cards" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const picks = Array.isArray(body.items) ? body.items : [];
      if (picks.length === 0) { sendJSON(res, { error: "No items selected" }, 400); return true; }
      if (picks.length > 45) { sendJSON(res, { error: "Too many items (max 45 / 5 sheets)" }, 400); return true; }

      if (!fs.existsSync(CARD_SCRIPT)) {
        sendJSON(res, {
          error: `Item-card builder not available in this deployment. Missing ${CARD_SCRIPT}. ` +
                 `Ship scripts/build-item-cards-pdf.js (plus weasyprint) in the container.`,
        }, 501);
        return true;
      }

      const magicIds = picks.filter(p => p.kind === "magic").map(p => String(p.id));
      const mundaneIds = picks.filter(p => p.kind === "mundane").map(p => String(p.id));
      const byKey = new Map();
      if (magicIds.length) {
        const r = await pgPool.query(
          `SELECT m.id, m.name, m.rarity, m.type, m.requires_attunement, m.source, m.source_page,
                  m.description_text, m.avatar_url, ca.image_url AS override
             FROM magic_items m
             LEFT JOIN hotd_card_art ca ON ca.kind = 'magic' AND ca.item_id = m.id::text
            WHERE m.id = ANY($1)`, [magicIds]);
        for (const row of r.rows) byKey.set("magic:" + row.id, {
          id: "magic-" + row.id,
          title: row.name,
          rarity: row.rarity || "",
          type: row.type || "",
          requires_attunement: !!row.requires_attunement,
          source: row.source ? (row.source + (row.source_page ? ", pg. " + row.source_page : "")) : "",
          description: row.description_text || "",
          imageUrl: row.override || row.avatar_url || null,
          imagePath: resolveLocalArt(row.override || row.avatar_url),
        });
      }
      if (mundaneIds.length) {
        const r = await pgPool.query(
          `SELECT i.id, i.name, i.category, i.type, i.cost, i.weight, i.source, i.image,
                  ca.image_url AS override
             FROM items i
             LEFT JOIN hotd_card_art ca ON ca.kind = 'mundane' AND ca.item_id = i.id::text
            WHERE i.id = ANY($1)`, [mundaneIds]);
        for (const row of r.rows) {
          const bits = [];
          if (row.category) bits.push(`**Category:** ${row.category}`);
          if (row.type) bits.push(`**Type:** ${row.type}`);
          if (row.cost) bits.push(`**Cost:** ${row.cost}`);
          if (row.weight) bits.push(`**Weight:** ${row.weight}`);
          byKey.set("mundane:" + row.id, {
            id: "mundane-" + row.id,
            title: row.name,
            rarity: row.category || "",
            type: row.type || "",
            requires_attunement: false,
            source: row.source || "",
            description: bits.join("\n\n"),
            imageUrl: row.override || row.image || null,
            imagePath: resolveLocalArt(row.override || row.image),
          });
        }
      }
      // Preserve the user's selection order; drop any that no longer exist.
      const items = picks.map(p => byKey.get(p.kind + ":" + String(p.id))).filter(Boolean);
      if (items.length === 0) { sendJSON(res, { error: "Selected items not found" }, 404); return true; }

      try { fs.mkdirSync(PDF_REPORTS_DIR, { recursive: true }); } catch (_) {}
      const stamp = Date.now();
      const tmpJson = notebookPath.join(os.tmpdir(), `hotd-item-cards-${stamp}.json`);
      const outAbsolute = notebookPath.join(PDF_REPORTS_DIR, `item-cards-${stamp}.pdf`);
      fs.writeFileSync(tmpJson, JSON.stringify(items), "utf8");

      const spawnArgs = [CARD_SCRIPT, "--from-json", tmpJson, "--out", outAbsolute];
      if (body.title) spawnArgs.push("--title", String(body.title).slice(0, 120));

      try {
        await new Promise((resolve, reject) => {
          const child = childProc.spawn(process.execPath, spawnArgs, {
            cwd: REPO_ROOT,
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, HOTD_CARD_CACHE_PATH: notebookPath.join(PDF_REPORTS_DIR, ".card-desc-cache.json") },
          });
          let stderr = "";
          child.stderr.on("data", d => { stderr += d.toString(); });
          child.on("error", reject);
          child.on("exit", code => {
            if (code === 0) resolve();
            else reject(new Error(`Card builder exited ${code}: ${stderr.slice(0, 500)}`));
          });
        });
      } finally {
        try { fs.unlinkSync(tmpJson); } catch (_) {}
      }

      const pdf = fs.readFileSync(outAbsolute);
      try { fs.unlinkSync(outAbsolute); } catch (_) {}
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="item-cards.pdf"`,
        "Content-Length": pdf.length,
      });
      res.end(pdf);
    } catch (e) {
      console.error("Item cards PDF error:", e);
      if (!res.headersSent) sendJSON(res, { error: e.message }, 500);
    }
    return true;
  }

  // ── DDB: audit downloaded content vs the RAG ────────────────
  // POST /api/dm-admin/ddb/audit  → structured coverage report
  if (decoded === "/api/dm-admin/ddb/audit" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const cobaltToken = await ddbClient.getCobaltToken();
      const report = await runDdbAudit(pgPool, { cobaltToken });
      sendJSON(res, { ok: true, report });
    } catch (err) {
      console.error("DDB audit error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── DDB: cobalt token health ────────────────────────────────
  // GET /api/dm-admin/ddb/cobalt  → { configured, source, valid, updatedOn, ... }
  if (decoded === "/api/dm-admin/ddb/cobalt" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const s = await ddbClient.status();
      sendJSON(res, { ok: true, status: s });
    } catch (err) {
      console.error("DDB cobalt status error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── DDB: update cobalt token (validate → save to Key Vault) ──
  // POST /api/dm-admin/ddb/cobalt  { token }
  if (decoded === "/api/dm-admin/ddb/cobalt" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const token = (body.token || "").trim();
      if (!token) { sendJSON(res, { error: "token is required" }, 400); return true; }
      const v = await ddbClient.validateToken(token);
      if (!v.ok) { sendJSON(res, { error: `Token rejected by D&D Beyond (${v.status || v.error || "invalid"})`, reason: "invalid-token" }, 400); return true; }
      await ddbClient.setCobaltToken(token);
      const s = await ddbClient.status();
      sendJSON(res, { ok: true, saved: true, status: s });
    } catch (err) {
      console.error("DDB cobalt update error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Homebrew authoring: category list + field schema ──────
  if (decoded === "/api/dm-admin/homebrew/categories" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    sendJSON(res, { categories: homebrewSchema.categoryList() });
    return true;
  }
  if (decoded === "/api/dm-admin/homebrew/schema" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const cat = new URL(req.url, "http://x").searchParams.get("category") || "";
    const def = homebrewSchema.getCategory(cat);
    if (!def) { sendJSON(res, { error: "unknown category" }, 400); return true; }
    sendJSON(res, { category: cat, label: def.label, pushable: !!def.pushable, fields: def.fields });
    return true;
  }

  // ── Homebrew authoring: draft list / get / save ────────────
  if (decoded === "/api/dm-admin/homebrew/drafts" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const cat = new URL(req.url, "http://x").searchParams.get("category") || null;
      sendJSON(res, { drafts: await homebrewPublish.listDrafts(pgPool, cat) });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }
  if (decoded === "/api/dm-admin/homebrew/draft" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const id = new URL(req.url, "http://x").searchParams.get("id");
      const d = await homebrewPublish.getDraft(pgPool, id);
      if (!d) { sendJSON(res, { error: "not found" }, 404); return true; }
      sendJSON(res, { draft: d });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }
  if (decoded === "/api/dm-admin/homebrew/draft" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!homebrewSchema.getCategory(body.category)) { sendJSON(res, { error: "unknown category" }, 400); return true; }
      const row = await homebrewPublish.saveDraft(pgPool, { ...body, created_by: session.username || null });
      sendJSON(res, { ok: true, draft: row });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Homebrew authoring: DM-AI field generation ───────────
  // POST /api/dm-admin/homebrew/generate  { category, prompt }
  if (decoded === "/api/dm-admin/homebrew/generate" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const def = homebrewSchema.getCategory(body.category);
      const prompt = (body.prompt || "").trim();
      if (!def) { sendJSON(res, { error: "unknown category" }, 400); return true; }
      if (!prompt) { sendJSON(res, { error: "prompt is required" }, 400); return true; }
      const model = azure.aiModel || "gpt-5.4-mini";
      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: def.generate.system + " Return ONLY a JSON object." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      });
      recordChatCompletion(completion, { model, username: session.username || "", isDM: true, source: "dm-admin.homebrew-generate" });
      let fields = {};
      try { fields = JSON.parse(completion.choices[0].message.content || "{}"); } catch (_) {}
      sendJSON(res, { ok: true, fields });
    } catch (e) { console.error("Homebrew generate error:", e); sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Homebrew authoring: "already in RAG?" check ──────────
  if (decoded === "/api/dm-admin/homebrew/rag-check" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const u = new URL(req.url, "http://x").searchParams;
      const name = (u.get("name") || "").trim();
      if (name.length < 2) { sendJSON(res, { matches: [] }); return true; }
      const r = await pgPool.query(
        "SELECT DISTINCT title, source_type FROM hotd_embeddings WHERE title ILIKE $1 LIMIT 6",
        [`%${name}%`]);
      sendJSON(res, { matches: r.rows });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Homebrew authoring: publish (mirror + embed + gated push) ─
  // POST /api/dm-admin/homebrew/publish  { id, baseId? }
  if (decoded === "/api/dm-admin/homebrew/publish" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!body.id) { sendJSON(res, { error: "draft id required" }, 400); return true; }
      const report = await homebrewPublish.publishDraft(pgPool, azure.openaiClient, body.id, { baseId: body.baseId });
      sendJSON(res, { ok: true, report });
    } catch (e) { console.error("Homebrew publish error:", e); sendJSON(res, { error: e.message, reason: e.reason || null }, 500); }
    return true;
  }

  // ── DDB: sync (embed downloaded-but-unembedded rows into RAG) ─
  // POST /api/dm-admin/ddb/sync  { types?: ["ddb_monster", ...] }
  if (decoded === "/api/dm-admin/ddb/sync" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      let types = [];
      try { const body = JSON.parse(await readBody(req) || "{}"); types = Array.isArray(body.types) ? body.types : []; } catch (_) {}
      const result = await embedDdbMissing(pgPool, azure.openaiClient, { types });
      sendJSON(res, { ok: true, result });
    } catch (err) {
      console.error("DDB sync error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── DDB: sync sources (download content + art/maps → embed) [background] ─
  // POST /api/dm-admin/ddb/sync-missing  { sources?: ["wel"], images? }
  // No `sources` → every currently-Missing source. Runs in the background
  // (big books exceed proxy timeouts); poll /ddb/sync-status?id=.
  if (decoded === "/api/dm-admin/ddb/sync-missing" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      let sourceCodes = Array.isArray(body.sources) ? body.sources.map((s) => String(s).toLowerCase()).filter(Boolean) : [];
      if (!sourceCodes.length) {
        const cobaltToken = await ddbClient.getCobaltToken();
        const audit = await runDdbAudit(pgPool, { cobaltToken });
        sourceCodes = ((audit.ddbOwned && audit.ddbOwned.missing) || []).map((s) => s.code);
      }
      if (!sourceCodes.length) { sendJSON(res, { ok: true, empty: true, note: "nothing missing" }); return true; }
      const withImages = body.images !== false;
      const openai = azure.openaiClient;
      const job = ddbJobs.start(`Sync ${sourceCodes.length} source(s)${withImages ? " + art/maps" : ""}`, async (log) => {
        log(`Downloading stat content for ${sourceCodes.length} source(s)\u2026`);
        const content = await ddbDownload.downloadSources(pgPool, { sourceCodes, onLog: log });
        const images = { found: 0, uploaded: 0, art: 0, maps: 0, published: 0, skipped: 0, failed: 0, noImages: 0 };
        if (withImages) {
          for (const code of sourceCodes) {
            try {
              const r = await ddbBookImages.downloadBookImages(pgPool, code, { onLog: log });
              images.found += r.found; images.uploaded += r.uploaded; images.art += r.art; images.maps += r.maps;
              images.published += r.published; images.skipped += r.skipped; images.failed += r.failed;
            } catch (e) { images.noImages++; log(`images ${code}: ${e.message}`); }
          }
        }
        log("Embedding new content into the RAG\u2026");
        const embedded = await embedDdbMissing(pgPool, openai, {});
        log("Done.");
        return { sources: sourceCodes, content, images, embedded };
      });
      sendJSON(res, { ok: true, jobId: job.id, sources: sourceCodes.length });
    } catch (err) {
      console.error("DDB sync-missing error:", err);
      sendJSON(res, { error: err.message, reason: err.reason || null }, 500);
    }
    return true;
  }

  // ── DDB: background sync job status ──────────────────────
  // GET /api/dm-admin/ddb/sync-status?id=...
  if (decoded === "/api/dm-admin/ddb/sync-status" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = new URL(req.url, "http://x").searchParams.get("id") || "";
    const v = ddbJobs.view(id);
    if (!v) { sendJSON(res, { error: "job not found" }, 404); return true; }
    sendJSON(res, { ok: true, job: v });
    return true;
  }

  // ── Images: describe + index into the RAG for search (background) ──
  // POST /api/dm-admin/images/index  { limit? }  → poll /ddb/sync-status?id=
  if (decoded === "/api/dm-admin/images/index" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const limit = parseInt(body.limit, 10) || 120;
      const openai = azure.openaiClient;
      const job = ddbJobs.start(`Index images for search (limit ${limit})`, async (log) => imageIndex.describeAndIndexImages(pgPool, openai, { limit, onLog: log }));
      sendJSON(res, { ok: true, jobId: job.id });
    } catch (err) {
      console.error("Image index error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Images: get/set tags (source auto, type, custom) ───────
  // GET /api/dm-admin/images/tags?url=...   POST { url, type, tags }
  if (decoded === "/api/dm-admin/images/tags" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const url = new URL(req.url, "http://x").searchParams.get("url") || "";
      if (!url) { sendJSON(res, { error: "url is required" }, 400); return true; }
      const r = await pgPool.query("SELECT source, type, tags FROM hotd_image_tags WHERE url=$1", [url]);
      const row = r.rows[0] || { source: "", type: "Other", tags: [] };
      sendJSON(res, { ok: true, types: imageTags.TYPES, tags: row });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return true;
  }
  if (decoded === "/api/dm-admin/images/tags" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!body.url) { sendJSON(res, { error: "url is required" }, 400); return true; }
      const tags = Array.isArray(body.tags) ? body.tags : (typeof body.tags === "string" ? body.tags.split(",") : null);
      await imageTags.saveTags(pgPool, body.url, { source: body.source || null, type: body.type || null, tags });
      sendJSON(res, { ok: true });
    } catch (err) { sendJSON(res, { error: err.message }, 500); }
    return true;
  }

  // ── DDB: extract a book's images (art + maps) → Storage Account ─
  // POST /api/dm-admin/ddb/book-images  { book: "hwt", force? }
  if (decoded === "/api/dm-admin/ddb/book-images" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const book = (body.book || "").toString().toLowerCase().trim();
      if (!book) { sendJSON(res, { error: "book code is required" }, 400); return true; }
      const result = await ddbBookImages.downloadBookImages(pgPool, book, { force: !!body.force });
      sendJSON(res, { ok: true, result });
    } catch (err) {
      console.error("DDB book-images error:", err);
      sendJSON(res, { error: err.message, reason: err.reason || null }, 500);
    }
    return true;
  }

  return false;
}

module.exports = { handleDmAdminApiRoutes };
