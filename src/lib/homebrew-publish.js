// ══════════════════════════════════════════════════════════════
// ── HOMEBREW PUBLISH ORCHESTRATION (§6) ───────────────────────
// Save drafts, and on Publish: (1) mirror into the matching content
// table (source `hotd-homebrew`), (2) embed into the HOTD RAG
// (`hotd_embeddings`, source_type `homebrew`, player-visible unless
// marked DM-only), (3) optionally push to D&D Beyond (gated behind
// ddb-homebrew.pushEnabled(); magic-item only for now). Each step is
// independent and non-fatal — Save + Embed succeed even if the DDB
// push is off or fails.
// ══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const schema = require("./homebrew-schema");
const ddbHb = require("./ddb-homebrew");

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;
const MAX_CHUNK_CHARS = 3000;

function sha256(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function slugify(n) { return String(n || "item").toLowerCase().replace(/[\u2018\u2019']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }

// ── Drafts CRUD ───────────────────────────────────────────────
async function saveDraft(pgPool, d) {
  const fields = d.fields || {};
  const name = (fields.name || d.name || "").toString();
  if (d.id) {
    const r = await pgPool.query(
      `UPDATE hotd_homebrew SET category=$1, name=$2, fields=$3, image_url=$4, is_player_visible=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [d.category, name, JSON.stringify(fields), d.image_url || null, d.is_player_visible !== false, d.id]
    );
    return r.rows[0];
  }
  const r = await pgPool.query(
    `INSERT INTO hotd_homebrew (category, name, fields, image_url, is_player_visible, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.category, name, JSON.stringify(fields), d.image_url || null, d.is_player_visible !== false, d.created_by || null]
  );
  return r.rows[0];
}

async function listDrafts(pgPool, category) {
  const r = await pgPool.query(
    `SELECT id, category, name, status, image_url, is_player_visible, ddb_url, rag_chunks, updated_at
       FROM hotd_homebrew ${category ? "WHERE category=$1" : ""} ORDER BY updated_at DESC LIMIT 200`,
    category ? [category] : []
  );
  return r.rows;
}

async function getDraft(pgPool, id) {
  const r = await pgPool.query("SELECT * FROM hotd_homebrew WHERE id=$1", [id]);
  return r.rows[0] || null;
}

// ── Mirror into the matching content table (best-effort) ──────
async function mirrorToContent(pgPool, draft) {
  const def = schema.getCategory(draft.category);
  if (!def || !def.contentTable) return null;
  const f = draft.fields || {};
  const id = `hb-${draft.id}`;
  const text = schema.composeText(draft.category, f);
  const slug = `${id}-${slugify(f.name)}`;
  const rawJson = JSON.stringify({ ...f, source: "hotd-homebrew", category: draft.category, homebrew_id: draft.id });
  try {
    if (draft.category === "magic-item") {
      await pgPool.query(
        `INSERT INTO magic_items (id, name, slug, source, type, rarity, requires_attunement, description_text, description_detail, is_homebrew, avatar_url, raw_json)
         VALUES ($1,$2,$3,'hotd-homebrew',$4,$5,$6,$7,$8,TRUE,$9,$10)
         ON CONFLICT (id) DO UPDATE SET name=$2, slug=$3, type=$4, rarity=$5, requires_attunement=$6, description_text=$7, description_detail=$8, avatar_url=$9, raw_json=$10`,
        [id, f.name, slug, f.type || null, f.rarity || null, !!f.requires_attunement, text, f.description || "", draft.image_url || null, rawJson]
      );
    } else if (draft.category === "spell") {
      await pgPool.query(
        `INSERT INTO spells (id, name, source, level, school, description_text, raw_json)
         VALUES ($1,$2,'hotd-homebrew',$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name=$2, level=$3, school=$4, description_text=$5, raw_json=$6`,
        [id, f.name, parseInt(f.level, 10) || 0, f.school || null, text, rawJson]
      );
    } else if (draft.category === "monster") {
      await pgPool.query(
        `INSERT INTO monsters (id, name, slug, source, size, type, alignment, challenge_rating_display, description_text, avatar_url, raw_json)
         VALUES ($1,$2,$3,'hotd-homebrew',$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET name=$2, slug=$3, size=$4, type=$5, alignment=$6, challenge_rating_display=$7, description_text=$8, avatar_url=$9, raw_json=$10`,
        [id, f.name, slug, f.size || null, f.type || null, f.alignment || null, f.challenge_rating || null, text, draft.image_url || null, rawJson]
      );
    } else if (draft.category === "feat") {
      await pgPool.query(
        `INSERT INTO feats (id, name, slug, source, snippet, description_text, raw_json)
         VALUES ($1,$2,$3,'hotd-homebrew',$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET name=$2, slug=$3, snippet=$4, description_text=$5, raw_json=$6`,
        [id, f.name, slug, (f.prerequisite ? "Prerequisite: " + f.prerequisite : ""), text, rawJson]
      );
    } else {
      return null; // background/species/subclass: embed-only for now
    }
    return id;
  } catch (e) {
    return { error: e.message };
  }
}

// ── Embed into the RAG ────────────────────────────────────────
function splitChunks(text) {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = start + MAX_CHUNK_CHARS;
    if (end < text.length) { const p = text.slice(start, end).lastIndexOf("\n\n"); if (p > MAX_CHUNK_CHARS * 0.5) end = start + p; }
    out.push(text.slice(start, end).trim());
    start = end;
  }
  return out.filter((c) => c.length > 20);
}

async function embedDraft(pgPool, openaiClient, draft) {
  if (!openaiClient) throw new Error("OpenAI client not initialized");
  const def = schema.getCategory(draft.category);
  const text = schema.composeText(draft.category, draft.fields || {});
  const sourcePath = `homebrew:${draft.id}`;
  // Replace any prior embeddings for this draft.
  await pgPool.query("DELETE FROM hotd_embeddings WHERE source_path=$1", [sourcePath]);
  const parts = splitChunks(text);
  const isDmOnly = draft.is_player_visible === false;
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    const resp = await openaiClient.embeddings.create({ model: EMBED_MODEL, input: chunk, dimensions: EMBED_DIMENSIONS });
    const vec = `[${resp.data[0].embedding.join(",")}]`;
    const title = (draft.fields && draft.fields.name ? draft.fields.name : "Homebrew") + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : "");
    await pgPool.query(
      `INSERT INTO hotd_embeddings (source_type, source_id, source_path, chunk_index, title, chunk_text, chunk_hash, metadata, embedding, is_dm_only, updated_at)
       VALUES ('homebrew', NULL, $1, $2, $3, $4, $5, $6, $7::vector, $8, NOW())
       ON CONFLICT (chunk_hash) DO UPDATE SET chunk_text=$4, title=$3, metadata=$6, embedding=$7::vector, is_dm_only=$8, updated_at=NOW()`,
      [sourcePath, i, title, chunk, sha256(chunk), JSON.stringify({ category: draft.category, source_type: def ? def.sourceType : null, source: "hotd-homebrew", homebrew_id: draft.id }), vec, isDmOnly]
    );
    n++;
  }
  return n;
}

// ── Publish orchestration ─────────────────────────────────────
async function publishDraft(pgPool, openaiClient, id, opts = {}) {
  const draft = await getDraft(pgPool, id);
  if (!draft) throw new Error("Draft not found");
  const def = schema.getCategory(draft.category);
  const report = { id, category: draft.category, steps: {} };

  // 1. Validate required fields
  const missing = (def.fields || []).filter((fd) => fd.required && !(draft.fields || {})[fd.key]).map((fd) => fd.label);
  if (missing.length) { const e = new Error("Missing required fields: " + missing.join(", ")); e.reason = "validation"; throw e; }

  // 2. Mirror to local content table
  const localId = await mirrorToContent(pgPool, draft);
  report.steps.mirror = localId && !localId.error ? { ok: true, localId } : { ok: false, skipped: !localId, error: localId && localId.error };

  // 3. Embed into RAG
  try { report.steps.embed = { ok: true, chunks: await embedDraft(pgPool, openaiClient, draft) }; }
  catch (e) { report.steps.embed = { ok: false, error: e.message }; }

  // 4. Push to DDB (gated; magic-item only)
  if (def.pushable && ddbHb.pushEnabled()) {
    try {
      const pushed = await ddbHb.pushDraft(draft.category, { baseId: opts.baseId, fields: draft.fields });
      report.steps.ddb = { ok: pushed.edited, ddbUrl: pushed.ddbUrl, ddbId: pushed.id };
      draft.ddb_id = pushed.id; draft.ddb_entity_type_id = pushed.entityTypeId; draft.ddb_url = pushed.ddbUrl;
    } catch (e) { report.steps.ddb = { ok: false, error: e.message, reason: e.reason || null }; }
  } else {
    report.steps.ddb = { ok: false, skipped: true, reason: def.pushable ? "push-disabled" : "category-not-pushable" };
  }

  // 5. Persist status
  const r = await pgPool.query(
    `UPDATE hotd_homebrew SET status='published', local_row_id=$1, rag_chunks=$2, ddb_id=$3, ddb_entity_type_id=$4, ddb_url=$5, updated_at=NOW()
     WHERE id=$6 RETURNING status, ddb_url, rag_chunks`,
    [typeof localId === "string" ? localId : null, (report.steps.embed && report.steps.embed.chunks) || 0,
     draft.ddb_id || null, draft.ddb_entity_type_id || null, draft.ddb_url || null, id]
  );
  report.status = r.rows[0].status;
  report.ddbUrl = r.rows[0].ddb_url;
  report.ragChunks = r.rows[0].rag_chunks;
  return report;
}

module.exports = { saveDraft, listDrafts, getDraft, mirrorToContent, embedDraft, publishDraft };
