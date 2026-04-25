#!/usr/bin/env node
// Restructures stat block markdown files:
// - Portrait image floated LEFT
// - Primary stats (type through CR) to the RIGHT
// - Traits, Actions, Spells, etc. below
// - DM Notes at the very bottom

const fs = require('fs');
const path = require('path');

const statDir = path.join(__dirname, '..', 'src', 'hotd-campaign', 'data', 'statBlocks');

// Map filenames to portrait images
const portraitMap = {
  'ally-arrigal-vanduva.md': 'arrigal.png',
  'ally-baron-krezkov.md': 'baron-krezkov.png',
  'ally-baron-vallakovich.md': 'baron-vallakovich.png',
  'ally-brom-martikov.md': 'brom-martikov.png',
  'ally-doru.md': 'doru.png',
  'ally-emil-toranescu.md': 'emil-toranescu.png',
  'ally-father-donavich.md': 'father-donavich.png',
  'ally-ireena-kolyana.md': 'ireena-kolyana.png',
  'ally-iskander.md': 'iskander.png',
  'ally-ismark-kolyanovich.md': 'ismark-kolyanovich.png',
  'ally-izek-strazni.md': 'izek-strazni.png',
  'ally-kasimir-velikov.md': 'kasimir-velikov.png',
  'ally-nikolai-wachter-jr.md': 'nikolai-wachter-jr.png',
  'ally-urwin-martikov.md': 'urwin-martikov.png',
  'ally-yuri-skander.md': 'yuri-skander.png',
  'vasilka.md': 'vasilka.png',
};

// Stat blocks without individual NPC portraits (creature collections)
const skipFiles = ['stitches.md', 'flesh_golem_catapult.md'];

function processFile(filename) {
  const filepath = path.join(statDir, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n');

  // Extract title line (# Name — Title)
  const titleIdx = lines.findIndex(l => /^#\s/.test(l));
  if (titleIdx === -1) {
    console.log(`  Skipping ${filename}: no title found`);
    return;
  }
  const titleLine = lines[titleIdx];

  // Find the sections:
  // 1. Header block: everything from type line through CR/Proficiency line
  // 2. Body: Traits, Spellcasting, Actions, Reactions, etc.
  // 3. DM Notes: ## DM Notes section

  // Find type line (starts with *)
  const typeIdx = lines.findIndex((l, i) => i > titleIdx && /^\*[A-Z]/.test(l.trim()));

  // Find where primary stats end: the line with "Challenge" or "Proficiency Bonus"
  let statsEndIdx = -1;
  for (let i = typeIdx; i < lines.length; i++) {
    if (lines[i].includes('**Challenge**') || lines[i].includes('**Proficiency Bonus**')) {
      statsEndIdx = i;
      break;
    }
  }

  if (typeIdx === -1 || statsEndIdx === -1) {
    console.log(`  Skipping ${filename}: couldn't parse stat block structure`);
    return;
  }

  // Extract stat lines (type through CR), trim trailing ---
  let statLines = lines.slice(typeIdx, statsEndIdx + 1);
  // Skip any trailing --- after CR line
  let afterStatsIdx = statsEndIdx + 1;
  while (afterStatsIdx < lines.length && lines[afterStatsIdx].trim() === '---') {
    afterStatsIdx++;
  }
  // Skip blank lines
  while (afterStatsIdx < lines.length && lines[afterStatsIdx].trim() === '') {
    afterStatsIdx++;
  }

  // Find DM Notes section
  let dmNotesIdx = lines.findIndex((l, i) => i >= afterStatsIdx && /^##\s+DM\s+Notes/i.test(l.trim()));
  
  // Body = everything between stats end and DM Notes (or end of file)
  let bodyLines, dmNotesLines;
  if (dmNotesIdx !== -1) {
    bodyLines = lines.slice(afterStatsIdx, dmNotesIdx);
    dmNotesLines = lines.slice(dmNotesIdx);
  } else {
    bodyLines = lines.slice(afterStatsIdx);
    dmNotesLines = [];
  }

  // Clean up trailing blank lines from body
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
    bodyLines.pop();
  }

  // Build the portrait path
  const portrait = portraitMap[filename];
  const imgPath = `../../images/${portrait}`;

  // Build the new layout using an HTML table for portrait + stats
  const statsHtml = statLines.join('\n');

  const output = [];
  output.push(titleLine);
  output.push('');
  output.push('<table><tr>');
  output.push(`<td width="300" valign="top" style="padding-right: 16px;">`);
  output.push(`<img src="${imgPath}" alt="Portrait" width="300" />`);
  output.push('</td>');
  output.push('<td valign="top">');
  output.push('');
  statLines.forEach(l => output.push(l));
  output.push('');
  output.push('</td>');
  output.push('</tr></table>');
  output.push('');
  output.push('---');
  output.push('');

  // Body sections
  bodyLines.forEach(l => output.push(l));

  // DM Notes at the very bottom
  if (dmNotesLines.length > 0) {
    output.push('');
    dmNotesLines.forEach(l => output.push(l));
  }

  fs.writeFileSync(filepath, output.join('\n'));
  console.log(`  Updated: ${filename}`);
}

const files = fs.readdirSync(statDir).filter(f => f.endsWith('.md'));
console.log(`Processing ${files.length} stat block files...\n`);

files.forEach(filename => {
  if (skipFiles.includes(filename)) {
    console.log(`  Skipped (creature collection): ${filename}`);
    return;
  }
  if (!portraitMap[filename]) {
    console.log(`  Skipped (no portrait mapped): ${filename}`);
    return;
  }
  processFile(filename);
});

console.log('\nDone.');
