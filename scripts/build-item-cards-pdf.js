#!/usr/bin/env node
/**
 * build-item-cards-pdf.js
 *
 * Generate print-ready D&D item cards (baseball-card size, 2.5" x 3.5") laid
 * out 9-up (3x3) on US Letter or A4 stock. Each item produces a FRONT (centered
 * art + name + rarity/type badge) and a BACK (stat line + description). The back
 * page has its columns mirrored per row so that, when duplex-printed (flip on the
 * long edge), each back lands behind its own front for clean cutting. Hairline
 * cut guides sit on every card edge and outer crop marks aid trim registration.
 *
 * Item data is read from the exported markdown under /items (YAML front-matter +
 * body). Art is pulled from items/magic-items/images/<base-slug>.png and embedded
 * as base64 so the rendered HTML is self-contained.
 *
 * Usage:
 *   node scripts/build-item-cards-pdf.js                       # demo: 9 items that have art
 *   node scripts/build-item-cards-pdf.js acheron-blade answerer moonblade-shortsword
 *   node scripts/build-item-cards-pdf.js --items acheron-blade,answerer
 *   node scripts/build-item-cards-pdf.js --from-file my-cards.txt   # one slug per line
 *   node scripts/build-item-cards-pdf.js --out reports/loot.pdf --title "Session 30 Loot"
 *   node scripts/build-item-cards-pdf.js --size a4
 *   node scripts/build-item-cards-pdf.js --keep-html               # keep the intermediate HTML
 *
 * More than 9 items paginate into additional 3x3 sheet pairs automatically.
 *
 * Requires: weasyprint (apt: weasyprint).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'items');
const IMAGES_DIR = path.join(ITEMS_DIR, 'magic-items', 'images');
const REPORTS_DIR = path.join(ROOT, 'reports');
const CACHE_PATH = path.join(__dirname, '.card-desc-cache.json');

// ---------------------------------------------------------------------------
// Slug helpers (mirrors scripts/lib-item-base.js so variants share one image).
// ---------------------------------------------------------------------------
function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function baseName(name) {
  return String(name).split(',')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim();
}
function baseSlug(name) {
  return slugify(baseName(name));
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    slugs: [], out: null, title: null, size: 'letter', fromFile: null, keepHtml: false,
    shorten: true, targetChars: 480, model: 'gpt-5.4-mini',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--items') args.slugs.push(...argv[++i].split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--size') args.size = argv[++i].toLowerCase();
    else if (a === '--from-file') args.fromFile = argv[++i];
    else if (a === '--keep-html') args.keepHtml = true;
    else if (a === '--no-shorten') args.shorten = false;
    else if (a === '--target-chars') args.targetChars = parseInt(argv[++i], 10);
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a.startsWith('--')) { console.error(`Unknown arg: ${a}`); printHelp(); process.exit(1); }
    else args.slugs.push(a.replace(/\.md$/, '').trim());
  }
  if (!['letter', 'a4'].includes(args.size)) {
    console.error(`Unknown size: ${args.size}. Use letter or a4.`);
    process.exit(1);
  }
  if (!Number.isInteger(args.targetChars) || args.targetChars < 120) {
    console.error(`--target-chars must be an integer >= 120 (got ${args.targetChars})`);
    process.exit(1);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/build-item-cards-pdf.js [slugs...] [options]

  Positional slugs        Item file slugs (filename without .md), any number.
  --items a,b,c           Comma list of slugs (repeatable).
  --from-file PATH        Read slugs from a file, one per line (# comments ok).
  --out PATH              Output PDF (default reports/item-cards.pdf).
  --title TITLE           Optional footer title printed under each sheet.
  --size letter|a4        Paper size (default letter). Cards stay 2.5" x 3.5".
  --keep-html             Keep the intermediate HTML next to the PDF.
  --no-shorten            Keep full descriptions (they may clip on long items).
  --target-chars N        Target length for AI-shortened descriptions (default 480).
  --model NAME            OpenAI model for shortening (default gpt-5.4-mini).
  -h, --help              Show this help.

  Descriptions longer than the target are condensed with OpenAI so the full rules
  fit the card back; results cache to scripts/.card-desc-cache.json. Needs
  OPENAI_API_KEY (falls back to full text if unset). With no slugs, 9 items that
  already have artwork are auto-selected as a demo.
`);
}

// ---------------------------------------------------------------------------
// Front-matter + markdown parsing
// ---------------------------------------------------------------------------
function parseFrontMatter(content) {
  const front = {};
  let body = content;
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
      if (kv) {
        let v = kv[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        front[kv[1].toLowerCase()] = v;
      }
    }
    body = content.slice(m[0].length);
  }
  return { front, body };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Clean the raw item body into an array of plain-text paragraphs.
function cleanParas(body) {
  let text = body;
  text = text.replace(/^#\s+.*$/m, '');               // drop the H1 title
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');    // drop image markdown
  // Drop the auto-generated "Applicable Weapons" pseudo-table and anything after.
  text = text.replace(/\n\s*Applicable\s+\w+:?[\s\S]*$/i, '');
  return text
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p && p.length > 1);
}

function paragraphsToHtml(paras) {
  return paras
    .map(p => `<p>${escapeHtml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('');
}

// Full description as HTML (card back, when not shortening).
function descriptionHtml(body) {
  return paragraphsToHtml(cleanParas(body));
}

// Full description as plain text (source for AI shortening / length checks).
function descriptionText(body) {
  return cleanParas(body).join('\n\n');
}

// Render already-clean prose (e.g. an AI-shortened blurb) to HTML paragraphs.
function textToHtml(text) {
  const paras = String(text).split(/\n{2,}/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return paragraphsToHtml(paras);
}

// ---------------------------------------------------------------------------
// AI description shortening (fits the full rules onto a small card back)
// ---------------------------------------------------------------------------
function hashText(s) {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return {}; }
}

function saveCache(cache) {
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); } catch { /* best effort */ }
}

