# Session PDF (Kindle Scribe Export)

**Owner:** Artificer
**Confidence:** high

## When to use

Use this skill when the user asks to:

- Convert a session's prep notes (the `hotd_sessions.markdown` DB row) to a PDF for offline reading
- Generate a DM reference PDF for the Kindle Scribe (or any e-reader)
- Bundle a session's prep notes with selected stat blocks into one document
- Produce a printable session guide

## Quick invocation

> Session markdown now lives in the `hotd_sessions.markdown` DB column, not in files. The easiest path is the **Sessions Workspace "Create PDF" button** (`/dm-admin#sessions`), which exports the row's markdown and runs this script for you. To run the CLI directly, export the markdown to a tmpfile and pass `--input-file` (the old positional `sessionNN` form read the now-removed `src/hotd-campaign/sessions/sessionNN.md` files).

```bash
# Export the session markdown from the DB, then build the PDF
psql -h localhost -p 30432 -U cortana -d dnd_website -t -A \
  -c "SELECT markdown FROM hotd_sessions WHERE session_number = 29" > /tmp/session29.md
node scripts/build-session-pdf.js --input-file /tmp/session29.md --out reports/session29-dm-guide.pdf

# Bundle specific stat blocks (file stems from src/hotd-campaign/data/statBlocks/)
node scripts/build-session-pdf.js --input-file /tmp/session29.md --statblocks vasilka,stitches,ally-emil-toranescu

# Auto-include every ally and/or monster stat block in the data directory
node scripts/build-session-pdf.js 29 --include-allies --include-monsters

# Override page size (only takes effect with --engine wkhtmltopdf;
# for weasyprint, edit the @page rule in scripts/session-pdf.css)
node scripts/build-session-pdf.js 29 --engine wkhtmltopdf --size letter

# Force the fallback engine
node scripts/build-session-pdf.js 29 --engine wkhtmltopdf

# Notes pages at the end (for Kindle Scribe handwriting). Default 4.
node scripts/build-session-pdf.js 29 --notes 6
node scripts/build-session-pdf.js 29 --no-notes

# Custom output path
node scripts/build-session-pdf.js 29 --out /tmp/session29.pdf
```

Output defaults to `reports/sessionNN-dm-guide.pdf`.

> **Note (stat blocks):** Stat blocks now live in the Campaign Notebook `Monster Stats/` folder (`hotd_notebook_pages`), not `src/hotd-campaign/data/statBlocks/` (removed). `build-session-pdf.js --statblocks` still reads files and has **not** yet been updated to pull from the notebook — export the relevant `Monster Stats/` pages to files first, or treat statblock bundling as a pending follow-up.

## What the script does

[scripts/build-session-pdf.js](../../../scripts/build-session-pdf.js) does the following:

1. Reads the session markdown — from `--input-file` (e.g. a tmpfile exported from `hotd_sessions.markdown`). The legacy positional form (`build-session-pdf.js 29`) read `src/hotd-campaign/sessions/sessionNN.md`, which no longer exists.
2. Optionally reads stat block markdown from `src/hotd-campaign/data/statBlocks/`.
3. Builds a combined intermediate markdown with a Table of Contents and explicit page breaks (`<div class="page">`).
4. Rewrites relative `images/...` paths to absolute paths so `wkhtmltopdf` can load them.
5. Runs `pandoc` with `--pdf-engine=wkhtmltopdf` and [scripts/session-pdf.css](../../../scripts/session-pdf.css).
6. Writes the PDF to `reports/sessionNN-dm-guide.pdf`.
7. Cleans up the intermediate markdown unless `--keep-md` is passed.

## Why these defaults

The PDF style mirrors the established session27 DM-guide formatting so every session's exported PDF looks the same in the binder and on the Kindle Scribe:

- **WeasyPrint engine** (default) for proper CSS3 paged-media. No bullet ever splits across a page boundary, headings stay with their first paragraph, tables never break mid-row.
- **A4 portrait** with **15mm margins** declared via the `@page` rule in [scripts/session-pdf.css](../../../scripts/session-pdf.css).
- **Sans-serif body** (`DejaVu Sans` -> `Segoe UI` -> `Arial`), **10pt** with 1.3 line height.
- **Headings:** h1 20pt with double underline, h2 16pt with single underline, h3 13pt.
- **Stat-block tables:** 1px borders, light-gray header row, centered cells, never split across pages.
- **Blockquote** with dark-red left rule (`#8b0000`) for read-aloud / boxed text, also never split.
- **Page breaks** on every `<div class="page">` boundary so the session, monsters, and allies each start on a fresh page.

