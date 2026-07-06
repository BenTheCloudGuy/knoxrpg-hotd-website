# Session Summary & Chronicling

**Owner:** Bard
**Confidence:** high

## When to use

Use this skill when the user asks to:

- Create or update a session's prep + recap (a notebook page under the root `Sessions/` folder, edited in the Campaign Notebook at `/dm-admin#notes`)
- Write or revise the player-facing recap (the `# Session Summary` section of the session page)
- Generate a player-safe recap to share with the table
- Backfill an older session that's missing a summary
- Publish a session so players see it and it enters RAG

## Reference order (read before writing)

1. **The previous session** — the notebook page for session `N-1` under `Sessions/`. Continuity starts here. Example (filenames are zero-padded to 3 digits): `psql -h localhost -p 30432 -U cortana -d dnd_website -c "SELECT content FROM hotd_notebook_pages WHERE path LIKE 'Sessions/Session 028 %'"` (PG password in `/memories/repo/cortana-db.md`), or just open it in the notebook tree.
2. **The current session (if it exists)** — the `Sessions/` page for session `N`, for prep already captured under its `# Session Notes`.
3. **List sessions** — `SELECT path, status FROM hotd_notebook_pages WHERE path LIKE 'Sessions/%' AND type='file' ORDER BY path;` to confirm numbers, titles, and publish status. Metadata (`Session #`, `Title`, `In-Game Date`, `Play Date`) lives in the page header. The `hotd_sessions` table is a dormant synced shadow (published sessions + canon provenance); the notebook is the source of truth.
4. **`hotd_npcs`** (via `lookup_npc` / `search_npcs` or the DMCC NPCs panel `/dm-admin#npcs`) — confirm every NPC mentioned by name. `npcid` (the `hotd_npcs.npcid` column) is the canon identifier used in DM notes and cross-references; the **website URL uses `hotd_npcs.id`** (DB primary key), which is different. See the linking rule below.
5. **Campaign Notebook `Campaign Data/campaign_notes.md`** (`hotd_notebook_pages`) — chapter/arc context.
6. **`tmp/halls-of-the-damned/01-dm-guide/writing-style-and-ai-config.md`** — voice rules.
7. **`tmp/halls-of-the-damned/01-dm-guide/narration-notes.md`** — PC background hooks (worth pulling into recaps when a character moment fires).

## Voice (non-negotiable)

Same rules as the rest of the campaign:

- **The test:** Would a real person actually say this out loud at the table? If not, rewrite.
- No em-dashes. Use commas, periods, or semicolons.
- No flowery, "AI fantasy prose." Direct, grounded, plainspoken.
- No "not X, but Y" constructions, no poetic abstractions, no trailer-voice.
- Concrete nouns and concrete verbs. Real human emphasis.
- Past tense for recaps. Present or future tense for prep notes.

## Content format: the session notebook page

Each session is a notebook page under the root `Sessions/` folder (`hotd_notebook_pages`, one row per session), edited in the Campaign Notebook (`/dm-admin#notes` → `Sessions/`). The page starts with a metadata header, then two load-bearing H1 headings: `# Session Notes` holds DM prep (private), `# Session Summary` holds the player-facing recap (public when published). Put the rich prep layout under `# Session Notes`:

```markdown
Session #: 29
Title: Descisions need to be made!
In-Game Date: 25th of Mirtul
Play Date: 2025-11-15T18:00

# Session Notes

## To-Do
[DM prep checklist: maps, tokens, music, props]

### Notes
[Free-form DM prep, mechanics to test, pacing notes]

## NPCS
- [NPC Name](https://hotd.knoxrpg.com/npcs/{id})
- [NPC Name](https://hotd.knoxrpg.com/npcs/{id})

### [PHASE NAME]
[Encounter prep, beats to hit, read-aloud cues]

### [PHASE NAME]
[Next beat]

## WRAP UP
[Post-session hooks, what carries into next session, message-from-NPC setups]

# Session Summary
[Player-facing recap. Written by hand or drafted with Generate Summary, then reviewed before publishing.]
```

