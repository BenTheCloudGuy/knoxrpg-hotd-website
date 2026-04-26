#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// ── DDB CONTENT EMBEDDING PIPELINE ────────────────────────────
// Embeds D&D Beyond content into hotd_embeddings for RAG search.
//
// Three phases:
//   Phase 1: Structured DDB JSON (races, classes, feats, backgrounds)
//            from Azure Blob Storage books-extracted container
//   Phase 2: DB tables (spells, monsters, magic_items descriptions)
//   Phase 3: Full book prose from books-text container
//
// Usage:
//   node scripts/embed-ddb-content.js [--phase 1|2|3|all]
//                                     [--mode full|incremental|dry-run]
//                                     [--verbose]
//
// Env vars required:
//   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
//   OPENAI_API_KEY
//   AZURE_STORAGE_ACCOUNT (default: cloudgeekcusgaming01)
// ══════════════════════════════════════════════════════════════

const crypto = require('crypto');
const { Pool } = require('pg');
const OpenAI = require('openai');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const PHASE = getArg('phase', 'all');
const MODE = getArg('mode', 'incremental');
const VERBOSE = args.includes('--verbose');

// ── Config ────────────────────────────────────────────────────
const STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT || 'cloudgeekcusgaming01';
const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMENSIONS = 1536;
const EMBED_BATCH_SIZE = 100;
const MAX_CHUNK_CHARS = 3000;
const OVERLAP_CHARS = 200;

// ── Database ──────────────────────────────────────────────────
const pgPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 3,
});

// ── OpenAI ────────────────────────────────────────────────────
let openaiClient = null;

// ── Azure Blob ────────────────────────────────────────────────
let blobServiceClient = null;

function getBlobClient() {
  if (!blobServiceClient) {
    const credential = new DefaultAzureCredential();
    blobServiceClient = new BlobServiceClient(
      `https://${STORAGE_ACCOUNT}.blob.core.windows.net`,
      credential
    );
  }
  return blobServiceClient;
}

// ── Helpers ───────────────────────────────────────────────────
function log(msg) { console.log(`  ${msg}`); }
function heading(stage) { console.log(`\n${'═'.repeat(60)}\n  ${stage}\n${'═'.repeat(60)}`); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

function stripHtml(text) {
  return (text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, '')
    .replace(/\{\{[^}]+\}\}/g, '')  // strip DDB template vars like {{proficiency#unsigned}}
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function downloadBlob(container, blobName) {
  const client = getBlobClient();
  const containerClient = client.getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobName);
  const response = await blobClient.download(0);
  const chunks = [];
  for await (const chunk of response.readableStreamBody) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function listBlobs(container, prefix) {
  const client = getBlobClient();
  const containerClient = client.getContainerClient(container);
  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    blobs.push(blob.name);
  }
  return blobs;
}

function splitIntoChunks(text, maxChars, overlap) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChars;
    if (end < text.length) {
      // Try to break at paragraph or sentence boundary
      const slice = text.slice(start, end);
      const lastPara = slice.lastIndexOf('\n\n');
      const lastSentence = slice.lastIndexOf('. ');
      if (lastPara > maxChars * 0.5) end = start + lastPara;
      else if (lastSentence > maxChars * 0.5) end = start + lastSentence + 2;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(c => c.length > 20);
}