// Truncate at a word boundary as a fallback if the AI call fails.
function hardTrim(text, n) {
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, '') + '\u2026';
}

const SHORTEN_SYSTEM =
  'You condense Dungeons & Dragons 5e magic-item descriptions so the full rules fit on a ' +
  'small printed card. Preserve every mechanical detail that matters at the table: bonuses, ' +
  'dice, save DCs, charges and recharge, activation/action cost, attunement effects, and ' +
  'conditions. Drop tables, "applicable weapons" lists, restatements of the rarity/type line, ' +
  'and pure filler. Keep a light touch of flavor only if space allows. Write plain prose ' +
  '(no markdown headings, no bullet symbols), short sentences, and use **bold** only for ' +
  'named properties. Never invent rules that are not in the source.';

async function shortenOne(client, model, item, targetChars) {
  const source = descriptionText(item.body);
  if (source.length <= targetChars) return source;   // already fits; no call needed
  const user =
    `Item: ${item.front.title || item.slug}\n` +
    `Rarity/Type: ${[item.front.rarity, humanizeType(item.front.type)].filter(Boolean).join(', ')}\n\n` +
    `Full description:\n${source}\n\n` +
    `Condense to about ${targetChars} characters (hard maximum ${Math.round(targetChars * 1.15)}). ` +
    `Return only the condensed description.`;
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SHORTEN_SYSTEM },
      { role: 'user', content: user },
    ],
    max_completion_tokens: 400,
    temperature: 0.3,
  });
  const out = (completion.choices?.[0]?.message?.content || '').trim();
  return out || hardTrim(source, targetChars);
}

