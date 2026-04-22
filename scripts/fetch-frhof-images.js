#!/usr/bin/env node
// Fetch ALL FRHoF book pages and download ALL images
// Pages: intro, character-options, a-guide-to-the-realms, gods-of-faerun,
//        auroras-whole-realms-catalog, magic-of-faerun, factions-of-the-realms, atlas-of-faerun

const fs = require("fs");
const path = require("path");

const COBALT_TOKEN = process.env.DDB_COBALT_TOKEN;
if (!COBALT_TOKEN) { console.error("Set DDB_COBALT_TOKEN env var"); process.exit(1); }

const OUT_DIR = path.join(__dirname, "..", "tmp", "frhof-raw");
const IMG_DIR = path.join(__dirname, "..", "tmp", "frhof-raw", "images");
fs.mkdirSync(IMG_DIR, { recursive: true });

const PAGES = [
  "a-world-of-epic-heroes",
  "character-options",
  "a-guide-to-the-realms",
  "gods-of-faerun",
  "auroras-whole-realms-catalog",
  "magic-of-faerun",
  "factions-of-the-realms",
  "atlas-of-faerun",
  "credits",
];

const cookieHeaders = {
  Cookie: `CobaltSession=${COBALT_TOKEN}`,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
};

function extractImageUrls(html) {
  const urls = new Set();
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = imgRegex.exec(html)) !== null) {
    const src = m[1];
    if (src.includes("media.dndbeyond.com/compendium-images/frhof/")) {
      urls.add(src);
    }
  }
  // Also check for background-image or data-src
  const bgRegex = /(?:data-src|background-image[^)]*url\()["']?([^"')]+frhof[^"')]+)["']?/gi;
  while ((m = bgRegex.exec(html)) !== null) {
    urls.add(m[1]);
  }
  return [...urls];
}

async function downloadImage(url, filename) {
  const outPath = path.join(IMG_DIR, filename);
  if (fs.existsSync(outPath)) {
    console.log(`  SKIP (exists): ${filename}`);
    return;
  }
  try {
    const resp = await fetch(url);
    if (!resp.ok) { console.log(`  FAIL (${resp.status}): ${url}`); return; }
    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(outPath, buffer);
    console.log(`  OK: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`);
  } catch (err) {
    console.log(`  ERROR: ${filename} - ${err.message}`);
  }
}

(async () => {
  const allImageUrls = new Set();

  // Fetch each page
  for (const page of PAGES) {
    const url = `https://www.dndbeyond.com/sources/dnd/frhof/${page}`;
    console.log(`\nFetching: ${page}...`);
    try {
      const resp = await fetch(url, { headers: cookieHeaders });
      if (!resp.ok) {
        console.log(`  Status: ${resp.status} (skipping)`);
        continue;
      }
      const html = await resp.text();
      const outFile = path.join(OUT_DIR, `${page}.html`);
      fs.writeFileSync(outFile, html);
      console.log(`  Saved: ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);

      const imgs = extractImageUrls(html);
      console.log(`  Found ${imgs.length} FRHoF images`);
      for (const img of imgs) allImageUrls.add(img);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Download all images
  const sortedUrls = [...allImageUrls].sort();
  console.log(`\n=== Downloading ${sortedUrls.length} unique images ===\n`);

  // Save image manifest
  fs.writeFileSync(
    path.join(OUT_DIR, "image-manifest.json"),
    JSON.stringify(sortedUrls, null, 2)
  );

  for (const url of sortedUrls) {
    const filename = url.split("/").pop();
    await downloadImage(url, filename);
  }

  console.log(`\n=== Done. ${sortedUrls.length} images processed ===`);
  console.log(`Images in: ${IMG_DIR}`);
})();
