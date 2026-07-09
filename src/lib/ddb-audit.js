// ══════════════════════════════════════════════════════════════
// ── DDB CONTENT AUDIT (server-side, in-pod) ───────────────────
// Compares D&D Beyond content that has been downloaded into the
// local content tables against what is embedded in the RAG
// (`hotd_embeddings`), grouped by Source class (Book / Drop /
// Homebrew) and Type (Spell / Monster / Magic Item / Feat).
//
// Runs entirely on the app's PostgreSQL pool, so it works inside
// the website pod with no external credentials. When a DDB cobalt
// token is supplied (env DDB_COBALT_TOKEN), it additionally
// enumerates what is owned on D&D Beyond to surface books/drops
// that have not been downloaded at all.
//
// Exports:
//   runAudit(pgPool, { cobaltToken })  -> structured report
//   embedMissing(pgPool, openaiClient, { types }) -> sync result
// ══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const ddbClient = require("./ddb-client");

// DB-table-backed content types that carry a `description_text` and
// feed the RAG as `ddb_*` embeddings. `matchBy` reflects how each type
// links to the RAG: spells/monsters/magic_items are embedded from the DB
// via the `db:<table>:<id>` source_path; feats reach the RAG through the
// book-extract pipeline keyed by feat name (title), so they match by name.
const DB_TYPES = [
  { table: "spells", sourceType: "ddb_spell", label: "Spells", matchBy: "id" },
  { table: "monsters", sourceType: "ddb_monster", label: "Monsters", matchBy: "id" },
  { table: "magic_items", sourceType: "ddb_magic_item", label: "Magic Items", matchBy: "id" },
  { table: "feats", sourceType: "ddb_feat", label: "Feats", matchBy: "name" },
];

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;
const EMBED_BATCH_SIZE = 96;
const MAX_CHUNK_CHARS = 3000;
const OVERLAP_CHARS = 200;

// Known D&D Beyond Drops source codes (subscriber content).
const DROP_CODES = new Set(["ddbd", "ddbdsp"]);

function sha256(t) { return crypto.createHash("sha256").update(t).digest("hex"); }

