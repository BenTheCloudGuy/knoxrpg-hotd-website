// ══════════════════════════════════════════════════════════════
// ── IMAGE DESCRIBE + RAG INDEX ────────────────────────────────
// Makes gallery images (Art + Maps) searchable: for each not-yet-indexed
// image (hotd_art, hotd_maps, hotd_generated_images) it builds a text
// description — AI vision when available, otherwise title + filename +
// any stored caption/prompt — and embeds it into hotd_embeddings as
// source_type 'image'. That makes images findable through both HOTD
// Search and the DM AI (both read hotd_embeddings). Idempotent by
// source_path (`image:{table}:{id}`); a re-run only indexes new images.
// ══════════════════════════════════════════════════════════════

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { HOTD_UPLOADS_DIR, HOTD_CONTENT_DIR } = require("../config");
const imageTags = require("./image-tags");

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;

function sha256(t) { return crypto.createHash("sha256").update(t).digest("hex"); }
function mimeFor(name) { const e = (name.split(".").pop() || "").toLowerCase(); return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" }[e] || "image/png"; }

// Words from a filename → search terms ("map-05.tideswell-cave.jpg" → "tideswell cave")
function keywordsFromUrl(url) {
  const file = (url || "").split("/").pop().split("?")[0].replace(/\.[a-z0-9]+$/i, "");
  return file.replace(/^map[-_.]/i, "").replace(/-player$/i, "").replace(/^[0-9]+([.\-][0-9]+)*[.\-]?/, "").replace(/[-_.]+/g, " ").trim();
}

// Resolve /hotd-content/{rel} to a local file (uploads PVC first, then NAS).
function resolveLocalPath(url) {
  if (!url || !url.startsWith("/hotd-content/")) return null;
  const rel = url.replace(/^\/hotd-content\//, "");
  for (const root of [HOTD_UPLOADS_DIR, HOTD_CONTENT_DIR]) {
    if (!root) continue;
    const p = path.join(root, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// AI vision: description + Type classification (best-effort; caller falls back).
async function describeImage(openai, model, url) {
  const p = resolveLocalPath(url);
  let dataUrl;
  if (p) dataUrl = `data:${mimeFor(p)};base64,${fs.readFileSync(p).toString("base64")}`;
  else if (/^https?:\/\//.test(url)) dataUrl = url;
  else return null;
  const resp = await openai.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [{
      role: "user",
      content: [
        { type: "text", text: 'Describe this Dungeons & Dragons fantasy image for a searchable campaign library (subjects, creatures, setting, mood, notable objects or map features), then classify it. Respond as JSON: {"description": "1-3 concise sentences", "type": one of "Portrait","Location/Landmark","Monster","Emblem","Other"}.' },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    }],
  });
  let out = {};
  try { out = JSON.parse(resp.choices[0].message.content || "{}"); } catch (_) { out = { description: (resp.choices[0].message.content || "").trim() }; }
  return { description: (out.description || "").trim(), type: imageTags.normType(out.type) };
}

async function embedImage(pgPool, openai, item, text) {
  const sourcePath = `image:${item.table}:${item.id}`;
  const full = [item.title, text].filter(Boolean).join(". ").trim();
  if (!full) return false;
  const resp = await openai.embeddings.create({ model: EMBED_MODEL, input: full, dimensions: EMBED_DIMENSIONS });
  const vec = `[${resp.data[0].embedding.join(",")}]`;
  const hash = sha256(sourcePath);
  await pgPool.query(
    `INSERT INTO hotd_embeddings (source_type, source_id, source_path, chunk_index, title, chunk_text, chunk_hash, metadata, embedding, is_dm_only, updated_at)
     VALUES ('image', NULL, $1, 0, $2, $3, $4, $5, $6::vector, false, NOW())
     ON CONFLICT (chunk_hash) DO UPDATE SET title=$2, chunk_text=$3, metadata=$5, embedding=$6::vector, updated_at=NOW()`,
    [sourcePath, item.title || "Image", full, hash, JSON.stringify({ url: item.url, kind: item.kind, title: item.title, source: item.table }), vec]
  );
  return true;
}

// Build the worklist of not-yet-indexed images.
async function collectUnindexed(pgPool) {
  const indexed = new Set((await pgPool.query("SELECT source_path FROM hotd_embeddings WHERE source_type='image'")).rows.map((r) => r.source_path));
  const work = [];
  const push = (table, id, url, kind, title, caption, needsVision) => {
    const sp = `image:${table}:${id}`;
    if (!url || indexed.has(sp)) return;
    work.push({ table, id, url, kind, title: title || "", caption: caption || "", needsVision });
  };
  try { (await pgPool.query("SELECT id, prompt, revised_prompt, image_url FROM hotd_generated_images ORDER BY id DESC")).rows.forEach((r) => push("hotd_generated_images", r.id, r.image_url, "art", (r.prompt || "").slice(0, 80), r.revised_prompt || r.prompt || "", false)); } catch (_) {}
  try { (await pgPool.query("SELECT id, title, description, image_url FROM hotd_art ORDER BY id DESC")).rows.forEach((r) => push("hotd_art", r.id, r.image_url, "art", r.title, r.description, true)); } catch (_) {}
  try { (await pgPool.query("SELECT id, name, description, image_url FROM hotd_maps ORDER BY id DESC")).rows.forEach((r) => push("hotd_maps", r.id, r.image_url, "map", r.name, r.description, true)); } catch (_) {}
  return work;
}

// Describe + embed up to `limit` un-indexed images. opts: { limit?, model?, vision?, onLog? }
async function describeAndIndexImages(pgPool, openai, opts = {}) {
  if (!openai) throw new Error("OpenAI client not initialized");
  const log = typeof opts.onLog === "function" ? opts.onLog : () => {};
  const limit = opts.limit || 120;
  const visionModel = opts.model || process.env.AI_VISION_MODEL || "gpt-4o-mini";
  const useVision = opts.vision !== false;

  const work = await collectUnindexed(pgPool);
  const batch = work.slice(0, limit);
  const result = { pending: work.length, processed: 0, indexed: 0, vision: 0, textOnly: 0, typed: 0, failed: 0 };
  log(`${work.length} image(s) to index; processing ${batch.length} this run.`);

  for (const item of batch) {
    result.processed++;
    // Base text: stored caption + filename keywords.
    const kw = keywordsFromUrl(item.url);
    let text = [item.caption, kw].filter(Boolean).join(". ").trim();
    // Auto source + a sensible default type (maps are locations).
    const source = imageTags.deriveSource(item.table === "hotd_generated_images" ? "generated" : "file", item.url, item.caption);
    let type = item.kind === "map" ? "Location/Landmark" : "Other";
    // Enrich with AI vision (description + Type) when the caption is weak/boilerplate.
    const weak = !item.caption || /^From .+\(D&D Beyond\)$/i.test(item.caption);
    if (useVision && item.needsVision && weak) {
      try {
        const v = await describeImage(openai, visionModel, item.url);
        if (v && v.description) { text = v.description; result.vision++; if (v.type) type = v.type; }
        else result.textOnly++;
      } catch (e) { result.textOnly++; log(`vision skipped (${item.title || item.id}): ${e.message}`); }
    } else if (!item.needsVision) {
      result.textOnly++; // generated: prompt is the caption
    }
    // Persist source + type tags (preserve any custom tags).
    try { await imageTags.saveTags(pgPool, item.url, { source, type }); result.typed++; } catch (_) {}
    // Embed description + type so tag/type queries match via RAG too.
    const embedText = [text || item.title, `Type: ${type}`].filter(Boolean).join(". ");
    try { if (await embedImage(pgPool, openai, item, embedText)) result.indexed++; }
    catch (e) { result.failed++; log(`embed failed (${item.title || item.id}): ${e.message}`); }
    if (result.processed % 20 === 0) log(`  indexed ${result.indexed}/${batch.length}`);
  }
  log(`Done: indexed ${result.indexed} (${result.vision} via vision), typed ${result.typed}, ${result.failed} failed, ${result.pending - result.processed} still pending.`);
  return result;
}

module.exports = { describeAndIndexImages, describeImage, collectUnindexed };
