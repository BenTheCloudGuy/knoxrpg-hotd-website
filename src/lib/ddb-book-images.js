// ══════════════════════════════════════════════════════════════
// ── D&D BEYOND BOOK IMAGE EXTRACTOR ───────────────────────────
// For an owned book (source code), discovers the book's reader pages,
// scrapes every compendium image (art + battle/region maps) it is
// entitled to, downloads the bytes with the cobalt session, and stores
// them in the app's asset store (uploads PVC → served at /hotd-content/…,
// backed up to the Storage Account) under ddb-books/{code}/{art|maps}/.
//
// Same proven approach as scripts/fetch-frhof-images.js / fetch-menzo-images.js,
// generalized to any owned book and wired to the Storage Account. A
// `ddb_book_images` row per image gives a queryable manifest + idempotency
// (already-downloaded URLs are skipped).
// ══════════════════════════════════════════════════════════════

const ddbClient = require("./ddb-client");
const azure = require("./azure");

const BASE = "https://www.dndbeyond.com";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

function mimeFor(name) {
  const e = (name.split(".").pop() || "").toLowerCase();
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" }[e] || "application/octet-stream";
}
// A URL is a "map" if its filename is map-*, *-map*, or lives under a /map/ path.
function classify(url) {
  const file = url.split("/").pop().split("?")[0];
  if (/(^|[-_/])map[-_.]/i.test(file) || /\/maps?\//i.test(url)) return "maps";
  return "art";
}

// Derive a readable display name from a DDB image filename.
function prettyName(filename, kind) {
  let base = filename.replace(/\.[a-z0-9]+$/i, "");
  let player = false;
  if (kind === "maps") {
    if (/-player$/i.test(base)) { player = true; base = base.replace(/-player$/i, ""); }
    base = base.replace(/^map[-_.]/i, "");
  }
  base = base.replace(/^[0-9]+([.\-][0-9]+)*[.\-]?/, ""); // strip leading numeric prefixes (05.01-, 01-001.)
  base = base.replace(/[-_.]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
  if (!base) base = filename;
  return player ? `${base} (Player)` : base;
}

// Publish a stored image into the site galleries (hotd_maps / hotd_art) so it
// shows up automatically under Game Info → Maps / Art & Images. Idempotent by
// image_url (safe on re-runs / force). Returns true if a row was inserted.
async function publishToGallery(pgPool, kind, name, desc, url) {
  const q = kind === "maps"
    ? `INSERT INTO hotd_maps (name, description, image_url, sort_order)
         SELECT $1,$2,$3,0 WHERE NOT EXISTS (SELECT 1 FROM hotd_maps WHERE image_url=$3) RETURNING id`
    : `INSERT INTO hotd_art (title, description, image_url, sort_order)
         SELECT $1,$2,$3,0 WHERE NOT EXISTS (SELECT 1 FROM hotd_art WHERE image_url=$3) RETURNING id`;
  const r = await pgPool.query(q, [name, desc, url]);
  return r.rowCount > 0;
}

async function getHtml(url, cookie) {
  const r = await fetch(url, { headers: { Cookie: `CobaltSession=${cookie}`, "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" }, redirect: "follow" });
  return { status: r.status, finalUrl: r.url, ok: r.ok, html: r.ok ? await r.text() : "" };
}

// Discover the book's reader sub-pages (fragment anchors stripped, deduped).
function discoverPages(html, code) {
  const set = new Set();
  const re = new RegExp('href="((?:' + BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ')?/sources/(?:dnd/)?' + code + '/[^"?#]+)', "gi");
  let m;
  while ((m = re.exec(html))) { let u = m[1]; if (!u.startsWith("http")) u = BASE + u; set.add(u); }
  return [...set];
}

// Extract this book's compendium/attachment image URLs from a page. We accept
// any /compendium-images/{prefix}/… on the book's own pages (the image prefix
// often differs from the source code — e.g. book `mm-2024` uses `/mm/`), and
// skip UI chrome (/…/ui/) and site assets.
function extractImages(html) {
  const urls = new Set();
  for (const m of html.matchAll(/https:\/\/media\.dndbeyond\.com\/(?:compendium-images|attachments)\/[^\s"')\\]+/gi)) {
    const u = m[0].replace(/&amp;/g, "&").split("#")[0];
    if (/\/compendium-images\/[^/]+\/ui\//i.test(u)) continue; // TOC / chrome
    if (!/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u)) continue;
    urls.add(u);
  }
  return [...urls];
}

// ── DB manifest ───────────────────────────────────────────────
async function ensureTable(pgPool) {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS ddb_book_images (
      id SERIAL PRIMARY KEY,
      book_code TEXT NOT NULL,
      filename TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'art',
      source_url TEXT NOT NULL UNIQUE,
      storage_path TEXT,
      bytes INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pgPool.query("CREATE INDEX IF NOT EXISTS idx_ddb_book_images_book ON ddb_book_images (book_code, kind)");
}

// Scrape-only: discover a book's reader pages and gather its image URLs
// (no downloads, no DB writes). Returns { title, pages, imageUrls }.
async function scanBook(cookie, code, opts = {}) {
  const log = typeof opts.onLog === "function" ? opts.onLog : () => {};
  const maxPages = opts.maxPages || 80;
  // 1. Landing page (try /sources/dnd/{code}, then /sources/{code}).
  let landing = await getHtml(`${BASE}/sources/dnd/${code}`, cookie);
  if (!landing.ok || /marketplace/.test(landing.finalUrl)) landing = await getHtml(`${BASE}/sources/${code}`, cookie);
  if (!landing.ok || /marketplace/.test(landing.finalUrl)) { const e = new Error(`Book "${code}" not accessible (not owned or has no reader pages)`); e.reason = "book-not-owned"; throw e; }
  const title = ((landing.html.match(/<title>([^<]+)<\/title>/i) || [])[1] || code).split(/\s+[-|]\s+/)[0].trim() || code;
  // Some codes redirect to a newer edition (e.g. mm -> mm-2024); discover
  // sub-pages using the code in the FINAL url so we don't miss the reader.
  const finalCode = (landing.finalUrl.match(/\/sources\/(?:dnd\/)?([^/?#]+)/) || [])[1] || code;

  // 2. Pages = landing + discovered sub-pages.
  const uniquePages = [...new Set([landing.finalUrl, ...discoverPages(landing.html, finalCode)])].slice(0, maxPages);
  log(`${code}: ${uniquePages.length} reader page(s)`);

  // 3. Gather all image URLs across pages.
  const imageUrls = new Set();
  extractImages(landing.html).forEach((u) => imageUrls.add(u));
  let scanned = 1;
  for (const p of uniquePages) {
    if (p === landing.finalUrl) continue;
    try { const r = await getHtml(p, cookie); extractImages(r.html).forEach((u) => imageUrls.add(u)); }
    catch (_) { /* skip a bad page */ }
    if (++scanned % 10 === 0) log(`  scanned ${scanned}/${uniquePages.length} pages, ${imageUrls.size} images so far`);
  }
  log(`${code}: ${imageUrls.size} unique image(s) found`);
  return { title, pages: uniquePages.length, imageUrls: [...imageUrls] };
}

// Download + store every image for `code`. opts: { onLog?, uploader?, maxPages?, force? }
async function downloadBookImages(pgPool, code, opts = {}) {
  const log = typeof opts.onLog === "function" ? opts.onLog : () => {};
  const uploader = opts.uploader || azure.uploadBlobToStorage;
  await ensureTable(pgPool);
  const cookie = await ddbClient.getCobaltToken();
  if (!cookie) { const e = new Error("No DDB cobalt token available"); e.reason = "ddb-token-missing"; throw e; }

  const scan = await scanBook(cookie, code, opts);
  const bookTitle = scan.title;
  const imageUrls = scan.imageUrls;

  // 4. Skip already-downloaded (unless force).
  const result = { book: code, title: bookTitle, pages: scan.pages, found: imageUrls.length, art: 0, maps: 0, uploaded: 0, published: 0, skipped: 0, failed: 0 };
  let known = new Set();
  if (!opts.force) {
    const { rows } = await pgPool.query("SELECT source_url FROM ddb_book_images WHERE book_code=$1", [code]);
    known = new Set(rows.map((r) => r.source_url));
  }

  // 5. Download + store each image, then publish it to the site galleries.
  const publish = opts.publish !== false;
  for (const url of imageUrls) {
    if (known.has(url)) { result.skipped++; continue; }
    const kind = classify(url);
    const filename = url.split("/").pop().split("?")[0];
    try {
      const resp = await fetch(url, { headers: { Cookie: `CobaltSession=${cookie}`, "User-Agent": UA } });
      if (!resp.ok) { result.failed++; continue; }
      const buf = Buffer.from(await resp.arrayBuffer());
      const storagePath = await uploader(filename, buf, mimeFor(filename), "hotd-website-content", `ddb-books/${code}/${kind}`);
      await pgPool.query(
        `INSERT INTO ddb_book_images (book_code, filename, kind, source_url, storage_path, bytes)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (source_url) DO UPDATE SET filename=$2, kind=$3, storage_path=$5, bytes=$6`,
        [code, filename, kind, url, storagePath, buf.length]
      );
      result.uploaded++; result[kind]++;
      if (publish && await publishToGallery(pgPool, kind, prettyName(filename, kind), `From ${bookTitle} (D&D Beyond)`, storagePath)) result.published++;
    } catch (_) { result.failed++; }
  }
  log(`${code}: stored ${result.uploaded} (${result.art} art, ${result.maps} maps), published ${result.published} to galleries, skipped ${result.skipped}, failed ${result.failed}`);
  return result;
}

module.exports = { downloadBookImages, scanBook, ensureTable, classify };
