#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// ── EMBEDDING PIPELINE ────────────────────────────────────────
// 5-stage pipeline: Extract → Chunk → Sanitize → Embed → Store
//
// Usage:
//   node scripts/embed-pipeline.js [--mode full|incremental|dry-run]
//                                  [--source npc|session|lore|...]
//                                  [--verbose]
//
// Env vars required:
//   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
//   OPENAI_API_KEY
// ══════════════════════════════════════════════════════════════

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const MODE = getArg("mode", "incremental");       // full | incremental | dry-run
const SOURCE_FILTER = getArg("source", null);      // optional: npc, session, lore, etc.
const VERBOSE = args.includes("--verbose");

// ── Database ──────────────────────────────────────────────────
const pgPool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || "5432", 10),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: false,
  max: 3,
});

// ── OpenAI ────────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;
const EMBED_BATCH_SIZE = 100; // max inputs per API call

const OpenAI = require("openai");
let openaiClient = null;

// ── Content root (relative to repo) ──────────────────────────
const REPO_ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(REPO_ROOT, "src", "hotd-campaign");

// ── Report accumulator ───────────────────────────────────────
const report = {
  mode: MODE,
  source_filter: SOURCE_FILTER,
  started_at: new Date().toISOString(),
  stages: {},
};

function log(msg) { console.log(`  ${msg}`); }
function heading(stage) { console.log(`\n${"═".repeat(60)}\n  STAGE ${stage}\n${"═".repeat(60)}`); }
function sha256(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function safeJsonArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (_) { return []; }
}

