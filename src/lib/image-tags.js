// ══════════════════════════════════════════════════════════════
// ── IMAGE TAGS (source / type / custom) ───────────────────────
// Side table keyed by image URL so tags work across every gallery
// source (hotd_art, hotd_generated_images, hotd_maps, filesystem)
// without altering those tables. Source is auto-derived; Type +
// custom tags are set by the AI index job or by an admin.
// ══════════════════════════════════════════════════════════════

// Canonical Type options (custom tags are free-form, stored in `tags`).
const TYPES = ["Portrait", "Location/Landmark", "Monster", "Emblem", "Other"];
const SOURCES = ["DDB", "DMAI", "Upload"];

async function ensureTable(pgPool) {
  await pgPool.query(`CREATE TABLE IF NOT EXISTS hotd_image_tags (
    url TEXT PRIMARY KEY,
    source TEXT DEFAULT '',
    type TEXT DEFAULT 'Other',
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

// Auto source from where the image came from + hints.
function deriveSource(origin, url, description) {
  if (origin === "generated") return "DMAI";
  if (/\/ddb-books\//.test(url || "") || /\(D&D Beyond\)/i.test(description || "")) return "DDB";
  return "Upload";
}

// url -> { source, type, tags[] }
async function loadTagMap(pgPool) {
  const m = new Map();
  try { const r = await pgPool.query("SELECT url, source, type, tags FROM hotd_image_tags"); r.rows.forEach((x) => m.set(x.url, { source: x.source || "", type: x.type || "Other", tags: x.tags || [] })); } catch (_) {}
  return m;
}

function normType(t) { return TYPES.includes(t) ? t : "Other"; }

// Upsert tags for one image. Null fields are left unchanged.
async function saveTags(pgPool, url, { source, type, tags } = {}) {
  await ensureTable(pgPool);
  const cleanTags = Array.isArray(tags) ? [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))] : null;
  await pgPool.query(
    `INSERT INTO hotd_image_tags (url, source, type, tags, updated_at)
     VALUES ($1, COALESCE($2,''), COALESCE($3,'Other'), COALESCE($4::text[], ARRAY[]::text[]), NOW())
     ON CONFLICT (url) DO UPDATE SET
       source = COALESCE($2, hotd_image_tags.source),
       type   = COALESCE($3, hotd_image_tags.type),
       tags   = COALESCE($4::text[], hotd_image_tags.tags),
       updated_at = NOW()`,
    [url, source || null, type ? normType(type) : null, cleanTags]
  );
}

module.exports = { TYPES, SOURCES, ensureTable, deriveSource, loadTagMap, saveTags, normType };
