#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sessionsDir = path.join(__dirname, '..', 'src', 'hotd-campaign', 'sessions');
const statBlocksDir = path.join(__dirname, '..', 'src', 'hotd-campaign', 'data', 'statBlocks');
const outputDir = path.join(__dirname, '..', 'reports');

// Order: Session 27 first, then monsters, then allies
const sessionFile = 'session27.md';

const monsterFiles = [
  'vasilka.md',
  'stitches.md',
  'flesh_golem_catapult.md',
];

const allyFiles = [
  'ally-brom-martikov.md',
  'ally-emil-toranescu.md',
  'ally-yuri-skander.md',
  'ally-iskander.md',
  'ally-nikolai-wachter-jr.md',
  'ally-doru.md',
  'ally-father-donavich.md',
  'ally-ismark-kolyanovich.md',
  'ally-ireena-kolyana.md',
  'ally-baron-vallakovich.md',
  'ally-baron-krezkov.md',
  'ally-izek-strazni.md',
  'ally-urwin-martikov.md',
  'ally-kasimir-velikov.md',
  'ally-arrigal-vanduva.md',
];

function readMd(filename, dir) {
  const filepath = path.join(dir || statBlocksDir, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`Missing: ${filepath}`);
    return '';
  }
  return fs.readFileSync(filepath, 'utf8').trim();
}

function getTitle(content) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].replace(/[#*_]/g, '').trim() : 'Untitled';
}

// Build Table of Contents
let toc = '# Session 27 — DM Reference Guide\n\n';
toc += '## Table of Contents\n\n';

const sessionContent = readMd(sessionFile, sessionsDir);
const sessionTitle = getTitle(sessionContent);
toc += `### Session Notes\n`;
toc += `- [${sessionTitle}](#session-notes-page)\n\n`;

toc += `### Enemy Stat Blocks\n`;
monsterFiles.forEach(f => {
  const content = readMd(f);
  const title = getTitle(content);
  const anchor = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
  toc += `- [${title}](#${anchor})\n`;
});

toc += `\n### Ally Stat Blocks\n`;
allyFiles.forEach(f => {
  const content = readMd(f);
  const title = getTitle(content);
  const anchor = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, '-');
  toc += `- [${title}](#${anchor})\n`;
});

// Resolve relative image paths from statBlocks dir to absolute paths
const imagesDir = path.join(__dirname, '..', 'src', 'hotd-campaign', 'images');
function resolveImages(content) {
  // Handle <img src="../../images/..."> tags
  content = content.replace(/src="[^"]*images\/([^"]+)"/g, (match, filename) => {
    return `src="${path.join(imagesDir, filename)}"`;
  });
  return content;
}

// Build combined document
let combined = toc;

// Session notes
combined += '\n\n<div class="page">\n\n';
combined += `<a id="session-notes-page"></a>\n\n`;
combined += sessionContent;
combined += '\n\n</div>\n\n';

// Monster pages
monsterFiles.forEach(f => {
  const content = resolveImages(readMd(f));
  combined += '\n\n<div class="page">\n\n';
  combined += content;
  combined += '\n\n</div>\n\n';
});

// Ally pages
allyFiles.forEach(f => {
  const content = resolveImages(readMd(f));
  combined += '\n\n<div class="page">\n\n';
  combined += content;
  combined += '\n\n</div>\n\n';
});

// Write combined markdown
const combinedPath = path.join(outputDir, 'session27-combined.md');
fs.writeFileSync(combinedPath, combined);
console.log(`Combined markdown: ${combinedPath}`);

// Generate PDF with pandoc
const pdfPath = path.join(outputDir, 'session27-dm-guide.pdf');
try {
  execSync(`pandoc "${combinedPath}" -o "${pdfPath}" \
    --pdf-engine=wkhtmltopdf \
    --metadata title="Session 27 - Battle of Tser Hill - DM Guide" \
    --css="${path.join(__dirname, 'session27-pdf.css')}" \
    -V margin-top=15mm \
    -V margin-bottom=15mm \
    -V margin-left=15mm \
    -V margin-right=15mm \
    --standalone`, { stdio: 'inherit' });
  console.log(`PDF generated: ${pdfPath}`);
} catch (err) {
  // Try without CSS if it fails
  console.log('Retrying without custom CSS...');
  execSync(`pandoc "${combinedPath}" -o "${pdfPath}" \
    --pdf-engine=wkhtmltopdf \
    -V margin-top=15mm \
    -V margin-bottom=15mm \
    -V margin-left=15mm \
    -V margin-right=15mm \
    --standalone`, { stdio: 'inherit' });
  console.log(`PDF generated: ${pdfPath}`);
}
