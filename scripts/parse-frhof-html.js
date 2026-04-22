#!/usr/bin/env node
// Parse FRHoF Chapter 2 HTML into structured realm data
// Extracts text content and image URLs for each realm section

const fs = require("fs");
const path = require("path");

const HTML_FILE = path.join(__dirname, "..", "tmp", "frhof-raw", "guide-to-realms-cookie.html");
const OUT_FILE = path.join(__dirname, "..", "tmp", "frhof-raw", "realms-parsed.json");

const html = fs.readFileSync(HTML_FILE, "utf-8");

// Extract the main content area (between the first h1 compendium-hr and the end)
const contentStart = html.indexOf('id="Chapter2AGuidetotheRealms"');
const contentHtml = html.slice(contentStart);

// Find all realm section IDs we care about
const REALM_IDS = [
  "Anauroch", "Aglarond", "Rashemen", "Thay",
  "Damara", "GreatDale", "GreatGlacier", "Impiltur", "Narfell", "Thesk", "TheVast",
  "Cormyr", "TheDalelands", "TheMoonsea", "Sembia",
  "Amn", "Calimshan", "Tethyr",
  "IcewindDale", "KingdomofManyArrows", "TheNorthLordsAlliance", "Luskan", "Menzoberranzan", "NorthernDwarfholds", "SavageFrontier",
  "Chessenta", "Mulhorand", "Unther",
  "SwordCoastLordsAlliance", "BaldursGate", "Elturgard", "Najara", "Waterdeep",
  "Lantan", "Mintarn", "MoonshaeIsles",
  "Chondath", "Sespech", "Turmish", "ShiningPlains", "IndependentCityStates",
  "Chult", "Evermeet", "LakeofSteam", "TheShaar", "Sossal",
];

// Also extract region overview sections
const REGION_IDS = [
  "RegionsoftheRealms", "Anauroch", "AnaurochOverview", "ArcaneEmpires", "ArcaneEmpiresOverview",
  "ForgottenLands", "ForgottenLandsOverview", "Heartlands", "HeartlandsOverview",
  "LandsofIntrigue", "LandsofIntrigueOverview", "TheNorth", "TheNorthOverview",
  "OldEmpires", "OldEmpiresOverview", "SwordCoast", "SwordCoastOverview",
  "TracklessSea", "TracklessSeaOverview", "VilhonReach", "VilhonReachOverview",
  "Beyond",
];

// Strip HTML tags, decode entities
function stripHtml(str) {
  return str
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<h([1-6])[^>]*>/gi, (_, level) => "#".repeat(parseInt(level)) + " ")
    .replace(/<\/?(?:strong|b)>/gi, "**")
    .replace(/<\/?(?:em|i)>/gi, "*")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Extract image URLs from a section
function extractImages(sectionHtml) {
  const imgs = [];
  const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(sectionHtml)) !== null) {
    const src = match[1];
    if (src && !src.includes("pixel") && !src.includes("tracking") && !src.includes("spacer")) {
      imgs.push(src);
    }
  }
  return imgs;
}

// Extract all section IDs from the HTML to build an ordered list
const allIds = [];
const idRegex = /id="([A-Za-z][^"]+)"/g;
let match;
while ((match = idRegex.exec(contentHtml)) !== null) {
  allIds.push(match[1]);
}

// For each realm ID, extract the content between it and the next section
const allSectionIds = [...new Set(allIds)];
const results = {};

for (const realmId of [...REALM_IDS, ...REGION_IDS]) {
  const idIdx = contentHtml.indexOf(`id="${realmId}"`);
  if (idIdx === -1) {
    console.log(`  SKIP: ${realmId} not found`);
    continue;
  }

  // Find the start of this section's element
  const tagStart = contentHtml.lastIndexOf("<", idIdx);

  // Find the next section by looking for the next id= that's in our tracking list
  let endIdx = contentHtml.length;
  const searchFrom = idIdx + realmId.length;

  // Find next heading-level element with an id
  const nextHeadingRegex = /<h[1-4][^>]+id="([^"]+)"/g;
  nextHeadingRegex.lastIndex = searchFrom;
  const nextMatch = nextHeadingRegex.exec(contentHtml);
  if (nextMatch) {
    endIdx = contentHtml.lastIndexOf("<", nextMatch.index);
  }

  const sectionHtml = contentHtml.slice(tagStart, endIdx);
  const text = stripHtml(sectionHtml);
  const images = extractImages(sectionHtml);

  results[realmId] = {
    text: text,
    images: images,
    htmlLength: sectionHtml.length,
    textLength: text.length,
  };

  console.log(`  ${realmId}: ${text.length} chars, ${images.length} images`);
}

fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
console.log(`\nParsed ${Object.keys(results).length} sections to ${OUT_FILE}`);

// Also save a human-readable version
const readableFile = path.join(__dirname, "..", "tmp", "frhof-raw", "realms-readable.md");
let md = "# FRHoF Chapter 2: A Guide to the Realms\n\n";
for (const [id, data] of Object.entries(results)) {
  md += `---\n\n## ${id}\n\n`;
  if (data.images.length) {
    md += `Images: ${data.images.join(", ")}\n\n`;
  }
  md += data.text + "\n\n";
}
fs.writeFileSync(readableFile, md);
console.log(`Readable version: ${readableFile}`);
