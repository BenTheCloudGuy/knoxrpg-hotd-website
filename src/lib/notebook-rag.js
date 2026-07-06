// ══════════════════════════════════════════════════════════════
// ── NOTEBOOK RAG ──────────────────────────────────────────────
// Embeds Campaign Notebook pages (hotd_notebook_pages) into RAG
// (hotd_embeddings, source_type='notebook') according to page status
// and player/DM visibility.
//
// Visibility rule (path-based):
//   - Pages under "Campaign Data/" are public campaign lore. Text above a
//     "## DM Notes" heading is player-visible (is_dm_only=false); the DM
//     Notes section is DM-only (is_dm_only=true).
//   - Every other notebook page (Adventure Notes, Monster Stats, NPC Info,
//     Magic Artifacts, …) is DM-only in its entirety.
//
// Only `published` pages are embedded. Draft (and unpublished) pages are
// removed from RAG.
// ══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const { pgPool } = require("../db/pool");
const { embedQuery } = require("./rag");

const PUBLIC_LORE_PREFIX = "Campaign Data/";

// Split a page's content into ~1500-char chunks on line boundaries.
function chunkText(content) {
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
  return chunks;
}

// Split page content into visibility segments [{ text, dmOnly }].
function splitVisibility(pagePath, content) {
  if (pagePath.startsWith(PUBLIC_LORE_PREFIX)) {
    const parts = content.split(/(?=^## DM Notes)/m);
    const player = parts[0].trim();
    const dm = parts.length > 1 ? parts.slice(1).join("\n").trim() : "";
    const out = [];
    if (player) out.push({ text: player, dmOnly: false });
    if (dm) out.push({ text: dm, dmOnly: true });
    return out;
  }
  return content.trim() ? [{ text: content.trim(), dmOnly: true }] : [];
}

// Remove all notebook embeddings for a page path.
async function removeNotebookEmbeddings(pagePath) {
  await pgPool.query(
    "DELETE FROM hotd_embeddings WHERE source_type = 'notebook' AND source_path = $1",
    [pagePath]
  );
}

// (Re)sync a notebook page's RAG embeddings to match its status + content.
// Draft/unpublished pages are removed from RAG; published pages are embedded
// with the correct player/DM visibility. Returns { chunks }.
async function syncNotebookPageEmbedding(openai, { path: pagePath, name, content, status }) {
  await removeNotebookEmbeddings(pagePath);
  if (status !== "published" || !openai || !content || !content.trim()) return { chunks: 0 };

  const title = (name || "").replace(/\.md$/i, "");
  const segments = splitVisibility(pagePath, content);
  let idx = 0;
  for (const seg of segments) {
    for (const raw of chunkText(seg.text)) {
      const chunk = raw.trim();
      if (!chunk) continue;
      const chunkHash = crypto.createHash("sha256").update(pagePath + ":" + idx + ":" + chunk).digest("hex");
      const vector = await embedQuery(openai, chunk);
      const vectorStr = "[" + vector.join(",") + "]";
      await pgPool.query(
        `INSERT INTO hotd_embeddings (source_type, source_path, chunk_index, title, chunk_text, chunk_hash, embedding, is_dm_only, metadata)
         VALUES ('notebook', $1, $2, $3, $4, $5, $6::vector, $7, $8)
         ON CONFLICT (chunk_hash) DO UPDATE SET chunk_text = $4, title = $3, embedding = $6::vector, is_dm_only = $7, updated_at = NOW()`,
        [pagePath, idx, title, chunk, chunkHash, vectorStr, seg.dmOnly, JSON.stringify({ notebook_path: pagePath, dm_only: seg.dmOnly })]
      );
      idx++;
    }
  }
  return { chunks: idx };
}

module.exports = { syncNotebookPageEmbedding, removeNotebookEmbeddings, splitVisibility };
