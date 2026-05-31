#!/usr/bin/env node
/**
 * build-session-pdf.js
 *
 * Convert a session prep markdown into a PDF using the established session27
 * DM-guide formatting (Segoe UI 10pt, A4 portrait, 15mm margins). The PDF reads
 * cleanly on the Kindle Scribe but is also print-ready for a DM binder.
 *
 * Usage:
 *   node scripts/build-session-pdf.js 29
 *   node scripts/build-session-pdf.js --session 29 --out reports/session29.pdf
 *   node scripts/build-session-pdf.js 29 --statblocks vasilka,stitches,ally-emil-toranescu
 *   node scripts/build-session-pdf.js 29 --include-allies --include-monsters
 *   node scripts/build-session-pdf.js 29 --size letter   (a4 default; a5 | b5 | letter)
 *
 * Requires: pandoc + wkhtmltopdf (apt: pandoc wkhtmltopdf).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SESSIONS_DIR = path.join(ROOT, 'src', 'hotd-campaign', 'sessions');
const STATBLOCKS_DIR = path.join(ROOT, 'src', 'hotd-campaign', 'data', 'statBlocks');
const IMAGES_DIR = path.join(ROOT, 'src', 'hotd-campaign', 'images');
const REPORTS_DIR = path.join(ROOT, 'reports');
const CSS_PATH = path.join(__dirname, 'session-pdf.css');

function parseArgs(argv) {
  const args = { session: null, out: null, statblocks: [], includeAllies: false, includeMonsters: false, size: null, keepMd: false, engine: 'weasyprint', notes: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--session') args.session = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--statblocks') args.statblocks = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--include-allies') args.includeAllies = true;
    else if (a === '--include-monsters') args.includeMonsters = true;
    else if (a === '--size') args.size = argv[++i].toLowerCase();
    else if (a === '--engine') args.engine = argv[++i].toLowerCase();
    else if (a === '--notes') args.notes = parseInt(argv[++i], 10);
    else if (a === '--no-notes') args.notes = 0;
    else if (a === '--keep-md') args.keepMd = true;
    else if (/^\d+$/.test(a) && !args.session) args.session = a;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else { console.error(`Unknown arg: ${a}`); printHelp(); process.exit(1); }
  }
  if (!args.session) { printHelp(); process.exit(1); }
  if (!['weasyprint', 'wkhtmltopdf'].includes(args.engine)) {
    console.error(`Unknown engine: ${args.engine}. Use weasyprint or wkhtmltopdf.`);
    process.exit(1);
  }
  if (!Number.isInteger(args.notes) || args.notes < 0) {
    console.error(`--notes must be a non-negative integer (got ${args.notes})`);
    process.exit(1);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/build-session-pdf.js <sessionNumber> [options]

Options:
  --session N            Session number (also accepted as positional arg)
  --out PATH             Output PDF path (default reports/sessionNN-dm-guide.pdf)
  --statblocks a,b,c     Comma list of statBlock filenames (without .md) to append
  --include-allies       Auto-include all ally-*.md files in data/statBlocks
  --include-monsters     Auto-include non-ally stat block files (monsters)
  --size SIZE            Page size override: a4 (default) | a5 | b5 | letter
  --engine ENGINE        PDF engine: weasyprint (default) | wkhtmltopdf
  --notes N              Append N blank Notes pages to the end (default 4)
  --no-notes             Skip the trailing Notes pages
  --keep-md              Keep the combined intermediate markdown file
  -h, --help             Show this help
`);
}

function readMd(filepath) {
  if (!fs.existsSync(filepath)) {
    console.warn(`  [skip] missing: ${filepath}`);
    return '';
  }
  return fs.readFileSync(filepath, 'utf8').trim();
}

function getTitle(content) {
  const m = content.match(/^#\s+(.+)/m);
  return m ? m[1].replace(/[#*_]/g, '').trim() : 'Untitled';
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().replace(/\s+/g, '-');
}

function resolveImagePaths(content) {
  // <img src="../../images/foo.png"> or markdown ![](../../images/foo.png)
  content = content.replace(/src=["']([^"']*images\/[^"']+)["']/g, (_m, p) => {
    const file = path.basename(p);
    return `src="${path.join(IMAGES_DIR, file)}"`;
  });
  content = content.replace(/!\[([^\]]*)\]\(([^)]*images\/[^)]+)\)/g, (_m, alt, p) => {
    const file = path.basename(p);
    return `![${alt}](${path.join(IMAGES_DIR, file)})`;
  });
  return content;
}

function listStatBlocks() {
  if (!fs.existsSync(STATBLOCKS_DIR)) return { allies: [], monsters: [] };
  const files = fs.readdirSync(STATBLOCKS_DIR).filter(f => f.endsWith('.md')).sort();
  return {
    allies: files.filter(f => f.startsWith('ally-')),
    monsters: files.filter(f => !f.startsWith('ally-')),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const n = String(parseInt(args.session, 10));
  if (!/^\d+$/.test(n)) { console.error(`Invalid session number: ${args.session}`); process.exit(1); }

  const sessionFile = path.join(SESSIONS_DIR, `session${n}.md`);
  if (!fs.existsSync(sessionFile)) { console.error(`Session file not found: ${sessionFile}`); process.exit(1); }

  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const sessionContent = resolveImagePaths(readMd(sessionFile));
  const sessionTitle = getTitle(sessionContent);
  console.log(`Building PDF for: ${sessionTitle}`);

  // Resolve which stat blocks to append
  const statBlockFiles = new Set();
  args.statblocks.forEach(s => statBlockFiles.add(s.endsWith('.md') ? s : `${s}.md`));
  if (args.includeAllies || args.includeMonsters) {
    const { allies, monsters } = listStatBlocks();
    if (args.includeAllies) allies.forEach(f => statBlockFiles.add(f));
    if (args.includeMonsters) monsters.forEach(f => statBlockFiles.add(f));
  }
  const orderedStatBlocks = Array.from(statBlockFiles);

  // Build combined doc with TOC. The session title (which already includes
  // "Session N") is the only H1 at the top to avoid "Session 29 - Session 29"
  // duplication when pandoc renders the title.
  let combined = `# ${sessionTitle}\n\n`;
  combined += '## Table of Contents\n\n';
  combined += `### Session Notes\n- [${sessionTitle}](#session-body)\n`;

  const statBlockEntries = orderedStatBlocks.map(f => {
    const c = readMd(path.join(STATBLOCKS_DIR, f));
    return { file: f, content: c, title: getTitle(c), anchor: slugify(getTitle(c)) };
  }).filter(e => e.content);

  const monsters = statBlockEntries.filter(e => !e.file.startsWith('ally-'));
  const allies = statBlockEntries.filter(e => e.file.startsWith('ally-'));

  if (monsters.length) {
    combined += `\n### Enemy Stat Blocks\n`;
    monsters.forEach(e => { combined += `- [${e.title}](#${e.anchor})\n`; });
  }
  if (allies.length) {
    combined += `\n### Ally Stat Blocks\n`;
    allies.forEach(e => { combined += `- [${e.title}](#${e.anchor})\n`; });
  }

  // Session body
  combined += `\n\n<div class="page">\n\n<a id="session-body"></a>\n\n`;
  combined += sessionContent;
  combined += `\n\n</div>\n`;

  // Stat block pages
  [...monsters, ...allies].forEach(e => {
    combined += `\n\n<div class="page">\n\n`;
    combined += resolveImagePaths(e.content);
    combined += `\n\n</div>\n`;
  });

  // Blank Notes pages at the end for Kindle Scribe handwriting.
  // Each page starts with a "Notes" heading and otherwise leaves the page
  // empty so the Scribe pen has clean space to write on.
  for (let i = 0; i < args.notes; i++) {
    combined += `\n\n<div class="page notes-page">\n\n# Notes\n\n</div>\n`;
  }

  const combinedPath = path.join(REPORTS_DIR, `session${n}-combined.md`);
  fs.writeFileSync(combinedPath, combined);
  console.log(`Combined markdown: ${combinedPath}`);

  // Page size flags for wkhtmltopdf via pandoc. Default = A4 (wkhtmltopdf default,
  // matches the established session27 PDF). Pass --size to override.
  const sizeMap = { b5: 'B5', a5: 'A5', a4: 'A4', letter: 'Letter' };
  const pageSize = args.size ? sizeMap[args.size] : null;

  const outPath = args.out
    ? path.resolve(args.out)
    : path.join(REPORTS_DIR, `session${n}-dm-guide.pdf`);

  const cssArg = fs.existsSync(CSS_PATH) ? `--css="${CSS_PATH}"` : '';

  // Engine selection:
  //   weasyprint (default): proper CSS3 paged-media. Honors page-break-inside
  //     on <li>, blockquotes, tables. This is what prevents the bullet-split-
  //     across-pages bug that the legacy wkhtmltopdf engine has on unpatched Qt.
  //   wkhtmltopdf (fallback): kept for hosts without weasyprint installed.
  //     Page-break rules are unreliable here; expect some mid-list cuts.

  let cmd;
  if (args.engine === 'weasyprint') {
    // Two-step: pandoc -> standalone HTML, then weasyprint HTML -> PDF.
    // Pandoc's direct --pdf-engine=weasyprint path swallows the --css flag in
    // some 3.x builds; the two-step pipeline is the reliable invocation.
    const htmlPath = combinedPath.replace(/\.md$/, '.html');
    // pandoc -V title is intentionally omitted: the combined.md already starts
    // with the session title as its own H1. pagetitle sets the HTML <title>
    // tag without injecting a visible heading.
    const pandocCmd = [
      `pandoc "${combinedPath}"`,
      `-o "${htmlPath}"`,
      `--metadata pagetitle="${sessionTitle.replace(/"/g, '\\"')}"`,
      `--standalone`,
      cssArg,
    ].filter(Boolean).join(' ');
    execSync(pandocCmd, { stdio: 'inherit' });
    // weasyprint reads page geometry from the @page rule in the CSS
    cmd = `weasyprint "${htmlPath}" "${outPath}"`;
    // Clean up the intermediate HTML after weasyprint runs
    try {
      execSync(cmd, { stdio: 'inherit' });
      if (!args.keepMd) {
        try { fs.unlinkSync(htmlPath); } catch (_) {}
      }
      console.log(`\nPDF generated: ${outPath}`);
      const stat = fs.statSync(outPath);
      console.log(`Size: ${(stat.size / 1024).toFixed(1)} KB`);
    } finally {
      if (!args.keepMd) {
        try { fs.unlinkSync(combinedPath); } catch (_) {}
      }
    }
    return;
  }

  // wkhtmltopdf path (fallback)
  cmd = [
    `pandoc "${combinedPath}"`,
    `-o "${outPath}"`,
    `--pdf-engine=wkhtmltopdf`,
    `--metadata pagetitle="${sessionTitle.replace(/"/g, '\\"')}"`,
    cssArg,
    pageSize ? `-V papersize=${pageSize}` : '',
    `-V margin-top=15mm`,
    `-V margin-bottom=15mm`,
    `-V margin-left=15mm`,
    `-V margin-right=15mm`,
    `--standalone`,
  ].filter(Boolean).join(' ');

  try {
    execSync(cmd, { stdio: 'inherit' });
    console.log(`\nPDF generated: ${outPath}`);
    const stat = fs.statSync(outPath);
    console.log(`Size: ${(stat.size / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.error('\npandoc failed. Retrying without custom CSS...');
    const fallback = cmd.replace(cssArg, '');
    execSync(fallback, { stdio: 'inherit' });
    console.log(`\nPDF generated (fallback, no custom CSS): ${outPath}`);
  } finally {
    if (!args.keepMd) {
      try { fs.unlinkSync(combinedPath); } catch (_) {}
    }
  }
}

main();