// ══════════════════════════════════════════════════════════════
// STAGE 1: EXTRACT — gather raw content from all sources
// ══════════════════════════════════════════════════════════════
async function stageExtract() {
  heading("1 — EXTRACT");
  const sources = [];

  // ── DB: NPCs ────────────────────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "npc") {
    const { rows } = await pgPool.query("SELECT id, name, race, npc_class, location, status, alignment_tag, description, is_hidden FROM hotd_npcs");
    for (const r of rows) {
      const text = [
        `# ${r.name}`,
        r.race ? `Race: ${r.race}` : null,
        r.npc_class ? `Class: ${r.npc_class}` : null,
        r.location ? `Location: ${r.location}` : null,
        r.status ? `Status: ${r.status}` : null,
        r.alignment_tag ? `Alignment: ${r.alignment_tag}` : null,
        r.description || null,
      ].filter(Boolean).join("\n");
      sources.push({ type: "npc", id: r.id, title: r.name, content: text, is_dm_only: false, metadata: { race: r.race, location: r.location, status: r.status, is_hidden: r.is_hidden } });
    }
    log(`NPCs: ${rows.length} extracted`);
  }

  // ── DB: Sessions ────────────────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "session") {
    const { rows } = await pgPool.query("SELECT id, session_number, title, summary, game_date, play_date FROM hotd_sessions ORDER BY session_number");
    for (const r of rows) {
      const text = [
        `# Session ${r.session_number}: ${r.title}`,
        r.game_date ? `Game Date: ${r.game_date}` : null,
        r.play_date ? `Play Date: ${new Date(r.play_date).toLocaleDateString()}` : null,
        r.summary || null,
      ].filter(Boolean).join("\n");
      sources.push({ type: "session", id: r.id, title: `Session ${r.session_number}: ${r.title}`, content: text, is_dm_only: false, metadata: { session_number: r.session_number, game_date: r.game_date } });
    }
    log(`Sessions: ${rows.length} extracted`);
  }

  // ── DB: Artifacts ───────────────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "artifact") {
    const { rows } = await pgPool.query("SELECT id, name, rarity, description, lore, owner FROM hotd_artifacts");
    for (const r of rows) {
      const text = [
        `# ${r.name}`,
        r.rarity ? `Rarity: ${r.rarity}` : null,
        r.owner ? `Owner: ${r.owner}` : null,
        r.description || null,
        r.lore ? `\nLore:\n${r.lore}` : null,
      ].filter(Boolean).join("\n");
      sources.push({ type: "artifact", id: r.id, title: r.name, content: text, is_dm_only: false, metadata: { rarity: r.rarity, owner: r.owner } });
    }
    log(`Artifacts: ${rows.length} extracted`);
  }

  // ── DB: Handouts ────────────────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "handout") {
    const { rows } = await pgPool.query("SELECT id, name, description, about FROM hotd_handouts");
    for (const r of rows) {
      const text = [`# ${r.name}`, r.description || null, r.about ? `\nAbout:\n${r.about}` : null].filter(Boolean).join("\n");
      sources.push({ type: "handout", id: r.id, title: r.name, content: text, is_dm_only: false, metadata: {} });
    }
    log(`Handouts: ${rows.length} extracted`);
  }

  // ── DB: Calendar events ─────────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "calendar") {
    const { rows } = await pgPool.query("SELECT id, day, month_idx, title, description FROM hotd_calendar_events");
    for (const r of rows) {
      const text = [`# ${r.title}`, `Date: Day ${r.day}, Month ${r.month_idx}`, r.description || null].filter(Boolean).join("\n");
      sources.push({ type: "calendar", id: r.id, title: r.title, content: text, is_dm_only: false, metadata: { day: r.day, month_idx: r.month_idx } });
    }
    log(`Calendar events: ${rows.length} extracted`);
  }

  // ── DB: Player characters ───────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "character") {
    const { rows } = await pgPool.query("SELECT id, character_name, player_name, level, race, class_summary, subclass, background, alignment, faith, languages, strength, dexterity, constitution, intelligence, wisdom, charisma, armor_class, max_hit_points, speed, backstory, personality_traits, ideals, bonds, flaws, notes, dm_notes, equipment, spells, spell_slots, hit_dice, currencies, conditions, attacks, features FROM hotd_player_characters");
    for (const r of rows) {
      // Flatten JSONB arrays to short readable lines so the embedding picks up
      // names like "Sun Sword Shard" or "fireball" rather than raw JSON.
      const fmtList = (v) => {
        if (!v) return null;
        const arr = Array.isArray(v) ? v : (typeof v === "string" ? safeJsonArray(v) : []);
        if (!arr.length) return null;
        return arr.map(x => {
          if (typeof x === "string") return x;
          if (x && typeof x === "object") return x.name || x.title || x.label || JSON.stringify(x);
          return String(x);
        }).join(", ");
      };
      const equip = fmtList(r.equipment);
      const spells = fmtList(r.spells);
      const attacks = fmtList(r.attacks);
      const features = fmtList(r.features);
      const text = [
        `# ${r.character_name}`,
        `Player: ${r.player_name}`,
        `Level ${r.level} ${r.race} ${r.class_summary}${r.subclass ? ` (${r.subclass})` : ""}`,
        r.background ? `Background: ${r.background}` : null,
        r.alignment ? `Alignment: ${r.alignment}` : null,
        r.faith ? `Faith: ${r.faith}` : null,
        r.languages ? `Languages: ${r.languages}` : null,
        `STR ${r.strength} DEX ${r.dexterity} CON ${r.constitution} INT ${r.intelligence} WIS ${r.wisdom} CHA ${r.charisma}`,
        `AC ${r.armor_class} HP ${r.max_hit_points} Speed ${r.speed}`,
        r.personality_traits ? `Personality: ${r.personality_traits}` : null,
        r.ideals ? `Ideals: ${r.ideals}` : null,
        r.bonds ? `Bonds: ${r.bonds}` : null,
        r.flaws ? `Flaws: ${r.flaws}` : null,
        r.backstory ? `\nBackstory:\n${r.backstory}` : null,
        equip ? `\nEquipment: ${equip}` : null,
        spells ? `\nSpells: ${spells}` : null,
        attacks ? `\nAttacks: ${attacks}` : null,
        features ? `\nFeatures: ${features}` : null,
        (function() {
          // Spell slots: "L1: 4/4, L2: 3/3"
          const slots = Array.isArray(r.spell_slots) ? r.spell_slots : (r.spell_slots ? safeJsonArray(r.spell_slots) : []);
          if (!slots.length) return null;
          return "\nSpell Slots: " + slots.map(s => `L${s.level}: ${s.remaining}/${s.max}${s.pact ? " (pact)" : ""}`).join(", ");
        })(),
        (function() {
          // Hit Dice: "Cleric d8: 5/5"
          const hd = Array.isArray(r.hit_dice) ? r.hit_dice : (r.hit_dice ? safeJsonArray(r.hit_dice) : []);
          if (!hd.length) return null;
          return "\nHit Dice: " + hd.map(h => `${h.class} ${h.die}: ${h.remaining}/${h.max}`).join(", ");
        })(),
        (function() {
          // Currencies: "123 gp, 5 pp" (skip zeroes)
          const c = r.currencies && typeof r.currencies === "object" ? r.currencies : {};
          const parts = [];
          if (c.pp) parts.push(`${c.pp} pp`);
          if (c.gp) parts.push(`${c.gp} gp`);
          if (c.ep) parts.push(`${c.ep} ep`);
          if (c.sp) parts.push(`${c.sp} sp`);
          if (c.cp) parts.push(`${c.cp} cp`);
          return parts.length ? "\nWealth: " + parts.join(", ") : null;
        })(),
        r.conditions ? `\nActive Conditions: ${r.conditions}` : null,
        r.notes ? `\nPlayer Notes (from D&D Beyond):\n${r.notes}` : null,
        r.dm_notes ? `\nDM Campaign Notes:\n${r.dm_notes}` : null,
      ].filter(Boolean).join("\n");
      sources.push({ type: "character", id: r.id, title: r.character_name, content: text, is_dm_only: false, metadata: { player: r.player_name, level: r.level, race: r.race } });
    }
    log(`Characters: ${rows.length} extracted`);
  }

  // ── DB: Adventure journal ───────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "journal") {
    const { rows } = await pgPool.query("SELECT id, actual_date, body FROM hotd_adventure_journal ORDER BY actual_date");
    for (const r of rows) {
      if (!r.body || r.body.trim().length < 20) continue;
      const text = [`# Adventure Journal: ${r.actual_date}`, r.body].join("\n");
      sources.push({ type: "journal", id: r.id, title: `Journal ${r.actual_date}`, content: text, is_dm_only: false, metadata: { date: r.actual_date } });
    }
    log(`Journal entries: ${rows.length} extracted`);
  }

  // ── Files: Markdown under hotd-campaign ─────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "lore") {
    const mdFiles = findMarkdownFiles(CONTENT_DIR);
    for (const filePath of mdFiles) {
      const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
      const raw = fs.readFileSync(filePath, "utf-8");
      const baseName = path.basename(filePath, ".md");

      // Split on "## DM Notes" to separate player-visible from DM-only content
      const dmSplit = raw.split(/(?=^## DM Notes)/m);
      const playerContent = dmSplit[0].trim();
      const dmContent = dmSplit.length > 1 ? dmSplit.slice(1).join("\n").trim() : null;

      if (playerContent) {
        sources.push({ type: "lore", id: null, title: baseName, content: playerContent, is_dm_only: false, source_path: relativePath, metadata: { file: relativePath } });
      }
      if (dmContent) {
        sources.push({ type: "lore", id: null, title: `${baseName} (DM Notes)`, content: dmContent, is_dm_only: true, source_path: relativePath, metadata: { file: relativePath, dm_only: true } });
      }
    }
    log(`Lore files: ${mdFiles.length} extracted (with DM Notes splitting)`);
  }

  // ── Files: JSON data files ──────────────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "lore") {
    const jsonFiles = findJsonDataFiles(path.join(CONTENT_DIR, "data"));
    for (const filePath of jsonFiles) {
      const relativePath = path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const items = Array.isArray(raw) ? raw : [raw];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const title = item.name || item.title || `${path.basename(filePath, ".json")} #${i}`;
          const text = typeof item === "string" ? item : JSON.stringify(item, null, 2);
          sources.push({ type: "lore_json", id: null, title, content: text, is_dm_only: false, source_path: relativePath, metadata: { file: relativePath, index: i } });
        }
      } catch (e) { log(`  WARN: Failed to parse ${relativePath}: ${e.message}`); }
    }
    log(`JSON data files: ${jsonFiles.length} extracted`);
  }

  // ── DB: DM story elements (future) ─────────────────────────
  if (!SOURCE_FILTER || SOURCE_FILTER === "dm_story") {
    try {
      const { rows } = await pgPool.query("SELECT id, element_type, title, content, related_entities, status FROM hotd_dm_story_elements");
      for (const r of rows) {
        const text = [`# [DM] ${r.title}`, `Type: ${r.element_type}`, `Status: ${r.status}`, r.content].filter(Boolean).join("\n");
        sources.push({ type: "dm_story", id: r.id, title: r.title, content: text, is_dm_only: true, metadata: { element_type: r.element_type, status: r.status, related: r.related_entities } });
      }
      log(`DM story elements: ${rows.length} extracted`);
    } catch (_) {
      log(`DM story elements: table not found (skipping)`);
    }
  }

  const totalChars = sources.reduce((s, r) => s + r.content.length, 0);
  log(`\n  Total: ${sources.length} sources, ${totalChars.toLocaleString()} chars`);

  report.stages.extract = {
    total_sources: sources.length,
    total_chars: totalChars,
    by_type: countBy(sources, "type"),
  };

  return sources;
}

