// ══════════════════════════════════════════════════════════════
// ── RAG SEARCH (pgvector embeddings) ──────────────────────────
// Semantic search against hotd_embeddings using OpenAI embeddings.
// ══════════════════════════════════════════════════════════════

const { pgPool } = require("../db/pool");
const { trackAiEmbedding } = require("./telemetry");
const metrics = require("./metrics");

const EMBED_MODEL = "text-embedding-3-small";

function recordRagResult(result) {
  try {
    if (metrics && metrics._metrics && metrics._metrics.ragQueriesTotal) {
      metrics._metrics.ragQueriesTotal.labels(result).inc();
    }
  } catch (_) { /* metrics disabled */ }
}

/**
 * Embed a query string using OpenAI's embedding model.
 * @param {import("openai").default} openai - OpenAI client
 * @param {string} text - Query text
 * @returns {Promise<number[]>} Embedding vector
 */
async function embedQuery(openai, text) {
  const t0 = Date.now();
  let resp;
  try {
    resp = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: text.slice(0, 8000),
      dimensions: 1536,
    });
  } catch (err) {
    trackAiEmbedding({
      model: EMBED_MODEL,
      latencyMs: Date.now() - t0,
      success: false,
      source: "rag.embedQuery",
      error: err && err.message ? err.message : String(err),
    });
    throw err;
  }
  trackAiEmbedding({
    model: EMBED_MODEL,
    tokens: resp.usage ? (resp.usage.total_tokens || resp.usage.prompt_tokens || 0) : 0,
    latencyMs: Date.now() - t0,
    success: true,
    source: "rag.embedQuery",
  });
  return resp.data[0].embedding;
}

/**
 * Search embeddings by semantic similarity.
 * @param {import("openai").default} openai - OpenAI client
 * @param {string} query - Natural language query
 * @param {object} opts
 * @param {boolean} [opts.includeDmOnly=false] - Include DM-only content
 * @param {number} [opts.limit=10] - Max results
 * @param {number} [opts.minScore=0.3] - Minimum cosine similarity
 * @param {string} [opts.sourceType] - Filter by source type
 * @returns {Promise<Array<{title:string, chunk_text:string, source_type:string, source_id:number, score:number, metadata:object}>>}
 */
async function searchEmbeddings(openai, query, opts = {}) {
  const { includeDmOnly = false, limit = 10, minScore = 0.3, sourceType } = opts;

  let vector;
  try {
    vector = await embedQuery(openai, query);
  } catch (err) {
    recordRagResult("error");
    throw err;
  }
  const vectorStr = `[${vector.join(",")}]`;

  let whereClause = "WHERE 1=1";
  const params = [vectorStr, limit];
  let paramIdx = 3;

  if (!includeDmOnly) {
    whereClause += " AND is_dm_only = FALSE";
  }
  if (sourceType) {
    whereClause += ` AND source_type = $${paramIdx}`;
    params.push(sourceType);
    paramIdx++;
  }

  // Hybrid: combine vector similarity with full-text keyword match
  // Full-text boost is added when query terms appear in the text.
  // Campaign boost nudges first-party campaign content (NPCs, sessions,
  // lore, characters, artifacts, handouts, notebook pages) above generic
  // reference material (dnd_book / ddb_* chunks) on broad queries.
  const CAMPAIGN_BOOST_SQL =
    "CASE WHEN source_type IN " +
    "('npc','session','lore','lore_json','character','artifact','handout','notebook') " +
    "THEN 0.06 ELSE 0 END";
  const tsQuery = query.split(/\s+/).filter(w => w.length > 2).map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean).join(' & ');
  const hasTsQuery = tsQuery.length > 0;

  let sql;
  if (hasTsQuery) {
    params.push(tsQuery);
    sql = `
      SELECT title, chunk_text, chunk_hash, source_type, source_id, source_path, metadata,
             (1 - (embedding <=> $1::vector)) +
             CASE WHEN to_tsvector('english', chunk_text) @@ to_tsquery('english', $${paramIdx}) THEN 0.05 ELSE 0 END +
             ${CAMPAIGN_BOOST_SQL}
             AS score
      FROM hotd_embeddings
      ${whereClause}
      ORDER BY score DESC
      LIMIT $2
    `;
    paramIdx++;
  } else {
    sql = `
      SELECT title, chunk_text, chunk_hash, source_type, source_id, source_path, metadata,
             (1 - (embedding <=> $1::vector)) +
             ${CAMPAIGN_BOOST_SQL}
             AS score
      FROM hotd_embeddings
      ${whereClause}
      ORDER BY score DESC
      LIMIT $2
    `;
  }

  let rows;
  try {
    ({ rows } = await pgPool.query(sql, params));
  } catch (err) {
    recordRagResult("error");
    throw err;
  }
  const hits = rows.filter(r => r.score >= minScore);
  recordRagResult(hits.length > 0 ? "hit" : "empty");
  return hits.map(r => ({
    title: r.title,
    chunk_text: r.chunk_text,
    chunk_hash: r.chunk_hash,
    source_type: r.source_type,
    source_id: r.source_id,
    source_path: r.source_path,
    score: Math.round(r.score * 10000) / 10000,
    metadata: r.metadata,
  }));
}

/**
 * Build a RAG context string from semantic search results.
 * Suitable for injecting into a system/user prompt.
 */
async function buildEmbeddingContext(openai, query, opts = {}) {
  const results = await searchEmbeddings(openai, query, { limit: 8, ...opts });
  if (results.length === 0) return "";

  const chunks = results.map((r, i) =>
    `[${i + 1}] ${r.title} (${r.source_type}, score: ${r.score})\n${r.chunk_text}`
  );
  return `Relevant campaign context:\n\n${chunks.join("\n\n---\n\n")}`;
}

module.exports = { embedQuery, searchEmbeddings, buildEmbeddingContext };