// ══════════════════════════════════════════════════════════════
// PHASE 1: Structured DDB JSON (races, classes, feats, backgrounds)
// ══════════════════════════════════════════════════════════════
async function phase1ExtractStructured() {
  heading('PHASE 1: Structured DDB Data (books-extracted)');
  const sources = [];

  // List all book folders
  const allBlobs = await listBlobs('books-extracted', '');
  const bookFolders = [...new Set(allBlobs.map(b => b.split('/')[0]))];
  log(`Found ${bookFolders.length} book folders`);

  for (const book of bookFolders) {
    const dataBlobs = allBlobs.filter(b => b.startsWith(`${book}/data/`));

    // ── Races ─────────────────────────────────────────────────
    if (dataBlobs.includes(`${book}/data/races.json`)) {
      try {
        const raw = await downloadBlob('books-extracted', `${book}/data/races.json`);
        const races = JSON.parse(raw);
        for (const race of races) {
          const traits = (race.traits || []).map(t =>
            `${t.name}: ${stripHtml(t.snippet || t.descriptionDetail || '')}`
          ).join('\n');
          const text = [
            `# ${race.name}`,
            `Source: ${race.source || book}${race.sourcePage ? ', p. ' + race.sourcePage : ''}`,
            race.size ? `Size: ${race.size}` : null,
            race.speed ? `Speed: ${Object.entries(race.speed).map(([k,v]) => `${k} ${v} ft.`).join(', ')}` : null,
            traits || null,
          ].filter(Boolean).join('\n');
          sources.push({
            type: 'ddb_race', id: race.id, title: race.name, content: text,
            source_path: `books-extracted/${book}/data/races.json`,
            metadata: { source: race.source || book, ddb_id: race.id },
          });
        }
      } catch (e) { if (VERBOSE) log(`  WARN: ${book}/races.json: ${e.message}`); }
    }

    // ── Classes ───────────────────────────────────────────────
    if (dataBlobs.includes(`${book}/data/classes.json`)) {
      try {
        const raw = await downloadBlob('books-extracted', `${book}/data/classes.json`);
        const classes = JSON.parse(raw);
        for (const cls of classes) {
          const features = (cls.features || []).map(f =>
            `Level ${f.level} - ${f.name}: ${stripHtml(f.descriptionDetail || '')}`
          ).join('\n');
          const text = [
            `# ${cls.name}${cls.isSubclass ? ' (Subclass)' : ''}`,
            `Source: ${cls.source || book}`,
            cls.hitDiceType ? `Hit Die: d${cls.hitDiceType}` : null,
            cls.shortDescription ? stripHtml(cls.shortDescription) : null,
            cls.descriptionText ? stripHtml(cls.descriptionText) : null,
            features ? `\nClass Features:\n${features}` : null,
          ].filter(Boolean).join('\n');
          sources.push({
            type: 'ddb_class', id: cls.id, title: cls.name, content: text,
            source_path: `books-extracted/${book}/data/classes.json`,
            metadata: { source: cls.source || book, ddb_id: cls.id, isSubclass: cls.isSubclass || false },
          });
        }
      } catch (e) { if (VERBOSE) log(`  WARN: ${book}/classes.json: ${e.message}`); }
    }

    // ── Feats ─────────────────────────────────────────────────
    if (dataBlobs.includes(`${book}/data/feats.json`)) {
      try {
        const raw = await downloadBlob('books-extracted', `${book}/data/feats.json`);
        const feats = JSON.parse(raw);
        for (const feat of feats) {
          const text = [
            `# ${feat.name}`,
            `Source: ${feat.source || book}${feat.sourcePage ? ', p. ' + feat.sourcePage : ''}`,
            feat.snippet ? stripHtml(feat.snippet) : null,
            feat.notes ? stripHtml(feat.notes) : null,
          ].filter(Boolean).join('\n');
          sources.push({
            type: 'ddb_feat', id: feat.id, title: feat.name, content: text,
            source_path: `books-extracted/${book}/data/feats.json`,
            metadata: { source: feat.source || book, ddb_id: feat.id },
          });
        }
      } catch (e) { if (VERBOSE) log(`  WARN: ${book}/feats.json: ${e.message}`); }
    }

    // ── Backgrounds ───────────────────────────────────────────
    if (dataBlobs.includes(`${book}/data/backgrounds.json`)) {
      try {
        const raw = await downloadBlob('books-extracted', `${book}/data/backgrounds.json`);
        const bgs = JSON.parse(raw);
        for (const bg of bgs) {
          const text = [
            `# ${bg.name}`,
            `Source: ${bg.source || book}${bg.sourcePage ? ', p. ' + bg.sourcePage : ''}`,
            bg.featureName ? `Feature: ${bg.featureName}` : null,
            bg.flavorText ? stripHtml(bg.flavorText) : null,
          ].filter(Boolean).join('\n');
          sources.push({
            type: 'ddb_background', id: bg.id, title: bg.name, content: text,
            source_path: `books-extracted/${book}/data/backgrounds.json`,
            metadata: { source: bg.source || book, ddb_id: bg.id },
          });
        }
      } catch (e) { if (VERBOSE) log(`  WARN: ${book}/backgrounds.json: ${e.message}`); }
    }
  }

  // Deduplicate by name+type (same race appears in multiple books)
  const deduped = new Map();
  for (const s of sources) {
    const key = `${s.type}::${s.title.toLowerCase()}`;
    const existing = deduped.get(key);
    // Keep the longest content version (most detail)
    if (!existing || s.content.length > existing.content.length) {
      deduped.set(key, s);
    }
  }
  const result = Array.from(deduped.values());

  log(`\nPhase 1 extracted: ${sources.length} raw, ${result.length} after dedup`);
  const byType = {};
  for (const s of result) byType[s.type] = (byType[s.type] || 0) + 1;
  for (const [t, c] of Object.entries(byType)) log(`  ${t}: ${c}`);

  return result;
}

