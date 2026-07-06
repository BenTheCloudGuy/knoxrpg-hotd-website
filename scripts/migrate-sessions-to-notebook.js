#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// Migrate hotd_sessions -> Campaign Notebook (Adventure Notes/Sessions/)
//
// One-time (idempotent) backfill. For each session row it writes a
// notebook page:
//
//   Adventure Notes/Sessions/Session NNN - Title.md
//
// with a metadata header + the existing session markdown copied as-is,
// status = 'published' (all workspace sessions are treated as published),
// then embeds it into RAG via the notebook-rag lib (summary = public,
// notes/prep = DM-only). Finally it purges the legacy source_type='session'
// embeddings (sessions now live in RAG as source_type='notebook').
//
// The hotd_sessions table is left intact (dormant backup + canon provenance).
//
// Env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE, OPENAI_API_KEY.
// Run from repo root:  node scripts/migrate-sessions-to-notebook.js [--dry-run]
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../src/db/pool");
const azure = require("../src/lib/azure");
const { syncNotebookPageEmbedding } = require("../src/lib/notebook-rag");
const { sessionFileName, SESSIONS_PREFIX } = require("../src/lib/sessions");

const DRY_RUN = process.argv.includes("--dry-run");

function metaBlock(row) {
  let playIso = "";
  if (row.play_date) { try { playIso = new Date(row.play_date).toISOString(); } catch (_) { playIso = String(row.play_date); } }
  return [
    "Session #: " + row.session_number,
    "Title: " + (row.title || ""),
    "In-Game Date: " + (row.game_date || ""),
    "Play Date: " + playIso,
  ].join("\n");
}

async function ensureFolders() {
  const segs = SESSIONS_PREFIX.replace(/\/+$/, "").split("/");
  let cumulative = "";
  for (const seg of segs) {
    const parent = cumulative;
    cumulative = cumulative ? cumulative + "/" + seg : seg;
    if (DRY_RUN) { console.log("  [dry-run] ensure folder:", cumulative); continue; }
    await pgPool.query(
      `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content)
       VALUES ($1, $2, $3, 'folder', '') ON CONFLICT (path) DO NOTHING`,
      [cumulative, parent, seg]
    );
  }
}

async function main() {
  await azure.initOpenAI();
  const openai = azure.openaiClient;
  if (!openai && !DRY_RUN) {
    console.error("ERROR: no OpenAI client (set OPENAI_API_KEY). Embedding would be skipped; aborting.");
    process.exit(1);
  }

  const { rows } = await pgPool.query(
    "SELECT id, session_number, title, summary, markdown, game_date, play_date, published FROM hotd_sessions ORDER BY session_number"
  );
  console.log(`Found ${rows.length} sessions to migrate.`);

  await ensureFolders();

  let created = 0, embedded = 0, chunkTotal = 0;
  for (const row of rows) {
    const name = sessionFileName(row.session_number, row.title) + ".md";
    const path = SESSIONS_PREFIX + name;
    const md = (row.markdown || "").trim();
    const content = metaBlock(row) + "\n\n" + md + "\n";

    if (DRY_RUN) {
      console.log(`  [dry-run] Session ${row.session_number} -> ${path} (${content.length} chars)`);
      continue;
    }

    await pgPool.query(
      `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content, status)
       VALUES ($1, $2, $3, 'file', $4, 'published')
       ON CONFLICT (path) DO UPDATE SET content = EXCLUDED.content, status = 'published', updated_at = NOW()`,
      [path, SESSIONS_PREFIX.replace(/\/+$/, ""), name, content]
    );
    created++;

    try {
      const r = await syncNotebookPageEmbedding(openai, { path, name, content, status: "published" });
      embedded++; chunkTotal += r.chunks || 0;
      console.log(`  Session ${row.session_number} -> ${name}  (${r.chunks} chunks)`);
    } catch (e) {
      console.warn(`  WARN embed failed for ${path}: ${e.message}`);
    }
  }

  if (!DRY_RUN) {
    const del = await pgPool.query("DELETE FROM hotd_embeddings WHERE source_type = 'session'");
    console.log(`Purged ${del.rowCount} legacy source_type='session' embeddings.`);
  }

  console.log(`\nDone. Pages upserted: ${created}, embedded: ${embedded}, total chunks: ${chunkTotal}.`);
  await pgPool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
