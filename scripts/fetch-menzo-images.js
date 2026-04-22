#!/usr/bin/env node
// Fetch Menzoberranzan images from DDB sources
// Out of the Abyss (oota) chapter 15 "The City of Spiders" has the map
// Also check Menzoberranzan sourcebook images

const fs = require('fs');
const path = require('path');

const COBALT_TOKEN = process.env.DDB_COBALT_TOKEN;
if (!COBALT_TOKEN) { console.error('Set DDB_COBALT_TOKEN env var'); process.exit(1); }

const OUT_DIR = path.join(__dirname, '..', 'tmp', 'menzo-raw');
const IMG_DIR = path.join(__dirname, '..', 'tmp', 'menzo-raw', 'images');
fs.mkdirSync(IMG_DIR, { recursive: true });

const cookieHeaders = {
  Cookie: `CobaltSession=${COBALT_TOKEN}`,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
};

// DDB pages that have Menzoberranzan content
const PAGES = [
  { url: 'https://www.dndbeyond.com/sources/dnd/oota/the-city-of-spiders', name: 'oota-city-of-spiders' },
  { url: 'https://www.dndbeyond.com/sources/dnd/oota/menzoberranzan-besieged', name: 'oota-menzo-besieged' },
  { url: 'https://www.dndbeyond.com/sources/dnd/bgdia/avernus', name: 'bgdia-avernus' },  // might have drow content
];

function extractImageUrls(html) {
  const urls = new Set();
  // Match any DDB compendium image
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = imgRegex.exec(html)) !== null) {
    const src = m[1];
    if (src.includes('media.dndbeyond.com/compendium-images/')) {
      urls.add(src);
    }
  }
  // Also check data-src and background-image
  const dataSrcRegex = /data-src="([^"]+compendium-images[^"]+)"/gi;
  while ((m = dataSrcRegex.exec(html)) !== null) {
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
    if (!resp.ok) { console.log(`  FAIL (${resp.status}): ${filename}`); return; }
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log(`  OK: ${filename} (${(buf.length / 1024).toFixed(0)}KB)`);
  } catch (e) {
    console.log(`  ERR: ${filename} - ${e.message}`);
  }
}

async function fetchPage(url, name) {
  console.log(`\nFetching ${name}...`);
  try {
    const resp = await fetch(url, { headers: cookieHeaders, redirect: 'follow' });
    console.log(`  Status: ${resp.status}, URL: ${resp.url}`);
    if (!resp.ok) {
      console.log(`  Failed to fetch (${resp.status})`);
      return [];
    }
    // Check if redirected to marketplace
    if (resp.url.includes('marketplace')) {
      console.log(`  Redirected to marketplace - book not owned`);
      return [];
    }
    const html = await resp.text();
    fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), html);
    console.log(`  HTML: ${(html.length / 1024).toFixed(0)}KB`);
    const imgs = extractImageUrls(html);
    console.log(`  Found ${imgs.length} images`);
    return imgs;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return [];
  }
}

async function main() {
  const allImages = new Set();

  for (const page of PAGES) {
    const imgs = await fetchPage(page.url, page.name);
    imgs.forEach(u => allImages.add(u));
  }

  // Also try direct search for known Menzoberranzan map URLs
  const knownUrls = [
    'https://media.dndbeyond.com/compendium-images/oota/YSbkAOwO6il8Blql/map-15.01-menzoberranzan.jpg',
    'https://media.dndbeyond.com/compendium-images/oota/YSbkAOwO6il8Blql/15-01.menzoberranzan.jpg',
  ];
  for (const url of knownUrls) {
    allImages.add(url);
  }

  console.log(`\n=== Downloading ${allImages.size} images ===`);
  const manifest = [...allImages];
  fs.writeFileSync(path.join(OUT_DIR, 'image-manifest.json'), JSON.stringify(manifest, null, 2));

  for (const url of manifest) {
    const filename = path.basename(new URL(url).pathname);
    await downloadImage(url, filename);
  }

  console.log('\nDone!');
}

main();