// ══════════════════════════════════════════════════════════════
// PHASE 2: DB tables (spells, monsters, magic_items)
// ══════════════════════════════════════════════════════════════
async function phase2ExtractDbTables() {
  heading('PHASE 2: DB Tables (spells, monsters, magic_items)');
  const sources = [];

  // ── Spells ──────────────────────────────────────────────────
  try {
    const { rows } = await pgPool.query(
      `SELECT id, name, level, school, activation_type, range_field, components,
              duration_type, duration_field, requires_concentration, description_text, source, source_page
       FROM spells WHERE description_text IS NOT NULL AND length(description_text) > 10`
    );
    for (const s of rows) {
      const lvl = s.level === 0 ? 'Cantrip' : `Level ${s.level}`;
      const text = [
        `# ${s.name}`,
        `${lvl} ${s.school || ''} spell`,
        `Source: ${s.source || 'SRD'}${s.source_page ? ', p. ' + s.source_page : ''}`,
        s.activation_type ? `Casting Time: ${s.activation_type}` : null,
        s.range_field ? `Range: ${s.range_field}` : null,
        s.components ? `Components: ${s.components}` : null,
        s.duration_field ? `Duration: ${s.requires_concentration ? 'Concentration, ' : ''}${s.duration_field || s.duration_type}` : null,
        stripHtml(s.description_text),
      ].filter(Boolean).join('\n');
      sources.push({
        type: 'ddb_spell', id: s.id, title: s.name, content: text,
        metadata: { source: s.source, level: s.level, school: s.school },
      });
    }
    log(`Spells: ${rows.length} extracted`);
  } catch (e) { log(`Spells: SKIPPED (${e.message})`); }

  // ── Monsters ────────────────────────────────────────────────
  try {
    const { rows } = await pgPool.query(
      `SELECT id, name, size, type, alignment, challenge_rating_display,
              description_text, source
       FROM monsters WHERE description_text IS NOT NULL AND length(description_text) > 10`
    );
    for (const m of rows) {
      const text = [
        `# ${m.name}`,
        `${m.size || ''} ${m.type || ''}, ${m.alignment || 'unaligned'}`,
        `Challenge Rating: ${m.challenge_rating_display || '?'}`,
        `Source: ${m.source || 'SRD'}`,
        stripHtml(m.description_text),
      ].filter(Boolean).join('\n');
      sources.push({
        type: 'ddb_monster', id: m.id, title: m.name, content: text,
        metadata: { source: m.source, cr: m.challenge_rating_display, type: m.type },
      });
    }
    log(`Monsters: ${rows.length} extracted`);
  } catch (e) { log(`Monsters: SKIPPED (${e.message})`); }

  // ── Magic Items ─────────────────────────────────────────────
  try {
    const { rows } = await pgPool.query(
      `SELECT id, name, rarity, type, item_type, requires_attunement,
              description_text, source, source_page
       FROM magic_items WHERE description_text IS NOT NULL AND length(description_text) > 10`
    );
    for (const i of rows) {
      const text = [
        `# ${i.name}`,
        `${i.rarity || ''} ${i.type || i.item_type || 'item'}`,
        i.requires_attunement ? 'Requires Attunement' : null,
        `Source: ${i.source || 'SRD'}${i.source_page ? ', p. ' + i.source_page : ''}`,
        stripHtml(i.description_text),
      ].filter(Boolean).join('\n');
      sources.push({
        type: 'ddb_magic_item', id: i.id, title: i.name, content: text,
        metadata: { source: i.source, rarity: i.rarity },
      });
    }
    log(`Magic Items: ${rows.length} extracted`);
  } catch (e) { log(`Magic Items: SKIPPED (${e.message})`); }

  log(`\nPhase 2 total: ${sources.length} sources`);
  return sources;
}