// Attach `cardText` to every item, using a disk cache keyed by source hash.
async function shortenDescriptions(items, opts) {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('  [shorten] OPENAI_API_KEY not set; using full descriptions (may clip).');
    return;
  }
  let OpenAI;
  try { OpenAI = require('openai'); } catch {
    console.warn('  [shorten] openai package not installed; using full descriptions.');
    return;
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const cache = loadCache();
  const { model, targetChars } = opts;
  let calls = 0, cached = 0, shortAlready = 0;

  // Small concurrency pool: quick without hammering the API.
  const queue = items.slice();
  async function worker() {
    while (queue.length) {
      const item = queue.shift();
      const source = descriptionText(item.body);
      if (source.length <= targetChars) { item.cardText = source; shortAlready++; continue; }
      const h = hashText(source);
      const hit = cache[item.slug];
      if (hit && hit.hash === h && hit.model === model && hit.target === targetChars && hit.text) {
        item.cardText = hit.text; cached++; continue;
      }
      try {
        const text = await shortenOne(client, model, item, targetChars);
        item.cardText = text;
        cache[item.slug] = { hash: h, model, target: targetChars, text };
        calls++;
      } catch (err) {
        console.warn(`  [shorten] ${item.slug}: ${err.message}; truncating instead.`);
        item.cardText = hardTrim(source, targetChars);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  saveCache(cache);
  console.log(`  [shorten] ${calls} generated, ${cached} cached, ${shortAlready} already short (target ~${targetChars} chars).`);
}

// ---------------------------------------------------------------------------
// Item index + image resolution
// ---------------------------------------------------------------------------
function walkMd(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'images') continue;
      walkMd(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function buildIndex() {
  const index = new Map();
  for (const file of walkMd(ITEMS_DIR, [])) {
    const slug = path.basename(file, '.md');
    const { front, body } = parseFrontMatter(fs.readFileSync(file, 'utf8'));
    index.set(slug, { slug, file, front, body });
  }
  return index;
}

function resolveImageAbs(item) {
  const img = item.front.image;
  if (img && !/^https?:/i.test(img)) {
    const abs = path.resolve(path.dirname(item.file), img);
    if (fs.existsSync(abs)) return abs;
  }
  const byBase = path.join(IMAGES_DIR, baseSlug(item.front.title || item.slug) + '.png');
  if (fs.existsSync(byBase)) return byBase;
  const bySlug = path.join(IMAGES_DIR, item.slug + '.png');
  if (fs.existsSync(bySlug)) return bySlug;
  return null;
}

function imageDataUri(absPath) {
  const ext = path.extname(absPath).slice(1).toLowerCase();
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(absPath).toString('base64')}`;
}

function pickDemoItems(index, count) {
  const candidates = [];
  for (const item of index.values()) {
    if (!resolveImageAbs(item)) continue;
    if (!item.front.rarity) continue;
    if (descriptionHtml(item.body).length < 160) continue;
    candidates.push(item);
  }
  candidates.sort((a, b) => a.slug.localeCompare(b.slug));
  // One representative per "family" (first word of the base name) so the demo
  // shows variety instead of nine near-identical "adamantine-*" weapons.
  const families = new Map();
  for (const it of candidates) {
    const fam = baseName(it.front.title || it.slug).split(/\s+/)[0].toLowerCase();
    if (!families.has(fam)) families.set(fam, it);
  }
  const reps = [...families.values()];
  if (reps.length <= count) return reps.slice(0, count);
  // Spread the picks evenly across the alphabetized family list.
  const step = reps.length / count;
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(reps[Math.floor(i * step)]);
  return picked;
}

// ---------------------------------------------------------------------------
// Card rendering
// ---------------------------------------------------------------------------
// "WondrousItem" -> "Wondrous Item"
function humanizeType(t) {
  return String(t || '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function statLine(front) {
  const parts = [];
  if (front.rarity) parts.push(front.rarity);
  if (front.type) parts.push(humanizeType(front.type));
  if (String(front.requires_attunement).toLowerCase() === 'yes') parts.push('Requires Attunement');
  if (front.source) parts.push(front.source);
  return parts.join(' &middot; ');
}

function frontCard(item) {
  if (!item) return '<div class="card"></div>';
  const imgAbs = resolveImageAbs(item);
  const art = imgAbs
    ? `<img src="${imageDataUri(imgAbs)}" alt="">`
    : '<em class="no-art">No art</em>';
  const badgeBits = [item.front.rarity, humanizeType(item.front.type)].filter(Boolean).map(escapeHtml);
  return `<div class="card front"><div class="inner">
    <div class="name"><span>${escapeHtml(item.front.title || item.slug)}</span></div>
    <div class="art"><span>${art}</span></div>
    <div class="badge"><span>${badgeBits.join(' &middot; ')}</span></div>
  </div></div>`;
}

function backCard(item) {
  if (!item) return '<div class="card"></div>';
  const desc = item.cardText != null ? textToHtml(item.cardText) : descriptionHtml(item.body);
  return `<div class="card back"><div class="inner">
    <div class="name"><span>${escapeHtml(item.front.title || item.slug)}</span></div>
    <div class="stat"><span>${statLine(item.front)}</span></div>
    <div class="desc">${desc}</div>
  </div></div>`;
}

// Reverse each row of three so a duplex flip on the long edge aligns backs.
function mirrorRows(cells) {
  const out = [];
  for (let r = 0; r < 3; r++) {
    const row = cells.slice(r * 3, r * 3 + 3);
    out.push(...row.reverse());
  }
  return out;
}

function cropMarks() {
  const L = 0.16, T = 0.008, W = 7.5, H = 10.5;
  const corners = [
    { x: 0, y: 0, hx: -0.2, vy: -0.2 },
    { x: W, y: 0, hx: W + 0.04, vy: -0.2 },
    { x: 0, y: H, hx: -0.2, vy: H + 0.04 },
    { x: W, y: H, hx: W + 0.04, vy: H + 0.04 },
  ];
  const out = [];
  for (const c of corners) {
    out.push(`<div class="crop" style="left:${c.hx}in;top:${c.y - T / 2}in;width:${L}in;height:${T}in;"></div>`);
    out.push(`<div class="crop" style="left:${c.x - T / 2}in;top:${c.vy}in;width:${T}in;height:${L}in;"></div>`);
  }
  return out.join('');
}

function page(cells, kind, title) {
  const grid = cells.map(kind === 'front' ? frontCard : backCard).join('');
  const footer = title ? `<div class="sheet-title">${escapeHtml(title)}</div>` : '';
  return `<section class="page"><div class="grid">${grid}</div>${cropMarks()}${footer}</section>`;
}

function renderHtml(items, opts) {
  const pageCss = opts.size === 'a4'
    ? '@page { size: A4; margin: 0.59in 0.385in; }'
    : '@page { size: Letter; margin: 0.25in 0.5in; }';

  const pages = [];
  for (let i = 0; i < items.length; i += 9) {
    const chunk = items.slice(i, i + 9);
    while (chunk.length < 9) chunk.push(null);
    pages.push(page(chunk, 'front', opts.title));
    pages.push(page(mirrorRows(chunk), 'back', opts.title));
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${pageCss}
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: "Segoe UI", "Noto Sans", system-ui, sans-serif; color: #3a2a17;
      --ink: #3a2a17; --ink-soft: #6b5233; --leather: #4a3320; --gold: #9c7a34;
      --banner: #3f2a17; --banner-text: #ecd6a4; }
    .page { position: relative; width: 7.5in; height: 10.5in; break-after: page; }
    .page:last-child { break-after: auto; }
    .grid { width: 7.5in; height: 10.5in; font-size: 0; line-height: 0; }
    .crop { position: absolute; background: #000; }
    .sheet-title { position: absolute; left: 0; right: 0; bottom: -0.2in; text-align: center;
      font-size: 6pt; color: #888; letter-spacing: 0.5pt; }

    .card { display: inline-block; vertical-align: top; width: 2.5in; height: 3.5in;
      border: 0.4pt dashed #b8b8b8; overflow: hidden; }
    .card .inner { width: 100%; height: 3.49in; border: 2pt solid var(--leather);
      border-radius: 8pt; overflow: hidden; color: var(--ink);
      background: radial-gradient(ellipse at 50% 38%, #f7edd6 0%, #ecdcb6 58%, #e0cb9e 100%); }

    /* Fixed-height table-cell bands (WeasyPrint has no CSS grid and unreliable
       flex growth with images, so the card interior is laid out with tables). */
    .name { display: table; width: 100%; height: 0.5in; background: var(--banner);
      border-bottom: 1pt solid var(--gold); table-layout: fixed; }
    .name > span { display: table-cell; vertical-align: middle; text-align: center;
      color: var(--banner-text); font-weight: 700; line-height: 1.05; padding: 2pt 5pt;
      letter-spacing: 0.3pt; }
    .front .name > span { font-size: 10pt; }
    .back .name > span { font-size: 9.5pt; }

    .front .art { display: table; width: 100%; height: 2.66in; table-layout: fixed; }
    .front .art > span { display: table-cell; vertical-align: middle; text-align: center; }
    .front .art img { max-width: 2.3in; max-height: 2.5in; }
    .front .no-art { color: #a89a7a; font-size: 8pt; font-style: italic; }

    .front .badge { display: table; width: 100%; height: 0.33in; border-top: 0.75pt solid var(--gold);
      table-layout: fixed; }
    .front .badge > span { display: table-cell; vertical-align: middle; text-align: center;
      font-size: 7.5pt; font-weight: 600; letter-spacing: 0.4pt; text-transform: uppercase;
      color: var(--ink-soft); padding: 0 4pt; }

    .back .stat { height: 0.5in; border-bottom: 0.75pt solid var(--gold); overflow: hidden;
      text-align: center; font-size: 6.4pt; font-style: italic; color: var(--ink-soft);
      padding: 4pt 6pt; line-height: 1.28; }
    .back .stat > span { display: block; }

    .back .desc { height: 2.49in; overflow: hidden; padding: 5pt 7pt; font-size: 7pt;
      line-height: 1.3; text-align: left; }
    .back .desc p { margin: 0 0 4pt; }
    .back .desc p:last-child { margin-bottom: 0; }
  </style></head><body>${pages.join('')}</body></html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const index = buildIndex();

  let slugs = [...args.slugs];
  if (args.fromFile) {
    const lines = fs.readFileSync(args.fromFile, 'utf8').split('\n')
      .map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
    slugs.push(...lines.map(s => s.replace(/\.md$/, '')));
  }

  let items;
  if (slugs.length === 0) {
    items = pickDemoItems(index, 9);
    console.log('No slugs given; auto-selected demo items with artwork:');
    items.forEach(it => console.log(`  - ${it.slug}  (${it.front.title})`));
  } else {
    items = [];
    for (const slug of slugs) {
      const it = index.get(slug);
      if (!it) { console.warn(`  [skip] not found: ${slug}`); continue; }
      items.push(it);
    }
  }

  if (items.length === 0) { console.error('No items to render.'); process.exit(1); }

  if (args.shorten) {
    await shortenDescriptions(items, { model: args.model, targetChars: args.targetChars });
  }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const outPdf = path.resolve(args.out || path.join(REPORTS_DIR, 'item-cards.pdf'));
  const htmlPath = outPdf.replace(/\.pdf$/i, '') + '.html';

  const html = renderHtml(items, { size: args.size, title: args.title });
  fs.writeFileSync(htmlPath, html, 'utf8');

  console.log(`Rendering ${items.length} card(s) -> ${outPdf}`);
  try {
    execFileSync('weasyprint', [htmlPath, outPdf], { stdio: 'inherit' });
  } catch (err) {
    console.error('weasyprint failed. Is it installed? (apt install weasyprint)');
    process.exit(1);
  }

  if (!args.keepHtml) fs.unlinkSync(htmlPath);
  const sheets = Math.ceil(items.length / 9);
  console.log(`Done. ${items.length} item(s), ${sheets} sheet(s), ${sheets * 2} PDF page(s).`);
  console.log('Print double-sided, flip on the long edge, then cut on the card borders.');
}

main().catch((err) => { console.error(err); process.exit(1); });