Rules:

- The metadata header (`Session #`, `Title`, `In-Game Date`, `Play Date`) drives ordering and the public listing. The `# Session Notes` and `# Session Summary` H1 headings are required and load-bearing (publish, RAG, and PDF all key off them). Other H1s are allowed but treated as DM-only prep.
- NPC links use the public website pattern `https://hotd.knoxrpg.com/npcs/{id}` where `{id}` is the **`hotd_npcs.id` column** (DB primary key), **not** the `npcid` field (the `hotd_npcs.npcid` column). The two differ: e.g. Mordenkainen is `npcid=93` but `id=669`. The website route resolves `/npcs/:id` against `hotd_npcs.id` only.
  - **Lookup query** (preferred): `SELECT id, name FROM hotd_npcs WHERE name ILIKE ANY(ARRAY['%Name1%','%Name2%']);` (PG env: `PGHOST=localhost PGPORT=30432 PGUSER=cortana PGDATABASE=dnd_website`, password in `/memories/repo/cortana-db.md`).
  - **Via MCP:** `search_campaign_lore` with `source_type="npc"` returns `source_id` which equals `hotd_npcs.id`.
  - In DM-internal notes (e.g. `(npcid 24)` citations), continue to use `npcid` — that is the canon identifier. URLs are the only place that needs the DB `id`.
- Phase labels in `### [BRACKETS]` keep prep blocks scannable at the table.

## Player recap format: the `# Session Summary` section

This is the `# Session Summary` section of the session notebook page. It is what shows on the public website (`/sessions` + the Home "Last Session" block) and what gets embedded for RAG as **player-visible** when the page is published. Treat it as the player-facing recap.

- **Length:** 4 to 5 dense paragraphs, roughly 300 to 550 words.
- **Audience:** the players at the table. No DM secrets. No spoilers for upcoming plot.
- **Content:** what the party did, who they met, what changed in the world, where they ended.
- **Voice:** 3rd person, past tense, reporter-style. Who did what to whom.
- **Banned:** internal DM mechanics, hidden NPC motivations, future plot beats, anything tagged `dm_notes` in `hotd_npcs`.

### Locked voice rules (sessions 25 to 28 set the bar; do not violate)

1. **3rd person, past tense.** Reporter-style. Never "you" or "the party will." Never present tense.
2. **4 to 5 dense paragraphs.** Roughly 300 to 550 words. Open mid-action, not with scene-setting.
3. **Open with a concrete beat.** A PC name and a specific action in the first sentence. No weather, no mood-setting preamble.
4. **One paragraph per major beat,** in chronological order.
5. **Name every PC and NPC by full canonical name.** Never "the rogue" or "the cleric." Pull names from `hotd_npcs` and the PC roster.
6. **DM shorthand stays out.** Replace nicknames like "Moddy" or "Ezzie" with full names ("Mordenkainen", "Ezmerelda"). Family/group labels like "the Skanders" are fine because they describe a group, not a single person.
7. **Preserve the DM's asides and humor verbatim.** ("Krutha still very much naked", "with a mischievous grin", a linebacker metaphor, "Krutha rolled a natural 1. Twice.") These are the table's voice and are non-negotiable. Do not sanitize them.
8. **Preserve thematic spell descriptions alongside mechanical names.** If the DM describes Vasilka's Flaming Sphere as "a whirlwind spun out of the burning hut below Thorian", keep both the spell name ("Flaming Sphere") and the thematic description. Don't pick one and drop the other.
9. **Mirror the DM's outcome words exactly.** "Damaged" means damaged, not destroyed. "Crippled" means crippled, not wrecked. "Nearly dropped" means he was still standing. Never escalate or de-escalate what the DM said happened.
10. **Quote NPC dialogue inline** with regular double quotes. No italics, no em-dashes inside quotes.
11. **No em-dashes anywhere** (`—`). Use commas, periods, semicolons, or colons. Hyphens in compound modifiers ("foul-mouthed") are fine.
12. **No flowery prose.** No "they steeled themselves," no "the air grew heavy," no trailer-voice, no "not X, but Y" constructions. If a real person would not say it out loud at the table, cut it.
13. **No "the players felt..." or "this should feel..."** That is DM prep language, not a recap. The recap reports actions and outcomes, not intended emotional impact.
14. **Closing paragraph ends with a snapshot of where everyone left off.** Use the pattern "That is where the session ended, with..." or "That's where we left off, with..." Setting up the next session is the closing move every time.