Kindle Scribe (10.2" e-ink) renders this layout cleanly without any e-ink-specific tweaks. If you want a bigger-print or smaller-print variant, pass `--size letter` (more white space) or `--size a5` (denser). `--size` currently applies only to the wkhtmltopdf fallback engine; for weasyprint, edit the `@page` rule in the CSS if you need a different page size.

## Prerequisites

```bash
sudo apt install -y pandoc weasyprint wkhtmltopdf
```

- **`weasyprint`** is the default engine. It has proper CSS3 paged-media support and reliably honors `page-break-inside: avoid` on list items, blockquotes, and tables. This is the engine that prevents bullets from being cut mid-line at page boundaries.
- **`wkhtmltopdf`** is kept as a fallback for hosts where weasyprint isn't installed. The Ubuntu build uses unpatched Qt, which silently ignores most page-break rules. Use `--engine wkhtmltopdf` only if weasyprint is unavailable; expect occasional mid-list cuts.
- **`pandoc`** does the markdown -> HTML conversion in both engines.

All three are present in the devcontainer.

## File locations

- Script: [scripts/build-session-pdf.js](../../../scripts/build-session-pdf.js)
- CSS: [scripts/session-pdf.css](../../../scripts/session-pdf.css)
- Session source: the `hotd_sessions.markdown` DB column (export to a tmpfile and pass `--input-file`; the Sessions Workspace "Create PDF" button does this automatically)
- Stat block sources: `src/hotd-campaign/data/statBlocks/*.md`
- Output: `reports/sessionNN-dm-guide.pdf`

## Transferring to the Kindle Scribe

Three reliable paths:

1. **Send to Kindle** (easiest): email the PDF to your `@kindle.com` address. Amazon converts and pushes it natively. Limit: 200MB per file.
2. **USB-C**: plug the Scribe into the host, mount as a drive, drop the PDF into the `documents/` folder.
3. **Cloud sync**: drop into the synced Kindle/Dropbox folder if you have one configured.

The Scribe renders PDFs natively. You can pen-annotate directly on the page.

## MCP exposure

The custom MCP server ([src/mcp/server.mjs](../../../src/mcp/server.mjs)) is **read-only by design**. PDF generation is a write operation, so it is **not** exposed as an MCP tool. Always invoke the script directly via the shell.

If a future need arises to expose a "generate session PDF" tool that writes to `reports/`, that decision goes through the user explicitly; do not add it unilaterally.

## Style note

The PDF is for the DM, not the players. It can contain `dm_notes` and secret content. Do not generate a "player-facing PDF" from this skill unless the user explicitly asks; player recaps go through the [session-summary](../session-summary/SKILL.md) skill and write to `hotd_sessions.summary`.

## Rules

- Always confirm the session file exists before running. The script errors out cleanly if not.
- Never commit generated PDFs. `reports/*.pdf` should stay out of git unless the user requests a tagged artifact.
- If `wkhtmltopdf` rendering fails, the script retries without the custom CSS and reports the fallback. If it still fails, surface the pandoc error to the user; do not silently swap engines.
- Do not modify the session markdown to make the PDF look better. Fix the CSS instead.

## Coordination

- **Bard** owns the prep content. If the PDF reveals a missing scene or NPC, hand back to Bard.
- **Ranger** owns stat block markdown. If a referenced stat block is missing, hand to Ranger.
- **Cleric** logs the artifact (optional) if the user wants the PDF tracked as a deliverable.

## Learned from

- [scripts/build-session27-pdf.js](../../../scripts/build-session27-pdf.js) (the hardcoded Session 27 predecessor)
- [scripts/session27-pdf.css](../../../scripts/session27-pdf.css) (CSS baseline)
- Kindle Scribe device spec (10.2" e-ink, B5-ish aspect)