// ══════════════════════════════════════════════════════════════
// PHASE 3: Full book prose (books-text container)
// ══════════════════════════════════════════════════════════════
async function phase3ExtractBookProse() {
  heading('PHASE 3: Book Prose (books-text)');
  const sources = [];

  const blobs = await listBlobs('books-text', '');
  const txtFiles = blobs.filter(b => b.endsWith('.txt'));
  log(`Found ${txtFiles.length} book text files`);

  for (const blobName of txtFiles) {
    const bookCode = blobName.replace('.txt', '');
    try {
      const text = await downloadBlob('books-text', blobName);
      if (text.length < 100) { if (VERBOSE) log(`  SKIP ${blobName}: too short (${text.length} chars)`); continue; }

      // Split on chapter boundaries first
      const chapterPattern = /^(Chapter \d+:.*|Introduction:.*|Appendix [A-Z]:.*)/m;
      const lines = text.split('\n');
      let currentChapter = bookCode;
      let currentContent = '';
      let chapterIndex = 0;

      for (const line of lines) {
        if (chapterPattern.test(line.trim()) && currentContent.length > 200) {
          // Flush previous chapter
          sources.push({
            type: 'dnd_book', id: null, title: `${currentChapter}`,
            content: currentContent.trim(),
            source_path: `books-text/${blobName}`,
            metadata: { book: bookCode, chapter: currentChapter, chapter_index: chapterIndex },
          });
          chapterIndex++;
          currentChapter = `${bookCode}: ${line.trim()}`;
          currentContent = line + '\n';
        } else {
          currentContent += line + '\n';
        }
      }
      // Flush last chapter
      if (currentContent.trim().length > 100) {
        sources.push({
          type: 'dnd_book', id: null, title: currentChapter,
          content: currentContent.trim(),
          source_path: `books-text/${blobName}`,
          metadata: { book: bookCode, chapter: currentChapter, chapter_index: chapterIndex },
        });
      }

      log(`  ${blobName}: ${text.length.toLocaleString()} chars, ${chapterIndex + 1} chapters`);
    } catch (e) {
      log(`  ERROR ${blobName}: ${e.message}`);
    }
  }

  log(`\nPhase 3 extracted: ${sources.length} chapter sections from ${txtFiles.length} books`);
  return sources;
}

// ══════════════════════════════════════════════════════════════
// CHUNKING
// ══════════════════════════════════════════════════════════════
function chunkSources(sources) {
  heading('CHUNKING');
  const chunks = [];

  for (const src of sources) {
    const parts = splitIntoChunks(src.content, MAX_CHUNK_CHARS, OVERLAP_CHARS);
    for (let i = 0; i < parts.length; i++) {
      const chunkId = `${src.type}-${src.id || src.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40)}-${i}`;
      chunks.push({
        chunk_id: chunkId,
        source_type: src.type,
        source_id: src.id || null,
        source_path: src.source_path || null,
        chunk_index: i,
        title: src.title + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''),
        text: parts[i],
        content_hash: sha256(parts[i]),
        is_dm_only: false,
        metadata: { ...src.metadata, total_chunks: parts.length },
        token_estimate: Math.ceil(parts[i].length / 4),
      });
    }
  }

  const totalTokens = chunks.reduce((s, c) => s + c.token_estimate, 0);
  log(`Total chunks: ${chunks.length}, estimated tokens: ${totalTokens.toLocaleString()}`);
  log(`Estimated embedding cost: ~$${(totalTokens / 1_000_000 * 0.02).toFixed(4)}`);

  const byType = {};
  for (const c of chunks) byType[c.source_type] = (byType[c.source_type] || 0) + 1;
  for (const [t, count] of Object.entries(byType)) log(`  ${t}: ${count} chunks`);

  return chunks;
}