// ══════════════════════════════════════════════════════════════
// STAGE 2: CHUNK — split large content into embedding-sized pieces
// ══════════════════════════════════════════════════════════════
function stageChunk(sources) {
  heading("2 — CHUNK");
  const chunks = [];
  const MAX_CHUNK_CHARS = 3000;   // ~750 tokens
  const OVERLAP_CHARS = 200;      // overlap between chunks

  for (const src of sources) {
    const parts = splitIntoChunks(src.content, MAX_CHUNK_CHARS, OVERLAP_CHARS);

    for (let i = 0; i < parts.length; i++) {
      const chunkId = src.source_path
        ? `${src.type}-${path.basename(src.source_path, path.extname(src.source_path))}-${i}`
        : `${src.type}-${src.id}-${i}`;
      chunks.push({
        chunk_id: chunkId,
        source_type: src.type,
        source_id: src.id,
        source_path: src.source_path || null,
        chunk_index: i,
        title: src.title + (parts.length > 1 ? ` (${i + 1}/${parts.length})` : ""),
        text: parts[i],
        content_hash: sha256(parts[i]),
        is_dm_only: src.is_dm_only,
        metadata: { ...src.metadata, total_chunks: parts.length },
        token_estimate: Math.ceil(parts[i].length / 4),
      });
    }
  }

  const totalTokens = chunks.reduce((s, c) => s + c.token_estimate, 0);
  log(`Chunks: ${chunks.length} total, ~${totalTokens.toLocaleString()} estimated tokens`);
  if (VERBOSE) {
    for (const [type, count] of Object.entries(countBy(chunks, "source_type"))) {
      log(`  ${type}: ${count} chunks`);
    }
  }

  report.stages.chunk = {
    total_chunks: chunks.length,
    estimated_tokens: totalTokens,
    by_type: countBy(chunks, "source_type"),
  };

  return chunks;
}