// Split a comma-joined `source` value into normalized book codes.
function normCodes(source) {
  return String(source || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function primaryCode(source) {
  const codes = normCodes(source);
  return codes[0] || "(none)";
}

function classifySource(code) {
  const c = String(code || "").toLowerCase();
  if (!c || c === "(none)") return "Other";
  if (DROP_CODES.has(c) || c.startsWith("ddbd")) return "Drop";
  if (c === "hotd-homebrew" || c.includes("homebrew")) return "Homebrew";
  return "Book";
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "\u2019").replace(/&[a-z]+;/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── AUDIT ─────────────────────────────────────────────────────

// Build the set of keys already embedded for a type. For `id` types the
// key is the DB id (from the `db:<table>:<id>` source_path); for `name`
// types the key is the lowercased entity name (from the embedding title,
// with any "(1/2)" chunk suffix stripped).
async function embeddedKeySet(pgPool, def) {
  if (def.matchBy === "name") {
    const { rows } = await pgPool.query(
      "SELECT DISTINCT lower(regexp_replace(title, ' \\([0-9]+/[0-9]+\\)$', '')) AS k FROM hotd_embeddings WHERE source_type = $1",
      [def.sourceType]
    );
    return new Set(rows.map((r) => r.k).filter(Boolean));
  }
  const { rows } = await pgPool.query(
    "SELECT DISTINCT source_path FROM hotd_embeddings WHERE source_type = $1 AND source_path LIKE $2",
    [def.sourceType, `db:${def.table}:%`]
  );
  const set = new Set();
  const prefix = `db:${def.table}:`;
  for (const r of rows) {
    if (r.source_path && r.source_path.startsWith(prefix)) set.add(r.source_path.slice(prefix.length));
  }
  return set;
}

function rowKey(def, row) {
  return def.matchBy === "name" ? String(row.name || "").toLowerCase() : String(row.id);
}

async function auditType(pgPool, def) {
  // Embeddable rows for this table.
  const { rows } = await pgPool.query(
    `SELECT id::text AS id, name, source
       FROM ${def.table}
      WHERE description_text IS NOT NULL AND length(description_text) > 10`
  );
  const embedded = await embeddedKeySet(pgPool, def);

  const bySource = new Map(); // code -> { code, class, type, embeddable, embedded, missing, sampleNames }
  let totalEmbeddable = 0, totalEmbedded = 0;

  for (const row of rows) {
    totalEmbeddable++;
    const code = primaryCode(row.source);
    const cls = classifySource(code);
    if (!bySource.has(code)) {
      bySource.set(code, { code, class: cls, type: def.label, sourceType: def.sourceType, embeddable: 0, embedded: 0, missing: 0, sampleNames: [] });
    }
    const bucket = bySource.get(code);
    bucket.embeddable++;
    const isEmbedded = embedded.has(rowKey(def, row));
    if (isEmbedded) { bucket.embedded++; totalEmbedded++; }
    else {
      bucket.missing++;
      if (bucket.sampleNames.length < 8) bucket.sampleNames.push(row.name);
    }
  }

  return {
    type: def.label,
    sourceType: def.sourceType,
    table: def.table,
    embeddable: totalEmbeddable,
    embedded: totalEmbedded,
    missing: totalEmbeddable - totalEmbedded,
    sources: Array.from(bySource.values()),
  };
}

async function ragInventory(pgPool) {
  const { rows } = await pgPool.query(
    `SELECT source_type,
            count(*)::int AS chunks,
            count(DISTINCT COALESCE(metadata->>'source', metadata->>'book', '?'))::int AS sources
       FROM hotd_embeddings
      GROUP BY source_type
      ORDER BY chunks DESC`
  );
  return rows;
}

async function runAudit(pgPool, opts = {}) {
  const perType = [];
  for (const def of DB_TYPES) perType.push(await auditType(pgPool, def));

  // Roll up the missing rows by Source class and by source code.
  const byClass = { Book: mkAgg(), Drop: mkAgg(), Homebrew: mkAgg(), Other: mkAgg() };
  const missingSources = [];
  for (const t of perType) {
    for (const s of t.sources) {
      const agg = byClass[s.class] || byClass.Other;
      agg.embeddable += s.embeddable;
      agg.embedded += s.embedded;
      agg.missing += s.missing;
      if (s.missing > 0) {
        missingSources.push({ code: s.code, class: s.class, type: s.type, missing: s.missing, sampleNames: s.sampleNames });
      }
    }
  }
  missingSources.sort((a, b) => b.missing - a.missing || a.code.localeCompare(b.code));

  const totals = perType.reduce(
    (acc, t) => { acc.embeddable += t.embeddable; acc.embedded += t.embedded; acc.missing += t.missing; return acc; },
    { embeddable: 0, embedded: 0, missing: 0 }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totals,
    byType: perType.map((t) => ({ type: t.type, sourceType: t.sourceType, table: t.table, embeddable: t.embeddable, embedded: t.embedded, missing: t.missing })),
    byClass,
    missingSources,
    ragInventory: await ragInventory(pgPool),
    ddbOwned: null,
    tokenAvailable: false,
  };

  // Optional: owned-on-DDB gap (requires cobalt token; degrades gracefully).
  if (opts.cobaltToken) {
    try {
      // Codes whose downloaded content still has rows missing from the RAG.
      const unembeddedCodes = new Set(missingSources.map((s) => s.code));
      report.ddbOwned = await ownedGap(pgPool, unembeddedCodes);
      report.tokenAvailable = true;
    } catch (err) {
      report.ddbOwnedError = err.message;
    }
  }

  return report;
}

function mkAgg() { return { embeddable: 0, embedded: 0, missing: 0 }; }

// ── OWNED-ON-DDB GAP (optional, needs cobalt token) ───────────
// Enumerates the source books/drops that contain monsters the account is
// entitled to, and marks each one Completed (downloaded into the DB AND
// embedded into the RAG) or Missing (not yet imported, or downloaded but
// not fully embedded).
async function ownedGap(pgPool, unembeddedCodes = new Set()) {
  const H = await ddbClient.bearerHeaders();

  // Catalog: sourceId -> { code, title }
  const cfg = await (await fetch("https://www.dndbeyond.com/api/config/json", { headers: H })).json();
  const srcMap = new Map((cfg.sources || []).map((s) => [s.id, { code: (s.name || "").toLowerCase(), title: (s.description || s.name || "").replace(/&amp;/g, "&") }]));

  // Owned source ids (with monster content), paged.
  const owned = new Map(); // code -> { code, title, class, monsters }
  let skip = 0, take = 100, total = Infinity, page = 0;
  while (skip < total) {
    const j = await (await fetch(`https://monster-service.dndbeyond.com/v1/Monster?skip=${skip}&take=${take}`, { headers: H })).json();
    total = j.pagination?.total ?? total;
    for (const m of (j.data || [])) {
      for (const s of (m.sources || [])) {
        const meta = srcMap.get(s.sourceId);
        if (!meta || !meta.code) continue;
        if (!owned.has(meta.code)) owned.set(meta.code, { code: meta.code, title: meta.title, class: classifySource(meta.code), monsters: 0 });
        owned.get(meta.code).monsters++;
      }
    }
    skip += take; page++;
    if (page > 100) break;
  }

  // Downloaded source codes across the content tables.
  const { rows } = await pgPool.query(
    `SELECT DISTINCT lower(trim(unnest(string_to_array(source, ',')))) AS code
       FROM (SELECT source FROM monsters WHERE source IS NOT NULL
             UNION ALL SELECT source FROM magic_items WHERE source IS NOT NULL
             UNION ALL SELECT source FROM spells WHERE source IS NOT NULL) q`
  );
  const downloaded = new Set(rows.map((r) => r.code).filter(Boolean));

  // Annotate every owned source with an Available / Missing status.
  const all = [];
  for (const o of owned.values()) {
    o.downloaded = downloaded.has(o.code);
    o.embedded = o.downloaded && !unembeddedCodes.has(o.code);
    o.status = (o.downloaded && o.embedded) ? "Available" : "Missing";
    all.push(o);
  }
  // Missing first (so gaps stand out), then most-content first.
  all.sort((a, b) => (a.status === b.status ? b.monsters - a.monsters : (a.status === "Missing" ? -1 : 1)));
  const missing = all.filter((o) => o.status === "Missing");
  const missingMonsters = missing.reduce((s, o) => s + (o.monsters || 0), 0);

  return {
    ownedSources: owned.size,
    syncedSources: downloaded.size,
    entitledMonsters: total === Infinity ? null : total,
    availableCount: all.length - missing.length,
    missingCount: missing.length,
    missingMonsters,
    all,
    missing,
  };
}

// ── SYNC (embed missing DB rows into the RAG) ─────────────────

function splitIntoChunks(text, maxChars, overlap) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastPara = slice.lastIndexOf("\n\n");
      const lastSentence = slice.lastIndexOf(". ");
      if (lastPara > maxChars * 0.5) end = start + lastPara;
      else if (lastSentence > maxChars * 0.5) end = start + lastSentence + 2;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter((c) => c.length > 20);
}

function rowChunkText(row) {
  const desc = row.description_text || "";
  if (desc.trimStart().startsWith("#")) return stripHtml(desc);
  return stripHtml(`# ${row.name}\nSource: ${row.source || "?"}\n\n${desc}`);
}

async function collectMissingRows(pgPool, def) {
  const embedded = await embeddedKeySet(pgPool, def);
  const { rows } = await pgPool.query(
    `SELECT id::text AS id, name, source, description_text
       FROM ${def.table}
      WHERE description_text IS NOT NULL AND length(description_text) > 10`
  );
  return rows.filter((r) => !embedded.has(rowKey(def, r)));
}

async function embedMissing(pgPool, openaiClient, opts = {}) {
  if (!openaiClient) throw new Error("OpenAI client not initialized");
  const wantTypes = opts.types && opts.types.length
    ? DB_TYPES.filter((d) => opts.types.includes(d.sourceType) || opts.types.includes(d.table))
    : DB_TYPES;

  const result = { embedded: 0, byType: {}, skipped: 0 };

  for (const def of wantTypes) {
    const missing = await collectMissingRows(pgPool, def);
    if (!missing.length) { result.byType[def.sourceType] = 0; continue; }

    // Build chunks.
    const chunks = [];
    for (const row of missing) {
      const text = rowChunkText(row);
      const parts = splitIntoChunks(text, MAX_CHUNK_CHARS, OVERLAP_CHARS);
      for (let i = 0; i < parts.length; i++) {
        const hash = sha256(parts[i]);
        chunks.push({
          source_type: def.sourceType,
          source_id: /^\d+$/.test(row.id) ? parseInt(row.id, 10) : null,
          source_path: `db:${def.table}:${row.id}`,
          chunk_index: i,
          title: row.name + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""),
          chunk_text: parts[i],
          chunk_hash: hash,
          metadata: { source: row.source, class: classifySource(primaryCode(row.source)) },
        });
      }
    }

    // Skip chunks already present (by hash).
    const hashes = chunks.map((c) => c.chunk_hash);
    const existing = new Set();
    if (hashes.length) {
      const { rows } = await pgPool.query("SELECT chunk_hash FROM hotd_embeddings WHERE chunk_hash = ANY($1)", [hashes]);
      for (const r of rows) existing.add(r.chunk_hash);
    }
    const ready = chunks.filter((c) => !existing.has(c.chunk_hash));
    if (!ready.length) { result.byType[def.sourceType] = 0; result.skipped += chunks.length; continue; }

    // Embed in batches.
    let embeddedForType = 0;
    for (let i = 0; i < ready.length; i += EMBED_BATCH_SIZE) {
      const batch = ready.slice(i, i + EMBED_BATCH_SIZE);
      const resp = await openaiClient.embeddings.create({
        model: EMBED_MODEL,
        input: batch.map((c) => c.chunk_text),
        dimensions: EMBED_DIMENSIONS,
      });
      for (let j = 0; j < resp.data.length; j++) {
        const c = batch[j];
        const vectorStr = `[${resp.data[j].embedding.join(",")}]`;
        await pgPool.query(
          `INSERT INTO hotd_embeddings (source_type, source_id, source_path, chunk_index, title, chunk_text, chunk_hash, metadata, embedding, is_dm_only, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10,NOW())
           ON CONFLICT (chunk_hash) DO UPDATE SET chunk_text = $6, title = $5, metadata = $8, embedding = $9::vector, updated_at = NOW()`,
          [c.source_type, c.source_id, c.source_path, c.chunk_index, c.title, c.chunk_text, c.chunk_hash, JSON.stringify(c.metadata), vectorStr, false]
        );
        embeddedForType++;
      }
    }
    result.byType[def.sourceType] = embeddedForType;
    result.embedded += embeddedForType;
  }

  return result;
}

module.exports = { runAudit, embedMissing, classifySource, DB_TYPES };