// ══════════════════════════════════════════════════════════════
// SANITIZE (incremental skip)
// ══════════════════════════════════════════════════════════════
async function sanitizeChunks(chunks) {
  heading('SANITIZE');

  let existingHashes = new Set();
  if (MODE === 'incremental') {
    const { rows } = await pgPool.query('SELECT chunk_hash FROM hotd_embeddings');
    existingHashes = new Set(rows.map(r => r.chunk_hash));
    log(`Existing hashes in DB: ${existingHashes.size}`);
  }

  const ready = [];
  let skipped = 0, rejected = 0;

  for (const chunk of chunks) {
    // Clean
    chunk.text = chunk.text.replace(/\n{3,}/g, '\n\n').trim();
    chunk.content_hash = sha256(chunk.text);
    chunk.token_estimate = Math.ceil(chunk.text.length / 4);

    if (chunk.text.length < 30) { rejected++; continue; }
    if (chunk.text.length > 12000) { rejected++; continue; }

    if (MODE === 'incremental' && existingHashes.has(chunk.content_hash)) {
      skipped++;
      continue;
    }

    ready.push(chunk);
  }

  log(`Ready to embed: ${ready.length}`);
  log(`Skipped (unchanged): ${skipped}`);
  log(`Rejected: ${rejected}`);

  return ready;
}