// ══════════════════════════════════════════════════════════════
// STAGE 3: SANITIZE — validate, clean, deduplicate
// ══════════════════════════════════════════════════════════════
async function stageSanitize(chunks) {
  heading("3 — SANITIZE");

  const MIN_CHARS = 20;
  const MAX_CHARS = 12000;
  const sanitized = [];
  const rejected = [];
  const warnings = [];

  // Load existing hashes for incremental mode
  let existingHashes = new Set();
  if (MODE === "incremental") {
    const { rows } = await pgPool.query("SELECT chunk_hash FROM hotd_embeddings");
    existingHashes = new Set(rows.map(r => r.chunk_hash));
    log(`Existing hashes in DB: ${existingHashes.size}`);
  }

  let skippedUnchanged = 0;

  for (const chunk of chunks) {
    // ── Clean text ───────────────────────────────────────────
    let text = chunk.text;

    // Strip HTML tags
    const hadHtml = /<[^>]+>/.test(text);
    text = text.replace(/<[^>]+>/g, " ");

    // Normalize whitespace
    text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

    // Warn on suspicious content
    if (hadHtml) warnings.push({ id: chunk.chunk_id, warning: "html_stripped" });
    if (/data:[a-z]+\/[a-z]+;base64/i.test(text)) {
      warnings.push({ id: chunk.chunk_id, warning: "base64_data_detected" });
      text = text.replace(/data:[a-z]+\/[a-z]+;base64,[A-Za-z0-9+/=]+/gi, "[base64-removed]");
    }

    // ── Validate ─────────────────────────────────────────────
    if (text.length < MIN_CHARS) {
      rejected.push({ id: chunk.chunk_id, reason: "too_short", chars: text.length });
      continue;
    }
    if (text.length > MAX_CHARS) {
      rejected.push({ id: chunk.chunk_id, reason: "too_long", chars: text.length });
      continue;
    }

    // Update text and hash after sanitization
    const cleanHash = sha256(text);
    chunk.text = text;
    chunk.content_hash = cleanHash;
    chunk.token_estimate = Math.ceil(text.length / 4);

    // ── Incremental: skip unchanged ──────────────────────────
    if (MODE === "incremental" && existingHashes.has(cleanHash)) {
      skippedUnchanged++;
      continue;
    }

    sanitized.push(chunk);
  }

  log(`Sanitized: ${sanitized.length} ready to embed`);
  log(`Skipped (unchanged): ${skippedUnchanged}`);
  log(`Rejected: ${rejected.length}`);
  log(`Warnings: ${warnings.length}`);

  if (rejected.length > 0 && VERBOSE) {
    for (const r of rejected) log(`  REJECT: ${r.id} — ${r.reason} (${r.chars} chars)`);
  }
  if (warnings.length > 0 && VERBOSE) {
    for (const w of warnings) log(`  WARN: ${w.id} — ${w.warning}`);
  }

  report.stages.sanitize = {
    sanitized: sanitized.length,
    skipped_unchanged: skippedUnchanged,
    rejected: rejected.length,
    rejected_details: rejected,
    warnings: warnings.length,
    warning_details: warnings,
  };

  return sanitized;
}

