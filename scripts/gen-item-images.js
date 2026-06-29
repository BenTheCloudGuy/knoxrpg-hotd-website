#!/usr/bin/env node
// gen-item-images.js — Generate art for magic items that have no image.
// One image per unique base name (variants share it). Resumable: skips any
// base whose target PNG already exists.
//
// Usage:
//   node scripts/gen-item-images.js [--limit N] [--quality low|medium|high] [--dry-run]
//
// Env: OPENAI_API_KEY, PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { pgPool } = require("../src/db/pool");
const { baseSlug, GEN_IMAGE_DIR } = require("./lib-item-base");

const STYLE = `Dark fantasy D&D magic item illustration. A single object, centered, full view, resting on a plain dark stone surface with a softly vignetted dark background. Painterly digital art, dramatic directional lighting, rich detail, semi-realistic game-asset style. No text, no border, no watermark, no hands, no people.`;

function parseArgs(argv) {
  const a = { limit: Infinity, quality: "medium", dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--limit": a.limit = parseInt(argv[++i], 10); break;
      case "--quality": a.quality = argv[++i]; break;
      case "--dry-run": a.dryRun = true; break;
    }
  }
  return a;
}

// Build the per-item generation prompt from its type/rarity/description.
function buildPrompt(item) {
  const kind = (item.type || "item").replace(/([a-z])([A-Z])/g, "$1 $2");
  const rarity = item.rarity ? `, ${item.rarity.toLowerCase()} rarity` : "";
  let desc = (item.description_text || "").replace(/\s+/g, " ").trim().slice(0, 350);
  return `${STYLE}\n\nDepict the magic ${kind.toLowerCase()} "${item.baseName}"${rarity}. ${desc}`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(GEN_IMAGE_DIR)) fs.mkdirSync(GEN_IMAGE_DIR, { recursive: true });

  // All rows, to know which bases already have ANY image (remote) -> skip.
  const { rows } = await pgPool.query(
    `SELECT name, type, rarity, description_text, avatar_url FROM magic_items`,
  );

  const baseHasRemote = new Set();
  for (const r of rows) {
    if (r.avatar_url && r.avatar_url.trim()) baseHasRemote.add(baseSlug(r.name));
  }

  // Pick one representative row per base that needs generation.
  const targets = new Map(); // slug -> representative row
  for (const r of rows) {
    const slug = baseSlug(r.name);
    if (baseHasRemote.has(slug)) continue;
    if (targets.has(slug)) continue;
    targets.set(slug, { ...r, baseName: r.name.split(",")[0].replace(/\s*\(.*?\)\s*/g, " ").trim() });
  }

  let todo = [...targets.entries()].filter(([slug]) =>
    !fs.existsSync(path.join(GEN_IMAGE_DIR, `${slug}.png`)),
  );
  const totalNeeded = targets.size;
  const alreadyDone = totalNeeded - todo.length;
  todo = todo.slice(0, args.limit);

  console.log(`Unique bases needing art: ${totalNeeded} | already done: ${alreadyDone} | this run: ${todo.length}`);
  if (args.dryRun) {
    for (const [slug, item] of todo.slice(0, 5)) {
      console.log(`\n--- ${slug}.png ---\n${buildPrompt(item)}`);
    }
    console.log(`\n(dry run — ${todo.length} would generate)`);
    return;
  }

  const client = new OpenAI();
  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const [slug, item] = todo[i];
    const outPath = path.join(GEN_IMAGE_DIR, `${slug}.png`);
    process.stdout.write(`[${i + 1}/${todo.length}] ${slug} ... `);
    try {
      const result = await client.images.generate({
        model: "gpt-image-1.5",
        prompt: buildPrompt(item),
        size: "1024x1024",
        quality: args.quality,
        n: 1,
      });
      const buf = Buffer.from(result.data[0].b64_json, "base64");
      fs.writeFileSync(outPath, buf);
      ok++;
      console.log(`ok (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
    } catch (e) {
      fail++;
      console.log(`FAIL: ${e.message}`);
    }
  }
  console.log(`\nDone. Generated ${ok}, failed ${fail}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