// ══════════════════════════════════════════════════════════════
// EMBED (OpenAI API)
// ══════════════════════════════════════════════════════════════
async function embedChunks(chunks) {
  heading('EMBED');

  if (MODE === 'dry-run') {
    const tokens = chunks.reduce((s, c) => s + c.token_estimate, 0);
    log(`DRY RUN: would embed ${chunks.length} chunks (~${tokens.toLocaleString()} tokens)`);
    log(`Estimated cost: ~$${(tokens / 1_000_000 * 0.02).toFixed(4)}`);
    return chunks;
  }

  if (chunks.length === 0) {
    log('Nothing to embed. All chunks unchanged.');
    return [];
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  let totalTokens = 0, apiCalls = 0;

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const resp = await openaiClient.embeddings.create({
        model: EMBED_MODEL,
        input: batch.map(c => c.text),
        dimensions: EMBED_DIMENSIONS,
      });
      apiCalls++;
      totalTokens += resp.usage?.total_tokens || 0;

      for (let j = 0; j < resp.data.length; j++) {
        batch[j].embedding = resp.data[j].embedding;
      }

      const batchNum = Math.floor(i / EMBED_BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(chunks.length / EMBED_BATCH_SIZE);
      log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} embedded (${resp.usage?.total_tokens || '?'} tokens)`);
    } catch (err) {
      log(`  ERROR batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1}: ${err.message}`);
    }
  }

  const embedded = chunks.filter(c => c.embedding);
  log(`\nEmbedded: ${embedded.length}/${chunks.length}`);
  log(`API calls: ${apiCalls}, tokens: ${totalTokens.toLocaleString()}`);
  log(`Cost: ~$${(totalTokens / 1_000_000 * 0.02).toFixed(4)}`);

  return embedded;
}

// ══════════════════════════════════════════════════════════════
// STORE (upsert into pgvector)
// ══════════════════════════════════════════════════════════════
async function storeChunks(chunks) {
  heading('STORE');

  if (MODE === 'dry-run') {
    log(`DRY RUN: would upsert ${chunks.length} chunks`);
    return;
  }

  if (chunks.length === 0) {
    log('Nothing to store.');
    return;
  }

  // In full mode for DDB content, only delete DDB source types (preserve campaign data)
  if (MODE === 'full') {
    const ddbTypes = ['ddb_race', 'ddb_class', 'ddb_feat', 'ddb_background', 'ddb_spell', 'ddb_monster', 'ddb_magic_item', 'dnd_book'];
    for (const t of ddbTypes) {
      const r = await pgPool.query('DELETE FROM hotd_embeddings WHERE source_type = $1', [t]);
      if (r.rowCount > 0) log(`  Cleared ${t}: ${r.rowCount} rows`);
    }
  }

  let upserted = 0;
  for (const chunk of chunks) {
    if (!chunk.embedding) continue;
    const vectorStr = `[${chunk.embedding.join(',')}]`;
    try {
      await pgPool.query(`
        INSERT INTO hotd_embeddings (source_type, source_id, source_path, chunk_index, title, chunk_text, chunk_hash, metadata, embedding, is_dm_only, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10, NOW())
        ON CONFLICT (chunk_hash)
        DO UPDATE SET chunk_text = $6, title = $5, metadata = $8, embedding = $9::vector, updated_at = NOW()
      `, [
        chunk.source_type, chunk.source_id, chunk.source_path, chunk.chunk_index,
        chunk.title, chunk.text, chunk.content_hash,
        JSON.stringify(chunk.metadata), vectorStr, chunk.is_dm_only,
      ]);
      upserted++;
    } catch (err) {
      if (VERBOSE) log(`  ERROR storing ${chunk.chunk_id}: ${err.message}`);
    }
  }

  // Get totals
  const { rows: [totals] } = await pgPool.query('SELECT count(*) as total FROM hotd_embeddings');
  const { rows: byType } = await pgPool.query('SELECT source_type, count(*) as count FROM hotd_embeddings GROUP BY source_type ORDER BY source_type');

  log(`\nUpserted: ${upserted}`);
  log(`Total vectors in DB: ${totals.total}`);
  for (const r of byType) log(`  ${r.source_type}: ${r.count}`);

  // Rebuild IVFFlat index if significant changes
  if (MODE === 'full' || upserted > 100) {
    try {
      log('\nRebuilding IVFFlat index...');
      await pgPool.query('DROP INDEX IF EXISTS idx_embed_ivfflat');
      const listCount = Math.max(1, Math.floor(Math.sqrt(parseInt(totals.total))));
      await pgPool.query(`CREATE INDEX idx_embed_ivfflat ON hotd_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${listCount})`);
      log(`IVFFlat index rebuilt (lists=${listCount})`);
    } catch (err) {
      log(`WARN: IVFFlat index rebuild failed: ${err.message}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('  DDB Content Embedding Pipeline');
  console.log(`  Phase: ${PHASE}  Mode: ${MODE}  Storage: ${STORAGE_ACCOUNT}`);
  console.log('═'.repeat(60));

  const startTime = Date.now();

  // Ensure table exists
  try {
    await pgPool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_embeddings (
        id SERIAL PRIMARY KEY,
        source_type TEXT NOT NULL,
        source_id INTEGER,
        source_path TEXT,
        chunk_index INTEGER DEFAULT 0,
        title TEXT,
        chunk_text TEXT NOT NULL,
        chunk_hash TEXT NOT NULL UNIQUE,
        metadata JSONB DEFAULT '{}',
        embedding vector(1536),
        is_dm_only BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (_) { /* table exists */ }

  // Gather sources based on phase selection
  let allSources = [];

  if (PHASE === 'all' || PHASE === '1') {
    const p1 = await phase1ExtractStructured();
    allSources.push(...p1);
  }

  if (PHASE === 'all' || PHASE === '2') {
    const p2 = await phase2ExtractDbTables();
    allSources.push(...p2);
  }

  if (PHASE === 'all' || PHASE === '3') {
    const p3 = await phase3ExtractBookProse();
    allSources.push(...p3);
  }

  if (allSources.length === 0) {
    log('\nNo sources extracted. Nothing to do.');
    await pgPool.end();
    return;
  }

  // Chunk → Sanitize → Embed → Store
  const chunks = chunkSources(allSources);
  const sanitized = await sanitizeChunks(chunks);
  const embedded = await embedChunks(sanitized);
  await storeChunks(embedded);

  // Update manifest after successful embedding (skip for dry-run)
  if (MODE !== 'dry-run' && embedded.length > 0) {
    try {
      const { downloadManifest, uploadManifest, listBlobsWithTimestamps, getDbChecksum } = require('./check-ddb-changes');
      heading('UPDATE MANIFEST');
      const manifest = await downloadManifest();
      manifest.lastRun = new Date().toISOString();
      manifest.version = manifest.version || 1;

      if (PHASE === 'all' || PHASE === '1') {
        manifest.blobs = manifest.blobs || {};
        manifest.blobs['books-extracted'] = await listBlobsWithTimestamps('books-extracted', '');
        log('Updated books-extracted timestamps');
      }
      if (PHASE === 'all' || PHASE === '2') {
        manifest.dbChecksums = await getDbChecksum();
        log('Updated DB checksums');
      }
      if (PHASE === 'all' || PHASE === '3') {
        manifest.blobs = manifest.blobs || {};
        manifest.blobs['books-text'] = await listBlobsWithTimestamps('books-text', '');
        log('Updated books-text timestamps');
      }

      await uploadManifest(manifest);
      log('Manifest uploaded to Azure Blob Storage');
    } catch (err) {
      log(`WARN: Manifest update failed (embeddings were stored successfully): ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  DONE in ${elapsed}s`);
  console.log('═'.repeat(60) + '\n');

  await pgPool.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