// ══════════════════════════════════════════════════════════════
// STAGE 4: EMBED — call OpenAI Embeddings API
// ══════════════════════════════════════════════════════════════
async function stageEmbed(chunks) {
  heading("4 — EMBED");

  if (MODE === "dry-run") {
    const tokens = chunks.reduce((s, c) => s + c.token_estimate, 0);
    log(`DRY RUN — would embed ${chunks.length} chunks (~${tokens.toLocaleString()} tokens)`);
    log(`Estimated cost: ~$${(tokens / 1_000_000 * 0.02).toFixed(4)}`);
    report.stages.embed = { mode: "dry-run", would_embed: chunks.length, estimated_tokens: tokens };
    return chunks;
  }

  if (chunks.length === 0) {
    log("Nothing to embed — all chunks unchanged.");
    report.stages.embed = { embedded: 0, api_calls: 0, tokens_used: 0 };
    return chunks;
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for embedding");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }

  let totalTokens = 0;
  let apiCalls = 0;
  const errors = [];

  // Process in batches
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map(c => c.text);

    try {
      const resp = await openaiClient.embeddings.create({
        model: EMBED_MODEL,
        input: texts,
        dimensions: EMBED_DIMENSIONS,
      });
      apiCalls++;

      totalTokens += resp.usage?.total_tokens || 0;

      for (let j = 0; j < resp.data.length; j++) {
        batch[j].embedding = resp.data[j].embedding;
      }

      log(`  Batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1}: ${batch.length} embedded (${resp.usage?.total_tokens || "?"} tokens)`);
    } catch (err) {
      errors.push({ batch: Math.floor(i / EMBED_BATCH_SIZE), error: err.message });
      log(`  ERROR batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1}: ${err.message}`);
    }
  }

  const embedded = chunks.filter(c => c.embedding);
  log(`\nEmbedded: ${embedded.length}/${chunks.length}, API calls: ${apiCalls}, tokens: ${totalTokens.toLocaleString()}`);
  log(`Cost: ~$${(totalTokens / 1_000_000 * 0.02).toFixed(4)}`);

  report.stages.embed = {
    embedded: embedded.length,
    api_calls: apiCalls,
    tokens_used: totalTokens,
    estimated_cost: `$${(totalTokens / 1_000_000 * 0.02).toFixed(4)}`,
    errors,
  };

  return embedded;
}