### Summary template (mental model, not literal)

1. **Opening paragraph.** PC name + concrete action in sentence one. Resolve one immediate beat.
2. **The main beats.** One paragraph per major scene or encounter. Name NPCs. Name the choices the party made.
3. **The turn.** The moment the situation changed (a reveal, a loss, a new arrival).
4. **Where they ended.** Last location, last action, last decision. Sets up the next session.

## Step-by-step workflow

### Pre-session prep (the `# Session Notes` section)

1. Confirm the next session number from the `Sessions/` folder (highest `Session #` + 1).
2. Copy the section structure from the most recent session page's `# Session Notes` body.
3. Pull the active NPCs from `hotd_npcs` (look up by current location, status, or arc via `lookup_npc` / `search_npcs`).
4. Block out phases the DM has called out (`[REINFORCEMENTS]`, `[END PHASE]`, etc.).
5. Add `## To-Do` items for any prep that needs to happen before the session (maps, tokens, art).
6. Save the page (create it in the `Sessions/` folder if needed — new files there are seeded with the session template). Do NOT invent encounter beats the user didn't ask for.

### Post-session summary

1. Read the session page's `# Session Notes` body and any DM notes the user gives you.
2. Read the previous session's `# Session Summary` for continuity (where the party was, who was wounded, what was pending).
3. Look up every NPC name in `hotd_npcs`. Confirm IDs, status, location.
4. Draft a 2–5 paragraph player-safe recap using the format above.
5. Apply the voice test. Strip anything that sounds like trailer prose.
6. Show the draft to the user for approval before writing to the DB.
7. On approval, write the recap into the page's `# Session Summary` section (Generate Summary does this for you, or edit by hand). Set `Play Date` in the header if not already set.
8. **Publish** the session page (the notebook Publish button, or `POST /api/dm-admin/notebook/publish`). Publishing embeds it into RAG (summary player-visible, prep DM-only) and runs the canon pipeline automatically. No manual `embed-pipeline` reindex is needed.
9. Verify in the website that the new summary appears on `/sessions` and Home, and that RAG/chat returns it for relevant queries.

### Backfilling an older session

Same as post-session summary, except confirm the header `In-Game Date` and `Title` match what was actually played. If `Play Date` is unknown, leave it blank.

## The session editor (Campaign Notebook)

Sessions are edited in the unified Campaign Notebook editor (`/dm-admin#notes` → open a page under `Sessions/`). Opening a `Sessions/` page reveals two extra toolbar actions, **🤖 Generate Summary** and **📄 Create PDF**, alongside the usual Save / Publish / Unpublish. The page content is one markdown blob: a metadata header + `# Session Notes` + `# Session Summary`.

### Required H1 sections

Two H1 headings are load-bearing. Other H1s are allowed but treated as DM-only prep.

- `# Session Notes` — raw DM prep. Input to the AI when the DM clicks **Generate Summary**, and the body of the GM Guide PDF.
- `# Session Summary` — player-facing recap. Embedded as player-visible RAG on publish; stripped out of the GM Guide PDF.

New files created in the `Sessions/` folder are seeded with the metadata header + both H1s + placeholder text.

### Generate Summary contract

`POST /api/dm-admin/notebook/session-summary` (body `{ path }`) does the following:

1. Reads the page's `# Session Notes` body. Returns 400 if empty.
2. Pulls RAG context with `buildEmbeddingContext(openai, query, { includeDmOnly: false, limit: 10 })` (query = session number + title + first ~1500 chars of notes) plus the last 3 prior published session summaries.
3. Calls the configured AI model (`hotd_config.ai_model`, default `gpt-5.4-mini`) with `temperature: 0.6, max_completion_tokens: 2048`.
4. The system prompt enforces the voice rules (no em-dashes, no flowery prose, 3rd person past tense, do not invent events, 4 to 8 short paragraphs, no heading).
5. Writes the result into the page's `# Session Summary` section, re-embeds if the page is already published, and returns the updated content.

The DM reviews and edits before Publishing. Generate Summary is a draft helper, not a publish step.

### Publish / Unpublish contract

`POST /api/dm-admin/notebook/publish` (body `{ path }`) on a `Sessions/` page: sets the page published, embeds it into RAG (summary player-visible `is_dm_only=false`, metadata + prep DM-only), and runs the canon pipeline (extract → apply → reindex touched sources). A `hotd_sessions` shadow row is synced for canon provenance + `pdf_path`. `POST /api/dm-admin/notebook/unpublish` reverts to draft and removes the page from RAG. Until published, `/sessions` hides the session from non-admins. The Bard never publishes silently — only on explicit DM request.

### GM Guide PDF contract

`POST /api/dm-admin/notebook/session-pdf` (body `{ path }`) renders the page **with `# Session Summary` stripped out** to `reports/sessionNN-gm-guide.pdf` via `scripts/build-session-pdf.js`, and records `pdf_path` on the shadow row. `GET /api/dm-admin/notebook/session-pdf?path=...` streams the file. The summary is excluded because the GM Guide is for the DM at the table, not for players.

### How the Bard persists session content

- **The notebook `Sessions/` pages are the single source of truth** for session prep, notes, and summaries. The old `src/hotd-campaign/sessions/sessionNN.md` prep files and the `hotd_sessions` Sessions Workspace were removed; do not recreate them. Persist session content through the notebook (the editor UI or `/api/dm-admin/notebook/*`) so the website owns storage and RAG re-indexing. The `hotd_sessions` table is a dormant synced shadow (canon provenance + `pdf_path`), not the editing surface.
- If the user says "write the summary in the Sessions Workspace" or "use the admin portal", open the session page in the Campaign Notebook (`/dm-admin#notes` → `Sessions/`) and use its Generate Summary / Publish actions.
- The voice rules and reference order above still apply. The AI system prompt baked into the `/notebook/session-summary` endpoint is a guard rail, not a substitute for hand-checking against `hotd_npcs` and the prior session.

## Rules

- Never invent events. If the user's notes don't cover a beat, ask.
- Never expose DM secrets in the public summary. If you're unsure whether something is a secret, ask.
- Never modify NPC records in `hotd_npcs` from this skill.
- Never change the `Title` or `Session #` of an existing session page without explicit approval — both are referenced by other systems (PDFs, RAG, public pages).
- Always link NPCs by their `hotd_npcs.id` in markdown files (not `npcid`). Names alone break when NPCs are renamed; the wrong ID column produces 404s.
- Publishing the session page re-indexes RAG automatically; unpublishing removes it. There is no manual `embed-pipeline` step for sessions anymore.

## Coordination with other agents

- **Mercer** owns in-world prose (room/trap/monster descriptions, scene framing). If a recap needs new in-world descriptive prose, ask Mercer.
- **Ranger** owns stat blocks. If a recap references a creature that needs a new stat block, ask Ranger.
- **Bard** (self) handles all art prompts for portraits or scenes referenced in the session.

## Learned from

- The session page H1 contract (`# Session Notes` / `# Session Summary`) and the notebook editor + endpoints (`src/routes/dm-admin-api.js`)
- `src/lib/sessions.js` (session page parsing + listing) and `src/lib/notebook-rag.js` (the player/DM visibility split for `Sessions/` pages)
- `hotd_notebook_pages` (the `Sessions/` folder) is the store; `hotd_sessions` is a dormant synced shadow
- `tmp/halls-of-the-damned/01-dm-guide/writing-style-and-ai-config.md` (voice)
