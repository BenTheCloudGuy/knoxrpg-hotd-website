// ══════════════════════════════════════════════════════════════
// ── DM ADMIN API ROUTES ──────────────────────────────────────
// JSON API endpoints for the DM Management Interface.
// All routes require session.role === "admin".
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { readBody, sendJSON, parseMultipart } = require("../lib/utils");
const azure = require("../lib/azure");
const { uploadBlobToStorage } = azure;
const { searchEmbeddings, buildEmbeddingContext } = require("../lib/rag");
const { extractCanonUpdates } = require("../lib/canon-extractor");
const { applyCanonUpdates, reindexSources } = require("../lib/canon-applier");
const { recordChatCompletion, trackAiImage } = require("../lib/telemetry");
const { syncCharacterFromDDB } = require("../lib/ddb-sync");
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
    const ragUrl = process.env.RAG_SERVICE_URL;
    if (!ragUrl) { sendJSON(res, { status: "not_configured" }); return true; }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const r = await fetch(ragUrl + "/health", { signal: controller.signal });
      clearTimeout(timeout);
      sendJSON(res, { status: r.ok ? "ok" : "error", code: r.status });
    } catch (err) {
      sendJSON(res, { status: "error", error: err.message });
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
  // ── STORY FORGE ─────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════

  // ── Story Forge: generate content ──────────────────────────
  if (decoded === "/api/dm-admin/story-forge/generate" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const { template, prompt, entities } = body;
      if (!prompt) { sendJSON(res, { error: "Prompt is required" }, 400); return true; }

      // Build RAG context from the prompt + entity names
      const searchTerms = [prompt, ...(entities || [])].join(" ");
      const ragContext = await buildEmbeddingContext(azure.openaiClient, searchTerms, {
        includeDmOnly: true, limit: 12, minScore: 0.25,
      });

      // Also do direct DB lookups for mentioned entities
      const entityData = [];
      for (const ent of (entities || []).slice(0, 10)) {
        const npcR = await pgPool.query(
          "SELECT name, race, npc_class, location, status, alignment_tag, description FROM hotd_npcs WHERE name ILIKE $1 LIMIT 1",
          [`%${ent}%`]
        );
        if (npcR.rows.length) entityData.push({ type: "NPC", ...npcR.rows[0] });
      }

      const templatePrompts = {
        npc_backstory: "Generate a rich, detailed NPC backstory. Include personality traits, motivations, secrets, and connections to other campaign elements. Format with markdown headers.",
        magic_item: "Design a custom D&D 5e magic item. Include: Name, Rarity, Type, Attunement requirements, Description, Mechanical effects (with specific numbers), Lore/History. Format as a proper item card.",
        spell: "Design a custom D&D 5e spell. Include: Name, Level, School, Casting Time, Range, Components, Duration, Description with mechanical effects. Format as a proper spell card.",
        session_summary: "Write a narrative session summary in the voice of a chronicler. Include key events, NPC interactions, combat highlights, and plot developments. Reference specific characters and locations accurately.",
        session_planning: "Create a detailed session plan. Include: Opening scene, Key encounters (social/combat/exploration), NPC motivations and dialogue hooks, Potential branching points, Treasure/rewards, Cliffhanger ending options.",
        scene_description: "Write an evocative scene description for the DM to read aloud. Use vivid sensory details (sight, sound, smell, touch). Set the mood and atmosphere. Keep it 2-3 paragraphs.",
        quest_hook: "Design a compelling quest hook. Include: The hook (how players learn about it), Background (what's really going on), Key NPCs involved, Locations, Potential rewards, Complications/twists.",
        faction_lore: "Write detailed faction lore. Include: Name, History, Goals, Leadership, Membership, Relations with other factions, Current activities, How PCs might interact with them.",
        freeform: "",
      };

      const templateInstr = templatePrompts[template] || templatePrompts.freeform;
      const entityContext = entityData.length
        ? "\n\nDirect entity data:\n" + entityData.map(e => `- ${e.type}: ${e.name} — ${e.race || ""} ${e.npc_class || ""}, ${e.location || ""}, ${e.status || ""}. ${(e.description || "").slice(0, 500)}`).join("\n")
        : "";

      const systemPrompt = `You are the Story Forge — an AI assistant for the Dungeon Master of "Halls of the Damned", a D&D 5e campaign set in Barovia.

You MUST use the campaign context provided below to ensure accuracy. Never invent NPCs, locations, events, or history that contradict the established campaign data. If the context doesn't cover something, you may extrapolate creatively but flag it as [NEW CONTENT].

${templateInstr}

${ragContext}${entityContext}`;

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-5.4-mini";

      const t0 = Date.now();
      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 4096,
        temperature: 0.8,
      });
      recordChatCompletion(completion, {
        model,
        username: session.username || "",
        isDM: true,
        source: "dm-admin.story-forge",
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
      console.error("Story Forge generation error:", err);
      sendJSON(res, { error: err.message }, 500);
    }
    return true;
  }

  // ── Story Forge: list story elements ───────────────────────
  if (decoded === "/api/dm-admin/story-elements" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const params = new URL("http://x" + req.url).searchParams;
    const type = params.get("type") || null;
    const status = params.get("status") || null;
    let q = "SELECT id, element_type, title, status, related_entities, created_at, updated_at FROM hotd_dm_story_elements";
    const wheres = [];
    const vals = [];
    let idx = 1;
    if (type) { wheres.push(`element_type = $${idx++}`); vals.push(type); }
    if (status) { wheres.push(`status = $${idx++}`); vals.push(status); }
    if (wheres.length) q += " WHERE " + wheres.join(" AND ");
    q += " ORDER BY updated_at DESC";
    const r = await pgPool.query(q, vals);
    sendJSON(res, { elements: r.rows });
    return true;
  }

  // ── Story Forge: get single element ────────────────────────
  const storyGetMatch = decoded.match(/^\/api\/dm-admin\/story-elements\/(\d+)$/);
  if (storyGetMatch && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(storyGetMatch[1], 10);
    const r = await pgPool.query("SELECT * FROM hotd_dm_story_elements WHERE id = $1", [id]);
    if (r.rows.length === 0) { sendJSON(res, { error: "Not found" }, 404); return true; }
    sendJSON(res, { element: r.rows[0] });
    return true;
  }

  // ── Story Forge: commit (save) element ─────────────────────
  if (decoded === "/api/dm-admin/story-elements" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const { element_type, title, content, related_entities, status } = body;
    if (!element_type || !title || !content) {
      sendJSON(res, { error: "element_type, title, and content are required" }, 400);
      return true;
    }
    const r = await pgPool.query(
      `INSERT INTO hotd_dm_story_elements (element_type, title, content, related_entities, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [element_type, title, content, JSON.stringify(related_entities || []), status || "draft"]
    );
    sendJSON(res, { ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    return true;
  }

  // ── Story Forge: update element ────────────────────────────
  const storyUpdateMatch = decoded.match(/^\/api\/dm-admin\/story-elements\/(\d+)$/);
  if (storyUpdateMatch && req.method === "PUT") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(storyUpdateMatch[1], 10);
    const body = JSON.parse(await readBody(req));
    const sets = [];
    const vals = [];
    let idx = 1;
    if (body.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(body.title); }
    if (body.content !== undefined) { sets.push(`content = $${idx++}`); vals.push(body.content); }
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); vals.push(body.status); }
    if (body.related_entities !== undefined) { sets.push(`related_entities = $${idx++}`); vals.push(JSON.stringify(body.related_entities)); }
    if (body.element_type !== undefined) { sets.push(`element_type = $${idx++}`); vals.push(body.element_type); }
    if (sets.length === 0) { sendJSON(res, { error: "Nothing to update" }, 400); return true; }
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pgPool.query(`UPDATE hotd_dm_story_elements SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Story Forge: delete element ────────────────────────────
  const storyDeleteMatch = decoded.match(/^\/api\/dm-admin\/story-elements\/(\d+)$/);
  if (storyDeleteMatch && req.method === "DELETE") {
    if (!requireAdmin(session, res)) return true;
    const id = parseInt(storyDeleteMatch[1], 10);
    await pgPool.query("DELETE FROM hotd_dm_story_elements WHERE id = $1", [id]);
    sendJSON(res, { ok: true });
    return true;
  }

  // ── Story Forge: apply to NPCs (update NPC description with story element content) ──
  if (decoded === "/api/dm-admin/story-elements/apply" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    const body = JSON.parse(await readBody(req));
    const { element_id, npc_ids, append_text } = body;
    if (!element_id || !npc_ids?.length) {
      sendJSON(res, { error: "element_id and npc_ids are required" }, 400);
      return true;
    }
    const elR = await pgPool.query("SELECT title, content FROM hotd_dm_story_elements WHERE id = $1", [element_id]);
    if (elR.rows.length === 0) { sendJSON(res, { error: "Story element not found" }, 404); return true; }
    const text = append_text || `\n\n---\n**[Story Forge: ${elR.rows[0].title}]**\n${elR.rows[0].content}`;
    let updated = 0;
    for (const npcId of npc_ids) {
      const nid = parseInt(npcId, 10);
      if (isNaN(nid)) continue;
      await pgPool.query("UPDATE hotd_npcs SET description = description || $1 WHERE id = $2", [text, nid]);
      updated++;
    }
    // Mark element as committed
    await pgPool.query("UPDATE hotd_dm_story_elements SET status = 'committed' WHERE id = $1", [element_id]);
    sendJSON(res, { ok: true, updated });
    return true;
  }

  // ── Story Forge: RAG search preview ────────────────────────
  if (decoded === "/api/dm-admin/story-forge/rag-search" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    if (!azure.openaiClient) { sendJSON(res, { error: "OpenAI client not initialized" }, 500); return true; }
    try {
      const body = JSON.parse(await readBody(req));
      const results = await searchEmbeddings(azure.openaiClient, body.query || "", {
        includeDmOnly: true, limit: body.limit || 10, minScore: body.minScore || 0.2,
        sourceType: body.sourceType || undefined,
      });
      sendJSON(res, { results });
    } catch (err) {
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

      // Build RAG context from the message
      const ragContext = await buildEmbeddingContext(azure.openaiClient, userMsg, {
        includeDmOnly: true, limit: 8, minScore: 0.25,
      });

      const systemPrompt = `You are the DM AI assistant for "Halls of the Damned", a D&D 5e campaign set in Barovia.
You have access to the campaign's full knowledge base including DM-only secrets. Respond accurately using the context below.
Use markdown formatting. Be conversational but precise.

${ragContext}`;

      // Build message history (last 20 messages for context window)
      const historySlice = messages.slice(-20);
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...historySlice.map(m => ({ role: m.role, content: m.content })),
        { role: "user", content: userMsg },
      ];

      const cfgR = await pgPool.query("SELECT value FROM hotd_config WHERE key = 'ai_model'");
      const model = cfgR.rows.length ? cfgR.rows[0].value : "gpt-5.4-mini";

      const t0 = Date.now();
      const completion = await azure.openaiClient.chat.completions.create({
        model,
        messages: chatMessages,
        max_completion_tokens: 4096,
        temperature: 0.7,
      });
      recordChatCompletion(completion, {
        model,
        username: session.username || "",
        isDM: true,
        source: "dm-admin.chat",
        latencyMs: Date.now() - t0,
      });

      const aiReply = completion.choices[0]?.message?.content || "No response.";
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
        usage: completion.usage,
        ragChunks: ragContext ? ragContext.split("---").length : 0,
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
      const node = { name: r.name, path: r.path, type: r.type };
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

  // ── Helper: embed notebook page content into RAG ──
  async function embedNotebookPage(path, name, content) {
    try {
      const { openaiClient } = require("../lib/azure");
      const openai = openaiClient;
      if (!openai || !content.trim()) return;
      const { embedQuery } = require("../lib/rag");
      const crypto = require("crypto");

      // Chunk content (~1500 chars per chunk)
      const chunks = [];
      const lines = content.split("\n");
      let current = "";
      for (const line of lines) {
        if (current.length + line.length > 1500 && current.length > 200) {
          chunks.push(current);
          current = "";
        }
        current += line + "\n";
      }
      if (current.trim()) chunks.push(current);

      // Delete old embeddings for this notebook page
      await pgPool.query(
        "DELETE FROM hotd_embeddings WHERE source_type = 'notebook' AND source_path = $1",
        [path]
      );

      // Insert new embeddings
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i].trim();
        if (!chunkText) continue;
        const chunkHash = crypto.createHash("sha256").update(path + ":" + i + ":" + chunkText).digest("hex");
        const vector = await embedQuery(openai, chunkText);
        const vectorStr = "[" + vector.join(",") + "]";
        await pgPool.query(
          `INSERT INTO hotd_embeddings (source_type, source_path, chunk_index, title, chunk_text, chunk_hash, embedding, is_dm_only, metadata)
           VALUES ('notebook', $1, $2, $3, $4, $5, $6::vector, TRUE, $7)
           ON CONFLICT (chunk_hash) DO UPDATE SET chunk_text = $4, embedding = $6::vector, title = $3, updated_at = NOW()`,
          [path, i, name.replace(/\.md$/i, ""), chunkText, chunkHash, vectorStr, JSON.stringify({ notebook_path: path })]
        );
      }
    } catch (e) {
      console.warn("  WARN: notebook RAG embed failed for", path, e.message);
    }
  }

  // ── Notebook: file tree ────────────────────────────────────
  if (decoded === "/api/dm-admin/notebook/tree" && req.method === "GET") {
    if (!requireAdmin(session, res)) return true;
    try {
      const { rows } = await pgPool.query(
        "SELECT path, parent_path, name, type FROM hotd_notebook_pages ORDER BY type, name"
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
        "SELECT path, content FROM hotd_notebook_pages WHERE path = $1 AND type = 'file'", [filePath]
      );
      if (!rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      sendJSON(res, { path: rows[0].path, content: rows[0].content });
    } catch (e) { sendJSON(res, { error: e.message }, 500); }
    return true;
  }

  // ── Notebook: write file (+ RAG embed) ─────────────────────
  if (decoded === "/api/dm-admin/notebook/write" && req.method === "POST") {
    if (!requireAdmin(session, res)) return true;
    try {
      const b = JSON.parse(await readBody(req));
      if (!b.path || b.content === undefined) { sendJSON(res, { error: "path and content required" }, 400); return true; }
      const { rows } = await pgPool.query(
        "UPDATE hotd_notebook_pages SET content = $1, updated_at = NOW() WHERE path = $2 AND type = 'file' RETURNING name",
        [b.content, b.path]
      );
      if (!rows.length) { sendJSON(res, { error: "not found" }, 404); return true; }
      sendJSON(res, { ok: true });
      // Async RAG embedding (don't block the response)
      embedNotebookPage(b.path, rows[0].name, b.content).catch(() => {});
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
      // Embed new file content
      if (type === "file" && content.trim()) {
        embedNotebookPage(b.path, name, content).catch(() => {});
      }
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

  return false;
}

module.exports = { handleDmAdminApiRoutes };