// ══════════════════════════════════════════════════════════════
// STAGE 5: STORE — upsert into pgvector, clean orphans
// ══════════════════════════════════════════════════════════════
async function stageStore(chunks) {
  heading("5 — STORE");

  if (MODE === "dry-run") {
    log(`DRY RUN — would upsert ${chunks.length} chunks`);
    report.stages.store = { mode: "dry-run", would_upsert: chunks.length };
    return;
  }

  if (chunks.length === 0) {
    log("Nothing to store.");
    report.stages.store = { upserted: 0, deleted_orphans: 0 };
    // Still clean orphans in full mode
    if (MODE === "full") {
      await cleanOrphans();
    }
    return;
  }

  // In full mode, truncate first
  if (MODE === "full") {
    await pgPool.query("TRUNCATE hotd_embeddings");
    log("Full mode: table truncated.");
  }

  let upserted = 0;
  for (const chunk of chunks) {
    if (!chunk.embedding) continue;

    const vectorStr = `[${chunk.embedding.join(",")}]`;

    try {
      await pgPool.query(`
        INSERT INTO hotd_embeddings (source_type, source_id, source_path, chunk_index, title, chunk_text, chunk_hash, metadata, embedding, is_dm_only, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector, $10, NOW())
        ON CONFLICT (chunk_hash)
        DO UPDATE SET chunk_text = $6, title = $5, metadata = $8, embedding = $9::vector, is_dm_only = $10, updated_at = NOW()
      `, [
        chunk.source_type,
        chunk.source_id,
        chunk.source_path,
        chunk.chunk_index,
        chunk.title,
        chunk.text,
        chunk.content_hash,
        JSON.stringify(chunk.metadata),
        vectorStr,
        chunk.is_dm_only,
      ]);
      upserted++;
    } catch (err) {
      log(`  ERROR storing ${chunk.chunk_id}: ${err.message}`);
    }
  }

  // Clean orphans in incremental mode
  let deletedOrphans = 0;
  if (MODE === "incremental") {
    deletedOrphans = await cleanOrphans();
  }

  // Get totals
  const { rows: [totals] } = await pgPool.query(`
    SELECT count(*) as total,
           count(*) FILTER (WHERE is_dm_only = true) as dm_only
    FROM hotd_embeddings
  `);
  const { rows: byType } = await pgPool.query(`
    SELECT source_type, count(*) as count FROM hotd_embeddings GROUP BY source_type ORDER BY source_type
  `);

  log(`Upserted: ${upserted}`);
  log(`Deleted orphans: ${deletedOrphans}`);
  log(`Total vectors: ${totals.total} (${totals.dm_only} DM-only)`);
  for (const r of byType) log(`  ${r.source_type}: ${r.count}`);

  // Rebuild IVFFlat index for fast similarity search
  if (MODE === "full" || upserted > 50) {
    try {
      log("Rebuilding IVFFlat index...");
      await pgPool.query("DROP INDEX IF EXISTS idx_embed_ivfflat");
      const listCount = Math.max(1, Math.floor(Math.sqrt(parseInt(totals.total))));
      await pgPool.query(`CREATE INDEX idx_embed_ivfflat ON hotd_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${listCount})`);
      log(`IVFFlat index rebuilt (lists=${listCount})`);
    } catch (err) {
      log(`WARN: IVFFlat index rebuild failed: ${err.message}`);
    }
  }
  report.stages.store = {
    upserted,
    deleted_orphans: deletedOrphans,
    total_vectors: parseInt(totals.total),
    dm_only_count: parseInt(totals.dm_only),
    by_type: Object.fromEntries(byType.map(r => [r.source_type, parseInt(r.count)])),
  };
}

