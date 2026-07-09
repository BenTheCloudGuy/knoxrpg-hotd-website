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
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'items');
const IMAGES_DIR = path.join(ITEMS_DIR, 'magic-items', 'images');
const REPORTS_DIR = path.join(ROOT, 'reports');

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
  const args = { slugs: [], out: null, title: null, size: 'letter', fromFile: null, keepHtml: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--items') args.slugs.push(...argv[++i].split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--size') args.size = argv[++i].toLowerCase();
    else if (a === '--from-file') args.fromFile = argv[++i];
    else if (a === '--keep-html') args.keepHtml = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (a.startsWith('--')) { console.error(`Unknown arg: ${a}`); printHelp(); process.exit(1); }
    else args.slugs.push(a.replace(/\.md$/, '').trim());
  }
  if (!['letter', 'a4'].includes(args.size)) {
    console.error(`Unknown size: ${args.size}. Use letter or a4.`);
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
  -h, --help              Show this help.

  With no slugs, 9 items that already have artwork are auto-selected as a demo.
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

// Turn the item body into a compact HTML blurb suitable for a tiny card back.
function descriptionHtml(body) {
  let text = body;
  text = text.replace(/^#\s+.*$/m, '');               // drop the H1 title
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '');    // drop image markdown
  // Drop the auto-generated "Applicable Weapons" pseudo-table and anything after.
  text = text.replace(/\n\s*Applicable\s+\w+:?[\s\S]*$/i, '');
  const paras = text
    .split(/\n{2,}/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p && p.length > 1);
  return paras
    .map(p => `<p>${escapeHtml(p).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>`)
    .join('');
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
const RARITY_CLASS = {
  common: 'common', uncommon: 'uncommon', rare: 'rare',
  'very rare': 'very-rare', legendary: 'legendary', artifact: 'artifact',
};
function rarityClass(r) {
  return RARITY_CLASS[String(r || '').toLowerCase().trim()] || 'unknown';
}

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
  const rc = rarityClass(item.front.rarity);
  const imgAbs = resolveImageAbs(item);
  const art = imgAbs
    ? `<img src="${imageDataUri(imgAbs)}" alt="">`
    : '<em class="no-art">No art</em>';
  const badgeBits = [item.front.rarity, humanizeType(item.front.type)].filter(Boolean).map(escapeHtml);
  return `<div class="card front rarity-${rc}"><div class="inner">
    <div class="name"><span>${escapeHtml(item.front.title || item.slug)}</span></div>
    <div class="art"><span>${art}</span></div>
    <div class="badge"><span>${badgeBits.join(' &middot; ')}</span></div>
  </div></div>`;
}

function backCard(item) {
  if (!item) return '<div class="card"></div>';
  const rc = rarityClass(item.front.rarity);
  return `<div class="card back rarity-${rc}"><div class="inner">
    <div class="name"><span>${escapeHtml(item.front.title || item.slug)}</span></div>
    <div class="stat"><span>${statLine(item.front)}</span></div>
    <div class="desc">${descriptionHtml(item.body)}</div>
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
    body { font-family: "Segoe UI", "Noto Sans", system-ui, sans-serif; color: #1a1a1a; }
    .page { position: relative; width: 7.5in; height: 10.5in; break-after: page; }
    .page:last-child { break-after: auto; }
    .grid { width: 7.5in; height: 10.5in; font-size: 0; line-height: 0; }
    .crop { position: absolute; background: #000; }
    .sheet-title { position: absolute; left: 0; right: 0; bottom: -0.2in; text-align: center;
      font-size: 6pt; color: #888; letter-spacing: 0.5pt; }

    .card { display: inline-block; vertical-align: top; width: 2.5in; height: 3.5in;
      border: 0.4pt dashed #b8b8b8; overflow: hidden; }
    .card .inner { width: 100%; height: 3.49in; border: 1.5pt solid var(--rc, #444);
      border-radius: 7pt; overflow: hidden; background: #fff; }

    /* Rarity accents (D&D convention) */
    .rarity-common    { --rc: #6b6b6b; }
    .rarity-uncommon  { --rc: #1a7f37; }
    .rarity-rare      { --rc: #1f6feb; }
    .rarity-very-rare { --rc: #8250df; }
    .rarity-legendary { --rc: #bf8700; }
    .rarity-artifact  { --rc: #a40e26; }
    .rarity-unknown   { --rc: #444444; }

    /* Fixed-height table-cell bands (WeasyPrint has no CSS grid and unreliable
       flex growth with images, so the card interior is laid out with tables). */
    .name { display: table; width: 100%; height: 0.5in; background: var(--rc); table-layout: fixed; }
    .name > span { display: table-cell; vertical-align: middle; text-align: center; color: #fff;
      font-weight: 700; line-height: 1.05; padding: 2pt 5pt; }
    .front .name > span { font-size: 10pt; }
    .back .name > span { font-size: 9.5pt; }

    .front .art { display: table; width: 100%; height: 2.66in; table-layout: fixed; }
    .front .art > span { display: table-cell; vertical-align: middle; text-align: center; }
    .front .art img { max-width: 2.3in; max-height: 2.5in; }
    .front .no-art { color: #bbb; font-size: 8pt; font-style: italic; }

    .front .badge { display: table; width: 100%; height: 0.33in; border-top: 0.5pt solid #e2e2e2;
      table-layout: fixed; }
    .front .badge > span { display: table-cell; vertical-align: middle; text-align: center;
      font-size: 7.5pt; font-weight: 600; letter-spacing: 0.4pt; text-transform: uppercase;
      color: var(--rc); padding: 0 4pt; }

    .back .stat { height: 0.5in; border-bottom: 0.5pt solid #e2e2e2; overflow: hidden;
      text-align: center; font-size: 6.4pt; font-style: italic; color: #444;
      padding: 4pt 6pt; line-height: 1.28; }
    .back .stat > span { display: block; }

    .back .desc { height: 2.49in; overflow: hidden; padding: 5pt 7pt; font-size: 6.8pt;
      line-height: 1.28; text-align: left; }
    .back .desc p { margin: 0 0 3.5pt; }
    .back .desc p:last-child { margin-bottom: 0; }
  </style></head><body>${pages.join('')}</body></html>`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
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

main();
