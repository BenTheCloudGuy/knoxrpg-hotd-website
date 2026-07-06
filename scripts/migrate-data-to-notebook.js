#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// migrate-data-to-notebook.js — Step 2 of the Campaign Notes migration
// ══════════════════════════════════════════════════════════════
// Copies the campaign lore markdown under src/hotd-campaign/data/ into the
// DB-backed Campaign Notebook (hotd_notebook_pages), preserving folder
// structure under a "Campaign Data" root:
//   <root>/<top-level files>        (campaign_notes.md, history.md, ...)
//   <root>/Groups/<file>.md         (groups/*.md)
//   <root>/Realms/<file>.md         (realms/*.md)
//
// Pages are inserted as DRAFT (status='draft') and are NOT embedded into RAG.
// Image links (../images/, ../../images/, bare /images/) are rewritten to the
// migrated /hotd-content/images/ location. Idempotent: re-running updates
// content without changing an already-set status.
//
// Env: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
// Usage: node scripts/migrate-data-to-notebook.js [--dry-run]
// ══════════════════════════════════════════════════════════════
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DRY_RUN = process.argv.includes("--dry-run");
const DATA_DIR = path.resolve(__dirname, "../src/hotd-campaign/data");
const ROOT = "Campaign Data";
// source subdir -> notebook subfolder name
const SUBDIR_MAP = { groups: "Groups", realms: "Realms" };

// Rewrite repo-relative / legacy image links to the migrated location.
function rewriteImageLinks(md) {
  return md
    // ../images/ and ../../images/ (one or more ../) -> absolute
    .replace(/(?:\.\.\/)+images\//g, "/hotd-content/images/")
    // bare absolute /images/ (but not an already-correct /hotd-content/images/)
    .replace(/(?<!hotd-content)\/images\//g, "/hotd-content/images/");
}

function listMarkdown(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listMarkdown(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith(".md")) out.push(rel);
  }
  return out;
}

// Map a data-relative path to its notebook path + parent path.
function toNotebook(relPath) {
  const parts = relPath.split("/");
  const file = parts.pop();
  const folders = parts.map((p) => SUBDIR_MAP[p] || p);
  const parent = [ROOT, ...folders].join("/");
  return { notebookPath: `${parent}/${file}`, parentPath: parent, name: file, folders };
}

async function main() {
  const rels = listMarkdown(DATA_DIR).sort();
  console.log(`Found ${rels.length} markdown files under ${DATA_DIR}`);
  if (DRY_RUN) console.log("DRY RUN — no DB changes\n");

  // Collect the folder set to create (Campaign Data, Campaign Data/Groups, ...)
  const folderPaths = new Set([ROOT]);
  const files = [];
  for (const rel of rels) {
    const m = toNotebook(rel);
    let cumulative = ROOT;
    for (const f of m.folders) { cumulative = `${cumulative}/${f}`; folderPaths.add(cumulative); }
    const raw = fs.readFileSync(path.join(DATA_DIR, rel), "utf-8");
    files.push({ ...m, content: rewriteImageLinks(raw), rawLen: raw.length });
  }

  const client = new Client();
  await client.connect();
  try {
    let folders = 0, upserts = 0;
    // Folders (idempotent)
    for (const fp of [...folderPaths].sort((a, b) => a.length - b.length)) {
      const parts = fp.split("/");
      const name = parts.pop();
      const parent = parts.join("/");
      if (DRY_RUN) { console.log(`  [folder] ${fp}`); folders++; continue; }
      await client.query(
        `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content, status)
         VALUES ($1, $2, $3, 'folder', '', 'published') ON CONFLICT (path) DO NOTHING`,
        [fp, parent, name]
      );
      folders++;
    }
    // Files as DRAFT (idempotent: update content on conflict, keep existing status)
    for (const f of files) {
      if (DRY_RUN) { console.log(`  [draft ] ${f.notebookPath}  (${f.rawLen} chars)`); upserts++; continue; }
      await client.query(
        `INSERT INTO hotd_notebook_pages (path, parent_path, name, type, content, status)
         VALUES ($1, $2, $3, 'file', $4, 'draft')
         ON CONFLICT (path) DO UPDATE SET content = EXCLUDED.content, name = EXCLUDED.name, updated_at = NOW()`,
        [f.notebookPath, f.parentPath, f.name, f.content]
      );
      upserts++;
    }
    console.log(`\nFolders ensured: ${folders}`);
    console.log(`Files upserted (draft): ${upserts}`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