async function cleanOrphans() {
  // Delete embeddings whose source no longer exists
  let deleted = 0;
  const orphanQueries = [
    { type: "npc", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'npc' AND source_id NOT IN (SELECT id FROM hotd_npcs)" },
    { type: "session", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'session' AND source_id NOT IN (SELECT id FROM hotd_sessions)" },
    { type: "artifact", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'artifact' AND source_id NOT IN (SELECT id FROM hotd_artifacts)" },
    { type: "handout", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'handout' AND source_id NOT IN (SELECT id FROM hotd_handouts)" },
    { type: "calendar", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'calendar' AND source_id NOT IN (SELECT id FROM hotd_calendar_events)" },
    { type: "character", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'character' AND source_id NOT IN (SELECT id FROM hotd_player_characters)" },
    { type: "journal", sql: "DELETE FROM hotd_embeddings WHERE source_type = 'journal' AND source_id NOT IN (SELECT id FROM hotd_adventure_journal)" },
  ];
  for (const { type, sql } of orphanQueries) {
    try {
      const r = await pgPool.query(sql);
      if (r.rowCount > 0) {
        log(`  Orphans (${type}): ${r.rowCount} deleted`);
        deleted += r.rowCount;
      }
    } catch (_) { /* table may not exist */ }
  }
  return deleted;
}


// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function splitIntoChunks(text, maxChars, overlap) {
  if (text.length <= maxChars) return [text];

  // Strategy 1: Split on markdown ## headers, keeping each section intact
  const headerSections = text.split(/(?=^## )/m).filter(s => s.trim().length > 0);
  if (headerSections.length > 1) {
    // Merge small sections together, split large ones
    const merged = [];
    let current = "";
    for (const section of headerSections) {
      if (section.length > maxChars) {
        // This section is too big on its own; flush current, then sub-split it
        if (current.trim()) merged.push(current.trim());
        current = "";
        merged.push(...splitByParagraphs(section, maxChars, overlap));
      } else if (current.length + section.length > maxChars && current.length > 0) {
        merged.push(current.trim());
        current = section;
      } else {
        current += (current ? "\n\n" : "") + section;
      }
    }
    if (current.trim()) merged.push(current.trim());
    if (merged.length > 0) return merged;
  }

  // Strategy 2: Paragraph-based sliding window
  return splitByParagraphs(text, maxChars, overlap);
}

function splitByParagraphs(text, maxChars, overlap) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      const words = current.split(/\s+/);
      const overlapWords = Math.ceil(overlap / 5);
      current = words.slice(-overlapWords).join(" ") + "\n\n" + para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Hard-split any remaining oversized chunks by sentences
  const final = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      final.push(chunk);
    } else {
      const sentences = chunk.match(/[^.!?\n]+[.!?\n]+/g) || [chunk];
      let buf = "";
      for (const s of sentences) {
        if (buf.length + s.length > maxChars && buf.length > 0) {
          final.push(buf.trim());
          buf = s;
        } else {
          buf += s;
        }
      }
      if (buf.trim()) final.push(buf.trim());
    }
  }
  return final;
}

function findMarkdownFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

function findJsonDataFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findJsonDataFiles(full));
    else if (entry.name.endsWith(".json")) files.push(full);
  }
  return files;
}

function countBy(arr, key) {
  const counts = {};
  for (const item of arr) {
    const val = item[key] || "unknown";
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}


// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  EMBEDDING PIPELINE — mode: ${MODE}${SOURCE_FILTER ? `, source: ${SOURCE_FILTER}` : ""}`);
  console.log(`${"═".repeat(60)}`);

  try {
    // Verify DB connection
    await pgPool.query("SELECT 1");
    log("Database connected.");

    // Ensure pgvector extension and hotd_embeddings table exist
    await pgPool.query("CREATE EXTENSION IF NOT EXISTS vector");
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS hotd_embeddings (
        id            SERIAL PRIMARY KEY,
        source_type   TEXT NOT NULL,
        source_id     INTEGER,
        source_path   TEXT,
        chunk_index   INTEGER DEFAULT 0,
        title         TEXT DEFAULT '',
        chunk_text    TEXT NOT NULL,
        chunk_hash    TEXT NOT NULL,
        metadata      JSONB DEFAULT '{}',
        embedding     vector(1536),
        is_dm_only    BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT hotd_embeddings_chunk_hash_key UNIQUE (chunk_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_embed_source ON hotd_embeddings (source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_embed_hash ON hotd_embeddings (chunk_hash);
      CREATE INDEX IF NOT EXISTS idx_embed_dm ON hotd_embeddings (is_dm_only);
    `);
    log("Embeddings table: ready.");

    const sources = await stageExtract();
    const chunks = stageChunk(sources);
    const sanitized = await stageSanitize(chunks);
    const embedded = await stageEmbed(sanitized);
    await stageStore(embedded);

    report.completed_at = new Date().toISOString();
    report.success = true;

  } catch (err) {
    report.completed_at = new Date().toISOString();
    report.success = false;
    report.error = err.message;
    console.error(`\n  FATAL: ${err.message}`);
    if (VERBOSE) console.error(err.stack);
  } finally {
    await pgPool.end();
  }

  // ── Print report ───────────────────────────────────────────
  console.log(`\n${"═".repeat(60)}`);
  console.log("  PIPELINE REPORT");
  console.log(`${"═".repeat(60)}`);
  console.log(JSON.stringify(report, null, 2));

  // Write report to file for GitHub Actions artifact
  const reportDir = path.join(REPO_ROOT, "reports");
  try {
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `embed-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport written to: ${reportPath}`);
  } catch (e) {
    console.log(`\nCould not write report file: ${e.message}`);
  }

  process.exit(report.success ? 0 : 1);
}

main();
