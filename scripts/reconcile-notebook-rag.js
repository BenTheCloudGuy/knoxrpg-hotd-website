#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// reconcile-notebook-rag.js — one-time Step 4 reconciliation
// ══════════════════════════════════════════════════════════════
// (Re)embeds every PUBLISHED Campaign Notebook page as
// source_type='notebook' with player/DM visibility (delegates to
// src/lib/notebook-rag.js — same logic used by the publish endpoint), then
// deletes the legacy file-based `lore` / `lore_json` embeddings those pages
// now replace (including the orphaned rows npcs.json produced as a lore_json
// source).
//
// Env: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, OPENAI_API_KEY
// Usage: node scripts/reconcile-notebook-rag.js [--dry-run]
// ══════════════════════════════════════════════════════════════
const OpenAI = require("openai");
const { pgPool } = require("../src/db/pool");
const { syncNotebookPageEmbedding } = require("../src/lib/notebook-rag");

const DRY = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const { rows: pages } = await pgPool.query(
    "SELECT path, name, content FROM hotd_notebook_pages WHERE type='file' AND status='published' ORDER BY path"
  );
  console.log(`Published notebook pages: ${pages.length}${DRY ? " (DRY RUN)" : ""}`);

  let total = 0;
  for (const pg of pages) {
    if (DRY) { console.log(`  [dry] ${pg.path}`); continue; }
    const { chunks } = await syncNotebookPageEmbedding(openai, {
      path: pg.path, name: pg.name, content: pg.content, status: "published",
    });
    total += chunks;
    if (chunks) console.log(`  embedded ${pg.path} (${chunks} chunks)`);
  }
  console.log(`Total notebook chunks embedded: ${total}`);

  if (!DRY) {
    const vis = await pgPool.query(
      "SELECT is_dm_only, count(*) FROM hotd_embeddings WHERE source_type='notebook' GROUP BY is_dm_only ORDER BY is_dm_only"
    );
    for (const r of vis.rows) console.log(`  notebook is_dm_only=${r.is_dm_only}: ${r.count}`);
    const del = await pgPool.query("DELETE FROM hotd_embeddings WHERE source_type IN ('lore','lore_json')");
    console.log(`Legacy lore/lore_json rows deleted: ${del.rowCount}`);
  } else {
    const c = await pgPool.query("SELECT count(*) FROM hotd_embeddings WHERE source_type IN ('lore','lore_json')");
    console.log(`Legacy lore/lore_json rows that WOULD be deleted: ${c.rows[0].count}`);
  }

  await pgPool.end();
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
